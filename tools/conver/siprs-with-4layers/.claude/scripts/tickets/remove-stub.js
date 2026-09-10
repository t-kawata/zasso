#!/usr/bin/env node
// [::TICKET::] PX-118: remove-stub.js — deterministic STUB marker line removal.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-118 --for-spec --no-implementation-order`.

/**
 * remove-stub.js — Remove a resolved [::STUB::] marker line from a source file.
 *
 * The pipeline's insert side (insert-stub.js) is already defensive. This script
 * is the matching removal side: it deletes exactly the marker comment line and
 * refuses every unsafe input — a line without a marker, a line that carries
 * executable code, an out-of-range line, or a re-removal attempt.
 *
 * CLI:
 *   node remove-stub.js --file=<path> --line=<N>
 *   node remove-stub.js --file=<path> --lines=<N1,N2,...>
 *
 * Exported API:
 *   removeStub({ file, line, lines })
 *     -> single:  { removed: true, file: <abs>, line: <N> }
 *     -> batch:   { removed: true, file: <abs>, lines: [<N1>, ...] }
 *     throws RemoveStubError on any validation failure (file untouched).
 *
 * Marker format (single-line // comment, enforced by validate-stub-format.js):
 *   // [::STUB::] <ticket>: <reason> -- <plan>
 */

const fs = require('fs');
const path = require('path');

// Marker tag that identifies a STUB marker line (see validate-stub-format.js).
const STUB_TAG = '[::STUB::]';
// A removable marker must be a comment-only line beginning with '//'.
const COMMENT_PREFIX = '//';

/**
 * Custom error type carrying the specific contract that failed.
 * The target source file is never written when this error is raised.
 */
// [::TICKET::] PX-118 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-118 --for-spec --no-implementation-order`.
class RemoveStubError extends Error {
// [::TICKET::] PX-118 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-118 --for-spec --no-implementation-order`.
  constructor(message) {
    super(message);
    this.name = 'RemoveStubError';
  }
}

/**
 * Normalize --line / --lines into a unique, validated set of 1-indexed targets.
 * Returns a sorted array of unique positive integers, or null when neither is given.
 */
// [::TICKET::] PX-118 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-118 --for-spec --no-implementation-order`.
function normalizeTargetLines(line, lines) {
  const hasLine = Number.isInteger(line);
  const hasLines = Array.isArray(lines);
  if (!hasLine && !hasLines) return null;

  const candidates = hasLines ? lines : [line];
  if (candidates.length === 0) {
    throw new RemoveStubError('--lines must contain at least one line number');
  }
  for (const candidate of candidates) {
    if (!Number.isInteger(candidate) || candidate < 1) {
      throw new RemoveStubError('Line must be a positive integer, got: ' + candidate);
    }
  }
  return [...new Set(candidates)].sort((a, b) => a - b);
}

/**
 * Resolve and load the source file, or fail with a RemoveStubError.
 * @returns {{ absFile: string, sourceLines: string[] }}
 */
// [::TICKET::] PX-118 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-118 --for-spec --no-implementation-order`.
function loadSourceFile(file) {
  if (typeof file !== 'string' || file.length === 0) {
    throw new RemoveStubError('--file is required and must be a non-empty string');
  }
  const absFile = path.resolve(file);
  if (!fs.existsSync(absFile)) {
    throw new RemoveStubError('Source file not found: ' + absFile);
  }
  if (fs.statSync(absFile).isDirectory()) {
    throw new RemoveStubError('Source path is a directory: ' + absFile);
  }
  let content;
  try {
    content = fs.readFileSync(absFile, 'utf8');
  } catch (e) {
    throw new RemoveStubError('Failed to read source file: ' + absFile + ' — ' + e.message);
  }
  return { absFile, sourceLines: content.split('\n') };
}

/**
 * Assert that the given line holds a [::STUB::] marker (contract C002).
 */
// [::TICKET::] PX-118 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-118 --for-spec --no-implementation-order`.
function assertMarkerAtLine(lineContent, lineNo) {
  if (!lineContent.includes(STUB_TAG)) {
    throw new RemoveStubError('No [::STUB::] marker at line ' + lineNo);
  }
}

/**
 * Assert that the given line is a comment-only line (contract C003).
 * Rejects executable code sharing the line and block-comment markers.
 */
