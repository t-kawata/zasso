#!/usr/bin/env node
// [::TICKET::] PX-124: Create create-deferral-ticket.js. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-124 --for-spec --no-implementation-order`.

/**
 * create-deferral-ticket.js — resolve-ticket escape hatch: create a deferral ticket.
 *
 * Replaces the non-executable "Create a new ticket via /make-ticket" instruction.
 * Deep-clones the resolved ticket ($ARGUMENTS) via createTicketFromSource (PX-122),
 * appends a non-PX max-phase todo ticket, and prints a Markdown Action-directive
 * (old-content warning, field-by-field update-ticket.js rewrite, preserve list,
 * and the deferredTo + marker-key rewrite steps). Appends a NEW ticket only —
 * it never mutates any existing ticket's status (resolve-ticket.md Prohibition).
 *
 * Usage:
 *   echo '{"title":"(work item)","scope":[...],"background":"..."}' | node create-deferral-ticket.js \
 *     --source-key=<resolved ticket> [--deferred-to=<stub target>] --tickets=Tickets.json
 */

const fs = require('fs');
const path = require('path');
const { createTicketFromSource } = require('../lib/create-ticket-from-source.js');

// -- Constants --

/** Suggested field-by-field rewrite order for the new ticket's content. */
const SUGGESTED_REWRITE_ORDER = '`title` → `background` → `scope` → `acceptanceCriteria` → `invariants` → `testUnit` → `testIntegration` → `testExceptions` → `contracts` → `investigation` → `boyScoutPlan` → `instrumentation` → `notes`';

/** Relational fields inherited from the clone that must never be overwritten. */
const PRESERVE_LIST = '`nodeIds`, `relatedTicketIds`, `referenceSection`, `referenceUrls`, `sourcePaths`, `rfcDiscrepancies`';

// -- Pure helpers (exported for testing) --

/**
 * Create a deferral ticket (non-PX max-phase todo) from a resolved ticket's clone.
 * @param {object} params
 * @param {object} params.ticketsData — Parsed Tickets.json
 * @param {string} params.sourceKey — Resolved ticket key ($ARGUMENTS)
 * @param {object} params.seed — Work-item seed (title required)
 * @returns {{ success: true, key: string, ticket: object, data: object }
 *          |{ success: false, error: string, errors?: string[] }}
 */
// [::TICKET::] PX-124: createDeferralTicket. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-124 --for-spec --no-implementation-order`.
// [::TICKET::] PX-124, PX-125, PX-126 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-124|PX-125|PX-126) --for-spec --no-implementation-order`.
/**
 * Set the deferredTo field of the targetStub identified by stubId to newKey.
 * Scans all phases/tickets for the stub; returns true when found and updated.
 * @param {object} ticketsData — Parsed/merged Tickets.json
 * @param {string} stubId — targetStub id (e.g. "TS-001")
 * @param {string} newKey — New deferral ticket key
 * @returns {boolean} — true if the stub was found and updated
 */
// [::TICKET::] PX-127: setStubDeferredTo. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-127 --for-spec --no-implementation-order`.
// [::TICKET::] PX-127 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-127 --for-spec --no-implementation-order`.
function setStubDeferredTo(ticketsData, stubId, newKey) {
  for (const phase of ticketsData.phases) {
    for (const ticket of phase.tickets || []) {
      const stub = (ticket.targetStubs || []).find(s => s.id === stubId);
      if (stub) {
        stub.deferredTo = newKey;
        return true;
      }
    }
  }
  return false;
}

/**
 * Create a deferral ticket (non-PX max-phase todo) from a resolved ticket's clone,
 * and — when a stubId is given — set that targetStub's deferredTo to the new key.
 * Appends a NEW ticket only; never mutates any existing ticket's status.
 * @param {object} params
 * @param {object} params.ticketsData — Parsed Tickets.json
 * @param {string} params.sourceKey — Resolved ticket key ($ARGUMENTS)
 * @param {object} params.seed — Work-item seed (title required)
 * @param {string|null} [params.stubId] — targetStub id whose deferredTo to set
 * @returns {{ success: true, key: string, ticket: object, data: object }
 *          |{ success: false, error: string, errors?: string[] }}
 */
// [::TICKET::] PX-124, PX-127 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-124|PX-127) --for-spec --no-implementation-order`.
function createDeferralTicket({ ticketsData, sourceKey, seed, stubId = null }) {
  const res = createTicketFromSource({ ticketsData, sourceKey, seed });
  if (!res.success) return res;
  if (stubId) {
    if (!setStubDeferredTo(res.data, stubId, res.key)) {
      return { success: false, error: 'targetStub not found: ' + stubId };
    }
  }
  return res;
}

/**
 * Build the Markdown Action-directive printed to stdout after creation.
 * Includes the deferredTo update and marker-key rewrite steps (resolve step 3).
 * @param {{ key: string, sourceKey: string }} params — New key and source key
 * @returns {string} — Markdown guidance
 */
