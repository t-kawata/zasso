// [::TICKET::] PX-280 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-280 --for-spec --no-implementation-order`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { verifyChain } from '../../.claude/scripts/regeneration/lib/chain.mjs';
import { commitGeneration, writeCommitJournal } from '../../.claude/scripts/regeneration/lib/commit.mjs';
import { readLedger, transition } from '../../.claude/scripts/regeneration/lib/ledger.mjs';
import { collectDesignFiles } from '../../.claude/scripts/regeneration/lib/staging.mjs';
import {
  abortTransaction,
  continueTransaction,
  deriveGeneration,
  describeStatus,
  describeThroughHandoff,
  groundHandoff,
  openTransaction,
  verifyGeneration,
} from '../../.claude/scripts/regeneration/lib/transaction.mjs';
import {
  ARTIFACT_FILE_NAME,
  CANDIDATE_TEXT,
  SPEC_TEXT,
  fixtureDetectorOk,
  fixtureGroundsOk,
  fixtureProducer,
  materializeBrokenChainWorkspace,
  materializeChainWorkspace,
  snapshotDesignTree,
} from './helpers/chain-fixture.mjs';

// [::TICKET::] PX-278 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-278 --for-spec --no-implementation-order`.

/** Open, derive and verify a transaction with deterministic fixtures. */
// [::TICKET::] PX-278 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-278 --for-spec --no-implementation-order`.
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
test('derive remembers setupDone and resumes after a verify failure', () => {
// [::TICKET::] PX-279 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-279 --for-spec --no-implementation-order`.
  const workspace = materializeChainWorkspace();
  try {
    const transaction = openTransaction({ root: workspace.root, candidateSpec: workspace.candidatePath, reason: 'setup once' });
    const resumes = [];
    const first = deriveGeneration({
      root: workspace.root,
      transactionId: transaction.transactionId,
      runProducer: (input) => {
        resumes.push(input.resume);
        fixtureProducer(input);
        return { state: 'derived', setupDone: true };
      },
    });
    assert.equal(first.state, 'derived');
    assert.equal(readLedger(workspace.root).transactions.at(-1).setupDone, true);
    verifyGeneration({
      root: workspace.root,
      transactionId: transaction.transactionId,
      runGrounds: fixtureGroundsOk,
      runDetector: () => ({ exitCode: 1, findings: [{ checkId: 'S1.duplicate-id', subject: 'x' }], withheld: [] }),
    });
    const second = deriveGeneration({
      root: workspace.root,
      transactionId: transaction.transactionId,
      runProducer: (input) => {
        resumes.push(input.resume);
        return { state: 'derived', setupDone: true };
      },
    });
    assert.equal(second.state, 'derived');
    assert.deepEqual(resumes, [false, true]);
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
// [::TICKET::] PX-279 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-279 --for-spec --no-implementation-order`.
  const workspace = materializeChainWorkspace();
  try {
    const transaction = openTransaction({ root: workspace.root, candidateSpec: workspace.candidatePath, reason: 'chain' });
    deriveGeneration({ root: workspace.root, transactionId: transaction.transactionId, runProducer: fixtureProducer });
    // Break a chain link that is not a candidate input: the artifact no longer records
    // the staged specification. A staged spec edit is now CANDIDATE_CHANGED instead.
    writeFileSync(join(transaction.stagingRoot, ARTIFACT_FILE_NAME), `${JSON.stringify({ spec: { sha256: 'broken' } })}\n`);
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
    assert.match(describeStatus(workspace.root).next, /continue/);
    deriveGeneration({ root: workspace.root, transactionId: opened.transactionId, runProducer: fixtureProducer });
    assert.equal(describeStatus(workspace.root).state, 'derived');
    assert.match(describeStatus(workspace.root).next, /continue/);
  } finally {
    workspace.remove();
  }
});

// @verifies C002
test('the derive-failed next action names abort and open', () => {
// [::TICKET::] PX-279 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-279 --for-spec --no-implementation-order`.
  const workspace = materializeChainWorkspace();
  try {
    const transaction = openTransaction({ root: workspace.root, candidateSpec: workspace.candidatePath, reason: 'fail' });
    const derived = deriveGeneration({
      root: workspace.root,
      transactionId: transaction.transactionId,
      runProducer: () => ({ state: 'derive-failed', setupDone: false, failedStep: 'workspacify-allocate', stderr: 'planned directory is not empty' }),
    });
    assert.equal(derived.state, 'derive-failed');
    assert.match(describeStatus(workspace.root).next, /abort/);
    assert.match(describeStatus(workspace.root).next, /open/);
  } finally {
    workspace.remove();
  }
});

// @verifies C005
test('status names continue after an unverified generation', () => {
  const workspace = materializeChainWorkspace();
  try {
    const transaction = openTransaction({ root: workspace.root, candidateSpec: workspace.candidatePath, reason: 'unverified' });
    deriveGeneration({ root: workspace.root, transactionId: transaction.transactionId, runProducer: fixtureProducer });
    const verified = verifyGeneration({
      root: workspace.root,
      transactionId: transaction.transactionId,
      runGrounds: fixtureGroundsOk,
      runDetector: () => ({ exitCode: 1, findings: [{ checkId: 'S1.duplicate-id', subject: 'x' }], withheld: [] }),
    });
    assert.equal(verified.state, 'unverified');
    assert.match(describeStatus(workspace.root).next, /continue/);
  } finally {
    workspace.remove();
  }
});

// @verifies C005
test('status repeats the educe handoff until the artifact is current', () => {
  const workspace = materializeChainWorkspace();
  try {
    const transaction = openTransaction({ root: workspace.root, candidateSpec: workspace.candidatePath, reason: 'handoff' });
    const first = deriveGeneration({
      root: workspace.root,
      transactionId: transaction.transactionId,
      runProducer: ({ stagingRoot }) => ({
        state: 'educe-pending',
        setupDone: true,
        stagingSpecPath: join(stagingRoot, 'spec.md'),
        next: `run .claude/commands/educe-sequences.md with ${join(stagingRoot, 'spec.md')}, then derive again`,
      }),
    });
    assert.equal(first.state, 'educe-pending');
    assert.match(describeStatus(workspace.root).next, /educe-sequences/);

    deriveGeneration({ root: workspace.root, transactionId: transaction.transactionId, runProducer: fixtureProducer });
    assert.match(describeStatus(workspace.root).next, /continue/);
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

// @verifies C001
test('continue drives an open transaction to committed in one call', () => {
  const workspace = materializeChainWorkspace();
  try {
    const transaction = openTransaction({ root: workspace.root, candidateSpec: workspace.candidatePath, reason: 'continue' });
    const result = continueTransaction({
      root: workspace.root,
      transactionId: transaction.transactionId,
      runProducer: fixtureProducer,
      runGrounds: fixtureGroundsOk,
      runDetector: fixtureDetectorOk,
    });
    assert.equal(result.state, 'committed');
    assert.equal(readLedger(workspace.root).transactions.at(-1).state, 'committed');
    assert.equal(verifyChain(workspace.root).ok, true);
  } finally {
    workspace.remove();
  }
});

// @verifies C001
test('continue commits a verified transaction without running derive again', () => {
  const workspace = materializeChainWorkspace();
  try {
    const { transaction } = verifiedTransaction(workspace);
    let deriveCalls = 0;
    const result = continueTransaction({
      root: workspace.root,
      transactionId: transaction.transactionId,
      runProducer: () => {
        deriveCalls += 1;
        throw new Error('derive must not run for a verified transaction');
      },
      runGrounds: fixtureGroundsOk,
      runDetector: fixtureDetectorOk,
    });
    assert.equal(result.state, 'committed');
    assert.equal(deriveCalls, 0);
  } finally {
    workspace.remove();
  }
});

// @verifies C001
test('continue returns a terminal state without rewriting the ledger', () => {
  const workspace = materializeChainWorkspace();
  try {
    const transaction = openTransaction({ root: workspace.root, candidateSpec: workspace.candidatePath, reason: 'terminal' });
    abortTransaction({ root: workspace.root, transactionId: transaction.transactionId });
    const before = readLedger(workspace.root);
    const result = continueTransaction({
      root: workspace.root,
      transactionId: transaction.transactionId,
      runDetector: fixtureDetectorOk,
    });
    assert.equal(result.state, 'aborted');
    assert.deepEqual(readLedger(workspace.root), before);
    assert.throws(
      () => deriveGeneration({ root: workspace.root, transactionId: transaction.transactionId }),
      (error) => error.code === 'TRANSACTION_TERMINAL',
    );
  } finally {
    workspace.remove();
  }
});

// @verifies C002
test('continue stops at the educe handoff and names the staged spec', () => {
  const workspace = materializeChainWorkspace();
  const before = snapshotDesignTree(workspace.root);
  try {
    const transaction = openTransaction({ root: workspace.root, candidateSpec: workspace.candidatePath, reason: 'educe' });
    const pending = continueTransaction({
      root: workspace.root,
      transactionId: transaction.transactionId,
      runProducer: ({ stagingRoot }) => ({
        state: 'educe-pending',
        setupDone: true,
        stagingSpecPath: join(stagingRoot, 'spec.md'),
        next: 'the artifact is stale',
      }),
      runGrounds: fixtureGroundsOk,
      runDetector: fixtureDetectorOk,
    });
    assert.equal(pending.state, 'educe-pending');
    assert.match(pending.next, /educe-sequences\.md/);
    assert.equal(pending.stagingSpecPath, join(transaction.stagingRoot, 'spec.md'));
    assert.deepEqual(snapshotDesignTree(workspace.root), before);
    assert.throws(
      () => commitGeneration({ root: workspace.root, transactionId: transaction.transactionId, runDetector: fixtureDetectorOk }),
      (error) => error.code === 'UNVERIFIED_GENERATION',
    );
  } finally {
    workspace.remove();
  }
});

// @verifies C002
test('describeThroughHandoff names the phase or the reason and always returns to educe', () => {
  assert.match(
    describeThroughHandoff({ exitCode: 3, stdout: 'phase 02 [read] FAIL — a reader must answer\n', stderr: '' }, '/tmp/staging/spec.md'),
    /phase 02 \[read\].*educe-sequences\.md/,
  );
  assert.match(
    describeThroughHandoff({ exitCode: 1, stdout: '', stderr: 'refused: the specification has no chapters\n' }, '/tmp/staging/spec.md'),
    /no chapters.*educe-sequences\.md/,
  );
});

// @verifies C003
test('continue turns a ground failure into an AI handoff, not a human stop', () => {
  const workspace = materializeChainWorkspace();
  const before = snapshotDesignTree(workspace.root);
  try {
    const transaction = openTransaction({ root: workspace.root, candidateSpec: workspace.candidatePath, reason: 'ground' });
    const judged = continueTransaction({
      root: workspace.root,
      transactionId: transaction.transactionId,
      runProducer: fixtureProducer,
      runGrounds: () => ({ ok: false, checked: 1, reason: 'grill-me-for-rfc/check-obligation-coverage.js: OBL-1 is uncovered' }),
      runDetector: fixtureDetectorOk,
    });
    assert.equal(judged.state, 'judgment-required');
    assert.match(judged.next, /grill-me-for-rfc/);
    assert.ok(judged.next.includes(transaction.stagingRoot));
    assert.doesNotMatch(judged.next, /human|stop and report/i);
    assert.deepEqual(snapshotDesignTree(workspace.root), before);
  } finally {
    workspace.remove();
  }
});

// @verifies C003
test('continue re-verifies a judgment-required transaction after the AI settles the ground', () => {
  const workspace = materializeChainWorkspace();
  try {
    const transaction = openTransaction({ root: workspace.root, candidateSpec: workspace.candidatePath, reason: 'settle' });
    deriveGeneration({ root: workspace.root, transactionId: transaction.transactionId, runProducer: fixtureProducer });
    verifyGeneration({
      root: workspace.root,
      transactionId: transaction.transactionId,
      runGrounds: () => ({ ok: false, checked: 1, reason: 'the ground no longer resolves' }),
      runDetector: fixtureDetectorOk,
    });
    assert.equal(readLedger(workspace.root).transactions.at(-1).state, 'judgment-required');

    const result = continueTransaction({
      root: workspace.root,
      transactionId: transaction.transactionId,
      runProducer: fixtureProducer,
      runGrounds: fixtureGroundsOk,
      runDetector: fixtureDetectorOk,
    });
    assert.equal(result.state, 'committed');
    assert.equal(readLedger(workspace.root).transactions.at(-1).state, 'committed');
  } finally {
    workspace.remove();
  }
});

// @verifies C003
test('groundHandoff routes an RFC seed to explain-seed with the seed named', () => {
  const handoff = groundHandoff({ stagingRoot: '/tmp/staging', reason: 'RFC-SEED.md line 12 has no evidence' });
  assert.match(handoff, /explain-seed/);
  assert.match(handoff, /RFC seed/);
  assert.match(handoff, /continue/);
  assert.doesNotMatch(handoff, /human|stop and report/i);
});

// @verifies C003
test('continue returns the abort/open action for a derive-failed transaction without retrying setup', () => {
  const workspace = materializeChainWorkspace();
  try {
    const transaction = openTransaction({ root: workspace.root, candidateSpec: workspace.candidatePath, reason: 'failed' });
    deriveGeneration({
      root: workspace.root,
      transactionId: transaction.transactionId,
      runProducer: () => ({ state: 'derive-failed', setupDone: false, failedStep: 'workspacify-allocate', stderr: 'planned directory is not empty' }),
    });
    let retries = 0;
    const result = continueTransaction({
      root: workspace.root,
      transactionId: transaction.transactionId,
      runProducer: () => {
        retries += 1;
        throw new Error('a failed setup must not be retried');
      },
      runDetector: fixtureDetectorOk,
    });
    assert.equal(result.state, 'derive-failed');
    assert.match(result.next, /abort/);
    assert.equal(retries, 0);
  } finally {
    workspace.remove();
  }
});

// @verifies C001
test('continue returns commit-failed and restores the live tree when the post-commit detector fails', () => {
  const workspace = materializeChainWorkspace();
  const before = snapshotDesignTree(workspace.root);
  try {
    const transaction = openTransaction({ root: workspace.root, candidateSpec: workspace.candidatePath, reason: 'rollback' });
    deriveGeneration({ root: workspace.root, transactionId: transaction.transactionId, runProducer: fixtureProducer });
    verifyGeneration({
      root: workspace.root,
      transactionId: transaction.transactionId,
      runGrounds: fixtureGroundsOk,
      runDetector: fixtureDetectorOk,
    });
    const detector = ({ allowTransaction }) => (allowTransaction === undefined
      ? fixtureDetectorOk()
      : { exitCode: 1, findings: [{ checkId: 'S1.duplicate-id', subject: 'x' }], withheld: [] });
    const result = continueTransaction({
      root: workspace.root,
      transactionId: transaction.transactionId,
      runProducer: fixtureProducer,
      runGrounds: fixtureGroundsOk,
      runDetector: detector,
    });
    assert.equal(result.state, 'commit-failed');
    assert.match(result.next, /archive/);
    assert.deepEqual(snapshotDesignTree(workspace.root), before);
  } finally {
    workspace.remove();
  }
});

// @verifies C001
test('continue recovers an interrupted commit before doing anything else', () => {
  const workspace = materializeChainWorkspace();
  try {
    const transaction = openTransaction({ root: workspace.root, candidateSpec: workspace.candidatePath, reason: 'recover' });
    deriveGeneration({ root: workspace.root, transactionId: transaction.transactionId, runProducer: fixtureProducer });
    const archiveRoot = join(workspace.root, 'regeneration', 'archive', 'manual');
    mkdirSync(archiveRoot, { recursive: true });
    const targets = collectDesignFiles(workspace.root).map((path) => {
      const backupPath = join(archiveRoot, path);
      mkdirSync(dirname(backupPath), { recursive: true });
      copyFileSync(join(workspace.root, path), backupPath);
      return { path, existed: true, backupPath };
    });
    writeFileSync(join(workspace.root, 'spec.md'), '# partial write\n');
    writeCommitJournal(workspace.root, {
      transactionId: transaction.transactionId,
      state: 'prepared',
      archiveRoot,
      targets,
    });
    transition(workspace.root, transaction.transactionId, 'committing');

    const result = continueTransaction({
      root: workspace.root,
      transactionId: transaction.transactionId,
      runProducer: fixtureProducer,
      runGrounds: fixtureGroundsOk,
      runDetector: fixtureDetectorOk,
    });
    assert.equal(result.state, 'commit-failed');
    assert.match(readFileSync(join(workspace.root, 'spec.md'), 'utf8'), /^# Spec/);
    assert.equal(readLedger(workspace.root).transactions.at(-1).state, 'commit-failed');
  } finally {
    workspace.remove();
  }
});
