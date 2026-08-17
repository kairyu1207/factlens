const fs = require('fs');

const path = 'C:\\Users\\seong\\.gemini\\antigravity-ide\\scratch\\factlens\\web\\index.html';
let html = fs.readFileSync(path, 'utf8');

// 1. Remove the floating circles UI block (lines 262-294 approximately)
html = html.replace(
  /<!-- Free-Floating Source Verification \(Three Circles UI\) -->[\s\S]*?<\/div>\s*<\/div>\s*<!-- Preprocessing Logs \(Integrated\) -->/,
  `<!-- Floating Widget Button -->
      <button onclick="openWidget()" style="position: absolute; top: 15px; right: 15px; background: rgba(59,130,246,0.2); border: 1px solid var(--accent); color: #fff; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-family: var(--mono); font-size: 12px; transition: all 0.2s; z-index: 99999;">
        Open FactLens Widget ↗
      </button>
  
        <!-- Preprocessing Logs (Integrated) -->`
);

// 2. Change [STEP 3] text
html = html.replace(
  /\[STEP 3\] 맥락 통합 및 정제 \(Context Alignment\)/,
  '[STEP 3] 대본 복원 (Script Reconstruction)'
);

html = html.replace(
  /<h4.*?통합된 맥락 \(Aligned Context\)<\/h4>/,
  '<h4 style="margin:0 0 4px 0; font-size:10px; color: #a78bfa;">복원된 대본 (Reconstructed Scripts)</h4>'
);

// 3. Update resetUI logic
html = html.replace(
  /function resetUI\(\) \{[\s\S]*?\$\('ocrCharCount'\)\.textContent = '0 chars';\s*\$\('audioCharCount'\)\.textContent = '0 chars';\s*\}/,
  `
    // 초기화 함수
    function resetUI() {
      // clear logs
      $('audioFeedBody').innerHTML = '';
      $('ocrTopLog').textContent = '대기 중...';
      $('ocrMiddleLog').textContent = '대기 중...';
      $('ocrBottomLog').textContent = '대기 중...';
      $('audioCorrectionLog').textContent = '대기 중...';
      
      $('formTopLog').textContent = '대기 중...';
      $('formMiddleLog').textContent = '대기 중...';
      $('formBottomLog').textContent = '대기 중...';
      $('formAudioLog').textContent = '대기 중...';
      
      $('contextAlignmentLog').textContent = '대기 중...';
      $('entityResolutionLog').textContent = '대기 중...';
      $('infoExtractionLog').textContent = '대기 중...';

      globalFacts = [];
      if (widgetWindow && !widgetWindow.closed) {
        widgetWindow.postMessage({ type: 'RESET' }, '*');
      }

      setStep('audio', 'pending');
      setStep('preprocess', 'pending');
      setStep('extract', 'pending');
      setStatus('off', 'Standby');
      allText = '';
      audioAllText = '';
      pendingOCR = '';
      pendingAudio = '';
      spatialMemory = [];
      lastFinalContexts = [];
      $('ocrCharCount').textContent = '0 chars';
      $('audioCharCount').textContent = '0 chars';
    }
  `
);

// 4. Update the analyze() JSON handling
html = html.replace(
  /if \(preData\.alignmentLogs\?\.length\) \{[\s\S]*?cLog\.scrollTop = cLog\.scrollHeight;\s*\}\s*\}/,
  `if (preData.reconstructionLogs?.length) {
        const cLog = $('contextAlignmentLog');
        if (cLog && cLog.textContent === '대기 중...') cLog.textContent = '';
        if (cLog) {
          cLog.textContent += preData.reconstructionLogs.join('\\n') + '\\n\\n복원결과: ' + JSON.stringify(preData.reconstructedScripts, null, 2) + '\\n';
          cLog.scrollTop = cLog.scrollHeight;
        }
      }`
);

// 5. Update verifyReport logic
html = html.replace(
  /if \(verifyReport\.success\) \{\s*setStep\('extract', 'done', `\$\{verifyReport\.verifiedCount\} verified`\);\s*renderThreeCircles\(verifyReport\);\s*\}/,
  `if (verifyReport.success) {
            setStep('extract', 'done', \`\${verifyReport.verifiedCount} verified\`);
            globalFacts = [...globalFacts, ...verifyReport.results];
            if (widgetWindow && !widgetWindow.closed) {
              widgetWindow.postMessage({ type: 'NEW_FACTS', facts: verifyReport.results }, '*');
            }
          }`
);

// 6. Replace window.toggleMemoSection and renderThreeCircles with openWidget and globals
html = html.replace(/window\.toggleMemoSection = function[\s\S]*?function setStep\(id, s, detail\) \{/, `
    let globalFacts = [];
    let widgetWindow = null;

    window.openWidget = function() {
      if (widgetWindow && !widgetWindow.closed) {
        widgetWindow.focus();
      } else {
        widgetWindow = window.open('widget.html', 'FactLensWidget', 'width=420,height=700,menubar=no,toolbar=no,location=no,status=no');
        setTimeout(() => {
          if (widgetWindow && !widgetWindow.closed && globalFacts.length > 0) {
            widgetWindow.postMessage({ type: 'NEW_FACTS', facts: globalFacts }, '*');
          }
        }, 1000);
      }
    };

    function setStep(id, s, detail) {`);

fs.writeFileSync(path, html);
console.log('Update complete.');
