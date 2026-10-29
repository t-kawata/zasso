// [::TICKET::] PX-341 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-341 --for-spec --no-implementation-order`.
// [::TICKET::] PX-280 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-280 --for-spec --no-implementation-order`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { digestOf } from '../../.claude/scripts/educe-sequences/rail/load.mjs';
import { commitGeneration } from '../../.claude/scripts/regeneration/lib/commit.mjs';
import { readLedger, transition } from '../../.claude/scripts/regeneration/lib/ledger.mjs';
import {
  deriveGeneration,
  describeStatus,
  openTransaction,
  readArtifactCurrency,
  verifyGeneration,
} from '../../.claude/scripts/regeneration/lib/transaction.mjs';
import {
  fixtureDetectorOk,
  fixtureGroundsOk,
  fixtureProducer,
  materializeChainWorkspace,
  snapshotDesignTree,
} from './helpers/chain-fixture.mjs';

const CLI = '.claude/scripts/regeneration/run.mjs';

/** Add the two decisions documents a real workspace carries. */
// [::TICKET::] PX-279 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-279 --for-spec --no-implementation-order`.
function writeLiveDecisions(workspace) {
  const allocatePath = join(workspace.root, 'workspacify/allocate/DECISIONS.json');
  const treePath = join(workspace.root, 'workspacify/tree/DECISIONS.json');
  mkdirSync(dirname(allocatePath), { recursive: true });
  mkdirSync(dirname(treePath), { recursive: true });
  writeFileSync(allocatePath, `${JSON.stringify({ version: 2, serves: [], assignments: [], adjudications: [] })}\n`);
  writeFileSync(treePath, `${JSON.stringify({ workspace: [], ownership: [], dependencies: [], adapters: [], approvals: [], semantic_review: { status: 'APPROVED', statement: 'ok', approver: 'live' } })}\n`);
  return { allocatePath, treePath };
}

/** A candidate decisions document that differs from the live one in one value. */
// [::TICKET::] PX-279 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-279 --for-spec --no-implementation-order`.
function writeCandidateDecisions(workspace, key) {
  const path = join(workspace.root, `regeneration/candidates/${key}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ version: 2, serves: [], assignments: [], adjudications: [], changed: key })}\n`);
  return path;
}

/** Open, derive and verify with the deterministic producer. */
// [::TICKET::] PX-279 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-279 --for-spec --no-implementation-order`.
function verifiedTransaction(workspace) {
  const transaction = openTransaction({ root: workspace.root, candidateSpec: workspace.candidatePath, reason: 'binding' });
  deriveGeneration({ root: workspace.root, transactionId: transaction.transactionId, runProducer: fixtureProducer });
  const verified = verifyGeneration({
    root: workspace.root,
    transactionId: transaction.transactionId,
    runGrounds: fixtureGroundsOk,
    runDetector: fixtureDetectorOk,
  });
  assert.equal(verified.state, 'verified');
  return transaction;
}

// @verifies C001
test('open records every supplied candidate hash', () => {
  const workspace = materializeChainWorkspace();
  try {
    const live = writeLiveDecisions(workspace);
    const candidateAllocateDecisions = writeCandidateDecisions(workspace, 'ALLOCATE');
    const candidateTreeDecisions = writeCandidateDecisions(workspace, 'TREE');
    openTransaction({
      root: workspace.root,
      candidateSpec: workspace.candidatePath,
      candidateAllocateDecisions,
      candidateTreeDecisions,
      reason: 'all inputs',
    });
    const entry = readLedger(workspace.root).transactions.at(-1);
    assert.equal(entry.candidateHash.length, 64);
    assert.equal(entry.candidateAllocateDecisions, candidateAllocateDecisions);
    assert.equal(entry.candidateAllocateDecisionsHash.length, 64);
    assert.equal(entry.candidateTreeDecisions, candidateTreeDecisions);
    assert.equal(entry.candidateTreeDecisionsHash.length, 64);
    assert.deepEqual(entry.changedInputs.sort(), ['allocate-decisions', 'spec', 'tree-decisions']);
    assert.equal(entry.base['workspacify/allocate/DECISIONS.json'] !== undefined, true);
    assert.equal(live.treePath.length > 0, true);
  } finally {
    workspace.remove();
  }
});

// @verifies C001
test('one differing candidate is enough to open', () => {
  for (const kind of ['spec', 'allocate', 'tree']) {
    const workspace = materializeChainWorkspace();
    try {
      writeLiveDecisions(workspace);
      const input = { root: workspace.root, reason: kind };
      if (kind === 'spec') input.candidateSpec = workspace.candidatePath;
      if (kind === 'allocate') input.candidateAllocateDecisions = writeCandidateDecisions(workspace, 'ALLOCATE');
      if (kind === 'tree') input.candidateTreeDecisions = writeCandidateDecisions(workspace, 'TREE');
      const opened = openTransaction(input);
      assert.ok(opened.transactionId.length > 0, kind);
      assert.deepEqual(readLedger(workspace.root).transactions.at(-1).changedInputs, [kind === 'spec' ? 'spec' : `${kind}-decisions`]);
    } finally {
      workspace.remove();
    }
  }
});

