#!/usr/bin/env node
// [::TICKET::] PX-118: remove-stub.js test suite — deterministic STUB marker line removal.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-118 --for-spec --no-implementation-order`.

/**
 * remove-stub.test.js — Tests for remove-stub.js
 *
 * Covers contracts C001–C005 (marker removal, wrong-line guard, comment-only
 * guard, idempotent re-removal, bottom-up batch removal) plus boundary cases.
 * Follows insert-stub.test.js conventions: self-contained helpers, tmp-dir
 * fixtures, RED-mode fallback when the module is not yet implemented,
 * summary + exit 1 on failure.
 *
 * @verifies C001 — resolved stub → marker line removal
 * @verifies C002 — target line without marker → fail loudly
 * @verifies C003 — code + marker on same line → refuse
 * @verifies C004 — already-removed marker → deterministic result
 * @verifies C005 — multiple markers in one file → bottom-up removal
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Module to test — loaded after fixtures are prepared.
let removeStub, RemoveStubError;

let passed = 0;
let failed = 0;

// [::TICKET::] PX-118: test helpers mirror insert-stub.test.js.
// [::TICKET::] PX-118 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-118 --for-spec --no-implementation-order`.
function assert(condition, message) {
  if (condition) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + '\n'); }
}

// [::TICKET::] PX-118 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-118 --for-spec --no-implementation-order`.
function assertStrictEqual(actual, expected, message) {
  const pass = actual === expected;
  if (pass) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else {
    failed++;
    process.stdout.write('  ✗ ' + message + '\n');
    process.stdout.write('    expected: ' + JSON.stringify(expected) + '\n');
    process.stdout.write('    actual:   ' + JSON.stringify(actual) + '\n');
  }
}

// ---------------------------------------------------------------------------
// Setup: tmp dir + module load
// ---------------------------------------------------------------------------
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remove-stub-test-'));
const MARKER = '// [::STUB::] P0-1: pending -- replace with real logic';

// [::TICKET::] PX-118 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-118 --for-spec --no-implementation-order`.
function writeFixture(name, content) {
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, content);
  return filePath;
}

// Load module (RED-mode fallback — all tests fail until remove-stub.js exists)
try {
  const mod = require('../remove-stub');
  removeStub = mod.removeStub;
  RemoveStubError = mod.RemoveStubError;
} catch (e) {
  process.stdout.write('\n⚠  remove-stub.js not yet implemented — running in RED mode (all tests expected to fail)\n\n');
}

// ===========================================================================
// Tests
// ===========================================================================

process.stdout.write('\nremove-stub.js tests\n');
process.stdout.write('====================\n\n');

// ---------------------------------------------------------------------------
// C001 — Single marker removal preserves all other lines
// ---------------------------------------------------------------------------
process.stdout.write('[C001] Single-line marker removal\n');
(function testSingleRemoval() {
  if (!removeStub) { failed++; process.stdout.write('  ✗ (module not implemented)\n'); return; }
  const filePath = writeFixture('c001-single.rs', 'fn main() {}\n' + MARKER + '\nfn helper() {}\n');
  try {
    const result = removeStub({ file: filePath, line: 2 });
    assert(result.removed === true, 'returns {removed: true}');
    assert(result.line === 2, 'returns the removed line number');
    const content = fs.readFileSync(filePath, 'utf8');
    const after = content.replace(/\n$/, '').split('\n');
// [::TICKET::] PX-118 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-118 --for-spec --no-implementation-order`.
    assertStrictEqual(after[0], 'fn main() {}', 'first line preserved');
// [::TICKET::] PX-118 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-118 --for-spec --no-implementation-order`.
    assertStrictEqual(after[1], 'fn helper() {}', 'third line preserved');
    assert(after.length === 2, 'line count decreased by exactly 1');
    assert(!content.includes('[::STUB::]'), 'no marker remains in file');
  } catch (err) {
    failed++; process.stdout.write('  ✗ single removal threw: ' + err.message + '\n');
  }
})();

// ---------------------------------------------------------------------------
// C001 — Structured result shape (single mode)
// ---------------------------------------------------------------------------
process.stdout.write('\n[C001] Structured result shape\n');
(function testStructuredResult() {
  if (!removeStub) { failed++; process.stdout.write('  ✗ (module not implemented)\n'); return; }
  const filePath = writeFixture('c001-result.rs', MARKER + '\n');
  try {
    const result = removeStub({ file: filePath, line: 1 });
    assert(typeof result.file === 'string', 'result contains file path');
    assert(path.isAbsolute(result.file), 'result file is absolute');
    assert(result.line === 1, 'result contains line');
    assertStrictEqual(fs.readFileSync(filePath, 'utf8'), '', 'marker-only file becomes empty');
  } catch (err) {
    failed++; process.stdout.write('  ✗ structured result threw: ' + err.message + '\n');
  }
})();

// ---------------------------------------------------------------------------
// C001 — Error: file not found
// ---------------------------------------------------------------------------
process.stdout.write('\n[C001] File not found\n');
(function testFileNotFound() {
  if (!removeStub) { failed++; process.stdout.write('  ✗ (module not implemented)\n'); return; }
  try {
    removeStub({ file: path.join(tmpDir, 'missing.rs'), line: 1 });
    failed++; process.stdout.write('  ✗ should have thrown for missing file\n');
  } catch (err) {
    assert(err instanceof RemoveStubError, 'throws RemoveStubError');
    assert(err.message.includes('not found') || err.message.includes('exist'), 'message mentions not found: ' + err.message);
  }
})();

// ---------------------------------------------------------------------------
// C001 — Error: line out of range
// ---------------------------------------------------------------------------
process.stdout.write('\n[C001] Line out of range\n');
(function testLineOutOfRange() {
  if (!removeStub) { failed++; process.stdout.write('  ✗ (module not implemented)\n'); return; }
  const filePath = writeFixture('c001-range.rs', 'a\nb\n');
  try {
    removeStub({ file: filePath, line: 999 });
    failed++; process.stdout.write('  ✗ should have thrown for out-of-range line\n');
  } catch (err) {
    assert(err instanceof RemoveStubError, 'throws RemoveStubError');
    assert(/line|range|999/.test(err.message), 'message mentions line/range: ' + err.message);
  }
})();

// ---------------------------------------------------------------------------
// C001 — Error: missing required args
// ---------------------------------------------------------------------------
process.stdout.write('\n[C001] Missing required args\n');
(function testMissingArgs() {
  if (!removeStub) { failed++; process.stdout.write('  ✗ (module not implemented)\n'); return; }
  const filePath = writeFixture('c001-args.rs', MARKER + '\n');
  try {
    removeStub({ file: filePath });
    failed++; process.stdout.write('  ✗ should have thrown with no line/lines\n');
  } catch (err) {
    assert(err instanceof RemoveStubError, 'throws RemoveStubError');
    assert(/line/i.test(err.message), 'message mentions line: ' + err.message);
  }
  try {
    removeStub({ line: 1 });
    failed++; process.stdout.write('  ✗ should have thrown with no file\n');
  } catch (err) {
    assert(err instanceof RemoveStubError, 'throws RemoveStubError (no file)');
  }
})();

// ---------------------------------------------------------------------------
// C001 — Error: line 0 / negative / non-integer
// ---------------------------------------------------------------------------
process.stdout.write('\n[C001] Invalid line values\n');
(function testInvalidLineValues() {
  if (!removeStub) { failed++; process.stdout.write('  ✗ (module not implemented)\n'); return; }
  const filePath = writeFixture('c001-invalid.rs', MARKER + '\n');
  for (const badLine of [0, -1, 1.5, NaN]) {
    try {
      removeStub({ file: filePath, line: badLine });
      failed++; process.stdout.write('  ✗ line ' + badLine + ' should have been rejected\n');
    } catch (err) {
      assert(err instanceof RemoveStubError, 'line ' + badLine + ' rejected with RemoveStubError');
    }
  }
})();

// ---------------------------------------------------------------------------
// C002 — Target line without marker → fail loudly, file unchanged
// ---------------------------------------------------------------------------
process.stdout.write('\n[C002] No marker at target line\n');
(function testNoMarkerAtLine() {
  if (!removeStub) { failed++; process.stdout.write('  ✗ (module not implemented)\n'); return; }
  const filePath = writeFixture('c002-nomarker.rs', 'fn main() {}\nfn helper() {}\n');
  const before = fs.readFileSync(filePath, 'utf8');
  try {
    removeStub({ file: filePath, line: 1 });
    failed++; process.stdout.write('  ✗ should have thrown for non-marker line\n');
  } catch (err) {
    assert(err instanceof RemoveStubError, 'throws RemoveStubError');
    assert(err.message.includes('no STUB marker') || err.message.includes('STUB'), 'message mentions marker: ' + err.message);
    assertStrictEqual(fs.readFileSync(filePath, 'utf8'), before, 'file bytes untouched on error');
  }
})();

// ---------------------------------------------------------------------------
// C002 — Blank/whitespace-only line is not a marker line
// ---------------------------------------------------------------------------
process.stdout.write('\n[C002] Blank target line\n');
(function testBlankLine() {
  if (!removeStub) { failed++; process.stdout.write('  ✗ (module not implemented)\n'); return; }
  const filePath = writeFixture('c002-blank.rs', 'a\n\nb\n');
  const before = fs.readFileSync(filePath, 'utf8');
  try {
    removeStub({ file: filePath, line: 2 });
    failed++; process.stdout.write('  ✗ should have thrown for blank line\n');
  } catch (err) {
    assert(err instanceof RemoveStubError, 'throws RemoveStubError');
    assertStrictEqual(fs.readFileSync(filePath, 'utf8'), before, 'blank line never deleted');
  }
})();

// ---------------------------------------------------------------------------
// C003 — Marker inline with code → refuse, code preserved
// ---------------------------------------------------------------------------
process.stdout.write('\n[C003] Marker inline with code\n');
(function testInlineCodeMarker() {
  if (!removeStub) { failed++; process.stdout.write('  ✗ (module not implemented)\n'); return; }
  const filePath = writeFixture('c003-inline.rs', 'const x = 1; // [::STUB::] P0-1: pending -- replace\n');
  const before = fs.readFileSync(filePath, 'utf8');
  try {
    removeStub({ file: filePath, line: 1 });
    failed++; process.stdout.write('  ✗ should have refused inline code + marker\n');
  } catch (err) {
    assert(err instanceof RemoveStubError, 'throws RemoveStubError');
    assert(err.message.includes('comment') || err.message.includes('line'), 'message mentions comment-only rule: ' + err.message);
    assertStrictEqual(fs.readFileSync(filePath, 'utf8'), before, 'executable code preserved');
  }
})();

// ---------------------------------------------------------------------------
// C003 — Marker inside block comment → refuse
// ---------------------------------------------------------------------------
process.stdout.write('\n[C003] Marker inside block comment\n');
(function testBlockCommentMarker() {
  if (!removeStub) { failed++; process.stdout.write('  ✗ (module not implemented)\n'); return; }
  const filePath = writeFixture('c003-block.rs', '/* [::STUB::] P0-1: pending -- replace */\n');
  const before = fs.readFileSync(filePath, 'utf8');
  try {
    removeStub({ file: filePath, line: 1 });
    failed++; process.stdout.write('  ✗ should have refused block-comment marker\n');
  } catch (err) {
    assert(err instanceof RemoveStubError, 'throws RemoveStubError');
    assertStrictEqual(fs.readFileSync(filePath, 'utf8'), before, 'block comment left untouched');
  }
})();

