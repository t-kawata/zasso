import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveReadingsObligations } from '../../.claude/scripts/shared-obligations/predicates.mjs';

const OBLIGATION = Object.freeze({
  id: 'READ:ADVERSARIAL:S2',
  class: 'semantic',
  state: 'open',
  subject: 'S2',
  required: true,
});

// [::TICKET::] PX-292, PX-293 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-292|PX-293) --for-spec --no-implementation-order`.
function ruling(overrides = {}) {
  return {
    subject: 'S2',
    outcome: 'notASequence',
    reader: 'educe-sequences/generation-1',
    artifactDigest: 'art-1',
    ...overrides,
  };
}

// [::TICKET::] PX-292, PX-293 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-292|PX-293) --for-spec --no-implementation-order`.
function attack(overrides = {}) {
  return {
    obligationId: 'READ:ADVERSARIAL:S2',
    rulingId: 'S2',
    subject: 'S2',
    outcome: 'held',
    reader: 'educe-sequences/generation-1/attack',
    searched: { source: 'spec', path: 'spec.md', from: 1, to: 5, quote: 'the clause' },
    ...overrides,
  };
}

// [::TICKET::] PX-292, PX-293 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-292|PX-293) --for-spec --no-implementation-order`.
// [::TICKET::] PX-303 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-303 --for-spec --no-implementation-order`.
function resolve({ rulings = [ruling()], attacks = [], artifactDigest = 'art-1' } = {}) {
  return resolveReadingsObligations([OBLIGATION], {
    readings: { adversarial: rulings, attack: attacks },
    artifactDigest,
  })[0];
}

// @verifies C001
// [::TICKET::] PX-292 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-292 --for-spec --no-implementation-order`.
test('a ruling without an attack does not close the adversarial obligation', () => {
  const result = resolve();
  assert.equal(result.state, 'open');
  assert.equal(result.reason, 'MISSING_ATTACK');
});

// @verifies C001
// [::TICKET::] PX-292 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-292 --for-spec --no-implementation-order`.
test('a held ruling attack closes it, while broken and unresolved attacks do not', () => {
  assert.equal(resolve({ attacks: [attack()] }).state, 'closed');
  const broken = resolve({ attacks: [attack({ outcome: 'broken', counterexample: { source: 'spec', line: 2, quote: 'counter' } })] });
  assert.equal(broken.state, 'open');
  assert.equal(broken.reason, 'ATTACK_BROKEN');
  const unresolved = resolve({ attacks: [attack({ outcome: 'unresolved', reason: 'ambiguous' })] });
  assert.equal(unresolved.state, 'open');
  assert.equal(unresolved.reason, 'ATTACK_UNRESOLVED');
});

// @verifies C001
// [::TICKET::] PX-292 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-292 --for-spec --no-implementation-order`.
// @verifies C102
test('C102 a held ruling attack with a degenerate quote is invalid', () => {
  const result = resolve({
    attacks: [attack({ searched: { ...attack().searched, quote: '```' } })],
  });

  assert.equal(result.state, 'open');
  assert.equal(result.reason, 'ATTACK_INVALID');
});

test('a missing or stale ruling is named rather than assumed', () => {
  const missing = resolve({ rulings: [] });
  assert.equal(missing.state, 'open');
  assert.equal(missing.reason, 'MISSING_RULING');
  const stale = resolve({ rulings: [ruling({ artifactDigest: 'art-0' })] });
  assert.equal(stale.state, 'open');
  assert.equal(stale.reason, 'STALE_EVIDENCE');
});
