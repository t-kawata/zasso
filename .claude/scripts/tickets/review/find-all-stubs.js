const fs = require('fs');
const path = require('path');
const { CFG } = require('../../lib/tickets');

const STUB_RE = /\[::STUB::\]/;
// Data reference: [::STUB::] inside a quoted string (e.g. a test assertion
// checking for the absence of a marker) is not an actual stub marker.
// Real markers live in comments and are never inside quotes.
const STUB_IN_QUOTES_RE = /['"`][^'"`]*\[::STUB::\][^'"`]*['"`]/;
const SKIP_DIRS = new Set(['node_modules', 'target', '.git', '.claude']);

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.log(JSON.stringify({ success: false, error: 'Usage: node find-all-stubs.js <directory>' }, null, 2));
    process.exit(1);
  }
  if (!fs.existsSync(dir)) {
    console.log(JSON.stringify({ success: false, error: `Directory not found: ${dir}` }, null, 2));
    process.exit(1);
  }

  const stubs = [];
  scanDirectory(path.resolve(dir), stubs);

  console.log(JSON.stringify({ success: true, count: stubs.length, stubs }, null, 2));
}

function scanDirectory(dirPath, results) {
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      scanDirectory(fullPath, results);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (CFG.review.targetExtensions.includes(ext)) {
        scanFile(fullPath, results);
      }
    }
  }
}

function scanFile(filePath, results) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return;
  }
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (STUB_RE.test(lines[i]) && !STUB_IN_QUOTES_RE.test(lines[i])) {
      results.push({
        file: filePath,
        line: i + 1,
        content: lines[i].trim(),
      });
    }
  }
}

if (require.main === module) main();
module.exports = { main, scanDirectory, scanFile };
