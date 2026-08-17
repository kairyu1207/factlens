const { search, SafeSearchType } = require('duck-duck-scrape');

async function testDDGScrape() {
  const query = "EU AI Act digital markers AI-generated content";
  try {
    const searchResults = await search(query, {
      safeSearch: SafeSearchType.OFF
    });
    
    console.log(`Found ${searchResults.results.length} results.`);
    if (searchResults.results.length > 0) {
      const top5 = searchResults.results.slice(0, 5);
      top5.forEach(r => console.log(' -', r.title, r.url));
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}
testDDGScrape();
