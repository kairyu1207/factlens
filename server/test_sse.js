const fetch = require('node-fetch');

async function testSSE() {
  const payload = {
    infoLogs: {
      masterEvent: "The European Union has implemented the AI Act.",
      facts: [
        { claim: "The European Union has implemented the AI Act.", context: "" }
      ]
    }
  };

  const res = await fetch('http://localhost:3777/api/analyze/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  console.log('Status:', res.status);
  
  res.body.on('data', chunk => {
    console.log('CHUNK:', chunk.toString());
  });

  res.body.on('end', () => {
    console.log('STREAM ENDED');
  });
}

testSSE();
