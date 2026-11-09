// [::TICKET::] PX-399 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-399 --for-spec --no-implementation-order`.
'use strict';
// PX-399 @verifies C001 @verifies C002 @verifies C004

/**
 * PX-399 — one ticket, one ordered gate set, one repair plan.
 *
 * The certificate is written beside the ticket record. A reviewed ticket needs
 * a fresh passing run before its status carries evidence again.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const {
  ticketGateSet,
  runReverify,
  isStaleReviewed,
  certificatePathFor,
} = require('../../.claude/scripts/tickets/reverify-ticket.js');
const { findingsDigest } = require('../../.claude/scripts/tickets/lib/gate-finding.js');
const {
  cleanTicket,
  reviewedTicket,
  documentWith,
  writeFixture,
} = require('./fixtures/reverify-fixtures.cjs');

const CLAUDE_DIR = path.resolve(__dirname, '../..', '.claude');
const REVERIFY = path.join(CLAUDE_DIR, 'scripts/tickets/reverify-ticket.js');

test('C001: the gate set is ordered and a clean ticket has no finding', () => {
  const ticket = cleanTicket();
  const gates = ticketGateSet(ticket, 'PX-1', {
    ticketsPath: 'Tickets.json',
    ticketsDocument: documentWith(ticket),
    changedFiles: [],
  });

  assert.deepEqual(gates.map((gate) => gate.name), [
    'plan-contracts', 'plan-elements', 'make-contracts', 'make-elements',
    'contract-delivery', 'operation-delivery', 'acceptance-coverage',
    'formula-delivery', 'annotation', 'targets', 'review-record',
  ]);
  assert.ok(gates.every((gate) => Array.isArray(gate.findings)));
  assert.equal(gates.flatMap((gate) => gate.findings).length, 0);
});

test('C001: a broken contract is aggregated into one repair plan', () => {
  const ticket = cleanTicket({
    planTestCode: ['```js\nassert.ok(true);\n```'],
    testUnit: [],
  });

  const result = runReverify({
    ticketKey: 'PX-1',
    ticketsPath: 'Tickets.json',
    ticketsDocument: documentWith(ticket),
    changedFiles: [],
  });

  assert.ok(result.plan.findings.some((entry) => entry.code === 'CONTRACT_TEST_MISSING'));
  assert.ok(result.plan.count > 0);
  assert.equal(result.plan.digest, findingsDigest(result.plan.findings));
});

test('C001: the reverify CLI exits zero with a JSON repair plan', () => {
  const fixture = writeFixture(cleanTicket());

  const stdout = execFileSync(process.execPath, [
    REVERIFY,
    '--ticket-key=PX-1',
    '--tickets=' + fixture.ticketsPath,
    '--files=',
  ], { encoding: 'utf8' });

  const report = JSON.parse(stdout);
  assert.equal(report.ticketKey, 'PX-1');
  assert.equal(report.plan.count, 0);
  assert.ok(Array.isArray(report.gates));
  assert.equal(report.gates.length, 11);
});

test('C001: a certificate needs two stable runs and is written beside the ticket record', () => {
  const fixture = writeFixture(reviewedTicket());

  const refused = runReverify({
    ticketKey: 'PX-1',
    ticketsPath: fixture.ticketsPath,
    changedFiles: [],
    writeCertificate: true,
    runCount: 1,
  });
  assert.equal(refused.certificateWritten, false);
  assert.equal(refused.certificateError.code, 'CERTIFICATE_INCOMPLETE');
  assert.equal(fs.existsSync(certificatePathFor(fixture.ticketsPath, 'PX-1')), false);

  const written = runReverify({
    ticketKey: 'PX-1',
    ticketsPath: fixture.ticketsPath,
    changedFiles: [],
    writeCertificate: true,
    runCount: 2,
  });
  assert.equal(written.certificateWritten, true);
  assert.equal(
    certificatePathFor(fixture.ticketsPath, 'PX-1'),
    path.join(path.dirname(fixture.ticketsPath), 'certificates', 'PX-1.json'),
  );
  assert.ok(fs.existsSync(certificatePathFor(fixture.ticketsPath, 'PX-1')));
  assert.equal(written.plan.count, 0);
  assert.equal(written.staleReviewed, false);
});

test('C004: isStaleReviewed names the reviewed-status rule', () => {
  assert.equal(isStaleReviewed({ ticketKey: 'PX-1', status: 'done', certificate: null, currentDigest: 'd' }), false);
  assert.equal(isStaleReviewed({ ticketKey: 'PX-1', status: 'reviewed', certificate: null, currentDigest: 'd' }), true);
  assert.equal(isStaleReviewed({ ticketKey: 'PX-1', status: 'reviewed', certificate: { finalDigest: 'old' }, currentDigest: 'new' }), true);
  assert.equal(isStaleReviewed({ ticketKey: 'PX-1', status: 'reviewed', certificate: { finalDigest: 'same' }, currentDigest: 'same' }), false);
});
