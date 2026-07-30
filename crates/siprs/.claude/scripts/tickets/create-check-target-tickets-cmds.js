#!/usr/bin/env node
// [::TICKET::] PX-98: 完了済み実装状況検査対象コマンドリスト生成スクリプト. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-98 --for-spec --no-implementation-order`.

/**
 * create-check-target-tickets-cmds.js — find-omissions Step 2
 *
 * Collects all reviewed ticket keys from Tickets.json and generates
 * a JSON command list file (_tmp-check-target-tickets-cmds-<timestamp>.json)
 * for Step 3 (AI inspection) to consume.
 *
 * Each entry: { done: false, cmd: "node .../show-ticket-context.js --ticket-key=KEY --for-spec" }
 *
 * Usage: node create-check-target-tickets-cmds.js [--tickets=<Tickets.json>]
 *
 * [::TICKET::] PX-98: create-check-target-tickets-cmds implementation
 */

const fs = require('fs');
const path = require('path');

// -- Constants --

const SHOW_TICKET_CMD_TEMPLATE = 'node .claude/scripts/tickets/show-ticket-context.js --ticket-key=KEY --for-spec --no-implementation-order';

// -- Pure functions (exported for testing) --

/**
 * Collect ticket keys of all reviewed tickets from Tickets.json data.
 * Keys are in "P{phaseId}-{ticketId}" format (PX-{id} for phase -1).
 *
 * @param {object} ticketsData — Parsed Tickets.json { phases[] }
 * @returns {string[]} — Reviewed ticket key strings
 */
// [::TICKET::] PX-98 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-98 --for-spec --no-implementation-order`.
function collectReviewedTicketKeys(ticketsData) {
  if (!ticketsData || !Array.isArray(ticketsData.phases)) {
    return [];
  }
  const keys = [];
  for (const phase of ticketsData.phases) {
    if (!phase || !Array.isArray(phase.tickets)) continue;
    for (const ticket of phase.tickets) {
      if (ticket.status === 'reviewed') {
        const phaseId = ticket.phaseId !== undefined ? ticket.phaseId : phase.id;
        const phasePrefix = phaseId === -1 ? 'X' : phaseId;
        keys.push('P' + phasePrefix + '-' + ticket.id);
      }
    }
  }
  return keys;
}

/**
 * Build a show-ticket-context.js command string for a ticket key.
 *
 * @param {string} ticketKey — e.g. "P3-2" or "PX-53"
 * @returns {string} — Shell command string
 */
// [::TICKET::] PX-98 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-98 --for-spec --no-implementation-order`.
// [::TICKET::] PX-99, PX-100, PX-101 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-99|PX-100|PX-101) --for-spec --no-implementation-order`.
function buildCommand(ticketKey) {
  return SHOW_TICKET_CMD_TEMPLATE.replace('KEY', ticketKey);
}

/**
 * Build command entries array from ticket keys.
 *
 * @param {string[]} ticketKeys — Array of ticket key strings
 * @returns {Array<{done: boolean, cmd: string}>}
 */
// [::TICKET::] PX-98 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-98 --for-spec --no-implementation-order`.
function buildEntries(ticketKeys) {
  return ticketKeys.map(key => ({
    done: false,
    cmd: buildCommand(key)
  }));
}

/**
 * Write command entries to a JSON output file.
 *
 * @param {string} outputPath — Absolute path to output file
 * @param {Array} entries — Command entries array
 */
// [::TICKET::] PX-98 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-98 --for-spec --no-implementation-order`.
function writeOutput(outputPath, entries) {
  fs.writeFileSync(outputPath, JSON.stringify(entries, null, 2), 'utf8');
}

/**
 * Format current timestamp as YYYYMMDDhhmmss.
 * @returns {string} — 14-digit timestamp
 */
// [::TICKET::] PX-98 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-98 --for-spec --no-implementation-order`.
function formatTimestamp() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return '' + y + m + d + h + min + s;
}

// -- CLI entry point --

// [::TICKET::] PX-98 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-98 --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  let ticketsPath = 'Tickets.json';

  for (const arg of args) {
    if (arg.startsWith('--tickets=')) {
      ticketsPath = arg.slice('--tickets='.length);
    }
  }

  const resolvedTicketsPath = path.resolve(ticketsPath);

  // Read Tickets.json
  let ticketsData;
  try {
    ticketsData = JSON.parse(fs.readFileSync(resolvedTicketsPath, 'utf8'));
  } catch (readError) {
    console.error('[create-check-target-tickets-cmds] Error: Cannot read Tickets.json:', readError.message);
    process.exit(1);
  }

  // Collect reviewed ticket keys
  const reviewedKeys = collectReviewedTicketKeys(ticketsData);

  // Build entries and write output
  const entries = buildEntries(reviewedKeys);
  const timestamp = formatTimestamp();
  const outputFileName = '_tmp-check-target-tickets-cmds-' + timestamp + '.json';
  const outputPath = path.resolve(outputFileName);

  writeOutput(outputPath, entries);
  console.log(outputPath);
  console.error('[create-check-target-tickets-cmds] Output written:', outputPath);
  console.error('[create-check-target-tickets-cmds] Reviewed tickets:', reviewedKeys.length, ', entries:', entries.length);
}

// -- Export for testing --
module.exports = {
  collectReviewedTicketKeys,
  buildCommand,
  buildEntries,
  writeOutput,
  main,
  SHOW_TICKET_CMD_TEMPLATE,
  formatTimestamp
};

if (require.main === module) {
  main();
}
