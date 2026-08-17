const axios = require('axios');
const cheerio = require('cheerio');
async function test() {
  const query = 'EU AI Act implemented';
  try {
    const res = await axios.post('https://lite.duckduckgo.com/lite/', 'q=' + encodeURIComponent(query), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0'
      }
    });
    const $ = cheerio.load(res.data);
    const results = [];
    $('.result-snippet').each((i, el) => {
      const snippet = $(el).text().trim();
      const a = $(el).prev('.result-title').find('a.result-url');
      const title = a.text().trim();
      const url = a.attr('href');
      if (title && url) results.push({ title, url, snippet });
    });
    console.log(results);
  } catch (e) {
    console.error(e.message);
  }
}
test();
