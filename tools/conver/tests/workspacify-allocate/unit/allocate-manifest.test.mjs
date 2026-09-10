// [::TICKET::] PX-195, PX-201 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-195|PX-201) --for-spec --no-implementation-order`.
// PX-195 @verifies C001
// The allocate manifest is the machine final authority: it records what was
// proven, hashes every seed, and verifies itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';

import { buildAllocateManifest, computeAllocateSelfHash, renderAllocateManifest } from '../../../.claude/scripts/workspacify-allocate/lib/allocate-manifest.mjs';
import { buildContractIndex, runBilateralSymmetry } from '../../../.claude/scripts/workspacify-allocate/lib/contract-gate.mjs';
import { buildIntegrationGraph, runGraphViolations } from '../../../.claude/scripts/workspacify-allocate/lib/wig.mjs';
import { deriveImplementationOrder } from '../../../.claude/scripts/workspacify-allocate/lib/implementation-order.mjs';
import { buildCoverageProof } from '../../../.claude/scripts/workspacify-allocate/lib/coverage-proof.mjs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { runFinalize } from '../../../.claude/scripts/workspacify-allocate/run.mjs';
import { materializeSeedFixture, makeDecisions } from '../helpers/build-valid-manifest.mjs';
import { makeSelfGrill, validResidual } from '../helpers/self-grill-fixture.mjs';

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

function fixture() {
  const { dir, manifestPath, manifest } = materializeSeedFixture();
  const decisions = makeDecisions(manifest);
  const decisionsPath = join(dir, 'decisions.json');
  writeFileSync(decisionsPath, JSON.stringify(decisions));
  // The manifest describes a published workspace, so publish one first.
  silent(() => runFinalize(['finalize', manifestPath, `--decisions=${decisionsPath}`]));
  const parsedByPackage = new Map(decisions.seeds.map((seed) => [seed.packageId, { contractEdges: seed.contractEdges }]));
  const contractIndex = buildContractIndex({ parsedByPackage, manifest });
  const graph = buildIntegrationGraph({ contractIndex, manifest });
  const order = deriveImplementationOrder({ graph, manifest });
  const coverageProof = buildCoverageProof({ manifest, expectedAllocation: new Map(), parsedByPackage: new Map() });
  return { dir, manifestPath, manifest, decisions, parsedByPackage, contractIndex, graph, order, coverageProof };
}

function build(prepared, review) {
  return buildAllocateManifest({
    manifestRef: { manifest: prepared.manifest, manifestPath: prepared.manifestPath, manifestDir: prepared.dir },
    plan: prepared.manifest.workspace.tree,
    proof: {
      parsedByPackage: prepared.parsedByPackage,
      contractIndex: prepared.contractIndex,
      graph: prepared.graph,
      violations: runGraphViolations({ graph: prepared.graph, manifest: prepared.manifest }),
      order: prepared.order,
      coverageProof: prepared.coverageProof,
    },
    review: review ?? { gateResults: [{ id: 'G4', status: 'PASS' }], semanticReview: { status: 'APPROVED', approver: 'ai' } },
  });
}

test('C001 the manifest records the proof, the seed index and its own hash', () => {
  const prepared = fixture();
  try {
    const allocateManifest = build(prepared);
    assert.equal(allocateManifest.artifact_kind, 'workspacify-allocate-manifest');
    assert.equal(allocateManifest.status, 'COMPLETE');
    assert.equal(allocateManifest.input_tree_manifest.hash, prepared.manifest.integrity.manifest_hash);
    assert.equal(allocateManifest.seed_index.length, 2);
    for (const entry of allocateManifest.seed_index) {
      assert.match(entry.sha256, /^[0-9a-f]{64}$/);
      assert.equal(entry.path.startsWith('/'), false, 'seed paths stay workspace relative');
    }
    assert.equal(allocateManifest.contract_registry.length, 1);
    assert.equal(allocateManifest.wig.counts.edge_count, 1);
    assert.deepEqual(allocateManifest.implementation_order.serial, prepared.manifest.dependencies.dag.implementation_order.serial);
    assert.equal(allocateManifest.integrity.reload_validation, 'READY');
    assert.equal(allocateManifest.integrity.manifest_hash, computeAllocateSelfHash(allocateManifest));
    assert.ok(renderAllocateManifest(allocateManifest).endsWith('\n'));
  } finally {
    rmSync(prepared.dir, { recursive: true, force: true });
  }
});

