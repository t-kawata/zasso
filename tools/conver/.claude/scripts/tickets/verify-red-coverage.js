#!/usr/bin/env node

/**
 * verify-red-coverage.js — Verify Red-phase contract coverage (Gate S)
 *
 * Usage: node verify-red-coverage.js --ticket-key=<PX-id> --test-dir=<path>
 *
 * Scans test files for @verifies <contractId> annotations and verifies
 * all contract IDs declared in the ticket are covered.
 *
 * Exits 0 on full coverage, 1 on missing coverage.
 * Outputs 3-line error template on stderr.
 *
 * [::TICKET::] PX-70: Gate S — TDD Red @verifies enforcement
 */

const fs = require('fs');
const path = require('path');

const VERIFIES_RE = /@verifies\s+(C\d+)/g;
const REQUIRES_RE = /@requires\s+(C\d+)/g;
const ASSERT_INV_RE = /@assert-invariant\s+(C\d+)/g;

// [::TICKET::] PX-70, PX-71 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-70|PX-71) --for-spec --no-implementation-order`.
function parseArgs() {
  const args = process.argv.slice(2);
  let ticketKey, testDir = '.';
  for (const a of args) {
    if (a.startsWith('--ticket-key=')) ticketKey = a.slice('--ticket-key='.length);
    if (a.startsWith('--test-dir=')) testDir = path.resolve(a.slice('--test-dir='.length));
  }
  if (!ticketKey) {
    console.error('[ERROR] --ticket-key=<PX-id> is required');
    console.error('Cause: Missing arguments');
    console.error('Action: Provide --ticket-key');
    process.exit(1);
  }
  return { ticketKey, testDir };
}

/**
 * Scan a file's content for all @verifies, @requires, @assert-invariant annotations
 *
 * @param {string} content — File content
 * @param {Set<string>} expectedIds — Set of expected contract IDs
 * @returns {{ covered: Set<string>, missing: string[], unknown: Array<{file: string, id: string}> }}
 */
// [::TICKET::] PX-70, PX-71 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-70|PX-71) --for-spec --no-implementation-order`.
function scanContractCoverage(content, expectedIds) {
  const foundIds = new Set();
  const unknownAnnotations = [];

  // Match @verifies
  let m;
  while ((m = VERIFIES_RE.exec(content)) !== null) {
    const id = m[1];
    if (expectedIds.has(id)) foundIds.add(id);
    else unknownAnnotations.push({ id, type: '@verifies' });
  }

  // Also consider @requires and @assert-invariant as coverage
  VERIFIES_RE.lastIndex = 0;
  while ((m = REQUIRES_RE.exec(content)) !== null) {
    const id = m[1];
    if (expectedIds.has(id)) foundIds.add(id);
  }

  while ((m = ASSERT_INV_RE.exec(content)) !== null) {
    const id = m[1];
    if (expectedIds.has(id)) foundIds.add(id);
  }

  const missing = [...expectedIds].filter(id => !foundIds.has(id));

  return {
    covered: foundIds,
    missing,
    unknown: unknownAnnotations
  };
}

/**
 * Recursively find test files
 */
// [::TICKET::] PX-70, PX-71 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-70|PX-71) --for-spec --no-implementation-order`.
function findTestFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      results.push(...findTestFiles(fullPath));
    } else if (entry.isFile() && /\.(rs|go|ts|tsx|js|jsx|cjs|mjs|vue|py|java|kt|swift|c|cpp|h|hpp|rb|php|cs)$/i.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

// [::TICKET::] PX-70, PX-71 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-70|PX-71) --for-spec --no-implementation-order`.
function main() {
  const { ticketKey, testDir } = parseArgs();
  // Parse ticket key: PX-{id} or P{phase}-{id}
  const pxMatch = ticketKey.match(/^PX-(\d+)$/);
  const pMatch = ticketKey.match(/^P(\d+)-(\d+)$/);
  let targetPhaseId, targetId;
  if (pxMatch) {
    targetPhaseId = -1;
    targetId = parseInt(pxMatch[1], 10);
  } else if (pMatch) {
    targetPhaseId = parseInt(pMatch[1], 10);
    targetId = parseInt(pMatch[2], 10);
  } else {
    console.error('[ERROR] Invalid ticket key format: ' + ticketKey);
    process.exit(1);
  }

  // Read tickets.json from the test-dir parent (convention: ../Tickets.json or ./Tickets.json)
  // Try several possible locations
  let ticketsData;
  const ticketPaths = [
    path.join(testDir, '..', 'Tickets.json'),
    path.resolve('Tickets.json'),
    path.join(testDir, '..', '..', 'Tickets.json')
  ];
  for (const tp of ticketPaths) {
    if (fs.existsSync(tp)) {
      ticketsData = JSON.parse(fs.readFileSync(tp, 'utf8'));
      break;
    }
  }
  if (!ticketsData) {
    console.error('[ERROR] Tickets.json not found (searched ' + ticketPaths.join(', ') + ')');
    process.exit(1);
  }

  // Find target ticket across all phases
  let targetTicket = null;
  for (const phase of ticketsData.phases) {
    if (phase.tickets) {
      for (const t of phase.tickets) {
        if (t.id === targetId && t.phaseId === targetPhaseId) {
          targetTicket = t;
          break;
        }
      }
    }
    if (targetTicket) break;
  }
  if (!targetTicket) {
    console.error('[ERROR] Ticket ' + ticketKey + ' not found');
    process.exit(1);
  }

  const contractIds = new Set();
  const contracts = targetTicket.contracts || [];
  for (const c of contracts) {
    if (c.id) contractIds.add(c.id);
  }

  if (contractIds.size === 0) {
    // No contracts to verify — pass
    console.log(JSON.stringify({ ok: true, ticket: ticketKey, contractsChecked: 0 }));
    process.exit(0);
  }

  // Scan test files
  const testFiles = findTestFiles(testDir);
  let allCovered = new Set();
  let allUnknown = [];
  let warnings = [];

  for (const file of testFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const result = scanContractCoverage(content, contractIds);
    for (const id of result.covered) allCovered.add(id);
    for (const u of result.unknown) {
      allUnknown.push(u);
      warnings.push('File ' + path.relative(testDir, file) + ' has @verifies for unknown contract ' + u.id);
    }
  }

  const missingIds = [...contractIds].filter(id => !allCovered.has(id));

  // Output warnings for unknown IDs
  if (warnings.length > 0) {
    for (const w of warnings) {
      console.warn('[WARNING] ' + w);
    }
  }

  if (missingIds.length > 0) {
    for (const id of missingIds) {
      console.error('[ERROR] Ticket ' + ticketKey + ' contract ' + id + ': missing @verifies annotation in test files');
      console.error('Cause: Contract not covered by any test');
      console.error('Action: Add // @verifies ' + id + ' to the corresponding test file');
    }
    process.exit(1);
  }

  console.log(JSON.stringify({
    ok: true,
    ticket: ticketKey,
    contractsChecked: contractIds.size,
    contractsCovered: allCovered.size,
    unknownAnnotations: allUnknown.length,
    testFilesScanned: testFiles.length
  }));
  process.exit(0);
}

if (require.main === module) main();
module.exports = { scanContractCoverage, findTestFiles };
