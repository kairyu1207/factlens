const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);

if (!scriptMatch) {
  console.log('No script found');
  process.exit(1);
}

const scriptContent = scriptMatch[1];

const document = {
  getElementById: (id) => ({
    addEventListener: () => {},
    classList: { add: () => {}, remove: () => {} },
    style: {}
  }),
  createElement: () => ({ innerHTML: '' }),
  addEventListener: () => {}
};

const window = { document, open: () => ({}) };
global.document = document;
global.window = window;

try {
  eval(scriptContent);
  console.log('Script loaded successfully with no errors!');
} catch (e) {
  console.error('Error during script load:', e);
}
