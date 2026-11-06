// PX-389 @verifies C001
// [::TICKET::] PX-389 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-389 --for-spec --no-implementation-order`.
/**
 * A seed's source segments are the union of its inventory refs and its authored claims.
 *
 * The tree publishes a category=segment ownership entry for a formula-bearing prose
 * segment. Allocate must carry that segment into the seed without mistaking it for an
 * inventory allocation row, or seed parity would expect a row that has no inventory item.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  collectPackageSegments,
  deriveExpectedAllocation,
} from '../../../.claude/scripts/workspacify-allocate/lib/allocation-model.mjs';

// [::TICKET::] PX-389 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-389 --for-spec --no-implementation-order`.
function manifest() {
  return {
    inventory: {
      objects: [
        { id: 'obj-000001', source_refs: [{ segment_id: 's-000001', line_start: 1, line_end: 4 }] },
        { id: 'obj-000002', source_refs: [{ segment_id: 's-000003', line_start: 9, line_end: 12 }] },
      ],
      claims: [],
      invariants: [],
      state_machines: [],
      error_codes: [],
      required_tests: [],
    },
    structure: {
      segments: [
        { id: 's-000001', line_start: 1, line_end: 4 },
        { id: 's-000002', line_start: 5, line_end: 8 },
        { id: 's-000003', line_start: 9, line_end: 12 },
      ],
    },
    workspace: {
      ownership: {
        entries: [
          { category: 'object', inventory_ref: 'obj-000001', canonical_name: 'Alpha', owner_package: 'pkg-a' },
          { category: 'segment', inventory_ref: 's-000002', canonical_name: 'segment s-000002', owner_package: 'pkg-a', segment_id: 's-000002' },
          { category: 'object', inventory_ref: 'obj-000002', canonical_name: 'Beta', owner_package: 'pkg-b' },
        ],
      },
    },
  };
}

test('C001 postcondition: an authored segment claim joins the inventory segments', () => {
  assert.deepEqual(
    collectPackageSegments({ manifest: manifest(), packageId: 'pkg-a' }),
    ['s-000001', 's-000002'],
  );
});

test('C001 boundary: a package with only inventory keeps its inventory segments', () => {
  assert.deepEqual(
    collectPackageSegments({ manifest: manifest(), packageId: 'pkg-b' }),
    ['s-000003'],
  );
});

test('C001 invariant: a segment claim is not an inventory allocation row', () => {
  const { expectedByPackage } = deriveExpectedAllocation({
    ownershipEntries: manifest().workspace.ownership.entries,
    packages: [{ id: 'pkg-a' }, { id: 'pkg-b' }],
  });

  assert.deepEqual(expectedByPackage.get('pkg-a'), [{
    category: 'object',
    inventory_ref: 'obj-000001',
    canonical_name: 'Alpha',
    role: 'semantic_owner',
  }]);
});
