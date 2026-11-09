'use strict';

/**
 * insert-verifies.js — attach an @verifies assertion to an existing test.
 *
 * A contract gap is repaired at the test that should prove the contract, not at
 * the gate that noticed the gap. The annotation format comes from the annotator
 * so a Python or shell test receives the comment token its language accepts.
 */

const fs = require('node:fs');
const { buildAnnotation, commentTokenFor } = require('./annotate-ticket-context-by-git-diff.js');
const { writeTemporaryThenRename } = require('./lib/atomic-write.js');

const REPAIR_TOOL_INVALID_INPUT = 'REPAIR_TOOL_INVALID_INPUT';
const REPAIR_TARGET_MISSING = 'REPAIR_TARGET_MISSING';

/** A refused insertion. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
class InsertVerifiesError extends Error {
  /**
   * @param {string} message
   * @param {string} code
   */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
  constructor(message, code) {
    super(message);
    this.name = 'InsertVerifiesError';
    this.code = code;
  }
}

/** Escape a literal string for use inside a regular expression. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whether the file already proves the contract. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function alreadyVerifies(content, contractId) {
  return new RegExp('@verifies\\s+' + escapeRegExp(contractId) + '(?![A-Za-z0-9])').test(content);
}

/**
 * Insert `@verifies <contractId>` and the ticket provenance at a line.
 *
 * @param {object} input
 * @param {string} input.file
 * @param {number} input.line — 1-indexed insertion line
 * @param {string} input.ticketKey
 * @param {string} input.contractId
 * @param {boolean} [input.dryRun]
 * @returns {{ inserted: true } | { inserted: false, reason: 'DUPLICATE' }}
 */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function insertVerifies({ file, line, ticketKey, contractId, dryRun = false }) {
  if (typeof ticketKey !== 'string' || ticketKey.trim() === '') {
    throw new InsertVerifiesError('ticketKey is required', REPAIR_TOOL_INVALID_INPUT);
  }
  if (typeof contractId !== 'string' || contractId.trim() === '') {
    throw new InsertVerifiesError('contractId is required', REPAIR_TOOL_INVALID_INPUT);
  }
  if (!fs.existsSync(file)) {
    throw new InsertVerifiesError('target file not found: ' + file, REPAIR_TARGET_MISSING);
  }

  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  if (!Number.isInteger(line) || line < 1 || line > lines.length + 1) {
    throw new InsertVerifiesError(
      'line must be between 1 and ' + (lines.length + 1) + ', received ' + line,
      REPAIR_TOOL_INVALID_INPUT,
    );
  }
  if (alreadyVerifies(content, contractId.trim())) {
    return { inserted: false, reason: 'DUPLICATE' };
  }

  const commentToken = commentTokenFor(file);
  const insertedLines = [
    commentToken + ' @verifies ' + contractId.trim(),
    buildAnnotation(ticketKey.trim(), commentToken),
  ];
  lines.splice(line - 1, 0, ...insertedLines);

  if (!dryRun) {
    writeTemporaryThenRename(file, lines.join('\n'));
  }

  return { inserted: true };
}

/** Read a `--name=value` argument. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function argumentValue(args, name) {
  const prefix = '--' + name + '=';
  const match = args.find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  try {
    const result = insertVerifies({
      file: argumentValue(args, 'file'),
      line: Number(argumentValue(args, 'line')),
      ticketKey: argumentValue(args, 'ticket-key'),
      contractId: argumentValue(args, 'contract-id'),
      dryRun: args.includes('--dry-run'),
    });
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (error) {
    process.stdout.write(JSON.stringify({ inserted: false, code: error.code, error: error.message }) + '\n');
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { InsertVerifiesError, insertVerifies };
