import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { readLedger } from '../../.claude/scripts/regeneration/lib/ledger.mjs';
import {
  abortTransaction,
  deriveGeneration,
  openTransaction,
  describeStatus,
  verifyGeneration,
} from '../../.claude/scripts/regeneration/lib/transaction.mjs';
import {
  CANDIDATE_TEXT,
  SPEC_TEXT,
  fixtureDetectorOk,
  fixtureGroundsOk,
  fixtureProducer,
  materializeBrokenChainWorkspace,
  materializeChainWorkspace,
  snapshotDesignTree,
} from './helpers/chain-fixture.mjs';

// [::TICKET::] PX-278 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-278 --for-spec --no-implementation-order`.

/** Open, derive and verify a transaction with deterministic fixtures. */
// [::TICKET::] PX-278 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-278 --for-spec --no-implementation-order`.
function verifiedTransaction(workspace) {
  const transaction = openTransaction({ root: workspace.root, candidateSpec: workspace.candidatePath, reason: 'test' });
  deriveGeneration({ root: workspace.root, transactionId: transaction.transactionId, runProducer: fixtureProducer });
  const verified = verifyGeneration({
    root: workspace.root,
    transactionId: transaction.transactionId,
    runGrounds: fixtureGroundsOk,
    runDetector: fixtureDetectorOk,
  });
  return { transaction, verified };
}

// @verifies C001
test('open on a valid baseline creates a staging transaction and leaves the live tree byte-identical', () => {
  const workspace = materializeChainWorkspace();
  const before = snapshotDesignTree(workspace.root);
  try {
    const transaction = openTransaction({ root: workspace.root, candidateSpec: workspace.candidatePath, reason: 'revise' });
    assert.ok(transaction.transactionId.length > 0);
    assert.ok(existsSync(transaction.stagingRoot));
    assert.deepEqual(snapshotDesignTree(workspace.root), before);
    const entry = readLedger(workspace.root).transactions.at(-1);
    assert.equal(entry.state, 'open');
    assert.equal(entry.reason, 'revise');
  } finally {
    workspace.remove();
  }
});

// @verifies C001
test('open on a broken baseline reports SILENT_CHANGE_DETECTED and writes nothing', () => {
  const workspace = materializeBrokenChainWorkspace();
  const before = snapshotDesignTree(workspace.root);
  try {
    assert.throws(
      () => openTransaction({ root: workspace.root, candidateSpec: workspace.candidatePath, reason: 'revise' }),
      (error) => error.code === 'SILENT_CHANGE_DETECTED',
    );
    assert.deepEqual(snapshotDesignTree(workspace.root), before);
    assert.equal(readLedger(workspace.root).transactions.length, 0);
  } finally {
    workspace.remove();
  }
});

// @verifies C001
test('a second open while a transaction is active reports TRANSACTION_OPEN', () => {
  const workspace = materializeChainWorkspace();
  try {
    openTransaction({ root: workspace.root, candidateSpec: workspace.candidatePath, reason: 'first' });
    assert.throws(
      () => openTransaction({ root: workspace.root, candidateSpec: workspace.candidatePath, reason: 'second' }),
      (error) => error.code === 'TRANSACTION_OPEN',
    );
  } finally {
    workspace.remove();
  }
});

// @verifies C002
test('a candidate identical to the live spec reports NO_CHANGE', () => {
  const workspace = materializeChainWorkspace();
  try {
    const same = join(workspace.root, 'candidates', 'same.md');
    writeFileSync(same, SPEC_TEXT);
    assert.throws(
      () => openTransaction({ root: workspace.root, candidateSpec: same, reason: 'noop' }),
      (error) => error.code === 'NO_CHANGE',
    );
  } finally {
    workspace.remove();
  }
});

