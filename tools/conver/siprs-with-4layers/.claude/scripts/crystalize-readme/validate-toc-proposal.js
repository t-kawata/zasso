#!/usr/bin/env node

/**
 * validate-toc-proposal.js — Per-proposal validation gate for the Step 1 TOC grill (C001)
 *
 * CLI: echo '<proposal-json>' | validate-toc-proposal.js
 *
 * Validates a single heading proposal before it is presented to the user. A
 * proposal is {id, heading, contentOptions[], recommendation, reason, existingIds?}.
 * id is a hierarchical path (H1, H1-1, H1-2-1, H2, ...): the parent of an id is
 * derived by dropping the last -<n> segment, and a child may only be proposed
 * after its parent already exists in existingIds. The AI must pass every proposal
 * through this gate; an unvalidated proposal is never presented.
 *
 * Exit codes:
 *   0 — valid (prints {"valid":true,"errors":[]})
 *   1 — invalid (prints {"valid":false,"errors":[...]})
 */

/** Hierarchical path ID pattern: H1, H1-1, H1-2-1, H2, H2-3, ... */
const ID_PATTERN = /^H[1-9][0-9]*(-[1-9][0-9]*)*$/;

/** Maximum number of path segments (markdown headings H1-H6) */
const MAX_ID_DEPTH = 6;

/** Minimum number of content options (Yes/No pair) */
const MIN_OPTIONS = 2;

/** Maximum number of content options (A/B/C) */
const MAX_OPTIONS = 4;

/**
 * Derive the parent id of a hierarchical-path heading id by dropping the last
 * -<n> segment. A top-level id (no dash) has no parent.
 *
 * @param {string} id — Hierarchical path id, e.g. 'H1-2-1'
 * @returns {string|null} Parent id ('H1-2') or null for a top-level heading
 */
// [::TICKET::] PX-154 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-154 --for-spec --no-implementation-order`.
function parentIdOf(id) {
  if (typeof id !== 'string') return null;
  const lastDash = id.lastIndexOf('-');
  return lastDash === -1 ? null : id.slice(0, lastDash);
}

/**
 * Parse stdin JSON into a proposal object.
 *
 * @param {string} raw — Raw stdin JSON
 * @returns {Object} Proposal object
 * @throws {Error} If the input is not a JSON object
 */
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
 * @param {Object} proposal — {id, heading, contentOptions, recommendation, reason, existingIds?}
 * @returns {{ valid: boolean, errors: string[] }} Validation result
 */
// [::TICKET::] PX-154 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-154 --for-spec --no-implementation-order`.
function validateProposal(proposal) {
  const errors = [];
  const proposalData = proposal || {};
  const existingIds = Array.isArray(proposalData.existingIds) ? proposalData.existingIds : [];
  const segmentCount = typeof proposalData.id === 'string' ? (proposalData.id.match(/-/g) || []).length + 1 : 0;

  if (typeof proposalData.id !== 'string' || !ID_PATTERN.test(proposalData.id) || segmentCount > MAX_ID_DEPTH) {
    errors.push(`[INVALID_ID] id "${proposalData.id}" does not match the hierarchical path pattern /^H[1-9][0-9]*(-[1-9][0-9]*)*$/ (1-${MAX_ID_DEPTH} segments).\n  Fix: Use a hierarchical path such as "H1" (top level), "H1-1" (child of H1), or "H1-2-1" (child of H1-2).`);
  } else if (existingIds.includes(proposalData.id)) {
    errors.push(`[DUPLICATE_ID] id "${proposalData.id}" is already in existingIds.\n  Fix: Choose a new id that is not proposed yet, e.g. if "H1" exists, use "H2" for a new top-level heading or "H1-1" for a child of H1.`);
  } else {
    const parent = parentIdOf(proposalData.id);
    if (parent !== null && !existingIds.includes(parent)) {
      errors.push(`[PARENT_NOT_FOUND] parent "${parent}" of id "${proposalData.id}" does not exist in existingIds.\n  Fix: Propose the parent heading "${parent}" first (a child may only appear after its parent), e.g. propose "H2" before "H2-1".`);
    }
  }

  if (typeof proposalData.heading !== 'string' || proposalData.heading.trim() === '') {
    errors.push('[EMPTY_HEADING] heading must be a non-empty string.\n  Fix: Give the section a clear, usage-focused title, e.g. "クイックスタート" or "アカウントの追加".');
  }

  if (!Array.isArray(proposalData.contentOptions) || proposalData.contentOptions.length < MIN_OPTIONS || proposalData.contentOptions.length > MAX_OPTIONS) {
    errors.push(`[INVALID_OPTIONS] contentOptions must contain between ${MIN_OPTIONS} and ${MAX_OPTIONS} options (A/B/C or Yes/No).\n  Fix: Provide ${MIN_OPTIONS}-${MAX_OPTIONS} distinct options, e.g. ["はい", "いいえ"] for Yes/No, or ["コードA", "コードB", "コードC"] for A/B/C.`);
  } else if (proposalData.contentOptions.some((option) => typeof option !== 'string' || option.trim() === '')) {
    errors.push('[INVALID_OPTIONS] every contentOption must be a non-empty string.\n  Fix: Replace any empty option with a descriptive label.');
  }

  if (typeof proposalData.recommendation !== 'string' || !Array.isArray(proposalData.contentOptions) || !proposalData.contentOptions.includes(proposalData.recommendation)) {
    errors.push(`[INVALID_RECOMMENDATION] recommendation "${proposalData.recommendation}" is not one of the presented contentOptions.\n  Fix: Set recommendation to exactly one option from contentOptions verbatim.`);
  }

  if (typeof proposalData.reason !== 'string' || proposalData.reason.trim() === '') {
    errors.push('[EMPTY_REASON] reason must be a non-empty string explaining the AI recommendation.\n  Fix: State why you recommend this option, e.g. "アカウント追加は基本操作のため".');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * main — read stdin, validate, print the result, exit 0/1.
 */
// [::TICKET::] PX-154 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-154 --for-spec --no-implementation-order`.
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
      process.stdout.write(JSON.stringify({
        valid: false,
        errors: [`[PARSE_ERROR] ${error.message}\n  Fix: Provide a single JSON object with the proposal fields {id, heading, contentOptions, recommendation, reason, existingIds?}.`],
      }) + '\n');
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
  parentIdOf,
  main,
  ID_PATTERN,
  MAX_ID_DEPTH,
  MIN_OPTIONS,
  MAX_OPTIONS,
};
