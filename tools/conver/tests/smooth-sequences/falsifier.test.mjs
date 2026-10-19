import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

import { runCommand } from '../../.claude/scripts/smooth-sequences/run.mjs';
import { materializeSmoothWorkspace } from './helpers/workspace-fixture.mjs';

// [::TICKET::] PX-273 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-273 --for-spec --no-implementation-order`.
// @verifies C010
test('planting a defect turns the detector red and removing it restores green', () => {
  const workspace = materializeSmoothWorkspace();
  try {
    assert.equal(runCommand([workspace.root]).exitCode, 0);
    const allocate = JSON.parse(readFileSync(workspace.allocateManifestPath, 'utf8'));
    delete allocate.contract_registry[0].clauses.preconditions;
    writeFileSync(workspace.allocateManifestPath, JSON.stringify(allocate, null, 2));
    const red = runCommand([workspace.root]);
    assert.equal(red.exitCode, 1);
    assert.ok(red.report.findings.some((finding) => finding.checkId === 'S4.boundary-clause-missing'));
    allocate.contract_registry[0].clauses.preconditions = ['the identity material is present'];
    writeFileSync(workspace.allocateManifestPath, JSON.stringify(allocate, null, 2));
    assert.equal(runCommand([workspace.root]).exitCode, 0);
  } finally {
    workspace.remove();
  }
});