// @verifies C001
test('no differing candidate returns NO_CHANGE', () => {
  const workspace = materializeChainWorkspace();
  try {
    const live = writeLiveDecisions(workspace);
    assert.throws(
      () => openTransaction({ root: workspace.root, candidateAllocateDecisions: live.allocatePath, reason: 'same' }),
      (error) => error.code === 'NO_CHANGE',
    );
  } finally {
    workspace.remove();
  }
});

// @verifies C004
test('editing the staged specification after open returns CANDIDATE_CHANGED', () => {
  const workspace = materializeChainWorkspace();
  try {
    const transaction = openTransaction({ root: workspace.root, candidateSpec: workspace.candidatePath, reason: 'tamper' });
    writeFileSync(join(transaction.stagingRoot, 'spec.md'), '# changed in staging\n');
    assert.throws(
      () => verifyGeneration({
        root: workspace.root,
        transactionId: transaction.transactionId,
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
test('editing the staged allocate decisions after open returns CANDIDATE_CHANGED', () => {
  const workspace = materializeChainWorkspace();
  try {
    writeLiveDecisions(workspace);
    const candidateAllocateDecisions = writeCandidateDecisions(workspace, 'ALLOCATE');
    const transaction = openTransaction({ root: workspace.root, candidateAllocateDecisions, reason: 'tamper' });
    writeFileSync(join(transaction.stagingRoot, 'workspacify/allocate/DECISIONS.json'), '{ "changed": true }\n');
    assert.throws(
      () => verifyGeneration({
        root: workspace.root,
        transactionId: transaction.transactionId,
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
test('editing a staged package document after verify returns STAGING_CHANGED and writes nothing', () => {
  const workspace = materializeChainWorkspace();
  try {
    const before = snapshotDesignTree(workspace.root);
    const transaction = verifiedTransaction(workspace);
    writeFileSync(join(transaction.stagingRoot, 'crates/alpha/RFC.md'), '# changed after verify\n');
    assert.throws(
      () => commitGeneration({ root: workspace.root, transactionId: transaction.transactionId, runDetector: fixtureDetectorOk }),
      (error) => error.code === 'STAGING_CHANGED',
    );
    assert.deepEqual(snapshotDesignTree(workspace.root), before);
  } finally {
    workspace.remove();
  }
});

// @verifies C003
test('the artifact currency check uses the educe raw digest, not the normalized tree hash', () => {
  const workspace = materializeChainWorkspace();
  try {
    const transaction = openTransaction({ root: workspace.root, candidateSpec: workspace.candidatePath, reason: 'digest' });
    const stagedSpec = join(transaction.stagingRoot, 'spec.md');
    const normalizedHash = readFileSync(stagedSpec, 'utf8').length.toString(16).padStart(64, '0');
    writeFileSync(join(transaction.stagingRoot, 'example-sequences.json'), `${JSON.stringify({ spec: { sha256: normalizedHash } })}\n`);
    assert.equal(readArtifactCurrency({ stagingRoot: transaction.stagingRoot, specPath: stagedSpec }).state, 'stale');

    writeFileSync(join(transaction.stagingRoot, 'example-sequences.json'), `${JSON.stringify({ spec: { sha256: digestOf(stagedSpec) } })}\n`);
    assert.equal(readArtifactCurrency({ stagingRoot: transaction.stagingRoot, specPath: stagedSpec }).state, 'current');
  } finally {
    workspace.remove();
  }
});

// @verifies C005
test('status names the transaction, the staging specification and the exact next command', () => {
  const workspace = materializeChainWorkspace();
  try {
    const opened = openTransaction({ root: workspace.root, candidateSpec: workspace.candidatePath, reason: 'status' });
    const result = spawnSync(process.execPath, [join(process.cwd(), CLI), 'status'], { cwd: workspace.root, encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.match(result.stdout, new RegExp(`id: ${opened.transactionId}`));
    assert.match(result.stdout, /staging: /);
    assert.match(result.stdout, /spec: /);
    assert.match(result.stdout, /next: node "\$\(git rev-parse --show-toplevel\)\/\.claude\/scripts\/regeneration\/run\.mjs" continue/);
    assert.equal(describeStatus(workspace.root).state, 'open');
  } finally {
    workspace.remove();
  }
});

// @verifies C005
test('status exits 3 when the transaction awaits a judgment', () => {
  const workspace = materializeChainWorkspace();
  try {
    const opened = openTransaction({ root: workspace.root, candidateSpec: workspace.candidatePath, reason: 'judgment' });
    transition(workspace.root, opened.transactionId, 'judgment-required', { reason: 'a ground no longer resolves' });
    const result = spawnSync(process.execPath, [join(process.cwd(), CLI), 'status'], { cwd: workspace.root, encoding: 'utf8' });
    assert.equal(result.status, 3);
    assert.match(result.stdout, /judgment-required/);
  } finally {
    workspace.remove();
  }
});

// @verifies C005
test('commit through the CLI refuses an unverified transaction with exit 1', () => {
  const workspace = materializeChainWorkspace();
  try {
    const opened = openTransaction({ root: workspace.root, candidateSpec: workspace.candidatePath, reason: 'cli commit' });
    const result = spawnSync(process.execPath, [join(process.cwd(), CLI), 'commit', `--transaction=${opened.transactionId}`], { cwd: workspace.root, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /UNVERIFIED_GENERATION/);
  } finally {
    workspace.remove();
  }
});
