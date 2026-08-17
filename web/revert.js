const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

// 1. Remove local currentCropX initialization
content = content.replace(
    '// Smart Cropping (Pixel Diff)\n      let currentCropX = 0;\n      let currentCropY = 0;\n      const imageData = ctx.getImageData',
    '// Smart Cropping (Pixel Diff)\n      const imageData = ctx.getImageData'
);

// 2. Restore the original 60-second loop detection
const newLoopStart = `const now = Date.now();
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

const oldLoopReplacement = `const now = Date.now();
          frameHistory = frameHistory.filter(h => now - h.time < 60000);
          
          // Check for loop (Hamming distance < 10 for strict match)
          let isLoop = false;
          for (const h of frameHistory) {
            let diff = 0;
            for(let i=0; i<256; i++) { if(h.hash[i] !== hashStr[i]) diff++; }
            if (diff < 10) { isLoop = true; break; }
          }`;

content = content.replace(newLoopStart, oldLoopReplacement);

fs.writeFileSync('index.html', content);
console.log('Reverted to pure original state!');
