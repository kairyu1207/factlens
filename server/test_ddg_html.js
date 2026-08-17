const axios = require('axios');
const cheerio = require('cheerio');
async function test() {
  const query = 'EU AI Act implemented';
  try {
    const res = await axios.post('https://html.duckduckgo.com/html/', 'q=' + encodeURIComponent(query), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });
    const $ = cheerio.load(res.data);
    const results = [];
    $('.result__snippet').each((i, el) => {
      if(i >= 5) return;
      const snippet = $(el).text().trim();
      const a = $(el).parent().prev('.result__title').find('a.result__url');
      const title = a.text().trim();
      const url = a.attr('href');
      if (title && url) results.push({ title, url, snippet });
    });
    console.log("DDG HTML Results:", results.length);
  } catch (e) {
    console.error("Error:", e.message);
  }
}
test();