// [::TICKET::] PX-124: buildMarkdownGuidance. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-124 --for-spec --no-implementation-order`.
// [::TICKET::] PX-124, PX-125, PX-126, PX-127, PX-123 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-124|PX-125|PX-126|PX-127|PX-123) --for-spec --no-implementation-order`.
function buildMarkdownGuidance({ key, sourceKey }) {
  return [
    '## Created: ' + key,
    '',
    'Deep-cloned from **' + sourceKey + '** (status: `todo`, non-PX, max phase).',
    '',
    '### 1. It currently shows the SOURCE\'s OLD content',
    '',
    'The new ticket carries ' + sourceKey + '\'s previous spec. Verify before editing:',
    '',
    '```bash',
    'node ".claude/scripts/tickets/show-ticket-context.js" --ticket-key="' + key + '" --for-spec',
    '```',
    '',
    '### 2. Rewrite OLD → NEW (one field at a time)',
    '',
    'Rewrite **one field at a time** — at most 3 fields per `update-ticket.js` call, in this order:',
    '',
    SUGGESTED_REWRITE_ORDER,
    '',
    'Example (single field):',
    '',
    '```bash',
    'echo \'{"title":"..."}\' | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "' + key + '"',
    '```',
    '',
    '### 3. deferredTo set by the script; rewrite the marker key',
    '',
    'The script set the STUB\'s `deferredTo` to **' + key + '** (when `--stub-id` was passed). Verify it if `--stub-id` was omitted, then rewrite the marker key to **' + key + '** and re-run the Step 9 validator (Check C active key).',
    '',
    '### 4. PRESERVE — do not touch',
    '',
    PRESERVE_LIST + ' are already correct from the clone. You may **add** (`--append` for arrays), never remove.'
  ].join('\n');
}

/**
 * Parse CLI arguments.
 * @param {string[]} [argv] — Arguments (defaults to process.argv.slice(2))
 * @returns {{ sourceKey: string|null, deferredTo: string|null, tickets: string }}
 */
// [::TICKET::] PX-124: parseArgs. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-124 --for-spec --no-implementation-order`.
// [::TICKET::] PX-124, PX-125, PX-126, PX-127 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-124|PX-125|PX-126|PX-127) --for-spec --no-implementation-order`.
function parseArgs(argv) {
  const args = argv || process.argv.slice(2);
  const parsed = { sourceKey: null, deferredTo: null, stubId: null, tickets: 'Tickets.json' };
  for (const arg of args) {
    if (arg.startsWith('--source-key=')) {
      parsed.sourceKey = arg.slice('--source-key='.length);
    } else if (arg.startsWith('--deferred-to=')) {
      parsed.deferredTo = arg.slice('--deferred-to='.length);
    } else if (arg.startsWith('--stub-id=')) {
      parsed.stubId = arg.slice('--stub-id='.length);
    } else if (arg.startsWith('--tickets=')) {
      parsed.tickets = arg.slice('--tickets='.length);
    }
  }
  return parsed;
}

// -- CLI entry point --

/** Read all of stdin as a string. */
// [::TICKET::] PX-124, PX-125, PX-126, PX-127 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-124|PX-125|PX-126|PX-127) --for-spec --no-implementation-order`.
function readStdin() {
  return new Promise((resolve) => {
    let chunks = '';
    process.stdin.on('data', (c) => { chunks += c; });
    process.stdin.on('end', () => resolve(chunks));
  });
}

// [::TICKET::] PX-124, PX-125, PX-126, PX-127 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-124|PX-125|PX-126|PX-127) --for-spec --no-implementation-order`.
async function main() {
  const { sourceKey, deferredTo, stubId, tickets } = parseArgs();
  if (!sourceKey) {
    process.stderr.write('[create-deferral-ticket] Error: --source-key is required.\n');
    process.exit(1);
  }

  const ticketsPath = path.resolve(tickets);
  let ticketsData;
  try {
    ticketsData = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  } catch (e) {
    process.stderr.write('[create-deferral-ticket] Error: cannot read Tickets.json: ' + e.message + '\n');
    process.exit(1);
  }

  let seed = {};
  try {
    const stdinData = await readStdin();
    if (stdinData.trim()) seed = JSON.parse(stdinData);
  } catch (e) {
    process.stderr.write('[create-deferral-ticket] Error: cannot parse seed JSON from stdin: ' + e.message + '\n');
    process.exit(1);
  }

  const res = createDeferralTicket({ ticketsData, sourceKey, seed, stubId });
  if (!res.success) {
    process.stderr.write('[create-deferral-ticket] Error: ' + res.error + '\n');
    if (Array.isArray(res.errors)) process.stderr.write('  ' + res.errors.join('\n  ') + '\n');
    process.exit(1);
  }

  try {
    fs.writeFileSync(ticketsPath, JSON.stringify(res.data, null, 2) + '\n', 'utf8');
  } catch (e) {
    process.stderr.write('[create-deferral-ticket] Error: cannot write Tickets.json: ' + e.message + '\n');
    process.exit(1);
  }

  process.stdout.write(buildMarkdownGuidance({ key: res.key, sourceKey }) + '\n');
  if (deferredTo) {
    process.stderr.write('[create-deferral-ticket] ACTION: set the STUB\'s deferredTo from ' + deferredTo + ' to ' + res.key + ' and rewrite the marker key to ' + res.key + '.\n');
  }
}

if (require.main === module) {
  main().catch((e) => {
    process.stderr.write('[create-deferral-ticket] Error: ' + ((e && e.message) || e) + '\n');
    process.exit(1);
  });
}

module.exports = { createDeferralTicket, buildMarkdownGuidance, parseArgs, setStubDeferredTo };
