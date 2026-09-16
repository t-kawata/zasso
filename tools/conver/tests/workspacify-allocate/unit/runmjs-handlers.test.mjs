// [::TICKET::] PX-191 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-191 --for-spec --no-implementation-order`.
// PX-191 @verifies C001 C002 C003 C005
// In-process coverage of run.mjs handlers (child-process CLI runs are not
// visible to the node --test coverage instrumenter).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync, existsSync, readFileSync, mkdtempSync, symlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { runValidate, runPlan, runPacket, runGate, runFinalize } from '../../../.claude/scripts/workspacify-allocate/run.mjs';
import { materializeSeedFixture, makeDecisions } from '../helpers/build-valid-manifest.mjs';
import { stageAllocateDecisions } from '../helpers/stage-allocate-decisions.mjs';
import { parseSeed } from '../../../.claude/scripts/workspacify-allocate/lib/seed-parse.mjs';
import { SEED_REQUIRED_SECTIONS } from '../../../.claude/scripts/workspacify-allocate/lib/seed-model.mjs';
import { computeSelfHash } from '../../../.claude/scripts/workspacify-tree/lib/render.mjs';
import { runDagChecks } from '../../../.claude/scripts/workspacify-tree/lib/dag.mjs';
import { tmpdir } from 'node:os';

function rewriteManifest(path, mutate) {
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  mutate(manifest);
  manifest.integrity.manifest_hash = computeSelfHash(manifest);
  writeFileSync(path, JSON.stringify(manifest));
  return manifest;
}

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

