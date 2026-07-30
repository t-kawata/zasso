#!/usr/bin/env node
// [::TICKET::] PX-97: Tickets.json schema拡張 & tmp-omissions作成スクリプト. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-97 --for-spec --no-implementation-order`.

/**
 * create-tmp-omissions.js — find-omissions Step 1
 *
 * Collects STUB markers from find-all-stubs.js output and non-reviewed tickets
 * from Tickets.json, merges them into _tmp-omissions-<timestamp>.json.
 *
 * The output follows the same schema as Tickets.json (phases[].tickets[]),
 * with each ticket carrying fromStub and stubs fields.
 *
 * Usage: node create-tmp-omissions.js [--tickets=<Tickets.json>]
 *
 * [::TICKET::] PX-97: create-tmp-omissions implementation
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// -- Constants --

// Matches ticket keys like P3-2, PX-53, P12-3 in STUB content
const STUB_TICKET_KEY_RE = /\[::STUB::\].*?([A-Z]+[A-Z\d]*-\d+)/;

const REJECTION_WARNING =
  'This ticket has been flagged for rejection due to detection of implementation deficiencies, ' +
  'unresolved STUB markers, or other violations. It has been returned for re-implementation. ' +
  'A complete implementation free of all defects, STUB markers, and violations must be achieved.';

const TIMESTAMP_FORMAT_RE = /^\d{14}$/;

// -- Pure functions (exported for testing) --

/**
 * Extract unique ticket keys from find-all-stubs.js JSON output.
 * @param {object} findAllOutput — Parsed JSON { success, count, stubs[] }
 * @returns {string[]} — Unique ticket key strings
 */
// [::TICKET::] PX-97, PX-98 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-97|PX-98) --for-spec --no-implementation-order`.
function extractTicketKeysFromStubs(findAllOutput) {
  if (!findAllOutput || !Array.isArray(findAllOutput.stubs)) {
    return [];
  }
  const keys = new Set();
  for (const stub of findAllOutput.stubs) {
    if (stub && stub.content) {
      const match = stub.content.match(STUB_TICKET_KEY_RE);
      if (match) {
        keys.add(match[1]);
      }
    }
  }
  return Array.from(keys);
}

/**
 * Collect ticket keys of all non-reviewed tickets from Tickets.json data.
 * Non-reviewed = status !== 'reviewed' (todo, in_progress, made, planned, done, etc.)
 *
 * @param {object} ticketsData — Parsed Tickets.json { phases[] }
 * @returns {string[]} — Ticket keys in "P{phaseId}-{ticketId}" format
 */
// [::TICKET::] PX-97, PX-98 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-97|PX-98) --for-spec --no-implementation-order`.
function collectNonReviewedTickets(ticketsData) {
  if (!ticketsData || !Array.isArray(ticketsData.phases)) {
    return [];
  }
  const keys = [];
  for (const phase of ticketsData.phases) {
    if (!phase || !Array.isArray(phase.tickets)) continue;
    for (const ticket of phase.tickets) {
      if (ticket.status !== 'reviewed') {
        const phaseId = ticket.phaseId !== undefined ? ticket.phaseId : phase.id;
        const phasePrefix = phaseId === -1 ? 'X' : phaseId;
        keys.push('P' + phasePrefix + '-' + ticket.id);
      }
    }
  }
  return keys;
}

/**
 * Merge stub-derived ticket keys with non-reviewed ticket keys.
 * Each entry gets fromStub=true if derived from STUB markers.
 *
 * @param {string[]} stubKeys — Ticket keys from STUB analysis
 * @param {string[]} pendingKeys — Ticket keys from non-reviewed tickets
 * @param {object} stubsMap — { ticketKey: [{ file, line, content }] }
 * @returns {Array<{ticketKey: string, fromStub: boolean, stubs: Array}>}
 */
// [::TICKET::] PX-97, PX-98 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-97|PX-98) --for-spec --no-implementation-order`.
function mergeTicketSources(stubKeys, pendingKeys, stubsMap) {
  const seen = new Set();
  const result = [];

  // Stub-derived entries first (fromStub: true)
  for (const key of stubKeys) {
    if (!seen.has(key)) {
      seen.add(key);
      result.push({
        ticketKey: key,
        fromStub: true,
        stubs: stubsMap[key] || []
      });
    }
  }

  // Non-reviewed entries (fromStub: false)
  for (const key of pendingKeys) {
    if (!seen.has(key)) {
      seen.add(key);
      result.push({
        ticketKey: key,
        fromStub: false,
        stubs: []
      });
    }
  }

  return result;
}

