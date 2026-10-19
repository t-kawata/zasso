import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readArtifactSchema, validateArtifactShape } from '../../.claude/scripts/educe-sequences/rail/load.mjs';
import { minimalV2Artifact, minimalV3Artifact } from './helpers/workspace-fixture.mjs';

const schema = readArtifactSchema();

// [::TICKET::] PX-273 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-273 --for-spec --no-implementation-order`.
// @verifies C002
test('a v3 artifact with every typed step fields validates', () => {
  assert.deepEqual(validateArtifactShape(minimalV3Artifact(), schema), []);
});

test('a v3 step without a contract is refused by step id', () => {
  const artifact = minimalV3Artifact();
  delete artifact.steps[0].contract;
  const problems = validateArtifactShape(artifact, schema);
  assert.ok(problems.some((problem) => problem.pin === 'steps[0].contract'));
});

test('a v3 contract fact without a factId is refused', () => {
  const artifact = minimalV3Artifact();
  delete artifact.steps[0].contract.post[0].factId;
  const problems = validateArtifactShape(artifact, schema);
  assert.ok(problems.some((problem) => problem.pin === 'steps[0].contract.post[0].factId'));
});

test('a v3 operation without registry_contribution is refused', () => {
  const artifact = minimalV3Artifact();
  delete artifact.operations[0].registry_contribution;
  const problems = validateArtifactShape(artifact, schema);
  assert.ok(problems.some((problem) => problem.pin === 'operations[0].registry_contribution'));
});

test('a v2 artifact is never asked for a v3 field', () => {
  const artifact = minimalV2Artifact();
  assert.equal(artifact.schema_version, 2);
  assert.deepEqual(validateArtifactShape(artifact, schema), []);
});
