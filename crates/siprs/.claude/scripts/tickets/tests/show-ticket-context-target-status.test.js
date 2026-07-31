#!/usr/bin/env node

/**
 * show-ticket-context-target-status.test.js — Tests for PX-87
 *
 * @verifies C001
 * C001: show-ticket-context output includes the mandatory-STUB and crime
 * sections (with per-item details) when targetStubs/targetCrimes exist.
 *
 * The fixture (fixtures/target-status/Tickets.json) is used for all
 * assertions so the test is deterministic regardless of which Tickets.json
 * happens to exist in the cwd.
 */

const { execSync } = require('child_process');
const path = require('path');

let passed = 0;
let failed = 0;

// [::TICKET::] PX-87 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-87 --for-spec --no-implementation-order`.
function assert(condition, message) {
  if (condition) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + '\n'); }
}

console.log('\n━━━ show-ticket-context-target-status.test.js (PX-87) — RED PHASE ━━━\n');

const scriptPath = path.resolve(__dirname, '..', 'show-ticket-context.js');
const fixture = path.resolve(__dirname, 'fixtures', 'target-status', 'Tickets.json');
const stubSection = '## STUBs — Must Be Fully Implemented in This Ticket';
const crimeSection = '## Crimes — Must Be 100% Resolved in This Ticket';
const omissionSection = '## Omissions found in Prior Implementation Rounds — Must Be 100% Resolved in This Ticket';

function runFor(ticketKey, extraArgs) {
  const args = extraArgs || '';
  return execSync('node ' + scriptPath + ' --ticket-key=' + ticketKey + ' --tickets=' + fixture + ' ' + args, { encoding: 'utf8', shell: '/bin/bash' });
}

(function () {
  // PX-100 has both targetStubs and targetCrimes — should show detailed sections
  const stdout = runFor('PX-100');

  // STUB section: count + status summary + per-item detail
  assert(stdout.includes(stubSection), 'output contains the mandatory-STUB section when targetStubs exist');
  assert(stdout.includes('2 items'), 'output shows the stub count');
  assert(stdout.includes('pending: 1'), 'output shows the stub status breakdown');
  assert(stdout.includes('resolved: 1'), 'output shows the stub resolved count');
  assert(stdout.includes('### TS-'), 'output lists each stub with a ### detail heading');
  assert(stdout.includes('TS-012'), 'output contains stub id TS-012');
  assert(stdout.includes('/Users/sh01/shyme/zasso/crates/siprs/src/runtime/command.rs'), 'output contains stub location command.rs');
  assert(stdout.includes('store CallEntry in ClientState, return CallId'), 'output contains stub marker text');
  assert(stdout.includes('C001, C006'), 'output contains stub contracts');
  assert(stdout.includes('STUB marker replaced with actual implementation.'), 'output contains stub resolution plan');
  assert(stdout.includes('TS-013'), 'output contains the second stub id TS-013');

  // Crime section: count + per-item detail
  assert(stdout.includes(crimeSection), 'output contains the crime section when targetCrimes exist');
  assert(stdout.includes('1 items'), 'output shows the crime count');
  assert(stdout.includes('TS-001'), 'output contains crime id TS-001');
  assert(stdout.includes('/Users/sh01/shyme/zasso/crates/siprs/src/account.rs'), 'output contains crime location account.rs');
  assert(stdout.includes('Full SIP account management implementation'), 'output contains crime marker text');
  assert(stdout.includes('C001, C009'), 'output contains crime contracts');
  assert(stdout.includes('ORPHAN_TICKET_REF'), 'output contains crime type');
  assert(stdout.includes('DEFERRED to P0-7'), 'output contains crime note');

  // Omission section: count + severity breakdown + per-item detail
  assert(stdout.includes(omissionSection), 'output contains the omission section when foundOmissions exist');
  assert(stdout.includes('2 items — major: 1, minor: 1'), 'output shows the omission count and severity breakdown');
  assert(stdout.includes('O-001'), 'output contains omission id O-001');
  assert(stdout.includes('O-002'), 'output contains omission id O-002');
  assert(stdout.includes('Add compile-time assert_sync::<SipClient>()'), 'output contains omission recommendation');
  assert(stdout.includes('Evaluation A (Contract Translation) — FAILED'), 'output shows failed evaluation A');
  assert(stdout.includes('src/client.rs'), 'output contains evidence file for the evaluation');
  assert(stdout.includes('fn _assert_send_sync()'), 'output contains evidence code snippet');
  assert(stdout.includes('Evaluation C (Test Precision) — FAILED'), 'output shows failed evaluation C');
  assert(stdout.includes('src/runtime/reactor.rs'), 'output contains evidence file for the second omission');
})();

(function () {
  // PX-101 has targetStubs only — should show the STUB section but omit the crime section
  const stdout = runFor('PX-101');
  assert(stdout.includes(stubSection), 'stubs-only output contains the mandatory-STUB section');
  assert(stdout.includes('TS-020'), 'stubs-only output contains its stub id');
  assert(!stdout.includes(crimeSection), 'stubs-only output omits the crime section');
  assert(!stdout.includes(omissionSection), 'stubs-only output omits the omission section');
})();

(function () {
  // --for-spec mode should still show the target sections when values exist
  const stdout = runFor('PX-100', '--for-spec');
  assert(stdout.includes(stubSection), '--for-spec mode includes the mandatory-STUB section when targetStubs exist');
  assert(stdout.includes(crimeSection), '--for-spec mode includes the crime section when targetCrimes exist');
  assert(stdout.includes(omissionSection), '--for-spec mode includes the omission section when foundOmissions exist');
})();

console.log('\n━━━ Summary ━━━');
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);
if (failed > 0) process.exit(1);
