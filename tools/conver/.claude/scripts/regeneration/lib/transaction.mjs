/**
 * The thaw/refreeze transaction.
 *
 * Open verifies the live chain and stages a candidate; derive runs the producers against
 * the staging root; verify checks the chain, the grounded judgments and the detector;
 * commit is the only writer of the live design files. A failure never leaves a mixed
 * workspace: the live tree is untouched until commit, and commit rolls back.
 */
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ARTIFACT_SUFFIX, verifyChain } from './chain.mjs';
import { RegenerationError } from './errors.mjs';
import {
  ACTIVE_STATES,
  STATES,
  activeTransaction,
  assertNoOpenTransaction,
  openEntry,
  readEntry,
  readLedger,
  transition,
} from './ledger.mjs';
import { createStaging, liveSpecPath, removeStaging, snapshotDesignFiles } from './staging.mjs';

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIRECTORY = join(MODULE_DIRECTORY, '..', '..');

/** The next action a state names. */
const NEXT_ACTION = Object.freeze({
  [STATES.OPEN]: 'derive',
  [STATES.DERIVED]: 'verify',
  [STATES.VERIFIED]: 'commit',
  [STATES.JUDGMENT_REQUIRED]: 'fix the grounds in staging, then verify again',
  [STATES.COMMIT_FAILED]: 'inspect the archive, then open a new transaction',
  [STATES.DERIVE_FAILED]: 'fix the candidate or the decisions, then derive again',
  [STATES.COMMITTED]: 'none',
  [STATES.ABORTED]: 'none',
});

