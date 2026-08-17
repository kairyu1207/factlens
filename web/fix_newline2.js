const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

// Use a very permissive regex
content = content.replace(/\/\/.*?Helpers.*?(?=function setStep)/g, '// --- Helpers ---\n    ');

fs.writeFileSync('index.html', content);
console.log('Fixed newline!');
