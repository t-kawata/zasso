#!/usr/bin/env node
// [::TICKET::] PX-125: Abolish phasify --src-dir. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-125 --for-spec --no-implementation-order`.

/**
 * phasify-srcdir.test.js — Tests for phasify --src-dir abolition (always CWD).
 *
 * Covers C001-C005 contracts: --src-dir flag removal, always-CWD source marker
 * rewrite, find end-to-end marker re-rewrite, Step 9 documentation, and test
 * regression (no --src-dir reference remains).
 *
 * @verifies C001
 * @verifies C002
 * @verifies C003
 * @verifies C004
 * @verifies C005
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

// [::TICKET::] PX-125, PX-126, PX-127 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-125|PX-126|PX-127) --for-spec --no-implementation-order`.
function assert(condition, message) {
  if (condition) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + '\n'); }
}

// [::TICKET::] PX-125, PX-126, PX-127 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-125|PX-126|PX-127) --for-spec --no-implementation-order`.
function assertStrictEqual(actual, expected, message) {
  if (actual === expected) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + '\n'); }
}

process.stdout.write('\n━━━ phasify-srcdir.test.js ━━━\n\n');

let parseArguments;
let rewriteOutputStubKeys;
try {
  const mod = require('../../scripts/rfc-graph/phasify-omissions');
  parseArguments = mod.parseArguments;
  rewriteOutputStubKeys = mod.rewriteOutputStubKeys;
} catch (e) {
  failed++;
  process.stdout.write('  ✗ Failed to load phasify-omissions.js: ' + e.message + '\n\n');
  process.stdout.write('Passed: ' + passed + '\nFailed: ' + failed + '\n\n');
  process.exit(1);
}

// ======================================================================
// C001: --src-dir flag removal

(function testC001NoSrcDirOption() {
  const opts = parseArguments(['--graph=G', '--omissions=O', '--tickets=T', '--src-dir=/tmp']);
  assertStrictEqual(opts.srcDir, undefined, 'C001: --src-dir arg no longer parsed into opts.srcDir');
})();

// ======================================================================
// C002/C003: always-CWD source marker rewrite

(function testC002C003RewritesSourceMarkersInCwd() {
  const tmpFile = '_px125_marker.rs';
  const absTmp = path.resolve(tmpFile);
  try {
    fs.writeFileSync(absTmp, '// [::STUB::] P0-1: -- Vendor lib\n');
    const output = {
      phases: [{
        id: 6,
        tickets: [{
          id: 1,
          phaseId: 6,
          stubs: [{ file: tmpFile, line: 1, content: '[::STUB::] P0-1: -- Vendor lib' }]
        }]
      }]
    };
    rewriteOutputStubKeys(output);
    const rewritten = fs.readFileSync(absTmp, 'utf8');
    assert(rewritten.includes('[::STUB::] P6-1'), 'C002: source marker rewritten to duplicate key');
    assert(rewritten.includes('P6-1'), 'C003: marker references the active duplicate key');
  } finally {
    try { fs.unlinkSync(absTmp); } catch (e) { /* ignore */ }
  }
})();

// ======================================================================
// C004: find-omissions.md Step 9 documentation

(function testC004Step9NoSrcDirOption() {
// [::TICKET::] PX-142 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-142 --for-spec --no-implementation-order`.
  const md = fs.readFileSync(path.resolve(__dirname, '../../commands/find-omissions.md'), 'utf8');
  const step9 = md.slice(md.indexOf('# Step 9'), md.indexOf('# Step 10'));
  assert(!step9.includes('--src-dir'), 'C004: Step 9 no longer mentions --src-dir as an option');
  assert(step9.includes('current directory') || step9.includes('CWD'), 'C004: Step 9 states CWD is always used');
})();

// ======================================================================
// C005: test regression — no --src-dir reference remains

(function testC005TestsNoSrcDirReference() {
// [::TICKET::] PX-142 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-142 --for-spec --no-implementation-order`.
  const t1 = fs.readFileSync(path.resolve(__dirname, '../../scripts/rfc-graph/phasify-omissions.test.js'), 'utf8');
  const t2 = fs.readFileSync(path.resolve(__dirname, '../../scripts/tickets/tests/phasify-key-rewrite.test.js'), 'utf8');
  assert(!t1.includes('--src-dir') && !t2.includes('--src-dir'), 'C005: phasify tests updated to always-CWD behavior');
})();

// ======================================================================
// PX-142 Defect 2: line-less stubs fall back to plan-text marker location

(function testPX142Defect2LineLessFallback() {
// [::TICKET::] PX-142 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-142 --for-spec --no-implementation-order`.
  const tmpFile = '_px142_marker_noline.rs';
  const absTmp = path.resolve(tmpFile);
  try {
    fs.writeFileSync(absTmp, '// [::STUB::] P0-1: -- Vendor lib\n');
    const output = {
      phases: [{
        id: 6,
        tickets: [{
          id: 1,
          phaseId: 6,
          // No `line` — the rewrite must locate the marker via its plan text.
          stubs: [{ file: tmpFile, content: '[::STUB::] P0-1: -- Vendor lib' }]
        }]
      }]
    };
    rewriteOutputStubKeys(output);
    const rewritten = fs.readFileSync(absTmp, 'utf8');
    assert(rewritten.includes('[::STUB::] P6-1'), 'PX142/D2: line-less stub rewritten via plan-text fallback');
  } finally {
    try { fs.unlinkSync(absTmp); } catch (e) { /* ignore */ }
  }
})();

// ======================================================================
// PX-142 Defect 2: leftover old-key marker triggers an explicit failure

(function testPX142Defect2SelfVerificationFailsLoudly() {
// [::TICKET::] PX-142 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-142 --for-spec --no-implementation-order`.
  const tmpFile = '_px142_marker_selfcheck.rs';
  const absTmp = path.resolve(tmpFile);
  try {
    // The stub points at line 2, whose marker carries a DIFFERENT key (P9-9),
    // so rewriteSourceMarkerLines cannot rewrite it and the self-verification
    // must fail loudly instead of silently accepting the old key.
    fs.writeFileSync(absTmp, 'line one\n// [::STUB::] P9-9: -- Something else\n');
    const output = {
      phases: [{
        id: 6,
        tickets: [{
          id: 1,
          phaseId: 6,
          stubs: [{ file: tmpFile, line: 2, content: '[::STUB::] P0-1: -- Vendor lib' }]
        }]
      }]
    };
    let threw = false;
    try {
      rewriteOutputStubKeys(output);
    } catch (e) {
      threw = true;
    }
    assert(threw, 'PX142/D2: self-verification fails loudly when a marker was not rewritten');
  } finally {
    try { fs.unlinkSync(absTmp); } catch (e) { /* ignore */ }
  }
})();

// ======================================================================
// Summary

process.stdout.write('\nPassed: ' + passed + '\nFailed: ' + failed + '\n\n');
if (failed > 0) process.exit(1);