/**
 * Extract 3 lines of source code starting from the given line (1-indexed).
 * Returns empty string if file is missing or line is out of bounds.
 *
 * @param {string} filePath — Absolute path to source file
 * @param {number} line — 1-indexed starting line number
 * @returns {string} — Up to 3 lines of source code, or empty string
 */
// [::TICKET::] PX-97, PX-98 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-97|PX-98) --for-spec --no-implementation-order`.
function extractCodes(filePath, line) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    // line is 1-indexed; convert to 0-indexed
    const startIdx = line - 1;
    if (startIdx < 0 || startIdx >= lines.length) {
      return '';
    }
    const selected = lines.slice(startIdx, startIdx + 3);
    return selected.join('\n');
  } catch {
    return '';
  }
}

/**
 * Build a lookup map from Tickets.json data for fast ticket retrieval.
 * Key format: "P{phaseId}-{ticketId}" (PX-{id} for phase -1).
 *
 * @param {object} ticketsData — Parsed Tickets.json { phases[] }
 * @returns {Map<string, object>} — Map of ticketKey → ticket object
 */
function buildTicketLookup(ticketsData) {
  const map = new Map();
  if (!ticketsData || !Array.isArray(ticketsData.phases)) {
    return map;
  }
  for (const phase of ticketsData.phases) {
    if (!phase || !Array.isArray(phase.tickets)) continue;
    for (const ticket of phase.tickets) {
      const phaseId = ticket.phaseId !== undefined ? ticket.phaseId : phase.id;
      const phasePrefix = phaseId === -1 ? 'X' : phaseId;
      const key = 'P' + phasePrefix + '-' + ticket.id;
      map.set(key, ticket);
    }
  }
  return map;
}

/**
 * Enrich merged entries with full original ticket data.
 * Deep-clones the original ticket, adds fromStub/stubs fields,
 * and prepends the rejection warning to background.
 *
 * @param {Array} mergedEntries — Result from mergeTicketSources()
 * @param {object} ticketsData — Parsed Tickets.json (for phase name lookup)
 * @param {Map<string, object>} ticketLookup — Map from buildTicketLookup()
 * @returns {object[]} — Array of enriched full ticket objects
 */
function enrichTickets(mergedEntries, ticketsData, ticketLookup) {
  return mergedEntries.map(entry => {
    const original = ticketLookup.get(entry.ticketKey);
    if (original) {
      // Deep-clone: preserve ALL original fields
      const cloned = JSON.parse(JSON.stringify(original));
      // Add new schema fields
      cloned.fromStub = entry.fromStub;
      cloned.stubs = entry.stubs;
      // Prepend rejection warning to background
      cloned.background = REJECTION_WARNING + '\n\n' + (cloned.background || '');
      return cloned;
    }
    // Fallback: STUB references a ticket not found in Tickets.json
    const keyMatch = entry.ticketKey.match(/^P(-?\d+|X)-(\d+)$/);
    const phaseId = keyMatch ? (keyMatch[1] === 'X' ? -1 : parseInt(keyMatch[1], 10)) : -1;
    const ticketId = keyMatch ? parseInt(keyMatch[2], 10) : 0;
    return {
      id: ticketId,
      phaseId: phaseId,
      status: 'unknown',
      title: '(auto-detected via STUB marker)',
      background: REJECTION_WARNING + '\n\n(Auto-detected via STUB marker — original ticket not found in Tickets.json)',
      fromStub: entry.fromStub,
      stubs: entry.stubs
    };
  });
}

/**
 * Build the output JSON object matching Tickets.json schema from enriched tickets.
 *
 * @param {object[]} enrichedTickets — Enriched ticket objects (from enrichTickets)
 * @param {object} template — Template with title and metadata from Tickets.json
 * @returns {object} — Output JSON { title, metadata, phases }
 */
