import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { runCommand } from '../../.claude/scripts/smooth-sequences/run.mjs';
import { materializeSmoothWorkspace } from './helpers/workspace-fixture.mjs';

// [::TICKET::] PX-273 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-273 --for-spec --no-implementation-order`.
function snapshot(root) {
  return {
    artifact: readFileSync(join(root, 'GaiaSekkeiShiyousho_v32-sequences.json'), 'utf8'),
    tree: readFileSync(join(root, 'WORKSPACIFY-TREE-MANIFEST.json'), 'utf8'),
    allocate: readFileSync(join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), 'utf8'),
    providerView: readFileSync(join(root, 'crates/protocol/pkg-0001/SEQUENCES.json'), 'utf8'),
    consumerView: readFileSync(join(root, 'crates/protocol/pkg-0002/SEQUENCES.json'), 'utf8'),
    providerRfc: readFileSync(join(root, 'crates/protocol/pkg-0001/RFC.md'), 'utf8'),
    consumerRfc: readFileSync(join(root, 'crates/protocol/pkg-0002/RFC.md'), 'utf8'),
  };
}

// @verifies C007
test('the detector leaves every generated and upstream file byte-identical', () => {
  const workspace = materializeSmoothWorkspace();
  try {
    const before = snapshot(workspace.root);
    const result = runCommand([workspace.root]);
    assert.equal(result.exitCode, 0);
    assert.deepEqual(snapshot(workspace.root), before);
  } finally {
    workspace.remove();
  }
});