/** A stable transaction id. */
// [::TICKET::] PX-278 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-278 --for-spec --no-implementation-order`.
function newTransactionId() {
  return `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}

/** The live spec hash. */
// [::TICKET::] PX-278 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-278 --for-spec --no-implementation-order`.
function computeFileDigest(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/**
 * Open a transaction from a valid baseline.
 *
 * @param {{ root: string, candidateSpec: string, reason: string }} input
 * @returns {{ transactionId: string, stagingRoot: string }}
 */
export function openTransaction({ root, candidateSpec, reason }) {
  const specPath = assertThawable({ root, candidateSpec, reason });
  const transactionId = newTransactionId();
  const base = snapshotDesignFiles(root);
  const { stagingRoot } = createStaging({ root, candidateSpec, transactionId });
  openEntry(root, {
    id: transactionId,
    state: STATES.OPEN,
    reason,
    openedAt: new Date().toISOString(),
    candidateSpec,
    candidateHash: computeFileDigest(candidateSpec),
    stagingRoot,
    archiveRoot: join(root, 'regeneration', 'archive', transactionId),
    base,
  });
  return { transactionId, stagingRoot };
}


/** Refuse a thaw that cannot safely start, returning the live spec path. */
// [::TICKET::] PX-278 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-278 --for-spec --no-implementation-order`.
function assertThawable({ root, candidateSpec, reason }) {
  const chain = verifyChain(root);
  if (!chain.declared) {
    throw new RegenerationError('the workspace does not declare a hash chain', {
      code: 'CHAIN_NOT_DECLARED',
      path: root,
      repair: 'The workspace must carry the tree and allocate manifests with their recorded hashes before it can be regenerated.',
    });
  }
  if (!chain.ok) {
    const codes = chain.links.filter((link) => !link.ok).map((link) => link.code);
    throw new RegenerationError(`the live chain is broken: ${codes.join(', ')}`, {
      code: 'SILENT_CHANGE_DETECTED',
      path: root,
      repair: 'Restore the generation from the archive or repair the frozen input outside the workspace; a broken baseline cannot be thawed.',
    });
  }
  assertNoOpenTransaction(root);
  if (typeof reason !== 'string' || reason.trim() === '') {
    throw new RegenerationError('a thaw needs a reason', {
      code: 'REASON_REQUIRED',
      path: root,
      repair: 'Pass --reason with the change and the evidence that motivates it.',
    });
  }
  if (!existsSync(candidateSpec)) {
    throw new RegenerationError(`the candidate spec does not exist: ${candidateSpec}`, {
      code: 'CANDIDATE_MISSING',
      path: candidateSpec,
      repair: 'Write the candidate spec before opening the transaction.',
    });
  }
  const specPath = liveSpecPath(root);
  if (computeFileDigest(join(root, specPath)) === computeFileDigest(candidateSpec)) {
    throw new RegenerationError('the candidate is identical to the live spec', {
      code: 'NO_CHANGE',
      path: candidateSpec,
      repair: 'Change the candidate before opening a generation.',
    });
  }
  return specPath;
}

/** Abort an open transaction and discard its staging tree. */
export function abortTransaction({ root, transactionId }) {
  const entry = readEntry(root, transactionId);
  if (entry === null) {
    throw new RegenerationError(`transaction ${transactionId} is not in the ledger`, {
      code: 'UNKNOWN_TRANSACTION',
      path: root,
      repair: 'Name an existing transaction.',
    });
  }
  removeStaging(entry.stagingRoot);
  transition(root, transactionId, STATES.ABORTED, { abortedAt: new Date().toISOString() });
  return { state: STATES.ABORTED };
}

/** Run one producer script and report its stderr on failure. */
// [::TICKET::] PX-278 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-278 --for-spec --no-implementation-order`.
function runNode(cwd, script, args) {
  try {
    execFileSync(process.execPath, [join(SCRIPTS_DIRECTORY, script), ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, stderr: '' };
  } catch (error) {
    return { ok: false, stderr: `${error.stderr ?? ''}${error.message}` };
  }
}

/** The single artifact at a root, or null. */
// [::TICKET::] PX-278 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-278 --for-spec --no-implementation-order`.
function findArtifact(root) {
  const candidates = readdirSync(root).filter((name) => name.endsWith(ARTIFACT_SUFFIX));
  return candidates.length === 1 ? join(root, candidates[0]) : null;
}

/** The default producer: tree, allocate, educe begin, views. */
export function runPipelineProducer({ stagingRoot, candidateSpec, resume = false }) {
  if (!resume) {
    const tree = runNode(stagingRoot, 'workspacify-tree/run.mjs', ['finalize', `--spec=${candidateSpec}`]);
    if (!tree.ok) return { state: STATES.DERIVE_FAILED, failedStep: 'workspacify-tree', stderr: tree.stderr };
    const allocate = runNode(stagingRoot, 'workspacify-allocate/run.mjs', ['finalize', join(stagingRoot, 'WORKSPACIFY-TREE-MANIFEST.json')]);
    if (!allocate.ok) return { state: STATES.DERIVE_FAILED, failedStep: 'workspacify-allocate', stderr: allocate.stderr };
    const educe = runNode(stagingRoot, 'educe-sequences/rail/phase.mjs', ['begin', candidateSpec]);
    if (!educe.ok) return { state: STATES.DERIVE_FAILED, failedStep: 'educe-sequences', stderr: educe.stderr };
  }
  const artifactPath = findArtifact(stagingRoot);
  if (artifactPath === null) {
    return { state: 'educe-pending', next: 'run the educe phases against the staging spec, then derive again' };
  }
  const treeManifest = JSON.parse(readFileSync(join(stagingRoot, 'WORKSPACIFY-TREE-MANIFEST.json'), 'utf8'));
  for (const pkg of treeManifest.workspace?.packages ?? []) {
    const view = runNode(stagingRoot, 'sequences-slice/run.mjs', [artifactPath, join(stagingRoot, pkg.path)]);
    if (!view.ok) return { state: STATES.DERIVE_FAILED, failedStep: `sequences-slice:${pkg.id}`, stderr: view.stderr };
  }
  return { state: STATES.DERIVED };
}

/** The default ground checks: the grill's mechanical gates over staging. */
export function runGrillGates({ stagingRoot }) {
  const commands = [
    ['grill-me-for-rfc/check-obligation-coverage.js', [stagingRoot]],
    ['grill-me-for-rfc/check-contribution-completeness.js', [stagingRoot]],
    ['grill-me-for-rfc/check-distribution-completeness.js', [stagingRoot]],
    ['grill-me-for-rfc/defect-report.js', ['--gate']],
  ];
  for (const [script, args] of commands) {
    const result = runNode(stagingRoot, script, args);
    if (!result.ok) return { ok: false, checked: commands.length, reason: `${script}: ${result.stderr}` };
  }
  return { ok: true, checked: commands.length };
}

/**
 * Derive the candidate in staging.
 *
 * @param {{ root: string, transactionId: string, runProducer?: Function }} input
 */
export function deriveGeneration({ root, transactionId, runProducer = runPipelineProducer }) {
  const entry = readEntry(root, transactionId);
  if (entry === null) {
    throw new RegenerationError(`transaction ${transactionId} is not in the ledger`, {
      code: 'UNKNOWN_TRANSACTION',
      path: root,
      repair: 'Open the transaction first.',
    });
  }
  try {
    const result = runProducer({
      root,
      transactionId,
      stagingRoot: entry.stagingRoot,
      candidateSpec: join(entry.stagingRoot, liveSpecPath(root)),
      resume: entry.pending !== undefined,
    });
    if (result.state === STATES.DERIVED) {
      transition(root, transactionId, STATES.DERIVED, { derivedAt: new Date().toISOString() });
    } else if (result.state === 'educe-pending') {
      transition(root, transactionId, STATES.OPEN, { pending: result.next });
    } else {
      transition(root, transactionId, STATES.DERIVE_FAILED, { failedStep: result.failedStep, error: result.stderr });
    }
    return result;
  } catch (error) {
    transition(root, transactionId, STATES.DERIVE_FAILED, { error: error.message });
    return { state: STATES.DERIVE_FAILED, error: error.message };
  }
}

/**
 * Verify the staged generation.
 *
 * @param {{ root: string, transactionId: string, runGrounds?: Function, runDetector?: Function }} input
 */
export function verifyGeneration({ root, transactionId, runGrounds = runGrillGates, runDetector }) {
  if (typeof runDetector !== 'function') {
    throw new RegenerationError('verification needs a detector', { code: 'DETECTOR_REQUIRED', path: root, repair: 'Pass runDetector when verifying a generation.' });
  }
  const entry = readEntry(root, transactionId);
  if (entry === null) {
    throw new RegenerationError(`transaction ${transactionId} is not in the ledger`, {
      code: 'UNKNOWN_TRANSACTION',
      path: root,
      repair: 'Open the transaction first.',
    });
  }
  if (entry.state === STATES.VERIFIED) {
    return { state: STATES.VERIFIED, receipt: entry.receipt ?? null };
  }
  const chain = verifyChain(entry.stagingRoot);
  if (!chain.ok) {
    const receipt = { chain, grounds: null, detector: null };
    transition(root, transactionId, STATES.DERIVED, { receipt });
    return { state: 'unverified', receipt };
  }
  const grounds = runGrounds({ stagingRoot: entry.stagingRoot });
  if (!grounds.ok) {
    const receipt = { chain, grounds, detector: null };
    transition(root, transactionId, STATES.JUDGMENT_REQUIRED, { receipt, reason: grounds.reason ?? 'a ground no longer resolves' });
    return { state: STATES.JUDGMENT_REQUIRED, receipt, reason: grounds.reason ?? 'a ground no longer resolves' };
  }
  const detector = runDetector({ root: entry.stagingRoot });
  const receipt = { chain, grounds, detector };
  if (detector.exitCode !== 0) {
    transition(root, transactionId, STATES.DERIVED, { receipt });
    return { state: 'unverified', receipt };
  }
  transition(root, transactionId, STATES.VERIFIED, { receipt, verifiedAt: new Date().toISOString() });
  return { state: STATES.VERIFIED, receipt };
}

/** The current transaction state and next action. */
export function describeStatus(root) {
  const ledger = readLedger(root);
  const active = activeTransaction(root);
  const entry = active ?? ledger.transactions.at(-1) ?? null;
  if (entry === null) return { state: 'none', next: 'open a transaction', transaction: null };
  return { state: entry.state, next: NEXT_ACTION[entry.state] ?? 'inspect the ledger', transaction: entry };
}

/** Whether a transaction is active; re-exported for the detector. */
export function hasActiveTransaction(root) {
  return ACTIVE_STATES.has(describeStatus(root).state);
}
