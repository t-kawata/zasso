/**
 * The isolated environment dynamic evidence is obtained in.
 *
 * R-1 refuses to call a proposition `observed` when it involves a dynamic
 * mechanism and no dynamic evidence exists. Until an environment that can
 * produce such evidence exists, that refusal is permanent, and every such
 * proposition stays unresolved for a reason belonging to the instrument rather
 * than to the project. This module is that environment: it copies a target into
 * a throwaway tree, runs commands inside the copy, and returns the copy to its
 * recorded initial state on demand.
 *
 * Three properties are structural rather than documented.
 *
 * The first is *reset before destruction*. Creating a sandbox takes a pristine
 * snapshot and rehearses the restore once, before the handle is returned; only
 * a rehearsal that reproduced the initial digest produces an armed sandbox. The
 * arming is a module-private set, not a field, so a fabricated handle cannot
 * claim it — a destructive transition is unreachable except through a handle
 * this module itself created and armed.
 *
 * The second is *the boundary*. The copy refuses to reproduce a symlink that
 * points outside the target, because a link carried over verbatim would put a
 * way out of the sandbox inside the sandbox. And production is re-measured
 * around every operation, not only when a caller remembers to ask.
 *
 * The third is *the shape of the answer*: a run reports what it resolved and
 * names the channels it never looked at, because the absence of a search must
 * not read as the absence of a mechanism. That model lives in
 * `dynamic-surface.mjs`; this module only feeds it.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { EVIDENCE_MODES, buildDynamicSurface } from './dynamic-surface.mjs';
import { SandboxError } from './sandbox-error.mjs';
import { NEVER_WALKED_DIRECTORY_NAMES, compareText, digestTree } from './holdout-ledger.mjs';

export { SandboxError };

/** The conver repository this module belongs to, walked back from its own location. */
export const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

/**
 * The roots a sandbox must never change, named once so that every isolation
 * mechanism checks the same set.
 *
 * P22-19's worktree isolation reads this same constant: two mechanisms guarding
 * different lists would each look correct and leave a gap between them.
 */
export const PRODUCTION_PATHS = Object.freeze(['siprs-with-4layers', 'siprs-for-reverse']);

/**
 * The kinds of start plan, most direct first.
 *
 * A service definition states how to start the thing itself, so it leads; a
 * crate manifest states how to build it, and is what remains when there is no
 * service. Both commands are bounded, offline and need no daemon.
 */
export const START_PLAN_PRIORITY = Object.freeze(['compose', 'cargo']);

export const COMPOSE_MANIFEST_NAMES = Object.freeze([
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
]);

export const CARGO_MANIFEST_NAME = 'Cargo.toml';

export const DATABASE_KINDS = Object.freeze(['none', 'sqlite']);

export const SANDBOX_TREE_DIRECTORY_NAME = 'tree';
export const SANDBOX_SNAPSHOT_DIRECTORY_NAME = 'snapshot';

/** The reason code a disposed sandbox refuses with, distinct from a failed reset. */
export const SANDBOX_DISPOSED_REASON = 'sandbox-disposed';
const SANDBOX_UNUSABLE_REASON = 'sandbox-unusable';

/**
 * The sandboxes this process created, and the ones whose reset is armed.
 *
 * A session can only be recorded against a sandbox that was actually observed,
 * and a destructive transition only against one whose reset has been rehearsed.
 * Both tokens are the handle itself, held in module-private sets, so neither
 * property can be fabricated by assigning to a field on an object literal.
 */
const OBSERVED_SANDBOXES = new WeakSet();
const ARMED_SANDBOXES = new WeakSet();

/** True when this process created the handle, so its sessions are real observations. */
export function isObservedSandbox(handle) {
  return typeof handle === 'object' && handle !== null && OBSERVED_SANDBOXES.has(handle);
}

/** SHA-256 of a file's bytes, lowercase hex. */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

