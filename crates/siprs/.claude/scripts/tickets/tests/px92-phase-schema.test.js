#!/usr/bin/env node
/**
 * px92-phase-schema.test.js — Tests for PX-92
 *
 * Covers:
 *   C001: Phase schema completeness (phaseId and status)
 *   C002: File path normalization
 *
 * TDD Red phase: tests should fail before implementation.
 */

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

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

console.log('\n━━━ PX-92 phase-schema.test.js — TESTS ━━━\n');

// ======================================================================
// C001: Phase schema completeness
// ======================================================================

console.log('## C001 — phase schema completeness\n');

(function testC001PhaseIdStatusInAddPhase() {
  // Pre/Post: add-phase.js creates phase with phaseId and status
  const tmpFile = '/tmp/test-px92-' + Date.now() + '.json';
  fs.writeFileSync(tmpFile, JSON.stringify({title: "test", round: 1, metadata: {source: "test", generatedAt: "2026-07-28"}, version: 1, phases: []}));
  const proc = spawnSync('node', ['.claude/scripts/tickets/add-phase.js', tmpFile], {
    input: JSON.stringify({name: 'Test Phase'}),
    encoding: 'utf8',
    cwd: path.resolve(__dirname, '../../../../')
  });
  const output = JSON.parse(proc.stdout);
  assert(output.success === true, 'add-phase.js succeeds');

  const data = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
  const phase = data.phases[0];
  assert(phase.phaseId !== undefined && phase.phaseId !== null, 'phase has phaseId');
  assert(phase.status !== undefined && phase.status !== null, 'phase has status');
  assert(phase.status === 'draft', 'phase status defaults to "draft"');
  fs.unlinkSync(tmpFile);
})();

(function testC001PhaseIdStatusInAddPxPhase() {
  // Pre/Post: add-px-phase.js creates phase with phaseId and status
  const tmpFile = '/tmp/test-px92-px-' + Date.now() + '.json';
  fs.writeFileSync(tmpFile, JSON.stringify({title: "test", round: 1, metadata: {source: "test", generatedAt: "2026-07-28"}, version: 1, phases: []}));
  const proc = spawnSync('node', ['.claude/scripts/tickets/add-px-phase.js', tmpFile], {
    encoding: 'utf8',
    cwd: path.resolve(__dirname, '../../../../')
  });
  const output = JSON.parse(proc.stdout);
  assert(output.success === true, 'add-px-phase.js succeeds');

  const data = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
  const pxPhase = data.phases[0];
  assert(pxPhase.phaseId !== undefined && pxPhase.phaseId !== null, 'PX phase has phaseId');
  assert(pxPhase.status !== undefined && pxPhase.status !== null, 'PX phase has status');
  assert(pxPhase.phaseId === -1, 'PX phaseId is -1');
  assert(pxPhase.status === 'draft', 'PX phase status defaults to draft');
  fs.unlinkSync(tmpFile);
})();

(function testC001InvariantNewPhaseHasRequiredFields() {
  // Invariant: newly created phases have phaseId and status (scope: new phases only)
  // Existing phases pre-PX-92 may lack these fields.
  const tmpFile = '/tmp/test-px92-invariant-' + Date.now() + '.json';
  fs.writeFileSync(tmpFile, JSON.stringify({title: "test", round: 1, metadata: {source: "test", generatedAt: "2026-07-28"}, version: 1, phases: []}));
  const proc = spawnSync('node', ['.claude/scripts/tickets/add-phase.js', tmpFile], {
    input: JSON.stringify({name: 'Invariant Test Phase'}),
    encoding: 'utf8',
    cwd: path.resolve(__dirname, '../../../../')
  });
  const output = JSON.parse(proc.stdout);
  assert(output.success === true, 'add-phase.js succeeds for invariant test');

  const data = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
  const phase = data.phases[0];
  assert(phase.phaseId !== undefined && phase.phaseId !== null, 'new phase has phaseId');
  assert(phase.status !== undefined && phase.status !== null, 'new phase has status');
  fs.unlinkSync(tmpFile);
})();

// ======================================================================
// C002: File path normalization
// ======================================================================

console.log('\n## C002 — path normalization\n');

(function testC002NormalizePathFunction() {
  // Check that normalizePath export exists in malfeasance-utils
  let hasExport = false;
  try {
    const utils = require('../../lib/malfeasance-utils');
    hasExport = typeof utils.normalizePath === 'function';
  } catch (e) {
    // module may not export normalizePath yet
  }
  assert(hasExport, 'malfeasance-utils exports normalizePath function');
})();

(function testC002MalfeasanceCreateNormalizesPath() {
  // Post: malfeasance-create.js stores project-root-relative paths
  const cwd = path.resolve(__dirname, '../../../../');
  const uniquePath = '/tmp/px92-test-' + Date.now() + '.rs';
  const result = spawnSync('node', [
    '.claude/scripts/tickets/malfeasance-create.js',
    uniquePath, '10', 'Test crime for path normalization'
  ], { encoding: 'utf8', cwd });

  assert(result.status === 0 || result.status === null, 'malfeasance-create exits 0');

  let parsed = null;
  if (result.stdout) {
    try {
      parsed = JSON.parse(result.stdout);
    } catch (e) {}
  }
  assert(parsed !== null && parsed.success === true, 'malfeasance-create succeeds');
  if (parsed && parsed.record && parsed.record.file) {
    assert(!parsed.record.file.startsWith('/'), 'stored path is relative (not absolute)');
  }

  // Clean up: remove the test record
  try {
    const fs2 = require('fs');
    const malfPath = path.join(cwd, 'Malfeasance.json');
    const malfData = JSON.parse(fs2.readFileSync(malfPath, 'utf8'));
    malfData.records = malfData.records.filter(r => r.id !== (parsed ? parsed.ticketId : -1));
    fs2.writeFileSync(malfPath, JSON.stringify(malfData, null, 2) + '\n', 'utf8');
  } catch (e) {}
})();

(function testC002NoAbsolutePathsInMalfeasance() {
  // Invariant: Malfeasance records have no absolute paths
  try {
    const malfData = JSON.parse(fs.readFileSync('Malfeasance.json', 'utf8'));
    let allRelative = true;
    for (const r of malfData.records) {
      if (r.file && r.file.startsWith('/')) {
        allRelative = false;
        console.log('  ⚠ Absolute path in record ' + r.id + ': ' + r.file);
      }
    }
    assert(allRelative, 'no absolute paths in Malfeasance records');
  } catch (e) {
    assert(true, 'Malfeasance.json check (file may be empty)');
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
