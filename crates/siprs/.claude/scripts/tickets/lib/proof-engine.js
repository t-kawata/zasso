'use strict';

/**
 * PX-436 — detection proofs.
 *
 * A proof applies one localized mutation, runs the project's own runner,
 * observes that the mapped test is named as failing, restores the source
 * byte-for-byte, and records the source, test and command digests. A timeout or
 * flaky run is UNSTABLE, never PROVEN.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { sha256 } = require('./adapters/helpers.js');
const { isProofFresh } = require('./coverage-map.js');
const { ENGINE_VERSION, inputsDigestOf } = require('./proof-inputs.js');
const { COPY_SKIP } = require('./proof-workspace.js');

const DEFAULT_TIMEOUT_MS = 30000;
const PROVEN = 'PROVEN';
const CLAUSE_PROOF_FAILED = 'CLAUSE_PROOF_FAILED';
const UNSTABLE = 'UNSTABLE';
const REPAIR_REQUIRED = 'REPAIR_REQUIRED';
const SOURCE_RESTORE_FAILED = 'SOURCE_RESTORE_FAILED';
const MUTATION_TARGET_ABSENT = 'MUTATION_TARGET_ABSENT';

/** Apply one localized mutation to a source file. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function applyMutation({ file, mutation }) {
  const before = fs.readFileSync(file, 'utf8');
  const find = mutation?.find;
  if (typeof find !== 'string' || find.length === 0) {
    return { ok: false, reason: MUTATION_TARGET_ABSENT };
  }
  if (!before.includes(find)) {
    return { ok: false, reason: MUTATION_TARGET_ABSENT };
  }
  const replace = typeof mutation.replace === 'string' ? mutation.replace : '';
  fs.writeFileSync(file, before.replace(find, replace));
  return { ok: true, before, after: fs.readFileSync(file, 'utf8') };
}

/** Restore a source file from its original bytes. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function restoreSource({ file, bytes }) {
  fs.writeFileSync(file, bytes);
}

/** Create an isolated working copy of the project. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function createIsolatedWorkspace({ cwd }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'px436-workspace-'));
  fs.cpSync(cwd, root, {
    recursive: true,
    filter: (source) => !COPY_SKIP.has(path.basename(source)),
  });
  return { root, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

/** Run the declared project runner. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function runCommand({ command, cwd, timeoutMs }) {
  const result = spawnSync(command, { cwd, shell: true, encoding: 'utf8', timeout: timeoutMs });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    timedOut: result.signal === 'SIGTERM',
    errorCode: result.error?.code ?? null,
  };
}

/** Whether the runner names the mapped test as failing. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function observeFailingTest({ output, testId }) {
  const text = String(output ?? '');
  return text.includes(testId) && /(?:FAILED|FAIL|✗|not ok)/i.test(text);
}

/** The proof status of one run. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function statusOf({ run, failing }) {
  if (run.errorCode === 'ENOENT') return REPAIR_REQUIRED;
  if (run.timedOut === true) return UNSTABLE;
  return run.status !== 0 && failing ? PROVEN : CLAUSE_PROOF_FAILED;
}

/**
 * Run one detection proof.
 *
 * @param {{clause:object, testId:string, testDigest:string, mutation:object, command:string, inputs?:object|null, isolate?:object, workspace?:object|null, io?:object, timeoutMs?:number}} input
 * @returns {object}
 */
