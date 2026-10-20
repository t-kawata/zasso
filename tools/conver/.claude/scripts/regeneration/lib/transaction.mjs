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

import { digestOf } from '../../educe-sequences/rail/load.mjs';
import { ARTIFACT_SUFFIX, verifyChain } from './chain.mjs';
import { commitGeneration, recoverCommit } from './commit.mjs';
import { RegenerationError } from './errors.mjs';
import {
  ACTIVE_STATES,
  STATES,
  TERMINAL_STATES,
  activeTransaction,
  assertNoOpenTransaction,
  openEntry,
  readEntry,
  readLedger,
  transition,
} from './ledger.mjs';
import {
  ALLOCATE_DECISIONS_PATH,
  TREE_DECISIONS_PATH,
  liveSpecPath,
  mergeAuthoredDocuments,
  prepareDerivationRoot,
  removeStaging,
  snapshotDesignFiles,
} from './staging.mjs';

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIRECTORY = join(MODULE_DIRECTORY, '..', '..');

const NEXT_CONTINUE = 'node .claude/scripts/regeneration/run.mjs continue';
const NEXT_DETECTOR = 'node .claude/scripts/smooth-sequences/run.mjs';

/** The next action a state names. */
const NEXT_ACTION = Object.freeze({
  [STATES.OPEN]: NEXT_CONTINUE,
  [STATES.DERIVED]: NEXT_CONTINUE,
  [STATES.VERIFIED]: NEXT_CONTINUE,
  [STATES.COMMITTING]: 'node .claude/scripts/regeneration/run.mjs recover',
  [STATES.JUDGMENT_REQUIRED]: 'resolve the named ground in staging with /grill-me-for-rfc or /explain-seed, then continue',
  [STATES.COMMIT_FAILED]: 'inspect the archive, then open a new transaction',
  [STATES.DERIVE_FAILED]: 'node .claude/scripts/regeneration/run.mjs abort, fix the candidate, then open a new transaction',
  [STATES.COMMITTED]: NEXT_DETECTOR,
  [STATES.ABORTED]: 'open a new transaction',
});

/** The educe command that settles a staged specification. */
// [::TICKET::] PX-280 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-280 --for-spec --no-implementation-order`.
function educeCommandFor(stagingSpecPath) {
  return `run .claude/commands/educe-sequences.md with ${stagingSpecPath}, then ${NEXT_CONTINUE}`;
}

/**
 * The AI command that owns a ground the mechanical gates could not settle.
 *
 * An RFC seed is settled by /explain-seed; every other ground is an RFC or
 * obligation the grill owns. The handoff never asks a human: the owning command
 * may ask direction questions under its own limit.
 */
export function groundHandoff({ stagingRoot, reason = 'a ground no longer resolves' }) {
  const ownsSeed = /RFC[- ]?SEED/i.test(reason);
  if (ownsSeed) {
    // /explain-seed takes one RFC-SEED.md path, not a directory.
    return `run .claude/commands/explain-seed.md on the RFC seed named in the ground under ${stagingRoot}, then ${NEXT_CONTINUE}`;
  }
  return `run .claude/commands/grill-me-for-rfc.md on ${stagingRoot}, then ${NEXT_CONTINUE}`;
}

/**
 * Translate a `phase.mjs through` refusal into the next action.
 *
 * A read phase refuses by design, so a non-zero exit is a handoff, not a derive
 * failure. The first stopped phase is named when the rail printed one; otherwise
 * the first stderr line is the reason.
 */
export function describeThroughHandoff({ exitCode, stdout = '', stderr = '' }, stagingSpecPath) {
  const stopped = stdout.split('\n').find((line) => /^phase\s+\d+\s+\[[a-z-]+\]\s+(FAIL|HALTED)/.test(line));
  if (stopped !== undefined) {
    const [phaseId, phaseTag, verdict] = stopped.match(/^phase\s+(\d+)\s+\[([a-z-]+)\]\s+(\w+)/).slice(1);
    return `phase.mjs through stopped at phase ${phaseId} [${phaseTag}] ${verdict}; ${educeCommandFor(stagingSpecPath)}`;
  }
  const reason = stderr.trim() || stdout.trim() || `exit ${exitCode}`;
  return `phase.mjs through refused: ${reason.split('\n')[0]}; ${educeCommandFor(stagingSpecPath)}`;
}

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

