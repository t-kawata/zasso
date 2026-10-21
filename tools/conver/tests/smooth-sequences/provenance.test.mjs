import { test } from 'node:test';
import assert from 'node:assert/strict';

import { migrateArtifactToV3 } from '../../.claude/scripts/smooth-sequences/lib/migrate-v3.mjs';
import { summarizeProvenance } from '../../.claude/scripts/smooth-sequences/lib/provenance.mjs';
import { loadWorkspace } from '../../.claude/scripts/smooth-sequences/lib/workspace.mjs';
import {
  materializeSmoothWorkspace,
  minimalV2Artifact,
  minimalV3Artifact,
} from './helpers/workspace-fixture.mjs';

/** The input `migrateArtifactToV3` reads from a materialized workspace. */
// [::TICKET::] PX-283, PX-284 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-283|PX-284) --for-spec --no-implementation-order`.
function migrationInput(workspace) {
  const loaded = loadWorkspace(workspace.root);
  return {
    artifact: loaded.artifact,
    treeManifest: loaded.treeManifest,
    allocateManifest: loaded.allocateManifest,
    packages: loaded.packages,
  };
}

test('a v3 artifact with no migration field reports not-recorded and counts missing prose', () => {
  const summary = summarizeProvenance(minimalV3Artifact());
  assert.equal(summary.status, 'not-recorded');
  assert.equal(summary.fromSchemaVersion, null);
  assert.equal(summary.proseContract.total, 2);
  assert.equal(summary.proseContract.preserved, 0);
  assert.equal(summary.proseContract.missing, 2);
});

test('a v2 artifact reports v2 and counts its prose contracts without claiming preservation', () => {
  const summary = summarizeProvenance(minimalV2Artifact());
  assert.equal(summary.status, 'v2');
  assert.equal(summary.fromSchemaVersion, 2);
  assert.equal(summary.proseContract.total, 2);
  assert.equal(summary.proseContract.preserved, 0);
  assert.equal(summary.proseContract.missing, 0);
});

// @verifies C001
test('a migrated artifact records its source and preserves every prose contract', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    const input = migrationInput(workspace);
    const v3 = migrateArtifactToV3(input);
    const summary = summarizeProvenance(v3);
    assert.equal(summary.status, 'recorded');
    assert.equal(summary.fromSchemaVersion, 2);
    assert.equal(summary.toSchemaVersion, 3);
    assert.equal(summary.migratedBy, 'smooth-sequences/migrate-v3');
    assert.equal(typeof summary.sourceDigest, 'string');
    assert.equal(summary.proseContract.total, 2);
    assert.equal(summary.proseContract.preserved, 2);
    assert.equal(summary.proseContract.missing, 0);
  } finally {
    workspace.remove();
  }
});

test('a migrated artifact without contract_prose reports every step as missing', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    const v3 = migrateArtifactToV3(migrationInput(workspace));
    const stripped = {
      ...v3,
      steps: v3.steps.map(({ contract_prose, ...step }) => step),
    };
    const summary = summarizeProvenance(stripped);
    assert.equal(summary.status, 'recorded');
    assert.equal(summary.proseContract.preserved, 0);
    assert.equal(summary.proseContract.missing, 2);
  } finally {
    workspace.remove();
  }
});
