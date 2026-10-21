/**
 * Commit a verified generation, or restore the old one.
 *
 * Commit is the only writer of the live design files. It journals the target list and
 * the backups first, writes each staged file through an atomic temp-and-rename, and
 * verifies the chain and the detector after the write. Any failure restores every
 * target from its backup byte-identically. A journal left by a crash is resolved by
 * recoverCommit before a consumer reads.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as nodeFs from 'node:fs';
import { dirname, join } from 'node:path';

import { digestOf } from '../../educe-sequences/rail/load.mjs';
import { readDebtBaseline } from '../../smooth-sequences/lib/report.mjs';
import { readUnresolvedReadingSubjects } from '../../smooth-sequences/lib/readings-summary.mjs';
import { verifyChain } from './chain.mjs';
import { computeDebtIncrease, debtOfDetectorReport, debtOfReadings, summarizeDebt } from './debt.mjs';
import { RegenerationError } from './errors.mjs';
import { STATES, readEntry, transition } from './ledger.mjs';
import { ANNOTATIONS_FILE_NAME, collectDesignFiles, removeStaging, snapshotDesignFiles } from './staging.mjs';

export const JOURNAL_FILE_NAME = 'COMMIT-JOURNAL.json';
export const JOURNAL_STATES = Object.freeze({ PREPARED: 'prepared', APPLYING: 'applying', VERIFYING: 'verifying' });
export const JOURNAL_SCHEMA_VERSION = 1;

let tempCounter = 0;

/** The journal path. */
export function commitJournalPath(root) {
  return join(root, 'regeneration', JOURNAL_FILE_NAME);
}