// @verifies C001
test('abort removes the staging tree and leaves the live tree byte-identical', () => {
  const workspace = materializeChainWorkspace();
  const before = snapshotDesignTree(workspace.root);
  try {
    const transaction = openTransaction({ root: workspace.root, candidateSpec: workspace.candidatePath, reason: 'abort me' });
    abortTransaction({ root: workspace.root, transactionId: transaction.transactionId });
    assert.equal(existsSync(transaction.stagingRoot), false);
    assert.deepEqual(snapshotDesignTree(workspace.root), before);
    assert.equal(readLedger(workspace.root).transactions.at(-1).state, 'aborted');
  } finally {
    workspace.remove();
  }
});

// @verifies C002
test('derive runs the producer against the staging root and leaves the live tree byte-identical', () => {
  const workspace = materializeChainWorkspace();
  const before = snapshotDesignTree(workspace.root);
  try {
    const transaction = openTransaction({ root: workspace.root, candidateSpec: workspace.candidatePath, reason: 'derive' });
    const derived = deriveGeneration({ root: workspace.root, transactionId: transaction.transactionId, runProducer: fixtureProducer });
    assert.equal(derived.state, 'derived');
    assert.deepEqual(snapshotDesignTree(workspace.root), before);
    assert.ok(existsSync(join(transaction.stagingRoot, 'WORKSPACIFY-TREE-MANIFEST.json')));
  } finally {
    workspace.remove();
  }
});

// @verifies C002
test('a derivation failure leaves the live tree byte-identical and the transaction failed', () => {
  const workspace = materializeChainWorkspace();
  const before = snapshotDesignTree(workspace.root);
  try {
    const transaction = openTransaction({ root: workspace.root, candidateSpec: workspace.candidatePath, reason: 'fail' });
    const derived = deriveGeneration({
      root: workspace.root,
      transactionId: transaction.transactionId,
      runProducer: () => { throw new Error('producer refused'); },
    });
    assert.equal(derived.state, 'derive-failed');
    assert.deepEqual(snapshotDesignTree(workspace.root), before);
    assert.equal(readLedger(workspace.root).transactions.at(-1).state, 'derive-failed');
  } finally {
    workspace.remove();
  }
});

// @verifies C002
test('derive resumes after an educe handoff without rerunning the producers', () => {
  const workspace = materializeChainWorkspace();
  try {
    const transaction = openTransaction({ root: workspace.root, candidateSpec: workspace.candidatePath, reason: 'resume' });
    const resumes = [];
    const first = deriveGeneration({
      root: workspace.root,
      transactionId: transaction.transactionId,
      runProducer: (input) => {
        resumes.push(input.resume);
        return { state: 'educe-pending', next: 'phase 2' };
      },
    });
    assert.equal(first.state, 'educe-pending');
    const second = deriveGeneration({
      root: workspace.root,
      transactionId: transaction.transactionId,
      runProducer: (input) => {
        resumes.push(input.resume);
        return fixtureProducer(input);
      },
    });
    assert.equal(second.state, 'derived');
    assert.deepEqual(resumes, [false, true]);
  } finally {
    workspace.remove();
  }
});

// @verifies C003
test('verify passes only when the chain, the grounds and the detector agree', () => {
  const workspace = materializeChainWorkspace();
  try {
    const { verified } = verifiedTransaction(workspace);
    assert.equal(verified.state, 'verified');
    assert.equal(verified.receipt.chain.ok, true);
    assert.equal(verified.receipt.detector.exitCode, 0);
  } finally {
    workspace.remove();
  }
});

// @verifies C003
test('a broken staging chain keeps commit unverified', () => {
  const workspace = materializeChainWorkspace();
  try {
    const transaction = openTransaction({ root: workspace.root, candidateSpec: workspace.candidatePath, reason: 'chain' });
    deriveGeneration({ root: workspace.root, transactionId: transaction.transactionId, runProducer: fixtureProducer });
    writeFileSync(join(transaction.stagingRoot, 'spec.md'), '# changed in staging\n');
    const verified = verifyGeneration({
      root: workspace.root,
      transactionId: transaction.transactionId,
      runGrounds: fixtureGroundsOk,
      runDetector: fixtureDetectorOk,
    });
    assert.equal(verified.state, 'unverified');
    assert.equal(verified.receipt.chain.ok, false);
  } finally {
    workspace.remove();
  }
});

