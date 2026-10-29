// [::TICKET::] PX-310 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-310 --for-spec --no-implementation-order`.
// PX-310 @verifies C007
// Only an explicit undecided candidate is not a claim. An absent candidate is a
// stale view and must be judged, not silently skipped.
import test from 'node:test';
import assert from 'node:assert/strict';

import { checkOwnerRoles } from '../../.claude/scripts/smooth-sequences/lib/checks-distribution-map.mjs';

test('C007 a sole owner with an absent roleCandidate is a finding', () => {
  const maps = [{ packageId: 'pkg-1', units: [{ unitId: 'op-1', kind: 'operation', role: 'consumer' }] }];
  const result = checkOwnerRoles(maps, {
    roleCandidates: new Map(),
    activeOperationUnits: new Set(['op-1']),
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'OWNER_ROLE_UNDECLARED');
});

// [::TICKET::] PX-317 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-317 --for-spec --no-implementation-order`.
test('C007 an explicit undecided candidate with no implementer is a finding', () => {
  const maps = [
    { packageId: 'pkg-1', units: [{ unitId: 'op-1', kind: 'operation', role: 'consumer' }] },
    { packageId: 'pkg-2', units: [{ unitId: 'op-1', kind: 'operation', role: 'consumer' }] },
  ];
  const result = checkOwnerRoles(maps, {
    roleCandidates: new Map([['op-1', 'undecided']]),
    activeOperationUnits: new Set(['op-1']),
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'OWNER_ROLE_UNDECLARED');
});

test('C007 an explicit undecided candidate with one implementer passes', () => {
  const maps = [
    { packageId: 'pkg-1', units: [{ unitId: 'op-1', kind: 'operation', role: 'implementer' }] },
    { packageId: 'pkg-2', units: [{ unitId: 'op-1', kind: 'operation', role: 'consumer' }] },
  ];
  const result = checkOwnerRoles(maps, {
    roleCandidates: new Map([['op-1', 'undecided']]),
    activeOperationUnits: new Set(['op-1']),
  });
  assert.equal(result.ok, true);
});

test('C007 an explicit implementer sole owner passes', () => {
  const maps = [{ packageId: 'pkg-1', units: [{ unitId: 'op-1', kind: 'operation', role: 'implementer' }] }];
  const result = checkOwnerRoles(maps, {
    roleCandidates: new Map([['op-1', 'implementer']]),
    activeOperationUnits: new Set(['op-1']),
  });
  assert.equal(result.ok, true);
});
