#!/usr/bin/env node

/**
 * show-ticket-context-related-tickets.test.js — relatedTicketIds rendering
 *
 * Verifies that the "Related Tickets" section is emitted by show-ticket-context.js
 * for the actual Tickets.json prose format, e.g. P6-1:
 *   "P0-1 (scope), P1-1 (concurrency), P2-2 (error design)"
 *
 * The parser previously required the generator format
 * "[relation] P0-1 (description)" (square-bracket relation tag) and therefore
 * matched nothing in the real data, suppressing the whole section.
 *
 * Run: node .claude/scripts/tickets/tests/show-ticket-context-related-tickets.test.js
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const scriptPath = path.resolve(__dirname, '..', 'show-ticket-context.js');
const { parseRelatedTicketIds } = require(scriptPath);

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + '\n'); }
}

function assertEq(actual, expected, message) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + '\n'); }
}

console.log('\n━━━ show-ticket-context-related-tickets.test.js — RED PHASE ━━━\n');

// ---------------------------------------------------------------------------
// Unit tests: parseRelatedTicketIds
// ---------------------------------------------------------------------------

(function () {
  // Regression: the actual P6-1 value in Tickets.json (no square-bracket tags).
  // Colon-less parenthesized words ("scope") express the relation — the
  // description is resolved from the target ticket's title at render time.
  const rows = parseRelatedTicketIds('P0-1 (scope), P1-1 (concurrency), P2-2 (error design)');
  assertEq(rows, [
    { relation: 'scope', ticket: 'P0-1', description: '' },
    { relation: 'concurrency', ticket: 'P1-1', description: '' },
    { relation: 'error design', ticket: 'P2-2', description: '' },
  ], 'parses the real prose format — colon-less parenthesized words become the relation');
})();

(function () {
  // Leading "keyword:" in the description becomes the relation
  const rows = parseRelatedTicketIds('P2-1 (depends on: purpose defining API shape), P2-3 (related: error types used in event system)');
  assertEq(rows, [
    { relation: 'depends on', ticket: 'P2-1', description: 'purpose defining API shape' },
    { relation: 'related', ticket: 'P2-3', description: 'error types used in event system' },
  ], 'derives relation from a leading "keyword:" prefix in the description');
})();

(function () {
  // Phase-level reference (P2 instead of P2-1) and unknown ticket id (P5-?)
  const rows = parseRelatedTicketIds('P2 (depends on: P0 defines scope), P5-? (depends on: FFI backend implements calls)');
  assertEq(rows, [
    { relation: 'depends on', ticket: 'P2', description: 'P0 defines scope' },
    { relation: 'depends on', ticket: 'P5-?', description: 'FFI backend implements calls' },
  ], 'parses phase-level and unknown-id ticket keys');
})();

(function () {
  // Backward compatibility: generator format with [relation] tag
  const rows = parseRelatedTicketIds('[depends_on] P1-2 (Dependency: Error type CryptoError definition)');
  assertEq(rows, [
    { relation: 'depends_on', ticket: 'P1-2', description: 'Dependency: Error type CryptoError definition' },
  ], 'keeps parsing the [relation] tag format produced by generate-related-ticket-ids.js');
})();

(function () {
  // Nested parentheses in the description (generator direction labels)
  const rows = parseRelatedTicketIds('[refines] P2-1 (Dependency source (dependent): Session management)');
  assertEq(rows, [
    { relation: 'refines', ticket: 'P2-1', description: 'Dependency source (dependent): Session management' },
  ], 'preserves nested parentheses inside the description');
})();

(function () {
  // Comma inside parentheses does not split the entry
  const rows = parseRelatedTicketIds('P0-1 (depends on: A, B and C), P1-1 (scope)');
  assertEq(rows, [
    { relation: 'depends on', ticket: 'P0-1', description: 'A, B and C' },
    { relation: 'scope', ticket: 'P1-1', description: '' },
  ], 'does not split entries on commas nested inside parentheses');
})();

(function () {
  // No space between ticket key and paren, and full-width parens (Japanese data)
  const rows = parseRelatedTicketIds('P6-2(時間窓判定), P9-1（前提: 機械的フィルタリングパイプライン、reviewed）');
  assertEq(rows, [
    { relation: '時間窓判定', ticket: 'P6-2', description: '' },
    { relation: '前提', ticket: 'P9-1', description: '機械的フィルタリングパイプライン、reviewed' },
  ], 'handles no-space parens, full-width parens, and Japanese relation keywords');
})();

(function () {
  // Bare ticket keys or prose fragments without a parenthesized description are
  // not structured entries and must not produce rows (conver I/O flow notes).
  assertEq(parseRelatedTicketIds('P7-1'), [], 'ignores a bare ticket key without a description');
  assertEq(parseRelatedTicketIds('入力元I/O: P8-2 / 出力先I/O: P6-2, P7-1'), [], 'ignores I/O flow prose fragments');
})();

(function () {
  // Empty / null input yields no rows
  assertEq(parseRelatedTicketIds(''), [], 'returns [] for empty string');
  assertEq(parseRelatedTicketIds(undefined), [], 'returns [] for undefined');
  assertEq(parseRelatedTicketIds(null), [], 'returns [] for null');
})();

(function () {
  // Exact duplicates are dropped, distinct descriptions of the same ticket are kept
  const rows = parseRelatedTicketIds('P4-3 (depends on: server crate configuration), P4-3 (depends on: server crate configuration), P4-3 (depends on: HTTP/WS protocol routing)');
  assertEq(rows, [
    { relation: 'depends on', ticket: 'P4-3', description: 'server crate configuration' },
    { relation: 'depends on', ticket: 'P4-3', description: 'HTTP/WS protocol routing' },
  ], 'drops exact duplicate entries but keeps distinct descriptions for the same ticket');
})();

(function () {
  // Every relatedTicketIds value that starts with a ticket key (i.e. is meant
  // as a ticket-list entry) must yield at least one row — no silent suppression.
  // Free-form prose values (e.g. conver's "入力元I/O: P13-2 (...)") are not
  // ticket-list entries and are out of scope for the table parser.
  const ticketsJson = path.resolve(__dirname, '..', '..', '..', '..', 'Tickets.json');
  if (fs.existsSync(ticketsJson)) {
    const data = JSON.parse(fs.readFileSync(ticketsJson, 'utf8'));
    const values = [];
    for (const phase of data.phases || []) {
      for (const t of phase.tickets || []) {
        if (typeof t.relatedTicketIds === 'string' && t.relatedTicketIds.trim()) {
          values.push(t.relatedTicketIds.trim());
        }
      }
    }
    const distinct = [...new Set(values)];
    const ticketListValues = distinct.filter((v) => /^\s*P[0-9Xx]/.test(v));
    const empty = ticketListValues.filter((v) => parseRelatedTicketIds(v).length === 0);
    assert(empty.length === 0, 'every ticket-list relatedTicketIds value parses to at least one row' + (empty.length ? ' — empty: ' + JSON.stringify(empty) : ' (' + ticketListValues.length + '/' + distinct.length + ' ticket-list values)'));
  } else {
    process.stdout.write('  (skip) Tickets.json not found — skipping real-data sweep\n');
    passed++;
  }
})();

// ---------------------------------------------------------------------------
// Integration test: "Related Tickets" section is emitted
// ---------------------------------------------------------------------------

(function () {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtctx-'));
  try {
    const fixture = {
      title: 'fixture',
      metadata: {},
      phases: [
        {
          id: 6,
          tickets: [{
            id: 1,
            phaseId: 6,
            title: 'Crate Purpose & Architecture Identity',
            relatedTicketIds: 'P0-1 (scope), P1-1 (concurrency)',
          }],
        },
        { id: 0, tickets: [{ id: 1, phaseId: 0, title: 'Crate Foundation & Scope Definition' }] },
        { id: 1, tickets: [{ id: 1, phaseId: 1, title: 'Codec Policy & Concurrency Model' }] },
      ],
    };
    const ticketsPath = path.join(tmpDir, 'Tickets.json');
    fs.writeFileSync(ticketsPath, JSON.stringify(fixture, null, 2));

    const cmd = 'node ' + scriptPath + ' --ticket-key=P6-1 --tickets=' + ticketsPath;
    const stdout = execSync(cmd, { encoding: 'utf8', shell: '/bin/bash' });

    assert(stdout.includes('## Related Tickets'), 'integration: ## Related Tickets section is emitted');
    assert(stdout.includes('| P0-1 | scope | Crate Foundation & Scope Definition |'), 'integration: colon-less relation and resolved title are rendered');
    assert(stdout.includes('| P1-1 | concurrency | Codec Policy & Concurrency Model |'), 'integration: colon-less relation and resolved title are rendered');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
})();

console.log('\n━━━ Summary ━━━');
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);
if (failed > 0) process.exit(1);
