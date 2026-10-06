// PX-238 @verifies C001
// PX-238 @verifies C002
// PX-238 @verifies C003
// [::TICKET::] PX-238 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-238 --for-spec --no-implementation-order`.
/**
 * What a resume does with the material it is handed.
 *
 * A run that is resumed is the same run continuing, so the material it was given
 * must join the session rather than replace it or vanish. The assertions below are
 * the three things a caller branches on — the recorded list, the order it keeps,
 * and the paths this invocation actually contributed — plus the case that must not
 * move: a resume that was given nothing is a read, not a write.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  GRILL_INIT,
  GRILL_LIST_FILES,
  runCommand,
} from '../../question-gate/helpers/fixture-workspace.mjs';

/** The JSON a script printed, parsed — both scripts report on stdout by contract. */
const printedJson = (result) => JSON.parse(result.stdout);

/** A package directory in a fresh temporary tree, with a scratch area beside it. */
// [::TICKET::] PX-238 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-238 --for-spec --no-implementation-order`.
function makePackage() {
  const base = mkdtempSync(join(tmpdir(), 'px238-resume-'));
  const rfcDir = join(base, 'pkg');
  mkdirSync(rfcDir, { recursive: true });
  return { base, rfcDir, materialPath: (name) => join(base, name) };
}

/** A material file, written so a walk can find it. */
// [::TICKET::] PX-238 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-238 --for-spec --no-implementation-order`.
function writeMaterial(path) {
  writeFileSync(path, '# material\n', 'utf8');
  return path;
}

/** What init.js recorded about the run. */
// [::TICKET::] PX-238 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-238 --for-spec --no-implementation-order`.
function readStatus(rfcDir) {
  return JSON.parse(readFileSync(join(rfcDir, 'Status.json'), 'utf8'));
}

/** Status.json without its timestamps, for asserting that only they moved. */
// [::TICKET::] PX-238 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-238 --for-spec --no-implementation-order`.
function withoutTimestamps(status) {
  const { updatedAt, materialsAddedAt, ...rest } = status;
  return rest;
}

test('C001 postcondition: a resume records the material it was handed', () => {
  const pkg = makePackage();
  const materialA = writeMaterial(pkg.materialPath('material-a.md'));
  const materialB = writeMaterial(pkg.materialPath('material-b.md'));
  assert.equal(runCommand(GRILL_INIT, [pkg.rfcDir, materialA]).status, 0);

  const resumed = runCommand(GRILL_INIT, [pkg.rfcDir, materialB]);

  assert.equal(resumed.status, 0, resumed.stderr);
  assert.equal(printedJson(resumed).mode, 'resume');
  assert.deepEqual(
    readStatus(pkg.rfcDir).materialPaths,
    [resolve(materialA), resolve(materialB)],
    'the earlier entry keeps its place and the new one is appended',
  );
});

test('C001 postcondition: the resume reports exactly what it added', () => {
  const pkg = makePackage();
  const materialA = writeMaterial(pkg.materialPath('material-a.md'));
  const materialB = writeMaterial(pkg.materialPath('material-b.md'));
  assert.equal(runCommand(GRILL_INIT, [pkg.rfcDir, materialA]).status, 0);

  const resumed = printedJson(runCommand(GRILL_INIT, [pkg.rfcDir, materialB]));

  assert.deepEqual(resumed.addedMaterials, [resolve(materialB)]);
});

test('C002 invariant: a resume with no material adds nothing and reports nothing', () => {
  const pkg = makePackage();
  const materialA = writeMaterial(pkg.materialPath('material-a.md'));
  assert.equal(runCommand(GRILL_INIT, [pkg.rfcDir, materialA]).status, 0);

  const before = readStatus(pkg.rfcDir);
  const result = runCommand(GRILL_INIT, [pkg.rfcDir]);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(printedJson(result).addedMaterials, []);
  assert.deepEqual(
    withoutTimestamps(readStatus(pkg.rfcDir)),
    withoutTimestamps(before),
    'only the timestamp moved',
  );
});

