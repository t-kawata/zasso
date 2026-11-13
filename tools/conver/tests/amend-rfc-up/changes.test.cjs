'use strict';

/**
 * PX-418 — changes: artifact/operation validation, append claims, owner changes, DAG.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  assertChangeDag,
  validateArtifactChange,
} = require('../../.claude/scripts/amend-rfc-up/changes.js');
const { DIRS_TREE_CHANGE, GRAPH_CHANGE, RFC_CHANGE, makeChange } = require('./helpers.cjs');

test('an RFC append claim with a code example is valid', () => {
  assert.doesNotThrow(() => validateArtifactChange({ change: RFC_CHANGE }));
});

test('an RFC claim without a code example is CHANGE_INVALID', () => {
  assert.throws(
    () => validateArtifactChange({ change: makeChange({ text: 'no code here' }) }),
    (error) => error.code === 'CHANGE_INVALID',
  );
});

test('an RFC claim with a forbidden marker is CHANGE_INVALID', () => {
  assert.throws(
    () => validateArtifactChange({ change: makeChange({ text: 'TBD\n\n```rust\nfn x() {}\n```' }) }),
    (error) => error.code === 'CHANGE_INVALID',
  );
});

test('a derived change needs a known owner and a reason', () => {
  assert.doesNotThrow(() => validateArtifactChange({ change: GRAPH_CHANGE }));
  assert.throws(
    () => validateArtifactChange({ change: { ...GRAPH_CHANGE, owner: 'nobody' } }),
    (error) => error.code === 'CHANGE_INVALID',
  );
  assert.throws(
    () => validateArtifactChange({ change: { ...GRAPH_CHANGE, reason: '' } }),
    (error) => error.code === 'CHANGE_INVALID',
  );
});

test('unknown artifact and operation are CHANGE_INVALID', () => {
  assert.throws(
    () => validateArtifactChange({ change: { ...RFC_CHANGE, artifact: 'unknown' } }),
    (error) => error.code === 'CHANGE_INVALID',
  );
  assert.throws(
    () => validateArtifactChange({ change: { ...RFC_CHANGE, operation: 'owner-rederive' } }),
    (error) => error.code === 'CHANGE_INVALID',
  );
});

test('a change DAG rejects cycles', () => {
  const changes = [
    { ...GRAPH_CHANGE, id: 'A', dependsOn: ['B'] },
    { ...DIRS_TREE_CHANGE, id: 'B', dependsOn: ['A'] },
  ];
  assert.throws(
    () => assertChangeDag({ changes }),
    (error) => error.code === 'CHANGE_DAG_CYCLE',
  );
});

test('a change DAG accepts an acyclic order', () => {
  const changes = [GRAPH_CHANGE, DIRS_TREE_CHANGE];
  assert.equal(assertChangeDag({ changes }), true);
});
