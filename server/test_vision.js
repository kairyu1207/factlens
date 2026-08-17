require('dotenv').config({ path: '../../.env' });
const https = require('https');

const apiKey = process.env.GOOGLE_API_KEY;

// 1x1 white pixel base64
const dummyImage = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const requestBody = JSON.stringify({
  requests: [
    {
      image: { content: dummyImage },
      features: [{ type: 'DOCUMENT_TEXT_DETECTION' }]
    }
  ]
});

const options = {
  hostname: 'vision.googleapis.com',
  port: 443,
  path: `/v1/images:annotate?key=${apiKey}`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(requestBody)
  }
};

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log(JSON.stringify(JSON.parse(body), null, 2));
  });
});
req.write(requestBody);
req.end();
