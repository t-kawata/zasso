#!/usr/bin/env node

/**
 * find-stubs-with-ticket-ref.test.js — Tests for the STUB-to-ticket-ref
 * filter script.
 *
 * Verifies that scanDirectory (via find-all-stubs) is correctly wrapped
 * and that the STUB_REF_RE pattern matches expected formats.
 */

const path = require('path');
const os = require('os');
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

console.log('\n━━━ find-stubs-with-ticket-ref.test.js — TESTS ━━━\n');

const { findAllStubs } = require('../review/find-stubs-with-ticket-ref');

// ======================================================================
// STUB_REF_RE matching — we test via findAllStubs on temp files
// ======================================================================

console.log('## find-all-stubs integration\n');

(function () {
  // Create temp dir with a file containing a STUB with ticket ref
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stub-ref-test-'));
  fs.writeFileSync(path.join(tmpDir, 'test.rs'),
    '// [::STUB::] PX-99: this will be resolved later\n' +
    'fn placeholder() {}\n',
    'utf8');

  const stubs = findAllStubs(tmpDir);
  assert(Array.isArray(stubs), 'findAllStubs returns an array');
  assert(stubs.length > 0, 'finds at least one stub');
  if (stubs.length > 0) {
    assert(typeof stubs[0].file === 'string', 'stub has file field');
    assert(typeof stubs[0].line === 'number', 'stub has line field');
    assert(typeof stubs[0].ticketRef === 'string', 'stub has ticketRef field');
    assert(stubs[0].ticketRef === 'PX-99', 'ticketRef is correctly extracted');
  }

  // Cleanup
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
})();

(function () {
  // STUB with MUST RESOLVE — no P-ticket ref, should NOT match
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stub-noref-'));
  fs.writeFileSync(path.join(tmpDir, 'test.rs'),
    '// [::STUB::] MUST RESOLVE: needs investigation\n',
    'utf8');

  const stubs = findAllStubs(tmpDir);
  assertStrictEqual(stubs.length, 0, 'MUST RESOLVE stubs are excluded (no ticket ref)');

  // Cleanup
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
})();

(function () {
  // Mixed: one file with ticket ref, one without
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stub-mixed-'));
  fs.writeFileSync(path.join(tmpDir, 'with_ref.rs'),
    '// [::STUB::] P0-1: will fix\n',
    'utf8');
  fs.writeFileSync(path.join(tmpDir, 'no_ref.rs'),
    '// [::STUB::] MUST RESOLVE: investigate\n',
    'utf8');

  const stubs = findAllStubs(tmpDir);
  assertStrictEqual(stubs.length, 1, 'only file with ticket ref is matched');
  assert(stubs[0].ticketRef === 'P0-1', 'ticketRef is P0-1');

  // Cleanup
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
})();

(function () {
  // P-format: P{phase}-{id} style
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stub-pfmt-'));
  fs.writeFileSync(path.join(tmpDir, 'test.rs'),
    '// [::STUB::] P5-3: needs SIP implementation\n',
    'utf8');

  const stubs = findAllStubs(tmpDir);
  assert(stubs.length > 0, 'P{phase}-{id} format matched');
  if (stubs.length > 0) {
    assertStrictEqual(stubs[0].ticketRef, 'P5-3', 'ticketRef is P5-3');
  }

  // Cleanup
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
})();

(function () {
  // No [::STUB::] at all in the directory
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stub-empty-'));
  fs.writeFileSync(path.join(tmpDir, 'clean.rs'),
    'fn working_code() {}\n', 'utf8');

  const stubs = findAllStubs(tmpDir);
  assertStrictEqual(stubs.length, 0, 'no STUB markers → empty result');

  // Cleanup
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
})();

// ======================================================================
// Content truncation
// ======================================================================

console.log('\n## content formatting\n');

(function () {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stub-long-'));
  const longContent = '// [::STUB::] PX-99: ' + 'x'.repeat(200);
  fs.writeFileSync(path.join(tmpDir, 'test.rs'), longContent + '\n', 'utf8');

  const stubs = findAllStubs(tmpDir);
  assert(stubs.length > 0, 'long content stub found');
  if (stubs.length > 0) {
    assert(stubs[0].content.length <= 120, 'content truncated to 120 chars');
  }

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
