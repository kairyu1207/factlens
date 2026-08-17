const axios = require('axios');
const cheerio = require('cheerio');

async function testYahoo() {
  const query = "EU AI Act digital markers AI-generated content";
  try {
    const res = await axios.get(`https://search.yahoo.com/search?p=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });
    
    const $ = cheerio.load(res.data);
    const results = [];
    $('.algo-sr').each((i, el) => {
      if (i >= 5) return;
      const title = $(el).find('h3.title a').text().trim();
      const url = $(el).find('h3.title a').attr('href');
      const snippet = $(el).find('.compText').text().trim();
      
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

testYahoo();
