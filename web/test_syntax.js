const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/);
const script = match[1];

const acorn = require('acorn');
try {
  acorn.parse(script, { ecmaVersion: 2022 });
  console.log("Syntax is perfectly fine!");
} catch (e) {
  console.log("Syntax Error Details:", e);
}
