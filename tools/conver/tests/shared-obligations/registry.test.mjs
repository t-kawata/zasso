import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveObligations } from '../../.claude/scripts/shared-obligations/registry.mjs';

const inputs = {
  census: { operations: ['OpA', 'OpB'] },
  declaration: { entries: [{ id: 'A-1' }], sections: [{ id: 's1' }] },
  artifact: {
    operations: [{ id: 'OpA', disposition: 'active' }, { id: 'OpB', disposition: 'active' }],
    sequences: [{ id: 'A-1', outcome: 'direct' }],
    steps: [],
  },
  treeManifest: { workspace: { packages: [] }, dependencies: { boundaries: [] } },
  allocateManifest: { contract_registry: [] },
  packages: [],
  readings: {},
};

// [::TICKET::] PX-289 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-289 --for-spec --no-implementation-order`.
test('registry ids are deterministic and unique', () => {
  const first = deriveObligations(inputs);
  const second = deriveObligations(inputs);
  assert.deepEqual(first.map((o) => o.id), second.map((o) => o.id));
  assert.equal(new Set(first.map((o) => o.id)).size, first.length);
  assert.ok(first.some((o) => o.id === 'CENSUS:BIJECTION:operations'));
});

// [::TICKET::] PX-289 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-289 --for-spec --no-implementation-order`.
test('every census member has an obligation and no id repeats', () => {
  const obligations = deriveObligations(inputs);
  const ids = new Set(obligations.map((o) => o.id));
  assert.ok(ids.has('CENSUS:BIJECTION:operations'));
  assert.ok(ids.has('CENSUS:BIJECTION:entries'));
  assert.ok(ids.has('CENSUS:BIJECTION:sections'));
  assert.equal(ids.size, obligations.length);
});
