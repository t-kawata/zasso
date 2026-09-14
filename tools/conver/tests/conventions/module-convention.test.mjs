// @verifies C001
// @verifies C002
/**
 * module-convention — the rule file states what the repository does, and the
 * filesystem is the authority it is checked against.
 *
 * Measured 2026-09-11, `.claude/rules/node.md` claimed four things the repository
 * contradicts: that the scripts tree is CommonJS (three of twelve trees declare
 * `module`), that ESM requires a `.mjs` extension (forty-six `.js` files sit under
 * `type: module` trees), that the test runner is `node tests/run-all.js` (no such
 * path exists), and that Node 18 is the floor (the runtime is 26 and an `engines`
 * field now declares 22). A reviewer reading only that file reported a convention
 * violation in fourteen correct files.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CONVENTION_RULE_PATH,
  DECIDED_BY,
  MODULE_SYSTEM,
  SCRIPT_ROOT,
  resolveModuleSystem,
  parseConventionTable,
  readNearestPackageType,
  scanScriptDirectories,
} from '../lib/module-convention.mjs';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A scratch tree whose ancestor declarations vary, so a case is independent of this repository. */
// [::TICKET::] PX-205, PX-206, PX-207 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-205|PX-206|PX-207) --for-spec --no-implementation-order`.
function makeDeclaredTree(files) {
  const root = mkdtempSync(join(tmpdir(), 'px205-convention-'));
  for (const [relative, contents] of Object.entries(files)) {
    const full = join(root, relative);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, contents);
  }
  return root;
}

// ---------------------------------------------------------------------------
// C001 — the resolver reads what Node reads
// ---------------------------------------------------------------------------

test('C001 the extension decides for .mjs and .cjs whatever any declaration says', () => {
  const root = makeDeclaredTree({ 'package.json': JSON.stringify({ type: 'commonjs' }) });

  assert.deepEqual(resolveModuleSystem(join(root, 'a.mjs')), { system: MODULE_SYSTEM.ESM, decidedBy: DECIDED_BY.EXTENSION });
  assert.deepEqual(resolveModuleSystem(join(root, 'a.cjs')), {
    system: MODULE_SYSTEM.COMMONJS,
    decidedBy: DECIDED_BY.EXTENSION,
  });
});

test('C001 a .js file resolves from the nearest ancestor declaration', () => {
  const root = makeDeclaredTree({
    'declared/package.json': JSON.stringify({ type: 'module' }),
    'declared/nested/a.js': 'export const a = 1;\n',
    'plain/package.json': JSON.stringify({ type: 'commonjs' }),
    'plain/b.js': 'module.exports = 1;\n',
  });

  assert.deepEqual(resolveModuleSystem(join(root, 'declared', 'nested', 'a.js')), {
    system: MODULE_SYSTEM.ESM,
    decidedBy: DECIDED_BY.PACKAGE_JSON,
  });
  assert.deepEqual(resolveModuleSystem(join(root, 'plain', 'b.js')), {
    system: MODULE_SYSTEM.COMMONJS,
    decidedBy: DECIDED_BY.PACKAGE_JSON,
  });
});

test('C001 a .js file with no ancestor declaration falls back to CommonJS', () => {
  const root = makeDeclaredTree({ 'a/b/c/deep.js': 'module.exports = 1;\n' });

  assert.equal(readNearestPackageType(join(root, 'a', 'b', 'c')), null);
  assert.deepEqual(resolveModuleSystem(join(root, 'a', 'b', 'c', 'deep.js')), {
    system: MODULE_SYSTEM.COMMONJS,
    decidedBy: DECIDED_BY.PACKAGE_JSON,
  });
});

test('C001 an unrecognised extension is unknown rather than assumed CommonJS', () => {
  const root = makeDeclaredTree({ 'x.ts': 'export {};\n', 'y.mts': 'export {};\n' });

  assert.equal(resolveModuleSystem(join(root, 'x.ts')).system, MODULE_SYSTEM.UNKNOWN);
  assert.equal(resolveModuleSystem(join(root, 'y.mts')).system, MODULE_SYSTEM.UNKNOWN);
});

test('C001 the resolver never reads file contents', () => {
  const root = makeDeclaredTree({
    'contradicting/package.json': JSON.stringify({ type: 'commonjs' }),
    'contradicting/sneaky.js': "import { readFileSync } from 'node:fs';\n",
  });

  assert.equal(
    resolveModuleSystem(join(root, 'contradicting', 'sneaky.js')).system,
    MODULE_SYSTEM.COMMONJS,
    'the declaration is the answer even where Node would load the file as ESM',
  );
});