// [::TICKET::] PX-436, PX-441, PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-436|PX-441|PX-442) --for-spec --no-implementation-order`.
function runDetectionProof({ clause, testId, testDigest, mutation, command, inputs = null, isolate = null, workspace = null, io = {}, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  if (workspace !== null && workspace.ok === false) {
    return {
      status: REPAIR_REQUIRED,
      reason: workspace.code ?? 'PROOF_WORKSPACE_INCOMPLETE',
      missing: workspace.missing ?? [],
      workspaceFinding: workspace.code ?? null,
      clauseKey: clause?.key ?? null,
      restored: false,
    };
  }

  const working = workspace ?? isolate ?? createIsolatedWorkspace({ cwd: mutation?.cwd ?? process.cwd() });
  const runRoot = workspace !== null ? (workspace.packageRoot ?? workspace.root) : working.root;
  const owned = workspace === null || workspace.shared !== true;
  const originalPath = path.join(runRoot, mutation?.file ?? '');
  let originalBytes;
  let result;

  try {
    if (!fs.existsSync(originalPath)) {
      result = { status: REPAIR_REQUIRED, reason: 'MUTATION_FILE_MISSING', clauseKey: clause?.key ?? null, restored: false };
      return result;
    }

    originalBytes = fs.readFileSync(originalPath);
    const sourceDigest = sha256(originalBytes.toString('utf8'));
    const applied = applyMutation({ file: originalPath, mutation });
    if (!applied.ok) {
      result = { status: CLAUSE_PROOF_FAILED, reason: applied.reason, clauseKey: clause?.key ?? null, restored: true };
      return result;
    }

    const resolvedCommand = String(command ?? '').replace('{test}', String(testId));
    const run = (typeof io.runCommand === 'function' ? io.runCommand : runCommand)({
      cwd: runRoot,
      command: resolvedCommand,
      timeoutMs,
    });
    const output = String(run.stdout ?? '') + String(run.stderr ?? '');
    const failing = observeFailingTest({ output, testId });
    const status = statusOf({ run, failing });

    result = {
      kind: 'mutation',
      status,
      clauseKey: clause?.key ?? null,
      mutation,
      command: resolvedCommand,
      expected: { test: testId, outcome: 'fail' },
      observed: { exitCode: run.status, failingTests: failing ? [testId] : [] },
      digests: { source: sourceDigest, test: testDigest, command: sha256(resolvedCommand) },
      inputsVersion: inputs?.version ?? null,
      inputsDigest: inputs === null ? null : inputsDigestOf(inputs),
      inputs,
      closureScope: inputs?.closureScope ?? null,
      engineVersion: inputs?.engineVersion ?? ENGINE_VERSION,
      adapterVersion: inputs?.adapterVersion ?? null,
      toolchainDigest: inputs?.toolchainDigest ?? null,
      workspaceRoots: workspace?.workspaceRoots ?? [],
      workspaceFinding: workspace?.code ?? null,
      verifiedAt: new Date().toISOString(),
      restored: false,
    };
    return result;
  } finally {
    if (originalBytes !== undefined) {
      restoreSource({ file: originalPath, bytes: originalBytes });
      const restoredDigest = sha256(fs.readFileSync(originalPath).toString('utf8'));
      const sourceDigest = sha256(originalBytes.toString('utf8'));
      if (result !== undefined) {
        result.restored = restoredDigest === sourceDigest;
        if (!result.restored) result.status = SOURCE_RESTORE_FAILED;
      }
    }
    if (owned && typeof working.cleanup === 'function') working.cleanup();
  }
}

/**
 * Run proofs in `changed` or `all` mode.
 *
 * `changed` re-runs everything missing, stale, unstable or failed. `all` exists
 * for audit and final completion.
 *
 * @param {{clauses:object[], mode?:'changed'|'all', runProof:Function}} input
 * @returns {object}
 */
// [::TICKET::] PX-436, PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-436|PX-441) --for-spec --no-implementation-order`.
function runProofs({ clauses, mode = 'changed', runProof, budget = 0 }) {
  const list = clauses ?? [];
  const selected = mode === 'all'
    ? [...list]
    : list.filter((entry) => !isProofFresh({ proof: entry.proof, inputs: entry.inputs ?? null }));
  const runnable = budget > 0 ? selected.slice(0, budget) : selected;
  const results = runnable.map((entry) => runProof(entry));
  return {
    mode,
    ran: runnable.length,
    skipped: list.length - selected.length,
    notRun: selected.length - runnable.length,
    results,
  };
}

module.exports = {
  CLAUSE_PROOF_FAILED,
  DEFAULT_TIMEOUT_MS,
  MUTATION_TARGET_ABSENT,
  PROVEN,
  REPAIR_REQUIRED,
  SOURCE_RESTORE_FAILED,
  UNSTABLE,
  applyMutation,
  createIsolatedWorkspace,
  observeFailingTest,
  restoreSource,
  runCommand,
  runDetectionProof,
  runProofs,
  statusOf,
};