/** SHA-256 of a string, lowercase hex. */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/** Refuse a root that is absent, naming the path that was looked for. */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function assertTargetRoot(root) {
  if (typeof root !== 'string' || root.length === 0) {
    throw new SandboxError('root-missing', 'a sandbox needs a target root, and none was given');
  }
  if (!existsSync(root)) {
    throw new SandboxError('root-missing', `no target root exists at ${root} — a sandbox needs a directory to copy`);
  }
  if (!statSync(root).isDirectory()) {
    throw new SandboxError('root-not-directory', `the target root ${root} is not a directory`);
  }
}

/**
 * The plan that would start a target at this root, or null when the manifest it
 * would come from is not present.
 */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function planFor(root, kind) {
  if (kind === 'compose') {
    const manifest = COMPOSE_MANIFEST_NAMES.find((name) => existsSync(join(root, name)));
    if (manifest === undefined) return null;
    return Object.freeze({
      kind,
      manifest,
      command: 'docker',
      args: Object.freeze(['compose', '-f', manifest, 'config', '--quiet']),
    });
  }
  if (kind === 'cargo') {
    if (!existsSync(join(root, CARGO_MANIFEST_NAME))) return null;
    return Object.freeze({
      kind,
      manifest: CARGO_MANIFEST_NAME,
      command: 'cargo',
      args: Object.freeze(['metadata', '--no-deps', '--format-version', '1']),
    });
  }
  return null;
}

/**
 * Every start plan the target's own manifests declare, most direct first.
 *
 * A plan names the manifest it came from, so "startable" is never a guess about
 * a command someone remembered.
 */
export function discoverStartPlans(root) {
  if (typeof root !== 'string' || !existsSync(root) || !statSync(root).isDirectory()) return [];
  return START_PLAN_PRIORITY.map((kind) => planFor(root, kind)).filter((plan) => plan !== null);
}

/**
 * Refuse a symlink that would carry a way out of the tree into the sandbox.
 *
 * A link is copied verbatim by default, so it would still point at its original
 * — a production path. A transition writing through it would leave the sandbox
 * without leaving the filesystem, and nothing would report it.
 */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function assertLinkStaysInside(candidate, sourceBase) {
  if (!lstatSync(candidate).isSymbolicLink()) return;
  const target = resolve(dirname(candidate), readlinkSync(candidate));
  if (target === sourceBase || target.startsWith(sourceBase + sep)) return;
  throw new SandboxError(
    'symlink-escapes-target',
    `the symlink ${candidate} points at ${target}, which is outside the target root ${sourceBase} — copying it would put a way out of the sandbox inside the sandbox`,
  );
}

/** Copy a tree, leaving behind what is not project content. */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function copyTree(source, destination, excludeDirectoryNames) {
  const excluded = new Set(excludeDirectoryNames);
  const sourceBase = resolve(source);
  cpSync(source, destination, {
    recursive: true,
    filter: (candidate) => {
      if (candidate === source) return true;
      if (excluded.has(basename(candidate))) return false;
      assertLinkStaysInside(candidate, sourceBase);
      return true;
    },
  });
}

/** The declared database, resolved inside the sandbox and nowhere else. */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function resolveDatabase(sandboxRoot, database) {
  const kind = database?.kind ?? 'none';
  if (!DATABASE_KINDS.includes(kind)) {
    throw new SandboxError(
      'database-kind-unknown',
      `the declared database kind "${kind}" is not one of ${DATABASE_KINDS.join(', ')}`,
    );
  }
  if (kind === 'none') {
    return { kind: 'none', path: null, absolutePath: null, initialDigest: null };
  }

  const relativePath = database?.path;
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    throw new SandboxError('database-path-missing', `a ${kind} database needs a path, and none was given`);
  }
  const sandboxBase = resolve(sandboxRoot);
  const absolutePath = resolve(sandboxBase, relativePath);
  if (absolutePath !== sandboxBase && !absolutePath.startsWith(sandboxBase + sep)) {
    throw new SandboxError(
      'database-outside-sandbox',
      `the declared database ${relativePath} would resolve to ${absolutePath}, which is outside the sandbox — a database the sandbox cannot contain is not an isolated one`,
    );
  }
  if (!existsSync(absolutePath)) {
    throw new SandboxError(
      'database-missing',
      `the declared database ${relativePath} is not present in the sandbox at ${absolutePath}`,
    );
  }
  return { kind, path: relativePath, absolutePath, initialDigest: { sha256: sha256File(absolutePath) } };
}

