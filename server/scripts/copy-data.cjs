const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'src', 'data');
const dest = path.join(__dirname, '..', 'dist', 'data');

if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

for (const file of fs.readdirSync(src)) {
  if (!file.endsWith('.json')) continue;
  const destFile = path.join(dest, file);
  // Only copy if doesn't exist in dist (preserve runtime data)
  if (!fs.existsSync(destFile)) {
    fs.copyFileSync(path.join(src, file), destFile);
    console.log(`  Copied ${file} to dist/data/`);
  }
}
console.log('  Data files ready.');
