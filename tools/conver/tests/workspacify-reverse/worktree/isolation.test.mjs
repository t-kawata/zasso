// @verifies C001
/**
 * Worktree isolation: where a Red reconstruction is allowed to run, and what it
 * is allowed to leave behind.
 *
 * Confirming a Red means breaking an implementation on purpose. Doing that in
 * the working tree would damage the very artefact the reverse rotation is
 * analysing, so the breakage has to happen somewhere disposable.
 *
 * Two failures are held apart here. The first is reaching the main tree: a
 * worktree that was never made, or a path that quietly resolved back to the
 * root, would put the reconstruction exactly where it must not be. So the
 * function handed to the isolation is watched directly — it must never receive
 * the main root, and it must never run at all when no worktree exists — and the
 * guarded paths are re-measured by an independent walker (`hashTree`), never by
 * the module under test. The second is the shape of the result: a run that
 * reports "not proved" when it means "I never looked" would convert an absence
 * of evidence into evidence, which is why the execution result is a stated
 * verdict rather than a missing one.
 *
 * What happens when the worktree cannot be destroyed is C002's subject and
 * lives in the sibling suite.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  RESTORATION_OUTCOMES,
  WORKTREE_REASONS,
  WorktreeIsolationError,
  assertMainTreeUnchanged,
  digestMainTree,
  withIsolatedWorktree,
} from '../../../.claude/scripts/workspacify-reverse/lib/worktree-isolation.mjs';
import {
  RedReconstructionError,
  assertReconstructionTicket,
  executeReconstructionTicket,
  isReconstructionTicket,
  selectReconstructionTickets,
} from '../../../.claude/scripts/conver/red-reconstruction.js';
import {
  createGitBackedTree,
  createNonRepositoryTree,
  hashTree,
  runGit,
} from '../helpers/scratch.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const REGRESSION_RUNNER = join(PROJECT_ROOT, '.claude', 'scripts', 'workspacify-reverse', 'run.mjs');

const FIXTURE_FILES = Object.freeze({
  'Cargo.toml': '[package]\nname = "worktree-fixture"\n',
  'src/packet.rs': 'pub fn parse() -> bool {\n    true\n}\n',
});

/** The plan identifier is what makes a ticket a reconstruction ticket at all. */
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

/**
 * A git repository to isolate, plus a guarded directory standing in for the
 * guarded paths the isolation must leave alone.
 *
 * `expectedHash` is taken before anything runs, by a walker that shares no code
 * with the module under test.
 */
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

/** Run the body against a fresh fixture, disposing it whatever the body does. */
// [::TICKET::] P22-19 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-19 --for-spec --no-implementation-order`.
async function withFixture(body) {
  const fixture = createFixture();
  try {
    return await body(fixture);
  } finally {
    fixture.dispose();
  }
}

/** The error a promise rejected with, or null when it resolved. */
// [::TICKET::] P22-19 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-19 --for-spec --no-implementation-order`.
async function captureRejection(promise) {
  try {
    await promise;
    return null;
  } catch (error) {
    return error;
  }
}

test('a Red reconstruction ticket is recognised by its plan identifier and refused without one', () => {
  const ordinary = { id: 20, phaseId: 22, title: 'Add a field to Ticket' };

  assert.equal(isReconstructionTicket(ticketFixture()), true);
  assert.equal(isReconstructionTicket(ordinary), false);
  assert.equal(isReconstructionTicket({ counterexample_plan_id: '   ' }), false, 'a blank plan identifier is not a plan identifier');
  assert.equal(isReconstructionTicket(null), false);

  assert.throws(
    () => assertReconstructionTicket(ordinary),
    (error) => error instanceof RedReconstructionError && error.reason === 'plan-id-missing',
  );

  assert.deepEqual(selectReconstructionTickets([ticketFixture(), ordinary]).map((t) => t.id), [19]);
  assert.deepEqual(selectReconstructionTickets(undefined), [], 'an absent ticket set selects nothing rather than raising');

  // A refusal names the ticket. A missing phase must not be interpolated into a
  // string that reads like a real key, such as `Pundefined-20`.
  assert.throws(
    () => assertReconstructionTicket({ id: 20, counterexample_plan_id: '' }),
    (error) => error.reason === 'plan-id-missing' && !error.message.includes('undefined'),
  );
});

