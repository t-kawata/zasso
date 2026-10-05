// PX-233 @verifies C002
// PX-233 @verifies C003
// [::TICKET::] PX-233 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-233 --for-spec --no-implementation-order`.
/**
 * The question gate: whether a point may become a question at all.
 *
 * The gate is a validator of the three lines the AI writes — 決定, 根拠, 覆す条件 —
 * not a decider. That separation is what keeps the human in the loop and still lets
 * the count fall: the AI must ground a point before it may settle it, so a point
 * whose only support is its own weight stays a question, and a point the records
 * ground never becomes one.
 *
 * The four refusals are the four inferences explain-seed records as each having
 * produced a wrong question. They are returned by name, so the caller asserts on a
 * value rather than on prose.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { REFUSAL, SETTLE_LINES, settlePoint } from '../../../.claude/scripts/question-gate/settle.mjs';

const RECORDS = ['WORKSPACIFY-ALLOCATE-MANIFEST.json#implementation_order', 'RFC-AUTH.md#§3'];

const writable = (overrides = {}) => ({
  decision: 'the session store sits under src/api',
  ground: 'RFC-AUTH.md#§3',
  override: 'the graph moves the node to another kind',
  ...overrides,
});

test('C002 postcondition: a writable triple settles the point with its ground', () => {
  const result = settlePoint({ point: { id: 'N0002' }, candidate: writable(), records: RECORDS, inferences: [] });

  assert.equal(result.kind, 'settled');
  assert.equal(result.ground, 'RFC-AUTH.md#§3');
  assert.equal(result.decision, 'the session store sits under src/api');
  assert.equal(result.override, 'the graph moves the node to another kind');
});

test('C002 invariant: the three lines are 決定, 根拠 and 覆す条件, in that order', () => {
  assert.deepEqual(SETTLE_LINES, ['決定', '根拠', '覆す条件']);
});

test('C002 invariant: a ground outside the records is not a settlement', () => {
  const result = settlePoint({
    point: { id: 'N0002' },
    candidate: writable({ ground: 'a ground the AI never read' }),
    records: RECORDS,
    inferences: [],
  });

  assert.equal(result.kind, 'question', 'a ground the AI has not looked for is not a ground it has');
});

test('C002 postcondition: an incomplete triple becomes a question carrying why it could not be settled', () => {
  const result = settlePoint({
    point: { id: 'N0007' },
    candidate: { decision: '', ground: '', override: '', reason: 'the two manifests agree on the level but not on which experience comes first' },
    records: [],
    inferences: [],
  });

  assert.equal(result.kind, 'question');
  assert.match(result.reason, /which experience comes first/);
  assert.equal('decision' in result, false, 'a question carries no decision');
});

test('C002 boundary: a settled point carries no reason and a question carries no override', () => {
  const settled = settlePoint({ point: { id: 'N0002' }, candidate: writable(), records: RECORDS, inferences: [] });
  const question = settlePoint({ point: { id: 'N0007' }, candidate: { reason: 'nothing decides this' }, records: [], inferences: [] });

  assert.equal('reason' in settled, false);
  assert.equal('override' in question, false);
});

test('C003 postcondition: each of the four forbidden inferences is refused by name, carrying its point', () => {
  const cases = [
    [REFUSAL.FLAG_IS_NOT_A_GROUND, 'risky_boundaries'],
    [REFUSAL.FOREIGN_PACKAGE_DOUBT, 'g relayed a residual owned by package src/auth'],
    [REFUSAL.AUTHOR_ONLY_IS_MATERIAL_NOT_EXEMPTION, 'only the author can decide'],
    [REFUSAL.WEIGHT_ALONE_DOES_NOT_BIND, 'this is a design decision, so it is the human’s'],
  ];

  for (const [refusal, evidence] of cases) {
    const result = settlePoint({
      point: { id: 'N0009' },
      candidate: writable(),
      records: RECORDS,
      inferences: [{ kind: refusal, evidence }],
    });

    assert.equal(result.kind, 'refused');
    assert.equal(result.refusal, refusal);
    assert.equal(result.pointId, 'N0009');
    assert.equal(result.evidence, evidence);
  }
});

test('C003 invariant: a refusal outranks a complete triple', () => {
  const result = settlePoint({
    point: { id: 'N0009' },
    candidate: writable(),
    records: RECORDS,
    inferences: [{ kind: REFUSAL.FLAG_IS_NOT_A_GROUND, evidence: 'risky_boundaries named it' }],
  });

  assert.equal(result.kind, 'refused', 'a flag is not a ground even when the lines read well');
});

test('C003 invariant: weight alone never binds a point to a question', () => {
  const heavy = { id: 'N0010', weight: 'high' };

  const withoutGround = settlePoint({ point: heavy, candidate: { decision: 'd', ground: '', override: 'o' }, records: [], inferences: [] });
  assert.equal(withoutGround.kind, 'question');

  const withGround = settlePoint({ point: heavy, candidate: writable({ ground: 'RFC-AUTH.md#§3' }), records: RECORDS, inferences: [] });
  assert.equal(withGround.kind, 'settled', 'a ground the AI looked for settles even a weighty point');
});

test('C003 boundary: an inference kind the gate does not know is named rather than swallowed', () => {
  assert.throws(
    () =>
      settlePoint({
        point: { id: 'N0011' },
        candidate: writable(),
        records: RECORDS,
        inferences: [{ kind: 'a-reason-invented-here', evidence: 'x' }],
      }),
    /unknown inference kind/,
    'a kind the gate cannot judge is reported, never silently ignored',
  );
});
