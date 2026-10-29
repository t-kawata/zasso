// PX-308 @verifies C002
// A single-owner operation is the common case, and it is the case where a wrong role is
// least visible: one consumer leaves the operation with no implementer at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkOwnerRoles } from '../../.claude/scripts/smooth-sequences/lib/checks-distribution-map.mjs';

// [::TICKET::] PX-308 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-308 --for-spec --no-implementation-order`.
function singleOwner(unit) {
  return [{ packageId: 'p', units: [unit] }];
}

test('C002 a single-owner operation declaring consumer is a finding', () => {
  const result = checkOwnerRoles(singleOwner({ unitId: 'op-A', kind: 'operation', role: 'consumer' }));
  assert.equal(result.ok, false);
  assert.equal(result.code, 'OWNER_ROLE_UNDECLARED');
  assert.equal(result.unitId, 'op-A');
});

test('C002 a single-owner operation with no role is a finding', () => {
  const result = checkOwnerRoles(singleOwner({ unitId: 'op-A', kind: 'operation' }));
  assert.equal(result.ok, false);
  assert.equal(result.code, 'OWNER_ROLE_UNDECLARED');
});

test('C002 a single-owner implementer passes', () => {
  assert.equal(checkOwnerRoles(singleOwner({ unitId: 'op-A', kind: 'operation', role: 'implementer' })).ok, true);
});

test('C002 two implementers without declared surfaces fail', () => {
  const maps = [
    { packageId: 'p1', units: [{ unitId: 'op-A', kind: 'operation', role: 'implementer' }] },
    { packageId: 'p2', units: [{ unitId: 'op-A', kind: 'operation', role: 'implementer' }] },
  ];
  assert.equal(checkOwnerRoles(maps).code, 'OWNER_ROLE_UNDECLARED');
});

test('C002 two implementers with distinct surfaces pass', () => {
  const maps = [
    { packageId: 'p1', units: [{ unitId: 'op-A', kind: 'operation', role: 'implementer', surface: 'rest' }] },
    { packageId: 'p2', units: [{ unitId: 'op-A', kind: 'operation', role: 'implementer', surface: 'cli' }] },
  ];
  assert.equal(checkOwnerRoles(maps).ok, true);
});