test('a reconstruction ticket executes inside an isolated worktree and its Red evidence is recorded', async () => {
  await withFixture(async ({ root, guardedPath }) => {
    const record = await executeReconstructionTicket(ticketFixture(), {
      root,
      guardedPaths: [guardedPath],
      execute: async ({ worktreePath }) => ({
        redProved: true,
        observations: ['the suite exits 1 once the guard is removed'],
      }),
    });

    assert.equal(record.verdict, 'proved');
    assert.equal(record.redObserved, true);
    assert.equal(record.counterexamplePlanId, 'cxp-packet-mutation-42');
    assert.deepEqual(record.observations, ['the suite exits 1 once the guard is removed']);
    assert.equal(RESTORATION_OUTCOMES.includes(record.restorationOutcome), true);
    assert.equal(record.restorationOutcome, 'destroyed');
    assert.notEqual(record.worktreePath, root);
  });
});

test('the main tree is byte-identical after execution, measured by an independent walker', async () => {
  await withFixture(async ({ root, guardedPath, expectedHash }) => {
    const before = digestMainTree([guardedPath]);

    const record = await withIsolatedWorktree(
      root,
      async (worktreePath) => {
        // Breaking the implementation is exactly what a Red reconstruction does.
        writeFileSync(join(worktreePath, 'src', 'packet.rs'), 'pub fn parse() -> bool {\n    false\n}\n');
        return { redProved: true };
      },
      { guardedPaths: [guardedPath] },
    );

    assert.equal(record.mainTreeDigest.unchanged, true);
    assert.deepEqual(record.mainTreeDigest.changedPaths, []);
    assert.deepEqual(digestMainTree([guardedPath]), before);
    // The module under test is not the instrument that decides this.
    assert.deepEqual(hashTree(guardedPath), expectedHash);
  });
});

test('a change to a guarded path is caught, named and treated as blocking', async () => {
  await withFixture(async ({ root, guardedPath }) => {
    const error = await captureRejection(
      withIsolatedWorktree(
        root,
        async () => {
          writeFileSync(join(guardedPath, 'contaminated.rs'), 'pub fn parse() -> bool {\n    true\n}\n');
          return { redProved: true };
        },
        { guardedPaths: [guardedPath] },
      ),
    );

    assert.ok(error instanceof WorktreeIsolationError);
    // The enumerated list and the reason actually raised must not drift apart.
    assert.ok(WORKTREE_REASONS.includes(error.reason));
    assert.equal(error.reason, 'main-tree-modified');
    assert.equal(error.outcome.mainTreeDigest.unchanged, false);
    assert.deepEqual(error.outcome.mainTreeDigest.changedPaths, [guardedPath]);
    // The worktree is still destroyed even though a guarded path moved.
    assert.equal(error.outcome.restorationOutcome, 'destroyed');
  });
});

test('a worktree that cannot be created is reported and never falls back to the main tree', async () => {
  const tree = createNonRepositoryTree({ ...FIXTURE_FILES });
  const guardedPath = mkdtempSync(join(tmpdir(), 'wsp-guard-'));
  let reached = null;

  try {
    const error = await captureRejection(
      withIsolatedWorktree(
        tree.root,
        async (worktreePath) => {
          reached = worktreePath;
          return { redProved: true };
        },
        { guardedPaths: [guardedPath] },
      ),
    );

    assert.ok(error instanceof WorktreeIsolationError);
    assert.equal(error.reason, 'worktree-creation-failed');
    assert.equal(reached, null, 'the enclosed function must not run when no worktree exists');
    assert.equal(error.outcome.worktreePath, null);
    assert.equal(error.outcome.mainTreeDigest.unchanged, true);
  } finally {
    rmSync(tree.root, { recursive: true, force: true });
    rmSync(guardedPath, { recursive: true, force: true });
  }
});

