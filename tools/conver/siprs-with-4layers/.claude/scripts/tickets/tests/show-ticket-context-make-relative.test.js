#!/usr/bin/env node

/**
 * show-ticket-context-make-relative.test.js — makeRelative path shortening
 *
 * Verifies the display-path shortening rules of show-ticket-context.js:
 *   1. If absPath passes through a real `src` directory, keep only the part
 *      from `src` onwards (e.g. .../crates/siprs/src/runtime/command.rs
 *      → src/runtime/command.rs).
 *   2. If absPath lives inside the user's home directory, prefix it with `~`.
 *   3. Paths already inside `base` stay relative to `base` (existing behavior).
 *   4. Paths that cannot be shortened keep their absolute form (existing behavior).
 *   5. A `src` segment that is not a real directory (a file, or a path that
 *      does not exist on disk) does not trigger rule 1.
 *
 * Run: node .claude/scripts/tickets/tests/show-ticket-context-make-relative.test.js
 */

const path = require('path');
const os = require('os');
const fs = require('fs');

const scriptPath = path.resolve(__dirname, '..', 'show-ticket-context.js');
const { makeRelative } = require(scriptPath);

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + '\n'); }
}

function assertEq(actual, expected, message) {
  const ok = actual === expected;
  if (ok) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + '\n'); }
}

console.log('\n━━━ show-ticket-context-make-relative.test.js — RED PHASE ━━━\n');

const home = os.homedir();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mkrel-'));
const projectDir = path.join(tmpDir, 'repo');
const srcDir = path.join(projectDir, 'crates', 'siprs', 'src', 'runtime');
fs.mkdirSync(srcDir, { recursive: true });
fs.mkdirSync(path.join(projectDir, 'crates', 'other'), { recursive: true });
fs.writeFileSync(path.join(projectDir, 'crates', 'other', 'src'), 'a file named src, not a directory');
fs.writeFileSync(path.join(projectDir, 'README.md'), 'fixture');

try {
  // ---- Rule 1: real src directory → keep from src onwards ----
  (function () {
    const absPath = path.join(srcDir, 'command.rs');
    const expected = path.join('src', 'runtime', 'command.rs');
    assertEq(makeRelative(absPath, projectDir), expected,
      'shortens a path under a real src directory to start at src');
  })();

  // ---- Rule 2: home-directory prefix → ~ ----
  (function () {
    const underHome = path.join(home, 'shyme', 'zasso', 'tools', 'conver', 'Tickets.json');
    const expected = path.join('~', 'shyme', 'zasso', 'tools', 'conver', 'Tickets.json');
    assertEq(makeRelative(underHome, projectDir), expected,
      'replaces the home-directory prefix with ~');
    assertEq(makeRelative(home, projectDir), '~',
      'returns ~ when absPath equals the home directory');
  })();

  // ---- Rule 3: path inside base stays relative to base ----
  (function () {
    assertEq(makeRelative(path.join(projectDir, 'README.md'), projectDir), 'README.md',
      'keeps a path inside base relative to base');
  })();

  // ---- Rule 4: unshortenable path keeps its absolute form ----
  (function () {
    const outside = path.join(path.parse(home).root, 'outside-mkrel', 'file.ts');
    assertEq(makeRelative(outside, projectDir), outside,
      'keeps the absolute form when no shortening rule applies');
  })();

  // ---- Rule 5: a src segment that is not a directory does not trigger rule 1 ----
  (function () {
    const underFileSrc = path.join(projectDir, 'crates', 'other', 'src', 'helper.rs');
    assertEq(makeRelative(underFileSrc, projectDir), path.join('crates', 'other', 'src', 'helper.rs'),
      'does not shorten through a src segment that is actually a file');
  })();

  (function () {
    // planned path whose src directory does not exist yet
    const planned = path.join(projectDir, 'crates', 'future', 'src', 'planned.rs');
    assertEq(makeRelative(planned, projectDir), path.join('crates', 'future', 'src', 'planned.rs'),
      'does not shorten through a src segment that does not exist on disk');
  })();
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log('\n━━━ Summary ━━━');
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);
if (failed > 0) process.exit(1);
