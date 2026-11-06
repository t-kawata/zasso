// PX-385 @verifies C005
// The view and the downstream checks read the status envelope the producer carried.
// A status that is a member of OperationStatus is not a C6 finding; a non-member is.
import test from 'node:test';
import assert from 'node:assert/strict';

import { checkStatusTransitionClosure } from '../../.claude/scripts/sequences-slice/verify.mjs';

const MEMBERS = new Map([['OperationStatus', { memberSet: new Set(['Pending', 'Settled']) }]]);

/** An artifact with one active operation and its status envelope. */
// [::TICKET::] PX-385 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-385 --for-spec --no-implementation-order`.
function artifactWith(overrides = {}) {
  return {
    operations: [{
      id: 'Admit',
      disposition: 'active',
      initial_status: 'Pending',
      allowed_status_transitions: { Pending: ['Settled'], Settled: [] },
      ...overrides,
    }],
  };
}

test('C005 a declared status envelope has no C6 finding', () => {
  assert.deepEqual(checkStatusTransitionClosure(artifactWith(), MEMBERS), []);
});

test('C005 an initial status outside OperationStatus is a C6 finding', () => {
  const findings = checkStatusTransitionClosure(artifactWith({ initial_status: 'Unknown' }), MEMBERS);
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /Unknown/);
});

test('C005 a transition target outside OperationStatus is a C6 finding', () => {
  const findings = checkStatusTransitionClosure(
    artifactWith({ allowed_status_transitions: { Pending: ['Nope'], Nope: [] } }),
    MEMBERS,
  );
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /Nope/);
});