// [::TICKET::] PX-215 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-215 --for-spec --no-implementation-order`.
test('C001 runValidate succeeds on a locked manifest and throws without an argument', () => {
  const { dir, manifestPath } = materializeSeedFixture();
  try {
    assert.doesNotThrow(() => silent(() => runValidate(['validate', manifestPath])));
    assert.throws(() => runValidate(['validate']), (e) => e.gateId !== undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C001 runPlan succeeds on a fresh workspace and BLOCKs on an existing file', () => {
  const { dir, manifestPath } = materializeSeedFixture();
  try {
    assert.doesNotThrow(() => silent(() => runPlan(['plan', manifestPath])));
    writeFileSync(join(dir, 'crates'), 'blocker'); // ancestor file => unsafe/BLOCKED
    assert.throws(() => runPlan(['plan', manifestPath]), (e) => e.gateId !== undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C001 runPacket returns all packages and honours --package', () => {
  const { dir, manifestPath } = materializeSeedFixture();
  try {
    assert.doesNotThrow(() => silent(() => runPacket(['packet', manifestPath])));
    assert.doesNotThrow(() => silent(() => runPacket(['packet', manifestPath, '--package=pkg-a'])));
    assert.throws(() => runPacket(['packet', manifestPath, '--package=ghost']), (e) => e.message.includes('not in the manifest catalog'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C003 runGate requires APPROVED and complete decisions', () => {
  const { dir, manifestPath, manifest } = materializeSeedFixture();
  try {
    // Staged at the derived path before each run: the document is the channel, and
    // the command line names nothing.
    stageAllocateDecisions(dir, makeDecisions(manifest));
    assert.doesNotThrow(() => silent(() => runGate(['gate', manifestPath])));

    stageAllocateDecisions(dir, makeDecisions(manifest, { approved: false }));
    assert.throws(() => runGate(['gate', manifestPath]), (e) => e.gateId === 'G5');

    // A decisions payload missing one package's seed content throws G3.
    const partial = makeDecisions(manifest);
    partial.seeds = partial.seeds.slice(0, 1);
    stageAllocateDecisions(dir, partial);
    assert.throws(() => runGate(['gate', manifestPath]), (e) => e.gateId === 'G3');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('error-path handler branches throw typed errors', () => {
  const outside = mkdtempSync(join(tmpdir(), 'wt-191-out-'));
  // Missing arguments.
  assert.throws(() => runPlan(['plan']), (e) => e.gateId !== undefined);
  assert.throws(() => runPacket(['packet']), (e) => e.gateId !== undefined);
  assert.throws(() => runGate(['gate']), (e) => e.gateId !== undefined);
  assert.throws(() => runFinalize(['finalize']), (e) => e.gateId !== undefined);

  // Malformed decisions JSON (fresh fixture).
  const badDir = materializeSeedFixture();
  try {
    stageAllocateDecisions(badDir.dir, '{ nope');
    assert.throws(() => runGate(['gate', badDir.manifestPath]), (e) => e.gateId === 'G3');
  } finally {
    rmSync(badDir.dir, { recursive: true, force: true });
  }

  // Entry gate failure: corrupted self-hash (fresh fixture). The hash is
  // intentionally written without recomputing it so the entry gate rejects it.
  const tamperDir = materializeSeedFixture();
  try {
    const tampered = JSON.parse(readFileSync(tamperDir.manifestPath, 'utf8'));
    tampered.integrity.manifest_hash = '0'.repeat(64);
    writeFileSync(tamperDir.manifestPath, JSON.stringify(tampered));
    assert.throws(() => runValidate(['validate', tamperDir.manifestPath]), (e) => e.gateId === 'G0');
  } finally {
    rmSync(tamperDir.dir, { recursive: true, force: true });
  }

  // Plan inconsistent: a package whose path has no tree leaf.
  const inconsistentDir = materializeSeedFixture();
  try {
    rewriteManifest(inconsistentDir.manifestPath, (m) => {
      m.workspace.packages.push({ id: 'pkg-c', name: 'gamma', path: 'crates/protocol/gamma', layer: 'protocol', kind: 'production-library', seed_required: true, owns: {} });
    });
    assert.throws(() => runPlan(['plan', inconsistentDir.manifestPath]), (e) => e.gateId === 'G2');
  } finally {
    rmSync(inconsistentDir.dir, { recursive: true, force: true });
  }

  // Symlink ancestor makes the plan unsafe.
  const symlinkDir = materializeSeedFixture();
  try {
    symlinkSync(outside, join(symlinkDir.dir, 'crates'), 'dir');
    assert.throws(() => runPlan(['plan', symlinkDir.manifestPath]), (e) => e.gateId !== undefined);
  } finally {
    rmSync(symlinkDir.dir, { recursive: true, force: true });
  }

  // finalize re-runs the plan/safety gates: an inconsistent or unsafe plan BLOCKs.
  const finalizeBadDir = materializeSeedFixture();
  try {
    stageAllocateDecisions(finalizeBadDir.dir, makeDecisions(JSON.parse(readFileSync(finalizeBadDir.manifestPath, 'utf8'))));
    rewriteManifest(finalizeBadDir.manifestPath, (m) => {
      m.workspace.packages.push({ id: 'pkg-c', name: 'gamma', path: 'crates/protocol/gamma', layer: 'protocol', kind: 'production-library', seed_required: true, owns: {} });
    });
    assert.throws(() => runFinalize(['finalize', finalizeBadDir.manifestPath]), (e) => e.gateId === 'G2');
  } finally {
    rmSync(finalizeBadDir.dir, { recursive: true, force: true });
  }

  const finalizeSymDir = materializeSeedFixture();
  try {
    stageAllocateDecisions(finalizeSymDir.dir, makeDecisions(JSON.parse(readFileSync(finalizeSymDir.manifestPath, 'utf8'))));
    symlinkSync(outside, join(finalizeSymDir.dir, 'crates'), 'dir');
    assert.throws(() => runFinalize(['finalize', finalizeSymDir.manifestPath]), (e) => e.gateId !== undefined);
  } finally {
    rmSync(finalizeSymDir.dir, { recursive: true, force: true });
  }

  // A seed_required:false package that owns nothing is skipped (continue branch).
  const skipDir = materializeSeedFixture();
  try {
    rewriteManifest(skipDir.manifestPath, (m) => {
      m.workspace.packages[1].seed_required = false;
      m.workspace.ownership.entries = m.workspace.ownership.entries.filter((entry) => entry.owner_package !== 'pkg-b');
      m.inventory.claims = [];
      // A package without a seed must not participate in any boundary.
      m.dependencies.normal_edges = [];
      m.dependencies.boundaries = [];
      m.stage2_handoff.contract_boundaries = [];
      m.dependencies.dag = runDagChecks({ packages: m.workspace.packages, edges: [] });
    });
    stageAllocateDecisions(skipDir.dir, makeDecisions(JSON.parse(readFileSync(skipDir.manifestPath, 'utf8'))));
    assert.doesNotThrow(() => silent(() => runGate(['gate', skipDir.manifestPath])));
  } finally {
    rmSync(skipDir.dir, { recursive: true, force: true });
  }

  rmSync(outside, { recursive: true, force: true });
});

test('C002/C005 runFinalize publishes tree + seeds and BLOCKs on re-run', () => {
  const { dir, manifestPath, manifest } = materializeSeedFixture();
  try {
    // Staged again before the re-run, because a finalize that publishes sweeps the
    // document: the allocate manifest is the record of what was decided.
    stageAllocateDecisions(dir, makeDecisions(manifest));
    assert.doesNotThrow(() => silent(() => runFinalize(['finalize', manifestPath])));
    assert.ok(existsSync(join(dir, 'crates', 'protocol', 'alpha', 'RFC-SEED.md')));
    const publishedManifest = JSON.parse(readFileSync(join(dir, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), 'utf8'));
    assert.equal(publishedManifest.artifact_kind, 'workspacify-allocate-manifest');
    assert.equal(publishedManifest.seed_index.length, 2);
    const seedText = readFileSync(join(dir, 'crates', 'protocol', 'alpha', 'RFC-SEED.md'), 'utf8');
    assert.equal(parseSeed(seedText).headings.length, SEED_REQUIRED_SECTIONS.length);
    // Re-run is BLOCKED because planned directories are now non-empty.
    stageAllocateDecisions(dir, makeDecisions(manifest));
    assert.throws(() => silent(() => runFinalize(['finalize', manifestPath])), (e) => e.gateId !== undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
