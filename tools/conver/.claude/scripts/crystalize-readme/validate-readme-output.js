#!/usr/bin/env node

/**
 * validate-readme-output.js — Validate README output structure (Step 4, C005)
 *
 * CLI: validate-readme-output.js --readme=<path>   (or stdin)
 *
 * Passes (exit 0, ok:true) iff the last section heading is the examples
 * section (case-insensitive) and the required header fields are present.
 */

const fs = require('fs');
const {
  validateMarkerGrammar,
  TRAILING_SECTION_TITLE,
} = require('./validate-marker-grammar.js');

/** CLI argument prefix specifying the README file path */
const README_ARG_PREFIX = '--readme=';

/**
 * Parse command line arguments.
 *
 * @param {string[]} [args] — Test argument array (defaults to process.argv when omitted)
 * @returns {{ readmePath: string|null }} null means read from stdin
 * @throws {Error} If the argument syntax is invalid
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function parseArguments(args) {
  const argv = args || process.argv.slice(2);
  if (argv.length > 1) {
    throw new Error(`Usage: validate-readme-output.js ${README_ARG_PREFIX}<path> (or stdin)`);
  }
  if (argv.length === 1) {
    if (!argv[0].startsWith(README_ARG_PREFIX)) {
      throw new Error(`Unknown argument: ${argv[0]}`);
    }
    const readmePath = argv[0].slice(README_ARG_PREFIX.length);
    if (!readmePath) {
      throw new Error('--readme value is empty.');
    }
    return { readmePath };
  }
  return { readmePath: null };
}

/**
 * Normalize text for case-insensitive comparison.
 *
 * @param {string} text — Raw text
 * @returns {string} Lower-cased, trimmed text
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function normalize(text) {
  return String(text).trim().toLowerCase();
}

/**
 * Validate README content structure.
 *
 * @param {string} text — README markdown content
 * @returns {{ ok: boolean, errors: string[] }}
 */
// [::TICKET::] PX-152, PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-152|PX-156) --for-spec --no-implementation-order`.
function validateReadmeOutput(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    return { ok: false, errors: ['README content is empty.'] };
  }

  const errors = [];
  const lines = text.split('\n');

  if (!lines.some((line) => /^#\s+\S/.test(line))) {
    errors.push('README has no H1 title.');
  }

  const headingLines = lines.filter((line) => /^#+\s+\S/.test(line));

  if (!lines.some((line) => /対象\s*RFC|Target\s*RFC/i.test(line))) {
    errors.push('README lacks a target RFC line.');
  }
  if (!lines.some((line) => /生成グラフ|Graph:/i.test(line))) {
    errors.push('README lacks a graph path line.');
  }

  const lastHeading = headingLines[headingLines.length - 1];
  const lastHeadingText = lastHeading ? normalize(lastHeading.replace(/^#+\s*/, '')) : '';
  if (lastHeadingText !== normalize(TRAILING_SECTION_TITLE)) {
    errors.push(`Last section heading must be '${TRAILING_SECTION_TITLE}'.`);
  }

  // Marker grammar (PX-156): no unresolved TEMPLATE markers may remain; every
  // section must be complete or a residue record, with no cross-contamination.
  const grammar = validateMarkerGrammar(text);
  errors.push(...grammar.errors);
  if (grammar.templateCount > 0) {
    errors.push('README still contains unresolved TEMPLATE markers (loop has not exited).');
  }

  return { ok: errors.length === 0, errors };
}

/**
 * main — CLI entry point (reads from --readme=<path> or stdin).
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function main() {
  const { readmePath } = parseArguments();

  const finish = (text) => {
    const result = validateReadmeOutput(text);
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exit(result.ok ? 0 : 1);
  };

  if (readmePath) {
    try {
      const text = fs.readFileSync(readmePath, 'utf8');
      finish(text);
    } catch (error) {
      console.error(`[ERROR] Failed to read README: ${error.message}`);
      process.exit(1);
    }
  } else {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      input += chunk;
    });
    process.stdin.on('end', () => finish(input));
  }
}

// Call main only when executed as CLI
if (require.main === module) {
  main();
}

module.exports = {
  parseArguments,
  validateReadmeOutput,
  main,
  normalize,
  README_ARG_PREFIX,
  TRAILING_SECTION_TITLE,
};
