#!/usr/bin/env node

/**
 * enumerate-ticket-targets.js — Scan source files for [::STUB::] markers
 * and classify them as targetStubs (own ticket) or targetCrimes (other tickets).
 *
 * Output: Writes targetStubs/targetCrimes to Tickets.json for the given ticket.
 *
 * [::TICKET::] PX-77: Core Validation Scripts — enumerate-ticket-targets (C002, C003, C004)
 */

const fs = require('fs');
const path = require('path');
const { findTicket, ticketExists, ticketIsDone } = require('../lib/find-ticket');
const { syncMalfeasance } = require('../lib/malfeasance-utils');

// [::TICKET::] PX-90: Extensions to scan for STUB markers
// Only programming-language source file extensions.
// Non-programming extensions excluded to prevent self-referential cascade.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-90 --for-spec --no-implementation-order`
const TARGET_EXTENSIONS = new Set([
  '.rs', '.go', '.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs', '.vue',
  '.py', '.java', '.kt', '.swift', '.c', '.cpp', '.h', '.hpp',
  '.rb', '.php', '.cs',
]);

// PX-90: Excluded data files whose JSON content contains STUB text strings.
// Scanning these creates a self-referential crime cascade.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-90 --for-spec --no-implementation-order`
const EXCLUDED_FILENAMES = new Set(['Tickets.json', 'Malfeasance.json']);

// [::TICKET::] PX-77: Directories to skip during scan
// `.claude` is excluded to avoid a self-referencing loop: scanning the pipeline's
// own scripts would detect the pipeline's own [::STUB::] markers, causing infinite
// cross-ticket dependency chains. Pipeline internals are tracked by design-time
// RFC analysis, not by runtime STUB scanning.
const SKIP_DIRS = new Set(['node_modules', 'target', '.git', '.claude', 'dist', 'build']);

// Generate a unique STUB id
let stubCounter = 0;
// [::TICKET::] PX-77, PX-78, PX-79 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-77|PX-78|PX-79) --for-spec --no-implementation-order`.
// [::TICKET::] PX-88, PX-89 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-88|PX-89) --for-spec --no-implementation-order`.
function generateStubId() {
  stubCounter++;
  return 'TS-' + String(stubCounter).padStart(3, '0');
}


/**
 * Classify a STUB marker's target ticket key.
 * @param {string} targetRef — The ticket key referenced by the STUB
 * @param {object} ticketsData — Full tickets data
 * @param {string} ownTicketKey — The ticket key of the current ticket
 * @returns {{category: string, ticketRef: string, crimeType?: string}}
 */
// [::TICKET::] PX-77, PX-78, PX-79 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-77|PX-78|PX-79) --for-spec --no-implementation-order`.
function classifyStubs(targetRef, ticketsData, ownTicketKey) {
  // Normalize: handle "MUST RESOLVE" as "own ticket"
  if (targetRef === 'MUST RESOLVE') {
    return { category: 'targetStub', ticketRef: 'MUST RESOLVE' };
  }

  if (targetRef === ownTicketKey) {
    return { category: 'targetStub', ticketRef: targetRef };
  }

  // Check if target ticket exists
  if (!ticketExists(ticketsData, targetRef)) {
    return { category: 'crime', ticketRef: targetRef, crimeType: 'ORPHAN_TICKET_REF' };
  }

  // Target ticket exists — check if completed
  if (ticketIsDone(ticketsData, targetRef)) {
    return { category: 'crime', ticketRef: targetRef, crimeType: 'COMPLETED_TICKET_STALE' };
  }

  // Target ticket exists and is not done — treat as deferred
  return { category: 'targetStub', ticketRef: targetRef };
}

/**
 * Extract ticket references from a STUB marker line.
 * @param {string} line — The source line containing [::STUB::]
 * @returns {string|null} — The ticket key, e.g. "PX-77" or "MUST RESOLVE", or null
 */
// [::TICKET::] PX-77, PX-78, PX-79 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-77|PX-78|PX-79) --for-spec --no-implementation-order`.
function extractTicketRef(line) {
  const m = line.match(/\[::STUB::\]\s+((?:P[A-Z0-9]+-\d+|MUST\s+RESOLVE))/);
  return m ? m[1] : null;
}