// ---------------------------------------------------------------------------
// C004 — Already-removed marker → second call fails loudly
// ---------------------------------------------------------------------------
process.stdout.write('\n[C004] Re-removal fails loudly\n');
(function testReRemoval() {
  if (!removeStub) { failed++; process.stdout.write('  ✗ (module not implemented)\n'); return; }
  const filePath = writeFixture('c004-reremove.rs', 'a\n' + MARKER + '\nb\n');
  try {
    const first = removeStub({ file: filePath, line: 2 });
    assert(first.removed === true, 'first removal succeeded');
  } catch (err) {
    failed++; process.stdout.write('  ✗ first removal threw: ' + err.message + '\n'); return;
  }
  try {
    removeStub({ file: filePath, line: 2 });
    failed++; process.stdout.write('  ✗ second removal should have failed loudly\n');
  } catch (err) {
    assert(err instanceof RemoveStubError, 'second removal throws RemoveStubError');
    assert(err.message.includes('no STUB marker') || err.message.includes('STUB'), 'message reports no marker: ' + err.message);
    assert(!fs.readFileSync(filePath, 'utf8').includes('[::STUB::]'), 'file not corrupted by retry');
  }
})();

// ---------------------------------------------------------------------------
// C005 — Batch removal preserves others, processes descending
// ---------------------------------------------------------------------------
process.stdout.write('\n[C005] Batch removal\n');
(function testBatchRemoval() {
  if (!removeStub) { failed++; process.stdout.write('  ✗ (module not implemented)\n'); return; }
  const filePath = writeFixture('c005-batch.rs',
    '// line 1\n' + MARKER.replace('pending', 'a') + '\n// line 3\n' + MARKER.replace('pending', 'b') + '\n// line 5\n');
  try {
    const result = removeStub({ file: filePath, lines: [2, 4] });
    assert(result.removed === true, 'batch returns {removed: true}');
    const content = fs.readFileSync(filePath, 'utf8');
    const after = content.replace(/\n$/, '').split('\n');
    assertStrictEqual(after[0], '// line 1', 'line 1 preserved');
    assertStrictEqual(after[1], '// line 3', 'line 3 preserved');
    assertStrictEqual(after[2], '// line 5', 'line 5 preserved');
    assert(after.length === 3, 'exactly two markers removed');
    assert(!content.includes('[::STUB::]'), 'no marker remains');
  } catch (err) {
    failed++; process.stdout.write('  ✗ batch removal threw: ' + err.message + '\n');
  }
})();

