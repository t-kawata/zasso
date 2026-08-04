#!/usr/bin/env node
// [::TICKET::] PX-123: Create create-resolving-ticket.js. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-123 --for-spec --no-implementation-order`.

/**
 * create-resolving-ticket.js — find-omissions Step 1: auto-create a resolving ticket.
 *
 * Given a marker's referenced ticket key and a work-item seed, deep-clones the
 * source ticket via createTicketFromSource (PX-122), embeds the marker stubs[]
 * (so phasify's rewriteOutputStubKeys can re-rewrite markers to the phasify
 * duplicates after the Step 9 merge), and prints a Markdown Action-directive:
 * old-content warning, field-by-field update-ticket.js rewrite instructions,
 * and the PRESERVE list. Never pauses to ask the human.
 *
 * Usage:
 *   echo '{"title":"(work item)","scope":[...],"background":"..."}' | node create-resolving-ticket.js \
 *     --source-key=<marker's referenced ticket> --stubs='[{"file":"...","line":N,"content":"..."}]' \
 *     --tickets=Tickets.json
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
 * Create a resolving ticket and embed the marker stubs[] for phasify re-rewrite.
 * @param {object} params
 * @param {object} params.ticketsData — Parsed Tickets.json
 * @param {string} params.sourceKey — Marker's referenced ticket key
 * @param {object} params.seed — Work-item seed (title required)
 * @param {Array} [params.stubs] — Marker entries [{ file, line, content }]
 * @returns {{ success: true, key: string, ticket: object, data: object }
 *          |{ success: false, error: string, errors?: string[] }}
 */
// [::TICKET::] PX-123: createResolvingTicket. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-123 --for-spec --no-implementation-order`.
// [::TICKET::] PX-123, PX-124, PX-125, PX-126, PX-127 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-123|PX-124|PX-125|PX-126|PX-127) --for-spec --no-implementation-order`.
function createResolvingTicket({ ticketsData, sourceKey, seed, stubs = [] }) {
  const res = createTicketFromSource({ ticketsData, sourceKey, seed });
  if (!res.success) return res;
  res.ticket.stubs = stubs;
  return res;
}

/**
 * Build the Markdown Action-directive printed to stdout after creation.
 * @param {{ key: string, sourceKey: string }} params — New key and source key
 * @returns {string} — Markdown guidance
 */
// [::TICKET::] PX-123: buildMarkdownGuidance. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-123 --for-spec --no-implementation-order`.
// [::TICKET::] PX-123, PX-124, PX-125, PX-126, PX-127 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-123|PX-124|PX-125|PX-126|PX-127) --for-spec --no-implementation-order`.
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
    '### 3. PRESERVE — do not touch',
    '',
    PRESERVE_LIST + ' are already correct from the clone. You may **add** (`--append` for arrays), never remove.'
  ].join('\n');
}

/**
 * Parse CLI arguments.
 * @param {string[]} [argv] — Arguments (defaults to process.argv.slice(2))
 * @returns {{ sourceKey: string|null, stubs: Array, tickets: string }}
 */
// [::TICKET::] PX-123: parseArgs. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-123 --for-spec --no-implementation-order`.
// [::TICKET::] PX-123, PX-124, PX-125, PX-126, PX-127 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-123|PX-124|PX-125|PX-126|PX-127) --for-spec --no-implementation-order`.
function parseArgs(argv) {
  const args = argv || process.argv.slice(2);
  const parsed = { sourceKey: null, stubs: [], tickets: 'Tickets.json' };
  for (const arg of args) {
    if (arg.startsWith('--source-key=')) {
      parsed.sourceKey = arg.slice('--source-key='.length);
    } else if (arg.startsWith('--stubs=')) {
      parsed.stubs = JSON.parse(arg.slice('--stubs='.length));
    } else if (arg.startsWith('--tickets=')) {
      parsed.tickets = arg.slice('--tickets='.length);
    }
  }
  return parsed;
}

// -- CLI entry point --

/** Read all of stdin as a string. */
// [::TICKET::] PX-123, PX-124, PX-125, PX-126, PX-127 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-123|PX-124|PX-125|PX-126|PX-127) --for-spec --no-implementation-order`.
function readStdin() {
  return new Promise((resolve) => {
    let chunks = '';
    process.stdin.on('data', (c) => { chunks += c; });
    process.stdin.on('end', () => resolve(chunks));
  });
}

// [::TICKET::] PX-123, PX-124, PX-125, PX-126, PX-127 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-123|PX-124|PX-125|PX-126|PX-127) --for-spec --no-implementation-order`.
async function main() {
  const { sourceKey, stubs, tickets } = parseArgs();
  if (!sourceKey) {
    process.stderr.write('[create-resolving-ticket] Error: --source-key is required.\n');
    process.exit(1);
  }

  const ticketsPath = path.resolve(tickets);
  let ticketsData;
  try {
    ticketsData = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  } catch (e) {
    process.stderr.write('[create-resolving-ticket] Error: cannot read Tickets.json: ' + e.message + '\n');
    process.exit(1);
  }

  let seed = {};
  try {
    const stdinData = await readStdin();
    if (stdinData.trim()) seed = JSON.parse(stdinData);
  } catch (e) {
    process.stderr.write('[create-resolving-ticket] Error: cannot parse seed JSON from stdin: ' + e.message + '\n');
    process.exit(1);
  }

  const res = createResolvingTicket({ ticketsData, sourceKey, seed, stubs });
  if (!res.success) {
    process.stderr.write('[create-resolving-ticket] Error: ' + res.error + '\n');
    if (Array.isArray(res.errors)) process.stderr.write('  ' + res.errors.join('\n  ') + '\n');
    process.exit(1);
  }

  try {
    fs.writeFileSync(ticketsPath, JSON.stringify(res.data, null, 2) + '\n', 'utf8');
  } catch (e) {
    process.stderr.write('[create-resolving-ticket] Error: cannot write Tickets.json: ' + e.message + '\n');
    process.exit(1);
  }

  process.stdout.write(buildMarkdownGuidance({ key: res.key, sourceKey }) + '\n');
}

if (require.main === module) {
  main().catch((e) => {
    process.stderr.write('[create-resolving-ticket] Error: ' + ((e && e.message) || e) + '\n');
    process.exit(1);
  });
}

module.exports = { createResolvingTicket, buildMarkdownGuidance, parseArgs };