/**
 * Scan a directory recursively for STUB markers.
 * @param {string} dirPath — Directory to scan
 * @param {object} ticketsData — Tickets.json data
 * @param {string} ownTicketKey — Current ticket key
 * @returns {{targetStubs: Array, targetCrimes: Array}}
 */
// [::TICKET::] PX-77, PX-78, PX-79 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-77|PX-78|PX-79) --for-spec --no-implementation-order`.
function scanDirectory(dirPath, ticketsData, ownTicketKey) {
  const targetStubs = [];
  const targetCrimes = [];

// [::TICKET::] PX-77, PX-78, PX-79 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-77|PX-78|PX-79) --for-spec --no-implementation-order`.
  function walk(currentPath) {
    let entries;
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      // PX-90: Skip data files whose content contains STUB text strings.
      if (EXCLUDED_FILENAMES.has(entry.name)) continue;

      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (TARGET_EXTENSIONS.has(ext)) {
          scanFile(fullPath, ticketsData, ownTicketKey, targetStubs, targetCrimes);
        }
      }
    }
  }

  walk(dirPath);
  return { targetStubs, targetCrimes };
}

/**
 * Scan a single source file for STUB markers.
 * @param {string} filePath
 * @param {object} ticketsData
 * @param {string} ownTicketKey
 * @param {Array} targetStubs — Accumulator
 * @param {Array} targetCrimes — Accumulator
 */
// [::TICKET::] PX-77, PX-78, PX-79 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-77|PX-78|PX-79) --for-spec --no-implementation-order`.
function scanFile(filePath, ticketsData, ownTicketKey, targetStubs, targetCrimes) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return;
  }

  const seenKeys = new Set();

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes('[::STUB::]')) continue;

    const targetRef = extractTicketRef(line);
    if (!targetRef) continue;

    // Deduplicate: skip if we've already classified this target ref from this file+line
    const dedupKey = filePath + ':' + (i + 1) + ':' + targetRef;
    if (seenKeys.has(dedupKey)) continue;
    seenKeys.add(dedupKey);

    const classification = classifyStubs(targetRef, ticketsData, ownTicketKey);
    const entry = {
      id: generateStubId(),
      ticketRef: targetRef,
      file: filePath,
      line: i + 1,
      markerText: line.trim(),
      contracts: [],
      deferredTo: null,
      status: classification.category === 'crime' ? 'pending' : 'pending',
    };

    if (classification.category === 'crime') {
      entry.crimeType = classification.crimeType;
      entry.falsePositive = { justification: '', approvedBy: '' };
      targetCrimes.push(entry);
    } else {
      entry.resolutionPlan = '';
      targetStubs.push(entry);
    }
  }
}

/**
 * Write targetStubs/targetCrimes to a specific ticket in Tickets.json.
 * @param {string} ticketsPath — Path to Tickets.json
 * @param {string} ticketKey — Ticket to update
 * @param {Array} targetStubs
 * @param {Array} targetCrimes
 * @returns {boolean} — true if written successfully
 */
