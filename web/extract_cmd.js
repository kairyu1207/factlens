const fs = require('fs');
const rl = require('readline');

async function extractOriginalFile() {
    const fileStream = fs.createReadStream('C:\\Users\\seong\\.gemini\\antigravity-ide\\brain\\23e37976-713b-4280-9581-15503bc120ff\\.system_generated\\logs\\transcript_full.jsonl');
    const rlStream = rl.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let bestMatch = '';
    let longestLength = 0;

    for await (const line of rlStream) {
        try {
            const data = JSON.parse(line);
            if (data.type === 'TOOL_RESPONSE' && data.tool_name === 'default_api:run_command' && typeof data.content === 'string') {
                if (data.content.includes('function startCapture') && data.content.includes('function stopCapture')) {
                    if (data.content.length > longestLength) {
                        longestLength = data.content.length;
                        bestMatch = data.content;
                    }
                }
            }
        } catch (e) {
            // Ignore
        }
    }
    
    if (longestLength > 0) {
        fs.writeFileSync('C:\\Users\\seong\\.gemini\\antigravity-ide\\scratch\\factlens\\web\\original_from_cmd.txt', bestMatch);
        console.log(`Found a match of length ${longestLength}`);
    } else {
        console.log('No match found.');
    }
}

extractOriginalFile();
