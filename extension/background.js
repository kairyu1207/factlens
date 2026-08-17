/**
 * FactLens Background Service Worker
 * 
 * 역할:
 * 1. Content Script에서 분석 요청 수신
 * 2. tabCapture로 오디오 캡처 → Offscreen Document에서 녹음
 * 3. 녹음된 오디오를 백엔드 서버로 전송
 * 4. 진행 상태 + 결과/부분결과를 Content Script에 전달
 */

const SERVER_URL = 'http://localhost:3777';

let analysisState = {
  isAnalyzing: false,
  currentTabId: null,
  lastReport: null
};

/**
 * 메시지 핸들러
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startAnalysis') {
    handleStartAnalysis(message.data, sender.tab);
    sendResponse({ status: 'started' });
    return true;
  }

  if (message.action === 'offscreenRecordingComplete') {
    handleRecordingComplete(message.data);
    sendResponse({ status: 'received' });
    return true;
  }

  if (message.action === 'getLastReport') {
    sendResponse({ report: analysisState.lastReport });
    return true;
  }

  if (message.action === 'getAnalysisState') {
    sendResponse(analysisState);
    return true;
  }
});

/**
 * Content Script에 진행 상태 전달
 */
function sendProgress(tabId, step, status, detail, output) {
  try {
    chrome.tabs.sendMessage(tabId, {
      action: 'progressUpdate',
      step, status, detail, output
    });
  } catch (e) {
    console.warn('[FactLens BG] 진행 상태 전달 실패:', e.message);
  }
}

/**
 * 분석 시작
 */
async function handleStartAnalysis(data, tab) {
  if (analysisState.isAnalyzing) return;

  analysisState.isAnalyzing = true;
  analysisState.currentTabId = tab.id;

  console.log('[FactLens BG] 📡 분석 시작:', data.url);
  sendProgress(tab.id, 'detect', 'done', '영상 감지 완료');

  try {
    await startAudioCapture(tab, data);
  } catch (error) {
    console.error('[FactLens BG] 분석 오류:', error);
    analysisState.isAnalyzing = false;

    chrome.tabs.sendMessage(tab.id, {
      action: 'analysisError',
      error: error.message
    });
  }
}

/**
 * 오디오 캡처
 */
async function startAudioCapture(tab, data) {
  try {
    sendProgress(tab.id, 'audio', 'running', '오디오 캡처 시작...');

    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
    await ensureOffscreenDocument();

    chrome.runtime.sendMessage({
      action: 'startRecording',
      target: 'offscreen',
      data: {
        streamId,
        tabId: tab.id,
        screenText: data.screenText,
        sourceUrl: data.url,
        duration: Math.min((data.videoInfo?.duration || 60) * 1000, 120000)
      }
    });

    sendProgress(tab.id, 'audio', 'running', '녹음 중...');

  } catch (error) {
    console.warn('[FactLens BG] 오디오 캡처 실패:', error.message);
    sendProgress(tab.id, 'audio', 'fail', '캡처 실패 — 텍스트만으로 분석');

    if (data.screenText) {
      await analyzeTextOnly(data.screenText, data.url, tab.id);
    } else {
      throw new Error('오디오 캡처와 텍스트 추출 모두 실패');
    }
  }
}

async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (existingContexts.length > 0) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Recording tab audio for fact-checking analysis'
  });
}

/**
 * 녹음 완료 → 서버 전송
 */
async function handleRecordingComplete(data) {
  const tabId = data.tabId || analysisState.currentTabId;

  sendProgress(tabId, 'audio', 'done', '녹음 완료');
  sendProgress(tabId, 'extract', 'running', '서버로 전송 중...');

  try {
    const formData = new FormData();
    if (data.audioBlob) {
      formData.append('audio', new File([data.audioBlob], 'recording.webm', { type: 'audio/webm' }));
    }
    if (data.screenText) formData.append('screenText', data.screenText);
    if (data.sourceUrl) formData.append('sourceUrl', data.sourceUrl);

    const response = await fetch(`${SERVER_URL}/api/analyze`, { method: 'POST', body: formData });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || `서버 오류: ${response.status}`);
    }

    const report = await response.json();
    handleServerResponse(report, tabId);

  } catch (error) {
    console.error('[FactLens BG] ❌ 서버 통신 실패:', error);
    analysisState.isAnalyzing = false;
    sendProgress(tabId, 'extract', 'fail', error.message);

    chrome.tabs.sendMessage(tabId, { action: 'analysisError', error: error.message });
  }
}

/**
 * 텍스트만으로 분석
 */
async function analyzeTextOnly(text, sourceUrl, tabId) {
  sendProgress(tabId, 'extract', 'running', 'GPT-4o 분석 중...');

  try {
    const response = await fetch(`${SERVER_URL}/api/analyze/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, sourceUrl })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || `서버 오류: ${response.status}`);
    }

    const report = await response.json();
    handleServerResponse(report, tabId);

  } catch (error) {
    analysisState.isAnalyzing = false;
    sendProgress(tabId, 'extract', 'fail', error.message);
    chrome.tabs.sendMessage(tabId, { action: 'analysisError', error: error.message });
  }
}

/**
 * 서버 응답 처리 — 완전 결과 또는 부분 결과
 */
function handleServerResponse(report, tabId) {
  analysisState.isAnalyzing = false;

  // 서버가 보내준 progress 정보를 content script에 전달
  if (report.progress?.steps) {
    const steps = report.progress.steps;
    for (const [key, val] of Object.entries(steps)) {
      sendProgress(tabId, key, val.status, val.detail || '');
    }
  }

  // 부분 결과인 경우
  if (report.partial) {
    sendProgress(tabId, report.failedAt, 'fail', report.error);

    // 부분 결과라도 facts가 있으면 보여줌
    if (report.facts?.length > 0) {
      analysisState.lastReport = report;
      chrome.storage.local.set({ lastReport: report, lastAnalyzedAt: new Date().toISOString() });
      chrome.tabs.sendMessage(tabId, { action: 'analysisComplete', report });
    } else {
      chrome.tabs.sendMessage(tabId, {
        action: 'analysisError',
        error: `${report.failedAt} 단계에서 실패: ${report.error}`,
        partialReport: report
      });
    }
    return;
  }

  // 완전한 결과
  sendProgress(tabId, 'report', 'done', '완료!');
  analysisState.lastReport = report;
  chrome.storage.local.set({ lastReport: report, lastAnalyzedAt: new Date().toISOString() });
  chrome.tabs.sendMessage(tabId, { action: 'analysisComplete', report });

  console.log('[FactLens BG] ✅ 분석 완료!');
}

console.log('[FactLens BG] 🛡️ Service Worker 시작됨');