// ---------------------------------------------------------------------------
// C005 — Empty --lines array must not report a false success
// ---------------------------------------------------------------------------
process.stdout.write('\n[C005] Empty lines array\n');
(function testEmptyLinesArray() {
  if (!removeStub) { failed++; process.stdout.write('  ✗ (module not implemented)\n'); return; }
  const filePath = writeFixture('c005-empty.rs', MARKER + '\n');
  const before = fs.readFileSync(filePath, 'utf8');
  try {
    removeStub({ file: filePath, lines: [] });
    failed++; process.stdout.write('  ✗ empty lines array should not be a silent success\n');
  } catch (err) {
    assert(err instanceof RemoveStubError, 'throws RemoveStubError');
    assert(/line/i.test(err.message), 'message mentions line: ' + err.message);
    assertStrictEqual(fs.readFileSync(filePath, 'utf8'), before, 'file unchanged on empty lines array');
  }
})();

// ---------------------------------------------------------------------------
// C005 — Batch atomicity: any invalid line aborts the whole call
// ---------------------------------------------------------------------------
process.stdout.write('\n[C005] Batch atomicity\n');
(function testBatchAtomicity() {
  if (!removeStub) { failed++; process.stdout.write('  ✗ (module not implemented)\n'); return; }
  const filePath = writeFixture('c005-atomic.rs', '// line 1\n' + MARKER + '\n// line 3\n');
  const before = fs.readFileSync(filePath, 'utf8');
  try {
    removeStub({ file: filePath, lines: [2, 999] });
    failed++; process.stdout.write('  ✗ batch with invalid line should have aborted\n');
  } catch (err) {
    assert(err instanceof RemoveStubError, 'throws RemoveStubError');
    assertStrictEqual(fs.readFileSync(filePath, 'utf8'), before, 'failed batch leaves file unchanged');
  }
})();

