// [::TICKET::] P22-19 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-19 --for-spec --no-implementation-order`.
/**
 * Worktree isolation for Red reconstruction.
 *
 * Confirming a Red means breaking an implementation on purpose, and doing that
 * in the working tree would damage the very artefact the reverse rotation is
 * analysing. So the breaking happens in a disposable git worktree, and this
 * module is what guarantees it cannot happen anywhere else.
 *
 * Three properties are held by the structure rather than asked for in a comment.
 *
 * The enclosed function only ever receives a worktree path. The call sits after
 * a successful `git worktree add` and inside the same scope, so there is no
 * early return on which it could be handed the main root instead; and when no
 * worktree exists it is not called at all.
 *
 * Destruction runs on every exit, including the ones nobody plans for. The
 * `finally` is the only place the scratch directory is released, and it releases
 * only once the worktree is provably gone.
 *
 * The main tree is re-measured after every execution, and the answer travels
 * back in the result rather than staying a side note. The paths measured are the
 * same `PRODUCTION_PATHS` P22-18's sandbox guards and the walk is the same
 * `digestTree` the P22-1 gate uses, so two isolation mechanisms cannot disagree
 * about whether the tree moved.
 *
 * A worktree that cannot be destroyed is raised rather than returned, because a
 * silent restoration failure means the certainty is gone and nobody knows. In
 * that one case the scratch directory is deliberately left on disk: the
 * worktree is still registered, and removing the directory would destroy the
 * evidence a human needs to see.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PRODUCTION_PATHS, PROJECT_ROOT } from './sandbox.mjs';
import { compareText, digestTree } from './holdout-ledger.mjs';

/** The reason code a caller branches on, and the message a human reads. */
// [::TICKET::] P22-19 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-19 --for-spec --no-implementation-order`.
export class WorktreeIsolationError extends Error {
// [::TICKET::] P22-19 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-19 --for-spec --no-implementation-order`.
  constructor(reason, message, { outcome = null, cause = undefined } = {}) {
    super(message, { cause });
    this.name = 'WorktreeIsolationError';
    this.reason = reason;
    this.outcome = outcome;
  }

  /**
   * The same failure, once the outcome it belongs to is known.
   *
   * A worktree that could not be made is discovered before the main tree has
   * been re-measured, so the failure is raised first and completed here rather
   * than thrown twice.
   */
// [::TICKET::] P22-19 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-19 --for-spec --no-implementation-order`.
  withOutcome(outcome) {
    return new WorktreeIsolationError(this.reason, this.message, { outcome, cause: this.cause });
  }
}

const REASON_INVALID_TARGET = 'invalid-target';
const REASON_CREATION_FAILED = 'worktree-creation-failed';
const REASON_EXECUTION_FAILED = 'execution-failed';
const REASON_RESTORATION_FAILED = 'restoration-failed';
const REASON_MAIN_TREE_MODIFIED = 'main-tree-modified';

/** The reasons this module raises, built from the constants the throws use so the two cannot drift. */
export const WORKTREE_REASONS = Object.freeze([
  REASON_INVALID_TARGET,
  REASON_CREATION_FAILED,
  REASON_EXECUTION_FAILED,
  REASON_RESTORATION_FAILED,
  REASON_MAIN_TREE_MODIFIED,
]);

export const WORKTREE_SCRATCH_PREFIX = 'wsp-worktree-';
export const WORKTREE_DIRECTORY_NAME = 'tree';

export const RESTORATION_DESTROYED = 'destroyed';
export const RESTORATION_FAILED = 'failed';
export const RESTORATION_OUTCOMES = Object.freeze([RESTORATION_DESTROYED, RESTORATION_FAILED]);

/**
 * The environment every git command runs under.
 *
 * A credential or terminal prompt is refused rather than waited for. An
 * isolated execution has no terminal, and a git command that blocked on one
 * would hang the loop instead of reporting anything.
 */
const GIT_ENVIRONMENT = Object.freeze({ ...process.env, GIT_TERMINAL_PROMPT: '0' });

/** The scratch directories this process made, held privately so only they can be released. */
const OPEN_SCRATCH_DIRECTORIES = new WeakSet();

