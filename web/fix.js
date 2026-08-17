const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

const replacement1 = `    function stopCapture() {
      if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
      if (ocrTimer) { clearInterval(ocrTimer); ocrTimer = null; }
      if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }

      const content = $('activeContent') || (pipWindow && pipWindow.document.getElementById('activeContent'));
      if (pipWindow) {
        try {
          if (content) document.body.insertBefore(content, $('vidWrap'));
          pipWindow.close();
        } catch(e) {}
        pipWindow = null;
      }

      $('vid').srcObject = null;
      $('startScreen').style.display = '';
      if ($('activeContent')) $('activeContent').style.display = 'none';
      $('floatStop').classList.remove('show');
      setStatus('', 'Stopped');
      lastImageData = null;
      lastBbox = null;
    }

    function updateClock() {
      const d = Math.floor((Date.now() - startT)/1000);
      const m = String(Math.floor(d/60)).padStart(2,'0');
      const s = String(d%60).padStart(2,'0');
      const t = \`\${m}:\${s}\`;
      const c = $('timer');
      if (c) c.textContent = t;
    }`;

let startIndex = content.indexOf('    function stopCapture() {');
let endIndex = content.indexOf('async function initOCR() {');
if (startIndex !== -1 && endIndex !== -1) { 
    content = content.substring(0, startIndex) + replacement1 + '\n\n    ' + content.substring(endIndex); 
}

content = content.replace('// Smart Cropping (Pixel Diff)\n      const imageData = ctx.getImageData', '// Smart Cropping (Pixel Diff)\n      let currentCropX = 0;\n      let currentCropY = 0;\n      const imageData = ctx.getImageData');

const loopStart = 'const now = Date.now();\n          frameHistory = frameHistory.filter(h => now - h.time < 60000);\n          \n          // Check for loop (Hamming distance < 10 for strict match)\n          let isLoop = false;\n          for (const h of frameHistory) {\n            let diff = 0;\n            for(let i=0; i<256; i++) { if(h.hash[i] !== hashStr[i]) diff++; }\n            if (diff < 10) { isLoop = true; break; }\n          }'; 
const loopReplacement = `const now = Date.now();
          // Store first 3 seconds of video (3000ms) for reliable loop detection
          if (now - videoStartTime < 3000) {
            videoStartFrames.push({ hash: hashStr, time: now });
          }
          
          // Check for loop (Hamming distance < 10 for strict match)
          // ONLY compare against the initial 3-second reference frames
          let isLoop = false;
          if (now - videoStartTime > 5000) { // Don't falsely trigger during the first 5 seconds
            for (const h of videoStartFrames) {
              let diff = 0;
              for(let i=0; i<256; i++) { if(h.hash[i] !== hashStr[i]) diff++; }
              if (diff < 10) { isLoop = true; break; }
            }
          }`;

content = content.replace(loopStart, loopReplacement); 
fs.writeFileSync('index.html', content);
