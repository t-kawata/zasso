import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { runCommand } from '../../.claude/scripts/smooth-sequences/run.mjs';
import { materializeSmoothWorkspace } from './helpers/workspace-fixture.mjs';

// [::TICKET::] PX-275 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-275 --for-spec --no-implementation-order`.

// [::TICKET::] PX-275 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-275 --for-spec --no-implementation-order`.
function snapshot(workspace) {
  return {
    artifact: readFileSync(workspace.artifactPath, 'utf8'),
    tree: readFileSync(workspace.treeManifestPath, 'utf8'),
    allocate: readFileSync(workspace.allocateManifestPath, 'utf8'),
    rules: readFileSync(workspace.rulesPath, 'utf8'),
    providerView: readFileSync(workspace.viewPathOf('pkg-0001'), 'utf8'),
    consumerView: readFileSync(workspace.viewPathOf('pkg-0002'), 'utf8'),
    providerRfc: readFileSync(workspace.rfcPathOf('pkg-0001'), 'utf8'),
    consumerRfc: readFileSync(workspace.rfcPathOf('pkg-0002'), 'utf8'),
  };
}

// @verifies C007
test('the detector leaves every generated and upstream file byte-identical', () => {
  const workspace = materializeSmoothWorkspace();
  try {
    const before = snapshot(workspace);
    const result = runCommand([workspace.root]);
    assert.equal(result.exitCode, 0);
    assert.deepEqual(snapshot(workspace), before);
  } finally {
    workspace.remove();
  }
});
