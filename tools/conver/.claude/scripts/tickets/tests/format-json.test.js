#!/usr/bin/env node

/**
 * format-json.test.js — Tests for the format-json.js stdin→stdout formatter
 *
 * Covers the formatter contract used by scan-crimes.sh:
 *   - valid JSON input is re-emitted as 2-space-indented canonical JSON
 *   - non-JSON / empty input passes through untouched
 *   - already-indented input is normalized to the 2-space canonical form
 */

const { execSync } = require('child_process');
const path = require('path');

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

console.log('\n━━━ format-json.test.js — TESTS ━━━\n');

const SCRIPT_PATH = path.resolve(__dirname, '..', 'format-json.js');

/**
 * Run format-json.js with the given stdin content.
 * @param {string} input - Content written to stdin
 * @returns {string} Raw stdout
 */
function runFormatter(input) {
  return execSync('node ' + SCRIPT_PATH, { input, encoding: 'utf8' });
}

// ======================================================================
// Valid JSON → 2-space pretty output
// ======================================================================

console.log('## valid JSON input\n');

(function () {
  const input = '{"success":true,"count":1,"records":[{"id":1,"status":"open"}]}';
  const out = runFormatter(input);
  const expected = JSON.stringify(JSON.parse(input), null, 2) + '\n';
  assertStrictEqual(out, expected, 'single-line JSON is re-emitted as the 2-space canonical form');
})();

(function () {
  const input = '{"a":[1,{"b":2}]}';
  const out = runFormatter(input);
  assert(JSON.parse(out).a[1].b === 2, 'pretty output still parses to the original object');
})();

(function () {
  const input = JSON.stringify({ x: 1 }, null, 4); // already 4-space indented
  const out = runFormatter(input);
  const expected = JSON.stringify({ x: 1 }, null, 2) + '\n';
  assertStrictEqual(out, expected, 'already-indented JSON is normalized to the 2-space canonical form');
})();

// ======================================================================
// Non-JSON / empty input → passthrough
// ======================================================================

console.log('\n## non-JSON and empty input\n');

(function () {
  const input = 'not json at all';
  const out = runFormatter(input);
  assertStrictEqual(out, input, 'non-JSON input passes through untouched');
})();

(function () {
  const out = runFormatter('');
  assertStrictEqual(out, '', 'empty input produces empty output');
})();

// ======================================================================
// Summary
// ======================================================================

console.log('\n━━━ Summary ━━━');
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);

if (failed > 0) process.exit(1);
