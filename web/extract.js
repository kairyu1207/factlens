const fs = require('fs');
const script = fs.readFileSync('index.html', 'utf8').split('<script>')[1].split('</script>')[0];
fs.writeFileSync('script.js', script);
