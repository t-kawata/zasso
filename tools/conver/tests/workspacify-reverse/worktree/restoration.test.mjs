// @verifies C002
/**
 * Restoration: what the main tree is guaranteed to be left as, on every path.
 *
 * The success path is the easy one. The failures that matter are the ones where
 * the reconstruction throws partway, where the worktree cannot be destroyed,
 * and where the Red turns out not to be observable at all — each of those can
 * leave the isolation in a state nobody chose, and a silent one means nobody
 * knows. A failure to destroy is therefore raised rather than returned, and the
 * scratch directory is deliberately left on disk in that case: removing it
 * would destroy the evidence a human needs.
 *
 * The failure is produced with a real `git worktree lock`, so nothing about git
 * is simulated and no stub stands in for the operation under test. A single
 * `--force` refuses a locked worktree; that refusal is exactly what a
 * restoration failure looks like in production.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  RESTORATION_OUTCOMES,
  WORKTREE_REASONS,
  WorktreeIsolationError,
  withIsolatedWorktree,
} from '../../../.claude/scripts/workspacify-reverse/lib/worktree-isolation.mjs';
import {
  PASS_STATUSES,
  RED_REASONS,
  RED_VERDICTS,
  RedReconstructionError,
  executeReconstructionTicket,
  recordRedEvidence,
  renderReconstructionReport,
  runReconstructionPass,
} from '../../../.claude/scripts/conver/red-reconstruction.js';
import { createGitBackedTree, hashTree, runGit } from '../helpers/scratch.mjs';

const FIXTURE_FILES = Object.freeze({
  'Cargo.toml': '[package]\nname = "worktree-fixture"\n',
  'src/packet.rs': 'pub fn parse() -> bool {\n    true\n}\n',
});

const RECONSTRUCTION_TICKET = Object.freeze({
  id: 19,
  phaseId: 22,
  title: 'Reconstruct the Red for parse in src/packet.rs',
  counterexample_plan_id: 'cxp-packet-mutation-42',
  counterexample_plan_basis: 'mutation',
});

// [::TICKET::] P22-19 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-19 --for-spec --no-implementation-order`.
function ticketFixture() {
  return { ...RECONSTRUCTION_TICKET };
}

// [::TICKET::] P22-19, P23-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P22-19|P23-5) --for-spec --no-implementation-order`.
function createFixture() {
  const tree = createGitBackedTree({ ...FIXTURE_FILES });
  const guardedPath = mkdtempSync(join(tmpdir(), 'wsp-guard-'));
  writeFileSync(join(guardedPath, 'guarded.rs'), 'pub fn parse() -> bool {\n    true\n}\n');
  return {
    root: tree.root,
    guardedPath,
    expectedHash: hashTree(guardedPath),
// [::TICKET::] P22-19 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-19 --for-spec --no-implementation-order`.
    dispose() {
      tree.dispose();
      rmSync(guardedPath, { recursive: true, force: true });
    },
  };
}

// [::TICKET::] P22-19 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-19 --for-spec --no-implementation-order`.
async function withFixture(body) {
  const fixture = createFixture();
  try {
    return await body(fixture);
  } finally {
    fixture.dispose();
  }
}

// [::TICKET::] P22-19 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-19 --for-spec --no-implementation-order`.
async function captureRejection(promise) {
  try {
    await promise;
    return null;
  } catch (error) {
    return error;
  }
}

/** The main working tree is the only one git should still know about. */
// [::TICKET::] P22-19 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-19 --for-spec --no-implementation-order`.
function registeredWorktreeCount(root) {
  return runGit(root, ['worktree', 'list', '--porcelain'])
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .length;
}

/** Release a worktree the module deliberately left locked and registered. */
// [::TICKET::] P22-19 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-19 --for-spec --no-implementation-order`.
function releaseLeftover(error) {
  const worktreePath = error?.outcome?.worktreePath ?? null;
  const scratchBase = error?.outcome?.scratchBase ?? null;
  if (worktreePath === null) return;
  try {
    runGit(error.outcome.root, ['worktree', 'unlock', worktreePath]);
  } catch {
    // The lock is what we are releasing; if it is already gone there is nothing to do.
  }
  try {
    runGit(error.outcome.root, ['worktree', 'remove', '--force', worktreePath]);
  } catch {
    // A leftover directory is removed below regardless.
  }
  if (scratchBase !== null) rmSync(scratchBase, { recursive: true, force: true });
}