/** The hash of a file, or null when it does not exist. */
// [::TICKET::] PX-279 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-279 --for-spec --no-implementation-order`.
function hashIfPresent(path) {
  return existsSync(path) ? computeFileDigest(path) : null;
}

/** Refuse a candidate path a caller named but did not write. */
// [::TICKET::] PX-279 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-279 --for-spec --no-implementation-order`.
function assertCandidateExists(candidatePath) {
  if (candidatePath === null || candidatePath === undefined) return;
  if (existsSync(candidatePath)) return;
  throw new RegenerationError(`the candidate does not exist: ${candidatePath}`, {
    code: 'CANDIDATE_MISSING',
    path: candidatePath,
    repair: 'Write the candidate before opening the transaction.',
  });
}

/**
 * Resolve the three authored inputs and refuse a change set with no difference.
 *
 * The spec always participates because the chain records it. The two decisions
 * documents participate only when supplied; a missing live decisions document is a
 * null hash, so supplying one is a change.
 */
// [::TICKET::] PX-279 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-279 --for-spec --no-implementation-order`.
function resolveCandidateInputs({ root, candidateSpec, candidateAllocateDecisions, candidateTreeDecisions }) {
  const specRelativePath = liveSpecPath(root);
  const liveSpecPathAbs = join(root, specRelativePath);
  const liveTreeDecisions = join(root, TREE_DECISIONS_PATH);
  const liveAllocateDecisions = join(root, ALLOCATE_DECISIONS_PATH);
  const specPath = candidateSpec ?? liveSpecPathAbs;
  const treeDecisionsPath = candidateTreeDecisions ?? liveTreeDecisions;
  const allocateDecisionsPath = candidateAllocateDecisions ?? liveAllocateDecisions;

  assertCandidateExists(candidateSpec);
  assertCandidateExists(candidateTreeDecisions);
  assertCandidateExists(candidateAllocateDecisions);

  const specHash = computeFileDigest(specPath);
  const treeDecisionsHash = hashIfPresent(treeDecisionsPath);
  const allocateDecisionsHash = hashIfPresent(allocateDecisionsPath);
  const changedInputs = [];
  if (specHash !== hashIfPresent(liveSpecPathAbs)) changedInputs.push('spec');
  if (treeDecisionsHash !== hashIfPresent(liveTreeDecisions)) changedInputs.push('tree-decisions');
  if (allocateDecisionsHash !== hashIfPresent(liveAllocateDecisions)) changedInputs.push('allocate-decisions');
  if (changedInputs.length === 0) {
    throw new RegenerationError('no candidate differs from the live input', {
      code: 'NO_CHANGE',
      path: root,
      repair: 'Change at least one candidate before opening a generation.',
    });
  }
  return {
    specPath,
    specRelativePath,
    specHash,
    treeDecisionsPath,
    treeDecisionsHash,
    allocateDecisionsPath,
    allocateDecisionsHash,
    changedInputs,
  };
}

/**
 * Open a transaction from a valid baseline.
 *
 * @param {{ root: string, candidateSpec?: string, candidateAllocateDecisions?: string, candidateTreeDecisions?: string, reason: string }} input
 * @returns {{ transactionId: string, stagingRoot: string, stagingSpecPath: string }}
 */
export function openTransaction({ root, candidateSpec, candidateAllocateDecisions, candidateTreeDecisions, reason }) {
  assertThawable({ root, reason });
  const candidates = resolveCandidateInputs({ root, candidateSpec, candidateAllocateDecisions, candidateTreeDecisions });
  const transactionId = newTransactionId();
  const base = snapshotDesignFiles(root);
  const { stagingRoot } = prepareDerivationRoot({ root, candidates, transactionId });
  openEntry(root, {
    id: transactionId,
    state: STATES.OPEN,
    reason,
    openedAt: new Date().toISOString(),
    candidateSpec: candidateSpec ?? null,
    candidateHash: candidates.specHash,
    candidateAllocateDecisions: candidateAllocateDecisions ?? null,
    candidateAllocateDecisionsHash: candidates.allocateDecisionsHash,
    candidateTreeDecisions: candidateTreeDecisions ?? null,
    candidateTreeDecisionsHash: candidates.treeDecisionsHash,
    changedInputs: candidates.changedInputs,
    specRelativePath: candidates.specRelativePath,
    stagingRoot,
    archiveRoot: join(root, 'regeneration', 'archive', transactionId),
    base,
  });
  return { transactionId, stagingRoot, stagingSpecPath: join(stagingRoot, candidates.specRelativePath) };
}


