import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkBoundaryClauses } from '../../.claude/scripts/smooth-sequences/lib/checks-layer-a.mjs';
import { checkDangers } from '../../.claude/scripts/smooth-sequences/lib/checks-danger.mjs';
import { indexArtifact } from '../../.claude/scripts/smooth-sequences/lib/index.mjs';
import { migrateArtifactToV3, renderArtifact } from '../../.claude/scripts/smooth-sequences/lib/migrate-v3.mjs';
import { loadWorkspace } from '../../.claude/scripts/smooth-sequences/lib/workspace.mjs';
import {
  defaultAllocateManifest,
  defaultContractRegistry,
  materializeSmoothWorkspace,
  minimalV2Artifact,
} from './helpers/workspace-fixture.mjs';

// [::TICKET::] PX-275 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-275 --for-spec --no-implementation-order`.

function migrationInput(workspace) {
  const loaded = loadWorkspace(workspace.root);
  return {
    artifact: loaded.artifact,
    treeManifest: loaded.treeManifest,
    allocateManifest: loaded.allocateManifest,
    packages: loaded.packages,
  };
}

// @verifies C001
test('C001 the migration preserves every operation, sequence and step id', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    const input = migrationInput(workspace);
    const v3 = migrateArtifactToV3(input);
    assert.equal(v3.schema_version, 3);
    assert.deepEqual(v3.operations.map((row) => row.id), input.artifact.operations.map((row) => row.id));
    assert.deepEqual(v3.sequences.map((row) => row.id), input.artifact.sequences.map((row) => row.id));
    assert.deepEqual(v3.steps.map((row) => row.id), input.artifact.steps.map((row) => row.id));
    assert.equal(v3.migration.from_schema_version, 2);
    assert.equal(v3.migration.to_schema_version, 3);
  } finally {
    workspace.remove();
  }
});

// @verifies C002
test('C002 a second migration run is byte-identical', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    const first = migrateArtifactToV3(migrationInput(workspace));
    const second = migrateArtifactToV3({ ...migrationInput(workspace), artifact: first });
    assert.equal(renderArtifact(second), renderArtifact(first));
    assert.equal(second.migration.source_digest, first.migration.source_digest);
  } finally {
    workspace.remove();
  }
});

// @verifies C001
// [::TICKET::] PX-283 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-283 --for-spec --no-implementation-order`.
test('C001 the v2 prose contract is preserved beside the typed contract', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    const input = migrationInput(workspace);
    const v3 = migrateArtifactToV3(input);
    for (const [index, step] of v3.steps.entries()) {
      assert.equal(step.contract_prose, input.artifact.steps[index].contract);
      assert.equal(typeof step.contract, 'object');
    }
    assert.equal(renderArtifact(migrateArtifactToV3({ ...input, artifact: v3 })), renderArtifact(v3));
  } finally {
    workspace.remove();
  }
});

test('the migration derives the crossing and the typed contract from structured records', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    const v3 = migrateArtifactToV3(migrationInput(workspace));
    for (const step of v3.steps) {
      assert.deepEqual(step.contract.crosses, ['boundary-001']);
    }
    assert.ok(v3.steps[0].contract.post.length > 0);
    assert.ok(v3.steps[1].contract.pre.length > 0);
    assert.ok(v3.steps[0].contract.produces.includes('object:Order') || v3.steps[0].contract.produces.some((fact) => fact.startsWith('boundary:')));
    assert.equal(v3.operations[0].registry_contribution, 'required');
    assert.ok(v3.operations[0].boundary_effects.some((effect) => effect.boundary === 'boundary-001' && effect.direction === 'provides'));
    assert.ok(v3.operations[1].boundary_effects.some((effect) => effect.boundary === 'boundary-001' && effect.direction === 'consumes'));
  } finally {
    workspace.remove();
  }
});

