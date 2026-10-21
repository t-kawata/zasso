// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compareFindingSets } from '../../.claude/scripts/smooth-sequences/lib/evidence-ledger.mjs';

const PREVIOUS = {
  findings: [{
    checkId: 'S5.projection-only',
    class: 'deficiency',
    subject: 'A-1__ProduceFact',
    where: 'spec.md#1',
    why: 'the step carries only a registry projection',
    fix: 'author the contract',
    producer: 'node .claude/scripts/smooth-sequences/run.mjs',
    repairClass: 'regeneration',
  }],
};

const BLOCKED = [{
  checkId: 'S5.projection-only',
  family: 'meshing',
  surface: 'steps[].contract',
  reason: 'surface absent',
}];

// @verifies C003
test('a previous finding whose check is now blocked is withdrawn', () => {
  const ledger = compareFindingSets(PREVIOUS, [], { blocked: BLOCKED, waivers: [] });
  assert.equal(ledger.withdrawn.length, 1);
  assert.equal(ledger.resolved.length, 0);
  assert.equal(ledger.withdrawn[0].checkId, 'S.evidence-withdrawn');
  assert.equal(ledger.withdrawn[0].subject, 'S5.projection-only:A-1__ProduceFact');
  assert.match(ledger.withdrawn[0].why, /A-1__ProduceFact/);
  assert.equal(ledger.withdrawn[0].where, 'spec.md#1');
  assert.equal(ledger.withdrawn[0].producer, 'node .claude/scripts/smooth-sequences/run.mjs');
});

// @verifies C003
test('a previous finding whose check still executed is resolved', () => {
  const ledger = compareFindingSets(PREVIOUS, [], { blocked: [], waivers: [] });
  assert.equal(ledger.withdrawn.length, 0);
  assert.equal(ledger.resolved.length, 1);
});

// @verifies C003
test('duplicate previous identities produce one withdrawn finding', () => {
  const previous = { findings: [PREVIOUS.findings[0], { ...PREVIOUS.findings[0] }] };
  const ledger = compareFindingSets(previous, [], { blocked: BLOCKED, waivers: [] });
  assert.equal(ledger.withdrawn.length, 1);
});

// @verifies C003
test('a finding still reported is neither withdrawn nor resolved', () => {
  const current = [{ ...PREVIOUS.findings[0] }];
  const ledger = compareFindingSets(PREVIOUS, current, { blocked: BLOCKED, waivers: [] });
  assert.deepEqual(ledger.withdrawn, []);
  assert.deepEqual(ledger.resolved, []);
});

// @verifies C003
test('an empty waiver ground is rejected', () => {
  assert.throws(
    () => compareFindingSets(PREVIOUS, [], {
      blocked: BLOCKED,
      waivers: [{ findingKey: 'S5.projection-only\u0000A-1__ProduceFact', ground: '   ' }],
    }),
    /waiver/i,
  );
});

// @verifies C003
test('a non-empty waiver ground removes the finding from the blocking set', () => {
  const ledger = compareFindingSets(PREVIOUS, [], {
    blocked: BLOCKED,
    waivers: [{ findingKey: 'S5.projection-only\u0000A-1__ProduceFact', ground: 'the step is retired by the specification' }],
  });
  assert.equal(ledger.withdrawn.length, 0);
  assert.equal(ledger.waived.length, 1);
});

// @verifies C003
test('a waiver on a finding whose check executed is resolved, not waived', () => {
  const ledger = compareFindingSets(PREVIOUS, [], {
    blocked: [],
    waivers: [{ findingKey: 'S5.projection-only\u0000A-1__ProduceFact', ground: 'the step is retired' }],
  });
  assert.equal(ledger.waived.length, 0);
  assert.equal(ledger.resolved.length, 1);
});

// @verifies C003
test('a withdrawn finding is carried forward while its check stays blocked', () => {
  const first = compareFindingSets(PREVIOUS, [], { blocked: BLOCKED, waivers: [] });
  const previousWithdrawn = { findings: first.withdrawn };
  const second = compareFindingSets(previousWithdrawn, [], { blocked: BLOCKED, waivers: [] });
  assert.equal(second.withdrawn.length, 1);
  assert.equal(second.withdrawn[0].subject, first.withdrawn[0].subject);
});
