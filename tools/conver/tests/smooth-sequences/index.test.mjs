import { test } from 'node:test';
import assert from 'node:assert/strict';

import { indexArtifact } from '../../.claude/scripts/smooth-sequences/lib/index.mjs';
import { loadWorkspace } from '../../.claude/scripts/smooth-sequences/lib/workspace.mjs';
import { materializeSmoothWorkspace } from './helpers/workspace-fixture.mjs';

// [::TICKET::] PX-273 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-273 --for-spec --no-implementation-order`.
test('the index carries every operation, sequence, step, boundary, contract and view exactly once', () => {
  const workspace = materializeSmoothWorkspace();
  try {
    const index = indexArtifact(loadWorkspace(workspace.root));
    assert.equal(index.operationsById.size, 2);
    assert.equal(index.sequencesById.size, 1);
    assert.equal(index.stepsById.size, 2);
    assert.equal(index.boundariesById.size, 1);
    assert.equal(index.contractsByBoundary.size, 1);
    assert.equal(index.viewsByPackage.size, 2);
    assert.equal(index.stepsBySequence.get('A-1').length, 2);
    assert.equal(index.stepsByOperation.get('ProduceFact').length, 1);
    assert.deepEqual(index.duplicates, []);
  } finally {
    workspace.remove();
  }
});

test('a duplicate operation id is retained with both locations', () => {
  const workspace = materializeSmoothWorkspace();
  try {
    const loaded = loadWorkspace(workspace.root);
    loaded.artifact.operations.push({ ...loaded.artifact.operations[0] });
    const index = indexArtifact(loaded);
    assert.equal(index.duplicates.length, 1);
    assert.equal(index.duplicates[0].checkId, 'S1.duplicate-id');
    assert.match(index.duplicates[0].subject, /ProduceFact/);
  } finally {
    workspace.remove();
  }
});
