// PX-389 @verifies C002
// [::TICKET::] PX-389 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-389 --for-spec --no-implementation-order`.
/**
 * A pass is attributable only to the check set that produced it.
 *
 * The digest is computed from the serializable registry descriptors and the closure gate
 * ids, so a check added or changed after a pass makes that pass visibly older. Recording
 * it changes no verdict; it only makes the record comparable.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCheckSetRecord,
  computeCheckSetDigest,
} from '../../.claude/scripts/smooth-sequences/lib/check-set.mjs';
import { CHECK_REGISTRY } from '../../.claude/scripts/smooth-sequences/lib/check-status.mjs';
import { CLOSURE_GATES } from '../../.claude/scripts/smooth-sequences/lib/closure-gates.mjs';

const GATES = CLOSURE_GATES.map((gate) => gate.script);

test('C002 invariant: the digest is deterministic for the same registry and gates', () => {
  const first = computeCheckSetDigest({ registry: CHECK_REGISTRY, closureGateIds: GATES });
  const second = computeCheckSetDigest({ registry: CHECK_REGISTRY, closureGateIds: GATES });

  assert.equal(first, second);
  assert.match(first, /^[0-9a-f]{64}$/);
});

test('C002 invariant: a new check descriptor changes the digest', () => {
  const current = computeCheckSetDigest({ registry: CHECK_REGISTRY, closureGateIds: GATES });
  const extended = computeCheckSetDigest({
    registry: [...CHECK_REGISTRY, { id: 'S9.extra', family: 'test', requires: [], claims: 'spec' }],
    closureGateIds: GATES,
  });
  const changedRequirement = computeCheckSetDigest({
    registry: CHECK_REGISTRY.map((descriptor) => (
      descriptor.id === CHECK_REGISTRY[0].id
        ? { ...descriptor, requires: [...descriptor.requires, 'formula_ids'] }
        : descriptor
    )),
    closureGateIds: GATES,
  });

  assert.notEqual(extended, current);
  assert.notEqual(changedRequirement, current);
});

test('C002 invariant: a closure gate change changes the digest', () => {
  const current = computeCheckSetDigest({ registry: CHECK_REGISTRY, closureGateIds: GATES });

  assert.notEqual(computeCheckSetDigest({ registry: CHECK_REGISTRY, closureGateIds: [...GATES, 'extra-gate.js'] }), current);
});

test('C002 precondition: a previous digest is compared and reported stale', () => {
  const previous = buildCheckSetRecord('a'.repeat(64));

  assert.equal(previous.previousDigest, 'a'.repeat(64));
  assert.equal(previous.stale, true);
  assert.match(previous.digest, /^[0-9a-f]{64}$/);
});

test('C002 precondition: a stored status without a digest is a previous check set', () => {
  const legacy = buildCheckSetRecord(null);

  assert.equal(legacy.previousDigest, null);
  assert.equal(legacy.stale, true);
});

test('C002 precondition: no previous status is not stale', () => {
  const first = buildCheckSetRecord(undefined);

  assert.equal(first.previousDigest, null);
  assert.equal(first.stale, false);
});

test('C002 precondition: the running digest is not stale against itself', () => {
  const current = buildCheckSetRecord(null);
  const repeated = buildCheckSetRecord(current.digest);

  assert.equal(repeated.stale, false);
});