test('C001 any field change is caught by the self-hash', () => {
  const prepared = fixture();
  try {
    const allocateManifest = build(prepared);
    for (const mutate of [
      (m) => { m.status = 'FAIL'; },
      (m) => { m.seed_index[0].sha256 = 'f'.repeat(64); },
      (m) => { m.wig.hash = 'a'.repeat(64); },
      (m) => { m.implementation_order.serial = [...m.implementation_order.serial].reverse(); },
    ]) {
      const tampered = JSON.parse(JSON.stringify(allocateManifest));
      mutate(tampered);
      assert.notEqual(computeAllocateSelfHash(tampered), allocateManifest.integrity.manifest_hash);
    }
  } finally {
    rmSync(prepared.dir, { recursive: true, force: true });
  }
});

test('C001 the manifest names the specification and the stage-1 manifest that were proven', () => {
  const prepared = fixture();
  try {
    const allocateManifest = build(prepared);
    assert.equal(allocateManifest.input_tree_manifest.spec.path, prepared.manifest.input.spec_path);
    assert.equal(allocateManifest.input_tree_manifest.spec.sha256, prepared.manifest.input.source_hash);
    assert.equal(allocateManifest.source_coverage.segments_total, prepared.manifest.structure.segment_count);
    assert.equal(allocateManifest.completion_decision, 'COMPLETE');
    assert.equal(allocateManifest.semantic_review.status, 'APPROVED');
    assert.ok(runBilateralSymmetry({ index: prepared.contractIndex, manifest: prepared.manifest }).ok);
  } finally {
    rmSync(prepared.dir, { recursive: true, force: true });
  }
});

test('C003 the manifest publishes the loop and hands its residuals to the human grill', () => {
  const prepared = fixture();
  try {
    const residual = [{ ...validResidual(), id: 'residual-000001' }];
    const review = { gateResults: [{ id: 'G4', status: 'PASS' }], semanticReview: { status: 'APPROVED', approver: 'ai' }, selfGrill: { record: makeSelfGrill({ passes: 2, residual }), residual } };
    const allocateManifest = build(prepared, review);

    assert.equal(allocateManifest.self_grill.passes, 2);
    assert.equal(allocateManifest.self_grill.converged, true);
    assert.deepEqual(allocateManifest.self_grill.focuses, ['implementer', 'counterpart', 'test', 'grill', 'adversarial']);
    assert.equal(allocateManifest.self_grill.rounds.length, 10);
    assert.equal(allocateManifest.self_grill.rounds[0].finding_count, 0);
    assert.equal(allocateManifest.self_grill.residual_count, 1);

    assert.equal(allocateManifest.handoff_summary.grill_questions.length, allocateManifest.self_grill.residual_count);
    assert.deepEqual(allocateManifest.handoff_summary.grill_questions[0], { residual_id: 'residual-000001', package_id: 'pkg-a', question: residual[0].grill_question });
    assert.deepEqual(allocateManifest.handoff_summary.unresolved[0].topic, residual[0].topic);
    // pkg-a is an endpoint of boundary-001, so the coupling it holds is the risky one.
    assert.deepEqual(allocateManifest.handoff_summary.risky_boundaries, ['boundary-001']);

    // The summary is reproducible from the published document, and the self-hash covers it.
    const rebuilt = build(prepared, review);
    assert.deepEqual(rebuilt.handoff_summary, allocateManifest.handoff_summary);
    assert.equal(computeAllocateSelfHash(allocateManifest), allocateManifest.integrity.manifest_hash);
  } finally {
    rmSync(prepared.dir, { recursive: true, force: true });
  }
});
