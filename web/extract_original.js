const fs = require('fs');
const rl = require('readline');

async function extractOriginalFile() {
    const fileStream = fs.createReadStream('C:\\Users\\seong\\.gemini\\antigravity-ide\\brain\\23e37976-713b-4280-9581-15503bc120ff\\.system_generated\\logs\\transcript_full.jsonl');
    const rlStream = rl.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    for await (const line of rlStream) {
        try {
            const data = JSON.parse(line);
            if (data.type === 'TOOL_RESPONSE' && data.tool_name === 'default_api:view_file' && data.content.includes('<!DOCTYPE html>')) {
                // Check if the content belongs to index.html (it should have the FACTLENS HTML structure)
                if (data.content.includes('<title>FactLens</title>')) {
                    fs.writeFileSync('C:\\Users\\seong\\.gemini\\antigravity-ide\\scratch\\factlens\\web\\original_index_backup.html', data.content);
                    console.log('Successfully extracted the original index.html from transcript!');
                    return;
                }
            }
        } catch (e) {
            // Ignore parse errors
        }
    }
    console.log('Could not find original index.html in transcript.');
}

extractOriginalFile();