/**
 * Digest every production path, keyed by the path, so two moments can be compared.
 *
 * A production root that has gone missing is recorded as a digest with no
 * content rather than raising: the question being asked is whether it changed,
 * and "it is no longer there" is an answer to that question.
 */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function digestProduction(productionPaths) {
  const digests = {};
  for (const productionPath of productionPaths) {
    digests[productionPath] = existsSync(productionPath)
      ? digestTree(productionPath)
      : { fileCount: 0, sha256: null, unreadable: [productionPath] };
  }
  return digests;
}

/** The absolute production paths this sandbox was told to guard. */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function resolveProductionPaths(productionPaths) {
  const declared = productionPaths ?? PRODUCTION_PATHS.map((name) => join(PROJECT_ROOT, name));
  return Object.freeze([...declared].sort(compareText));
}

/**
 * The recorded reset, or null when none has been recorded.
 *
 * Arming is the module-private set, not the field: the field is a readable
 * mirror, and only this function adds to the set, so a caller cannot arm a
 * sandbox by assigning to it.
 */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function recordReset(handle) {
  handle.resetHandle = {
    resetId: `reset-${handle.sandboxId}`,
    initialDigest: handle.initialDigest,
    snapshotPath: handle.snapshotRoot,
  };
  ARMED_SANDBOXES.add(handle);
  return handle.resetHandle;
}

/**
 * Restore the sandbox from its snapshot and say whether the initial state came back.
 *
 * The snapshot is checked before the sandbox is touched: taking the way back
 * away and only then discovering there is none is the ordering this exists to
 * avoid.
 */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function restoreFromSnapshot(handle) {
  if (!existsSync(handle.snapshotRoot)) {
    throw new SandboxError(
      'snapshot-missing',
      `the snapshot at ${handle.snapshotRoot} is gone, so the sandbox ${handle.sandboxId} can no longer be returned to its initial state`,
    );
  }
  rmSync(handle.sandboxRoot, { recursive: true, force: true });
  cpSync(handle.snapshotRoot, handle.sandboxRoot, { recursive: true });
  const digest = digestTree(handle.sandboxRoot, { excludedDirectoryNames: handle.excludeDirectoryNames });
  return {
    digest,
    matchesInitial: digest.sha256 === handle.initialDigest.sha256 && digest.fileCount === handle.initialDigest.fileCount,
  };
}

/** Whether the declared database still holds the bytes it held at creation. */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function databaseState(handle) {
  if (handle.database.kind === 'none') {
    return { matchesInitial: true, sha256: null };
  }
  if (!existsSync(handle.database.absolutePath)) {
    return { matchesInitial: false, sha256: null };
  }
  const digest = sha256File(handle.database.absolutePath);
  return { matchesInitial: digest === handle.database.initialDigest.sha256, sha256: digest };
}

/** Refuse any operation on a sandbox that is no longer usable, or was never ours. */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function assertUsable(handle) {
  if (!isObservedSandbox(handle)) {
    throw new SandboxError(
      'sandbox-not-observed',
      'no sandbox in this process produced this handle — only a handle createSandbox returned can be operated on',
    );
  }
  if (!handle.sandboxUsable) {
    throw new SandboxError(
      handle.unusableReason ?? SANDBOX_UNUSABLE_REASON,
      `the sandbox ${handle.sandboxId} is not usable — ${handle.unusableReasonDetail ?? 'a previous reset failed, so it must not be reused'}`,
    );
  }
}

