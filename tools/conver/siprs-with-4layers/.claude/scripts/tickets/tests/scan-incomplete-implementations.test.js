#!/usr/bin/env node

/**
 * scan-incomplete-implementations.test.js — Tests for the incomplete
 * implementation scanner script.
 *
 * Covers scanFile logic (the core scanning function) and
 * verifies that all expected patterns are detected:
 *   - todo!(), unimplemented!(), panic!()
 *   - TODO, FIXME, HACK, XXX
 *   - #[allow(...)], #[deny(...)]
 *   - Lines with [::STUB::] are excluded
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

console.log('\n━━━ scan-incomplete-implementations.test.js — TESTS ━━━\n');

const { scanFile, PATTERN_GROUPS } = require('../scan-incomplete-implementations');

// ======================================================================
// Test scanFile with various patterns
// ======================================================================

console.log('## scanFile — pattern detection\n');

(function () {
  // todo!() detection
  const content = 'fn old_code() { todo!() }';
  const findings = scanFile('/tmp/test.rs', 'all', content);
  const hasTodo = findings.some(f => f.pattern === 'todo!()');
  assert(hasTodo, 'detects todo!() pattern');
  assert(findings.length > 0, 'todo!() produces findings');
})();

(function () {
  // unimplemented!() detection
  const content = 'fn placeholder() { unimplemented!() }';
  const findings = scanFile('/tmp/test.rs', 'all', content);
  assert(findings.some(f => f.pattern === 'unimplemented!()'), 'detects unimplemented!() pattern');
})();

(function () {
  // TODO comment detection
  const content = '// TODO: implement this later';
  const findings = scanFile('/tmp/test.rs', 'all', content);
  assert(findings.some(f => f.pattern === 'TODO'), 'detects TODO comment');
})();

(function () {
  // FIXME comment detection
  const content = '// FIXME: this is broken';
  const findings = scanFile('/tmp/test.rs', 'all', content);
  assert(findings.some(f => f.pattern === 'FIXME'), 'detects FIXME comment');
})();

(function () {
  // #[allow] detection
  const content = '#[allow(dead_code)]';
  const findings = scanFile('/tmp/test.rs', 'all', content);
  assert(findings.some(f => f.pattern === '#[allow()]'), 'detects #[allow()] pattern');
})();

(function () {
  // #[deny] detection
  const content = '#[deny(unsafe_code)]';
  const findings = scanFile('/tmp/test.rs', 'all', content);
  assert(findings.some(f => f.pattern === '#[deny()]'), 'detects #[deny()] pattern');
})();

// ======================================================================
// STUB exclusion — lines with [::STUB::] must NOT appear in results
// ======================================================================

console.log('\n## scanFile — STUB exclusion\n');

(function () {
  const content = 'fn placeholder() { todo!() } // [::STUB::] PX-99: fix later';
  const findings = scanFile('/tmp/test.rs', 'all', content);
  assertStrictEqual(findings.length, 0, 'lines with [::STUB::] are excluded');
})();

(function () {
  // Mixed: one line with STUB, one without
  const content = [
    'fn fixed() { ok() } // [::STUB::] PX-99: already tracked',
    'fn broken() { todo!() }',
  ].join('\n');
  const findings = scanFile('/tmp/test.rs', 'all', content);
  assert(findings.length === 1, 'STUB line excluded, non-STUB line still detected');
  assert(findings[0].line === 2, 'only the non-STUB line is reported');
})();

// ======================================================================
// Mode filtering
// ======================================================================

console.log('\n## scanFile — mode filtering\n');

(function () {
  // mode=stubs: should detect TODO but NOT #[allow]
  const content = [
    '// TODO: implement',
    '#[allow(dead_code)]',
  ].join('\n');
  const stubsOnly = scanFile('/tmp/test.rs', 'stubs', content);
  assert(stubsOnly.some(f => f.pattern === 'TODO'), 'stubs mode: detects TODO');
  assert(!stubsOnly.some(f => f.pattern === '#[allow()]'), 'stubs mode: excludes #[allow()]');
})();

(function () {
  // mode=suppress: should detect #[allow] but NOT TODO
  const content = [
    '// TODO: implement',
    '#[allow(dead_code)]',
  ].join('\n');
  const suppressOnly = scanFile('/tmp/test.rs', 'suppress', content);
  assert(suppressOnly.some(f => f.pattern === '#[allow()]'), 'suppress mode: detects #[allow()]');
  assert(!suppressOnly.some(f => f.pattern === 'TODO'), 'suppress mode: excludes TODO');
})();

// ======================================================================
// Edge cases
// ======================================================================

console.log('\n## scanFile — edge cases\n');

(function () {
  // Empty file
  const findings = scanFile('/tmp/empty.rs', 'all', '');
  assertStrictEqual(findings.length, 0, 'empty file produces no findings');
})();

(function () {
  // File with only STUB markers
  const content = '// [::STUB::] PX-99: stub\nfn placeholder() {}\n// [::STUB::] PX-88: another';
  const findings = scanFile('/tmp/stubonly.rs', 'all', content);
  assertStrictEqual(findings.length, 0, 'file with only STUB markers produces no findings');
})();

(function () {
  // Content truncated to 120 chars in output
  const longLine = '// TODO: ' + 'a'.repeat(200);
  const findings = scanFile('/tmp/long.rs', 'all', longLine);
  assert(findings.length > 0, 'long line produces finding');
  assert(findings[0].content.length <= 120, 'content truncated to 120 chars');
})();

// ======================================================================
// Summary
// ======================================================================

console.log('\n━━━ Summary ━━━');
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);

if (failed > 0) process.exit(1);
