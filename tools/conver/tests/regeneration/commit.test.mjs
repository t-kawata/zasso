import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync as fsRenameSync, writeFileSync } from 'node:fs';
import * as nodeFs from 'node:fs';
import { dirname, join } from 'node:path';

import {
  commitGeneration,
  readCommitJournal,
  recoverCommit,
  writeCommitJournal,
} from '../../.claude/scripts/regeneration/lib/commit.mjs';
import { collectDesignFiles } from '../../.claude/scripts/regeneration/lib/staging.mjs';
import { readLedger } from '../../.claude/scripts/regeneration/lib/ledger.mjs';
import {
  deriveGeneration,
  openTransaction,
  verifyGeneration,
} from '../../.claude/scripts/regeneration/lib/transaction.mjs';
import {
  fixtureDetectorOk,
  fixtureGroundsOk,
  fixtureProducer,
  materializeChainWorkspace,
  snapshotDesignTree,
} from './helpers/chain-fixture.mjs';

// [::TICKET::] PX-278 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-278 --for-spec --no-implementation-order`.

/** Open, derive and verify a transaction. */
// [::TICKET::] PX-278 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-278 --for-spec --no-implementation-order`.
function verifiedTransaction(workspace, runDetector = fixtureDetectorOk) {
  const transaction = openTransaction({ root: workspace.root, candidateSpec: workspace.candidatePath, reason: 'commit test' });
  deriveGeneration({ root: workspace.root, transactionId: transaction.transactionId, runProducer: fixtureProducer });
  const verified = verifyGeneration({
    root: workspace.root,
    transactionId: transaction.transactionId,
    runGrounds: fixtureGroundsOk,
    runDetector,
  });
  assert.equal(verified.state, 'verified');
  return transaction;
}

/** A fileSystem that fails the first rename to a path ending with the given suffix. */
// [::TICKET::] PX-278 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-278 --for-spec --no-implementation-order`.
function failingRenameOnce(suffix) {
  let failed = false;
  return {
    ...nodeFs,
    renameSync: (from, to) => {
      if (!failed && String(to).endsWith(suffix)) {
        failed = true;
        throw new Error(`injected rename failure at ${suffix}`);
      }
      return fsRenameSync(from, to);
    },
  };
}

// @verifies C004
test('commit replaces the design files, archives the old generation and passes post-commit verification', () => {
  const workspace = materializeChainWorkspace();
  try {
    const transaction = verifiedTransaction(workspace);
    const stagedFiles = collectDesignFiles(transaction.stagingRoot);
    const staged = Object.fromEntries(stagedFiles.map((path) => [path, readFileSync(join(transaction.stagingRoot, path))]));
    const result = commitGeneration({ root: workspace.root, transactionId: transaction.transactionId, runDetector: fixtureDetectorOk });
    assert.equal(result.state, 'committed');
    assert.ok(existsSync(result.archiveRoot));
    for (const [path, bytes] of Object.entries(staged)) {
      assert.deepEqual(readFileSync(join(workspace.root, path)), bytes, path);
    }
    assert.equal(readLedger(workspace.root).transactions.at(-1).state, 'committed');
    assert.equal(existsSync(join(transaction.stagingRoot)), false);
  } finally {
    workspace.remove();
  }
});

// @verifies C004
test('commit leaves a live design file that staging does not carry untouched', () => {
  const workspace = materializeChainWorkspace();
  try {
    const transaction = verifiedTransaction(workspace);
    const liveOnly = join(workspace.root, 'crates/alpha/EXTRA.md');
    writeFileSync(liveOnly, 'live-only\n');
    commitGeneration({ root: workspace.root, transactionId: transaction.transactionId, runDetector: fixtureDetectorOk });
    assert.equal(readFileSync(liveOnly, 'utf8'), 'live-only\n');
  } finally {
    workspace.remove();
  }
});

// @verifies C004
test('the archive stores the old generation spec and manifests', () => {
  const workspace = materializeChainWorkspace();
  try {
    const transaction = verifiedTransaction(workspace);
    const oldSpec = readFileSync(join(workspace.root, 'spec.md'));
    const result = commitGeneration({ root: workspace.root, transactionId: transaction.transactionId, runDetector: fixtureDetectorOk });
    assert.deepEqual(readFileSync(join(result.archiveRoot, 'spec.md')), oldSpec);
    assert.ok(existsSync(join(result.archiveRoot, 'WORKSPACIFY-TREE-MANIFEST.json')));
  } finally {
    workspace.remove();
  }
});

