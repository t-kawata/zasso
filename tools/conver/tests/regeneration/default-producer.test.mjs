import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { verifyChain } from '../../.claude/scripts/regeneration/lib/chain.mjs';
import { commitGeneration } from '../../.claude/scripts/regeneration/lib/commit.mjs';
import { readLedger } from '../../.claude/scripts/regeneration/lib/ledger.mjs';
import { collectDesignFiles } from '../../.claude/scripts/regeneration/lib/staging.mjs';
import {
  deriveGeneration,
  openTransaction,
  verifyGeneration,
} from '../../.claude/scripts/regeneration/lib/transaction.mjs';
import {
  fixtureDetectorOk,
  fixtureGroundsOk,
  snapshotDesignTree,
} from './helpers/chain-fixture.mjs';
import {
  CANDIDATE_SPEC_TEXT,
  materializeRealWorkspace,
  writeArtifactForSpec,
  writeCandidateAllocateDecisions,
  writeCandidateSpec,
  writeCandidateTreeDecisions,
} from './helpers/real-workspace-fixture.mjs';

// @verifies C001
test('open stages the candidate without copying a package document into the derivation root', () => {
// [::TICKET::] PX-279 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-279 --for-spec --no-implementation-order`.
  const workspace = materializeRealWorkspace();
  try {
    const before = snapshotDesignTree(workspace.root);
    const candidateSpec = writeCandidateSpec(workspace);
    const opened = openTransaction({ root: workspace.root, candidateSpec, reason: 'S1.duplicate-id' });

    const stagedBeforeSetup = collectDesignFiles(opened.stagingRoot);
    assert.equal(stagedBeforeSetup.some((path) => path.startsWith('crates/')), false);
    assert.deepEqual(snapshotDesignTree(workspace.root), before);
    const entry = readLedger(workspace.root).transactions.at(-1);
    assert.equal(entry.specRelativePath, 'spec.md');
    assert.equal(entry.candidateHash.length, 64);
  } finally {
    workspace.remove();
  }
});

// @verifies C001
test('open records a tree decisions candidate without changing the live tree', () => {
  const workspace = materializeRealWorkspace();
  try {
    const before = snapshotDesignTree(workspace.root);
    const candidateTreeDecisions = writeCandidateTreeDecisions(workspace);
    openTransaction({
      root: workspace.root,
      candidateSpec: writeCandidateSpec(workspace),
      candidateTreeDecisions,
      reason: 'S6.cycle',
    });
    const entry = readLedger(workspace.root).transactions.at(-1);
    assert.equal(entry.candidateTreeDecisions, candidateTreeDecisions);
    assert.equal(entry.candidateTreeDecisionsHash.length, 64);
    assert.deepEqual(snapshotDesignTree(workspace.root), before);
  } finally {
    workspace.remove();
  }
});

// @verifies C002
test('derive runs the real tree and allocate producers and returns educe-pending for a stale artifact', () => {
  const workspace = materializeRealWorkspace();
  try {
    const before = snapshotDesignTree(workspace.root);
    const opened = openTransaction({
      root: workspace.root,
      candidateSpec: writeCandidateSpec(workspace),
      reason: 'S1.duplicate-id',
    });

    const derived = deriveGeneration({ root: workspace.root, transactionId: opened.transactionId });
    assert.equal(derived.state, 'educe-pending');
    assert.match(derived.next, /educe-sequences/);
    assert.equal(derived.stagingSpecPath, join(opened.stagingRoot, 'spec.md'));
    assert.deepEqual(snapshotDesignTree(workspace.root), before);

    const entry = readLedger(workspace.root).transactions.at(-1);
    assert.equal(entry.setupDone, true);
    assert.ok(existsSync(join(opened.stagingRoot, 'WORKSPACIFY-TREE-MANIFEST.json')));
    assert.ok(existsSync(join(opened.stagingRoot, 'WORKSPACIFY-ALLOCATE-MANIFEST.json')));
    assert.ok(existsSync(join(opened.stagingRoot, 'crates/protocol/core/RFC-SEED.md')));
  } finally {
    workspace.remove();
  }
});

// @verifies C002
test('a second derive after the educe handoff accepts a matching artifact and writes the package views', () => {
  const workspace = materializeRealWorkspace();
  try {
    const before = snapshotDesignTree(workspace.root);
    const opened = openTransaction({
      root: workspace.root,
      candidateSpec: writeCandidateSpec(workspace),
      reason: 'S1.duplicate-id',
    });
    deriveGeneration({ root: workspace.root, transactionId: opened.transactionId });
    const stagedArtifact = writeArtifactForSpec(opened.stagingRoot, join(opened.stagingRoot, 'spec.md'));

    const derived = deriveGeneration({ root: workspace.root, transactionId: opened.transactionId });
    assert.equal(derived.state, 'derived');
    assert.ok(existsSync(stagedArtifact));
    assert.ok(existsSync(join(opened.stagingRoot, 'crates/protocol/core/SEQUENCES.json')));
    assert.deepEqual(snapshotDesignTree(workspace.root), before);
  } finally {
    workspace.remove();
  }
});

