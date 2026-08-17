require('dotenv').config();
const { google } = require('googleapis');
const customsearch = google.customsearch('v1');

async function testCSE() {
  const query = "EU AI Act digital markers AI-generated content";
  console.log('Query:', query);
  try {
    const res = await customsearch.cse.list({
      cx: process.env.GOOGLE_SEARCH_ENGINE_ID,
      q: query,
      auth: process.env.GOOGLE_API_KEY,
      num: 5,
    });
    console.log('Status:', res.status);
    console.log('Items found:', res.data.items ? res.data.items.length : 0);
    if (res.data.items) {
      res.data.items.forEach(i => console.log(' -', i.title, i.link));
    } else {
      console.log('No items returned! Data:', res.data);
    }
  } catch (error) {
    console.error('API Error:', error.message);
  }
}

testCSE();