// ---------------------------------------------------------------------------
// C002 — the document is checked against the filesystem, never the reverse
// ---------------------------------------------------------------------------

test('C002 the rule file states a per-directory table', () => {
  const rulePath = join(PROJECT_ROOT, CONVENTION_RULE_PATH);
  assert.equal(existsSync(rulePath), true, CONVENTION_RULE_PATH + ' must exist');

  const documented = parseConventionTable(readFileSync(rulePath, 'utf8'));
  assert.ok(Object.keys(documented).length > 0, 'the rule file must name directories and their module systems');
});

test('C002 the rule file and the filesystem agree on every script directory', () => {
  const documented = parseConventionTable(readFileSync(join(PROJECT_ROOT, CONVENTION_RULE_PATH), 'utf8'));
  const measured = scanScriptDirectories(join(PROJECT_ROOT, SCRIPT_ROOT));

  assert.ok(measured.length > 0, 'the scan must find script directories');
  for (const entry of measured) {
    assert.equal(
      documented[entry.dir],
      entry.moduleSystem,
      `${entry.dir} is documented as ${documented[entry.dir]} and resolves to ${entry.moduleSystem}`,
    );
    assert.deepEqual(entry.nonConforming, [], `${entry.dir} must use one module system throughout`);
  }
  assert.deepEqual(
    Object.keys(documented).sort(),
    measured.map((entry) => entry.dir).sort(),
    'the document and the filesystem must name the same directories',
  );
});

test('C002 a contradiction is reported against the file, not silently accepted', () => {
  const root = makeDeclaredTree({
    'contradicting/package.json': JSON.stringify({ type: 'commonjs' }),
    'contradicting/a.js': "import x from 'y';\n",
    'contradicting/b.js': 'module.exports = 1;\n',
  });

  const [entry] = scanScriptDirectories(root);
  assert.equal(entry.moduleSystem, MODULE_SYSTEM.COMMONJS);
  assert.equal(entry.conforms, false);
  assert.deepEqual(entry.nonConforming, [join(root, 'contradicting', 'a.js')]);
});

test('C002 a directory whose files agree is reported conforming', () => {
  const root = makeDeclaredTree({
    'agreeing/package.json': JSON.stringify({ type: 'module' }),
    'agreeing/a.js': 'export const a = 1;\n',
    'agreeing/b.js': 'export const b = 2;\n',
  });

  const [entry] = scanScriptDirectories(root);
  assert.equal(entry.conforms, true);
  assert.deepEqual(entry.nonConforming, []);
  assert.equal(entry.fileCount, 2);
});

test('C002 a directory with no declaration inherits rather than being reported undeclared', () => {
  const root = makeDeclaredTree({
    'parent/package.json': JSON.stringify({ type: 'module' }),
    'parent/child/a.js': 'export const a = 1;\n',
  });

  // One entry per script directory, measuring every file beneath it: a rule table
  // naming each nested folder would be one nobody maintains, and the fixture's
  // nested file is still measured and still attributed to the declaration above it.
  const entries = scanScriptDirectories(root);
  assert.deepEqual(entries.map((entry) => entry.dir), ['parent'], 'the scan reports script directories, not every folder');
  assert.equal(entries[0].moduleSystem, MODULE_SYSTEM.ESM);
  assert.equal(entries[0].decidedBy, DECIDED_BY.PACKAGE_JSON);
  assert.equal(entries[0].fileCount, 1, 'the nested file must still be measured');
});

test('C002 a contradiction in a nested directory is attributed to its top-level directory', () => {
  const root = makeDeclaredTree({
    'tree/package.json': JSON.stringify({ type: 'commonjs' }),
    'tree/deep/contradicting.js': "import x from 'y';\n",
    'tree/deep/conforming.js': 'module.exports = 1;\n',
  });

  const entries = scanScriptDirectories(root);
  assert.deepEqual(entries.map((entry) => entry.dir), ['tree']);
  assert.equal(entries[0].conforms, false, 'a nested contradiction must not escape the scan');
  assert.deepEqual(entries[0].nonConforming, [join(root, 'tree', 'deep', 'contradicting.js')]);
});

test('C002 a directory holding no source files is reported with a zero count and conforming', () => {
  const root = makeDeclaredTree({ 'empty/.keep': '' });
  const entries = scanScriptDirectories(root);
  const empty = entries.find((entry) => entry.dir === 'empty');
  assert.equal(empty.fileCount, 0);
  assert.equal(empty.conforms, true);
});
