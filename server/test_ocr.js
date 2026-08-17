const https = require('https');
const fs = require('fs');

const apiKey = 'K83082135588957';
// Use a placeholder base64 or a small blank image just to test engine availability
const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function testEngine(engine) {
  const postData = new URLSearchParams({
    apikey: apiKey,
    base64Image: `data:image/png;base64,${base64Image}`,
    language: 'eng',
    OCREngine: engine
  }).toString();

  const options = {
    hostname: 'api.ocr.space',
    port: 443,
    path: '/parse/image',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = https.request(options, res => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => console.log(`Engine ${engine}: ${res.statusCode} ${body.substring(0, 100)}`));
  });
  req.write(postData);
  req.end();
}

testEngine('1');
testEngine('2');
testEngine('3');
testEngine('5');
