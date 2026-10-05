// PX-235 @verifies C002
// PX-235 @verifies C003
// PX-235 @verifies C004
// PX-235 @verifies C005
// PX-235 @verifies C006
// [::TICKET::] PX-235 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-235 --for-spec --no-implementation-order`.
/**
 * init.js and list-files.js under the argument contract this ticket settles:
 * `<rfc-dir> [<material-path>...]`, with the RFC name fixed at RFC.md.
 *
 * Every assertion is a value a caller branches on — a recorded path, an exit code,
 * a printed list — because those are what the command file and a resumed session
 * read. The inventory assertion lives here rather than only in
 * artifact-inventory.test.mjs because it is about the same run: the RFC name moved
 * and the number of artifacts a package directory holds did not.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

import {
  GRILL_INIT,
  GRILL_LIST_FILES,
  GRILL_RFC_FILENAME,
  runCommand,
} from '../../question-gate/helpers/fixture-workspace.mjs';

/** The JSON a script printed, parsed — both scripts report on stdout by contract. */
const printedJson = (result) => JSON.parse(result.stdout);

/** A package directory in a fresh temporary tree, with a scratch area beside it. */
// [::TICKET::] PX-235 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-235 --for-spec --no-implementation-order`.
function makePackage() {
  const base = mkdtempSync(join(tmpdir(), 'px235-'));
  const rfcDir = join(base, 'pkg');
  mkdirSync(rfcDir, { recursive: true });
  return { rfcDir, materialPath: (name) => join(base, name) };
}

/** A material file, written so a walk can find it. */
// [::TICKET::] PX-235 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-235 --for-spec --no-implementation-order`.
function writeMaterial(path) {
  writeFileSync(path, '# material\n', 'utf8');
  return path;
}

/** What init.js recorded about the run. */
// [::TICKET::] PX-235 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-235 --for-spec --no-implementation-order`.
function readStatus(rfcDir) {
  return JSON.parse(readFileSync(join(rfcDir, 'Status.json'), 'utf8'));
}

test('C002 postcondition: init.js records <rfc-dir>/RFC.md and every material in argument order', () => {
  const pkg = makePackage();
  const materialA = writeMaterial(pkg.materialPath('material-a.md'));
  const materialB = writeMaterial(pkg.materialPath('material-b.md'));

  const result = runCommand(GRILL_INIT, [pkg.rfcDir, materialA, materialB]);

  assert.equal(result.status, 0, result.stderr);
  const status = readStatus(pkg.rfcDir);
  assert.equal(status.rfcPath, join(resolve(pkg.rfcDir), GRILL_RFC_FILENAME), 'the name is fixed, not supplied');
  assert.deepEqual(status.materialPaths, [resolve(materialA), resolve(materialB)], 'materials keep their order');
  assert.equal(status.researchPath, resolve(materialA), 'the legacy field still names the first material');
  assert.equal(/^RFC-.+\.md$/.test(basename(status.rfcPath)), false, 'the command never produces a slug form');
});

test('C002 invariant: init.js refuses a call with no package directory and writes nothing', () => {
  const result = runCommand(GRILL_INIT, []);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Usage: init\.js <rfc-dir> \[<material-path>\.\.\.\]/);
});

test('C002 invariant: a material that does not exist is reported, not dropped', () => {
  const pkg = makePackage();
  const missing = pkg.materialPath('not-there.md');

  const result = runCommand(GRILL_INIT, [pkg.rfcDir, missing]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not-there\.md/, 'the missing material is named');
  assert.equal(existsSync(join(pkg.rfcDir, 'Status.json')), false, 'a refused call writes nothing');
});

test('C003 postcondition: list-files.js walks every material, in argument order, once each', () => {
  const pkg = makePackage();
  const single = writeMaterial(pkg.materialPath('one.md'));
  const tree = pkg.materialPath('tree');
  mkdirSync(join(tree, 'nested'), { recursive: true });
  writeFileSync(join(tree, 'two.md'), '# two\n', 'utf8');
  writeFileSync(join(tree, 'nested', 'three.md'), '# three\n', 'utf8');

  assert.equal(runCommand(GRILL_INIT, [pkg.rfcDir, single, tree]).status, 0);

  const listed = printedJson(runCommand(GRILL_LIST_FILES, [pkg.rfcDir]));

  assert.equal(listed[0], resolve(single), 'the first material is walked first');
  assert.deepEqual(
    [...listed].sort(),
    [resolve(single), join(resolve(tree), 'two.md'), join(resolve(tree), 'nested', 'three.md')].sort(),
    'every file under every material is present, and nothing outside them is',
  );
  assert.equal(new Set(listed).size, listed.length, 'no material is walked twice');
});

test('C004 postcondition: zero materials is legal, records an empty list, and never resolves to the working directory', () => {
  const pkg = makePackage();

  assert.equal(runCommand(GRILL_INIT, [pkg.rfcDir]).status, 0, 'no material is not an error');

  const status = readStatus(pkg.rfcDir);
  assert.deepEqual(status.materialPaths, []);
  assert.equal(status.researchPath, '', 'the legacy field is empty rather than an unset null');

  const listed = runCommand(GRILL_LIST_FILES, [pkg.rfcDir]);
  assert.equal(listed.status, 0, listed.stderr);
  assert.deepEqual(printedJson(listed), [], 'an empty material set is empty, not the process cwd');
});

test('C005 postcondition: a Status.json written before this ticket still resumes and still lists its material', () => {
  const pkg = makePackage();
  const material = writeMaterial(pkg.materialPath('legacy.md'));

  // Produce a valid DesignTree.json and CheckList.md through the current writer,
  // then rewrite Status.json into the pre-ticket shape and resume.
  assert.equal(runCommand(GRILL_INIT, [pkg.rfcDir, material]).status, 0);
  const statusPath = join(pkg.rfcDir, 'Status.json');
  const legacy = readStatus(pkg.rfcDir);
  delete legacy.materialPaths;
  writeFileSync(statusPath, JSON.stringify(legacy, null, 2), 'utf8');

  const resumed = printedJson(runCommand(GRILL_INIT, [pkg.rfcDir]));
  assert.equal(resumed.mode, 'resume');
  assert.deepEqual(printedJson(runCommand(GRILL_LIST_FILES, [pkg.rfcDir])), [resolve(material)]);
  assert.equal(
    readStatus(pkg.rfcDir).researchPath,
    resolve(material),
    'resuming does not rewrite the legacy field',
  );
});

test('C006 invariant: a package directory holds exactly four artifacts, under the new RFC name', () => {
  const pkg = makePackage();
  const material = writeMaterial(pkg.materialPath('material.md'));
  assert.equal(runCommand(GRILL_INIT, [pkg.rfcDir, material]).status, 0);

  // init.js writes three; the RFC is written by the command's STEP 5.
  writeFileSync(join(pkg.rfcDir, GRILL_RFC_FILENAME), '# RFC\n\n## Design\n', 'utf8');

  assert.deepEqual(
    readdirSync(pkg.rfcDir).sort(),
    ['CheckList.md', 'DesignTree.json', GRILL_RFC_FILENAME, 'Status.json'].sort(),
    'the RFC name moved; the inventory did not grow',
  );
});
