const https = require('https');

/**
 * OCR via OCR.space API — much better at scene/video text than Tesseract.js
 * Free: 500 requests/day, 25,000/month
 */
async function ocrSpaceRecognize(base64Image, lang = 'eng') {
  const apiKey = process.env.OCR_SPACE_API_KEY || 'helloworld';
  
  const postData = new URLSearchParams({
    apikey: apiKey,
    base64Image: `data:image/jpeg;base64,${base64Image}`,
    language: lang,
    isOverlayRequired: 'true',
    OCREngine: '2', // Engine 2 is more stable for scene text and ignores background noise better
    scale: 'true',
    isTable: 'false',
    detectOrientation: 'true'
  }).toString();

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.ocr.space',
      port: 443,
      path: '/parse/image',
      method: 'POST',
      family: 4, // Force IPv4
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 15000
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);

          if (data.IsErroredOnProcessing) {
            reject(new Error(data.ErrorMessage?.[0] || 'OCR.space processing error'));
            return;
          }

          const results = data.ParsedResults || [];
          if (results.length === 0) {
            resolve({ text: '', lines: [], confidence: 0 });
            return;
          }

          const allText = results.map(r => r.ParsedText || '').join('\n').trim();
          
          const lines = [];
          for (const result of results) {
            const overlay = result.TextOverlay;
            if (overlay && overlay.Lines) {
              for (const line of overlay.Lines) {
                const lineText = line.Words.map(w => w.WordText).join(' ');
                if (lineText.trim()) {
                  lines.push({
                    text: lineText.trim(),
                    cy: (line.Words[0]?.Top || 0) + (line.Words[0]?.Height || 0)/2,
                    top: line.Words[0]?.Top || 0,
                    left: line.Words[0]?.Left || 0,
                    height: line.Words[0]?.Height || 0
                  });
                }
              }
            }
          }

          lines.sort((a, b) => a.top - b.top);

          resolve({
            text: allText,
            lines: lines,
            lineCount: lines.length,
            charCount: allText.length,
            exitCode: data.OCRExitCode
          });
        } catch (e) {
          reject(new Error('Failed to parse OCR response: ' + e.message));
        }
      });
    });

    req.on('error', (e) => {
      console.error('[OCR.space] Request error:', e.message);
      reject(e);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('OCR.space request timed out'));
    });

    req.write(postData);
    req.end();
  });
}

module.exports = { ocrSpaceRecognize };
