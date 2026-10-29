import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { digestOf } from '../../.claude/scripts/educe-sequences/rail/load.mjs';
import { sourceHashOf, verifyChain } from '../../.claude/scripts/regeneration/lib/chain.mjs';
import { commitGeneration } from '../../.claude/scripts/regeneration/lib/commit.mjs';
import { readLedger } from '../../.claude/scripts/regeneration/lib/ledger.mjs';
import { ANNOTATIONS_FILE_NAME } from '../../.claude/scripts/regeneration/lib/staging.mjs';
import {
  deriveGeneration,
  openTransaction,
  runPipelineProducer,
  verifyGeneration,
} from '../../.claude/scripts/regeneration/lib/transaction.mjs';
import { runCommand } from '../../.claude/scripts/smooth-sequences/run.mjs';
import { computeAllocateSelfHash } from '../../.claude/scripts/workspacify-allocate/lib/allocate-manifest.mjs';
import { computeSelfHash } from '../../.claude/scripts/workspacify-tree/lib/render.mjs';
import {
  fixtureDetectorOk,
  fixtureGroundsOk,
} from './helpers/chain-fixture.mjs';
import {
  materializeRealWorkspace,
  writeArtifactForSpec,
  writeCandidateSpec,
} from './helpers/real-workspace-fixture.mjs';
import {
  materializeSmoothWorkspace,
  minimalV2Artifact,
} from '../smooth-sequences/helpers/workspace-fixture.mjs';

const SPEC_TEXT = '# spec\n\nthe producer derives order_id\n';
const PASSING_SPEC_TEXT = '# spec\n\nthe producer derives order_id and reads it\n';
const CANDIDATE_PASSING_TEXT = '# spec\n\nthe producer derives order_id, reads it and logs it\n';

/** A cited fact on one fixture step. */
// [::TICKET::] PX-287 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-287 --for-spec --no-implementation-order`.
function citedFact(stepId, line, quote, factId, text) {
  return { factId, text, source: { step: stepId, line, quote } };
}

/** The complete annotations for the two smooth fixture steps. */
// [::TICKET::] PX-287 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-287 --for-spec --no-implementation-order`.
function completeAnnotations() {
  return {
    contracts: {
      'A-1__ProduceFact': {
        pre: [],
        post: [citedFact('A-1__ProduceFact', 1, 'the producer derives order_id', 'order_id', 'order_id is derived')],
        invariants: [], consumes: [], produces: ['order_id'], errors: [], crosses: ['boundary-001'],
      },
      'A-1__ConsumeFact': {
        pre: [citedFact('A-1__ConsumeFact', 2, 'the consumer reads order_id', 'order_id', 'order_id is present')],
        post: [], invariants: [], consumes: ['order_id'], produces: [], errors: [], crosses: ['boundary-001'],
      },
    },
    operations: {
      ProduceFact: {
        registry_contribution: 'required',
        boundary_effects: [{ boundary: 'boundary-001', direction: 'provides' }],
      },
      ConsumeFact: {
        registry_contribution: 'required',
        boundary_effects: [{ boundary: 'boundary-001', direction: 'consumes' }],
      },
    },
    boundary_grounds: [{
      boundary: 'boundary-001',
      ground: 'the crossing is enumerated by both steps',
      source: { reasonCode: 'canonical-object' },
    }],
  };
}