test('C001 invariant: every recorded path is a non-empty string and none is duplicated', () => {
  const pkg = makePackage();
  const materialA = writeMaterial(pkg.materialPath('material-a.md'));
  const materialB = writeMaterial(pkg.materialPath('material-b.md'));
  assert.equal(runCommand(GRILL_INIT, [pkg.rfcDir, materialA]).status, 0);
  assert.equal(runCommand(GRILL_INIT, [pkg.rfcDir, materialB]).status, 0);

  const recorded = readStatus(pkg.rfcDir).materialPaths;

  assert.deepEqual(recorded, [resolve(materialA), resolve(materialB)], 'both materials are there to be checked');
  assert.ok(recorded.every((path) => typeof path === 'string' && path.length > 0));
  assert.equal(new Set(recorded).size, recorded.length, 'no path is recorded twice');
});

test('C001 invariant: the same path given twice in one invocation is recorded once', () => {
  const pkg = makePackage();
  const materialA = writeMaterial(pkg.materialPath('material-a.md'));
  const materialB = writeMaterial(pkg.materialPath('material-b.md'));
  assert.equal(runCommand(GRILL_INIT, [pkg.rfcDir, materialA]).status, 0);

  const result = runCommand(GRILL_INIT, [pkg.rfcDir, materialB, materialB]);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    readStatus(pkg.rfcDir).materialPaths,
    [resolve(materialA), resolve(materialB)],
    'the repeat is folded away and the first material keeps its place',
  );
});

test('C002 invariant: a resume given a path that does not exist stops before writing', () => {
  const pkg = makePackage();
  const materialA = writeMaterial(pkg.materialPath('material-a.md'));
  assert.equal(runCommand(GRILL_INIT, [pkg.rfcDir, materialA]).status, 0);
  const statusPath = join(pkg.rfcDir, 'Status.json');
  const beforeBytes = readFileSync(statusPath, 'utf8');

  const missing = runCommand(GRILL_INIT, [pkg.rfcDir, pkg.materialPath('not-there.md')]);

  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /not-there\.md/, 'the missing material is named');
  assert.equal(readFileSync(statusPath, 'utf8'), beforeBytes, 'a refused resume writes nothing');
});

test('C003 invariant: a later resume never removes or reorders what an earlier one recorded', () => {
  const pkg = makePackage();
  const materialA = writeMaterial(pkg.materialPath('material-a.md'));
  const materialB = writeMaterial(pkg.materialPath('material-b.md'));
  const materialC = writeMaterial(pkg.materialPath('material-c.md'));
  assert.equal(runCommand(GRILL_INIT, [pkg.rfcDir, materialA, materialB]).status, 0);

  assert.equal(runCommand(GRILL_INIT, [pkg.rfcDir, materialC]).status, 0);

  assert.deepEqual(
    readStatus(pkg.rfcDir).materialPaths,
    [resolve(materialA), resolve(materialB), resolve(materialC)],
  );
});

test('the recorded material reaches the reader: list-files.js enumerates what the resume added', () => {
  const pkg = makePackage();
  const materialA = writeMaterial(pkg.materialPath('material-a.md'));
  assert.equal(runCommand(GRILL_INIT, [pkg.rfcDir, materialA]).status, 0);
  const tree = pkg.materialPath('tree');
  mkdirSync(join(tree, 'nested'), { recursive: true });
  writeFileSync(join(tree, 'two.md'), '# two\n', 'utf8');
  writeFileSync(join(tree, 'nested', 'three.md'), '# three\n', 'utf8');

  assert.equal(runCommand(GRILL_INIT, [pkg.rfcDir, tree]).status, 0);

  const listed = printedJson(runCommand(GRILL_LIST_FILES, [pkg.rfcDir]));
  assert.deepEqual(
    [...listed].sort(),
    [resolve(materialA), join(resolve(tree), 'two.md'), join(resolve(tree), 'nested', 'three.md')].sort(),
    'the old material and the new one are both read, and nothing outside them is',
  );
  assert.equal(new Set(listed).size, listed.length, 'no material is walked twice');
});
