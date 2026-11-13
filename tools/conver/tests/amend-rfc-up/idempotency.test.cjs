'use strict';

/**
 * PX-419 — amendment digest and replay decisions.
 */

const { test } = require('node:test');
// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  computeAmendmentDigest,
  decideReplay,
  readAmendLedger,
  writeAmendmentRecord,
} = require('../../.claude/scripts/amend-rfc-up/idempotency.js');
const { cleanup } = require('./helpers.cjs');

function makePackage() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'px419-idempotency-'));
}

// @verifies C012
test('C012: the same material and instruction digest returns NO_CHANGE', () => {
  const packageDir = makePackage();
  try {
    const digest = computeAmendmentDigest({
      materialDigests: ['m1'],
      instructionDigest: 'i1',
      changes: [{ id: 'CH1', package: 'pkg-a' }],
      targetDigests: ['t1'],
    });
    writeAmendmentRecord({ packageDir, digest, ticketKey: 'PX-1', packages: ['pkg-a'] });
    const ledger = readAmendLedger({ packageDir });
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0].digest, digest);
    assert.equal(decideReplay({ digest, ledger }).mode, 'no-change');
    assert.equal(decideReplay({ digest: 'other', ledger }).mode, 'apply');
  } finally {
    cleanup(packageDir);
  }
});

test('C012: the digest is deterministic and sensitive to its inputs', () => {
  const base = {
    materialDigests: ['m1'],
    instructionDigest: 'i1',
    changes: [{ id: 'CH1', package: 'pkg-a' }],
    targetDigests: ['t1'],
  };
  assert.equal(computeAmendmentDigest(base), computeAmendmentDigest({ ...base }));
  assert.notEqual(computeAmendmentDigest(base), computeAmendmentDigest({ ...base, instructionDigest: 'i2' }));
  assert.notEqual(computeAmendmentDigest(base), computeAmendmentDigest({ ...base, changes: [{ id: 'CH2', package: 'pkg-a' }] }));
});

test('C012: the ledger is append-only and never duplicates a digest', () => {
  const packageDir = makePackage();
  try {
    const digest = computeAmendmentDigest({
      materialDigests: ['m1'], instructionDigest: 'i1', changes: [], targetDigests: [],
    });
    writeAmendmentRecord({ packageDir, digest, ticketKey: 'PX-1', packages: ['pkg-a'] });
    writeAmendmentRecord({ packageDir, digest, ticketKey: 'PX-1', packages: ['pkg-a'] });
    assert.equal(readAmendLedger({ packageDir }).length, 1);
    const ledgerPath = path.join(packageDir, 'amend', 'AMENDMENT.json');
    assert.equal(fs.readFileSync(ledgerPath, 'utf8').includes(digest), true);
  } finally {
    cleanup(packageDir);
  }
});

// @verifies C012
test('C012: the idempotency CLI decides replay from the ledger', () => {
  const packageDir = makePackage();
  const changesPath = path.join(packageDir, 'changes.json');
  try {
    fs.writeFileSync(changesPath, JSON.stringify([{ id: 'CH1', package: 'pkg-a' }]));
    const first = spawnSync(process.execPath, [
      path.resolve(__dirname, '../../.claude/scripts/amend-rfc-up/idempotency.js'),
      'decide',
      `--package=${packageDir}`,
      '--material-digest=m1',
      '--instruction-digest=i1',
      `--changes=@${changesPath}`,
    ], { encoding: 'utf8' });
    assert.equal(first.status, 0, first.stderr);
    const decision = JSON.parse(first.stdout);
    assert.equal(decision.mode, 'apply');
    writeAmendmentRecord({ packageDir, digest: decision.digest, ticketKey: 'PX-1', packages: ['pkg-a'] });

    const second = spawnSync(process.execPath, [
      path.resolve(__dirname, '../../.claude/scripts/amend-rfc-up/idempotency.js'),
      'decide',
      `--package=${packageDir}`,
      '--material-digest=m1',
      '--instruction-digest=i1',
      `--changes=@${changesPath}`,
    ], { encoding: 'utf8' });
    assert.equal(JSON.parse(second.stdout).mode, 'no-change');
  } finally {
    cleanup(packageDir);
  }
});
