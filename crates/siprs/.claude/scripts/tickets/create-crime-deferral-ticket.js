#!/usr/bin/env node
// [::TICKET::] PX-128: Create create-crime-deferral-ticket.js. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-128 --for-spec --no-implementation-order`.

/**
 * create-crime-deferral-ticket.js — start-ticket Step 5c: defer an unresolvable targetCrime.
 *
 * Analogous to create-deferral-ticket.js but for targetCrimes: deep-clones the
 * ticket being started ($ARGUMENTS) via createTicketFromSource (PX-122), appends a
 * non-PX max-phase todo ticket, and — when a crimeId is given — sets that
 * targetCrime's deferredTo to the new key. Appends a NEW ticket only; never
 * mutates any existing ticket's status. Terminal-excuse language is FORBIDDEN as a
 * deferral justification (no-external-excuse rule).
 *
 * Usage:
 *   echo '{"title":"(work item)","scope":[...],"background":"..."}' | node create-crime-deferral-ticket.js \
 *     --source-key=<started ticket> [--crime-id=<targetCrime id>] --tickets=Tickets.json
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
 * Set the deferredTo field of the targetCrime identified by crimeId to newKey.
 * Scans all phases/tickets for the crime; returns true when found and updated.
 * @param {object} ticketsData — Parsed/merged Tickets.json
 * @param {string} crimeId — targetCrime id (e.g. "TC-001")
 * @param {string} newKey — New deferral ticket key
 * @returns {boolean} — true if the crime was found and updated
 */
// [::TICKET::] PX-128: setCrimeDeferredTo. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-128 --for-spec --no-implementation-order`.
// [::TICKET::] PX-128 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-128 --for-spec --no-implementation-order`.
function setCrimeDeferredTo(ticketsData, crimeId, newKey) {
  for (const phase of ticketsData.phases) {
    for (const ticket of phase.tickets || []) {
      const crime = (ticket.targetCrimes || []).find(c => c.id === crimeId);
      if (crime) {
        crime.deferredTo = newKey;
        return true;
      }
    }
  }
  return false;
}

/**
 * Create a deferral ticket (non-PX max-phase todo) from the started ticket's clone,
 * and — when a crimeId is given — set that targetCrime's deferredTo to the new key.
 * Appends a NEW ticket only; never mutates any existing ticket's status.
 * @param {object} params
 * @param {object} params.ticketsData — Parsed Tickets.json
 * @param {string} params.sourceKey — Started ticket key ($ARGUMENTS)
 * @param {object} params.seed — Work-item seed (title required)
 * @param {string|null} [params.crimeId] — targetCrime id whose deferredTo to set
 * @returns {{ success: true, key: string, ticket: object, data: object }
 *          |{ success: false, error: string, errors?: string[] }}
 */
// [::TICKET::] PX-128: createCrimeDeferralTicket. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-128 --for-spec --no-implementation-order`.
// [::TICKET::] PX-128 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-128 --for-spec --no-implementation-order`.
function createCrimeDeferralTicket({ ticketsData, sourceKey, seed, crimeId = null }) {
  const res = createTicketFromSource({ ticketsData, sourceKey, seed });
  if (!res.success) return res;
  if (crimeId) {
    if (!setCrimeDeferredTo(res.data, crimeId, res.key)) {
      return { success: false, error: 'targetCrime not found: ' + crimeId };
    }
  }
  return res;
}

/**
 * Build the Markdown Action-directive printed to stdout after creation.
 * @param {{ key: string, sourceKey: string }} params — New key and source key
 * @returns {string} — Markdown guidance
 */
// [::TICKET::] PX-128: buildMarkdownGuidance. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-128 --for-spec --no-implementation-order`.
// [::TICKET::] PX-128 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-128 --for-spec --no-implementation-order`.
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
    'The script set the targetCrime\'s `deferredTo` to **' + key + '** (when `--crime-id` was passed). Verify it if `--crime-id` was omitted, then rewrite the crime reference to **' + key + '**.',
    '',
    '### 4. PRESERVE — do not touch',
    '',
    PRESERVE_LIST + ' are already correct from the clone. You may **add** (`--append` for arrays), never remove.'
  ].join('\n');
}

/**
 * Parse CLI arguments.
 * @param {string[]} [argv] — Arguments (defaults to process.argv.slice(2))
 * @returns {{ sourceKey: string|null, crimeId: string|null, tickets: string }}
 */
// [::TICKET::] PX-128: parseArgs. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-128 --for-spec --no-implementation-order`.
// [::TICKET::] PX-128 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-128 --for-spec --no-implementation-order`.
function parseArgs(argv) {
  const args = argv || process.argv.slice(2);
  const parsed = { sourceKey: null, crimeId: null, tickets: 'Tickets.json' };
  for (const arg of args) {
    if (arg.startsWith('--source-key=')) {
      parsed.sourceKey = arg.slice('--source-key='.length);
    } else if (arg.startsWith('--crime-id=')) {
      parsed.crimeId = arg.slice('--crime-id='.length);
    } else if (arg.startsWith('--tickets=')) {
      parsed.tickets = arg.slice('--tickets='.length);
    }
  }
  return parsed;
}

// -- CLI entry point --

/** Read all of stdin as a string. */
// [::TICKET::] PX-128 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-128 --for-spec --no-implementation-order`.
function readStdin() {
  return new Promise((resolve) => {
    let chunks = '';
    process.stdin.on('data', (c) => { chunks += c; });
    process.stdin.on('end', () => resolve(chunks));
  });
}

// [::TICKET::] PX-128 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-128 --for-spec --no-implementation-order`.
async function main() {
  const { sourceKey, crimeId, tickets } = parseArgs();
  if (!sourceKey) {
    process.stderr.write('[create-crime-deferral-ticket] Error: --source-key is required.\n');
    process.exit(1);
  }

  const ticketsPath = path.resolve(tickets);
  let ticketsData;
  try {
    ticketsData = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  } catch (e) {
    process.stderr.write('[create-crime-deferral-ticket] Error: cannot read Tickets.json: ' + e.message + '\n');
    process.exit(1);
  }

  let seed = {};
  try {
    const stdinData = await readStdin();
    if (stdinData.trim()) seed = JSON.parse(stdinData);
  } catch (e) {
    process.stderr.write('[create-crime-deferral-ticket] Error: cannot parse seed JSON from stdin: ' + e.message + '\n');
    process.exit(1);
  }

  const res = createCrimeDeferralTicket({ ticketsData, sourceKey, seed, crimeId });
  if (!res.success) {
    process.stderr.write('[create-crime-deferral-ticket] Error: ' + res.error + '\n');
    if (Array.isArray(res.errors)) process.stderr.write('  ' + res.errors.join('\n  ') + '\n');
    process.exit(1);
  }

  try {
    fs.writeFileSync(ticketsPath, JSON.stringify(res.data, null, 2) + '\n', 'utf8');
  } catch (e) {
    process.stderr.write('[create-crime-deferral-ticket] Error: cannot write Tickets.json: ' + e.message + '\n');
    process.exit(1);
  }

  process.stdout.write(buildMarkdownGuidance({ key: res.key, sourceKey }) + '\n');
}

if (require.main === module) {
  main().catch((e) => {
    process.stderr.write('[create-crime-deferral-ticket] Error: ' + ((e && e.message) || e) + '\n');
    process.exit(1);
  });
}

module.exports = { createCrimeDeferralTicket, buildMarkdownGuidance, parseArgs, setCrimeDeferredTo };
