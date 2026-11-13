'use strict';

/**
 * PX-418 — dispatch: rfc transaction, derived owners, rollback, owner order.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  dispatchArtifactChange,
  recordOwnerReceipt,
  runOwnerRederive,
} = require('../../.claude/scripts/amend-rfc-up/dispatch.js');
const {
  GRAPH_CHANGE,
  RFC_CHANGE,
  appendRunner,
  cleanup,
  failingGate,
  makeFixturePackage,
} = require('./helpers.cjs');

// @verifies C008
test('C008: dispatch routes rfc and graph to their owners', async () => {
  const fixture = makeFixturePackage();
  try {
    const calls = [];
    const rfc = await dispatchArtifactChange({
      change: RFC_CHANGE,
      packageDir: fixture,
      ticketKey: 'PX-418',
      runner: async ({ args }) => { calls.push(args); return { outcome: 'promoted' }; },
    });
    assert.equal(rfc.outcome, 'promoted');
    assert.equal(calls[0].includes('--ticket-key=PX-418'), true);
    assert.equal(calls[0].includes('--artifact=rfc'), true);
    assert.equal(calls[0].some((argument) => argument === '--ticket-key'), false);
    const graph = await dispatchArtifactChange({
      change: GRAPH_CHANGE,
      packageDir: fixture,
      ticketKey: 'PX-418',
      ownerRunner: (owner) => { calls.push(owner); return { ok: true }; },
    });
    assert.equal(graph.ok, true);
    assert.equal(calls.includes('graphify'), true);
  } finally {
    cleanup(fixture);
  }
});

// @verifies C009
test('C009: existing RFC lines are never edited and rollback restores bytes', async () => {
  const fixture = makeFixturePackage();
  try {
    const rfcPath = path.join(fixture, 'RFC.md');
    const before = fs.readFileSync(rfcPath);
    await dispatchArtifactChange({
      change: RFC_CHANGE,
      packageDir: fixture,
      ticketKey: 'PX-418',
      runner: appendRunner(),
    });
    const after = fs.readFileSync(rfcPath);
    assert.ok(after.subarray(0, before.length).equals(before));
    const rolled = await dispatchArtifactChange({
      change: RFC_CHANGE,
      packageDir: fixture,
      ticketKey: 'PX-418',
      gateRunner: failingGate,
    });
    assert.equal(rolled.outcome, 'rolled-back');
    assert.ok(fs.readFileSync(rfcPath).equals(before));
  } finally {
    cleanup(fixture);
  }
});

// @verifies C010
test('C010: owners invoked in order and receipts recorded', async () => {
  const fixture = makeFixturePackage();
  try {
    const calls = [];
    const result = await runOwnerRederive({
      packageDir: fixture,
      invokeOwner: (owner) => { calls.push(owner); return { ok: true }; },
    });
    assert.deepEqual(calls, ['graphify', 'boundify', 'split']);
    assert.equal(result.receipts.length, 3);
    await assert.rejects(
      () => runOwnerRederive({
        packageDir: fixture,
        invokeOwner: (owner) => (owner === 'boundify' ? { ok: false } : { ok: true }),
      }),
      (error) => error.code === 'REDERIVE_PENDING',
    );
  } finally {
    cleanup(fixture);
  }
});

test('recordOwnerReceipt appends immutably', () => {
  const report = { rederive: [] };
  const next = recordOwnerReceipt({ report, owner: 'graphify', result: { ok: true } });
  assert.equal(next.rederive.length, 1);
  assert.equal(report.rederive.length, 0);
});

// @verifies C010
test('C010: rederive validates full receipts against the current artifact', async () => {
  const fixture = makeFixturePackage();
  try {
    const graphPath = path.join(fixture, 'RFC-GRAPH.json');
    const { snapshotOwnerArtifacts } = require('../../.claude/scripts/amend-rfc-up/owners.js');
    const before = snapshotOwnerArtifacts({ packageDir: fixture, owner: 'graphify' });
    fs.writeFileSync(graphPath, JSON.stringify({ nodes: [{ id: 'N1' }] }) + '\n');
    fs.writeFileSync(path.join(fixture, 'RFC-GRAPHIFY-Status.json'), JSON.stringify({
      steps: { 0: 'done' }, runs: 2, lastOutputDigest: 'after',
    }) + '\n');
    const after = snapshotOwnerArtifacts({ packageDir: fixture, owner: 'graphify' });
    const receipt = {
      owner: 'graphify', beforeDigest: before.digest, afterDigest: after.digest,
      statusFile: 'RFC-GRAPHIFY-Status.json', exit: 0,
    };
    const result = await runOwnerRederive({
      packageDir: fixture,
      invokeOwner: (owner) => (owner === 'graphify' ? receipt : { ok: true }),
    });
    assert.equal(result.receipts.length, 3);

    fs.writeFileSync(graphPath, JSON.stringify({ nodes: [{ id: 'N2' }] }) + '\n');
    await assert.rejects(
      () => runOwnerRederive({
        packageDir: fixture,
        invokeOwner: (owner) => (owner === 'graphify' ? receipt : { ok: true }),
      }),
      (error) => error.code === 'REDERIVE_PENDING',
    );
  } finally {
    cleanup(fixture);
  }
});

// @verifies C009
test('C009: a derived dry-run returns an owner plan and writes nothing', async () => {
  const fixture = makeFixturePackage();
  try {
    const graphPath = path.join(fixture, 'RFC-GRAPH.json');
    const before = fs.readFileSync(graphPath);
    const plan = await dispatchArtifactChange({
      change: GRAPH_CHANGE,
      packageDir: fixture,
      ticketKey: 'PX-419',
      mode: 'dry-run',
    });
    assert.equal(plan.mode, 'owner');
    assert.equal(plan.owner, 'graphify');
    assert.match(plan.beforeDigest, /^[0-9a-f]{64}$/);
    assert.equal(plan.expectedArtifacts.includes('RFC-GRAPH.json'), true);
    assert.equal(plan.code, undefined);
    assert.ok(fs.readFileSync(graphPath).equals(before));
  } finally {
    cleanup(fixture);
  }
});

// @verifies C010
test('C010: derived apply requires a verified receipt', async () => {
  const fixture = makeFixturePackage();
  try {
    const missing = await dispatchArtifactChange({
      change: GRAPH_CHANGE,
      packageDir: fixture,
      ticketKey: 'PX-419',
      mode: 'apply',
    });
    assert.equal(missing.ok, false);
    assert.equal(missing.code, 'OWNER_RECEIPT_REQUIRED');
  } finally {
    cleanup(fixture);
  }
});

// @verifies C009
test('C009: the dispatch CLI returns an owner plan for a graph change', () => {
  const fixture = makeFixturePackage();
  const changePath = path.join(fixture, 'change.json');
  try {
    fs.writeFileSync(changePath, JSON.stringify(GRAPH_CHANGE));
    const result = spawnSync(process.execPath, [
      path.resolve(__dirname, '../../.claude/scripts/amend-rfc-up/dispatch.js'),
      'dry-run',
      `--package=${fixture}`,
      '--ticket-key=PX-419',
      `--change=@${changePath}`,
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const plan = JSON.parse(result.stdout);
    assert.equal(plan.mode, 'owner');
    assert.equal(plan.owner, 'graphify');
    assert.notEqual(plan.code, 'OWNER_REQUIRED');
  } finally {
    cleanup(fixture);
  }
});
