// [::TICKET::] PX-310 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-310 --for-spec --no-implementation-order`.
// PX-310 @verifies C003
// An artifact changed by migrate-v3 without a new reader generation must hand
// off to educe, not derive. The handoff is bounded so a non-converging
// workspace fails with a named reason instead of looping forever.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  advanceManifestArtifactIfFresh,
  decideDeriveState,
  recordEduceHandoff,
} from '../../.claude/scripts/regeneration/lib/transaction.mjs';

test('C003 an artifact changed by migrate-v3 without a new reading hands off', () => {
  const result = decideDeriveState({
    artifactDigest: 'new',
    manifestArtifactDigest: 'old',
    readingsDigest: 'old',
    generation: 16,
  });
  assert.equal(result.state, 'educe-pending');
  assert.equal(result.code, 'EDUCE_HANDOFF_REQUIRED');
});

test('C003 equal artifact, manifest and readings derive', () => {
  const result = decideDeriveState({
    artifactDigest: 'same',
    manifestArtifactDigest: 'same',
    readingsDigest: 'same',
    generation: 16,
  });
  assert.equal(result.state, 'derived');
  assert.equal(result.code, null);
});

test('C003 an open read phase hands off even when the digests match', () => {
  const result = decideDeriveState({
    artifactDigest: 'same',
    manifestArtifactDigest: 'same',
    readingsDigest: 'same',
    generation: 16,
    readPhasesOpen: true,
  });
  assert.equal(result.state, 'educe-pending');
  assert.equal(result.code, 'EDUCE_HANDOFF_REQUIRED');
});

test('C003 the handoff budget fails closed at the sixth handoff', () => {
  const root = mkdtempSync(join(tmpdir(), 'px310-handoff-'));
  try {
    for (let count = 1; count <= 5; count += 1) {
      assert.equal(recordEduceHandoff({ stagingRoot: root }).count, count);
    }
    const sixth = recordEduceHandoff({ stagingRoot: root });
    assert.equal(sixth.ok, false);
    assert.equal(sixth.code, 'EDUCE_CONVERGENCE_EXCEEDED');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C003 the manifest advances only when the readings answer the artifact', () => {
  const root = mkdtempSync(join(tmpdir(), 'px310-manifest-'));
  try {
    writeFileSync(
      join(root, 'EVIDENCE-MANIFEST.json'),
      JSON.stringify({ schemaVersion: 1, artifact: { sha256: 'old' } }),
    );
    assert.equal(
      advanceManifestArtifactIfFresh({ manifestDirectory: root, artifactDigest: 'new', readingsDigest: 'old' }),
      false,
    );
    assert.equal(
      advanceManifestArtifactIfFresh({ manifestDirectory: root, artifactDigest: 'new', readingsDigest: 'new' }),
      true,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
