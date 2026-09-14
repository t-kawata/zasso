#!/usr/bin/env node

/**
 * malfeasance-hint.test.js — Tests for PX-86
 *
 * @verifies C001
 * C001: Each malfeasance script emits a HINT on stderr for common errors.
 *
 * Red phase: tests should fail before implementation (no HINT exists).
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

let passed = 0;
let failed = 0;

// [::TICKET::] PX-86, PX-87 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-86|PX-87) --for-spec --no-implementation-order`.
function assert(condition, message) {
  if (condition) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + '\n'); }
}

console.log('\n━━━ malfeasance-hint.test.js (PX-86) — RED PHASE ━━━\n');

// [::TICKET::] PX-86, PX-87 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-86|PX-87) --for-spec --no-implementation-order`.
function runWithStderrCapture(scriptName, args) {
  const scriptPath = path.resolve(__dirname, '..', scriptName);
  const errFile = '/tmp/px86-stderr-' + Date.now() + '.txt';
  const cmd = 'node ' + scriptPath + ' ' + args + ' 2>' + errFile;
  let stdout = '';
  let exitCode = 0;
  try {
    stdout = execSync(cmd, { encoding: 'utf8', shell: '/bin/bash' });
  } catch (e) {
    stdout = e.stdout || '';
    exitCode = e.status || 1;
  }
  let stderr = '';
  try { stderr = fs.readFileSync(errFile, 'utf8'); } catch (_) {}
  try { fs.unlinkSync(errFile); } catch (_) {}
  return { stdout, stderr, exitCode };
}

// ======================================================================
// C001-Postcondition: HINT on stderr for common errors
// ======================================================================

console.log('## C001 — Error HINT output\n');

(function () {
  // malfeasance-create: no arguments → error
  const r = runWithStderrCapture('malfeasance-create.js', '');
  assert(r.stderr.includes('HINT') || r.stderr.includes('hint'),
    'malfeasance-create: no-arg error has HINT on stderr');
})();

(function () {
  // malfeasance-update: no arguments → error
  const r = runWithStderrCapture('malfeasance-update.js', '');
  assert(r.stderr.includes('HINT') || r.stderr.includes('hint'),
    'malfeasance-update: no-arg error has HINT on stderr');
})();

(function () {
  // malfeasance-delete: no arguments → error
  const r = runWithStderrCapture('malfeasance-delete.js', '');
  assert(r.stderr.includes('HINT') || r.stderr.includes('hint'),
    'malfeasance-delete: no-arg error has HINT on stderr');
})();

// ======================================================================
// C001-Invariant: stdout JSON unchanged (still valid error JSON)
// ======================================================================

console.log('\n## C001-Invariant — stdout unchanged\n');

(function () {
  const r = runWithStderrCapture('malfeasance-create.js', '');
  try {
    JSON.parse(r.stdout);
    assert(true, 'stdout is valid JSON');
  } catch (e) {
    assert(false, 'stdout is valid JSON');
  }
})();

(function () {
  const r = runWithStderrCapture('malfeasance-update.js', '');
  try {
    JSON.parse(r.stdout);
    assert(true, 'stdout is valid JSON');
  } catch (e) {
    assert(false, 'stdout is valid JSON');
  }
})();

(function () {
  const r = runWithStderrCapture('malfeasance-delete.js', '');
  try {
    JSON.parse(r.stdout);
    assert(true, 'stdout is valid JSON');
  } catch (e) {
    assert(false, 'stdout is valid JSON');
  }
})();

console.log('\n━━━ Summary ━━━');
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);
if (failed > 0) process.exit(1);