/** The first non-empty line of a message, so a failure quotes the cause and not a wall of text. */
// [::TICKET::] P22-19 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-19 --for-spec --no-implementation-order`.
function firstNonEmptyLine(text) {
  const lines = String(text ?? '').split('\n');
  return lines.map((line) => line.trim()).find((line) => line.length > 0) ?? null;
}

/** Run one git command in a tree, refusing to continue when it fails. */
// [::TICKET::] P22-19 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-19 --for-spec --no-implementation-order`.
function runGitIn(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', env: GIT_ENVIRONMENT });
  if (result.error) {
    throw new Error(`git ${args.join(' ')} could not be spawned in ${root}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed in ${root}: ${firstNonEmptyLine(result.stderr) ?? 'no output'}`);
  }
  return result.stdout ?? '';
}

/**
 * Name a thrown value, so a message built from it can never say "undefined".
 *
 * Anything can be thrown, and only an Error carries a `message`. The original
 * is kept as the cause; this only supplies something a reader can act on.
 */
function describeThrown(thrown) {
  if (typeof thrown === 'string') return thrown;
  if (thrown !== null && typeof thrown === 'object') return Object.prototype.toString.call(thrown);
  return String(thrown);
}

/** A thrown value as an Error, keeping whatever was thrown as the cause. */
function toError(thrown) {
  if (thrown instanceof Error) return thrown;
  return new Error(`a non-Error value was thrown: ${describeThrown(thrown)}`, { cause: thrown });
}

/** Refuse a request that cannot describe an isolated execution. */
// [::TICKET::] P22-19 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-19 --for-spec --no-implementation-order`.
function assertIsolationRequest(root, fn) {
  if (typeof root !== 'string' || root.length === 0) {
    throw new WorktreeIsolationError(
      REASON_INVALID_TARGET,
      'a worktree needs the repository to isolate, and no path was given',
    );
  }
  if (typeof fn !== 'function') {
    throw new WorktreeIsolationError(
      REASON_INVALID_TARGET,
      `a worktree needs something to run inside it, and a ${typeof fn} is not something that can be run`,
    );
  }
}

/** When a caller names no guarded paths, the production roots this project declares. */
// [::TICKET::] P22-19 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-19 --for-spec --no-implementation-order`.
function resolveGuardedProductionPaths() {
  return PRODUCTION_PATHS.map((name) => join(PROJECT_ROOT, name));
}

/** True when `root` is inside a working tree git can make another worktree of. */
// [::TICKET::] P22-19 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-19 --for-spec --no-implementation-order`.
function isGitRepository(root, runGit) {
  try {
    return runGit(root, ['rev-parse', '--is-inside-work-tree']).trim() === 'true';
  } catch {
    return false;
  }
}

/** A private scratch directory, and the token that releases it. */
// [::TICKET::] P22-19 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-19 --for-spec --no-implementation-order`.
function openScratchDirectory(scratchRoot) {
  const base = scratchRoot ?? tmpdir();
  mkdirSync(base, { recursive: true });
  const handle = { path: mkdtempSync(join(base, WORKTREE_SCRATCH_PREFIX)) };
  OPEN_SCRATCH_DIRECTORIES.add(handle);
  return handle;
}

/** Remove a scratch directory this process made, and only one it made. */
// [::TICKET::] P22-19 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-19 --for-spec --no-implementation-order`.
function releaseScratchDirectory(handle) {
  if (!OPEN_SCRATCH_DIRECTORIES.has(handle)) return;
  OPEN_SCRATCH_DIRECTORIES.delete(handle);
  rmSync(handle.path, { recursive: true, force: true });
}

/**
 * Make a detached worktree of `root`, taken at the commit the main tree is on.
 *
 * A failure here is raised rather than worked around. The alternative to an
 * isolated worktree is not "run in the main tree" — it is "do not run", because
 * a reconstruction that reached the main tree would damage the artefact the
 * whole phase is measuring.
 *
 * The worktree is taken at `HEAD`, so uncommitted work is deliberately not in
 * it. That is the right isolation — a Red must be observable against a defined
 * revision — but it means the execution can be observing different bytes than
 * the caller is looking at, and a caller who is not told cannot weigh the
 * evidence. `readMainTreeCleanliness` records which of the two it was.
 */
