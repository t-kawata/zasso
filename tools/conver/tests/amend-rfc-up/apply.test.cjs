'use strict';

/**
 * PX-417 — apply: dry-run gate, amendment promotion, rollback, owner order.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { appendAmendment } = require('../../.claude/scripts/tickets/append-design-amendment.js');
const {
  assertInternalGate,
  runApply,
  runDryRun,
  runOwnerRederive,
} = require('../../.claude/scripts/amend-rfc-up/apply.js');
const { cleanup, failingGate, makeFixturePackage, VALID_CLAIM } = require('./helpers.cjs');

function promotedRunner() {
  return async ({ claim, ticketKey, packageDir }) => {
    const rfcPath = path.join(packageDir, 'RFC.md');
    const appended = appendAmendment({
      filePath: rfcPath,
      ticketKey,
      title: claim.title,
      body: claim.text,
    });
    assert.equal(appended.ok, true);
    const ledgerPath = path.join(packageDir, 'amendments', `${ticketKey}-1.json`);
    fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
    fs.writeFileSync(ledgerPath, JSON.stringify({ ticketKey, artifact: 'rfc' }) + '\n');
    return { outcome: 'promoted', ledgerPath, writes: [{ path: rfcPath }] };
  };
}

// @verifies C003
test('C003: apply writes through the runner and records a ledger', async () => {
  const fixture = makeFixturePackage();
  try {
    const rfcPath = path.join(fixture, 'RFC.md');
    const before = fs.readFileSync(rfcPath);
    const result = await runApply({
      claim: VALID_CLAIM,
      ticketKey: 'PX-417',
      packageDir: fixture,
      runner: promotedRunner(),
    });
    assert.equal(result.outcome, 'promoted');
    assert.ok(fs.readFileSync(rfcPath).subarray(0, before.length).equals(before));
    assert.ok(fs.existsSync(result.ledgerPath));
  } finally {
    cleanup(fixture);
  }
});

// @verifies C004
test('C004: dry-run returns wouldPromote and a finding blocks apply', async () => {
  const fixture = makeFixturePackage();
  try {
    const dry = await runDryRun({
      claim: VALID_CLAIM,
      ticketKey: 'PX-417',
      packageDir: fixture,
      runner: async () => ({ outcome: 'dry-run', wouldPromote: true, findings: [], unverifiable: [] }),
    });
    assert.equal(dry.outcome, 'dry-run');
    assert.equal(dry.wouldPromote, true);
    const blocked = assertInternalGate({ dryRun: { findings: [{ code: 'GATE_FINDING' }] } });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, 'GATE_FINDING');
  } finally {
    cleanup(fixture);
  }
});

// @verifies C005
test('C005: rolled-back amendment restores bytes and leaves no ledger', async () => {
  const fixture = makeFixturePackage();
  try {
    const rfcPath = path.join(fixture, 'RFC.md');
    const before = fs.readFileSync(rfcPath);
    const result = await runApply({
      claim: VALID_CLAIM,
      ticketKey: 'PX-417',
      packageDir: fixture,
      gateRunner: failingGate,
    });
    assert.equal(result.outcome, 'rolled-back');
    assert.ok(fs.readFileSync(rfcPath).equals(before));
    assert.equal(fs.existsSync(path.join(fixture, 'amendments')), false);
  } finally {
    cleanup(fixture);
  }
});

// @verifies C006
test('C006: pre-existing bytes are a prefix and the amendment heading is appended', async () => {
  const fixture = makeFixturePackage();
  try {
    const rfcPath = path.join(fixture, 'RFC.md');
    const before = fs.readFileSync(rfcPath);
    await runApply({
      claim: VALID_CLAIM,
      ticketKey: 'PX-417',
      packageDir: fixture,
      runner: promotedRunner(),
    });
    const after = fs.readFileSync(rfcPath);
    assert.ok(after.subarray(0, before.length).equals(before));
    assert.match(after.toString(), /## Design Amendments/);
    assert.match(after.toString(), /### Amendment PX-417-1/);
  } finally {
    cleanup(fixture);
  }
});

// @verifies C007
test('C007: owners invoked in order and receipts recorded', async () => {
  const fixture = makeFixturePackage();
  try {
    const calls = [];
    const result = await runOwnerRederive({
      packageDir: fixture,
      invokeOwner: (name) => { calls.push(name); return { ok: true }; },
    });
    assert.deepEqual(calls, ['graphify', 'boundify', 'split']);
    assert.equal(result.receipts.length, 3);
  } finally {
    cleanup(fixture);
  }
});

test('owner failure is REDERIVE_PENDING and never COMPLETE', async () => {
  const fixture = makeFixturePackage();
  try {
    await assert.rejects(
      () => runOwnerRederive({
        packageDir: fixture,
        invokeOwner: (name) => (name === 'boundify' ? { ok: false, code: 'OWNER_FAILED' } : { ok: true }),
      }),
      (error) => error.code === 'REDERIVE_PENDING',
    );
  } finally {
    cleanup(fixture);
  }
});

test('identical claim is noChange at the runner boundary', async () => {
  const fixture = makeFixturePackage();
  try {
    const result = await runApply({
      claim: VALID_CLAIM,
      ticketKey: 'PX-417',
      packageDir: fixture,
      runner: async () => ({ outcome: 'promoted', noChange: true, ledgerPath: null, writes: [] }),
    });
    assert.equal(result.noChange, true);
  } finally {
    cleanup(fixture);
  }
});
