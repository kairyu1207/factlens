const axios = require('axios');
const cheerio = require('cheerio');

async function testDDGLite() {
  const query = "EU AI Act digital markers AI-generated content";
  try {
    const res = await axios.post('https://lite.duckduckgo.com/lite/', `q=${encodeURIComponent(query)}`, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    const $ = cheerio.load(res.data);
    const results = [];
    $('.result-snippet').each((i, el) => {
      if (i >= 5) return;
      const snippet = $(el).text().trim();
      // The link is usually in the preceding .result-title element
      const a = $(el).prev('.result-title').find('a.result-url');
      const title = a.text().trim();
      const url = a.attr('href');
      if (title && url) {
        results.push({ title, url, snippet });
      }
    });
    
    console.log(`Found ${results.length} results.`);
    console.log(results);
  } catch (e) {
    console.error('Error:', e.message);
  }
}

testDDGLite();