test('the worktree is destroyed with certainty on completion', async () => {
  await withFixture(async ({ root, guardedPath }) => {
    const record = await withIsolatedWorktree(root, async () => ({ redProved: true }), {
      guardedPaths: [guardedPath],
    });

    assert.deepEqual(RESTORATION_OUTCOMES, ['destroyed', 'failed']);
    assert.equal(record.restorationOutcome, 'destroyed');
    assert.equal(existsSync(record.worktreePath), false);
    assert.equal(existsSync(record.scratchBase), false);
    assert.equal(registeredWorktreeCount(root), 1, 'only the main working tree may remain registered');
  });
});

test('a worktree is destroyed even when the enclosed function throws partway', async () => {
  await withFixture(async ({ root, guardedPath, expectedHash }) => {
    let worktreePath = null;

    const error = await captureRejection(
      withIsolatedWorktree(
        root,
        async (path) => {
          worktreePath = path;
          throw new Error('the reconstruction failed partway');
        },
        { guardedPaths: [guardedPath] },
      ),
    );

    assert.ok(error instanceof WorktreeIsolationError);
    assert.equal(error.reason, 'execution-failed');
    assert.equal(error.cause?.message, 'the reconstruction failed partway');
    assert.equal(error.outcome.restorationOutcome, 'destroyed');
    assert.equal(error.outcome.mainTreeDigest.unchanged, true);
    assert.equal(existsSync(worktreePath), false);
    assert.equal(registeredWorktreeCount(root), 1);
    assert.deepEqual(hashTree(guardedPath), expectedHash);
  });
});

test('a restoration failure is reported, blocking, with the main tree still intact', async () => {
  await withFixture(async ({ root, guardedPath, expectedHash }) => {
    const error = await captureRejection(
      withIsolatedWorktree(
        root,
        async (worktreePath) => {
          // A real lock is a real reason for the tree to stay, and a single
          // `--force` must not override it.
          runGit(root, ['worktree', 'lock', worktreePath]);
          return { redProved: true };
        },
        { guardedPaths: [guardedPath] },
      ),
    );

    try {
      assert.ok(error instanceof WorktreeIsolationError);
      assert.equal(error.reason, 'restoration-failed');
      assert.equal(error.outcome.restorationOutcome, 'failed');
      assert.equal(error.outcome.mainTreeDigest.unchanged, true);
      assert.notEqual(error.outcome.worktreePath, null);
      assert.match(error.message, /could not be destroyed/i);
      // Only the certainty was lost; the guarded paths never moved.
      assert.deepEqual(hashTree(guardedPath), expectedHash);
    } finally {
      releaseLeftover(error);
    }
  });
});

test('a restoration failure leads even when the execution also threw, and the cause is preserved', async () => {
  await withFixture(async ({ root, guardedPath }) => {
    const error = await captureRejection(
      withIsolatedWorktree(
        root,
        async (worktreePath) => {
          runGit(root, ['worktree', 'lock', worktreePath]);
          throw new Error('the reconstruction failed partway');
        },
        { guardedPaths: [guardedPath] },
      ),
    );

    try {
      assert.equal(error.reason, 'restoration-failed');
      assert.equal(error.cause?.message, 'the reconstruction failed partway');
      assert.equal(error.outcome.restorationOutcome, 'failed');
    } finally {
      releaseLeftover(error);
    }
  });
});

test('a Red that cannot be observed is recorded as not proved, never as success', async () => {
  await withFixture(async ({ root, guardedPath }) => {
    assert.deepEqual(RED_VERDICTS, ['proved', 'not-proved']);

    const record = await executeReconstructionTicket(ticketFixture(), {
      root,
      guardedPaths: [guardedPath],
      execute: async () => ({ redProved: false, observations: ['the suite stayed green'] }),
    });

    assert.equal(record.redObserved, false);
    assert.equal(record.verdict, 'not-proved');

    const stamped = recordRedEvidence(ticketFixture(), record);
    assert.equal(stamped.redEvidence.verdict, 'not-proved');
    assert.equal(stamped.redEvidence.red_observed, false);

    const pass = await runReconstructionPass({
      tickets: [ticketFixture()],
      root,
      guardedPaths: [guardedPath],
      execute: async () => ({ redProved: false }),
    });

    assert.equal(pass.status, 'executed');
    assert.equal(pass.verdict, 'not-proved', 'a pass in which no Red was observed is not a success');
  });
});

test('an execution result that does not say whether Red was proved is refused', async () => {
  await withFixture(async ({ root, guardedPath }) => {
    const silent = await captureRejection(
      executeReconstructionTicket(ticketFixture(), {
        root,
        guardedPaths: [guardedPath],
        execute: async () => ({ observations: ['something happened'] }),
      }),
    );

    assert.ok(silent instanceof RedReconstructionError);
    assert.ok(RED_REASONS.includes(silent.reason));
    assert.equal(silent.reason, 'invalid-execution-result');

    const absent = await captureRejection(
      executeReconstructionTicket(ticketFixture(), {
        root,
        guardedPaths: [guardedPath],
        execute: async () => undefined,
      }),
    );

    assert.equal(absent?.reason, 'invalid-execution-result');
  });
});

