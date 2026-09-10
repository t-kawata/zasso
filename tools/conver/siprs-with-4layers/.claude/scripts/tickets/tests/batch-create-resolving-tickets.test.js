#!/usr/bin/env node
// [::TICKET::] PX-143: forNextRound on batch-create-resolving-tickets. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-143 --for-spec --no-implementation-order`.

/**
 * batch-create-resolving-tickets.test.js — Tests for find Step 1 resolving-ticket creation.
 *
 * @verifies C004 (batch-create-resolving-tickets.js)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

let passed = 0;
let failed = 0;

// [::TICKET::] PX-143, PX-144, PX-145, PX-146 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-143|PX-144|PX-145|PX-146) --for-spec --no-implementation-order`.
function ok(condition, message) {
  if (condition) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + '\n'); }
}

// [::TICKET::] PX-143, PX-144, PX-145, PX-146 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-143|PX-144|PX-145|PX-146) --for-spec --no-implementation-order`.
function strictEqual(actual, expected, message) {
  if (actual === expected) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + '\n'); }
}

console.log('\n━━━ batch-create-resolving-tickets.test.js ━━━\n');

const { createResolvingTickets } = require('../batch-create-resolving-tickets.js');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'px143-batch-'));

const VALID_TICKETS = {
  title: 'Test RFC',
  round: 1,
  metadata: { source: 'RFC-test.md', generatedAt: '2026-08-07' },
  phases: [{
    id: 0,
    name: 'P0',
    tickets: [{ id: 1, phaseId: 0, title: 'Source ticket', status: 'reviewed' }],
  }],
};

// ======================================================================
// C004 — resolving tickets carry forNextRound=true
// ======================================================================
(function testResolvingTicketForNextRound() {
  // On-disk marker referencing the source key (P0-1)
  const markerFile = path.join(TMP, 'resolving.rs');
  const markerContent = '// [::STUB::] P0-1: dependency ticket done, resolve now -- Replace placeholder with real implementation';
  fs.writeFileSync(markerFile, markerContent + '\n');

  const manifest = [{
    sourceKey: 'P0-1',
    stubs: [{ file: markerFile, line: 1, content: markerContent }],
  }];

  const res = createResolvingTickets({
    ticketsData: VALID_TICKETS,
    manifest,
    sourceRoot: TMP,
    noWrite: true,
  });

  ok(res.success, 'createResolvingTickets succeeds with a valid manifest');
  if (!res.success) {
    process.stdout.write('  ↳ ' + (res.error || JSON.stringify(res.errors)) + '\n');
    return;
  }
  const created = res.created || [];
  strictEqual(created.length, 1, 'one resolving ticket created');
  if (created[0]) strictEqual(created[0].ticket.forNextRound, true, 'resolving ticket forNextRound=true');
})();

// ======================================================================
console.log('\n━━━ Summary ━━━\n');
console.log('Passed: ' + passed + '\nFailed: ' + failed + '\n');
if (failed > 0) process.exit(1);
