#!/usr/bin/env node
/**
 * px91-idempotent-fields.test.js — Tests for PX-91
 *
 * Covers C001: update-ticket.js rejects --append for targetStubs/targetCrimes.
 *
 * TDD Red phase: all tests should fail before implementation.
 */

const path = require('path');
const fs = require('fs');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + '\n'); }
}

function assertStrictEqual(actual, expected, message) {
  if (actual === expected) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + '\n'); }
}

console.log('\n━━━ PX-91 idempotent-fields.test.js — TESTS ━━━\n');

// ======================================================================
// C001: update-ticket.js --append guard for targetStubs/targetCrimes
// ======================================================================

console.log('## C001 — append guard on idempotent fields\n');

(function testAppendGuard() {
  // Verify the IDEMPOTENT_FIELDS constant exists in update-ticket.js
  const content = fs.readFileSync(
    path.join(__dirname, '..', 'update-ticket.js'),
    'utf8'
  );
  const hasIdempotentConst = content.includes('IDEMPOTENT_FIELDS');
  assert(hasIdempotentConst, 'IDEMPOTENT_FIELDS constant defined in update-ticket.js');

  // Verify it contains targetStubs
  const hasTargetStubs = content.includes("'targetStubs'");
  assert(hasTargetStubs, 'IDEMPOTENT_FIELDS contains targetStubs');

  // Verify it contains targetCrimes
  const hasTargetCrimes = content.includes("'targetCrimes'");
  assert(hasTargetCrimes, 'IDEMPOTENT_FIELDS contains targetCrimes');
})();

(function testSpawnAppendTargetStubsRejected() {
  // Submit --append with targetStubs and expect error
  const { spawnSync } = require('child_process');
  const proc = spawnSync('node', [
    '.claude/scripts/tickets/update-ticket.js',
    'Tickets.json',
    'PX-91',
    '--append'
  ], {
    input: JSON.stringify({targetStubs: [{id: 'TS-TEST'}]}),
    encoding: 'utf8',
    cwd: path.resolve(__dirname, '../../../../')
  });

  if (proc.stdout) {
    try {
      const output = JSON.parse(proc.stdout);
      assert(output.success === false, '--append with targetStubs returns success=false');
      assert(output.error && output.error.includes('targetStubs'), 'error message mentions targetStubs');
    } catch (e) {
      assert(false, 'stdout is valid JSON: ' + proc.stdout.substring(0, 100));
    }
  } else {
    assert(false, '--append with targetStubs produces stdout');
  }
})();

(function testSpawnAppendTargetCrimesRejected() {
  // Submit --append with targetCrimes and expect error
  const { spawnSync } = require('child_process');
  const proc = spawnSync('node', [
    '.claude/scripts/tickets/update-ticket.js',
    'Tickets.json',
    'PX-91',
    '--append'
  ], {
    input: JSON.stringify({targetCrimes: [{id: 'TC-TEST'}]}),
    encoding: 'utf8',
    cwd: path.resolve(__dirname, '../../../../')
  });

  if (proc.stdout) {
    try {
      const output = JSON.parse(proc.stdout);
      assert(output.success === false, '--append with targetCrimes returns success=false');
      assert(output.error && output.error.includes('targetCrimes'), 'error message mentions targetCrimes');
    } catch (e) {
      assert(false, 'stdout is valid JSON: ' + proc.stdout.substring(0, 100));
    }
  } else {
    assert(false, '--append with targetCrimes produces stdout');
  }
})();

(function testAppendOtherFieldsStillWorks() {
  // Normal --append for non-idempotent fields must still work
  const { spawnSync } = require('child_process');
  const proc = spawnSync('node', [
    '.claude/scripts/tickets/update-ticket.js',
    'Tickets.json',
    'PX-91',
    '--append'
  ], {
    input: JSON.stringify({notes: 'appended note test'}),
    encoding: 'utf8',
    cwd: path.resolve(__dirname, '../../../../')
  });

  if (proc.stdout) {
    try {
      const output = JSON.parse(proc.stdout);
      assert(output.success === true, '--append with notes (non-idempotent) still succeeds');
    } catch (e) {
      assert(false, 'stdout is valid JSON: ' + proc.stdout.substring(0, 100));
    }
  } else {
    assert(false, '--append with notes produces stdout');
  }
})();

// ======================================================================
// Summary
// ======================================================================

const total = passed + failed;
console.log('\n━━━ RESULTS ━━━');
console.log('  Passed: ' + passed + ' / ' + total);
console.log('  Failed: ' + failed + ' / ' + total);

if (failed > 0) {
  console.log('\n❌ RED: Some tests failed (expected before implementation).');
  process.exit(1);
} else {
  console.log('\n✅ All tests passed.');
  process.exit(0);
}
