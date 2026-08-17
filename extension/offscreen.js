/**
 * FactLens Offscreen Document
 * 
 * 오디오 스트림을 수신하여 MediaRecorder로 녹음한 후,
 * 녹음된 데이터를 Service Worker로 전달합니다.
 */

let mediaRecorder = null;
let recordedChunks = [];
let recordingData = {};

/**
 * Service Worker에서의 메시지 수신
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return;

  if (message.action === 'startRecording') {
    startRecording(message.data);
    sendResponse({ status: 'recording_started' });
    return true;
  }

  if (message.action === 'stopRecording') {
    stopRecording();
    sendResponse({ status: 'recording_stopped' });
    return true;
  }
});

/**
 * 오디오 녹음 시작
 */
async function startRecording(data) {
  recordingData = data;
  recordedChunks = [];

  try {
    // tabCapture 스트림 ID로 MediaStream 획득
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: data.streamId
        }
      }
    });

    // 탭 오디오를 사용자에게도 재생 (캡처 시 기본적으로 음소거됨)
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(audioContext.destination);

    // MediaRecorder 설정
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      audioBitsPerSecond: 128000
    });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      console.log('[FactLens Offscreen] 녹음 종료, 데이터 전송 중...');

      const audioBlob = new Blob(recordedChunks, { type: mimeType });

      // Stream 정리
      stream.getTracks().forEach(track => track.stop());

      // Service Worker로 데이터 전달
      chrome.runtime.sendMessage({
        action: 'offscreenRecordingComplete',
        data: {
          audioBlob: audioBlob,
          screenText: data.screenText,
          sourceUrl: data.sourceUrl,
          tabId: data.tabId
        }
      });

      recordedChunks = [];
      mediaRecorder = null;
    };

    // 녹음 시작 (500ms 간격으로 데이터 수집)
    mediaRecorder.start(500);

    console.log(`[FactLens Offscreen] 🎙️ 녹음 시작 (최대 ${data.duration / 1000}초)`);

    // 지정된 시간 후 자동 종료
    setTimeout(() => {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        console.log('[FactLens Offscreen] ⏱️ 녹음 시간 초과, 자동 종료');
        mediaRecorder.stop();
      }
    }, data.duration || 60000);

  } catch (error) {
    console.error('[FactLens Offscreen] 녹음 실패:', error);

    // 오디오 캡처 실패 시 텍스트만으로 분석
    chrome.runtime.sendMessage({
      action: 'offscreenRecordingComplete',
      data: {
        audioBlob: null,
        screenText: data.screenText,
        sourceUrl: data.sourceUrl,
        tabId: data.tabId
      }
    });
  }
}

/**
 * 녹음 중지
 */
function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
}

console.log('[FactLens Offscreen] 📼 Offscreen Document 로드됨');
