#!/usr/bin/env node

/**
 * generate-residue-filename.js — Generate a RESIDUE filename (C004)
 *
 * CLI: generate-residue-filename.js --timestamp=<YYYYMMDDhhmmss>
 *
 * Outputs "RESIDUE-<YYYYMMDDhhmmss>.md". The timestamp is injected as an
 * argument so the script stays deterministic and collision-safe per second.
 */

/** CLI argument prefix specifying the injected timestamp */
const TIMESTAMP_ARG_PREFIX = '--timestamp=';

/** RESIDUE filename prefix */
const RESIDUE_FILENAME_PREFIX = 'RESIDUE-';

/** RESIDUE filename pattern: RESIDUE-<14 digits>.md */
const RESIDUE_FILENAME_RE = /^RESIDUE-\d{14}\.md$/;

/** 14-digit timestamp pattern (YYYYMMDDhhmmss) */
const TIMESTAMP_RE = /^\d{14}$/;

/**
 * Parse command line arguments.
 *
 * @param {string[]} [args] — Test argument array (defaults to process.argv when omitted)
 * @returns {{ timestamp: string }}
 * @throws {Error} If the argument syntax is invalid
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function parseArguments(args) {
  const argv = args || process.argv.slice(2);
  if (argv.length !== 1 || !argv[0].startsWith(TIMESTAMP_ARG_PREFIX)) {
    throw new Error(`Usage: generate-residue-filename.js ${TIMESTAMP_ARG_PREFIX}<YYYYMMDDhhmmss>`);
  }
  const timestamp = argv[0].slice(TIMESTAMP_ARG_PREFIX.length);
  if (!timestamp) {
    throw new Error('--timestamp value is empty.');
  }
  return { timestamp };
}

/**
 * Generate a RESIDUE filename from a 14-digit timestamp.
 *
 * @param {string} timestamp — 14-digit timestamp (YYYYMMDDhhmmss)
 * @returns {string} RESIDUE filename
 * @throws {Error} If the timestamp is not exactly 14 digits
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function generateResidueFilename(timestamp) {
  if (typeof timestamp !== 'string' || !TIMESTAMP_RE.test(timestamp)) {
    throw new Error(`Timestamp must be 14 digits, got: ${timestamp}`);
  }
  return `${RESIDUE_FILENAME_PREFIX}${timestamp}.md`;
}

/**
 * main — CLI entry point.
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function main() {
  try {
    const { timestamp } = parseArguments();
    process.stdout.write(generateResidueFilename(timestamp) + '\n');
    process.exit(0);
  } catch (error) {
    console.error(`[ERROR] ${error.message}`);
    process.exit(1);
  }
}

// Call main only when executed as CLI
if (require.main === module) {
  main();
}

module.exports = {
  parseArguments,
  generateResidueFilename,
  main,
  TIMESTAMP_ARG_PREFIX,
  RESIDUE_FILENAME_PREFIX,
  RESIDUE_FILENAME_RE,
  TIMESTAMP_RE,
};