// [::TICKET::] P22-19 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-19 --for-spec --no-implementation-order`.
function createWorktree(root, scratch, runGit) {
  if (!isGitRepository(root, runGit)) {
    throw new WorktreeIsolationError(
      REASON_CREATION_FAILED,
      `${root} is not inside a git working tree, so no isolated worktree can be made from it — the execution is refused rather than run against the main tree`,
    );
  }

  const worktreePath = join(scratch.path, WORKTREE_DIRECTORY_NAME);
  try {
    runGit(root, ['worktree', 'add', '--detach', worktreePath, 'HEAD']);
  } catch (error) {
    throw new WorktreeIsolationError(
      REASON_CREATION_FAILED,
      `git could not make a worktree of ${root} at ${worktreePath}: ${error.message}`,
      { cause: error },
    );
  }
  return worktreePath;
}

/**
 * Whether the working tree had uncommitted changes when the worktree was made.
 *
 * A reading that could not be taken is reported as `null` rather than as "clean".
 * An unstated answer is not an answer, and "clean" is the one wrong answer here:
 * it would hide that the execution and the working tree had diverged.
 */
function readMainTreeCleanliness(root, runGit) {
  try {
    return runGit(root, ['status', '--porcelain']).trim().length === 0;
  } catch {
    return null;
  }
}

/**
 * Remove the worktree and its registration, reporting rather than raising.
 *
 * This function's job is only to say truthfully whether the worktree is gone;
 * what a failure means is the caller's decision. A single `--force` is
 * deliberate: it removes a dirty worktree but refuses a locked one, and a lock
 * is a reason a human gave for the tree to stay.
 */
// [::TICKET::] P22-19 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-19 --for-spec --no-implementation-order`.
function destroyWorktree(root, worktreePath, runGit) {
  try {
    runGit(root, ['worktree', 'remove', '--force', worktreePath]);
  } catch (error) {
    return { outcome: RESTORATION_FAILED, detail: error.message };
  }
  try {
    runGit(root, ['worktree', 'prune']);
  } catch (error) {
    return { outcome: RESTORATION_FAILED, detail: error.message };
  }
  return { outcome: RESTORATION_DESTROYED, detail: `the worktree at ${worktreePath} was removed` };
}

/**
 * Digest every guarded path, keyed by the path, so two moments can be compared.
 *
 * A guarded path that has gone missing is recorded as a digest with no content
 * rather than raising: the question being asked is whether it changed, and "it
 * is no longer there" is an answer to that question.
 */
export function digestMainTree(productionPaths = resolveGuardedProductionPaths()) {
  const digests = {};
  for (const productionPath of productionPaths) {
    digests[productionPath] = existsSync(productionPath)
      ? digestTree(productionPath)
      : { fileCount: 0, sha256: null, unreadable: [productionPath] };
  }
  return digests;
}

/**
 * Whether two moments of the guarded paths hold the same bytes, and where they differ.
 *
 * The comparison walks the union of both readings, not just the first. A path
 * that appears in only one of them has changed by definition, and walking one
 * side would report the two moments as identical when they are not — which is
 * the one answer this function must never give.
 */
export function assertMainTreeUnchanged(before, after) {
  const guardedPaths = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort(compareText);
  const changedPaths = guardedPaths.filter(
    (productionPath) => before[productionPath]?.sha256 !== after[productionPath]?.sha256,
  );
  return { before, after, unchanged: changedPaths.length === 0, changedPaths };
}