// ---------------------------------------------------------------------------
// C005 — Batch with a non-marker line aborts the whole call
// ---------------------------------------------------------------------------
process.stdout.write('\n[C005] Batch with non-marker line\n');
(function testBatchNonMarker() {
  if (!removeStub) { failed++; process.stdout.write('  ✗ (module not implemented)\n'); return; }
  const filePath = writeFixture('c005-nonmarker.rs', MARKER + '\n// not a marker\n');
  const before = fs.readFileSync(filePath, 'utf8');
  try {
    removeStub({ file: filePath, lines: [1, 2] });
    failed++; process.stdout.write('  ✗ batch with non-marker line should have aborted\n');
  } catch (err) {
    assert(err instanceof RemoveStubError, 'throws RemoveStubError');
    assertStrictEqual(fs.readFileSync(filePath, 'utf8'), before, 'no partial removal on failure');
  }
})();

// ---------------------------------------------------------------------------
// Boundary — File without trailing newline stays free of appended newline
// ---------------------------------------------------------------------------
process.stdout.write('\n[Boundary] No trailing newline\n');
(function testNoTrailingNewline() {
  if (!removeStub) { failed++; process.stdout.write('  ✗ (module not implemented)\n'); return; }
  const filePath = writeFixture('boundary-nonl.rs', 'a\n' + MARKER);
  try {
    removeStub({ file: filePath, line: 2 });
    assertStrictEqual(fs.readFileSync(filePath, 'utf8'), 'a', 'no trailing newline appended');
  } catch (err) {
    failed++; process.stdout.write('  ✗ no-trailing-newline removal threw: ' + err.message + '\n');
  }
})();

