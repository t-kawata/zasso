#!/usr/bin/env node
// [::TICKET::] PX-101: Create get-next-check-target-ticket.js. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-101 --for-spec --no-implementation-order`.

/**
 * get-next-check-target-ticket.js — Unified orchestrator for find-omissions pipeline
 *
 * Internally ensures _tmp-omissions-*.json and _tmp-check-target-tickets-cmds-*.json
 * exist (running create-* scripts if missing), pops the next unchecked entry,
 * marks it as done, updates Tickets.json status to remanded, and executes
 * show-ticket-context.js with the appropriate flags.
 *
 * Usage:
 *   node get-next-check-target-ticket.js [--tickets=<Tickets.json>] [--with-clean-trash]
 *
 * [::TICKET::] PX-101: get-next-check-target-ticket implementation
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// -- Constants --

const TMP_OMISSIONS_PATTERN = /^_tmp-omissions-\d{14}\.json$/;
const TMP_CMDS_PATTERN = /^_tmp-check-target-tickets-cmds-\d{14}\.json$/;

// -- Pure functions (exported for testing) --

/**
 * Find the first done:false entry in the commands array.
 * Marks it done:true in-place (mutation is intentional — caller persists the array).
 *
 * @param {Array<{done: boolean, cmd: string}>} entries — Command entries array
 * @returns {{entry: object, idx: number}|null} — The popped entry + index, or null
 */
// [::TICKET::] PX-101 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-101 --for-spec --no-implementation-order`.
function popNextEntry(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return null;
  }
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].done === false) {
      entries[i].done = true;
      return { entry: entries[i], idx: i };
    }
  }
  return null;
}

/**
 * Set a ticket's status to "remanded" in Tickets.json data by ticket key.
 * Key format: P{phaseId}-{ticketId} (PX-{id} for phase -1).
 *
 * @param {object} ticketsData — Parsed Tickets.json { phases[] }
 * @param {string} ticketKey — e.g. "P3-2" or "PX-53"
 * @returns {{ticket: object, data: object, phase: object}|null}
 */
// [::TICKET::] PX-101 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-101 --for-spec --no-implementation-order`.
function setTicketRemanded(ticketsData, ticketKey) {
  if (!ticketsData || !Array.isArray(ticketsData.phases)) {
    return null;
  }
  const match = ticketKey.match(/^P(-?\d+|X)-(\d+)$/);
  if (!match) return null;
  const phaseId = match[1] === 'X' ? -1 : parseInt(match[1], 10);
  const ticketId = parseInt(match[2], 10);

  for (const phase of ticketsData.phases) {
    if (phase.id === phaseId) {
      const ticket = phase.tickets.find(t => t.id === ticketId);
      if (ticket) {
        ticket.status = 'remanded';
        return { ticket, data: ticketsData, phase };
      }
    }
  }
  return null;
}

/**
 * Build the progress prefix message.
 *
 * @param {number} total — Total number of entries
 * @param {number} current — 1-indexed current position
 * @returns {string} — e.g. "Total 5 tickets to inspect. Inspecting ticket 3/5."
 */
// [::TICKET::] PX-101, PX-102, PX-103 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-101|PX-102|PX-103) --for-spec --no-implementation-order`.
function buildPrefixMessage(total, current) {
  return 'Total ' + total + ' tickets to inspect. Inspecting ticket ' + current + '/' + total + '.\n';
}

/**
 * Find the latest _tmp-omissions-*.json in CWD.
 * @returns {string|null} — Absolute path or null
 */
// [::TICKET::] PX-101 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-101 --for-spec --no-implementation-order`.
function findLatestTmpOmissions() {
  const files = fs.readdirSync('.').filter(f => TMP_OMISSIONS_PATTERN.test(f));
  if (files.length === 0) return null;
  files.sort().reverse();
  return path.resolve(files[0]);
}

/**
 * Find the latest _tmp-check-target-tickets-cmds-*.json in CWD.
 * @returns {string|null} — Absolute path or null
 */
// [::TICKET::] PX-101 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-101 --for-spec --no-implementation-order`.
function findLatestTmpCmds() {
  const files = fs.readdirSync('.').filter(f => TMP_CMDS_PATTERN.test(f));
  if (files.length === 0) return null;
  files.sort().reverse();
  return path.resolve(files[0]);
}

/**
 * Ensure _tmp-omissions-*.json exists. If not, run create-tmp-omissions.js.
 *
 * @param {string} ticketsPath — Absolute path to Tickets.json
 * @returns {string} — Absolute path to the tmp-omissions file
 */
