import { test } from 'node:test';
import assert from 'node:assert/strict';

import { migrateArtifactToV3 } from '../../.claude/scripts/smooth-sequences/lib/migrate-v3.mjs';
import {
  assertProsePartition,
  summarizeProvenance,
} from '../../.claude/scripts/smooth-sequences/lib/provenance.mjs';
import { loadWorkspace } from '../../.claude/scripts/smooth-sequences/lib/workspace.mjs';
import {
  materializeSmoothWorkspace,
  minimalV2Artifact,
  minimalV3Artifact,
} from './helpers/workspace-fixture.mjs';

/** The input `migrateArtifactToV3` reads from a materialized workspace. */
// [::TICKET::] PX-285 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-285 --for-spec --no-implementation-order`.
function migrationInput(workspace) {
  const loaded = loadWorkspace(workspace.root);
  return {
    artifact: loaded.artifact,
    treeManifest: loaded.treeManifest,
    allocateManifest: loaded.allocateManifest,
    packages: loaded.packages,
  };
}

// @verifies C004
test('a v2 artifact reports its prose as legacy', () => {
  const prose = summarizeProvenance(minimalV2Artifact()).proseContract;
  assert.deepEqual(prose, { total: 2, typed: 0, legacy: 2, absent: 0 });
  assert.equal(prose.typed + prose.legacy + prose.absent, prose.total);
});

// @verifies C004
test('a v3 artifact reports its prose as typed', () => {
  const artifact = minimalV3Artifact();
  artifact.steps[0].contract_prose = 'the producer derives order_id';
  artifact.steps[1].contract_prose = 'the consumer reads order_id';
  const prose = summarizeProvenance(artifact).proseContract;
  assert.deepEqual(prose, { total: 2, typed: 2, legacy: 0, absent: 0 });
});

// @verifies C004
test('a step with neither prose form is counted as absent', () => {
  const artifact = minimalV2Artifact();
  artifact.steps[0].contract = '';
  const prose = summarizeProvenance(artifact).proseContract;
  assert.deepEqual(prose, { total: 2, typed: 0, legacy: 1, absent: 1 });
});

// @verifies C004
test('a migrated artifact records the synthesis and preserves prose', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    const v3 = migrateArtifactToV3(migrationInput(workspace));
    const summary = summarizeProvenance(v3);
    assert.equal(summary.status, 'recorded');
    assert.equal(summary.fromSchemaVersion, 2);
    assert.equal(summary.toSchemaVersion, 3);
    assert.equal(summary.proseContract.total, 2);
    assert.equal(summary.proseContract.typed, 2);
    assert.equal(summary.proseContract.legacy, 0);
    assert.ok(summary.proseContract.typed + summary.proseContract.legacy + summary.proseContract.absent === summary.proseContract.total);
  } finally {
    workspace.remove();
  }
});

// @verifies C004
test('the prose partition refuses a count that does not sum', () => {
  assert.throws(
    () => assertProsePartition({ total: 3, typed: 1, legacy: 1, absent: 0 }),
    /partition/i,
  );
});

// @verifies C004
test('schema history and downgrade are reported', () => {
  const summary = summarizeProvenance(minimalV2Artifact(), { previousSchemaVersions: [3] });
  assert.deepEqual(summary.schemaHistory, [3, 2]);
  assert.deepEqual(summary.downgrade, { code: 'UNPROVEN_DOWNGRADE', from: 3, to: 2 });
});
