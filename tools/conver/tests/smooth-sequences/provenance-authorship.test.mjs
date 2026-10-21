import { test } from 'node:test';
import assert from 'node:assert/strict';

import { evaluateCheckRegistry } from '../../.claude/scripts/smooth-sequences/lib/check-registry.mjs';
import { indexArtifact } from '../../.claude/scripts/smooth-sequences/lib/index.mjs';
import { migrateArtifactToV3 } from '../../.claude/scripts/smooth-sequences/lib/migrate-v3.mjs';
import { ORIGIN, SURFACES, surfaceAvailabilityOf } from '../../.claude/scripts/smooth-sequences/lib/surfaces.mjs';
import { loadWorkspace } from '../../.claude/scripts/smooth-sequences/lib/workspace.mjs';
import {
  materializeSmoothWorkspace,
  minimalV2Artifact,
  minimalV3Artifact,
} from './helpers/workspace-fixture.mjs';

/** The index a materialized workspace produces. */
// [::TICKET::] PX-286 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-286 --for-spec --no-implementation-order`.
function indexOfArtifact(artifact) {
  const workspace = materializeSmoothWorkspace({ artifact });
  try {
    return { index: indexArtifact(loadWorkspace(workspace.root)), workspace };
  } catch (error) {
    workspace.remove();
    throw error;
  }
}

/** The input the migration reads. */
// [::TICKET::] PX-286 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-286 --for-spec --no-implementation-order`.
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
test('a partially authored surface reports authored and synthesized cardinalities', () => {
  const artifact = minimalV3Artifact();
  artifact.migration = {
    from_schema_version: 2,
    to_schema_version: 3,
    authorship: {
      'steps[].contract': { authored: ['A-1__ProduceFact'], synthesized: ['A-1__ConsumeFact'] },
      'steps[].contract.crosses': { authored: ['A-1__ProduceFact'], synthesized: ['A-1__ConsumeFact'] },
    },
  };
  const { index, workspace } = indexOfArtifact(artifact);
  try {
    const surface = surfaceAvailabilityOf(index, SURFACES.TYPED_STEP_CONTRACTS);
    assert.equal(surface.origin, ORIGIN.MIGRATION);
    assert.equal(surface.cardinality, 2);
    assert.equal(surface.authoredCardinality, 1);
    assert.equal(surface.synthesizedCardinality, 1);
    assert.equal(surface.authoredCardinality + surface.synthesizedCardinality, surface.cardinality);
  } finally {
    workspace.remove();
  }
});

// @verifies C001
test('a single synthesized row blocks a spec claim with the authored count', () => {
  const artifact = minimalV3Artifact();
  artifact.migration = {
    from_schema_version: 2,
    to_schema_version: 3,
    authorship: {
      'steps[].contract': { authored: ['A-1__ProduceFact'], synthesized: ['A-1__ConsumeFact'] },
    },
  };
  const { index, workspace } = indexOfArtifact(artifact);
  try {
    const evaluation = evaluateCheckRegistry(index);
    const cycle = evaluation.blocked.find((entry) => entry.checkId === 'S6.cycle');
    assert.ok(cycle !== undefined);
    assert.match(cycle.reason, /authored 1\/2/);
    assert.equal(evaluation.findings.some((finding) => finding.checkId === 'S6.cycle'), false);
  } finally {
    workspace.remove();
  }
});

// @verifies C001
test('a v3 artifact with migration but no provenance is unknown and blocks', () => {
  const artifact = minimalV3Artifact();
  artifact.migration = { from_schema_version: 2, to_schema_version: 3 };
  const { index, workspace } = indexOfArtifact(artifact);
  try {
    const surface = surfaceAvailabilityOf(index, SURFACES.TYPED_STEP_CONTRACTS);
    assert.equal(surface.origin, ORIGIN.UNKNOWN);
    const evaluation = evaluateCheckRegistry(index);
    const cycle = evaluation.blocked.find((entry) => entry.checkId === 'S6.cycle');
    assert.ok(cycle !== undefined);
    assert.match(cycle.reason, /unknown provenance/);
  } finally {
    workspace.remove();
  }
});

// @verifies C001
test('a v2-authored transition surface stays authored after migration', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    const v3 = migrateArtifactToV3(migrationInput(workspace));
    const migrated = materializeSmoothWorkspace({ artifact: v3 });
    try {
      const index = indexArtifact(loadWorkspace(migrated.root));
      const surface = surfaceAvailabilityOf(index, SURFACES.OPERATION_TRANSITIONS);
      assert.equal(surface.origin, ORIGIN.AUTHORED);
      assert.equal(surface.synthesizedCardinality, 0);
      const evaluation = evaluateCheckRegistry(index);
      assert.equal(evaluation.blocked.some((entry) => entry.checkId === 'S3.status-initial-unknown'), false);
    } finally {
      migrated.remove();
    }
  } finally {
    workspace.remove();
  }
});

// @verifies C001
test('crossings inherit the typed contract origin when they have no own entry', () => {
  const artifact = minimalV3Artifact();
  artifact.migration = {
    from_schema_version: 2,
    to_schema_version: 3,
    authorship: {
      'steps[].contract': { authored: [], synthesized: ['A-1__ProduceFact', 'A-1__ConsumeFact'] },
    },
  };
  const { index, workspace } = indexOfArtifact(artifact);
  try {
    const surface = surfaceAvailabilityOf(index, SURFACES.STEP_CROSSINGS);
    assert.equal(surface.origin, ORIGIN.MIGRATION);
    assert.equal(surface.synthesizedCardinality, 2);
  } finally {
    workspace.remove();
  }
});
