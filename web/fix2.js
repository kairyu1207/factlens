const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

// Replace corrupted "자막"
content = content.replace(/\[.*막\] \$\{line\.text\}/g, '[자막] ${line.text}');

// Replace corrupted "첫 영상 감지"
content = content.replace(/========== .*?: \$\{maxStaticText\} ==========/g, '========== 첫 영상 감지: ${maxStaticText} ==========');

// Replace corrupted "음성 인식"
content = content.replace(/addEntry\('\[.*\] ' \+ json\.text, true\);/g, "addEntry('[음성 인식] ' + json.text, true);");

fs.writeFileSync('index.html', content);
console.log('Fixed using fuzzy regex!');
