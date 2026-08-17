/**
 * FactLens Content Script
 * 
 * 실시간 영상 감지 → 자동 분석 → 디버그 패널로 진행 상태 표시
 * API 크레딧 부족 시 실패 지점까지의 진행 결과를 보여줌
 */

(() => {
  'use strict';

  if (window.__FACTLENS_INJECTED__) return;
  window.__FACTLENS_INJECTED__ = true;

  const FL = 'factlens';
  const AUTO_ANALYZE_DELAY = 3000;

  const trackedVideos = new WeakSet();
  const analyzeTimers = new WeakMap();
  const analyzedUrls = new Set();
  let isAnalyzing = false;
  let currentReport = null;
  let debugPanel = null;

  // ═══════════════════════════════════════
  //  디버그 패널 (화면 오른쪽 고정)
  // ═══════════════════════════════════════

  const STEPS = [
    { id: 'detect',    label: '영상 감지' },
    { id: 'text',      label: '화면 텍스트 추출' },
    { id: 'audio',     label: '음성 추출 (Whisper)' },
    { id: 'extract',   label: '정보 추출 (GPT-4o)' },
    { id: 'verify',    label: '출처 검증' },
    { id: 'report',    label: '리포트 생성' },
  ];

  function createDebugPanel() {
    if (debugPanel) return debugPanel;

    debugPanel = document.createElement('div');
    debugPanel.className = `${FL}-debug`;
    debugPanel.innerHTML = `
      <div class="${FL}-debug-header">
        <span class="${FL}-debug-logo">FactLens</span>
        <button class="${FL}-debug-toggle" title="접기/펼치기">—</button>
      </div>
      <div class="${FL}-debug-body">
        ${STEPS.map(s => `
          <div class="${FL}-debug-step" id="${FL}-step-${s.id}" data-status="pending">
            <span class="${FL}-debug-icon">-</span>
            <span class="${FL}-debug-label">${s.label}</span>
            <span class="${FL}-debug-status"></span>
          </div>
        `).join('')}
        <div class="${FL}-debug-output" id="${FL}-debug-output"></div>
      </div>
    `;

    document.body.appendChild(debugPanel);

    // 접기/펼치기
    const toggle = debugPanel.querySelector(`.${FL}-debug-toggle`);
    const body = debugPanel.querySelector(`.${FL}-debug-body`);
    toggle.addEventListener('click', () => {
      body.classList.toggle('collapsed');
      toggle.textContent = body.classList.contains('collapsed') ? '+' : '—';
    });

    return debugPanel;
  }

  function updateStep(stepId, status, detail) {
    createDebugPanel();
    const el = document.getElementById(`${FL}-step-${stepId}`);
    if (!el) return;

    el.dataset.status = status;
    const icon = el.querySelector(`.${FL}-debug-icon`);
    const statusEl = el.querySelector(`.${FL}-debug-status`);

    switch (status) {
      case 'running':
        icon.innerHTML = `<div class="${FL}-debug-spinner"></div>`;
        statusEl.textContent = detail || '진행 중...';
        break;
      case 'done':
        icon.textContent = 'OK';
        statusEl.textContent = detail || '완료';
        break;
      case 'fail':
        icon.textContent = 'ERR';
        statusEl.textContent = detail || '실패';
        break;
      case 'skip':
        icon.textContent = 'SKIP';
        statusEl.textContent = detail || '건너뜀';
        break;
      default:
        icon.textContent = '-';
        statusEl.textContent = '';
    }
  }

  function appendOutput(html) {
    createDebugPanel();
    const out = document.getElementById(`${FL}-debug-output`);
    if (!out) return;
    out.innerHTML += html;
    out.scrollTop = out.scrollHeight;
  }

  function clearOutput() {
    const out = document.getElementById(`${FL}-debug-output`);
    if (out) out.innerHTML = '';
  }

  // ═══════════════════════════════════════
  //  비디오 감지
  // ═══════════════════════════════════════

  function attachToVideo(video) {
    if (trackedVideos.has(video)) return;
    trackedVideos.add(video);

    console.log('[FactLens] 비디오 감지:', video.src || video.currentSrc || '(embedded)');

    // 재생 → 자동 분석
    video.addEventListener('play', () => {
      if (isAnalyzing) return;
      const key = getVideoKey(video);
      if (analyzedUrls.has(key)) return;

      createDebugPanel();
      updateStep('detect', 'done', '영상 재생 감지됨');

      const timer = setTimeout(() => {
        if (!video.paused && !video.ended) {
          startAutoAnalysis(video);
        }
      }, AUTO_ANALYZE_DELAY);
      analyzeTimers.set(video, timer);
    });

    video.addEventListener('pause', () => {
      const t = analyzeTimers.get(video);
      if (t) { clearTimeout(t); analyzeTimers.delete(video); }
    });

    // 이미 재생 중
    if (!video.paused && !video.ended && video.readyState >= 2) {
      const key = getVideoKey(video);
      if (!analyzedUrls.has(key) && !isAnalyzing) {
        createDebugPanel();
        updateStep('detect', 'done', '이미 재생 중인 영상 감지');
        setTimeout(() => startAutoAnalysis(video), 1000);
      }
    }
  }

  function getVideoKey(v) {
    return `${location.href}::${v.src || v.currentSrc || v.id || 'main'}`;
  }

  // ═══════════════════════════════════════
  //  자동 분석 파이프라인
  // ═══════════════════════════════════════

  async function startAutoAnalysis(video) {
    if (isAnalyzing) return;
    isAnalyzing = true;
    clearOutput();

    const videoKey = getVideoKey(video);

    // Step 1: 화면 텍스트 추출
    updateStep('text', 'running');
    const screenText = extractAllText(video);
    const textLen = screenText.length;
    updateStep('text', 'done', `${textLen}자 추출됨`);

    if (textLen > 0) {
      appendOutput(`<div class="${FL}-debug-data"><strong>추출된 텍스트 (${textLen}자):</strong><pre>${esc(screenText.slice(0, 500))}${textLen > 500 ? '\n...(생략)' : ''}</pre></div>`);
    }

    // Step 2: 음성 + 정보 추출 + 검증은 서버에 위임
    updateStep('audio', 'running', '서버에 전송 중...');

    try {
      chrome.runtime.sendMessage({
        action: 'startAnalysis',
        data: {
          url: location.href,
          screenText,
          videoInfo: {
            duration: video.duration,
            currentTime: video.currentTime,
            src: video.src || video.currentSrc
          }
        }
      });
      analyzedUrls.add(videoKey);
      appendOutput(`<div class="${FL}-debug-info">서버에 분석 요청 전송됨</div>`);
    } catch (e) {
      updateStep('audio', 'fail', e.message);
      isAnalyzing = false;
    }
  }

  // ═══════════════════════════════════════
  //  텍스트 추출
  // ═══════════════════════════════════════

  function extractAllText(video) {
    const texts = [];

    if (video.textTracks) {
      for (const track of video.textTracks) {
        if (track.mode !== 'disabled' && track.cues) {
          for (const cue of track.cues) { if (cue.text) texts.push(cue.text); }
        }
      }
    }

    if (location.hostname.includes('youtube.com')) {
      const title = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, #title h1');
      if (title) texts.push(`[제목] ${title.textContent.trim()}`);
      const desc = document.querySelector('#description-text, #description ytd-text-inline-expander');
      if (desc) texts.push(`[설명] ${desc.textContent.trim().slice(0, 1000)}`);
      document.querySelectorAll('.ytp-caption-segment').forEach(el => {
        if (el.textContent.trim()) texts.push(el.textContent.trim());
      });
    }

    if (location.hostname.includes('tiktok.com')) {
      const d = document.querySelector('[data-e2e="browse-video-desc"]');
      if (d) texts.push(`[설명] ${d.textContent.trim()}`);
    }

    if (location.hostname.includes('instagram.com')) {
      const c = document.querySelector('h1[dir="auto"], span[dir="auto"]');
      if (c) texts.push(`[설명] ${c.textContent.trim().slice(0, 1000)}`);
    }

    const container = video.closest('[class]') || video.parentElement;
    if (container) {
      ['.captions', '.subtitle', '[class*="caption"]', '[class*="subtitle"]',
       '.video-title', '.title', 'h1', 'h2', '.description', '[class*="title"]', '[class*="description"]'
      ].forEach(sel => {
        container.querySelectorAll(sel).forEach(el => {
          const t = el.textContent?.trim();
          if (t && t.length > 3 && t.length < 2000) texts.push(t);
        });
      });
    }

    if (document.title) texts.push(`[페이지 제목] ${document.title}`);
    return [...new Set(texts)].join('\n');
  }

  // ═══════════════════════════════════════
  //  결과 표시 — 플로팅 버블 + 메모장
  // ═══════════════════════════════════════

  function showFloatingBubble(report) {
    currentReport = report;
    document.querySelectorAll(`.${FL}-bubble-wrap, .${FL}-notepad`).forEach(el => el.remove());

    const { facts } = report;
    // 출처가 1개라도 있는 정보 vs 출처가 아예 없는 정보
    const withSource = facts.filter(f => f.verification?.sources?.length > 0);
    const noSource = facts.filter(f => !(f.verification?.sources?.length > 0));

    // 배터리 색상: 출처 확인 비율에 따라 초록(142) ↔ 주황(30) 보간
    const ratio = facts.length > 0 ? withSource.length / facts.length : 0;
    const hue = Math.round(30 + (142 - 30) * ratio); // 30=주황, 142=초록
    const sat = Math.round(60 + 11 * ratio);          // 채도
    const bgDark = `hsl(${hue}, ${sat}%, 30%)`;
    const bgLight = `hsl(${hue}, ${sat}%, 50%)`;
    const shadowColor = `hsla(${hue}, ${sat}%, 50%, 0.4)`;
    const textColor = `hsl(${hue}, ${sat}%, 10%)`;

    const wrap = document.createElement('div');
    wrap.className = `${FL}-bubble-wrap`;
    wrap.innerHTML = `
      <div class="${FL}-bubble-group">
        <div class="${FL}-bubble-main" title="총 추출된 정보 수" style="background:linear-gradient(135deg,${bgDark},${bgLight}); box-shadow:0 4px 20px ${shadowColor},0 0 0 3px hsla(${hue},${sat}%,50%,0.15);">
          <span class="${FL}-bubble-main-num" style="color:${textColor};">${facts.length}</span>
        </div>
        <div class="${FL}-bubble-blue" title="출처 확인된 정보 (클릭)"><span>${withSource.length}</span></div>
        <div class="${FL}-bubble-red" title="출처 미확인 정보 (클릭)"><span>${noSource.length}</span></div>
      </div>
    `;
    document.body.appendChild(wrap);

    wrap.querySelector(`.${FL}-bubble-blue`).addEventListener('click', e => { e.stopPropagation(); openNotepad('source', withSource); });
    wrap.querySelector(`.${FL}-bubble-red`).addEventListener('click', e => { e.stopPropagation(); openNotepad('nosource', noSource); });
    // 초록 원은 클릭 이벤트 없음 (총 정보 수만 표시)

    requestAnimationFrame(() => wrap.classList.add('visible'));
  }

  function openNotepad(mode, facts) {
    document.querySelectorAll(`.${FL}-notepad`).forEach(el => el.remove());

    const notepad = document.createElement('div');
    notepad.className = `${FL}-notepad`;
    const title = mode === 'nosource' ? '출처 미확인 정보' : '출처 확인된 정보';
    const subtitle = mode === 'nosource' ? '검색 결과 출처를 찾을 수 없는 정보들' : '출처가 확인된 정보와 해당 출처';

    notepad.innerHTML = `
      <div class="${FL}-notepad-header">
        <div class="${FL}-notepad-title-row">
          <span class="${FL}-notepad-title">${title}</span>
          <button class="${FL}-notepad-close">✕</button>
        </div>
        <span class="${FL}-notepad-subtitle">${subtitle}</span>
        <span class="${FL}-notepad-count">${facts.length}개 항목</span>
      </div>
      <div class="${FL}-notepad-body">
        ${facts.length === 0 ? `<div class="${FL}-notepad-empty">해당하는 정보가 없습니다</div>`
          : facts.map((f, i) => renderNoteItem(f, i)).join('')}
      </div>
    `;
    document.body.appendChild(notepad);
    notepad.querySelector(`.${FL}-notepad-close`).addEventListener('click', () => {
      notepad.classList.add('closing'); setTimeout(() => notepad.remove(), 250);
    });
    notepad.querySelectorAll(`.${FL}-note-item`).forEach(item => {
      item.addEventListener('click', () => item.classList.toggle('expanded'));
    });
    requestAnimationFrame(() => notepad.classList.add('visible'));
  }

  function renderNoteItem(fact, i) {
    const v = fact.verification || {};
    const sources = v.sources || [];
    const icon = '';

    return `
      <div class="${FL}-note-item ${FL}-note-${(v.status || 'unknown').toLowerCase()}">
        <div class="${FL}-note-header">
          <span class="${FL}-note-num">${i + 1}</span>
          <span class="${FL}-note-icon">${icon}</span>
          <span class="${FL}-note-claim">${esc(fact.claim)}</span>
          <span class="${FL}-note-arrow">▼</span>
        </div>
        <div class="${FL}-note-detail">
          <div class="${FL}-note-explanation"><strong>판단:</strong> ${esc(v.explanation || '정보 없음')}</div>
          ${sources.length > 0 ? `
            <div class="${FL}-note-sources">
              <div class="${FL}-note-sources-title">출처 정보</div>
              ${sources.map(s => `
                <div class="${FL}-note-source-card">
                  <a href="${esc(s.url)}" target="_blank" rel="noopener" class="${FL}-note-source-link" onclick="event.stopPropagation()">${esc(s.title || s.url)}</a>
                  ${s.credibility ? `
                    <div class="${FL}-note-cred">
                      <span class="${FL}-note-cred-badge ${FL}-cred-${s.credibility.level || 'unknown'}">${s.credibility.level === 'high' ? '높은 신뢰도' : s.credibility.level === 'medium' ? '보통' : s.credibility.level === 'low' ? '낮음' : '미확인'}</span>
                      <p class="${FL}-note-cred-desc">${esc(s.credibility.description || '')}</p>
                    </div>
                  ` : ''}
                  ${s.relevance ? `<p class="${FL}-note-relevance">${esc(s.relevance)}</p>` : ''}
                </div>
              `).join('')}
            </div>
          ` : `<div class="${FL}-note-no-source">출처를 찾을 수 없습니다</div>`}
        </div>
      </div>
    `;
  }

  function esc(t) { const d = document.createElement('div'); d.textContent = t || ''; return d.innerHTML; }

  // ═══════════════════════════════════════
  //  비디오 스캔 & MutationObserver
  // ═══════════════════════════════════════

  function scanForVideos() {
    document.querySelectorAll('video').forEach(v => {
      if (v.offsetWidth < 150 || v.offsetHeight < 80) return;
      attachToVideo(v);
    });
  }

  const obs = new MutationObserver(muts => {
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (n.tagName === 'VIDEO') attachToVideo(n);
      else if (n.querySelectorAll) n.querySelectorAll('video').forEach(v => attachToVideo(v));
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
  scanForVideos();

  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) { lastUrl = location.href; setTimeout(scanForVideos, 1500); }
  }).observe(document.body, { childList: true, subtree: true });

  // ═══════════════════════════════════════
  //  Background 메시지 수신
  // ═══════════════════════════════════════

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // 진행 상태 업데이트 (서버에서 단계별로 보내줌)
    if (msg.action === 'progressUpdate') {
      updateStep(msg.step, msg.status, msg.detail);
      if (msg.output) appendOutput(msg.output);
      sendResponse({ received: true });
    }

    // 분석 완료
    if (msg.action === 'analysisComplete') {
      isAnalyzing = false;
      updateStep('report', 'done', '완료!');

      if (msg.report) {
        showFloatingBubble(msg.report);

        // 팩트 수 디버그 출력
        const r = msg.report;
        appendOutput(`<div class="${FL}-debug-result">
          <strong>분석 결과</strong><br>
          총 정보: ${r.summary.totalFacts}개 |
          확인됨: ${r.summary.verified} |
          미확인: ${r.summary.unverified} |
          반박됨: ${r.summary.refuted}
        </div>`);
      }
      sendResponse({ received: true });
    }

    // 분석 실패 (부분 결과 포함 가능)
    if (msg.action === 'analysisError') {
      isAnalyzing = false;

      appendOutput(`<div class="${FL}-debug-error">오류: ${esc(msg.error)}</div>`);

      // 부분 결과가 있으면 표시
      if (msg.partialReport && msg.partialReport.facts?.length > 0) {
        showFloatingBubble(msg.partialReport);
        appendOutput(`<div class="${FL}-debug-info">부분 결과 (${msg.partialReport.facts.length}개 정보) 표시됨</div>`);
      }

      sendResponse({ received: true });
    }

    return true;
  });

  // 전역 접근 (디버그용)
  window.showFloatingBubble = showFloatingBubble;
  window.updateStep = updateStep;
  window.appendOutput = appendOutput;

  console.log('[FactLens] 실시간 영상 감지 + 디버그 패널 활성화');
})();
