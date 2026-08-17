const googleIt = require('google-it');

async function testGoogleIt() {
  const query = "European Union AI Act enforcement";
  console.log('Fetching:', query);
  try {
    const results = await googleIt({ query, 'no-display': true, limit: 5 });
    console.log('Results:', results);
  } catch (e) {
    console.error('Error:', e.message);
  }
}
testGoogleIt();
