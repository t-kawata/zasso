#!/usr/bin/env node

/**
 * scan-crimes-filter.test.js — Tests for the scan-crimes.sh --all flag
 *
 * Spec: scan-crimes.sh shows only open crimes by default; passing --all
 * shows every record regardless of status (open / resolved / false_positive).
 * The directory argument (used by resolve-ticket.md) must keep working.
 *
 * Red phase: the --all assertions fail because the current implementation
 * always passes the "open" filter to malfeasance-all.js.
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

console.log('\n━━━ scan-crimes-filter.test.js — TESTS ━━━\n');

const SCRIPT_PATH = path.resolve(__dirname, '..', 'scan-crimes.sh');

/**
 * Build a temp directory containing a Malfeasance.json fixture with
 * one record of each status: open, resolved, false_positive.
 * @returns {string} Absolute path of the temp directory
 */
function createFixtureDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-crimes-'));
  const fixture = {
    version: 1,
    records: [
      {
        id: 1,
        file: 'src/a.ts',
        line: 10,
        description: 'open crime',
        detected_at: '2026-08-04T12:00:00.000Z',
        status: 'open',
      },
      {
        id: 2,
        file: 'src/b.ts',
        line: 20,
        description: 'resolved crime',
        detected_at: '2026-08-04T12:00:00.000Z',
        status: 'resolved',
        resolved_at: '2026-08-04T12:30:00.000Z',
        resolved_by_ticket: 123,
      },
      {
        id: 3,
        file: 'src/c.ts',
        line: 30,
        description: 'false positive crime',
        detected_at: '2026-08-04T12:00:00.000Z',
        status: 'false_positive',
      },
    ],
  };
  fs.writeFileSync(path.join(dir, 'Malfeasance.json'), JSON.stringify(fixture, null, 2) + '\n', 'utf8');
  return dir;
}

/**
 * Run scan-crimes.sh in a controlled cwd and capture stdout + exit code.
 * @param {string[]} args - Arguments passed to the script
 * @param {string} cwd - Working directory for the spawned process
 * @returns {{ stdout: string, exitCode: number }}
 */
function runScanCrimes(args, cwd) {
  const cmd = 'bash ' + SCRIPT_PATH + (args.length ? ' ' + args.map(quote).join(' ') : '');
  let stdout = '';
  let exitCode = 0;
  try {
    stdout = execSync(cmd, { encoding: 'utf8', cwd, shell: '/bin/bash' });
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
 * Parse the script's JSON output.
 * @param {string} stdout
 * @returns {any} Parsed object, or null when stdout is not valid JSON
 */
function parseOutput(stdout) {
  try { return JSON.parse(stdout); } catch (_) { return null; }
}

/**
 * Extract the set of statuses present in a parsed result's records.
 * @param {any} parsed
 * @returns {string[]} Sorted unique statuses
 */
function statusSet(parsed) {
  if (!parsed || !Array.isArray(parsed.records)) return [];
  return [...new Set(parsed.records.map(r => r.status))].sort();
}

// ======================================================================
// Default behavior: no --all → only open crimes
// ======================================================================

console.log('## default (no --all) — open crimes only\n');

(function () {
  const dir = createFixtureDir();
  try {
    const r = runScanCrimes([], dir);
    const parsed = parseOutput(r.stdout);
    assertStrictEqual(r.exitCode, 0, 'no-args: exits 0');
    assert(parsed && parsed.success === true, 'no-args: reports success');
    assertStrictEqual(parsed && parsed.count, 1, 'no-args: shows only the single open crime');
    assertStrictEqual(JSON.stringify(statusSet(parsed)), JSON.stringify(['open']), 'no-args: every shown record is open');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
})();

(function () {
  const dir = createFixtureDir();
  try {
    const r = runScanCrimes([dir], process.cwd());
    const parsed = parseOutput(r.stdout);
    assertStrictEqual(r.exitCode, 0, 'explicit dir: exits 0');
    assertStrictEqual(parsed && parsed.count, 1, 'explicit dir: shows only the single open crime');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
})();

// ======================================================================
// --all behavior: every record is shown
// ======================================================================

console.log('\n## --all — every record shown\n');

(function () {
  const dir = createFixtureDir();
  try {
    const r = runScanCrimes(['--all'], dir);
    const parsed = parseOutput(r.stdout);
    assertStrictEqual(r.exitCode, 0, '--all: exits 0');
    assert(parsed && parsed.success === true, '--all: reports success');
    assertStrictEqual(parsed && parsed.count, 3, '--all: shows open + resolved + false_positive');
    assertStrictEqual(JSON.stringify(statusSet(parsed)), JSON.stringify(['false_positive', 'open', 'resolved']), '--all: includes every status');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
})();

(function () {
  const dir = createFixtureDir();
  try {
    const r = runScanCrimes([dir, '--all'], process.cwd());
    const parsed = parseOutput(r.stdout);
    assertStrictEqual(r.exitCode, 0, 'dir + --all: exits 0');
    assertStrictEqual(parsed && parsed.count, 3, 'dir + --all: shows every record in the target directory');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
})();

(function () {
  const dir = createFixtureDir();
  try {
    const r = runScanCrimes(['--all', dir], process.cwd());
    const parsed = parseOutput(r.stdout);
    assertStrictEqual(r.exitCode, 0, '--all + dir (flag first): exits 0');
    assertStrictEqual(parsed && parsed.count, 3, '--all + dir (flag first): shows every record');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
})();

// ======================================================================
// Summary
// ======================================================================

console.log('\n━━━ Summary ━━━');
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);

if (failed > 0) process.exit(1);
