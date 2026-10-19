import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readArtifactSchema, validateArtifactShape } from '../../.claude/scripts/educe-sequences/rail/load.mjs';
import { minimalV2Artifact, minimalV3Artifact } from '../smooth-sequences/helpers/workspace-fixture.mjs';

const schema = readArtifactSchema();

// [::TICKET::] PX-273 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-273 --for-spec --no-implementation-order`.
test('a v2 artifact remains valid after the v3 schema addition', () => {
  const artifact = minimalV2Artifact();
  assert.deepEqual(validateArtifactShape(artifact, schema), []);
});

test('a v3 artifact validates its typed step contract and contribution field', () => {
  const artifact = minimalV3Artifact();
  assert.deepEqual(validateArtifactShape(artifact, schema), []);
  assert.equal(artifact.steps[0].contract.crosses[0], 'boundary-001');
  assert.equal(artifact.operations[0].registry_contribution, 'required');
});
