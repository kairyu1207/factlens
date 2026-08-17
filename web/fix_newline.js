const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

// Fix the missing newline
content = content.replace(/\/\/ \?\?\?Helpers \?\?\? {4}function setStep/g, '// --- Helpers ---\n    function setStep');
content = content.replace(/\/\/ \?\?\?Helpers \?\?\? {4}function setStep/g, '// --- Helpers ---\n    function setStep');
content = content.replace(/\/\/ \?\?Helpers \?\?    function setStep/g, '// --- Helpers ---\n    function setStep');
content = content.replace(/\/\/.*\?+Helpers\?+.*function setStep/, '// --- Helpers ---\n    function setStep');

fs.writeFileSync('index.html', content);
console.log('Fixed newline!');