// @verifies C003
test('a ground that no longer resolves records judgment-required', () => {
  const workspace = materializeChainWorkspace();
  try {
    const transaction = openTransaction({ root: workspace.root, candidateSpec: workspace.candidatePath, reason: 'ground' });
    deriveGeneration({ root: workspace.root, transactionId: transaction.transactionId, runProducer: fixtureProducer });
    const verified = verifyGeneration({
      root: workspace.root,
      transactionId: transaction.transactionId,
      runGrounds: () => ({ ok: false, checked: 1, reason: 'the cited spec line no longer states the ground' }),
      runDetector: fixtureDetectorOk,
    });
    assert.equal(verified.state, 'judgment-required');
    assert.match(verified.reason, /ground/);
  } finally {
    workspace.remove();
  }
});

// @verifies C003
test('a staging detector finding keeps commit unverified and names the finding', () => {
  const workspace = materializeChainWorkspace();
  try {
    const transaction = openTransaction({ root: workspace.root, candidateSpec: workspace.candidatePath, reason: 'finding' });
    deriveGeneration({ root: workspace.root, transactionId: transaction.transactionId, runProducer: fixtureProducer });
    const verified = verifyGeneration({
      root: workspace.root,
      transactionId: transaction.transactionId,
      runGrounds: fixtureGroundsOk,
      runDetector: () => ({ exitCode: 1, findings: [{ checkId: 'S1.step-unresolved-operation', subject: 'A-1' }], withheld: [] }),
    });
    assert.equal(verified.state, 'unverified');
    assert.equal(verified.receipt.detector.findings.length, 1);
  } finally {
    workspace.remove();
  }
});

// @verifies C001
test('status reports the state and the next action', () => {
  const workspace = materializeChainWorkspace();
  try {
    const opened = openTransaction({ root: workspace.root, candidateSpec: workspace.candidatePath, reason: 'status' });
    assert.equal(describeStatus(workspace.root).state, 'open');
    assert.match(describeStatus(workspace.root).next, /derive/);
    deriveGeneration({ root: workspace.root, transactionId: opened.transactionId, runProducer: fixtureProducer });
    assert.equal(describeStatus(workspace.root).state, 'derived');
    assert.match(describeStatus(workspace.root).next, /verify/);
  } finally {
    workspace.remove();
  }
});

// @verifies C002
test('a stale open entry blocks a second open until abort clears it', () => {
  const workspace = materializeChainWorkspace();
  try {
    const first = openTransaction({ root: workspace.root, candidateSpec: workspace.candidatePath, reason: 'first' });
    assert.throws(
      () => openTransaction({ root: workspace.root, candidateSpec: workspace.candidatePath, reason: 'second' }),
      (error) => error.code === 'TRANSACTION_OPEN',
    );
    abortTransaction({ root: workspace.root, transactionId: first.transactionId });
    const second = openTransaction({ root: workspace.root, candidateSpec: workspace.candidatePath, reason: 'second' });
    assert.ok(second.transactionId.length > 0);
  } finally {
    workspace.remove();
  }
});

// @verifies C005
test('the transaction CLI rejects force and hash arguments', async () => {
  const { spawnSync } = await import('node:child_process');
  const cli = '.claude/scripts/regeneration/run.mjs';
  for (const flag of ['--force', '--hash=abc', '--source-hash=abc']) {
    const result = spawnSync(process.execPath, [cli, 'open', flag], { encoding: 'utf8' });
    assert.notEqual(result.status, 0, flag);
    assert.match(result.stderr, /unknown|reject|force|hash/i, flag);
  }
});
