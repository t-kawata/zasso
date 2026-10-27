// PX-323 @verifies C001 C003
// The display names the order it actually has: the stage-1 DAG order is the build order,
// and the artifact-derived sidecar is the implementation order.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';


import { materializeOrderWorkspace } from './helpers/order-workspace.mjs';
import { buildModel } from '../../.claude/scripts/workspacify-order/lib/levels.mjs';
import { renderPlan } from '../../.claude/scripts/workspacify-order/lib/render.mjs';

// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
function fixture() {
  return materializeOrderWorkspace({
    packages: ['pkg-0001', 'pkg-0002', 'pkg-0003'],
    edges: [
      ['pkg-0002', 'pkg-0001'],
      ['pkg-0003', 'pkg-0001'],
    ],
    levels: [['pkg-0001'], ['pkg-0002', 'pkg-0003']],
  });
}

// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
function modelOf(workspace) {
  return buildModel({
    root: workspace.root,
    treeManifest: workspace.treeManifest,
    allocateManifest: workspace.allocateManifest,
  });
}

test('C001 without a sidecar the display says build order', (t) => {
  const workspace = fixture();
  t.after(() => workspace.remove());
  const model = modelOf(workspace);
  assert.equal(model.orderSource, 'build');
  const text = renderPlan(model);
  assert.match(text, /build order —/);
  assert.match(text, /implementation order not yet derivable/);
  assert.doesNotMatch(text, /implementation order —/);
});

test('C001 with a sidecar the implementation order is primary and the build order is preserved', (t) => {
  const workspace = fixture();
  t.after(() => workspace.remove());
  writeFileSync(join(workspace.root, 'WORKSPACIFY-IMPLEMENTATION-ORDER.json'), JSON.stringify({
    schemaVersion: 1,
    buildOrder: { serial: ['pkg-0001', 'pkg-0002', 'pkg-0003'], levels: [['pkg-0001'], ['pkg-0002', 'pkg-0003']] },
    implementationOrder: { serial: ['pkg-0001', 'pkg-0003', 'pkg-0002'], levels: [['pkg-0001'], ['pkg-0003'], ['pkg-0002']] },
    prerequisites: [],
  }));
  const model = modelOf(workspace);
  assert.equal(model.orderSource, 'implementation');
  assert.deepEqual(model.implementationSerial, ['pkg-0001', 'pkg-0003', 'pkg-0002']);
  assert.deepEqual(model.buildSerial, ['pkg-0001', 'pkg-0002', 'pkg-0003']);
  const text = renderPlan(model);
  assert.match(text, /implementation order —/);
  assert.match(text, /build order preserved separately/);
  assert.match(text, /pkg-0001 → pkg-0002 → pkg-0003/);
});

test('C001 without a sidecar the artifact-derived order is used and the build order is preserved', (t) => {
  const workspace = fixture();
  t.after(() => workspace.remove());
  writeFileSync(join(workspace.root, 'DESIGN-sequences.json'), JSON.stringify({ sequences: [], steps: [] }));
  for (const id of ['pkg-0001', 'pkg-0002', 'pkg-0003']) {
    writeFileSync(join(workspace.directoryOf(id), 'SEQUENCES.json'), JSON.stringify({
      packageId: id,
      ownedOperationUnits: [],
      ownedSequenceUnits: [],
      crossBoundarySequenceUnits: [],
      obligationUnits: [],
    }));
  }
  const allocateManifest = {
    ...workspace.allocateManifest,
    contract_registry: [{ boundary_id: 'boundary-001', provider_package: 'pkg-0003', consumer_package: 'pkg-0002', clauses: {} }],
  };
  const model = buildModel({ root: workspace.root, treeManifest: workspace.treeManifest, allocateManifest });
  assert.equal(model.orderSource, 'implementation');
  assert.equal(model.orderSourceDetail, 'derived');
  assert.deepEqual(model.implementationSerial, ['pkg-0001', 'pkg-0003', 'pkg-0002']);
  const text = renderPlan(model);
  assert.match(text, /derived from the artifact/);
  assert.match(text, /build order preserved separately/);
});

test('C003 an implementation sidecar that omits a package is refused', (t) => {
  const workspace = fixture();
  t.after(() => workspace.remove());
  writeFileSync(join(workspace.root, 'WORKSPACIFY-IMPLEMENTATION-ORDER.json'), JSON.stringify({
    implementationOrder: { serial: ['pkg-0001', 'pkg-0002'], levels: [['pkg-0001'], ['pkg-0002']] },
  }));
  assert.throws(() => modelOf(workspace), /omits pkg-0003/);
});
