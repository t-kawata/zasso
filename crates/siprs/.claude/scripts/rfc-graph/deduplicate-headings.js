#!/usr/bin/env node

/**
 * deduplicate-headings.js — Heading deduplication (graphify-rfc Step 0)
 *
 * Appends A-Z to duplicate heading texts at the same level so headingRefs can
 * resolve uniquely. A line inside a fenced code block is example content, not a
 * heading: it is never changed and never counted. An opening fence with no
 * closer stops the run before the source is written.
 *
 * CLI: deduplicate-headings.js <source-path>
 *
 * Output contract:
 *   Normal case → outputs change status to stdout (exit code 0)
 *   Error case → outputs 3-part template to stderr (exit code 1)
 */

'use strict';

const fs = require('fs');
const {
  findFencedBlocks,
  extractHeadingsOutsideFences,
} = require('./lib/markdown-headings.js');

/** Maximum number of A-Z suffixes after the first occurrence. */
const MAX_DUPLICATES = 26;

/** Sibling temp file used to make the Step 0 write atomic. */
const TEMP_SUFFIX = '.tmp';

/** ASCII code for A; a duplicate count of 1 maps to A. */
const ASCII_A_OFFSET = 64;

// [::TICKET::] PX-335 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-335 --for-spec --no-implementation-order`.
function exitWithError(summary, cause, action) {
  process.stderr.write(`[ERROR] ${summary}\nCause: ${cause}\nAction: ${action}\n`);
  process.exit(1);
}

function readLines(filePath) {
  if (!fs.existsSync(filePath)) {
    exitWithError('Source file not found.', `${filePath} does not exist.`, 'Specify a valid file path.');
  }
  return fs.readFileSync(filePath, 'utf8').split('\n');
}

/**
 * Detect duplicate heading texts at the same level and append A-Z.
 *
 * @param {string[]} lines — Array of file lines
 * @returns {{ result: string[], modified: boolean, changes: string[], unclosedFence: boolean }}
 */
// [::TICKET::] PX-335 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-335 --for-spec --no-implementation-order`.
function deduplicateHeadings(lines) {
  const { blocks, unclosed } = findFencedBlocks(lines);
  if (unclosed) {
    return { result: [...lines], modified: false, changes: [], unclosedFence: true };
  }

  const headingByLineIndex = new Map(
    extractHeadingsOutsideFences(lines, blocks).map((heading) => [heading.line - 1, heading]),
  );
  const seen = {};
  const changes = [];

  const result = lines.map((line, index) => {
    const heading = headingByLineIndex.get(index);
    if (!heading) return line;

    const key = `${heading.level}:${heading.text}`;
    if (seen[key] === undefined) {
      seen[key] = 0;
      return line;
    }

    seen[key] += 1;
    const count = seen[key];
    if (count > MAX_DUPLICATES) {
      throw new Error(
        `Heading duplicates exceeded 27 entries.\n` +
        `  heading: ${'#'.repeat(heading.level)} ${heading.text}\n` +
        `  line: ${index + 1}\n` +
        `  Action: Manually split or rename the headings.`
      );
    }

    const suffix = ' ' + String.fromCharCode(ASCII_A_OFFSET + count);
    const newLine = `${'#'.repeat(heading.level)} ${heading.text}${suffix}`;
    changes.push(`L${index + 1}: "${line}" → "${newLine}"`);
    return newLine;
  });

  return { result, modified: changes.length > 0, changes, unclosedFence: false };
}

/**
 * Write content beside the source and rename it into place.
 *
 * @param {string} filePath — Destination source path
 * @param {string} content — Complete new source
 */
// [::TICKET::] PX-335 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-335 --for-spec --no-implementation-order`.
function writeAtomically(filePath, content) {
  const tempPath = filePath + TEMP_SUFFIX;
  try {
    fs.writeFileSync(tempPath, content, 'utf8');
    fs.renameSync(tempPath, filePath);
  } finally {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
}

// [::TICKET::] PX-335 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-335 --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0] === '--help' || args[0] === '-h') {
    process.stdout.write('Usage: deduplicate-headings.js <source-path>\n');
    process.stdout.write('Appends A-Z to duplicate headings in the source file.\n');
    process.exit(args[0] === '--help' || args[0] === '-h' ? 0 : 1);
  }

  const lines = readLines(args[0]);
  const { result, modified, changes, unclosedFence } = deduplicateHeadings(lines);

  if (unclosedFence) {
    exitWithError(
      'UNCLOSED_FENCE: the source has an opening fence with no closing marker.',
      'A fenced code block must be closed before graphify can distinguish headings from examples.',
      'Close the fence or remove it, then re-run.',
    );
  }

  if (modified) {
    writeAtomically(args[0], result.join('\n'));
    process.stdout.write(`[Modified] Suffix added to ${changes.length} duplicate heading(s).\n`);
    for (const change of changes) {
      process.stdout.write(`  ${change}\n`);
    }
  } else {
    process.stdout.write('No duplicate headings found. No changes made.\n');
  }
}

module.exports = { deduplicateHeadings, readLines, writeAtomically };

if (require.main === module) main();
