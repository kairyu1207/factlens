const fs = require('fs');
const rl = require('readline');

async function extractOriginalFile() {
    const fileStream = fs.createReadStream('C:\\Users\\seong\\.gemini\\antigravity-ide\\brain\\23e37976-713b-4280-9581-15503bc120ff\\.system_generated\\logs\\transcript_full.jsonl');
    const rlStream = rl.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let parts = [];
    let currentPart = '';

    for await (const line of rlStream) {
        try {
            const data = JSON.parse(line);
            if (data.type === 'TOOL_RESPONSE' && data.tool_name === 'default_api:run_command' && typeof data.content === 'string') {
                if (data.content.includes('<html') || data.content.includes('function startCapture') || data.content.includes('function renderFacts')) {
                    // Extract the stdout part between "Output:\n" and the end, ignoring truncated markers if possible
                    let text = data.content;
                    const outIndex = text.indexOf('Output:\n');
                    if (outIndex !== -1) {
                        text = text.substring(outIndex + 8).trim();
                        parts.push(text);
                    }
                }
            }
        } catch (e) {
            // Ignore
        }
    }
    
    fs.writeFileSync('C:\\Users\\seong\\.gemini\\antigravity-ide\\scratch\\factlens\\web\\extracted_parts.json', JSON.stringify(parts, null, 2));
    console.log(`Extracted ${parts.length} parts.`);
}

extractOriginalFile();
