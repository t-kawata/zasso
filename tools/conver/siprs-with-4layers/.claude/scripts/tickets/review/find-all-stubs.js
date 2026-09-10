

const fs = require('fs');
const path = require('path');
const { CFG } = require('../../lib/tickets');

const { containsStubMarker, isStubInQuotes, FIXTURE_STORAGE_DIR } = require('../../lib/stub-marker-scan');
// [::TICKET::] PX-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-2 --for-spec --no-implementation-order`.
// Quoted-string marker rejection and the exceptional `fixtures` storage-directory
// skip are single-sourced in lib/stub-marker-scan.js (PX-139).
const SKIP_DIRS = new Set(['node_modules', 'target', '.git', '.claude', FIXTURE_STORAGE_DIR]);

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

// [::TICKET::] PX-139 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-139 --for-spec --no-implementation-order`.
function scanFile(filePath, results) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return;
  }
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (containsStubMarker(lines[i]) && !isStubInQuotes(lines[i])) {
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