// [::TICKET::] PX-77, PX-78, PX-79 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-77|PX-78|PX-79) --for-spec --no-implementation-order`.
function writeTargetsToTickets(ticketsPath, ticketKey, targetStubs, targetCrimes) {
  const data = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  const ticket = findTicket(data, ticketKey);
  if (!ticket) return false;

  // For idempotency: if existing targets exist, merge (replace with fresh data)
  ticket.targetStubs = targetStubs.length > 0 ? targetStubs : 'verified_empty';
  ticket.targetCrimes = targetCrimes.length > 0 ? targetCrimes : 'verified_empty';

  fs.writeFileSync(ticketsPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  return true;
}

/**
 * Main enumerate function: scan directory, classify STUBs, write to Tickets.json.
 * @param {string} dirPath — Directory to scan
 * @param {string} ownTicketKey — Current ticket key
 * @param {object} ticketsData — Tickets.json data
 * @param {string} [ticketsPath] — Path to Tickets.json (for writing). If omitted, skip writing.
 * @returns {object|null} — {targetStubs, targetCrimes, isEmpty, verifiedEmpty} or null on error
 */
// [::TICKET::] PX-77, PX-78, PX-79 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-77|PX-78|PX-79) --for-spec --no-implementation-order`.
function enumerateTargets(dirPath, ownTicketKey, ticketsData, ticketsPath) {
  if (!dirPath || !ownTicketKey || !ticketsData) {
    return null;
  }

  // Resolve and validate directory
  const resolvedPath = path.resolve(dirPath);
  if (!fs.existsSync(resolvedPath)) {
    return null;
  }

  // Reset counter for deterministic behavior within a single call
  stubCounter = 0;

  // Scan directory
  const { targetStubs, targetCrimes } = scanDirectory(resolvedPath, ticketsData, ownTicketKey);

  const isEmpty = targetStubs.length === 0 && targetCrimes.length === 0;

  const result = {
    targetStubs,
    targetCrimes,
    isEmpty: isEmpty,
    verifiedEmpty: isEmpty ? 'verified_empty' : false,
    found: targetStubs.length + targetCrimes.length,
  };

  // Write to Tickets.json if path provided
  if (ticketsPath) {
    result.writtenToTickets = writeTargetsToTickets(ticketsPath, ownTicketKey, targetStubs, targetCrimes);
  }

  return result;
}

// [::TICKET::] PX-77, PX-78, PX-79, PX-80, PX-81, PX-82, PX-83 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-77|PX-78|PX-79|PX-80|PX-81|PX-82|PX-83) --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  let dirPath, ticketKey, ticketsPath;

  for (const a of args) {
    if (a.startsWith('--dir=')) dirPath = a.slice('--dir='.length);
    else if (a.startsWith('--ticket-key=')) ticketKey = a.slice('--ticket-key='.length);
    else if (a.startsWith('--tickets=')) ticketsPath = path.resolve(a.slice('--tickets='.length));
  }

  if (!dirPath || !ticketKey) {
    console.error('[ERROR] --dir=<path> and --ticket-key=<key> are required');
    console.error('Cause: Missing required arguments');
    console.error('Action: Run: node .claude/scripts/tickets/enumerate-ticket-targets.js --dir=<path> --ticket-key=<key> --tickets=<Tickets.json>');
    process.exit(1);
  }

  if (!ticketsPath) {
    console.error('[ERROR] --tickets=<Tickets.json path> is required');
    console.error('Cause: Missing --tickets argument');
    console.error('Action: Run: node .claude/scripts/tickets/enumerate-ticket-targets.js --dir=<path> --ticket-key=<key> --tickets=<path>');
    process.exit(1);
  }

  if (!fs.existsSync(ticketsPath)) {
    console.error('[ERROR] Tickets.json not found: ' + ticketsPath);
    console.error('Cause: File does not exist at specified path');
    console.error('Action: Run: ls -la ' + ticketsPath + ' to verify the file exists, then re-run with --tickets=<correct-path>');
    process.exit(1);
  }

  const resolvedDir = path.resolve(dirPath);
  if (!fs.existsSync(resolvedDir)) {
    console.error('[ERROR] Directory not found: ' + dirPath);
    console.error('Cause: Specified directory does not exist');
    console.error('Action: Run: ls -d ' + resolvedDir + ' to verify the directory exists, then re-run with --dir=<existing-path>');
    process.exit(1);
  }

  const ticketsData = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  const result = enumerateTargets(resolvedDir, ticketKey, ticketsData, ticketsPath);

  if (!result) {
    console.error('[ERROR] enumerate failed');
    console.error('Cause: enumerateTargets() returned null — check prior stderr for the actual error');
    console.error('Action: Read the first [ERROR] line above, fix the reported issue, then re-run');
    process.exit(1);
  }

  // Sync targetCrimes to Malfeasance.json for cross-store consistency
  // [::TICKET::] PX-82: syncMalfeasance — automatic crime sync
  if (result.writtenToTickets) {
    const malfeasanceDir = path.dirname(ticketsPath);
    syncMalfeasance(ticketsData, ticketKey, malfeasanceDir);
  }

  console.log(JSON.stringify({
    ok: true,
    ticket: ticketKey,
    found: result.found,
    targetStubs: result.targetStubs.length,
    targetCrimes: result.targetCrimes.length,
    isEmpty: result.isEmpty,
    writtenToTickets: result.writtenToTickets
  }));

  process.exit(0);
}

if (require.main === module) main();
module.exports = { enumerateTargets, findTicket, classifyStubs, extractTicketRef, writeTargetsToTickets };
