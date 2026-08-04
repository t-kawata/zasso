#!/usr/bin/env node

/**
 * find-all-stubs-format.test.js — Tests for the find-all-stubs.js output format
 *
 * Spec: find-all-stubs.js emits its result as 2-space-indented pretty JSON,
 * for both the success payload and the usage / directory-not-found errors.
 * The JSON structure ({ success, count, stubs[] } / { success, error }) is
 * unchanged so downstream parsers (create-tmp-omissions.js) keep working.
 *
 * Red phase: the formatting assertions fail because the script currently
 * emits single-line JSON via JSON.stringify(result).
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

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

console.log('\n━━━ find-all-stubs-format.test.js — TESTS ━━━\n');

const SCRIPT_PATH = path.resolve(__dirname, '..', 'review', 'find-all-stubs.js');

/**
 * Run find-all-stubs.js and capture stdout + exit code.
 * @param {string[]} args - Arguments passed to the script
 * @param {string} cwd - Working directory for the spawned process
 * @returns {{ stdout: string, exitCode: number }}
 */
function runScript(args, cwd) {
  const cmd = 'node ' + SCRIPT_PATH + (args.length ? ' ' + args.map(quote).join(' ') : '');
  let stdout = '';
  let exitCode = 0;
  try {
    stdout = execSync(cmd, { encoding: 'utf8', cwd });
  } catch (e) {
    stdout = e.stdout || '';
    exitCode = e.status || 1;
  }
  return { stdout, exitCode };
}

function quote(arg) {
  return "'" + String(arg).replace(/'/g, "'\\''") + "'";
}

/**
 * Parse stdout, or null when it is not valid JSON.
 * @param {string} stdout
 * @returns {any}
 */
function parseOutput(stdout) {
  try { return JSON.parse(stdout); } catch (_) { return null; }
}

/**
 * Assert the raw stdout is exactly the 2-space-indented canonical JSON of
 * its own parsed content. Fails for single-line output and for any
 * indentation other than 2 spaces.
 * @param {{ stdout: string, exitCode: number }} r
 */
function assertPrettyPrinted(r) {
  const parsed = parseOutput(r.stdout);
  assert(parsed !== null, 'stdout remains valid JSON');
  if (parsed === null) return;
  const canonical = JSON.stringify(parsed, null, 2) + '\n';
  assertStrictEqual(r.stdout, canonical, 'stdout is the 2-space-indented canonical form');
}

// ======================================================================
// Success path — a directory with a stub marker
// ======================================================================

console.log('## success — stubs found\n');

(function () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'find-stubs-'));
  try {
    const srcDir = path.join(dir, 'src');
    fs.mkdirSync(srcDir);
    fs.writeFileSync(path.join(srcDir, 'dummy.ts'), '// [::STUB::] PX-999: fixture stub\n', 'utf8');
    const r = runScript([dir], process.cwd());
    const parsed = parseOutput(r.stdout);
    assertStrictEqual(r.exitCode, 0, 'success: exits 0');
    assert(parsed && parsed.success === true, 'success: reports success');
    assert(parsed && parsed.count >= 1, 'success: reports at least one stub');
    assert(parsed && parsed.stubs.length === 1, 'success: stub list contains the fixture stub');
    assertPrettyPrinted(r);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
})();

// ======================================================================
// Error paths — usage error and missing directory
// ======================================================================

console.log('\n## errors — usage and missing directory\n');

(function () {
  const r = runScript([], process.cwd());
  const parsed = parseOutput(r.stdout);
  assertStrictEqual(r.exitCode, 1, 'no-args: exits 1');
  assert(parsed && parsed.success === false, 'no-args: reports failure');
  assertPrettyPrinted(r);
})();

(function () {
  const r = runScript(['/nonexistent/find-stubs-dir'], process.cwd());
  const parsed = parseOutput(r.stdout);
  assertStrictEqual(r.exitCode, 1, 'missing-dir: exits 1');
  assert(parsed && parsed.success === false, 'missing-dir: reports failure');
  assertPrettyPrinted(r);
})();

// ======================================================================
// Summary
// ======================================================================

console.log('\n━━━ Summary ━━━');
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);

if (failed > 0) process.exit(1);
