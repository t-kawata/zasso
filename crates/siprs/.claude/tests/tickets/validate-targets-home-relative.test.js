// @verifies C002
// @verifies C003
const assert = require('assert');
const os = require('os');
const fs = require('fs');
const path = require('path');

const {
  checkFileExists,
  checkMarkerTextForStub,
} = require('../../scripts/tickets/validate-ticket-targets.js');

let passed = 0;
let failed = 0;

// [::TICKET::] PX-414 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-414 --for-spec --no-implementation-order`.
function run(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${error.message}`);
    failed++;
  }
}

// The fixture lives under the current HOME so that a stored `~/...` path is a real
// home-relative record, not an absolute path in disguise. Nothing here names a
// particular workspace.
const fixtureDir = fs.mkdtempSync(path.join(os.homedir(), '.targets-'));
const existingFile = path.join(fixtureDir, 'sample.js');
fs.writeFileSync(existingFile, '// [::STUB::] PX-1: sample\n');
const homeRelative = '~/' + path.relative(os.homedir(), existingFile).split(path.sep).join('/');

console.log('\n## targetStub file paths are resolved before they are checked\n');

run('a home-relative path that exists passes', () => {
  const result = checkFileExists('TS-X', homeRelative);
  assert.strictEqual(result.pass, true, JSON.stringify(result));
});

run('an absolute path that exists passes', () => {
  const result = checkFileExists('TS-X', existingFile);
  assert.strictEqual(result.pass, true, JSON.stringify(result));
});

run('a home-relative path that does not exist fails', () => {
  const result = checkFileExists('TS-X', '~/definitely-missing-sample.js');
  assert.strictEqual(result.pass, false);
  assert.ok(result.error.includes('File not found'), result.error);
});

run('markerText is read through the resolved path', () => {
  const result = checkMarkerTextForStub('TS-X', {
    status: 'pending',
    file: homeRelative,
    markerText: '[::STUB::] PX-1: sample',
  });
  assert.strictEqual(result.pass, true, JSON.stringify(result));
});

run('a resolved stub skips the marker check', () => {
  const result = checkMarkerTextForStub('TS-X', {
    status: 'resolved',
    file: homeRelative,
    markerText: 'this text is no longer in the file',
  });
  assert.deepStrictEqual(result, { pass: true });
});

run('a pending stub with a missing marker still fails', () => {
  const result = checkMarkerTextForStub('TS-X', {
    status: 'pending',
    file: homeRelative,
    markerText: 'this text is not in the file',
  });
  assert.strictEqual(result.pass, false);
});

fs.rmSync(fixtureDir, { recursive: true, force: true });

console.log(`\n━━━ Results: ${passed} passed, ${failed} failed ━━━\n`);
process.exit(failed > 0 ? 1 : 0);
