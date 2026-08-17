const fs = require('fs');
const htmlContent = fs.readFileSync('index.html', 'utf-8');
const scriptContent = fs.readFileSync('new_script.js', 'utf-8');
const updatedHtml = htmlContent.replace(/<script>[\s\S]*?<\/script>/, `<script>\n${scriptContent}\n</script>`);
fs.writeFileSync('index.html', updatedHtml, 'utf-8');
console.log('Successfully injected script');
