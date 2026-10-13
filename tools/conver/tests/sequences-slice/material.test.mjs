// PX-256 @verifies C001
// PX-256 @verifies C004
// The rule that decides whether material is present is written once and reached through two
// entry points, so it is tested here without a tree at all. The file system is injected, as
// question-gate/prior-decisions.mjs already injects it, which is what makes every branch —
// an unreadable record, a record that is not JSON, a source that is not one — reachable
// without constructing the failure on disk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  LEGACY_MATERIAL_FIELD,
  MATERIAL_LIST_FIELD,
  SOURCE_ARTIFACT_SUFFIX,
  collectUnitIds,
  findSequenceMaterial,
  isUsableSourceArtifact,
  isViewName,
  materialPathsOf,
} from '../../.claude/scripts/sequences-slice/lib/material.mjs';

/** A stand-in file system: paths map to text, and anything absent reads as null. */
// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
function fakeFileSystem(files, existing = Object.keys(files)) {
  const present = new Set(existing);
  return {
    readFile: (filePath) => (Object.hasOwn(files, filePath) ? files[filePath] : null),
    fileExists: (filePath) => present.has(filePath),
    basename: path.basename,
    join: path.join,
  };
}

const SOURCE_TEXT = JSON.stringify({ schema_version: 2, sequences: [], steps: [], operations: [] });
const RFC_DIR = '/workspace/pkg';
const STATUS = path.join(RFC_DIR, 'Status.json');
const VIEW = path.join(RFC_DIR, 'SEQUENCES.md');
const SOURCE = `/workspace/spec${SOURCE_ARTIFACT_SUFFIX}`;

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C001 materialPaths is read when it is a list and researchPath only when it is absent', () => {
  assert.deepEqual(materialPathsOf({ [MATERIAL_LIST_FIELD]: ['/a'] }), ['/a']);
  assert.deepEqual(materialPathsOf({ [LEGACY_MATERIAL_FIELD]: '/b' }), ['/b']);
  assert.deepEqual(materialPathsOf({ [MATERIAL_LIST_FIELD]: [], [LEGACY_MATERIAL_FIELD]: '/b' }), []);
  assert.deepEqual(materialPathsOf({ [LEGACY_MATERIAL_FIELD]: '' }), []);
  assert.deepEqual(materialPathsOf(null), []);
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C001 the view names are recognised and nothing else is', () => {
  assert.equal(isViewName('SEQUENCES.md'), true);
  assert.equal(isViewName('SEQUENCES.json'), true);
  assert.equal(isViewName('RFC.md'), false);
  assert.equal(isViewName('SEQUENCES-GRAPH.json'), false);
  assert.equal(isViewName('X-sequences.json'), false);
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C001 a source artifact is recognised by suffix and by shape, not by suffix alone', () => {
  const io = fakeFileSystem({ [SOURCE]: SOURCE_TEXT, '/workspace/not-json-sequences.json': '{ nope', '/workspace/wrong-sequences.json': '{"schema_version":2}' });
  assert.equal(isUsableSourceArtifact(io, SOURCE), true);
  assert.equal(isUsableSourceArtifact(io, '/workspace/not-json-sequences.json'), false);
  assert.equal(isUsableSourceArtifact(io, '/workspace/wrong-sequences.json'), false, 'schema_version without the arrays is not a source');
  assert.equal(isUsableSourceArtifact(io, '/workspace/RFC.md'), false);
  assert.equal(isUsableSourceArtifact(io, '/workspace/missing-sequences.json'), false);
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C001 an absent session record is answered as absence with the reason recorded', () => {
  const answer = findSequenceMaterial({ rfcDir: RFC_DIR, sessionDir: '/workspace/pkg/drills', io: fakeFileSystem({}) });
  assert.equal(answer.present, false);
  assert.deepEqual(answer.searched.map((entry) => entry.path), [path.join('/workspace/pkg/drills', 'Status.json'), STATUS]);
  assert.deepEqual(answer.searched.map((entry) => entry.readable), [false, false]);
  assert.ok(answer.searched.every((entry) => entry.reason !== null));
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C004 the session record is read first and a later record does not extend it', () => {
  const sessionStatus = path.join('/workspace/pkg/drills', 'Status.json');
  const io = fakeFileSystem({
    [sessionStatus]: JSON.stringify({ state: 'DRILLING' }),
    [STATUS]: JSON.stringify({ [MATERIAL_LIST_FIELD]: [SOURCE] }),
    [SOURCE]: SOURCE_TEXT,
  });
  const answer = findSequenceMaterial({ rfcDir: RFC_DIR, sessionDir: '/workspace/pkg/drills', io });
  // The session record is readable and carries no list, so the package record supplies it.
  assert.deepEqual(answer.materialPaths, [SOURCE]);
  assert.equal(answer.source, SOURCE);
  assert.deepEqual(answer.searched.map((entry) => entry.path), [sessionStatus, STATUS]);
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C001 a recorded path that is gone is reported stale and is never chosen as the source', () => {
  const io = fakeFileSystem(
    { [STATUS]: JSON.stringify({ [MATERIAL_LIST_FIELD]: [SOURCE] }) },
    [STATUS],
  );
  const answer = findSequenceMaterial({ rfcDir: RFC_DIR, io });
  assert.deepEqual(answer.staleMaterialPaths, [SOURCE]);
  assert.equal(answer.source, null);
  assert.equal(answer.present, false);
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C001 the view is found where it deterministically lives, even when never recorded', () => {
  const io = fakeFileSystem({ [STATUS]: JSON.stringify({ [MATERIAL_LIST_FIELD]: [] }), [VIEW]: '# sequences\n' });
  const answer = findSequenceMaterial({ rfcDir: RFC_DIR, io });
  assert.equal(answer.view, VIEW);
  assert.equal(answer.viewExists, true);
  assert.equal(answer.present, true);
  assert.deepEqual(answer.recordedViewNames, []);
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C001 a record that is not JSON is reported unreadable rather than throwing', () => {
  const io = fakeFileSystem({ [STATUS]: '{ not json' });
  const answer = findSequenceMaterial({ rfcDir: RFC_DIR, io });
  assert.equal(answer.present, false);
  assert.equal(answer.searched[0].readable, false);
  assert.match(answer.searched[0].reason, /not JSON/);
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C004 no session directory means one fewer record is searched, not a different answer', () => {
  const io = fakeFileSystem({ [STATUS]: JSON.stringify({ [MATERIAL_LIST_FIELD]: [] }), [VIEW]: '# sequences\n' });
  const withSession = findSequenceMaterial({ rfcDir: RFC_DIR, sessionDir: '/workspace/pkg/drills', io });
  const withoutSession = findSequenceMaterial({ rfcDir: RFC_DIR, io });
  assert.equal(withSession.searched.length, withoutSession.searched.length + 1);
  assert.equal(withSession.present, withoutSession.present);
  assert.equal(withSession.view, withoutSession.view);
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C001 a recorded view name is reported as recorded, so a caller can tell it was seen before', () => {
  const io = fakeFileSystem({
    [STATUS]: JSON.stringify({ [MATERIAL_LIST_FIELD]: [VIEW, SOURCE] }),
    [VIEW]: '# sequences\n',
    [SOURCE]: SOURCE_TEXT,
  });
  const answer = findSequenceMaterial({ rfcDir: RFC_DIR, io });
  assert.deepEqual(answer.recordedViewNames, [VIEW]);
  assert.equal(answer.source, SOURCE);
  assert.equal(answer.present, true);
});

// FIX-PLAN005 (docs/FIX-PLAN005.md) — one reading of the units a view distributes, so the
// stage report and the distribution gate cannot disagree about which units a package holds.
// The order is the view's own and repeats stay repeated, because the ledger is checked
// against these ids as the view spells them.
test('C001 the unit ids a view distributes are read in the view order, without renaming or de-duplicating', () => {
  const view = {
    ownedOperationUnits: [{ unitId: 'op-a' }, { unitId: 'op-b' }],
    ownedSequenceUnits: [{ unitId: 'seq-c' }],
    crossBoundarySequenceUnits: [{ unitId: 'xdir-d' }, { unitId: 'op-a' }],
  };
  assert.deepEqual(collectUnitIds(view), ['op-a', 'op-b', 'seq-c', 'xdir-d', 'op-a']);
});

test('C001 a view that carries none of the three arrays distributes no unit', () => {
  assert.deepEqual(collectUnitIds({}), []);
  assert.deepEqual(collectUnitIds({ ownedOperationUnits: [{ unitId: 'op-a' }] }), ['op-a']);
});
