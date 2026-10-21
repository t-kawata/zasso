import { test } from 'node:test';
import assert from 'node:assert/strict';

import { migrateArtifactToV3, renderArtifact } from '../../.claude/scripts/smooth-sequences/lib/migrate-v3.mjs';
import { runCommand } from '../../.claude/scripts/smooth-sequences/run.mjs';
import { loadWorkspace } from '../../.claude/scripts/smooth-sequences/lib/workspace.mjs';
import {
  materializeSmoothWorkspace,
  minimalV2Artifact,
} from './helpers/workspace-fixture.mjs';

/** The input `migrateArtifactToV3` reads from a materialized workspace. */
// [::TICKET::] PX-284 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-284 --for-spec --no-implementation-order`.
function migrationInput(workspace) {
  const loaded = loadWorkspace(workspace.root);
  return {
    artifact: loaded.artifact,
    treeManifest: loaded.treeManifest,
    allocateManifest: loaded.allocateManifest,
    packages: loaded.packages,
  };
}

/** A v2 artifact whose first operation targets an undeclared status. */
// [::TICKET::] PX-284 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-284 --for-spec --no-implementation-order`.
function openTargetArtifact({ ground = null } = {}) {
  const artifact = minimalV2Artifact();
  artifact.operations[0].initial_status = 'open';
  artifact.operations[0].allowed_status_transitions = { open: ['recovered'] };
  if (ground !== null) artifact.operations[0].status_terminality_ground = { recovered: ground };
  return artifact;
}

/** The findings of one check id in a result. */
// [::TICKET::] PX-284 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-284 --for-spec --no-implementation-order`.
function findingsOf(result, checkId) {
  return result.report.findings.filter((finding) => finding.checkId === checkId);
}

test('the migration does not silently close an ungranted transition target', () => {
  const workspace = materializeSmoothWorkspace({ artifact: openTargetArtifact() });
  try {
    const v3 = migrateArtifactToV3(migrationInput(workspace));
    assert.equal(v3.operations[0].allowed_status_transitions.recovered, undefined);
    const migrated = materializeSmoothWorkspace({ artifact: v3 });
    try {
      const result = runCommand([migrated.root, '--audit']);
      assert.ok(findingsOf(result, 'S3.transition-target-unknown').some((finding) => finding.subject === 'ProduceFact'));
    } finally {
      migrated.remove();
    }
  } finally {
    workspace.remove();
  }
});

test('a status_terminality_ground closes the target and removes the finding', () => {
  const ungrounded = materializeSmoothWorkspace({ artifact: openTargetArtifact() });
  try {
    const ungroundedV3 = migrateArtifactToV3(migrationInput(ungrounded));
    assert.equal(ungroundedV3.operations[0].allowed_status_transitions.recovered, undefined);
  } finally {
    ungrounded.remove();
  }
  const workspace = materializeSmoothWorkspace({ artifact: openTargetArtifact({ ground: 'line 1 declares recovered terminal' }) });
  try {
    const v3 = migrateArtifactToV3(migrationInput(workspace));
    assert.deepEqual(v3.operations[0].allowed_status_transitions.recovered, []);
    const migrated = materializeSmoothWorkspace({ artifact: v3 });
    try {
      const result = runCommand([migrated.root, '--audit']);
      assert.equal(findingsOf(result, 'S3.transition-target-unknown').length, 0);
    } finally {
      migrated.remove();
    }
  } finally {
    workspace.remove();
  }
});

test('a second migration with a ground is byte-identical', () => {
  const workspace = materializeSmoothWorkspace({ artifact: openTargetArtifact({ ground: 'line 1 declares recovered terminal' }) });
  try {
    const first = migrateArtifactToV3(migrationInput(workspace));
    assert.deepEqual(first.operations[0].allowed_status_transitions.recovered, []);
    const second = migrateArtifactToV3({ ...migrationInput(workspace), artifact: first });
    assert.equal(renderArtifact(second), renderArtifact(first));
  } finally {
    workspace.remove();
  }
});
