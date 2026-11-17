'use strict';

// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
/**
 * PX-437 C005 — deterministic self-repair ladder.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { runRepairLadder } = require('../../.claude/scripts/tickets/lib/repair-ladder.js');
const { acquirePackageLock, releasePackageLock } = require('../../.claude/scripts/tickets/lib/package-lock.js');

const BLOCKER = { kind: 'missing-adapter', artifact: 'TEST-INDEX.json', error: 'ENOENT' };

/** An IO seam that succeeds at the first ladder step. */
// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
function ioOf(overrides = {}) {
  return {
    readState: () => null,
    writeState: () => {},
    synthesizeAdapter: () => ({ ok: true }),
    rediscoverConfig: () => ({ ok: true }),
    synthesizeRunner: () => ({ ok: true }),
    repairArtifact: () => ({ ok: true }),
    repairClause: () => ({ ok: true }),
    createRepairTicket: () => ({ ok: true, ticketKey: 'R-1' }),
    createDiagnosticTicket: () => ({ ok: true, ticketKey: 'D-1' }),
    ...overrides,
  };
}

test('C005: the repair key is a stable hash of kind, artifact and normalized error', () => {
  const first = runRepairLadder({ blocker: BLOCKER, io: ioOf() });
  const second = runRepairLadder({ blocker: { ...BLOCKER, error: 'ENOENT ' }, io: ioOf() });

  assert.match(first.repairKey, /^sha256:[0-9a-f]{64}$/);
  assert.equal(first.repairKey, second.repairKey);
});

test('C005: a synthesizable adapter completes automatically', () => {
  const result = runRepairLadder({ blocker: BLOCKER, io: ioOf() });

  assert.equal(result.status, 'completed');
  assert.equal(result.action, 'synthesize-adapter');
});

test('C005: a repeated completed repair is reused, not performed twice', () => {
  const first = runRepairLadder({ blocker: BLOCKER, io: ioOf() });
  const second = runRepairLadder({ blocker: BLOCKER, io: ioOf(), previous: first });

  assert.equal(second.reused, true);
  assert.equal(second.status, 'completed');
});

test('C005: two no-progress rounds become an unrepairable diagnostic and the loop continues', () => {
  const previous = { ...runRepairLadder({ blocker: BLOCKER, io: ioOf({ synthesizeAdapter: () => ({ ok: false }), createRepairTicket: () => ({ ok: true, ticketKey: 'R-1' }) }) }), attempts: 2, stateDigest: 'same' };
  const result = runRepairLadder({
    blocker: BLOCKER,
    io: ioOf({ synthesizeAdapter: () => ({ ok: false }), stateDigest: () => 'same' }),
    previous,
  });

  assert.equal(result.status, 'unrepairable');
  assert.equal(result.action, 'diagnostic-ticket');
  assert.equal(result.ticketKey, 'D-1');
});

test('C005: a destructive repair is never automatic; it becomes a repair ticket', () => {
  let synthesized = false;
  const result = runRepairLadder({
    blocker: { ...BLOCKER, requiresDestructive: true },
    io: ioOf({ synthesizeAdapter: () => { synthesized = true; return { ok: true }; } }),
  });

  assert.equal(result.status, 'pending');
  assert.equal(result.action, 'repair-ticket');
  assert.equal(result.ticketKey, 'R-1');
  assert.equal(synthesized, false);
});

test('C005: an unsynthesizable runner becomes a repair ticket, never a stop', () => {
  const result = runRepairLadder({
    blocker: { kind: 'missing-runner', artifact: 'runner', error: 'ENOENT' },
    io: ioOf({ synthesizeRunner: () => ({ ok: false }) }),
  });

  assert.equal(result.status, 'pending');
  assert.equal(result.action, 'repair-ticket');
  assert.equal(result.ticketKey, 'R-1');
});

test('C005: the per-package lock serializes and recovers a stale lock with evidence', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'px437-lock-'));
  try {
    const first = acquirePackageLock({ cwd, now: 1000, staleMs: 100 });
    assert.equal(first.acquired, true);
    const second = acquirePackageLock({ cwd, now: 1050, staleMs: 100 });
    assert.equal(second.acquired, false);
    assert.equal(second.stale, false);

    releasePackageLock({ cwd });
    const stale = acquirePackageLock({ cwd, now: 2000, staleMs: 100 });
    assert.equal(stale.acquired, true);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
