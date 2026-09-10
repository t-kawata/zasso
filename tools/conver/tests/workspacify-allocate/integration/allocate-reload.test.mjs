// [::TICKET::] PX-195, PX-201 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-195|PX-201) --for-spec --no-implementation-order`.
// PX-195 @verifies C003
// Reload proves the published workspace still satisfies every gate: rescan,
// re-parse, re-extract, rebuild the graph, re-derive the order, re-prove coverage
// and verify the manifest's own hash.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { reloadAndVerify } from '../../../.claude/scripts/workspacify-allocate/lib/allocate-reload.mjs';
import { runFinalize } from '../../../.claude/scripts/workspacify-allocate/run.mjs';
import { materializeSeedFixture, makeDecisions } from '../helpers/build-valid-manifest.mjs';
import { settleSelfGrill, validResidual } from '../helpers/self-grill-fixture.mjs';
import { ALLOCATE_MANIFEST_FILE_NAME, SEED_FILE_NAME } from '../../../.claude/scripts/workspacify-allocate/lib/seed-model.mjs';
import { computeAllocateSelfHash } from '../../../.claude/scripts/workspacify-allocate/lib/allocate-manifest.mjs';
import { sha256Hex } from '../../../.claude/scripts/workspacify-tree/lib/hash.mjs';

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

function publish() {
  const fixture = materializeSeedFixture();
  const decisionsPath = join(fixture.dir, 'decisions.json');
  writeFileSync(decisionsPath, JSON.stringify(makeDecisions(fixture.manifest)));
  silent(() => runFinalize(['finalize', fixture.manifestPath, `--decisions=${decisionsPath}`]));
  return { ...fixture, decisionsPath, plan: { relativeDirs: ['crates', 'crates/protocol', 'crates/protocol/alpha', 'crates/protocol/beta'] } };
}

test('C003 the reload reproduces the published verification', () => {
  const published = publish();
  try {
    const verdict = reloadAndVerify({
      workspaceRoot: published.dir,
      plan: published.plan,
      manifest: published.manifest,
      manifestPath: published.manifestPath,
      expected: JSON.parse(readFileSync(join(published.dir, ALLOCATE_MANIFEST_FILE_NAME), 'utf8')),
    });
    assert.equal(verdict.ok, true, JSON.stringify(verdict.divergences));
    assert.deepEqual(verdict.divergences, []);
    assert.equal(verdict.observed.seedCount, 2);
    assert.match(verdict.observed.graphHash, /^[0-9a-f]{64}$/);
  } finally {
    rmSync(published.dir, { recursive: true, force: true });
  }
});

test('C003 a seed edited after publication is detected and located', () => {
  const published = publish();
  try {
    const seedPath = join(published.dir, 'crates/protocol/alpha', SEED_FILE_NAME);
    writeFileSync(seedPath, `${readFileSync(seedPath, 'utf8')}\n<!-- edited after publication -->\n`);
    const verdict = reloadAndVerify({
      workspaceRoot: published.dir,
      plan: published.plan,
      manifest: published.manifest,
      manifestPath: published.manifestPath,
      expected: JSON.parse(readFileSync(join(published.dir, ALLOCATE_MANIFEST_FILE_NAME), 'utf8')),
    });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.divergences[0].artefact, 'seed');
    assert.equal(verdict.divergences[0].package_id, 'pkg-a');
  } finally {
    rmSync(published.dir, { recursive: true, force: true });
  }
});

test('C003 a tampered manifest hash and a missing seed are detected', () => {
  const published = publish();
  try {
    const manifestPath = join(published.dir, ALLOCATE_MANIFEST_FILE_NAME);
    const tampered = JSON.parse(readFileSync(manifestPath, 'utf8'));
    tampered.integrity.manifest_hash = '0'.repeat(64);
    writeFileSync(manifestPath, JSON.stringify(tampered));
    const verdict = reloadAndVerify({
      workspaceRoot: published.dir,
      plan: published.plan,
      manifest: published.manifest,
      manifestPath: published.manifestPath,
      expected: tampered,
    });
    assert.equal(verdict.ok, false);
    assert.ok(verdict.divergences.some((entry) => entry.artefact === 'manifest'));
  } finally {
    rmSync(published.dir, { recursive: true, force: true });
  }
});

test('C003 a published seed that lost its grill question is detected through the hand-off', () => {
  const fixture = materializeSeedFixture();
  try {
    // A workspace whose stage-1 hand-off carries one open question, which the loop
    // must carry into the seed that answers it.
    const question = validResidual({ package_id: 'pkg-a' });
    const decisions = settleSelfGrill({
      decisions: { ...makeDecisions(fixture.manifest), self_grill: { residual: [question] } },
      manifest: { ...fixture.manifest, stage2_handoff: { ...fixture.manifest.stage2_handoff, residual_questions: [] } },
      packageId: 'pkg-a',
    });
    const decisionsPath = join(fixture.dir, 'decisions.json');
    writeFileSync(decisionsPath, JSON.stringify(decisions));
    silent(() => runFinalize(['finalize', fixture.manifestPath, `--decisions=${decisionsPath}`]));

    const allocatePath = join(fixture.dir, ALLOCATE_MANIFEST_FILE_NAME);
    const published = JSON.parse(readFileSync(allocatePath, 'utf8'));
    assert.equal(published.handoff_summary.grill_questions.length, 1);

    const plan = { relativeDirs: ['crates', 'crates/protocol', 'crates/protocol/alpha', 'crates/protocol/beta'] };
    const clean = reloadAndVerify({ workspaceRoot: fixture.dir, plan, manifest: fixture.manifest, manifestPath: fixture.manifestPath, expected: published });
    assert.equal(clean.ok, true, JSON.stringify(clean.divergences));

    // The question is removed from the seed and the recorded hash is updated, so only
    // the hand-off parity can notice: the summary would otherwise outlive its question.
    const seedPath = join(fixture.dir, 'crates/protocol/alpha', SEED_FILE_NAME);
    const trimmed = readFileSync(seedPath, 'utf8').replace(question.grill_question, 'the question was dropped');
    writeFileSync(seedPath, trimmed);
    const tampered = { ...published, seed_index: published.seed_index.map((entry) => (entry.package === 'pkg-a' ? { ...entry, sha256: sha256Hex(Buffer.from(trimmed, 'utf8')) } : entry)) };
    tampered.integrity = { ...tampered.integrity, manifest_hash: computeAllocateSelfHash(tampered) };
    writeFileSync(allocatePath, `${JSON.stringify(tampered, null, 2)}\n`);

    const verdict = reloadAndVerify({ workspaceRoot: fixture.dir, plan, manifest: fixture.manifest, manifestPath: fixture.manifestPath, expected: tampered });
    assert.equal(verdict.ok, false);
    assert.ok(verdict.divergences.some((entry) => entry.field === 'grill_question' && entry.package_id === 'pkg-a'), JSON.stringify(verdict.divergences));
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});
