/**
 * The generation ledger.
 *
 * Every thaw and refreeze is recorded here: the reason, the baseline hashes, the
 * candidate, the staging and archive roots, the verification receipt and the terminal
 * state. The ledger is the record a consumer reads to decide whether the workspace is
 * in the middle of a transaction; it is not itself a design input.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { RegenerationError } from './errors.mjs';

export const REGENERATION_DIRECTORY = 'regeneration';
export const LEDGER_FILE_NAME = 'GENERATIONS.json';
export const LEDGER_SCHEMA_VERSION = 1;

export const STATES = Object.freeze({
  OPEN: 'open',
  DERIVED: 'derived',
  VERIFIED: 'verified',
  COMMITTING: 'committing',
  COMMITTED: 'committed',
  ABORTED: 'aborted',
  COMMIT_FAILED: 'commit-failed',
  DERIVE_FAILED: 'derive-failed',
  JUDGMENT_REQUIRED: 'judgment-required',
});

/** The states in which a transaction still owns the workspace. */
export const ACTIVE_STATES = Object.freeze(new Set([
  STATES.OPEN,
  STATES.DERIVED,
  STATES.VERIFIED,
  STATES.COMMITTING,
  STATES.JUDGMENT_REQUIRED,
]));

/** The ledger path. */
export function ledgerPath(root) {
  return join(root, REGENERATION_DIRECTORY, LEDGER_FILE_NAME);
}

/** Read the ledger, or the empty ledger when none exists. */
// [::TICKET::] PX-278 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-278 --for-spec --no-implementation-order`.
export function readLedger(root) {
  const path = ledgerPath(root);
  if (!existsSync(path)) return { schemaVersion: LEDGER_SCHEMA_VERSION, transactions: [] };
  try {
    const ledger = JSON.parse(readFileSync(path, 'utf8'));
    return {
      schemaVersion: ledger.schemaVersion ?? LEDGER_SCHEMA_VERSION,
      transactions: Array.isArray(ledger.transactions) ? ledger.transactions : [],
    };
  } catch (error) {
    throw new RegenerationError(`${LEDGER_FILE_NAME} is not valid JSON: ${path}`, {
      code: 'UNREADABLE_LEDGER',
      path,
      repair: `Repair the JSON in ${path}: ${error.message}`,
    });
  }
}

/** Write the ledger, creating the regeneration directory when needed. */
export function writeLedger(root, ledger) {
  mkdirSync(join(root, REGENERATION_DIRECTORY), { recursive: true });
  writeFileSync(ledgerPath(root), `${JSON.stringify(ledger, null, 2)}\n`);
  return ledgerPath(root);
}

/** Append one transaction entry. */
export function openEntry(root, entry) {
  const ledger = readLedger(root);
  ledger.transactions.push(entry);
  writeLedger(root, ledger);
  return entry;
}

/** Update one transaction in place and persist it. */
export function transition(root, transactionId, state, patch = {}) {
  const ledger = readLedger(root);
  const entry = ledger.transactions.find((candidate) => candidate.id === transactionId);
  if (entry === undefined) {
    throw new RegenerationError(`transaction ${transactionId} is not in the ledger`, {
      code: 'UNKNOWN_TRANSACTION',
      path: ledgerPath(root),
      repair: 'Open a transaction before deriving, verifying or committing it.',
    });
  }
  entry.state = state;
  Object.assign(entry, patch);
  writeLedger(root, ledger);
  return entry;
}

/** The transaction that currently owns the workspace, or null. */
export function activeTransaction(root) {
  const ledger = readLedger(root);
  for (let index = ledger.transactions.length - 1; index >= 0; index -= 1) {
    const entry = ledger.transactions[index];
    if (ACTIVE_STATES.has(entry.state)) return entry;
  }
  return null;
}

/** Refuse while a transaction owns the workspace. */
export function assertNoOpenTransaction(root) {
  const active = activeTransaction(root);
  if (active !== null) {
    throw new RegenerationError(`transaction ${active.id} is ${active.state}`, {
      code: 'TRANSACTION_OPEN',
      path: ledgerPath(root),
      repair: 'Finish the transaction (derive, verify, commit) or abort it before opening another.',
    });
  }
}

/** The last entry for one id, or null. */
export function readEntry(root, transactionId) {
  const ledger = readLedger(root);
  return ledger.transactions.find((candidate) => candidate.id === transactionId) ?? null;
}
