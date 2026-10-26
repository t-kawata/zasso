// PX-310 @verifies C001
// The transaction may treat an artifact as current only when the evidence
// manifest and the readings answer the same bytes. A manifest edit alone must
// not advance the currency verdict.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { digestOf } from '../../.claude/scripts/educe-sequences/rail/load.mjs';
import { sha256File } from '../../.claude/scripts/shared-obligations/evidence.mjs';
import { readArtifactAndEvidenceCurrency } from '../../.claude/scripts/regeneration/lib/transaction.mjs';

// [::TICKET::] PX-310 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-310 --for-spec --no-implementation-order`.
function workspaceWithArtifact({ specDigest = null, manifestSha, readingsDigest }) {
  const root = mkdtempSync(join(tmpdir(), 'px310-currency-'));
  const specPath = join(root, 'spec.md');
  writeFileSync(specPath, '# spec\n');
  const artifactSpecDigest = specDigest ?? digestOf(specPath);
  const artifactPath = join(root, 'Plan-sequences.json');
  writeFileSync(artifactPath, JSON.stringify({ spec: { sha256: artifactSpecDigest } }));
  if (manifestSha !== undefined || readingsDigest !== undefined) {
    mkdirSync(join(root, 'educe-sequences'), { recursive: true });
    if (manifestSha !== undefined) {
      writeFileSync(
        join(root, 'educe-sequences/EVIDENCE-MANIFEST.json'),
        JSON.stringify({ schemaVersion: 1, artifact: { sha256: manifestSha } }),
      );
    }
    if (readingsDigest !== undefined) {
      writeFileSync(
        join(root, 'educe-sequences/readings-judgment.jsonl'),
        `${JSON.stringify({ obligationId: 'JUDGE:X', artifactDigest: readingsDigest })}\n`,
      );
    }
  }
  return { root, specPath, artifactPath };
}

test('C001 a manifest older than the artifact is evidence-stale', () => {
  const fixture = workspaceWithArtifact({ manifestSha: 'old', readingsDigest: 'old' });
  try {
    const artifactDigest = sha256File(fixture.artifactPath);
    const result = readArtifactAndEvidenceCurrency({ stagingRoot: fixture.root, specPath: fixture.specPath });
    assert.equal(result.state, 'evidence-stale');
    assert.equal(result.artifactDigest, artifactDigest);
    assert.equal(result.manifestArtifactDigest, 'old');
    assert.notEqual(result.artifactDigest, result.manifestArtifactDigest);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('C001 no manifest keeps the legacy current verdict', () => {
  const fixture = workspaceWithArtifact({});
  try {
    const result = readArtifactAndEvidenceCurrency({ stagingRoot: fixture.root, specPath: fixture.specPath });
    assert.equal(result.state, 'current');
    assert.equal(result.evidenceApplicable, false);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('C001 a matching manifest and matching readings are current', () => {
  const fixture = workspaceWithArtifact({ manifestSha: 'placeholder' });
  try {
    const artifactDigest = sha256File(fixture.artifactPath);
    writeFileSync(
      join(fixture.root, 'educe-sequences/EVIDENCE-MANIFEST.json'),
      JSON.stringify({ schemaVersion: 1, artifact: { sha256: artifactDigest } }),
    );
    writeFileSync(
      join(fixture.root, 'educe-sequences/readings-judgment.jsonl'),
      `${JSON.stringify({ obligationId: 'JUDGE:X', artifactDigest })}\n`,
    );
    const result = readArtifactAndEvidenceCurrency({ stagingRoot: fixture.root, specPath: fixture.specPath });
    assert.equal(result.state, 'current');
    assert.equal(result.evidenceApplicable, true);
    assert.equal(result.readingsDigest, artifactDigest);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('C001 an artifact recording another specification is stale', () => {
  const fixture = workspaceWithArtifact({ specDigest: 'not-the-spec-digest' });
  try {
    const result = readArtifactAndEvidenceCurrency({ stagingRoot: fixture.root, specPath: fixture.specPath });
    assert.equal(result.state, 'stale');
    assert.notEqual(digestOf(fixture.specPath), 'not-the-spec-digest');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