/**
 * Refuse a destructive transition whose way back has not been recorded.
 *
 * The check reads the module-private arming set, so the ordering cannot be
 * talked around by setting a field on the handle.
 */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function assertResetArmed(handle, transitionName) {
  if (!ARMED_SANDBOXES.has(handle)) {
    throw new SandboxError(
      'reset-not-armed',
      `the transition "${transitionName}" is destructive and no reset has been recorded for the sandbox ${handle.sandboxId} — a transition that cannot be reset is never executed`,
    );
  }
}

/** Mark a sandbox unusable with a reason a caller can branch on. */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function markUnusable(handle, reason, detail) {
  handle.sandboxUsable = false;
  ARMED_SANDBOXES.delete(handle);
  handle.resetHandle = null;
  handle.unusableReason = reason;
  handle.unusableReasonDetail = detail;
}

/**
 * Re-measure production and refuse to continue when it moved.
 *
 * The isolation claim is checked around every operation rather than only when a
 * caller remembers to ask, because the damage this guards against is attributed
 * to the reverse rotation rather than to the sandbox.
 */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function assertProductionStillUntouched(handle, operation) {
  const audit = assertProductionUntouched(handle);
  if (audit.untouched) return audit;

  markUnusable(handle, 'production-touched', `production changed during ${operation}`);
  throw new SandboxError(
    'production-touched',
    `the ${operation} changed the production path(s) ${audit.changedPaths.join(', ')} — the sandbox ${handle.sandboxId} is marked unusable`,
  );
}

/**
 * Create an isolated copy of a target, with a reset procedure already proven.
 *
 * The returned handle carries the initial digest, the production digest taken
 * before anything ran, the plans the target declares, and an armed reset.
 * Nothing destructive can be executed against it until that reset exists, and
 * the sandbox is thrown away rather than returned if the reset cannot be
 * rehearsed.
 *
 * @param {string} root - the target to isolate
 * @param {object} [options]
 * @param {string} [options.scratchRoot] - where the sandbox directory is made
 * @param {object} [options.database] - `{kind:'none'}` or `{kind:'sqlite', path}`
 * @param {Array} [options.productionPaths] - absolute roots that must not change
 * @returns {object} the sandbox handle
 */
export function createSandbox(root, options = {}) {
  const scratchRoot = options.scratchRoot ?? null;
  const excludeDirectoryNames = options.excludeDirectoryNames ?? NEVER_WALKED_DIRECTORY_NAMES;
  const database = options.database ?? { kind: 'none' };
  const productionPaths = options.productionPaths ?? null;

  assertTargetRoot(root);

  const scratchBaseWasCreated = scratchRoot === null;
  const scratchBase = scratchRoot ?? mkdtempSync(join(tmpdir(), 'wsp-sandbox-root-'));
  mkdirSync(scratchBase, { recursive: true });
  const sandboxDir = mkdtempSync(join(scratchBase, 'sandbox-'));

  try {
    return assembleSandbox(root, sandboxDir, {
      excludeDirectoryNames,
      database,
      productionPaths,
      scratchBase,
      scratchBaseWasCreated,
    });
  } catch (error) {
    // A sandbox that could not be assembled must not leave a copy of the target
    // behind: the caller never receives a handle, so nothing else can remove it.
    rmSync(sandboxDir, { recursive: true, force: true });
    if (scratchBaseWasCreated) rmSync(scratchBase, { recursive: true, force: true });
    throw error;
  }
}