/** A smooth workspace whose artifact carries the spec digest and a spec file. */
// [::TICKET::] PX-287 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-287 --for-spec --no-implementation-order`.
function materializeAuthoringStaging(annotations) {
  const artifact = minimalV2Artifact();
  const workspace = materializeSmoothWorkspace({ artifact });
  const specPath = join(workspace.root, 'spec.md');
  writeFileSync(specPath, SPEC_TEXT);
  artifact.spec = { path: 'spec.md', sha256: digestOf(specPath), lines: SPEC_TEXT.split('\n').length };
  writeFileSync(workspace.artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
  if (annotations !== null) {
    writeFileSync(join(workspace.root, ANNOTATIONS_FILE_NAME), `${JSON.stringify(annotations, null, 2)}\n`);
  }
  return { workspace, specPath };
}

/** Rewrite a smooth workspace's chain for one specification. */
// [::TICKET::] PX-287 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-287 --for-spec --no-implementation-order`.
function writePassingChain(root, specPath) {
  const treePath = join(root, 'WORKSPACIFY-TREE-MANIFEST.json');
  const tree = JSON.parse(readFileSync(treePath, 'utf8'));
  tree.input = {
    hash_algorithm: 'SHA-256',
    newline_normalization: 'LF',
    source_hash: sourceHashOf(specPath),
    spec_path: 'spec.md',
  };
  tree.integrity = { canonicalization: 'workspacify-tree-json-v1', manifest_hash: '' };
  tree.integrity.manifest_hash = computeSelfHash(tree);
  writeFileSync(treePath, `${JSON.stringify(tree, null, 2)}\n`);

  const allocatePath = join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json');
  const allocate = JSON.parse(readFileSync(allocatePath, 'utf8'));
  allocate.input_tree_manifest = {
    path: 'WORKSPACIFY-TREE-MANIFEST.json',
    hash: tree.integrity.manifest_hash,
    spec: { path: 'spec.md', sha256: tree.input.source_hash },
  };
  allocate.integrity = { canonicalization: 'workspacify-allocate-json-v1', manifest_hash: '' };
  allocate.integrity.manifest_hash = computeAllocateSelfHash(allocate);
  writeFileSync(allocatePath, `${JSON.stringify(allocate, null, 2)}\n`);

  const artifactPath = join(root, 'example-sequences.json');
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
  artifact.spec = { path: 'spec.md', sha256: digestOf(specPath), lines: PASSING_SPEC_TEXT.split('\n').length };
  writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
  return tree;
}

/** A smooth workspace whose chain verifies and whose detector passes. */
// [::TICKET::] PX-287 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-287 --for-spec --no-implementation-order`.
function materializePassingWorkspace() {
  const workspace = materializeSmoothWorkspace();
  const specPath = join(workspace.root, 'spec.md');
  writeFileSync(specPath, PASSING_SPEC_TEXT);
  writePassingChain(workspace.root, specPath);
  return { ...workspace, specPath };
}

/** A producer that rewrites the chain and views for the candidate specification. */
// [::TICKET::] PX-287 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-287 --for-spec --no-implementation-order`.
function passingProducer({ root, stagingRoot, candidateSpec }) {
  copyFileSync(join(root, 'WORKSPACIFY-TREE-MANIFEST.json'), join(stagingRoot, 'WORKSPACIFY-TREE-MANIFEST.json'));
  copyFileSync(join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), join(stagingRoot, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'));
  const tree = writePassingChain(stagingRoot, candidateSpec);
  for (const pkg of tree.workspace?.packages ?? []) {
    cpSync(join(root, pkg.path), join(stagingRoot, pkg.path), { recursive: true });
  }
  const chain = verifyChain(stagingRoot);
  if (!chain.ok) throw new Error(`staging chain broken: ${JSON.stringify(chain.links.filter((link) => !link.ok))}`);
  return { state: 'derived' };
}

/** The real detector over one root. */
// [::TICKET::] PX-287, PX-292, PX-293 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-287|PX-292|PX-293) --for-spec --no-implementation-order`.
function realDetector({ root }) {
  const result = runCommand([root, '--legacy'], { stdout: () => {}, stderr: () => {} });
  return {
    exitCode: result.exitCode,
    findings: result.report?.findings ?? [],
    blocked: result.report?.blocked ?? [],
    readings: result.report?.readings ?? null,
  };
}

// @verifies C001
test('a spec change with a passing staging artifact commits and the final run passes', () => {
  const workspace = materializePassingWorkspace();
  try {
    assert.equal(runCommand([workspace.root, '--legacy'], { stdout: () => {}, stderr: () => {} }).exitCode, 0);
    const candidateSpec = join(workspace.root, 'regeneration/candidates/spec.md');
    mkdirSync(join(workspace.root, 'regeneration/candidates'), { recursive: true });
    writeFileSync(candidateSpec, CANDIDATE_PASSING_TEXT);

    const opened = openTransaction({ root: workspace.root, candidateSpec, reason: 'passing authoring' });
    const derived = deriveGeneration({ root: workspace.root, transactionId: opened.transactionId, runProducer: passingProducer });
    assert.equal(derived.state, 'derived');
    const verified = verifyGeneration({
      root: workspace.root,
      transactionId: opened.transactionId,
      runGrounds: fixtureGroundsOk,
      runDetector: realDetector,
    });
    assert.equal(verified.state, 'verified');
    assert.equal(verified.receipt.debt.increase.increased, false);
    const committed = commitGeneration({ root: workspace.root, transactionId: opened.transactionId, runDetector: realDetector });
    assert.equal(committed.state, 'committed');
    const final = runCommand([workspace.root, '--legacy'], { stdout: () => {}, stderr: () => {} });
    assert.equal(final.exitCode, 0);
    assert.equal(final.report.verdict, 'pass');
  } finally {
    workspace.remove();
  }
});

// @verifies C001
test('the producer applies the annotations after educe and before the views', () => {
  const { workspace, specPath } = materializeAuthoringStaging(completeAnnotations());
  try {
    const result = runPipelineProducer({
      root: workspace.root,
      stagingRoot: workspace.root,
      candidateSpec: specPath,
      resume: true,
    });
    assert.equal(result.state, 'derived');
    const artifact = JSON.parse(readFileSync(workspace.artifactPath, 'utf8'));
    assert.equal(artifact.schema_version, 3);
    assert.ok(artifact.migration.authorship !== undefined);
    assert.equal(artifact.steps[0].contract.authored.post[0].factId, 'order_id');
    assert.equal(artifact.boundary_grounds.length, 1);
    assert.ok(existsSync(join(workspace.root, 'crates/alpha/SEQUENCES.json')));
  } finally {
    workspace.remove();
  }
});

// @verifies C006
test('without an annotations file the artifact stays schema 2', () => {
  const { workspace, specPath } = materializeAuthoringStaging(null);
  try {
    const result = runPipelineProducer({
      root: workspace.root,
      stagingRoot: workspace.root,
      candidateSpec: specPath,
      resume: true,
    });
    assert.equal(result.state, 'derived');
    const artifact = JSON.parse(readFileSync(workspace.artifactPath, 'utf8'));
    assert.equal(artifact.schema_version, 2);
    assert.equal(artifact.migration, undefined);
  } finally {
    workspace.remove();
  }
});

// @verifies C001
test('a migration refusal returns DERIVE_FAILED and writes no artifact', () => {
  const annotations = completeAnnotations();
  annotations.boundary_grounds[0].source.reasonCode = 'wrong-code';
  const { workspace, specPath } = materializeAuthoringStaging(annotations);
  try {
    const before = readFileSync(workspace.artifactPath, 'utf8');
    const result = runPipelineProducer({
      root: workspace.root,
      stagingRoot: workspace.root,
      candidateSpec: specPath,
      resume: true,
    });
    assert.equal(result.state, 'derive-failed');
    assert.equal(result.failedStep, 'migrate-v3');
    assert.equal(readFileSync(workspace.artifactPath, 'utf8'), before);
  } finally {
    workspace.remove();
  }
});

// @verifies C004
test('open records the annotations candidate and copies it to staging', () => {
  const workspace = materializeRealWorkspace();
  try {
    const candidateAnnotations = join(workspace.root, 'regeneration/candidates/ANNOTATIONS.json');
    mkdirSync(join(workspace.root, 'regeneration/candidates'), { recursive: true });
    writeFileSync(candidateAnnotations, '{"contracts":{}}\n');
    const opened = openTransaction({
      root: workspace.root,
      candidateSpec: writeCandidateSpec(workspace),
      candidateAnnotations,
      reason: 'annotations candidate',
    });
    const entry = readLedger(workspace.root).transactions.at(-1);
    assert.equal(entry.candidateAnnotations, candidateAnnotations);
    assert.equal(entry.candidateAnnotationsHash, digestOf(candidateAnnotations));
    assert.ok(existsSync(join(opened.stagingRoot, ANNOTATIONS_FILE_NAME)));
  } finally {
    workspace.remove();
  }
});

// @verifies C004
test('editing the annotations candidate after open raises CANDIDATE_CHANGED', () => {
  const workspace = materializeRealWorkspace();
  try {
    const candidateAnnotations = join(workspace.root, 'regeneration/candidates/ANNOTATIONS.json');
    mkdirSync(join(workspace.root, 'regeneration/candidates'), { recursive: true });
    writeFileSync(candidateAnnotations, '{"contracts":{}}\n');
    const opened = openTransaction({
      root: workspace.root,
      candidateSpec: writeCandidateSpec(workspace),
      candidateAnnotations,
      reason: 'annotations edit',
    });
    writeFileSync(candidateAnnotations, '{"contracts":{"changed":{}}}\n');
    assert.throws(
      () => verifyGeneration({
        root: workspace.root,
        transactionId: opened.transactionId,
        runGrounds: fixtureGroundsOk,
        runDetector: fixtureDetectorOk,
      }),
      (error) => error.code === 'CANDIDATE_CHANGED',
    );
  } finally {
    workspace.remove();
  }
});

// @verifies C004
test('editing the staged annotations after verify refuses commit', () => {
  const workspace = materializeRealWorkspace();
  try {
    const candidateAnnotations = join(workspace.root, 'regeneration/candidates/ANNOTATIONS.json');
    mkdirSync(join(workspace.root, 'regeneration/candidates'), { recursive: true });
    writeFileSync(candidateAnnotations, '{"contracts":{}}\n');
    const opened = openTransaction({
      root: workspace.root,
      candidateSpec: writeCandidateSpec(workspace),
      candidateAnnotations,
      reason: 'annotations after verify',
    });
    deriveGeneration({ root: workspace.root, transactionId: opened.transactionId });
    writeArtifactForSpec(opened.stagingRoot, join(opened.stagingRoot, 'spec.md'));
    deriveGeneration({ root: workspace.root, transactionId: opened.transactionId });
    verifyGeneration({
      root: workspace.root,
      transactionId: opened.transactionId,
      runGrounds: fixtureGroundsOk,
      runDetector: () => ({ exitCode: 0, findings: [], blocked: [], readings: { inquest: { yes: 0 }, withheld: [] } }),
    });
    writeFileSync(join(opened.stagingRoot, ANNOTATIONS_FILE_NAME), '{"contracts":{"changed":{}}}\n');
    assert.throws(
      () => commitGeneration({
        root: workspace.root,
        transactionId: opened.transactionId,
        runDetector: () => ({ exitCode: 0, findings: [], blocked: [], readings: { inquest: { yes: 0 }, withheld: [] } }),
      }),
      (error) => error.code === 'CANDIDATE_CHANGED',
    );
  } finally {
    workspace.remove();
  }
});

// @verifies C005
test('commit archives the annotations candidate', () => {
  const workspace = materializeRealWorkspace();
  try {
    const candidateAnnotations = join(workspace.root, 'regeneration/candidates/ANNOTATIONS.json');
    mkdirSync(join(workspace.root, 'regeneration/candidates'), { recursive: true });
    writeFileSync(candidateAnnotations, '{"contracts":{}}\n');
    const opened = openTransaction({
      root: workspace.root,
      candidateSpec: writeCandidateSpec(workspace),
      candidateAnnotations,
      reason: 'annotations archive',
    });
    deriveGeneration({ root: workspace.root, transactionId: opened.transactionId });
    writeArtifactForSpec(opened.stagingRoot, join(opened.stagingRoot, 'spec.md'));
    deriveGeneration({ root: workspace.root, transactionId: opened.transactionId });
    verifyGeneration({
      root: workspace.root,
      transactionId: opened.transactionId,
      runGrounds: fixtureGroundsOk,
      runDetector: () => ({ exitCode: 0, findings: [], blocked: [], readings: { inquest: { yes: 0 }, withheld: [] } }),
    });
    const committed = commitGeneration({
      root: workspace.root,
      transactionId: opened.transactionId,
      runDetector: () => ({ exitCode: 0, findings: [], blocked: [], readings: { inquest: { yes: 0 }, withheld: [] } }),
    });
    assert.equal(committed.state, 'committed');
    assert.ok(existsSync(join(committed.archiveRoot, ANNOTATIONS_FILE_NAME)));
  } finally {
    workspace.remove();
  }
});
