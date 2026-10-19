import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkBoundaryClauses } from '../../.claude/scripts/smooth-sequences/lib/checks-layer-a.mjs';
import { checkDangers } from '../../.claude/scripts/smooth-sequences/lib/checks-danger.mjs';
import { indexArtifact } from '../../.claude/scripts/smooth-sequences/lib/index.mjs';
import { migrateArtifactToV3, renderArtifact } from '../../.claude/scripts/smooth-sequences/lib/migrate-v3.mjs';
import { loadWorkspace } from '../../.claude/scripts/smooth-sequences/lib/workspace.mjs';
import { defaultAllocateManifest, defaultContractRegistry, materializeSmoothWorkspace, minimalV2Artifact } from './helpers/workspace-fixture.mjs';

// [::TICKET::] PX-274 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-274 --for-spec --no-implementation-order`.
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

test('the migration derives the crossing and the typed contract from structured records', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    const v3 = migrateArtifactToV3(migrationInput(workspace));
    for (const step of v3.steps) {
      assert.deepEqual(step.contract.crosses, ['boundary-001']);
    }
    assert.ok(v3.steps[0].contract.post.length > 0);
    assert.ok(v3.steps[1].contract.pre.length > 0);
    assert.ok(v3.steps[0].contract.produces.includes('object:Soul') || v3.steps[0].contract.produces.some((fact) => fact.startsWith('boundary:')));
    assert.equal(v3.operations[0].registry_contribution, 'required');
    assert.ok(v3.operations[0].boundary_effects.some((effect) => effect.boundary === 'boundary-001' && effect.direction === 'provides'));
    assert.ok(v3.operations[1].boundary_effects.some((effect) => effect.boundary === 'boundary-001' && effect.direction === 'consumes'));
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
    v3.steps[0].contract.produces.push('object:Soul');
    v3.steps[0].contract.post.push({ factId: 'object:Soul', text: 'Soul object', source: 'operation.result_object_classes/0' });
    v3.groundedObjects = [{ object: 'Soul', ground: 'derived: a view over one record' }];
    const loaded = loadWorkspace(workspace.root);
    const findings = checkDangers(indexArtifact({ ...loaded, artifact: v3 }));
    assert.equal(findings.filter((finding) => finding.checkId === 'S6.orphan-object' && finding.subject.includes('Soul')).length, 0);
  } finally {
    workspace.remove();
  }
});
