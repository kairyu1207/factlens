const axios = require('axios');

async function testWiki() {
  const query = 'EU AI Act implemented';
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json`;
    const res = await axios.get(url, { headers: { 'User-Agent': 'FactLensBot/1.0' } });
    if (!res.data.query || !res.data.query.search) {
      console.log("No Wiki results");
      return;
    }
    
    console.log(res.data.query.search.slice(0, 5));
  } catch (error) {
    console.error(`Wiki Search Failed: ${error.message}`);
  }
}

testWiki();
