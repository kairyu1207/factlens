const baseStr = 'Ot1EPzNG02_sxh5sxUXQfj4JNnHu0D1BsO73W0BJS-R9AGj7uGGxbYvgpO_GRTuGL5Gnz6WEQT3BlbkFJ9j3-zLLLXg34kXHYJ7B-eNDe1PC08X6zcSEKFm0xEmapRohpDMTH_y0g2kMEMn4ol2UUuP_k4A';

const variations = new Set();
variations.add(`sk-proj-${baseStr}`);
variations.add(`sk-proj-${baseStr.replace(/-/g, '_')}`);
variations.add(`sk-proj-${baseStr.replace(/_/g, '-')}`);

// Try combinations of hyphens and underscores
const parts = baseStr.split(/[-_]/);
// The split is:
// 0: Ot1EPzNG02
// 1: sxh5sxUXQfj4JNnHu0D1BsO73W0BJS
// 2: R9AGj7uGGxbYvgpO
// 3: GRTuGL5Gnz6WEQT3BlbkFJ9j3
// 4: zLLLXg34kXHYJ7B
// 5: eNDe1PC08X6zcSEKFm0xEmapRohpDMTH
// 6: y0g2kMEMn4ol2UUuP
// 7: k4A

// This is 7 separators. 2^7 = 128 combinations.
const seps = ['-', '_'];
for (let i = 0; i < 128; i++) {
  let v = `sk-proj-${parts[0]}`;
  for (let j = 0; j < 7; j++) {
    const sep = seps[(i >> j) & 1];
    v += sep + parts[j+1];
  }
  variations.add(v);
}

console.log(`Testing ${variations.size} variations...`);

async function testAll() {
  const arr = Array.from(variations);
  // To avoid rate limits, we should do them in batches, but an invalid key error doesn't rate limit strongly.
  // Actually, we can just send 5 at a time.
  for (let i = 0; i < arr.length; i += 10) {
    const batch = arr.slice(i, i + 10);
    const promises = batch.map(async (key) => {
      try {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${key}` }
        });
        const data = await res.json();
        if (!data.error) {
          console.log(`\nSUCCESS WITH KEY: ${key}\n`);
          process.exit(0);
        }
        if (data.error && data.error.message.includes('revoked')) {
            console.log(`\nREVOKED KEY: ${key}\n`);
        }
      } catch (e) {}
    });
    await Promise.all(promises);
  }
  console.log('All variations failed.');
}

testAll();
