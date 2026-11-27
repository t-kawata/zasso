'use strict';

/**
 * store.js — the ledger is the single source of truth.
 *
 * Writes go through a sibling temp file and a rename, so an interrupted process
 * leaves the previous ledger intact. Markdown is always derived from JSON and is
 * never read back.
 */

const fs = require('node:fs');
const path = require('node:path');

const criteria = require('./criteria.js');

const LEDGER_FILE = 'CONVER-UPDATE-CANDIDATES.json';
const MARKDOWN_FILE = 'CONVER-UPDATE-CANDIDATES.md';
const LEDGER_KEYS = Object.freeze([
  'schemaVersion',
  'criteriaVersion',
  'workspace',
  'claudeDir',
  'upstreamRef',
  'generatedAt',
  'candidates',
]);
const CANDIDATE_ID_PATTERN = /^CUC-(\d+)$/;
const DETERMINISTIC_GENERATED_AT = '1970-01-01T00:00:00.000Z';

// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function ledgerPath(workspace) {
  return path.join(path.resolve(workspace), LEDGER_FILE);
}

// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function markdownPath(workspace) {
  return path.join(path.resolve(workspace), MARKDOWN_FILE);
}

/** A new ledger with a deterministic timestamp so an unchanged ledger re-saves byte-identically. */
// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function emptyLedger({ workspace, claudeDir, upstreamRef }) {
  return {
    schemaVersion: criteria.SCHEMA_VERSION,
    criteriaVersion: criteria.CRITERIA_VERSION,
    workspace: path.resolve(workspace),
    claudeDir: path.resolve(claudeDir),
    upstreamRef,
    generatedAt: DETERMINISTIC_GENERATED_AT,
    candidates: [],
  };
}

/** The next free CUC id, derived from the maximum existing id rather than the length. */
// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function allocateId(ledger) {
  let maximum = 0;
  for (const candidate of ledger.candidates || []) {
    const match = CANDIDATE_ID_PATTERN.exec(String(candidate.id || ''));
    if (match) maximum = Math.max(maximum, Number(match[1]));
  }
  return 'CUC-' + String(maximum + 1).padStart(4, '0');
}

/** Reject a ledger that would corrupt the sidecar before any byte is written. */
// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function validateLedgerShape(ledger) {
  if (!ledger || typeof ledger !== 'object') return 'ledger must be an object';
  if (!Array.isArray(ledger.candidates)) return 'ledger.candidates must be an array';
  if (!Number.isInteger(ledger.schemaVersion)) return 'ledger.schemaVersion must be an integer';
  if (typeof ledger.criteriaVersion !== 'string') return 'ledger.criteriaVersion must be a string';
  if (typeof ledger.workspace !== 'string') return 'ledger.workspace must be a string';
  if (typeof ledger.claudeDir !== 'string') return 'ledger.claudeDir must be a string';
  if (typeof ledger.upstreamRef !== 'string') return 'ledger.upstreamRef must be a string';
  if (typeof ledger.generatedAt !== 'string') return 'ledger.generatedAt must be a string';
  return null;
}

/** Write through a temp file and rename; a failed rename leaves the original intact. */
// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function writeAtomically(target, contents, renameImpl) {
  const tempPath = target + '.tmp-' + process.pid + '-' + Date.now();
  try {
    fs.writeFileSync(tempPath, contents, 'utf8');
    renameImpl(tempPath, target);
    return { ok: true };
  } catch (error) {
    let cleanupNote = '';
    try {
      fs.rmSync(tempPath, { force: true });
    } catch (cleanupError) {
      cleanupNote = ' (temp cleanup failed: ' + cleanupError.message + ')';
    }
    return { ok: false, cause: error.message + cleanupNote };
  }
}

/**
 * Read the ledger.
 *
 * @returns {{ok:true, exists:boolean, ledger:object|null}} | {{ok:false, code:string, cause:string, path:string}}
 */
// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function loadLedger(workspace) {
  const target = ledgerPath(workspace);
  if (!fs.existsSync(target)) {
    return { ok: true, exists: false, ledger: null };
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch (error) {
    return { ok: false, code: 'ERROR:ledger-unparseable', cause: error.message, path: target };
  }

  const shapeProblem = validateLedgerShape(parsed);
  if (shapeProblem) {
    return { ok: false, code: 'ERROR:ledger-unparseable', cause: shapeProblem, path: target };
  }
  if (parsed.schemaVersion !== criteria.SCHEMA_VERSION) {
    return {
      ok: false,
      code: 'ERROR:ledger-unsupported-schema',
      cause: `ledger schemaVersion ${parsed.schemaVersion} is not supported; expected ${criteria.SCHEMA_VERSION}`,
      path: target,
    };
  }

  return { ok: true, exists: true, ledger: parsed };
}

/** Save the ledger in canonical key order, with one trailing newline. */
// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function saveLedger(workspace, ledger, options = {}) {
  const shapeProblem = validateLedgerShape(ledger);
  if (shapeProblem) {
    return { ok: false, code: 'ERROR:ledger-invalid', cause: shapeProblem };
  }

  const canonical = {};
  for (const key of LEDGER_KEYS) canonical[key] = ledger[key];
  const contents = JSON.stringify(canonical, null, 2) + '\n';
  const written = writeAtomically(ledgerPath(workspace), contents, options.renameImpl || fs.renameSync);
  if (!written.ok) {
    return { ok: false, code: 'ERROR:ledger-write-failed', cause: written.cause };
  }
  return { ok: true };
}

/** Save the rendered Markdown beside the ledger. */
// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function saveMarkdown(workspace, markdown) {
  const written = writeAtomically(markdownPath(workspace), markdown, fs.renameSync);
  if (!written.ok) {
    return { ok: false, code: 'ERROR:markdown-write-failed', cause: written.cause };
  }
  return { ok: true };
}

module.exports = {
  LEDGER_FILE,
  MARKDOWN_FILE,
  LEDGER_KEYS,
  ledgerPath,
  markdownPath,
  emptyLedger,
  allocateId,
  loadLedger,
  saveLedger,
  saveMarkdown,
};
