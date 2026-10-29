// PX-330 @verifies C005
// When several packages implement one operation, a sequence edge reaches every one of
// them. Treating only the first sorted implementer as the consumer loses a real
// prerequisite for the others.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  checkPlacement,
  ticketPrerequisites,
} from '../../.claude/scripts/sequences-slice/lib/implementation-order.mjs';

/** A sequence whose earlier step produces the fact the later step consumes. */
// [::TICKET::] PX-330 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-330 --for-spec --no-implementation-order`.
function artifact() {
  return {
    sequences: [{ id: 'S', outcome: 'realized' }],
    steps: [
      { id: 's1', stepId: 's1', sequence: 'S', operation: 'A', order: 1, contract: { produces: ['fact:X'] } },
      { id: 's2', stepId: 's2', sequence: 'S', operation: 'B', order: 2, contract: { consumes: ['fact:X'] } },
    ],
  };
}

test('C005 a consumer operation implemented by two packages carries the provider package', () => {
  const operationOwners = new Map([
    ['A', { packageId: 'pkg-1', implementerPackageIds: ['pkg-1'] }],
    ['B', { packageId: 'pkg-1', implementerPackageIds: ['pkg-1', 'pkg-2'] }],
  ]);
  const tickets = [{
    id: 1,
    phaseId: 0,
    distribution: {
      units: [{ unitId: 'op-B', kind: 'operation', obligation: { mode: 'implement' } }],
    },
  }];

  const result = ticketPrerequisites({
    tickets,
    graph: { edges: [] },
    artifact: artifact(),
    operationOwners,
    packageId: 'pkg-2',
  });

  assert.ok(result.prerequisites.get('P0-1')?.some(
    (entry) => entry.package === 'pkg-1' && entry.kind === 'implementation',
  ), JSON.stringify([...result.prerequisites.entries()]));
});

test('C005 the provider-first order accepts the consumer ticket placement', () => {
  const tickets = [{
    id: 1,
    phaseId: 0,
    prerequisites: [{ package: 'pkg-1', kind: 'implementation', source: 'sequence:S:s1->s2' }],
  }];
  const placement = checkPlacement({
    tickets,
    packageId: 'pkg-2',
    packageOrder: { 'pkg-1': 0, 'pkg-2': 1 },
    packageTickets: { 'pkg-1': { phases: [] } },
  });
  assert.deepEqual(placement.findings, []);
});