// @verifies C006
test('C006 an annotation decides the contribution value and its ground', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    const input = migrationInput(workspace);
    const v3 = migrateArtifactToV3({
      ...input,
      annotations: {
        operations: {
          ProduceFact: {
            registry_contribution: 'not_required',
            registry_contribution_ground: 'the object is derived, not acted on',
          },
        },
      },
    });
    const produce = v3.operations.find((operation) => operation.id === 'ProduceFact');
    assert.equal(produce.registry_contribution, 'not_required');
    assert.equal(produce.registry_contribution_ground, 'the object is derived, not acted on');
    assert.equal(v3.operations.find((operation) => operation.id === 'ConsumeFact').registry_contribution, 'required');
  } finally {
    workspace.remove();
  }
});

// @verifies C006
test('C006 an excluded operation is grounded by its disposition, not by a prose match', () => {
  const artifact = minimalV2Artifact();
  artifact.operations[0].disposition = 'excluded';
  artifact.operations[0].position = 'excluded';
  const workspace = materializeSmoothWorkspace({ artifact });
  try {
    const v3 = migrateArtifactToV3(migrationInput(workspace));
    const produce = v3.operations.find((operation) => operation.id === 'ProduceFact');
    assert.equal(produce.registry_contribution, 'not_required');
    assert.match(produce.registry_contribution_ground, /disposition excluded/);
  } finally {
    workspace.remove();
  }
});

// @verifies C006
test('C006 an @object operation id never becomes a grounded object', () => {
  const artifact = minimalV2Artifact();
  artifact.operations.push({
    ...artifact.operations[0],
    id: '@object:Order',
    disposition: 'excluded',
    position: 'excluded',
    evidence: { note: 'derived: the order is a view over one record' },
  });
  const workspace = materializeSmoothWorkspace({ artifact });
  try {
    const v3 = migrateArtifactToV3(migrationInput(workspace));
    assert.deepEqual(v3.groundedObjects, []);
  } finally {
    workspace.remove();
  }
});

test('C006 a declared groundedObjects row is preserved', () => {
  const artifact = minimalV2Artifact();
  artifact.groundedObjects = [{ object: 'Order', ground: 'derived: a view over one record' }];
  const workspace = materializeSmoothWorkspace({ artifact });
  try {
    const v3 = migrateArtifactToV3(migrationInput(workspace));
    assert.deepEqual(v3.groundedObjects, [{ object: 'Order', ground: 'derived: a view over one record' }]);
  } finally {
    workspace.remove();
  }
});

test('S4 reports a contract with neither source_refs nor a ground, and accepts a ground', () => {
  const registry = defaultContractRegistry();
  registry[0].source_refs = [];
  const bare = materializeSmoothWorkspace({ artifact: minimalV2Artifact(), allocateManifest: defaultAllocateManifest(registry) });
  try {
    const findings = checkBoundaryClauses(indexArtifact(loadWorkspace(bare.root)));
    assert.ok(findings.some((finding) => finding.checkId === 'S4.contract-source-refs-missing'));
  } finally {
    bare.remove();
  }

  registry[0].source_refs_ground = 'the contract is the conformance suite fixture set';
  const grounded = materializeSmoothWorkspace({ artifact: minimalV2Artifact(), allocateManifest: defaultAllocateManifest(registry) });
  try {
    const findings = checkBoundaryClauses(indexArtifact(loadWorkspace(grounded.root)));
    assert.equal(findings.filter((finding) => finding.checkId === 'S4.contract-source-refs-missing').length, 0);
  } finally {
    grounded.remove();
  }
});

test('a grounded object is not an orphan', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    const v3 = migrateArtifactToV3(migrationInput(workspace));
    v3.steps[0].contract.produces.push('object:Order');
    v3.steps[0].contract.post.push({ factId: 'object:Order', text: 'Order object', source: 'operation.result_object_classes/0' });
    v3.groundedObjects = [{ object: 'Order', ground: 'derived: a view over one record' }];
    const loaded = loadWorkspace(workspace.root);
    const findings = checkDangers(indexArtifact({ ...loaded, artifact: v3 }));
    assert.equal(findings.filter((finding) => finding.checkId === 'S6.orphan-object' && finding.subject.includes('Order')).length, 0);
  } finally {
    workspace.remove();
  }
});