/**
 * Fill a scratch directory with the copy, its snapshot, and a rehearsed reset.
 *
 * The reset is rehearsed before the handle is handed over, so a sandbox whose
 * way back does not work is never returned and never becomes something a
 * destructive transition can be run against.
 */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function assembleSandbox(root, sandboxDir, setup) {
  const excludeDirectoryNames = setup.excludeDirectoryNames;
  const database = setup.database;
  const productionPaths = setup.productionPaths;
  const scratchBase = setup.scratchBase;
  const scratchBaseWasCreated = setup.scratchBaseWasCreated;
  const sandboxRoot = join(sandboxDir, SANDBOX_TREE_DIRECTORY_NAME);
  const snapshotRoot = join(sandboxDir, SANDBOX_SNAPSHOT_DIRECTORY_NAME);

  copyTree(root, sandboxRoot, excludeDirectoryNames);
  copyTree(root, snapshotRoot, excludeDirectoryNames);

  const startPlans = discoverStartPlans(root);
  const handle = {
    sandboxId: basename(sandboxDir),
    sandboxDir,
    scratchBase,
    scratchBaseWasCreated,
    targetRoot: root,
    sandboxRoot,
    snapshotRoot,
    excludeDirectoryNames,
    initialDigest: digestTree(sandboxRoot, { excludedDirectoryNames: excludeDirectoryNames }),
    database: resolveDatabase(sandboxRoot, database),
    productionPaths: resolveProductionPaths(productionPaths),
    productionDigest: null,
    startPlans,
    startPlan: startPlans.length > 0 ? startPlans[0] : null,
    resetHandle: null,
    replayHandle: null,
    sandboxUsable: true,
    unusableReason: null,
    unusableReasonDetail: null,
    transitions: [],
  };
  handle.productionDigest = digestProduction(handle.productionPaths);
  OBSERVED_SANDBOXES.add(handle);

  const rehearsal = restoreFromSnapshot(handle);
  if (!rehearsal.matchesInitial) {
    markUnusable(handle, SANDBOX_UNUSABLE_REASON, 'the reset rehearsal did not reproduce the initial digest');
    throw new SandboxError(
      'reset-rehearsal-failed',
      `the reset of ${root} was rehearsed and did not reproduce the initial digest, so no destructive transition may run against it`,
    );
  }
  recordReset(handle);

  // The handle reads its arming from the module-private set, so the readable
  // field cannot disagree with the gate that actually decides.
  Object.defineProperty(handle, 'resetArmed', { get: () => ARMED_SANDBOXES.has(handle), enumerable: true });

  return handle;
}

/**
 * Return a sandbox to its recorded initial state.
 *
 * A failure is reported as a result and the environment is marked unusable
 * rather than silently reused, because a sandbox whose way back is broken is
 * not a sandbox. A sandbox with no recorded transitions still takes the same
 * route, and comes back unchanged.
 */
export function resetSandbox(handle) {
  assertUsable(handle);

  const transitionsCleared = handle.transitions.length;
  ARMED_SANDBOXES.delete(handle);
  handle.resetHandle = null;
  // The transitions before a reset belong to sessions that have already been
  // recorded; a fresh log is started so new runs are not mixed into them.
  handle.transitions = [];
  handle.replayHandle = null;

  let restored;
  try {
    restored = restoreFromSnapshot(handle);
    if (!restored.matchesInitial) {
      throw new SandboxError(
        'reset-digest-mismatch',
        'the restored sandbox does not match its initial digest, so it cannot be trusted as a starting point',
      );
    }
  } catch (error) {
    markUnusable(handle, SANDBOX_UNUSABLE_REASON, `a reset of the sandbox failed: ${error.message}`);
    return {
      restored: false,
      matchesInitial: false,
      digest: null,
      database: { matchesInitial: false, sha256: null },
      transitionsCleared,
      reason: error.message,
    };
  }

  const database = databaseState(handle);
  assertProductionStillUntouched(handle, 'reset');
  recordReset(handle);
  return { restored: true, matchesInitial: true, digest: restored.digest, database, transitionsCleared };
}

/**
 * Run one command inside the sandbox and record it.
 *
 * A destructive transition requires an armed reset, and is refused before
 * anything is executed when there is none. A command that cannot be spawned at
 * all is reported as such, with the command named, rather than recorded as a
 * run that produced nothing. Production is re-measured afterwards.
 */
