// PX-233 @verifies C001
// [::TICKET::] PX-233 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-233 --for-spec --no-implementation-order`.
/**
 * The ledger: what state each point is in.
 *
 * The property that matters is structural — the three sets partition the universe —
 * so it is asserted against plain data rather than through a subprocess. The module
 * takes ids and items, not a document and a workspace, which is what lets the same
 * code serve a grill (whose state is a design tree) and a drill (whose state is a
 * session document).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { partitionPoints, universeOf } from '../../../.claude/scripts/question-gate/ledger.mjs';

const MODULE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../.claude/scripts/question-gate');
const MODULES = ['ledger', 'settle', 'prior-decisions', 'bundle', 'block', 'rounds', 'answers'];

const settledItem = (ids, ground = 'WORKSPACIFY-ALLOCATE-MANIFEST.json#implementation_order') => ({
  ids,
  decision: 'the order is the published order',
  ground,
  override: 'a declared edge disagrees with the level',
});

test('C001 postcondition: open, bound and settled partition the universe', () => {
  const points = ['N0001', 'N0002', 'N0003'];
  const questions = [{ number: 1, boundIds: ['N0002', 'N0003'] }];
  const preDecided = [settledItem(['N0001'])];

  const ledger = partitionPoints({ points, questions, preDecided });

  assert.deepEqual([...ledger.settled], ['N0001']);
  assert.deepEqual([...ledger.bound].sort(), ['N0002', 'N0003']);
  assert.deepEqual([...ledger.open], []);
});

test('C001 invariant: every id is in exactly one set, and the three sum to the universe', () => {
  const universe = universeOf({ points: ['N0001', 'N0002', 'N0003'], addedPoints: ['added-001'] });
  const ledger = partitionPoints({
    points: ['N0001', 'N0002', 'N0003'],
    questions: [{ number: 1, boundIds: ['N0002'] }],
    preDecided: [settledItem(['N0001'])],
    addedPoints: ['added-001'],
  });

  assert.equal(ledger.open.size + ledger.bound.size + ledger.settled.size, universe.size);
  for (const id of universe) {
    const hits = [ledger.open, ledger.bound, ledger.settled].filter((set) => set.has(id)).length;
    assert.equal(hits, 1, `${id} is in exactly one set`);
  }
  assert.deepEqual([...ledger.added], ['added-001']);
});

test('C001 invariant: unsettled is exactly open union bound', () => {
  const ledger = partitionPoints({
    points: ['N0001', 'N0002', 'N0003'],
    questions: [{ number: 1, boundIds: ['N0002'] }],
    preDecided: [settledItem(['N0001'])],
  });

  assert.deepEqual([...ledger.unsettled].sort(), ['N0002', 'N0003']);
});

test('C001 postcondition: a point an added-point entry introduces reaches the universe and no other set', () => {
  const ledger = partitionPoints({
    points: ['N0001'],
    questions: [],
    preDecided: [],
    addedPoints: ['added-001'],
  });

  assert.equal(ledger.open.has('added-001'), true, 'an added point is open until something settles it');
  assert.equal(ledger.added.has('added-001'), true);
});

test('C001 postcondition: a question naming an id that is neither recorded nor added does not widen the universe', () => {
  const ledger = partitionPoints({
    points: ['N0001'],
    questions: [{ number: 1, boundIds: ['N0001', 'NOT-A-POINT'] }],
    preDecided: [],
  });

  assert.deepEqual([...ledger.unsettled], ['N0001']);
  assert.equal(ledger.bound.has('NOT-A-POINT'), false, 'the ledger invents no point');
});

test('C001 boundary: a pre-decision without a ground settles nothing', () => {
  const ledger = partitionPoints({
    points: ['N0001'],
    questions: [],
    preDecided: [{ ids: ['N0001'], decision: 'a decision with no ground', ground: '', override: '' }],
  });

  assert.equal(ledger.settled.has('N0001'), false);
  assert.equal(ledger.open.has('N0001'), true, 'a decision resting on nothing leaves the point open');
});

test('C001 boundary: empty inputs yield three empty sets rather than throwing', () => {
  const ledger = partitionPoints({ points: [], questions: [], preDecided: [] });

  assert.deepEqual([...ledger.open], []);
  assert.deepEqual([...ledger.bound], []);
  assert.deepEqual([...ledger.settled], []);
  assert.deepEqual([...ledger.unsettled], []);
});

test('C001 invariant: no module of the core reads or writes the filesystem', () => {
  for (const name of MODULES) {
    const source = readFileSync(join(MODULE_DIR, `${name}.mjs`), 'utf8');
    assert.doesNotMatch(source, /from 'node:fs'/, `${name}.mjs takes plain data and touches no file`);
    assert.doesNotMatch(source, /process\.argv/, `${name}.mjs is not a CLI`);
  }
});