test('a refusal is still a refusal when the value it refuses cannot be serialised', async () => {
  await withFixture(async ({ root, guardedPath }) => {
    // A circular value is the case that breaks the obvious implementation:
    // building the message with JSON.stringify throws, so the check would fail
    // in the act of reporting that it failed and the caller would see a
    // TypeError with no `reason` to branch on.
    const circular = { observations: ['something happened'] };
    circular.self = circular;

    const error = await captureRejection(
      executeReconstructionTicket(ticketFixture(), {
        root,
        guardedPaths: [guardedPath],
        execute: async () => circular,
      }),
    );

    assert.ok(error instanceof RedReconstructionError, `expected a refusal, got ${error?.name}: ${error?.message}`);
    assert.equal(error.reason, 'invalid-execution-result');
    // The message names what was actually wrong — the missing field.
    assert.match(error.message, /observations/);
    assert.doesNotMatch(error.message, /circular/i);
  });
});

test('an execution that throws something other than an Error is still named', async () => {
  await withFixture(async ({ root, guardedPath }) => {
    // `throw` is not restricted to Error, and only an Error has a `message`.
    const error = await captureRejection(
      withIsolatedWorktree(
        root,
        async () => {
          throw 'a bare string reason';
        },
        { guardedPaths: [guardedPath] },
      ),
    );

    assert.ok(error instanceof WorktreeIsolationError);
    assert.equal(error.reason, 'execution-failed');
    assert.match(error.message, /a bare string reason/);
    assert.doesNotMatch(error.message, /undefined/);
    // The original value survives at the end of the cause chain, not lost to
    // the wrapper that gave it a message.
    assert.equal(error.cause?.cause, 'a bare string reason');
    assert.equal(error.outcome.restorationOutcome, 'destroyed', 'the worktree is still destroyed');
  });
});

test('zero reconstruction tickets produce an explicit result rather than a vacuous success', async () => {
  const pass = await runReconstructionPass({
    tickets: [],
    execute: async () => {
      throw new Error('nothing may be executed when no reconstruction ticket was selected');
    },
  });

  assert.deepEqual(PASS_STATUSES, ['executed', 'nothing-to-execute']);
  assert.equal(pass.status, 'nothing-to-execute');
  assert.equal(pass.verdict, 'not-proved');
  assert.equal(pass.reason, 'no-reconstruction-tickets');
  assert.deepEqual(pass.executed, []);
  assert.match(renderReconstructionReport(pass), /nothing to reconstruct/i);
});

test('a single ticket executes correctly and its evidence is stamped onto a copy', async () => {
  await withFixture(async ({ root, guardedPath }) => {
    const ticket = ticketFixture();

    const pass = await runReconstructionPass({
      tickets: [ticket],
      root,
      guardedPaths: [guardedPath],
      execute: async () => ({ redProved: true, observations: ['the guard was removed and the suite failed'] }),
    });

    assert.equal(pass.status, 'executed');
    assert.equal(pass.verdict, 'proved');
    assert.equal(pass.executed.length, 1);
    assert.equal(pass.executed[0].ticketKey, 'P22-19');
    assert.equal(pass.executed[0].redObserved, true);

    const stamped = recordRedEvidence(ticket, pass.executed[0]);
    assert.equal(stamped.redEvidence.verdict, 'proved');
    assert.equal(stamped.redEvidence.counterexample_plan_id, 'cxp-packet-mutation-42');
    assert.equal(stamped.redEvidence.restoration_outcome, 'destroyed');
    assert.equal(stamped.redEvidence.main_tree_unchanged, true);
    assert.deepEqual(stamped.redEvidence.observations, ['the guard was removed and the suite failed']);
    assert.equal(ticket.redEvidence, undefined, 'the original ticket is never mutated');
    assert.match(renderReconstructionReport(pass), /Red proved/);
  });
});

test('executing a ticket with no plan identifier is refused before anything is created', async () => {
  const error = await captureRejection(
    executeReconstructionTicket(
      { id: 20, phaseId: 22, title: 'An ordinary ticket' },
      {
        root: '/no-such-root-exists',
        execute: async () => {
          throw new Error('no worktree may be made for a ticket that is not a reconstruction ticket');
        },
      },
    ),
  );

  assert.equal(error?.reason, 'plan-id-missing');
});
