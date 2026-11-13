'use strict';

/**
 * PX-419 — owner artifact snapshots and receipt verification.
 */

const { test } = require('node:test');
// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  buildOwnerPlan,
  snapshotOwnerArtifacts,
  validateOwnerReceipt,
} = require('../../.claude/scripts/amend-rfc-up/owners.js');
const { cleanup } = require('./helpers.cjs');

function makePackage() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'px419-owners-'));
  fs.writeFileSync(path.join(directory, 'RFC-GRAPH.json'), JSON.stringify({ nodes: [], edges: [] }) + '\n');
  fs.writeFileSync(path.join(directory, 'RFC-GRAPHIFY-Status.json'), JSON.stringify({
    steps: { 0: 'done' }, runs: 1, lastOutputDigest: 'before',
  }) + '\n');
  return directory;
}

function receiptFor({ packageDir, beforeDigest }) {
  return {
    owner: 'graphify',
    beforeDigest,
    afterDigest: snapshotOwnerArtifacts({ packageDir, owner: 'graphify' }).digest,
    statusFile: 'RFC-GRAPHIFY-Status.json',
    exit: 0,
  };
}

test('C009: an owner plan carries the before digest and expected artifacts', () => {
  const packageDir = makePackage();
  try {
    const plan = buildOwnerPlan({ packageDir, owner: 'graphify' });
    assert.equal(plan.mode, 'owner');
    assert.equal(plan.owner, 'graphify');
    assert.match(plan.beforeDigest, /^[0-9a-f]{64}$/);
    assert.equal(plan.expectedArtifacts.includes('RFC-GRAPH.json'), true);
    assert.equal(plan.command, '/graphify-rfc');
  } finally {
    cleanup(packageDir);
  }
});

test('C010: a changed artifact with a successful status is accepted', () => {
  const packageDir = makePackage();
  try {
    const before = snapshotOwnerArtifacts({ packageDir, owner: 'graphify' });
    fs.writeFileSync(path.join(packageDir, 'RFC-GRAPH.json'), JSON.stringify({ nodes: [{ id: 'N1' }] }) + '\n');
    fs.writeFileSync(path.join(packageDir, 'RFC-GRAPHIFY-Status.json'), JSON.stringify({
      steps: { 0: 'done' }, runs: 2, lastOutputDigest: 'after',
    }) + '\n');
    const receipt = receiptFor({ packageDir, beforeDigest: before.digest });
    assert.deepEqual(validateOwnerReceipt({ packageDir, owner: 'graphify', receipt }), { ok: true });
  } finally {
    cleanup(packageDir);
  }
});

test('C010: an unchanged artifact is OWNER_NO_DELTA', () => {
  const packageDir = makePackage();
  try {
    const before = snapshotOwnerArtifacts({ packageDir, owner: 'graphify' });
    const receipt = {
      owner: 'graphify', beforeDigest: before.digest, afterDigest: before.digest,
      statusFile: 'RFC-GRAPHIFY-Status.json', exit: 0,
    };
    assert.throws(
      () => validateOwnerReceipt({ packageDir, owner: 'graphify', receipt }),
      (error) => error.code === 'OWNER_NO_DELTA',
    );
  } finally {
    cleanup(packageDir);
  }
});

test('C010: a downstream owner may legitimately report no delta', () => {
  const packageDir = makePackage();
  try {
    const before = snapshotOwnerArtifacts({ packageDir, owner: 'graphify' });
    const receipt = {
      owner: 'graphify', beforeDigest: before.digest, afterDigest: before.digest,
      statusFile: 'RFC-GRAPHIFY-Status.json', exit: 0,
    };
    assert.deepEqual(
      validateOwnerReceipt({ packageDir, owner: 'graphify', receipt, requireDelta: false }),
      { ok: true },
    );
  } finally {
    cleanup(packageDir);
  }
});

test('C010: a digest mismatch, non-zero exit, or failed status is OWNER_RECEIPT_INVALID', () => {
  const packageDir = makePackage();
  try {
    const before = snapshotOwnerArtifacts({ packageDir, owner: 'graphify' });
    fs.writeFileSync(path.join(packageDir, 'RFC-GRAPH.json'), JSON.stringify({ nodes: [{ id: 'N1' }] }) + '\n');
    assert.throws(
      () => validateOwnerReceipt({
        packageDir, owner: 'graphify',
        receipt: { owner: 'graphify', beforeDigest: before.digest, afterDigest: '0'.repeat(64), statusFile: 'RFC-GRAPHIFY-Status.json', exit: 0 },
      }),
      (error) => error.code === 'OWNER_RECEIPT_INVALID',
    );
    const after = snapshotOwnerArtifacts({ packageDir, owner: 'graphify' }).digest;
    fs.writeFileSync(path.join(packageDir, 'RFC-GRAPHIFY-Status.json'), JSON.stringify({
      steps: { 0: 'done' }, runs: 2, lastOutputDigest: 'after',
    }) + '\n');
    assert.throws(
      () => validateOwnerReceipt({
        packageDir, owner: 'graphify',
        receipt: { owner: 'graphify', beforeDigest: before.digest, afterDigest: after, statusFile: 'RFC-GRAPHIFY-Status.json', exit: 1 },
      }),
      (error) => error.code === 'OWNER_RECEIPT_INVALID',
    );
    fs.writeFileSync(path.join(packageDir, 'RFC-GRAPHIFY-Status.json'), JSON.stringify({
      steps: { 0: 'running' }, runs: 2, lastOutputDigest: 'after',
    }) + '\n');
    assert.throws(
      () => validateOwnerReceipt({
        packageDir, owner: 'graphify',
        receipt: { owner: 'graphify', beforeDigest: before.digest, afterDigest: after, statusFile: 'RFC-GRAPHIFY-Status.json', exit: 0 },
      }),
      (error) => error.code === 'OWNER_RECEIPT_INVALID',
    );
  } finally {
    cleanup(packageDir);
  }
});