// [::TICKET::] PX-101 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-101 --for-spec --no-implementation-order`.
function ensureOmitsFileExists(ticketsPath) {
  const existing = findLatestTmpOmissions();
  if (existing) {
    return existing;
  }
  // Run create-tmp-omissions.js
  const createScript = path.resolve(__dirname, 'create-tmp-omissions.js');
  try {
    const stdout = execFileSync('node', [createScript, '--tickets=' + ticketsPath], {
      encoding: 'utf8',
      cwd: process.cwd()
    });
    // The script outputs the file path on stdout
    const outputPath = stdout.trim().split('\n')[0];
    if (outputPath && fs.existsSync(outputPath)) {
      return outputPath;
    }
    // Fallback: find by pattern
    const found = findLatestTmpOmissions();
    if (found) return found;
    throw new Error('create-tmp-omissions.js ran but no output file found');
  } catch (err) {
    console.error('[get-next-check-target-ticket] Error: create-tmp-omissions.js failed:', err.stderr || err.message);
    process.exit(1);
  }
}

/**
 * Ensure _tmp-check-target-tickets-cmds-*.json exists. If not, run create-check-target-tickets-cmds.js.
 *
 * @param {string} ticketsPath — Absolute path to Tickets.json
 * @returns {string} — Absolute path to the cmds file
 */
// [::TICKET::] PX-101 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-101 --for-spec --no-implementation-order`.
function ensureCmdsFileExists(ticketsPath) {
  const existing = findLatestTmpCmds();
  if (existing) {
    return existing;
  }
  const createScript = path.resolve(__dirname, 'create-check-target-tickets-cmds.js');
  try {
    const stdout = execFileSync('node', [createScript, '--tickets=' + ticketsPath], {
      encoding: 'utf8',
      cwd: process.cwd()
    });
    const outputPath = stdout.trim().split('\n')[0];
    if (outputPath && fs.existsSync(outputPath)) {
      return outputPath;
    }
    const found = findLatestTmpCmds();
    if (found) return found;
    throw new Error('create-check-target-tickets-cmds.js ran but no output file found');
  } catch (err) {
    console.error('[get-next-check-target-ticket] Error: create-check-target-tickets-cmds.js failed:', err.stderr || err.message);
    process.exit(1);
  }
}

/**
 * Execute show-ticket-context.js for a ticket key and capture stdout.
 *
 * @param {string} ticketKey — e.g. "P3-2"
 * @returns {string} — stdout from show-ticket-context.js
 */
// [::TICKET::] PX-101 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-101 --for-spec --no-implementation-order`.
function runShowTicketContext(ticketKey) {
  const showScript = path.resolve(__dirname, 'show-ticket-context.js');
  try {
    return execFileSync('node', [
      showScript,
      '--ticket-key=' + ticketKey,
      '--for-spec',
      '--no-implementation-order'
    ], { encoding: 'utf8', cwd: process.cwd() });
  } catch (err) {
    console.error('[get-next-check-target-ticket] Error: show-ticket-context.js failed for ' + ticketKey + ':', err.stderr || err.message);
    process.exit(1);
  }
}

/**
 * Remove the _tmp-check-target-tickets-cmds-*.json file.
 */
// [::TICKET::] PX-101, PX-102, PX-103 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-101|PX-102|PX-103) --for-spec --no-implementation-order`.
function removeCmdsFile() {
  const cmds = findLatestTmpCmds();
  if (cmds) { try { fs.unlinkSync(cmds); } catch (e) { /* ignore */ } }
}

/**
 * Copy _tmp-omissions-*.json to OMISSIONS-<timestamp>.json, then remove the tmp file.
 * The OMISSIONS file is the deliverable of /find-omissions.
 */
// [::TICKET::] PX-101, PX-102, PX-103, PX-105 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-101|PX-102|PX-103|PX-105) --for-spec --no-implementation-order`.
function removeOmitsFile() {
  const omissions = findLatestTmpOmissions();
  if (!omissions) return;
  // Extract timestamp from _tmp-omissions-<YYYYMMDDhhmmss>.json
  const basename = path.basename(omissions);
  const match = basename.match(/^_tmp-omissions-(\d{14})\.json$/);
  const timestamp = match ? match[1] : new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  // Copy to OMISSIONS-<timestamp>.json before deleting
  const omitsPath = path.resolve('OMISSIONS-' + timestamp + '.json');
  try {
    fs.copyFileSync(omissions, omitsPath);
  } catch (e) { /* ignore copy failure */ }
  try { fs.unlinkSync(omissions); } catch (e) { /* ignore */ }
}

