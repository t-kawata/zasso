#!/usr/bin/env node

/**
 * validate-toc-proposal.js — Per-proposal validation gate for the Step 1 TOC grill (C001)
 *
 * CLI: echo '<proposal-json>' | validate-toc-proposal.js
 *
 * Validates a single heading proposal before it is presented to the user. A
 * proposal is {id, heading, contentOptions[], recommendation, reason, seenIds?}.
 * The AI must pass every proposal through this gate; an unvalidated proposal is
 * never presented.
 *
 * Exit codes:
 *   0 — valid (prints {"valid":true,"errors":[]})
 *   1 — invalid (prints {"valid":false,"errors":[...]})
 */

/** Hierarchical heading ID pattern: H1, H2-1, H3-2, ... */
const ID_PATTERN = /^H[1-6](-[1-9][0-9]*)?$/;

/** Minimum number of content options (Yes/No pair) */
const MIN_OPTIONS = 2;

/** Maximum number of content options (A/B/C) */
const MAX_OPTIONS = 4;

/**
 * Parse stdin JSON into a proposal object.
 *
 * @param {string} raw — Raw stdin JSON
 * @returns {Object} Proposal object
 * @throws {Error} If the input is not a JSON object
 */
// [::TICKET::] PX-153 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-153 --for-spec --no-implementation-order`.
function parseProposal(raw) {
  const proposal = JSON.parse(raw);
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) {
    throw new Error('Proposal must be a JSON object.');
  }
  return proposal;
}

/**
 * Validate a single heading proposal.
 *
 * @param {Object} proposal — {id, heading, contentOptions, recommendation, reason, seenIds?}
 * @returns {{ valid: boolean, errors: string[] }} Validation result
 */
// [::TICKET::] PX-153 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-153 --for-spec --no-implementation-order`.
function validateProposal(proposal) {
  const errors = [];
  const proposalData = proposal || {};
  const seenIds = Array.isArray(proposalData.seenIds) ? proposalData.seenIds : [];

  if (typeof proposalData.id !== 'string' || !ID_PATTERN.test(proposalData.id)) {
    errors.push('[INVALID_ID] id must match the hierarchical pattern /^H[1-6](-[1-9][0-9]*)?$/ (e.g. H1, H2-1, H3-2).');
  } else if (seenIds.includes(proposalData.id)) {
    errors.push(`[DUPLICATE_ID] id "${proposalData.id}" is already proposed in this batch.`);
  }

  if (typeof proposalData.heading !== 'string' || proposalData.heading.trim() === '') {
    errors.push('[EMPTY_HEADING] heading must be a non-empty string.');
  }

  if (!Array.isArray(proposalData.contentOptions) || proposalData.contentOptions.length < MIN_OPTIONS || proposalData.contentOptions.length > MAX_OPTIONS) {
    errors.push(`[INVALID_OPTIONS] contentOptions must contain ${MIN_OPTIONS}-${MAX_OPTIONS} options (A/B/C or Yes/No).`);
  } else if (proposalData.contentOptions.some((option) => typeof option !== 'string' || option.trim() === '')) {
    errors.push('[INVALID_OPTIONS] every contentOption must be a non-empty string.');
  }

  if (typeof proposalData.recommendation !== 'string' || !Array.isArray(proposalData.contentOptions) || !proposalData.contentOptions.includes(proposalData.recommendation)) {
    errors.push('[INVALID_RECOMMENDATION] recommendation must be exactly one of the presented contentOptions.');
  }

  if (typeof proposalData.reason !== 'string' || proposalData.reason.trim() === '') {
    errors.push('[EMPTY_REASON] reason must be a non-empty string explaining the AI recommendation.');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * main — read stdin, validate, print the result, exit 0/1.
 */
// [::TICKET::] PX-153 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-153 --for-spec --no-implementation-order`.
function main() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    raw += chunk;
  });
  process.stdin.on('end', () => {
    try {
      const proposal = parseProposal(raw);
      const result = validateProposal(proposal);
      process.stdout.write(JSON.stringify(result) + '\n');
      process.exit(result.valid ? 0 : 1);
    } catch (error) {
      process.stdout.write(JSON.stringify({ valid: false, errors: [`[PARSE_ERROR] ${error.message}`] }) + '\n');
      process.exit(1);
    }
  });
}

// Call main only when executed as CLI
if (require.main === module) {
  main();
}

module.exports = {
  parseProposal,
  validateProposal,
  main,
  ID_PATTERN,
  MIN_OPTIONS,
  MAX_OPTIONS,
};
