import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildArtifact, isSameRevision, preserveV3Surfaces } from '../../.claude/scripts/educe-sequences/rail/artifact.mjs';
import { readSpecification } from '../../.claude/scripts/educe-sequences/rail/load.mjs';
import { runCommand } from '../../.claude/scripts/smooth-sequences/run.mjs';
import { materializeSmoothWorkspace, minimalV2Artifact, minimalV3Artifact } from '../smooth-sequences/helpers/workspace-fixture.mjs';

// [::TICKET::] PX-294 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-294 --for-spec --no-implementation-order`.
const SPEC_PATH = new URL('./fixtures/spec/ledger.md', import.meta.url).pathname;
const RUN_INPUT = JSON.parse(readFileSync(new URL('./fixtures/spec/ledger.run.json', import.meta.url), 'utf8'));

/** A typed contract with every field the v3 schema requires. */
// [::TICKET::] PX-294 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-294 --for-spec --no-implementation-order`.
function typedContract() {
  return { pre: [], post: [], invariants: [], consumes: [], produces: [], errors: [], crosses: [] };
}

/** Compose the ledger artifact from its recorded readings. */
// [::TICKET::] PX-294 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-294 --for-spec --no-implementation-order`.
function compose(overrides = {}) {
  return buildArtifact({
    specPath: SPEC_PATH,
    spec: readSpecification(SPEC_PATH),
    declaration: RUN_INPUT.declaration,
    readings: {
      sequences: RUN_INPUT.readings.sequences,
      steps: RUN_INPUT.readings.steps,
      operations: RUN_INPUT.readings.operations,
      adjudications: RUN_INPUT.readings.adjudications,
    },
    supplied: 'supplied-digest',
    suppliedDocuments: {},
    ...overrides,
  });
}

/** The composed artifact with the v3 fields a migration would have added. */
// [::TICKET::] PX-294 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-294 --for-spec --no-implementation-order`.
function v3Variant(composed) {
  return {
    ...composed,
    schema_version: 3,
    steps: composed.steps.map((step) => ({ ...step, contract: typedContract(), contract_prose: step.contract })),
    operations: composed.operations.map((operation) => ({ ...operation, registry_contribution: 'required', boundary_effects: [] })),
    groundedObjects: [{ object: 'settlement', ground: 'the settlement is an object' }],
    boundary_grounds: [{ boundary: 'boundary-1', ground: 'the boundary is a value edge', source: { reasonCode: 'value_only' } }],
    migration: { from_schema_version: 2, to_schema_version: 3 },
    sequence_flow_grounds: [{ sequence: 'settlement', ground: 'the sequence is stated once' }],
  };
}

// @verifies C001
test('a v3 artifact is preserved by id and is byte-identical when declaration and readings are unchanged', () => {
  const composed = compose();
  const previous = v3Variant(composed);
  const merged = preserveV3Surfaces(previous, composed);

  assert.equal(merged.schema_version, 3);
  assert.deepEqual(merged.steps[0].contract, previous.steps[0].contract);
  assert.equal(merged.steps[0].contract_prose, previous.steps[0].contract_prose);
  assert.equal(merged.operations[0].registry_contribution, 'required');
  assert.deepEqual(merged.migration, previous.migration);
  assert.equal(`${JSON.stringify(merged, null, 2)}\n`, `${JSON.stringify(previous, null, 2)}\n`);
  assert.equal(isSameRevision(previous, composed), true);
});

// @verifies C002
test('a v2 previous artifact is left as the composed v2 artifact', () => {
  const composed = compose();
  const previous = { ...composed, schema_version: 2 };
  const merged = preserveV3Surfaces(previous, composed);

  assert.deepEqual(merged, composed);
  assert.equal(merged.schema_version, 2);
  assert.equal('registry_contribution' in merged.operations[0], false);
});

// @verifies C003
test('a revision change carries no v3 field across the boundary', () => {
  const composed = compose();
  const previous = v3Variant(composed);
  const changed = { ...previous, spec: { ...previous.spec, sha256: 'another-spec' } };
  const merged = preserveV3Surfaces(changed, composed);

  assert.equal(isSameRevision(changed, composed), false);
  assert.equal(merged.schema_version, 2);
  assert.equal(merged.steps[0].contract, composed.steps[0].contract);
  assert.equal(merged.operations[0].registry_contribution, undefined);
  assert.equal(merged.migration, undefined);
});

// @verifies C004
test('a new id receives no copied v3 field and keeps its prose as contract_prose', () => {
  const composed = compose();
  const previous = v3Variant(composed);
  const withNewIds = {
    ...composed,
    steps: [
      ...composed.steps,
      { id: 'new-step', sequence: 'new-sequence', operation: 'NewOperation', line: 99, quote: 'the new step', contract: 'the new step prose' },
    ],
    operations: [
      ...composed.operations,
      { id: 'NewOperation', disposition: 'active', position: 'singleStep' },
    ],
  };
  const merged = preserveV3Surfaces(previous, withNewIds);
  const newStep = merged.steps.find((step) => step.id === 'new-step');
  const newOperation = merged.operations.find((operation) => operation.id === 'NewOperation');

  assert.equal(newStep.contract, undefined);
  assert.equal(newStep.contract_prose, 'the new step prose');
  assert.equal(newOperation.registry_contribution, undefined);
  assert.equal(merged.schema_version, 3);
});

// @verifies C001
test('buildArtifact preserves the previous v3 artifact when the inputs are unchanged', () => {
  const composed = compose();
  const previous = v3Variant(composed);
  const artifact = compose({ previousArtifact: previous });

  assert.equal(artifact.schema_version, 3);
  assert.deepEqual(artifact.steps[0].contract, previous.steps[0].contract);
  assert.equal(artifact.operations[0].registry_contribution, 'required');
  assert.equal(`${JSON.stringify(artifact, null, 2)}\n`, `${JSON.stringify(previous, null, 2)}\n`);
});

// @verifies C006
test('a preserved v3 artifact is not a smooth downgrade', () => {
  const merged = preserveV3Surfaces(minimalV3Artifact(), minimalV2Artifact());
  assert.equal(merged.schema_version, 3);

  const workspace = materializeSmoothWorkspace({ artifact: merged });
  try {
    const result = runCommand([workspace.root, '--audit'], { stdout: () => {}, stderr: () => {} });
    assert.equal(result.report.downgrade, null);
  } finally {
    workspace.remove();
  }
});