// -- CLI entry point --

// [::TICKET::] PX-101, PX-102, PX-103 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-101|PX-102|PX-103) --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  let ticketsPath = 'Tickets.json';
  let withCleanTrash = false;

  for (const arg of args) {
    if (arg.startsWith('--tickets=')) {
      ticketsPath = arg.slice('--tickets='.length);
    }
    if (arg === '--with-clean-trash') {
      withCleanTrash = true;
    }
  }

  const resolvedTicketsPath = path.resolve(ticketsPath);

  // Validate Tickets.json exists
  if (!fs.existsSync(resolvedTicketsPath)) {
    console.error('[get-next-check-target-ticket] Error: Tickets.json not found:', resolvedTicketsPath);
    process.exit(1);
  }

  // Step 1: Ensure _tmp-omissions-*.json exists
  const tmpOmissionsPath = ensureOmitsFileExists(resolvedTicketsPath);

  // Step 2: Ensure _tmp-check-target-tickets-cmds-*.json exists
  const tmpCmdsPath = ensureCmdsFileExists(resolvedTicketsPath);

  // Step 3: Read cmds file
  let cmdsEntries;
  try {
    cmdsEntries = JSON.parse(fs.readFileSync(tmpCmdsPath, 'utf8'));
  } catch (readError) {
    console.error('[get-next-check-target-ticket] Error: Cannot read cmds file:', readError.message);
    process.exit(1);
  }

  // Step 4: Pop next unchecked entry
  // Distinguish between empty cmds (no reviewed tickets) and all entries consumed.
  if (cmdsEntries.length === 0) {
    console.error('[get-next-check-target-ticket] Error: No reviewed or remanded tickets found in Tickets.json.');
    console.error('[get-next-check-target-ticket] The cmds file is left for inspection:', tmpCmdsPath);
    process.exit(1);
  }
  const popped = popNextEntry(cmdsEntries);
  if (!popped) {
    // All done
    console.log('All tickets inspected.');
    if (withCleanTrash) {
      removeCmdsFile();
      removeOmitsFile();
    }
    process.exit(0);
  }

  const { entry, idx } = popped;

  // Step 5: Extract ticketKey from the cmd string
  const keyMatch = entry.cmd.match(/--ticket-key=([^\s]+)/);
  if (!keyMatch) {
    console.error('[get-next-check-target-ticket] Error: Cannot parse ticket key from cmd:', entry.cmd);
    process.exit(1);
  }
  const ticketKey = keyMatch[1];

  // Step 6: Persist updated cmds file
  try {
    fs.writeFileSync(tmpCmdsPath, JSON.stringify(cmdsEntries, null, 2), 'utf8');
  } catch (writeError) {
    console.error('[get-next-check-target-ticket] Error: Cannot write cmds file:', writeError.message);
    process.exit(1);
  }

  // Step 7: Update Tickets.json status to remanded
  try {
    const ticketsData = JSON.parse(fs.readFileSync(resolvedTicketsPath, 'utf8'));
    const result = setTicketRemanded(ticketsData, ticketKey);
    if (result) {
      fs.writeFileSync(resolvedTicketsPath, JSON.stringify(ticketsData, null, 2), 'utf8');
    }
  } catch (err) {
    console.error('[get-next-check-target-ticket] Error: Cannot update Tickets.json status:', err.message);
    process.exit(1);
  }

  // Step 8: Build prefix message
  const totalEntries = cmdsEntries.length;
  const currentIdx = idx + 1; // 1-indexed
  const prefix = buildPrefixMessage(totalEntries, currentIdx);
  console.log(prefix);

  // Step 9: Run show-ticket-context.js and pipe its stdout
  const showOutput = runShowTicketContext(ticketKey);
  process.stdout.write(showOutput);

  // Step 10: If all entries are done, clean up only with --with-clean-trash.
  // Never auto-delete — doing so would cause the next run to recreate the cmds file
  // from Tickets.json, which now includes remanded tickets, creating an infinite loop.
  const remaining = cmdsEntries.filter(e => !e.done).length;
  if (remaining === 0 && withCleanTrash) {
    removeCmdsFile();
    removeOmitsFile();
  }
}

// -- Export for testing --
module.exports = {
  popNextEntry,
  setTicketRemanded,
  buildPrefixMessage,
  removeOmitsFile,
  removeCmdsFile
};

// Run as CLI
if (require.main === module) {
  main();
}