// @verifies C004
test('commit refuses an unverified transaction', () => {
  const workspace = materializeChainWorkspace();
  try {
    const transaction = openTransaction({ root: workspace.root, candidateSpec: workspace.candidatePath, reason: 'unverified' });
    deriveGeneration({ root: workspace.root, transactionId: transaction.transactionId, runProducer: fixtureProducer });
    assert.throws(
      () => commitGeneration({ root: workspace.root, transactionId: transaction.transactionId }),
      (error) => error.code === 'UNVERIFIED_GENERATION',
    );
  } finally {
    workspace.remove();
  }
});

// @verifies C004
test('commit refuses when the live baseline changed since open', () => {
  const workspace = materializeChainWorkspace();
  try {
    const transaction = verifiedTransaction(workspace);
    writeFileSync(join(workspace.root, 'crates/alpha/RFC.md'), '# changed after open\n');
    const before = snapshotDesignTree(workspace.root);
    assert.throws(
      () => commitGeneration({ root: workspace.root, transactionId: transaction.transactionId, runDetector: fixtureDetectorOk }),
      (error) => error.code === 'BASELINE_CHANGED',
    );
    assert.deepEqual(snapshotDesignTree(workspace.root), before);
  } finally {
    workspace.remove();
  }
});

// @verifies C004
test('an injected rename failure restores every live design file byte-identically', () => {
  const workspace = materializeChainWorkspace();
  try {
    const transaction = verifiedTransaction(workspace);
    const before = snapshotDesignTree(workspace.root);
    assert.throws(
      () => commitGeneration({
        root: workspace.root,
        transactionId: transaction.transactionId,
        fileSystem: failingRenameOnce('/RFC.md'),
        runDetector: fixtureDetectorOk,
      }),
      /injected rename failure/,
    );
    assert.deepEqual(snapshotDesignTree(workspace.root), before);
    assert.equal(readLedger(workspace.root).transactions.at(-1).state, 'commit-failed');
  } finally {
    workspace.remove();
  }
});

// @verifies C004
test('a post-commit detector failure restores the old generation byte-identically', () => {
  const workspace = materializeChainWorkspace();
  try {
    const transaction = verifiedTransaction(workspace);
    const before = snapshotDesignTree(workspace.root);
    const failingDetector = () => ({ exitCode: 1, findings: [{ checkId: 'S1.duplicate-id', subject: 'operations:x' }], withheld: [] });
    assert.throws(
      () => commitGeneration({ root: workspace.root, transactionId: transaction.transactionId, runDetector: failingDetector }),
      (error) => error.code === 'COMMIT_ROLLED_BACK',
    );
    assert.deepEqual(snapshotDesignTree(workspace.root), before);
    assert.equal(readLedger(workspace.root).transactions.at(-1).state, 'commit-failed');
  } finally {
    workspace.remove();
  }
});

// @verifies C004
test('recoverCommit rolls back a prepared journal before a consumer reads', () => {
  const workspace = materializeChainWorkspace();
  try {
    const transaction = verifiedTransaction(workspace);
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
    const recovered = recoverCommit(workspace.root);
    assert.equal(recovered.state, 'rolled-back');
    assert.equal(readFileSync(join(workspace.root, 'spec.md'), 'utf8').startsWith('# Spec'), true);
    assert.equal(readCommitJournal(workspace.root), null);
  } finally {
    workspace.remove();
  }
});

// @verifies C004
test('recoverCommit completes a verifying journal whose live chain is valid', () => {
  const workspace = materializeChainWorkspace();
  try {
    const transaction = verifiedTransaction(workspace);
    const targets = collectDesignFiles(workspace.root).map((path) => ({ path, existed: true, backupPath: null }));
    for (const path of collectDesignFiles(transaction.stagingRoot)) {
      const target = join(workspace.root, path);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(join(transaction.stagingRoot, path), target);
    }
    writeCommitJournal(workspace.root, {
      transactionId: transaction.transactionId,
      state: 'verifying',
      archiveRoot: null,
      targets,
    });
    const recovered = recoverCommit(workspace.root);
    assert.equal(recovered.state, 'completed');
    assert.equal(readCommitJournal(workspace.root), null);
  } finally {
    workspace.remove();
  }
});

// @verifies C005
test('no commit writes a frozen basename while the transaction is unverified', () => {
  const workspace = materializeChainWorkspace();
  const before = snapshotDesignTree(workspace.root);
  try {
    const transaction = openTransaction({ root: workspace.root, candidateSpec: workspace.candidatePath, reason: 'no write' });
    deriveGeneration({ root: workspace.root, transactionId: transaction.transactionId, runProducer: fixtureProducer });
    assert.throws(
      () => commitGeneration({ root: workspace.root, transactionId: transaction.transactionId }),
      (error) => error.code === 'UNVERIFIED_GENERATION',
    );
    assert.deepEqual(snapshotDesignTree(workspace.root), before);
  } finally {
    workspace.remove();
  }
});
