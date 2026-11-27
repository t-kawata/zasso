// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
'use strict';

/**
 * Unit tests for the criteria taxonomy of pickup-conver-update-candidates.
 *
 * The taxonomy is the single authority shared by the CLI, the command document,
 * and the renderer, so its shape is asserted here rather than in each consumer.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const criteria = require(path.join(
  __dirname,
  '..',
  '..',
  '.claude',
  'scripts',
  'pickup-conver-update-candidates',
  'criteria.js'
));

test('criteria exposes the frozen schema and criteria versions', () => {
  assert.equal(criteria.SCHEMA_VERSION, 1);
  assert.equal(criteria.CRITERIA_VERSION, '1.0.0');
  assert.equal(Object.isFrozen(criteria.VALUE_CATEGORIES), true);
  assert.equal(Object.isFrozen(criteria.ADMISSION_GATES), true);
});

test('criteria exposes exactly 6 admission gates G1 through G6', () => {
  assert.deepEqual(criteria.ADMISSION_GATES.map((gate) => gate.id), ['G1', 'G2', 'G3', 'G4', 'G5', 'G6']);
  for (const gate of criteria.ADMISSION_GATES) {
    assert.equal(typeof gate.rule, 'string');
    assert.ok(gate.rule.length > 10);
  }
});

test('criteria exposes exactly 10 value categories', () => {
  assert.deepEqual(criteria.VALUE_CATEGORIES, [
    'correctness',
    'safety',
    'efficiency',
    'generality',
    'density',
    'clarity',
    'consistency',
    'testability',
    'observability',
    'evolvability',
  ]);
});

test('criteria exposes exactly 8 exclusion codes X1 through X8', () => {
  assert.deepEqual(criteria.EXCLUSION_CODES.map((entry) => entry.id), ['X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'X8']);
});

test('criteria exposes the closed enums used by the candidate schema', () => {
  assert.deepEqual(criteria.STATUSES, ['candidate', 'accepted', 'absorbed']);
  assert.deepEqual(criteria.IMPACTS, ['high', 'medium', 'low']);
  assert.deepEqual(criteria.CONFIDENCES, ['high', 'medium', 'low']);
  assert.deepEqual(criteria.RISK_LEVELS, ['low', 'medium', 'high']);
  assert.deepEqual(criteria.GENERALIZATIONS, ['direct', 'adapt']);
  assert.deepEqual(criteria.CHANGE_TYPES, ['added', 'modified', 'deleted', 'renamed']);
});

test('criteria exposes the five required completeness fields and the display limit', () => {
  assert.deepEqual(criteria.REQUIRED_CANDIDATE_FIELDS, ['symptom', 'remedy', 'scope', 'risk', 'verification']);
  assert.equal(criteria.DISPLAY_LIMIT, 50);
});
