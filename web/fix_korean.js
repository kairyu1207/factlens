const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

// The corrupted characters happened because UTF-8 was interpreted incorrectly.
// We can just replace the specific corrupted strings we found.

content = content.replace(/\[\?막\]/g, '[자막]');
content = content.replace(/========== \?\?\?\? \?\?:/g, '========== 새 영상 감지:');
content = content.replace(/\[\?\? \?\?\]/g, '[음성 인식]');

// Specifically for the first title, make it "첫 영상 감지"
content = content.replace(/currentVideoTitle = maxStaticText;\n\s*addEntry\(`========== 새 영상 감지: \$\{maxStaticText\} ==========`/g, 'currentVideoTitle = maxStaticText;\n            addEntry(`========== 첫 영상 감지: ${maxStaticText} ==========');

fs.writeFileSync('index.html', content);
console.log('Fixed Korean text!');
