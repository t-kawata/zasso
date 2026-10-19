import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadWorkspace as loadOrderWorkspace } from '../../.claude/scripts/workspacify-order/lib/workspace.mjs';
import { loadWorkspace } from '../../.claude/scripts/smooth-sequences/lib/workspace.mjs';
import { materializeSmoothWorkspace } from './helpers/workspace-fixture.mjs';

// [::TICKET::] PX-273 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-273 --for-spec --no-implementation-order`.
test('the detector and the order plan read the same package set', () => {
  const workspace = materializeSmoothWorkspace();
  try {
    const order = loadOrderWorkspace(workspace.root);
    const smooth = loadWorkspace(workspace.root);
    const orderIds = order.treeManifest.workspace.packages.map((pkg) => pkg.id).sort();
    const smoothIds = smooth.treeManifest.workspace.packages.map((pkg) => pkg.id).sort();
    assert.deepEqual(smoothIds, orderIds);
    assert.equal(smooth.allocateManifest.contract_registry.length, 1);
  } finally {
    workspace.remove();
  }
});