export function runTransition(handle, transition = {}) {
  const name = transition.name;
  const command = transition.command;
  const args = transition.args ?? [];
  const destructive = transition.destructive ?? false;
  const evidenceMode = transition.evidenceMode ?? 'source_static';
  const observations = transition.observations ?? [];

  assertUsable(handle);
  if (destructive) assertResetArmed(handle, name);
  if (!EVIDENCE_MODES.includes(evidenceMode)) {
    throw new SandboxError(
      'evidence-mode-unknown',
      `the evidence mode "${evidenceMode}" is not one of ${EVIDENCE_MODES.join(', ')}`,
    );
  }

  const result = spawnSync(command, args, {
    cwd: handle.sandboxRoot,
    encoding: 'utf8',
    env: process.env,
  });
  if (result.error) {
    throw new SandboxError(
      'command-unavailable',
      `the command "${command}" could not be run inside the sandbox ${handle.sandboxId}: ${result.error.message}`,
    );
  }

  const record = {
    name,
    command,
    args: [...args],
    exitCode: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    destructive,
    evidenceMode,
    observations: observations.map((observation) => ({
      kind: observation.kind,
      specifier: observation.specifier ?? null,
      symbol: observation.symbol ?? null,
      statement: observation.statement ?? null,
    })),
  };
  handle.transitions.push(record);
  assertProductionStillUntouched(handle, `transition "${name}"`);
  return record;
}

/** The plan a session will start from, or a refusal naming why there is none. */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function resolveStartPlan(handle, tier) {
  if (tier !== null && tier !== undefined) {
    const plan = handle.startPlans.find((candidate) => candidate.kind === tier);
    if (plan === undefined) {
      throw new SandboxError(
        'tier-unavailable',
        `the target at ${handle.targetRoot} declares no "${tier}" start plan; it declares ${describePlanKinds(handle)}`,
      );
    }
    return plan;
  }
  if (handle.startPlan === null) {
    throw new SandboxError(
      'unstartable',
      `the target at ${handle.targetRoot} declares no manifest a start command could be derived from — looked for ${[...COMPOSE_MANIFEST_NAMES, CARGO_MANIFEST_NAME].join(', ')}. An unstartable target is reported rather than yielding an empty evidence set`,
    );
  }
  return handle.startPlan;
}

/** The plan kinds a target declares, named for a human reading a refusal. */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function describePlanKinds(handle) {
  return handle.startPlans.length === 0
    ? 'none at all'
    : handle.startPlans.map((plan) => `"${plan.kind}" (from ${plan.manifest})`).join(', ');
}

/** The first non-empty stderr line, so a failure message quotes the cause and not a wall of text. */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function firstNonEmptyLine(text) {
  return text.split('\n').map((line) => line.trim()).find((line) => line.length > 0) ?? '';
}

/**
 * Start the target's own declared command inside the sandbox.
 *
 * A start that fails is reported with its exit code and the first line of its
 * own output; it is never returned as a session that merely observed nothing.
 */
export function startSession(handle, options = {}) {
  const tier = options.tier ?? null;

  assertUsable(handle);
  const plan = resolveStartPlan(handle, tier);
  const transition = runTransition(handle, {
    name: 'start',
    command: plan.command,
    args: plan.args,
    evidenceMode: 'build_semantic',
  });
  if (transition.exitCode !== 0) {
    throw new SandboxError(
      'start-failed',
      `starting the target at ${handle.targetRoot} with "${plan.command} ${plan.args.join(' ')}" failed with exit code ${transition.exitCode}: ${firstNonEmptyLine(transition.stderr) || '(no stderr)'}`,
    );
  }

  // The session keeps the log it began in, by reference. A later reset starts a
  // fresh log, so what this session did stays readable instead of being erased
  // into an empty evidence set that would look like a clean result.
  const sessionLog = handle.transitions;
  const sessionStartIndex = sessionLog.length - 1;
  const session = { sandboxId: handle.sandboxId, startPlan: plan, started: true, sessionStartIndex };
  Object.defineProperty(session, 'transitions', {
    get: () => sessionLog.slice(sessionStartIndex),
    enumerable: true,
  });
  Object.defineProperty(session, 'sessionId', {
    get: () => sessionIdOf(session),
    enumerable: true,
  });
  Object.defineProperty(session, 'origin', { value: handle, enumerable: false });
  return session;
}