// ---------------------------------------------------------------------------
// Boundary — First and last line are both valid targets
// ---------------------------------------------------------------------------
process.stdout.write('\n[Boundary] First/last line targets\n');
(function testFirstLastLine() {
  if (!removeStub) { failed++; process.stdout.write('  ✗ (module not implemented)\n'); return; }
  const firstFile = writeFixture('boundary-first.rs', MARKER + '\nrest\n');
  const lastFile = writeFixture('boundary-last.rs', 'rest\n' + MARKER + '\n');
  try {
    removeStub({ file: firstFile, line: 1 });
    assertStrictEqual(fs.readFileSync(firstFile, 'utf8'), 'rest\n', 'first-line marker removed');
    removeStub({ file: lastFile, line: 2 });
    assertStrictEqual(fs.readFileSync(lastFile, 'utf8'), 'rest\n', 'last-line marker removed');
  } catch (err) {
    failed++; process.stdout.write('  ✗ first/last line removal threw: ' + err.message + '\n');
  }
})();

// ---------------------------------------------------------------------------
// Error — File is a directory
// ---------------------------------------------------------------------------
process.stdout.write('\n[Error] File path is a directory\n');
(function testDirectoryPath() {
  if (!removeStub) { failed++; process.stdout.write('  ✗ (module not implemented)\n'); return; }
  try {
    removeStub({ file: tmpDir, line: 1 });
    failed++; process.stdout.write('  ✗ should have rejected a directory\n');
  } catch (err) {
    assert(err instanceof RemoveStubError, 'throws RemoveStubError');
    assert(/directory|file/i.test(err.message), 'message mentions file/directory: ' + err.message);
  }
})();

