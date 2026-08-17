const https = require('https');
const fs = require('fs');
const path = require('path');

const USAGE_FILE = path.join(__dirname, '..', 'vision_usage.json');
const MAX_MONTHLY_LIMIT = 100000; // 100,000 requests = approx $150 (half of $300 free credit)

function checkQuota() {
  if (fs.existsSync(USAGE_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'));
      const currentMonth = new Date().toISOString().slice(0, 7); // e.g. 2026-08
      if (data.month === currentMonth) {
        if (data.count >= MAX_MONTHLY_LIMIT) {
          throw new Error(`Google Vision API monthly safety limit reached (${data.count}/${MAX_MONTHLY_LIMIT}). Auto-blocked to prevent billing.`);
        }
        return data.count;
      }
    } catch (e) {
      if (e.message.includes('safety limit')) throw e;
    }
  }
  return 0;
}

function incrementQuota() {
  let data = { month: new Date().toISOString().slice(0, 7), count: 0 };
  if (fs.existsSync(USAGE_FILE)) {
    try {
      const oldData = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'));
      if (oldData.month === data.month) {
        data.count = oldData.count;
      }
    } catch (e) {}
  }
  data.count++;
  fs.writeFileSync(USAGE_FILE, JSON.stringify(data));
}

/**
 * Perform OCR using Google Cloud Vision API
 */
async function googleVisionRecognize(base64Image) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY is missing');
  }

  // Safety check before calling
  checkQuota();

  const requestBody = JSON.stringify({
    requests: [
      {
        image: { content: base64Image },
        features: [{ type: 'TEXT_DETECTION' }]
      }
    ]
  });

  const url = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody,
      signal: controller.signal
    });
    
    clearTimeout(timeout);

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errorText}`);
    }

    const data = await res.json();
    if (data.error) {
      throw new Error(`Google Vision API Error: ${data.error.message}`);
    }

    incrementQuota();

    const responses = data.responses || [];
    if (responses.length === 0 || !responses[0].fullTextAnnotation) {
      return { text: '', lines: [], confidence: 0 };
    }

    const allText = responses[0].fullTextAnnotation.text || '';
    const pages = responses[0].fullTextAnnotation.pages || [];
    const blocks = [];

    for (const page of pages) {
      for (const block of (page.blocks || [])) {
        let blockText = '';
        for (const paragraph of (block.paragraphs || [])) {
          for (const word of (paragraph.words || [])) {
            let wordText = '';
            for (const symbol of (word.symbols || [])) {
              wordText += symbol.text;
              if (symbol.property && symbol.property.detectedBreak) {
                const breakType = symbol.property.detectedBreak.type;
                if (breakType === 'SPACE') wordText += ' ';
                else if (breakType === 'EOL_SURE_SPACE' || breakType === 'LINE_BREAK') wordText += '\n';
              }
            }
            blockText += wordText;
          }
        }
        
        blockText = blockText.trim();
        if (!blockText) continue;

        // --- Systemic OCR Filter for UI Elements ---
        const uiKeywords = ['구독', '좋아요', '공유', '리믹스', '오프라인 저장', '클립', '저장', '신고', '채널', '조회수', 'youtube', 'shorts', '탐색', '음악', 'nate', '검색', '동영상'];
        const textLower = blockText.toLowerCase();
        
        // 1. Filter out exact UI keywords
        if (uiKeywords.some(kw => textLower.includes(kw))) {
          continue; 
        }
        
        // 2. Filter out short view count / like numbers (e.g. 1.7만, 4,042, 100만)
        if (/^[\d,.]+(만|천|m|k)?$/.test(textLower) && textLower.length < 10) {
          continue;
        }
        // -------------------------------------------

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        if (block.boundingBox && block.boundingBox.vertices) {
          for (const v of block.boundingBox.vertices) {
            const x = v.x || 0;
            const y = v.y || 0;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
        
        const cx = (minX === Infinity) ? 0 : Math.round((minX + maxX) / 2);
        const cy = (minY === Infinity) ? 0 : Math.round((minY + maxY) / 2);
        
        blocks.push({ text: blockText, cx, cy });
      }
    }

    return {
      text: allText.trim(),
      lines: blocks,
      lineCount: blocks.length,
      charCount: allText.length,
      exitCode: 1
    };
  } catch (e) {
    console.error('[Google Vision] fetch error:', e.message);
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

function getQuota() {
  if (fs.existsSync(USAGE_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'));
      const currentMonth = new Date().toISOString().slice(0, 7);
      if (data.month === currentMonth) return data.count;
    } catch (e) {}
  }
  return 0;
}

module.exports = { googleVisionRecognize, getQuota };