/** Read the journal, or null when none exists. */
export function readCommitJournal(root) {
  const path = commitJournalPath(root);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Write the journal atomically. */
export function writeCommitJournal(root, journal) {
  const path = commitJournalPath(root);
  mkdirSync(dirname(path), { recursive: true });
  atomicWrite(nodeFs, path, Buffer.from(`${JSON.stringify({ schemaVersion: JOURNAL_SCHEMA_VERSION, ...journal }, null, 2)}\n`));
}

/** Write through a temp file beside the target, then rename over it. */
// [::TICKET::] PX-278, PX-279 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-278|PX-279) --for-spec --no-implementation-order`.
function atomicWrite(fileSystem, target, bytes) {
  mkdirSync(dirname(target), { recursive: true });
  tempCounter += 1;
  const temporaryPath = `${target}.${process.pid}.${tempCounter}.tmp`;
  try {
    fileSystem.writeFileSync(temporaryPath, bytes);
    fileSystem.renameSync(temporaryPath, target);
  } catch (error) {
    try {
      nodeFs.rmSync(temporaryPath, { force: true });
    } catch {
      // The temp file is already gone; the original failure is the one to report.
    }
    throw error;
  }
}

/** The union of the live and staged design paths. */
// [::TICKET::] PX-278 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-278 --for-spec --no-implementation-order`.
function collectTargetPaths(root, stagingRoot) {
  return [...new Set([...collectDesignFiles(root), ...collectDesignFiles(stagingRoot)])].sort();
}

/** Back up every existing target, returning the journal targets. */
// [::TICKET::] PX-278 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-278 --for-spec --no-implementation-order`.
function backupTargets(root, stagingRoot, archiveRoot) {
  return collectTargetPaths(root, stagingRoot).map((path) => {
    const livePath = join(root, path);
    const existed = existsSync(livePath);
    const backupPath = existed ? join(archiveRoot, path) : null;
    if (existed) {
      mkdirSync(dirname(backupPath), { recursive: true });
      nodeFs.copyFileSync(livePath, backupPath);
    }
    return { path, existed, backupPath };
  });
}

/** Restore every target from its backup, or remove a file that did not exist. */
// [::TICKET::] PX-278 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-278 --for-spec --no-implementation-order`.
function rollbackTargets(root, journal) {
  for (const target of journal.targets) {
    const livePath = join(root, target.path);
    if (target.existed) {
      if (target.backupPath === null || !existsSync(target.backupPath)) {
        throw new RegenerationError(`the backup for ${target.path} is missing`, {
          code: 'JOURNAL_INCOMPLETE',
          path: livePath,
          repair: 'Restore the generation from the archived copy before continuing.',
        });
      }
      atomicWrite(nodeFs, livePath, readFileSync(target.backupPath));
    } else {
      rmSync(livePath, { force: true });
    }
  }
  rmSync(commitJournalPath(root), { force: true });
}

/**
 * Commit the verified generation.
 *
 * @param {{ root: string, transactionId: string, fileSystem?: object, runDetector: Function }} input
 * @returns {{ state: string, archiveRoot: string }}
 */
export function commitGeneration({ root, transactionId, fileSystem = nodeFs, runDetector }) {
  const entry = requireVerifiedEntry(root, transactionId, runDetector);
  const baseline = readDebtBaseline(root);
  const journal = prepareCommit(root, entry, baseline);
  try {
    applyTargets(root, entry.stagingRoot, journal, fileSystem);
    const increase = verifyCommitted(root, journal, runDetector, baseline);
    finishCommit(root, transactionId, entry, journal, { baseline: summarizeDebt(baseline), increase });
    return { state: STATES.COMMITTED, archiveRoot: journal.archiveRoot };
  } catch (error) {
    rollbackTargets(root, journal);
    transition(root, transactionId, STATES.COMMIT_FAILED, { error: error.message, failedAt: new Date().toISOString() });
    if (error instanceof RegenerationError && error.code === 'COMMIT_ROLLED_BACK') throw error;
    throw new RegenerationError(`commit failed and rolled back: ${error.message}`, {
      code: 'COMMIT_ROLLED_BACK',
      path: root,
      repair: 'The old generation was restored byte-identically.',
    });
  }
}

/** The entry a commit may act on, or a refusal that names why not. */
// [::TICKET::] PX-278, PX-279 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-278|PX-279) --for-spec --no-implementation-order`.
// [::TICKET::] PX-287 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-287 --for-spec --no-implementation-order`.
function requireVerifiedEntry(root, transactionId, runDetector) {
  const entry = readEntry(root, transactionId);
  if (entry === null) {
    throw new RegenerationError(`transaction ${transactionId} is not in the ledger`, {
      code: 'UNKNOWN_TRANSACTION',
      path: root,
      repair: 'Open and verify the transaction before committing it.',
    });
  }
  if (entry.state !== STATES.VERIFIED) {
    throw new RegenerationError(`transaction ${transactionId} is ${entry.state}, not verified`, {
      code: 'UNVERIFIED_GENERATION',
      path: root,
      repair: 'Derive and verify the staging generation before committing it.',
    });
  }
  if (typeof runDetector !== 'function') {
    throw new RegenerationError('commit needs a detector', {
      code: 'DETECTOR_REQUIRED',
      path: root,
      repair: 'Pass runDetector when committing a generation.',
    });
  }
  if (entry.verifiedSnapshot === undefined) {
    throw new RegenerationError('the transaction has no verified snapshot', {
      code: 'UNVERIFIED_GENERATION',
      path: root,
      repair: 'Run verify before commit.',
    });
  }
  if (JSON.stringify(snapshotDesignFiles(entry.stagingRoot)) !== JSON.stringify(entry.verifiedSnapshot)) {
    throw new RegenerationError('the staging tree changed after verify', {
      code: 'STAGING_CHANGED',
      path: entry.stagingRoot,
      repair: 'Abort, reopen, and verify the new generation.',
    });
  }
  if (JSON.stringify(snapshotDesignFiles(root)) !== JSON.stringify(entry.base)) {
    throw new RegenerationError('the live baseline changed since open', {
      code: 'BASELINE_CHANGED',
      path: root,
      repair: 'Abort this transaction and open a new one from the current baseline.',
    });
  }
  if (entry.candidateAnnotationsHash !== undefined && entry.candidateAnnotationsHash !== null) {
    const stagedAnnotations = join(entry.stagingRoot, ANNOTATIONS_FILE_NAME);
    if (!existsSync(stagedAnnotations) || digestOf(stagedAnnotations) !== entry.candidateAnnotationsHash) {
      throw new RegenerationError('the staged annotations changed after open', {
        code: 'CANDIDATE_CHANGED',
        path: entry.stagingRoot,
        repair: 'Abort, restore the annotations candidate, and open a new transaction.',
      });
    }
  }
  return entry;
}

/** Back up the live targets and write the prepared journal. */
// [::TICKET::] PX-278, PX-287 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-278|PX-287) --for-spec --no-implementation-order`.
function prepareCommit(root, entry, baseline) {
  mkdirSync(entry.archiveRoot, { recursive: true });
  const stagedAnnotations = join(entry.stagingRoot, ANNOTATIONS_FILE_NAME);
  if (existsSync(stagedAnnotations)) {
    copyFileSync(stagedAnnotations, join(entry.archiveRoot, ANNOTATIONS_FILE_NAME));
  }
  const journal = {
    transactionId: entry.id,
    state: JOURNAL_STATES.PREPARED,
    archiveRoot: entry.archiveRoot,
    debtBaseline: summarizeDebt(baseline),
    annotationsHash: entry.candidateAnnotationsHash ?? null,
    targets: backupTargets(root, entry.stagingRoot, entry.archiveRoot),
  };
  writeCommitJournal(root, journal);
  transition(root, entry.id, STATES.COMMITTING, { committingAt: new Date().toISOString() });
  return journal;
}

/** Write every staged target over its live counterpart. */
// [::TICKET::] PX-278 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-278 --for-spec --no-implementation-order`.
function applyTargets(root, stagingRoot, journal, fileSystem) {
  journal.state = JOURNAL_STATES.APPLYING;
  writeCommitJournal(root, journal);
  for (const target of journal.targets) {
    const stagedPath = join(stagingRoot, target.path);
    if (existsSync(stagedPath)) atomicWrite(fileSystem, join(root, target.path), readFileSync(stagedPath));
  }
}

/** Verify the live chain and the detector after the write. */
// [::TICKET::] PX-278, PX-287 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-278|PX-287) --for-spec --no-implementation-order`.
function verifyCommitted(root, journal, runDetector, baseline) {
  journal.state = JOURNAL_STATES.VERIFYING;
  writeCommitJournal(root, journal);
  const chain = verifyChain(root);
  const detector = runDetector({ root });
  const liveReadings = readUnresolvedReadingSubjects(root);
  const stagingDebt = {
    ...debtOfDetectorReport(detector),
    ...debtOfReadings({
      subjects: liveReadings.subjects,
      count: liveReadings.count,
      withheldCount: detector.readings?.withheld?.length ?? liveReadings.withheldCount,
      present: liveReadings.present,
    }),
  };
  const increase = computeDebtIncrease({ baseline, staging: stagingDebt });
  if (chain.ok && !increase.increased) return increase;
  const detail = !chain.ok
    ? `post-commit chain failed: ${chain.links.filter((link) => !link.ok).map((link) => link.code).join(', ')}`
    : `post-commit debt increased: ${increase.newFindings[0] ?? increase.newBlocked[0] ?? increase.newReadingSubjects[0] ?? 'reading count'}`;
  throw new RegenerationError(detail, { code: 'COMMIT_ROLLED_BACK', path: root, repair: 'The old generation was restored.' });
}

/** Close the journal, record the commit and discard staging. */
// [::TICKET::] PX-278, PX-287 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-278|PX-287) --for-spec --no-implementation-order`.
function finishCommit(root, transactionId, entry, journal, debt) {
  rmSync(commitJournalPath(root), { force: true });
  transition(root, transactionId, STATES.COMMITTED, { committedAt: new Date().toISOString(), debt });
  removeStaging(entry.stagingRoot);
  return journal;
}

/**
 * Resolve a journal left by an interrupted commit.
 *
 * @param {string} root
 * @returns {{ state: 'none'|'completed'|'rolled-back' }}
 */
export function recoverCommit(root) {
  const journal = readCommitJournal(root);
  if (journal === null) return { state: 'none' };
  if (journal.state === JOURNAL_STATES.VERIFYING && verifyChain(root).ok) {
    const entry = readEntry(root, journal.transactionId);
    rmSync(commitJournalPath(root), { force: true });
    transition(root, journal.transactionId, STATES.COMMITTED, { recoveredAt: new Date().toISOString() });
    if (entry?.stagingRoot !== undefined) removeStaging(entry.stagingRoot);
    return { state: 'completed' };
  }
  rollbackTargets(root, journal);
  transition(root, journal.transactionId, STATES.COMMIT_FAILED, { recoveredAt: new Date().toISOString() });
  return { state: 'rolled-back' };
}