// [::TICKET::] PX-118 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-118 --for-spec --no-implementation-order`.
function assertCommentOnlyLine(lineContent, lineNo) {
  const trimmed = lineContent.trim();
  if (!trimmed.startsWith(COMMENT_PREFIX)) {
    throw new RemoveStubError(
      'Line ' + lineNo + ' is not a comment-only line; only // [::STUB::] marker lines can be removed'
    );
  }
}

/**
 * Validate every target against a single snapshot of the file.
 * All targets must pass before any removal happens (batch atomicity, C005).
 */
// [::TICKET::] PX-118 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-118 --for-spec --no-implementation-order`.
function validateTargets(sourceLines, targetLines) {
  for (const lineNo of targetLines) {
    if (lineNo > sourceLines.length) {
      throw new RemoveStubError('Line ' + lineNo + ' exceeds file length (' + sourceLines.length + ' lines)');
    }
    assertMarkerAtLine(sourceLines[lineNo - 1], lineNo);
    assertCommentOnlyLine(sourceLines[lineNo - 1], lineNo);
  }
}

/**
 * Remove the target lines in descending order so earlier line numbers stay valid.
 */
// [::TICKET::] PX-118 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-118 --for-spec --no-implementation-order`.
function removeLinesInDescendingOrder(sourceLines, targetLines) {
  const descending = [...targetLines].sort((a, b) => b - a);
  for (const lineNo of descending) {
    sourceLines.splice(lineNo - 1, 1);
  }
}

/**
 * Remove a resolved [::STUB::] marker line (or lines) from a source file.
 *
 * @param {object} opts
 * @param {string} opts.file  - Path to the source file
 * @param {number} [opts.line]   - 1-indexed line number for single removal
 * @param {number[]} [opts.lines] - 1-indexed line numbers for batch removal
 * @returns {{ removed: boolean, file: string, line?: number, lines?: number[] }}
 * @throws {RemoveStubError} when any validation fails — the file stays untouched.
 */
// [::TICKET::] PX-118 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-118 --for-spec --no-implementation-order`.
function removeStub({ file, line, lines }) {
  const targetLines = normalizeTargetLines(line, lines);
  if (targetLines === null) {
    throw new RemoveStubError('--line or --lines is required');
  }

  const { absFile, sourceLines } = loadSourceFile(file);
  validateTargets(sourceLines, targetLines);
  removeLinesInDescendingOrder(sourceLines, targetLines);

  fs.writeFileSync(absFile, sourceLines.join('\n'), 'utf8');

  if (Array.isArray(lines)) {
    return { removed: true, file: absFile, lines: targetLines };
  }
  return { removed: true, file: absFile, line: targetLines[0] };
}

// ===========================================================================
// CLI entry point
// ===========================================================================

/**
 * Parse CLI arguments into removeStub options.
 * @param {string[]} argv
 * @returns {{ file: string|null, line: number|null, lines: number[]|null }}
 */
// [::TICKET::] PX-118 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-118 --for-spec --no-implementation-order`.
function parseCliArgs(argv) {
  const opts = { file: null, line: null, lines: null };
  for (const arg of argv) {
    if (arg.startsWith('--file=')) {
      opts.file = arg.slice('--file='.length);
    } else if (arg.startsWith('--line=')) {
      opts.line = parseInt(arg.slice('--line='.length), 10);
    } else if (arg.startsWith('--lines=')) {
      opts.lines = arg.slice('--lines='.length).split(',').map(function (token) {
        return parseInt(token, 10);
      });
    } else {
      console.error('[ERROR] Unknown argument: ' + arg);
      console.error('Action: Use --file=<path> --line=<N> or --lines=<N1,N2,...>');
      process.exit(2);
    }
  }
  return opts;
}

// [::TICKET::] PX-118 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-118 --for-spec --no-implementation-order`.
function main() {
  const opts = parseCliArgs(process.argv.slice(2));
  try {
    const result = removeStub(opts);
    console.log(JSON.stringify(result));
    process.exit(0);
  } catch (err) {
    console.error('[ERROR] ' + err.message);
    console.error('Cause: STUB marker removal validation failed');
    console.error('Action: Fix the reported issue and re-run');
    process.exit(1);
  }
}

if (require.main === module) main();
module.exports = { removeStub, RemoveStubError };