// ---------------------------------------------------------------------------
// Invariant — Post-removal re-scan confirms marker absence and byte-exact rest
// ---------------------------------------------------------------------------
process.stdout.write('\n[Invariant] Post-removal re-scan\n');
(function testPostRemovalRescan() {
  if (!removeStub) { failed++; process.stdout.write('  ✗ (module not implemented)\n'); return; }
  const filePath = writeFixture('invariant-rescan.rs', 'x = 1;\n' + MARKER + '\ny = 2;\n');
  const expectedRemainder = 'x = 1;\ny = 2;\n';
  try {
    removeStub({ file: filePath, line: 2 });
    assertStrictEqual(fs.readFileSync(filePath, 'utf8'), expectedRemainder, 'file equals original minus the marker line');
  } catch (err) {
    failed++; process.stdout.write('  ✗ re-scan test threw: ' + err.message + '\n');
  }
})();

// ===========================================================================
// CLI tests
// ===========================================================================
const { spawnSync } = require('child_process');
const scriptPath = path.resolve(__dirname, '../remove-stub.js');

process.stdout.write('\n[CLI] --file/--line success\n');
(function testCliSuccess() {
  if (!fs.existsSync(scriptPath)) {
    failed++; process.stdout.write('  ✗ (remove-stub.js not implemented)\n'); return;
  }
  const filePath = writeFixture('cli-success.rs', 'a\n' + MARKER + '\nb\n');
  const cp = spawnSync('node', [scriptPath, '--file=' + filePath, '--line=2'], { encoding: 'utf8' });
  if (cp.status === 0) {
    passed++; process.stdout.write('  ✓ exit 0\n');
    const out = JSON.parse(cp.stdout.trim());
    assert(out.removed === true, 'stdout reports removed: true');
    assertStrictEqual(fs.readFileSync(filePath, 'utf8'), 'a\nb\n', 'CLI removed the marker line');
  } else {
    failed++; process.stdout.write('  ✗ expected exit 0, got ' + cp.status + ': ' + cp.stderr.toString().slice(0, 200) + '\n');
  }
})();

process.stdout.write('\n[CLI] --file/--line error path\n');
(function testCliError() {
  if (!fs.existsSync(scriptPath)) {
    failed++; process.stdout.write('  ✗ (remove-stub.js not implemented)\n'); return;
  }
  const filePath = writeFixture('cli-error.rs', 'no marker here\n');
  const cp = spawnSync('node', [scriptPath, '--file=' + filePath, '--line=1'], { encoding: 'utf8' });
  if (cp.status !== 0) {
    passed++; process.stdout.write('  ✓ non-zero exit on error\n');
  } else {
    failed++; process.stdout.write('  ✗ expected non-zero exit for non-marker line\n');
  }
})();

process.stdout.write('\n[CLI] --lines batch success\n');
(function testCliBatch() {
  if (!fs.existsSync(scriptPath)) {
    failed++; process.stdout.write('  ✗ (remove-stub.js not implemented)\n'); return;
  }
  const filePath = writeFixture('cli-batch.rs', 'a\n' + MARKER + '\nc\n' + MARKER.replace('pending', 'd') + '\ne\n');
  const cp = spawnSync('node', [scriptPath, '--file=' + filePath, '--lines=2,4'], { encoding: 'utf8' });
  if (cp.status === 0) {
    passed++; process.stdout.write('  ✓ exit 0\n');
    assertStrictEqual(fs.readFileSync(filePath, 'utf8'), 'a\nc\ne\n', 'CLI removed both markers');
  } else {
    failed++; process.stdout.write('  ✗ expected exit 0, got ' + cp.status + ': ' + cp.stderr.toString().slice(0, 200) + '\n');
  }
})();

// ===========================================================================
// Summary
// ===========================================================================
process.stdout.write('\n====================\n');
process.stdout.write('Results: ' + passed + ' passed, ' + failed + ' failed\n\n');

if (failed > 0) process.exit(1);