/**
 * Run `fn` inside a disposable worktree of `root`, and report what the main tree lost.
 *
 * The value `fn` returns is carried back as `execution` and is otherwise left
 * alone: this module knows about isolation, not about what the execution meant.
 *
 * @param {string} root - the working tree to isolate
 * @param {(worktreePath: string, context: {root: string}) => any} fn - what to run
 * @param {object} [options]
 * @param {Array<string>} [options.productionPaths] - absolute roots that must not change
 * @param {string} [options.scratchRoot] - the directory the worktree is made in
 * @param {Function} [options.runGit] - the git runner, for a caller that needs its own
 * @returns {Promise<{root: string, worktreePath: string|null, scratchBase: string, mainTreeCleanAtCreation: boolean|null, execution: any, mainTreeDigest: object, restorationOutcome: string|null, restorationDetail: string|null}>}
 */
export async function withIsolatedWorktree(root, fn, options = {}) {
  assertIsolationRequest(root, fn);

  const runGit = options.runGit ?? runGitIn;
  const guardedPaths = options.productionPaths ?? resolveGuardedProductionPaths();
  const mainTreeBefore = digestMainTree(guardedPaths);
  const scratch = openScratchDirectory(options.scratchRoot);

  let worktreePath = null;
  let mainTreeCleanAtCreation = null;
  let execution = null;
  let creationFailure = null;
  let executionFailure = null;
  let destruction = null;

  try {
    try {
      worktreePath = createWorktree(root, scratch, runGit);
    } catch (error) {
      creationFailure = error;
    }

    if (worktreePath !== null) {
      // Read before the execution runs, because "at creation" is the moment the
      // claim is about: the worktree holds HEAD, and this says whether HEAD and
      // the working tree were the same bytes.
      mainTreeCleanAtCreation = readMainTreeCleanliness(root, runGit);
      try {
        execution = await fn(worktreePath, { root });
      } catch (thrown) {
        executionFailure = toError(thrown);
      }
      destruction = destroyWorktree(root, worktreePath, runGit);
    }
  } finally {
    // A scratch directory is released only once its worktree is provably gone.
    // After a failed destruction it is left in place, because the worktree is
    // still registered and removing the directory would hide that.
    if (destruction === null || destruction.outcome === RESTORATION_DESTROYED) {
      releaseScratchDirectory(scratch);
    }
  }

  const outcome = {
    root,
    worktreePath,
    scratchBase: scratch.path,
    mainTreeCleanAtCreation,
    execution,
    mainTreeDigest: assertMainTreeUnchanged(mainTreeBefore, digestMainTree(guardedPaths)),
    restorationOutcome: destruction === null ? null : destruction.outcome,
    restorationDetail: destruction === null ? null : destruction.detail,
  };

  assertIsolationHeld(outcome, { creationFailure, executionFailure });
  return outcome;
}

/**
 * Refuse to return an outcome in which the isolation did not hold.
 *
 * The order is deliberate. A main tree that moved, or a worktree that could not
 * be destroyed, outranks whatever the execution itself did: those are failures
 * of the isolation, and the execution's own error is preserved as the cause
 * rather than allowed to bury them.
 */
// [::TICKET::] P22-19 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-19 --for-spec --no-implementation-order`.
function assertIsolationHeld(outcome, { creationFailure, executionFailure }) {
  const cause = executionFailure ?? creationFailure ?? undefined;

  if (!outcome.mainTreeDigest.unchanged) {
    throw new WorktreeIsolationError(
      REASON_MAIN_TREE_MODIFIED,
      `the guarded path(s) ${outcome.mainTreeDigest.changedPaths.join(', ')} changed while the isolated execution ran — a Red reconstruction must never reach them`,
      { outcome, cause },
    );
  }

  if (outcome.restorationOutcome === RESTORATION_FAILED) {
    throw new WorktreeIsolationError(
      REASON_RESTORATION_FAILED,
      `the worktree at ${outcome.worktreePath} could not be destroyed (${outcome.restorationDetail}), so the isolation is not proved — it is left on disk for inspection, and any execution error is the cause`,
      { outcome, cause },
    );
  }

  if (creationFailure !== null) {
    throw creationFailure.withOutcome(outcome);
  }

  if (executionFailure !== null) {
    throw new WorktreeIsolationError(
      REASON_EXECUTION_FAILED,
      `the isolated execution inside ${outcome.worktreePath} threw: ${executionFailure.message}`,
      { outcome, cause: executionFailure },
    );
  }
}