// @verifies C002
// @verifies C004
test('the full transaction commits the candidate specification and keeps the live chain valid', () => {
  const workspace = materializeRealWorkspace();
  try {
    const opened = openTransaction({
      root: workspace.root,
      candidateSpec: writeCandidateSpec(workspace),
      reason: 'S1.duplicate-id',
    });
    deriveGeneration({ root: workspace.root, transactionId: opened.transactionId });
    writeArtifactForSpec(opened.stagingRoot, join(opened.stagingRoot, 'spec.md'));
    deriveGeneration({ root: workspace.root, transactionId: opened.transactionId });

    const verified = verifyGeneration({
      root: workspace.root,
      transactionId: opened.transactionId,
      runGrounds: fixtureGroundsOk,
      runDetector: fixtureDetectorOk,
    });
    assert.equal(verified.state, 'verified');

    const committed = commitGeneration({
      root: workspace.root,
      transactionId: opened.transactionId,
      runDetector: fixtureDetectorOk,
    });
    assert.equal(committed.state, 'committed');
    assert.equal(readFileSync(join(workspace.root, 'spec.md'), 'utf8'), CANDIDATE_SPEC_TEXT);
    assert.equal(existsSync(opened.stagingRoot), false);
    assert.equal(verifyChain(workspace.root).ok, true);
  } finally {
    workspace.remove();
  }
});

// @verifies C004
test('the CLI commit publishes a verified generation while its own detector runs', () => {
  const workspace = materializeRealWorkspace();
  try {
    const opened = openTransaction({
      root: workspace.root,
      candidateSpec: writeCandidateSpec(workspace),
      reason: 'cli commit',
    });
    deriveGeneration({ root: workspace.root, transactionId: opened.transactionId });
    writeArtifactForSpec(opened.stagingRoot, opened.stagingSpecPath);
    deriveGeneration({ root: workspace.root, transactionId: opened.transactionId });
    verifyGeneration({
      root: workspace.root,
      transactionId: opened.transactionId,
      runGrounds: fixtureGroundsOk,
      runDetector: fixtureDetectorOk,
    });

    const result = spawnSync(
      process.execPath,
      [join(process.cwd(), '.claude/scripts/regeneration/run.mjs'), 'commit', `--transaction=${opened.transactionId}`],
      { cwd: workspace.root, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /state: committed/);
    assert.equal(readFileSync(join(workspace.root, 'spec.md'), 'utf8'), CANDIDATE_SPEC_TEXT);
    assert.equal(verifyChain(workspace.root).ok, true);
  } finally {
    workspace.remove();
  }
});

// @verifies C006
test('a decisions-only transaction reuses the current artifact and leaves the live specification unchanged', () => {
  const workspace = materializeRealWorkspace();
  try {
    const beforeSpec = readFileSync(join(workspace.root, 'spec.md'));
    const before = snapshotDesignTree(workspace.root);
    const candidateAllocateDecisions = writeCandidateAllocateDecisions(workspace);
    const opened = openTransaction({
      root: workspace.root,
      candidateAllocateDecisions,
      reason: 'S4.boundary-clause-missing',
    });

    const derived = deriveGeneration({ root: workspace.root, transactionId: opened.transactionId });
    assert.equal(derived.state, 'derived');
    assert.deepEqual(readFileSync(join(workspace.root, 'spec.md')), beforeSpec);
    assert.deepEqual(snapshotDesignTree(workspace.root), before);

    const verified = verifyGeneration({
      root: workspace.root,
      transactionId: opened.transactionId,
      runGrounds: fixtureGroundsOk,
      runDetector: fixtureDetectorOk,
    });
    assert.equal(verified.state, 'verified');
    const committed = commitGeneration({
      root: workspace.root,
      transactionId: opened.transactionId,
      runDetector: fixtureDetectorOk,
    });
    assert.equal(committed.state, 'committed');
    assert.deepEqual(readFileSync(join(workspace.root, 'spec.md')), beforeSpec);
    const liveDecisions = JSON.parse(readFileSync(join(workspace.root, 'workspacify/allocate/DECISIONS.json'), 'utf8'));
    assert.equal(liveDecisions.semantic_review.approver, 'regeneration-test');
  } finally {
    workspace.remove();
  }
});
