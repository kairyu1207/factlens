const axios = require('axios');
const cheerio = require('cheerio');
async function scrapeWebpage(url) {
  try {
    const response = await axios.get(url, {
      timeout: 4000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const $ = cheerio.load(response.data);
    $('script, style, noscript, iframe, img, svg, video, audio, nav, footer, header').remove();
    let text = $('body').text().replace(/\s+/g, ' ').trim();
    return text.substring(0, 100);
  } catch (error) { return 'ERROR: ' + error.message; }
}
scrapeWebpage('https://en.wikipedia.org/wiki/Artificial_Intelligence_Act').then(console.log);
