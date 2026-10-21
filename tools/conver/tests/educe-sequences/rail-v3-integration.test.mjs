// [::TICKET::] PX-294 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-294 --for-spec --no-implementation-order`.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { preserveV3Surfaces } from '../../.claude/scripts/educe-sequences/rail/artifact.mjs';
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

// @verifies C001
test('a preserved v3 artifact still validates after a v2 composition', () => {
  const artifact = preserveV3Surfaces(minimalV3Artifact(), minimalV2Artifact());
  assert.equal(artifact.schema_version, 3);
  assert.deepEqual(validateArtifactShape(artifact, schema), []);
});
