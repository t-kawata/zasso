// [::TICKET::] PX-195 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-195 --for-spec --no-implementation-order`.
// PX-195 @verifies C001 C002 C003 C004
// Branch hardening: the sparse-input and failure paths of the manifest, the
// publisher, the reload and the cleanup.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildAllocateManifest } from '../../../.claude/scripts/workspacify-allocate/lib/allocate-manifest.mjs';
import { reloadAndVerify } from '../../../.claude/scripts/workspacify-allocate/lib/allocate-reload.mjs';
import { verifyStagedWorkspace, publishWorkspace } from '../../../.claude/scripts/workspacify-allocate/publish-allocate-manifest.mjs';
import { residueIsPublishedOnly } from '../../../.claude/scripts/workspacify-allocate/cleanup-workspace-artifacts.mjs';
import { buildValidManifest, materializeSeedFixture, makeDecisions } from '../helpers/build-valid-manifest.mjs';
import { runFinalize } from '../../../.claude/scripts/workspacify-allocate/run.mjs';

function silent(callback) {
  const stdout = process.stdout.write;
  const stderr = process.stderr.write;
  process.stdout.write = () => true;
  process.stderr.write = () => true;
  try {
    return callback();
  } finally {
    process.stdout.write = stdout;
    process.stderr.write = stderr;
  }
}

test('C001 a sparse manifest still yields a complete, self-verifying record', () => {
  const { manifest } = buildValidManifest();
  const sparse = { ...manifest, workspace: { ...manifest.workspace, packages: [] }, structure: {}, dependencies: {} };
  const record = buildAllocateManifest({
    manifestRef: { manifest: sparse, manifestPath: '/tmp/WORKSPACIFY-TREE-MANIFEST.json', manifestDir: '/tmp' },
    plan: {},
    proof: {
      parsedByPackage: new Map(),
      contractIndex: new Map(),
      graph: { nodes: [], edges: [] },
      violations: undefined,
      order: undefined,
      coverageProof: undefined,
    },
  });
  assert.deepEqual(record.seed_index, []);
  assert.equal(record.source_coverage.segments_total, 0);
  assert.equal(record.wig.hash, null);
  assert.deepEqual(record.implementation_order, { serial: [], levels: [] });
  assert.equal(record.semantic_review.status, 'REVIEW_REQUIRED');
  assert.match(record.integrity.manifest_hash, /^[0-9a-f]{64}$/);
});

test('C002 the staged-set verification reports unexpected and missing entries', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wt-195-stage-'));
  try {
    mkdirSync(join(dir, 'crates/protocol/alpha'), { recursive: true });
    writeFileSync(join(dir, 'crates/protocol/alpha/RFC-SEED.md'), 'seed');
    writeFileSync(join(dir, 'stray.txt'), 'stray');
    const report = verifyStagedWorkspace({ stagingRoot: dir, plan: { relativeDirs: ['crates', 'crates/protocol', 'crates/protocol/alpha'] }, seedRelPaths: ['crates/protocol/alpha/RFC-SEED.md', 'crates/protocol/beta/RFC-SEED.md'] });
    assert.equal(report.ok, false);
    assert.ok(report.unexpected.includes('stray.txt'));
    assert.ok(report.missing.includes('file:crates/protocol/beta/RFC-SEED.md'));
    assert.ok(report.missing.includes('file:WORKSPACIFY-ALLOCATE-MANIFEST.json'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C002 a publish into an occupied workspace fails without leaving staging behind', () => {
  const fixture = materializeSeedFixture();
  try {
    mkdirSync(join(fixture.dir, 'crates', 'protocol', 'alpha'), { recursive: true });
    writeFileSync(join(fixture.dir, 'crates', 'protocol', 'alpha', 'sentinel.txt'), 'keep');
    const result = publishWorkspace({
      manifestDir: fixture.dir,
      plan: { relativeDirs: ['crates', 'crates/protocol', 'crates/protocol/alpha', 'crates/protocol/beta'] },
      renderedByPackage: new Map(),
      allocateManifest: {},
    });
    assert.equal(result.published, false);
    assert.equal(readFileSync(join(fixture.dir, 'crates', 'protocol', 'alpha', 'sentinel.txt'), 'utf8'), 'keep');
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('C003 reload reports a missing manifest, a missing seed and a sparse expectation', () => {
  const fixture = materializeSeedFixture();
  try {
    const plan = { relativeDirs: ['crates', 'crates/protocol', 'crates/protocol/alpha', 'crates/protocol/beta'] };
    const verdict = reloadAndVerify({ workspaceRoot: fixture.dir, plan, manifest: fixture.manifest, manifestPath: fixture.manifestPath, expected: {} });
    assert.equal(verdict.ok, false);
    assert.ok(verdict.divergences.some((entry) => entry.artefact === 'manifest' && entry.field === 'missing'));
    assert.ok(verdict.divergences.some((entry) => entry.artefact === 'seed' && entry.field === 'missing'));
    assert.ok(verdict.divergences.some((entry) => entry.artefact === 'coverage'));

    // Publish, then delete a seed the expectation still lists.
    const decisionsPath = join(fixture.dir, 'decisions.json');
    writeFileSync(decisionsPath, JSON.stringify(makeDecisions(fixture.manifest)));
    silent(() => runFinalize(['finalize', fixture.manifestPath, `--decisions=${decisionsPath}`]));
    const published = JSON.parse(readFileSync(join(fixture.dir, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), 'utf8'));
    rmSync(join(fixture.dir, 'crates/protocol/beta/RFC-SEED.md'));
    const afterDelete = reloadAndVerify({ workspaceRoot: fixture.dir, plan, manifest: fixture.manifest, manifestPath: fixture.manifestPath, expected: published });
    assert.equal(afterDelete.ok, false);
    assert.ok(afterDelete.divergences.some((entry) => entry.artefact === 'seed' && entry.detail === 'seed missing'));
    assert.equal(residueIsPublishedOnly({ workspaceRoot: fixture.dir, preexisting: ['spec.md', 'decisions.json', 'WORKSPACIFY-TREE-MANIFEST.json'] }), true);
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});