// [::TICKET::] PX-97, PX-98 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-97|PX-98) --for-spec --no-implementation-order`.
function buildOutputJson(enrichedTickets, template) {
  const output = {
    title: template.title || 'tmp-omissions',
    metadata: {
      source: (template.metadata && template.metadata.source) || 'create-tmp-omissions.js',
      generatedAt: (template.metadata && template.metadata.generatedAt) || '',
      analyzedSections: (template.metadata && template.metadata.analyzedSections) || ''
    },
    phases: []
  };

  if (!enrichedTickets || enrichedTickets.length === 0) {
    return output;
  }

  // Group enriched tickets by phaseId
  const phaseMap = new Map();
  for (const ticket of enrichedTickets) {
    const pid = ticket.phaseId !== undefined ? ticket.phaseId : -1;
    if (!phaseMap.has(pid)) {
      phaseMap.set(pid, []);
    }
    phaseMap.get(pid).push(ticket);
  }

  // Convert phase map to output phases, preserving phase names from original
  const phaseNames = new Map();
  if (template.phases) {
    for (const p of template.phases) {
      phaseNames.set(p.id, p.name);
    }
  }
  for (const [phaseId, tickets] of phaseMap) {
    output.phases.push({
      id: phaseId,
      name: phaseNames.get(phaseId) || 'Phase ' + phaseId,
      characteristics: '',
      tickets
    });
  }

  return output;
}

/**
 * Format current timestamp as YYYYMMDDhhmmss.
 * @returns {string} — 14-digit timestamp
 */
// [::TICKET::] PX-97, PX-98 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-97|PX-98) --for-spec --no-implementation-order`.
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

// [::TICKET::] PX-97, PX-98 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-97|PX-98) --for-spec --no-implementation-order`.
function main() {
  // Parse CLI args
  const args = process.argv.slice(2);
  let ticketsPath = 'Tickets.json';

  for (const arg of args) {
    if (arg.startsWith('--tickets=')) {
      ticketsPath = arg.slice('--tickets='.length);
    }
  }

  const resolvedTicketsPath = path.resolve(ticketsPath);

  // Step 1: Run find-all-stubs.js
  const findStubsScript = path.resolve(__dirname, 'review/find-all-stubs.js');
  let findOutput;
  try {
    const stdout = execFileSync('node', [findStubsScript, process.cwd()], { encoding: 'utf8' });
    findOutput = JSON.parse(stdout);
  } catch (execError) {
    console.error('[create-tmp-omissions] Error: find-all-stubs.js failed', execError.stderr || execError.message);
    process.exit(1);
  }

  // Step 2: Read Tickets.json
  let ticketsData;
  try {
    ticketsData = JSON.parse(fs.readFileSync(resolvedTicketsPath, 'utf8'));
  } catch (readError) {
    console.error('[create-tmp-omissions] Error: Cannot read Tickets.json:', readError.message);
    process.exit(1);
  }

  // Step 3: Extract ticket keys from STUBs
  const stubKeys = extractTicketKeysFromStubs(findOutput);

  // Step 4: Collect non-reviewed tickets
  const pendingKeys = collectNonReviewedTickets(ticketsData);

  // Step 5: Build stubsMap for merge
  const stubsMap = {};
  if (findOutput.stubs) {
    for (const stub of findOutput.stubs) {
      const match = stub.content.match(STUB_TICKET_KEY_RE);
      if (match) {
        const key = match[1];
        if (!stubsMap[key]) stubsMap[key] = [];
        stubsMap[key].push({
          file: stub.file,
          content: stub.content,
          codes: extractCodes(stub.file, stub.line + 1)
        });
      }
    }
  }

  // Step 6: Merge sources
  const mergedEntries = mergeTicketSources(stubKeys, pendingKeys, stubsMap);

  // Step 7: Build ticket lookup and enrich tickets (full deep-copy from Tickets.json)
  const ticketLookup = buildTicketLookup(ticketsData);
  const enrichedTickets = enrichTickets(mergedEntries, ticketsData, ticketLookup);

  // Step 8: Build output JSON from enriched tickets
  const output = buildOutputJson(enrichedTickets, ticketsData);

  // Step 9: Write output file
  const timestamp = formatTimestamp();
  const outputFileName = '_tmp-omissions-' + timestamp + '.json';
  const outputPath = path.resolve(outputFileName);

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');
  console.log(outputPath);
  console.error('[create-tmp-omissions] Output written:', outputPath);
  console.error('[create-tmp-omissions] STUB keys:', stubKeys.length, ', pending keys:', pendingKeys.length, ', merged:', mergedEntries.length);
}

// -- Export for testing --
module.exports = {
  extractTicketKeysFromStubs,
  collectNonReviewedTickets,
  mergeTicketSources,
  extractCodes,
  buildTicketLookup,
  enrichTickets,
  buildOutputJson,
  main,
  STUB_TICKET_KEY_RE,
  REJECTION_WARNING,
  formatTimestamp
};

// Run as CLI
if (require.main === module) {
  main();
}