test('no execution path hands the enclosed function the main tree', async () => {
  await withFixture(async ({ root, guardedPath }) => {
    const seen = [];

    await withIsolatedWorktree(
      root,
      async (worktreePath) => {
        // Recorded while the worktree still exists: after the call it is gone
        // by design, and the checkout can only be observed from inside.
        seen.push({
          worktreePath,
          isCheckout: existsSync(join(worktreePath, 'Cargo.toml')),
        });
        return { redProved: false };
      },
      { guardedPaths: [guardedPath] },
    );

    assert.equal(seen.length, 1);
    assert.notEqual(seen[0].worktreePath, root);
    assert.equal(seen[0].worktreePath.startsWith(root + sep), false, 'the worktree must live outside the main root');
    assert.equal(seen[0].isCheckout, true, 'the worktree is a real checkout, not an empty directory');
  });
});

test('the worktree is created detached at the same commit as the main tree', async () => {
  await withFixture(async ({ root, guardedPath }) => {
    let observed = null;

    await withIsolatedWorktree(
      root,
      async (worktreePath) => {
        observed = {
          worktreeHead: runGit(worktreePath, ['rev-parse', 'HEAD']).trim(),
          mainHead: runGit(root, ['rev-parse', 'HEAD']).trim(),
          listing: runGit(root, ['worktree', 'list', '--porcelain']),
        };
        return { redProved: true };
      },
      { guardedPaths: [guardedPath] },
    );

    // The exception recorded in the spec says the Red seen in the worktree cannot
    // be compared with the main tree; what can be checked is that the two start
    // from the same commit, which is what makes the comparison unnecessary.
    assert.equal(observed.worktreeHead, observed.mainHead);
    assert.match(observed.listing, /detached/);
  });
});

test('the result records whether the worktree diverges from the working tree', async () => {
  await withFixture(async ({ root, guardedPath }) => {
    // A clean tree: the worktree holds exactly what the caller is looking at.
    const clean = await withIsolatedWorktree(root, async () => ({}), { guardedPaths: [guardedPath] });
    assert.equal(clean.mainTreeCleanAtCreation, true);

    // Uncommitted work is deliberately not in the worktree, because it is taken
    // at HEAD. That divergence is recorded rather than left for the caller to
    // discover, since a Red observed against different bytes is different evidence.
    writeFileSync(join(root, 'src', 'packet.rs'), 'pub fn parse() -> bool {\n    false\n}\n');
    const dirty = await withIsolatedWorktree(root, async () => ({}), { guardedPaths: [guardedPath] });
    assert.equal(dirty.mainTreeCleanAtCreation, false);
  });
});

test('assertMainTreeUnchanged names every path whose digest moved', () => {
  const before = { '/a': { fileCount: 1, sha256: 'aaa', unreadable: [] } };
  const after = {
    '/a': { fileCount: 1, sha256: 'bbb', unreadable: [] },
    '/b': { fileCount: 0, sha256: null, unreadable: ['/b'] },
  };

  const moved = assertMainTreeUnchanged(before, after);
  assert.equal(moved.unchanged, false);
  assert.deepEqual(moved.changedPaths, ['/a', '/b']);

  const still = assertMainTreeUnchanged(before, before);
  assert.equal(still.unchanged, true);
  assert.deepEqual(still.changedPaths, []);
});

test('the forward-rotation regression gate still exits 0', () => {
  const result = spawnSync(process.execPath, [REGRESSION_RUNNER, 'regression', 'check'], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /proved/);
});