/** Refuse a thaw that cannot safely start. */
// [::TICKET::] PX-278, PX-279 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-278|PX-279) --for-spec --no-implementation-order`.
function assertThawable({ root, reason }) {
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
}

/** Refuse an action that would rewrite a committed or aborted record. */
// [::TICKET::] PX-279 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-279 --for-spec --no-implementation-order`.
function assertMutable(entry) {
  if (!TERMINAL_STATES.has(entry.state)) return;
  throw new RegenerationError(`transaction ${entry.id} is ${entry.state}`, {
    code: 'TRANSACTION_TERMINAL',
    path: entry.stagingRoot ?? entry.id,
    repair: 'Open a new transaction; a terminal transaction is a record, not an edit surface.',
  });
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
  assertMutable(entry);
  removeStaging(entry.stagingRoot);
  transition(root, transactionId, STATES.ABORTED, { abortedAt: new Date().toISOString() });
  return { state: STATES.ABORTED };
}

/** Run one producer script and report its stderr on failure. */
// [::TICKET::] PX-278, PX-280 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-278|PX-280) --for-spec --no-implementation-order`.
function runNode(cwd, script, args) {
  try {
    const stdout = execFileSync(process.execPath, [join(SCRIPTS_DIRECTORY, script), ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, stdout, stderr: '' };
  } catch (error) {
    return { ok: false, stdout: error.stdout ?? '', stderr: `${error.stderr ?? ''}${error.message}` };
  }
}

/**
 * The artifact that records the staged spec, or the reason none does.
 *
 * The educe product path names the artifact after the spec, but a decisions-only
 * regeneration inherits the live artifact. The raw digest is the same function the
 * chain uses, so an artifact the chain would reject is never reported current.
 */
// [::TICKET::] PX-279 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-279 --for-spec --no-implementation-order`.
export function readArtifactCurrency({ stagingRoot, specPath }) {
  const names = readdirSync(stagingRoot).filter((name) => name.endsWith(ARTIFACT_SUFFIX));
  if (names.length === 0) return { state: 'missing' };
  if (names.length > 1) return { state: 'ambiguous', reason: `multiple artifacts: ${names.sort().join(', ')}` };
  const artifactPath = join(stagingRoot, names[0]);
  let artifact;
  try {
    artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
  } catch (error) {
    return { state: 'stale', reason: `${names[0]} is not valid JSON: ${error.message}` };
  }
  return artifact?.spec?.sha256 === digestOf(specPath)
    ? { state: 'current', artifactPath }
    : { state: 'stale', artifactPath };
}

/** Run the one-time setup: tree, allocate, educe begin and the authored-document merge. */
// [::TICKET::] PX-279 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-279 --for-spec --no-implementation-order`.
function runSetup({ root, stagingRoot, candidateSpec }) {
  const tree = runNode(stagingRoot, 'workspacify-tree/run.mjs', ['finalize', `--spec=${candidateSpec}`]);
  if (!tree.ok) return { ok: false, failure: { state: STATES.DERIVE_FAILED, setupDone: false, failedStep: 'workspacify-tree', stderr: tree.stderr } };

  const treeManifestPath = join(stagingRoot, 'WORKSPACIFY-TREE-MANIFEST.json');
  const allocate = runNode(stagingRoot, 'workspacify-allocate/run.mjs', ['finalize', treeManifestPath]);
  if (!allocate.ok) return { ok: false, failure: { state: STATES.DERIVE_FAILED, setupDone: false, failedStep: 'workspacify-allocate', stderr: allocate.stderr } };

  const educe = runNode(stagingRoot, 'educe-sequences/rail/phase.mjs', ['begin', candidateSpec]);
  if (!educe.ok) return { ok: false, failure: { state: STATES.DERIVE_FAILED, setupDone: false, failedStep: 'educe-sequences', stderr: educe.stderr } };

  const treeManifest = JSON.parse(readFileSync(treeManifestPath, 'utf8'));
  mergeAuthoredDocuments({ root, stagingRoot, treeManifest });
  return { ok: true, treeManifest };
}

/** Project every package view from the current artifact. */
// [::TICKET::] PX-279 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-279 --for-spec --no-implementation-order`.
function runPackageViews({ stagingRoot, treeManifest, artifactPath }) {
  for (const pkg of treeManifest.workspace?.packages ?? []) {
    const view = runNode(stagingRoot, 'sequences-slice/run.mjs', [artifactPath, join(stagingRoot, pkg.path)]);
    if (!view.ok) return { ok: false, failedStep: `sequences-slice:${pkg.id}`, stderr: view.stderr };
  }
  return { ok: true };
}

/**
 * The default producer: one setup, then artifact currency, then the views.
 *
 * Setup runs once per transaction. A later derive, after the educe handoff or after
 * a verify failure, skips it because the staging manifests now exist and the
 * producers would refuse to publish over them.
 */
export function runPipelineProducer({ root, stagingRoot, candidateSpec, resume = false }) {
  let treeManifest;
  if (resume) {
    const treeManifestPath = join(stagingRoot, 'WORKSPACIFY-TREE-MANIFEST.json');
    if (!existsSync(treeManifestPath)) {
      return { state: STATES.DERIVE_FAILED, setupDone: false, failedStep: 'setup', stderr: 'the setup manifest is missing; abort and open a new transaction' };
    }
    treeManifest = JSON.parse(readFileSync(treeManifestPath, 'utf8'));
  } else {
    const setup = runSetup({ root, stagingRoot, candidateSpec });
    if (!setup.ok) return setup.failure;
    treeManifest = setup.treeManifest;
  }

  let artifact = readArtifactCurrency({ stagingRoot, specPath: candidateSpec });
  if (artifact.state === 'missing' || artifact.state === 'stale') {
    // The rail performs every deterministic phase and stops at the first read
    // phase; a non-zero exit is therefore the handoff, not a producer failure.
    const through = runNode(stagingRoot, 'educe-sequences/rail/phase.mjs', ['through', candidateSpec]);
    artifact = readArtifactCurrency({ stagingRoot, specPath: candidateSpec });
    if (artifact.state === 'missing' || artifact.state === 'stale') {
      return {
        state: 'educe-pending',
        setupDone: true,
        stagingSpecPath: candidateSpec,
        next: through.ok
          ? `phase.mjs through completed without an artifact; ${educeCommandFor(candidateSpec)}`
          : describeThroughHandoff(through, candidateSpec),
      };
    }
  }
  if (artifact.state === 'ambiguous') {
    return { state: STATES.DERIVE_FAILED, setupDone: true, failedStep: 'artifact', stderr: artifact.reason };
  }

  const views = runPackageViews({ stagingRoot, treeManifest, artifactPath: artifact.artifactPath });
  if (!views.ok) return { state: STATES.DERIVE_FAILED, setupDone: true, failedStep: views.failedStep, stderr: views.stderr };
  return { state: STATES.DERIVED, setupDone: true };
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
  assertMutable(entry);
  try {
    const result = runProducer({
      root,
      transactionId,
      stagingRoot: entry.stagingRoot,
      candidateSpec: join(entry.stagingRoot, entry.specRelativePath ?? liveSpecPath(root)),
      resume: entry.setupDone === true,
    });
    const setupDone = result.setupDone ?? (result.state !== STATES.DERIVE_FAILED);
    if (setupDone === true) transition(root, transactionId, entry.state, { setupDone: true });
    if (result.state === STATES.DERIVED) {
      transition(root, transactionId, STATES.DERIVED, { derivedAt: new Date().toISOString(), pending: undefined });
    } else if (result.state === 'educe-pending') {
      transition(root, transactionId, STATES.OPEN, {
        pending: result.next,
        stagingSpecPath: result.stagingSpecPath ?? join(entry.stagingRoot, entry.specRelativePath ?? liveSpecPath(root)),
      });
    } else {
      transition(root, transactionId, STATES.DERIVE_FAILED, { failedStep: result.failedStep, error: result.stderr, pending: undefined });
    }
    return result;
  } catch (error) {
    transition(root, transactionId, STATES.DERIVE_FAILED, { error: error.message });
    return { state: STATES.DERIVE_FAILED, error: error.message };
  }
}

/** Refuse a staged authored input that no longer matches the candidate recorded at open. */
// [::TICKET::] PX-279 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-279 --for-spec --no-implementation-order`.
function assertStagedCandidatesMatch(entry) {
  const specRelativePath = entry.specRelativePath ?? liveSpecPath(entry.stagingRoot);
  const mismatches = [];
  if (computeFileDigest(join(entry.stagingRoot, specRelativePath)) !== entry.candidateHash) mismatches.push('spec');
  if (entry.candidateTreeDecisionsHash !== undefined
    && hashIfPresent(join(entry.stagingRoot, TREE_DECISIONS_PATH)) !== entry.candidateTreeDecisionsHash) mismatches.push('tree-decisions');
  if (entry.candidateAllocateDecisionsHash !== undefined
    && hashIfPresent(join(entry.stagingRoot, ALLOCATE_DECISIONS_PATH)) !== entry.candidateAllocateDecisionsHash) mismatches.push('allocate-decisions');
  if (mismatches.length > 0) {
    throw new RegenerationError(`the staged input changed after open: ${mismatches.join(', ')}`, {
      code: 'CANDIDATE_CHANGED',
      path: entry.stagingRoot,
      repair: 'Abort, edit the candidate, then open a new transaction.',
    });
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
  assertMutable(entry);
  if (entry.state === STATES.VERIFIED) {
    return { state: STATES.VERIFIED, receipt: entry.receipt ?? null };
  }
  assertStagedCandidatesMatch(entry);
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
  transition(root, transactionId, STATES.VERIFIED, {
    receipt,
    verifiedAt: new Date().toISOString(),
    verifiedSnapshot: snapshotDesignFiles(entry.stagingRoot),
  });
  return { state: STATES.VERIFIED, receipt };
}

/** Whether the entry's last verification receipt records a failure. */
// [::TICKET::] PX-280 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-280 --for-spec --no-implementation-order`.
function receiptFailed(entry) {
  const chainFailed = entry.receipt?.chain !== undefined && entry.receipt.chain !== null && entry.receipt.chain.ok === false;
  const detectorFailed = entry.receipt?.detector !== undefined && entry.receipt.detector !== null && entry.receipt.detector.exitCode !== 0;
  return chainFailed || detectorFailed;
}

/** The exact next command for one entry, including a failed verification. */
// [::TICKET::] PX-279, PX-280 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-279|PX-280) --for-spec --no-implementation-order`.
function nextCommandFor(entry) {
  if (entry.state === STATES.JUDGMENT_REQUIRED) return groundHandoff(entry);
  if (entry.state === STATES.DERIVED && entry.receipt !== undefined && receiptFailed(entry)) {
    return NEXT_ACTION[STATES.OPEN];
  }
  return NEXT_ACTION[entry.state] ?? 'inspect the ledger';
}

/** A terminal entry, returned without rewriting the ledger. */
// [::TICKET::] PX-280 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-280 --for-spec --no-implementation-order`.
function terminalResult(entry, transactionId) {
  return {
    state: entry.state,
    next: NEXT_ACTION[entry.state],
    transactionId,
    stagingSpecPath: entry.stagingRoot ?? null,
    receipt: entry.receipt ?? null,
  };
}

/**
 * Drive a transaction to its next handoff or to a terminal state.
 *
 * This is orchestration over derive, verify and commit; it adds no writer. A
 * handoff is not a failure: the caller runs `next` and calls continue again.
 */
export function continueTransaction(options) {
  const {
    root,
    transactionId,
    runProducer = runPipelineProducer,
    runGrounds = runGrillGates,
    runDetector,
  } = options;
  if (typeof runDetector !== 'function') {
    throw new RegenerationError('continue needs a detector', {
      code: 'DETECTOR_REQUIRED',
      path: root,
      repair: 'Pass runDetector when continuing a transaction.',
    });
  }
  let entry = readEntry(root, transactionId);
  if (entry === null) {
    throw new RegenerationError(`transaction ${transactionId} is not in the ledger`, {
      code: 'UNKNOWN_TRANSACTION',
      path: root,
      repair: 'Open the transaction first.',
    });
  }
  if (TERMINAL_STATES.has(entry.state)) return terminalResult(entry, transactionId);

  if (entry.state === STATES.COMMITTING) {
    recoverCommit(root);
    entry = readEntry(root, transactionId);
    if (TERMINAL_STATES.has(entry.state)) return terminalResult(entry, transactionId);
  }
  if (entry.state === STATES.JUDGMENT_REQUIRED) {
    // The AI settles the ground in staging, then calls continue again. Verify
    // is the only way to observe that settlement; a still-broken ground returns
    // the same handoff, never a stop.
    const reverified = verifyGeneration({ root, transactionId, runGrounds, runDetector });
    if (reverified.state === STATES.JUDGMENT_REQUIRED) {
      return {
        state: reverified.state,
        next: groundHandoff({ stagingRoot: entry.stagingRoot, reason: reverified.reason }),
        transactionId,
        stagingSpecPath: entry.stagingRoot ?? null,
        receipt: reverified.receipt,
      };
    }
    if (reverified.state === 'unverified') {
      return {
        state: 'unverified',
        next: NEXT_ACTION[STATES.OPEN],
        transactionId,
        stagingSpecPath: entry.stagingRoot ?? null,
        receipt: reverified.receipt,
      };
    }
    entry = readEntry(root, transactionId);
  }

  // A failed setup is not retried: the producer may have left a populated
  // staging directory, and the documented repair is abort, fix the candidate,
  // then open again.
  const needsDerive = entry.state === STATES.OPEN
    || (entry.state === STATES.DERIVED && receiptFailed(entry));
  if (needsDerive) {
    const derived = deriveGeneration({ root, transactionId, runProducer });
    if (derived.state === 'educe-pending') {
      const stagingSpecPath = derived.stagingSpecPath ?? null;
      const next = typeof derived.next === 'string' && derived.next.includes('educe-sequences.md')
        ? derived.next
        : educeCommandFor(stagingSpecPath ?? 'the staged specification');
      return {
        state: 'educe-pending',
        next,
        transactionId,
        stagingSpecPath,
        receipt: null,
      };
    }
    if (derived.state === STATES.DERIVE_FAILED) {
      return {
        state: STATES.DERIVE_FAILED,
        next: NEXT_ACTION[STATES.DERIVE_FAILED],
        transactionId,
        stagingSpecPath: null,
        receipt: null,
      };
    }
    entry = readEntry(root, transactionId);
  }

  if (entry.state === STATES.DERIVED) {
    const verified = verifyGeneration({ root, transactionId, runGrounds, runDetector });
    if (verified.state === 'unverified') {
      return {
        state: 'unverified',
        next: NEXT_ACTION[STATES.OPEN],
        transactionId,
        stagingSpecPath: entry.stagingRoot ?? null,
        receipt: verified.receipt,
      };
    }
    if (verified.state === STATES.JUDGMENT_REQUIRED) {
      return {
        state: STATES.JUDGMENT_REQUIRED,
        next: groundHandoff({ stagingRoot: entry.stagingRoot, reason: verified.reason }),
        transactionId,
        stagingSpecPath: entry.stagingRoot ?? null,
        receipt: verified.receipt,
      };
    }
    entry = readEntry(root, transactionId);
  }

  if (entry.state === STATES.VERIFIED) {
    try {
      const committed = commitGeneration({
        root,
        transactionId,
        runDetector: ({ root: target }) => runDetector({ root: target, allowTransaction: transactionId }),
      });
      return {
        state: committed.state,
        next: NEXT_DETECTOR,
        transactionId,
        stagingSpecPath: null,
        receipt: readEntry(root, transactionId)?.receipt ?? null,
      };
    } catch (error) {
      const failed = readEntry(root, transactionId);
      if (failed?.state === STATES.COMMIT_FAILED) {
        return {
          state: STATES.COMMIT_FAILED,
          next: NEXT_ACTION[STATES.COMMIT_FAILED],
          transactionId,
          stagingSpecPath: failed.stagingRoot ?? null,
          receipt: failed.receipt ?? null,
        };
      }
      throw error;
    }
  }

  return {
    state: entry.state,
    next: nextCommandFor(entry),
    transactionId,
    stagingSpecPath: entry.stagingRoot ?? null,
    receipt: entry.receipt ?? null,
  };
}

/** The current transaction state and next action. */
export function describeStatus(root) {
  const ledger = readLedger(root);
  const active = activeTransaction(root);
  const entry = active ?? ledger.transactions.at(-1) ?? null;
  if (entry === null) return { state: 'none', next: 'open a transaction', transaction: null, stagingSpecPath: null };
  const stagingSpecPath = entry.stagingRoot !== undefined
    ? join(entry.stagingRoot, entry.specRelativePath ?? liveSpecPath(entry.stagingRoot))
    : null;
  return {
    state: entry.state,
    next: entry.pending ?? nextCommandFor(entry),
    transaction: entry,
    stagingSpecPath,
  };
}

/** Whether a transaction is active; re-exported for the detector. */
export function hasActiveTransaction(root) {
  return ACTIVE_STATES.has(describeStatus(root).state);
}
