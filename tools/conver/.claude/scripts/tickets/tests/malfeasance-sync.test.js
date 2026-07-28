#!/usr/bin/env node
// [::TICKET::] PX-82: test file for syncMalfeasance + lying comment fix

/**
 * malfeasance-sync.test.js — Tests for PX-82
 *
 * Covers C001 (lying comment removal, invariant) and
 * C002 (Malfeasance.json ↔ targetCrimes sync).
 *
 * Red phase: all tests should fail before implementation.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

let passed = 0;
let failed = 0;

// [::TICKET::] PX-82, PX-83 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-82|PX-83) --for-spec --no-implementation-order`.
function assert(condition, message) {
  if (condition) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + '\n'); }
}

// [::TICKET::] PX-82, PX-83 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-82|PX-83) --for-spec --no-implementation-order`.
function assertStrictEqual(actual, expected, message) {
  if (actual === expected) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + '\n'); }
}

console.log('\n━━━ malfeasance-sync.test.js (PX-82) — RED PHASE ━━━\n');

// ======================================================================
// C001 — Lying comment removal
// ======================================================================

console.log('## C001 — Lying comment removal\n');

(function () {
  // C001-Postcondition: After fix, the lying comment is removed
  const scriptPath = path.resolve(__dirname, '..', 'validate-ticket-targets.js');
  const content = fs.readFileSync(scriptPath, 'utf8');
  const hasLie = content.includes('Also invokes existing verify-make-contracts');
  // RED: this fails because the comment still exists
  assert(hasLie === false, 'C001-Postcondition: lying comment removed from validate-ticket-targets.js');
})();

(function () {
  // C001-Invariant: validateTargets() return shape unchanged
  try {
    const { validateTargets } = require('../validate-ticket-targets');
    const ticketsData = {
      phases: [{ phaseId: -1, tickets: [{ id: 82, phaseId: -1, targetStubs: 'verified_empty', targetCrimes: 'verified_empty' }] }]
    };
    const result = validateTargets(ticketsData, 'PX-82');
    assert(result.valid === true, 'C001-Invariant: validateTargets returns valid=true');
    assert(result.existingScriptsCalled === undefined, 'C001-Invariant: existingScriptsCalled NOT in return object');
    assert(Array.isArray(result.checks), 'C001-Invariant: checks array is present');
  } catch (e) {
    assert(false, 'C001-Invariant: no exception — ' + e.message);
  }
})();

// ======================================================================
// C002 — Malfeasance.json ↔ targetCrimes sync
// ======================================================================

console.log('\n## C002 — Malfeasance sync\n');

(function () {
  // C002-Postcondition: syncMalfeasance creates matching Malfeasance records
  let syncMalfeasance;
  try {
    syncMalfeasance = require('../../lib/malfeasance-utils').syncMalfeasance;
  } catch (e) {
    // syncMalfeasance doesn't exist yet — that's expected for Red
    assert(false, 'C002-Postcondition: syncMalfeasance function exists');
    return;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-test-'));
  const ticketsData = {
    phases: [{
      phaseId: -1, tickets: [{
        id: 99, status: 'started',
        targetStubs: 'verified_empty',
        targetCrimes: [
          { id: 'TC-001', file: 'test.rs', line: 10, markerText: '// [::STUB::] PX-99: fix me', contracts: [], deferredTo: null, status: 'pending' }
        ],
        phaseId: -1
      }]
    }]
  };

  const result = syncMalfeasance(ticketsData, 'PX-99', tmpDir);
  assert(result !== undefined, 'C002-Postcondition: syncMalfeasance returns a result');
  assert(typeof result.added === 'number', 'C002-Postcondition: result has added count');

  // Cleanup
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
})();

(function () {
  // C002-Error: syncMalfeasance handles empty targetCrimes array (no-op)
  let syncMalfeasance;
  try {
    syncMalfeasance = require('../../lib/malfeasance-utils').syncMalfeasance;
  } catch (e) {
    assert(false, 'C002-Error: syncMalfeasance function exists');
    return;
  }

  const ticketsData = {
    phases: [{ phaseId: -1, tickets: [{ id: 99, phaseId: -1, targetStubs: 'verified_empty', targetCrimes: [] }] }]
  };

  const result = syncMalfeasance(ticketsData, 'PX-99', '/tmp');
  assert(result !== undefined, 'C002-Error: empty targetCrimes returns a result');
  assert(result.added === 0, 'C002-Error: empty targetCrimes adds 0 records');
})();

(function () {
  // C002-Error: syncMalfeasance handles verified_empty targetCrimes (no-op)
  let syncMalfeasance;
  try {
    syncMalfeasance = require('../../lib/malfeasance-utils').syncMalfeasance;
  } catch (e) {
    assert(false, 'C002-Error: syncMalfeasance function exists');
    return;
  }

  const ticketsData = {
    phases: [{ phaseId: -1, tickets: [{ id: 99, phaseId: -1, targetStubs: 'verified_empty', targetCrimes: 'verified_empty' }] }]
  };

  const result = syncMalfeasance(ticketsData, 'PX-99', '/tmp');
  assert(result !== undefined, 'C002-Error: verified_empty returns a result');
  assert(result.added === 0, 'C002-Error: verified_empty adds 0 records');
})();

(function () {
  // C002-Invariant: syncMalfeasance is idempotent (no duplicates after second call)
  let syncMalfeasance;
  try {
    syncMalfeasance = require('../../lib/malfeasance-utils').syncMalfeasance;
  } catch (e) {
    assert(false, 'C002-Invariant: syncMalfeasance function exists');
    return;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-idem-'));
  const ticketsData = {
    phases: [{
      phaseId: -1, tickets: [{
        id: 99, status: 'started',
        targetStubs: 'verified_empty',
        targetCrimes: [
          { id: 'TC-001', file: 'dup.rs', line: 5, markerText: '// [::STUB::] PX-99: dup test', contracts: [], deferredTo: null, status: 'pending' }
        ],
        phaseId: -1
      }]
    }]
  };

  const r1 = syncMalfeasance(ticketsData, 'PX-99', tmpDir);
  const r2 = syncMalfeasance(ticketsData, 'PX-99', tmpDir);
  assert(r1 !== undefined, 'C002-Invariant: first call returns result');
  assert(r2 !== undefined, 'C002-Invariant: second call returns result');
  assert(r1.added >= 1, 'C002-Invariant: first call added records');
  // Second call should add 0 (dedup)
  assert(r2.added === 0, 'C002-Invariant: second call adds 0 records (idempotent)');

  // Cleanup
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
})();

// ======================================================================
// Summary
// ======================================================================

console.log('\n━━━ Summary ━━━');
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);

if (failed > 0) process.exit(1);