/**
 * The identifier of a session, derived from its content so that the same
 * session names itself the same way twice.
 */
export function sessionIdOf(session) {
  const canonical = JSON.stringify({
    sandboxId: session.sandboxId,
    startPlan: session.startPlan,
    transitions: session.transitions.map((transition) => ({
      name: transition.name,
      command: transition.command,
      args: transition.args,
      exitCode: transition.exitCode,
      stdout: transition.stdout,
      stderr: transition.stderr,
      evidenceMode: transition.evidenceMode,
    })),
  });
  return `ses-${sha256(canonical).slice(0, 16)}`;
}

/**
 * Collect the dynamic evidence an isolated session produced.
 *
 * Two lists come out of a session and they are not interchangeable. The *runs*
 * are what was executed, and they are what makes the scan reproducible. The
 * *observations* are the dynamic constructs the runs and the caller's own
 * reading actually saw. A command that exited zero is not a construct that was
 * resolved, so a run never becomes an observation: collapsing the two would let
 * a build that saw nothing report a surface it never looked at.
 *
 * `unobservedChannels` is passed through untouched, so a caller who says
 * nothing gets the safe reading rather than the flattering one.
 */
export function collectDynamicEvidence(handle, session, options = {}) {
  const observations = options.observations ?? [];

  const saw = session.transitions.flatMap((transition) =>
    transition.observations.map((observation) => ({
      kind: observation.kind,
      specifier: observation.specifier,
      symbol: observation.symbol,
      statement: observation.statement,
      evidence_mode: transition.evidenceMode,
    })),
  );
  const runs = session.transitions.map((transition) => ({
    name: transition.name,
    command: transition.command,
    args: [...transition.args],
    exitCode: transition.exitCode,
    evidence_mode: transition.evidenceMode,
  }));

  return buildDynamicSurface({
    observations: [...observations, ...saw],
    unobservedChannels: options.unobservedChannels,
    runs,
    sandboxId: handle.sandboxId,
    session: { sessionId: session.sessionId, sandboxId: handle.sandboxId },
  });
}

/**
 * Whether the production paths still hold the bytes they held at creation.
 *
 * This is the claim the isolation is checked by, and it is deliberately the
 * same measurement the P22-1 gate takes: a digest over the same walk, with the
 * same exclusions.
 */
export function assertProductionUntouched(handle) {
  const after = digestProduction(handle.productionPaths);
  const changedPaths = handle.productionPaths.filter((productionPath) => {
    const before = handle.productionDigest[productionPath];
    const now = after[productionPath];
    return before?.sha256 !== now?.sha256 || before?.fileCount !== now?.fileCount;
  });
  return {
    untouched: changedPaths.length === 0,
    before: handle.productionDigest,
    after,
    changedPaths: [...changedPaths].sort(compareText),
  };
}

/** Throw the sandbox away, leaving it unusable rather than silently reusable. */
export function disposeSandbox(handle) {
  if (!isObservedSandbox(handle)) {
    throw new SandboxError(
      'sandbox-not-observed',
      'no sandbox in this process produced this handle — disposing it would remove a directory this module never made',
    );
  }
  rmSync(handle.sandboxDir, { recursive: true, force: true });
  // A scratch parent this module created holds only this sandbox, so leaving it
  // behind would leak an empty directory per sandbox ever made.
  if (handle.scratchBaseWasCreated) rmSync(handle.scratchBase, { recursive: true, force: true });
  markUnusable(handle, SANDBOX_DISPOSED_REASON, 'the sandbox was disposed');
}
