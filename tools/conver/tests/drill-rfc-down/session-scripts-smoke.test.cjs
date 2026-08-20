/**
 * session-scripts-smoke.test.cjs — Smoke test for the relocated drill session scripts
 *
 * PX-157 Phase 2 verifies that $DRILL_DIR is self-contained: the 6 session
 * management scripts relocated from grill-me-for-rfc load as ESM under the new
 * `{"type":"module"}` package.json, and preflight runs as CommonJS (preflight.cjs).
 *
 * RED at make time: the relocated scripts are absent from $DRILL_DIR, so every
 * spawnSync fails with a load error (Cannot find module) — the test fails red
 * until the relocation lands (GREEN).
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const DRILL_DIR = path.resolve(__dirname, '../../.claude/scripts/drill-rfc-down');

const RELOCATED_SCRIPTS = [
  'update-tree.js',
  'update-status.js',
  'session-status.js',
  'validate-question-format.js',
  'generate-checklist.js',
  'check-all-schema.js',
  'tree-query.js',
];

// Signatures that indicate the module failed to LOAD (as opposed to a graceful
// argument-usage error). Any of these in stderr means the ESM file does not
// parse/load in the new package context.
const LOAD_FAILURE_PATTERN = /SyntaxError|Cannot use import|Cannot find module|MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND|Unexpected token/;

let tmpDir;

before(() => {
  // Isolated cwd so no-arg spawns (e.g. generate-checklist.js defaulting to
  // "./") can never read or mutate the repository's own session files.
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drill-smoke-'));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('relocated drill session scripts', () => {
  for (const name of RELOCATED_SCRIPTS) {
    it(`${name} exists and loads as ESM (fails gracefully with no args)`, () => {
      const script = path.join(DRILL_DIR, name);
      assert.ok(fs.existsSync(script), `${name} exists in $DRILL_DIR`);
      const res = spawnSync(process.execPath, [script], { encoding: 'utf8', cwd: tmpDir });
      // A graceful argument error exits 0 or 1 depending on the script's arg
      // handling; a load failure would print a distinguishing signature to
      // stderr regardless of exit code. Assert the load-failure signature is
      // absent — that is the real signal that the ESM module loaded.
      assert.ok(res.status === 0 || res.status === 1, `${name} exits 0 or 1 on missing args (got ${res.status})`);
      assert.doesNotMatch(res.stderr, LOAD_FAILURE_PATTERN, `${name} must not fail at load time`);
    });
  }

  it('check-all-schema.js exports validateAll as a function (importable)', async () => {
    const mod = await import(pathToFileURL(path.join(DRILL_DIR, 'check-all-schema.js')).href);
    assert.equal(typeof mod.validateAll, 'function');
  });
});
