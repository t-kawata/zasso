// [::TICKET::] PX-275 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-275 --for-spec --no-implementation-order`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { readArtifactSchema, validateArtifactShape } from '../../.claude/scripts/educe-sequences/rail/load.mjs';
import { layerBWithheld } from '../../.claude/scripts/smooth-sequences/lib/checks-layer-b.mjs';
import { indexArtifact } from '../../.claude/scripts/smooth-sequences/lib/index.mjs';
import { loadWorkspace } from '../../.claude/scripts/smooth-sequences/lib/workspace.mjs';
import { materializeSmoothWorkspace, minimalV2Artifact, minimalV3Artifact } from './helpers/workspace-fixture.mjs';

const schema = readArtifactSchema();

// [::TICKET::] PX-273 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-273 --for-spec --no-implementation-order`.
// @verifies C001
test('a v2 artifact is valid under the schema and withholds Layer B', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    const before = readFileSync(workspace.artifactPath, 'utf8');
    const loaded = loadWorkspace(workspace.root);
    assert.deepEqual(validateArtifactShape(loaded.artifact, schema), []);
    const index = indexArtifact(loaded);
    assert.deepEqual(layerBWithheld(index), [{ layer: 'B', reason: 'v3 step contract absent' }]);
    assert.equal(readFileSync(workspace.artifactPath, 'utf8'), before);
  } finally {
    workspace.remove();
  }
});

test('a v3 artifact is valid and carries the typed contract', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV3Artifact() });
  try {
    const loaded = loadWorkspace(workspace.root);
    assert.deepEqual(validateArtifactShape(loaded.artifact, schema), []);
    assert.equal(loaded.artifact.steps[0].contract.post[0].factId, 'order_id');
  } finally {
    workspace.remove();
  }
});
