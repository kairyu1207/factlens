const axios = require('axios');

async function testDDGLiteRaw() {
  const query = "EU AI Act digital markers AI-generated content";
  try {
    const res = await axios.post('https://lite.duckduckgo.com/lite/', `q=${encodeURIComponent(query)}`, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    console.log(res.data.substring(0, 1000));
  } catch (e) {
    console.error('Error:', e.message);
  }
}
testDDGLiteRaw();
