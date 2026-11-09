'use strict';
// PX-398 @verifies C005

/**
 * PX-398 — report mode is additive.
 *
 * Every gate in report mode exits zero and prints one finding envelope. The
 * default mode keeps its old stdout and exit code for existing callers.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLAUDE_DIR = path.resolve(__dirname, '../..', '.claude');
const TICKETS_DIR = path.join(CLAUDE_DIR, 'scripts', 'tickets');

const VERIFY_PLAN = path.join(TICKETS_DIR, 'verify-plan-contracts.js');
const VERIFY_MAKE = path.join(TICKETS_DIR, 'verify-make-contracts.js');
const VERIFY_CONTRACT = path.join(TICKETS_DIR, 'verify-contract-delivery.js');
const VERIFY_SPEC = path.join(TICKETS_DIR, 'verify-spec-completeness.js');
const VERIFY_SKIP = path.join(TICKETS_DIR, 'verify-skip-classification.js');
const VERIFY_REVIEW = path.join(TICKETS_DIR, 'verify-review-record.js');

/** Write a one-ticket package and return its Tickets.json path. */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function writeFixture(ticket) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'report-mode-'));
  const ticketsPath = path.join(directory, 'Tickets.json');
  fs.writeFileSync(ticketsPath, JSON.stringify({
    title: 'fixture',
    round: 1,
    metadata: { source: 'fixture', generatedAt: '2026-11-09' },
    phases: [{ id: -1, name: 'PX', tickets: [{ id: 1, phaseId: -1, ...ticket }] }],
  }, null, 2) + '\n');
  return ticketsPath;
}

/** Run a gate and return its parsed stdout. */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function runGate(script, ticketsPath, extra = []) {
  return JSON.parse(execFileSync(process.execPath, [
    script, '--ticket-key=PX-1', '--tickets=' + ticketsPath, '--report', ...extra,
  ], { encoding: 'utf8' }));
}

test('C005: Gate P report mode exits zero with the uncovered contracts', () => {
  const ticketsPath = writeFixture({
    status: 'made',
    title: 'Fixture',
    contracts: [
      { id: 'C001', sourceEdge: 'N1->N2', precondition: 'p1', postcondition: 'q1', invariant: 'r1' },
      { id: 'C002', sourceEdge: 'N2->N3', precondition: 'p2', postcondition: 'q2', invariant: 'r2' },
    ],
    planTestCode: ['```js\nassert.ok(true);\n```'],
  });

  const report = runGate(VERIFY_PLAN, ticketsPath);
  assert.equal(report.gate, 'verify-plan-contracts');
  assert.equal(report.ticketKey, 'PX-1');
  assert.equal(report.findings.length, 2);
  assert.ok(report.findings.every((entry) => entry.code === 'CONTRACT_TEST_MISSING'));
});

test('C005: default Gate P still passes the one-code-block fixture', () => {
  const ticketsPath = writeFixture({
    status: 'made',
    title: 'Fixture',
    contracts: [
      { id: 'C001', sourceEdge: 'N1->N2', precondition: 'p1', postcondition: 'q1', invariant: 'r1' },
      { id: 'C002', sourceEdge: 'N2->N3', precondition: 'p2', postcondition: 'q2', invariant: 'r2' },
    ],
    planTestCode: ['```js\nassert.ok(true);\n```'],
  });

  assert.equal(
    execFileSync(process.execPath, [VERIFY_PLAN, '--ticket-key=PX-1', '--tickets=' + ticketsPath], { encoding: 'utf8' }),
    '{"ok":true,"ticket":"PX-1"}\n',
  );
});

test('C005: Gate M report mode exits zero with the contract whose id is absent', () => {
  const ticketsPath = writeFixture({
    status: 'made',
    title: 'Fixture',
    contracts: [{ id: 'C001', sourceEdge: 'N1->N2', precondition: 'alpha unique', postcondition: 'alpha saved', invariant: 'alpha stable' }],
    testUnit: ['UT: alpha unique alpha saved alpha stable'],
    testIntegration: [],
    testExceptions: [],
  });

  const report = runGate(VERIFY_MAKE, ticketsPath);
  assert.equal(report.gate, 'verify-make-contracts');
  assert.equal(report.findings.length, 1);
  assert.equal(report.findings[0].code, 'CONTRACT_TEST_MISSING');
});

test('C005: contract delivery report mode exits zero with clause findings', () => {
  const ticketsPath = writeFixture({
    status: 'made',
    title: 'Fixture',
    contracts: [{ id: 'C001', sourceEdge: 'N1->N2', precondition: 'order exists', postcondition: 'order saved', invariant: 'no duplicate' }],
    testUnit: ['UT: C001 order exists'],
    testIntegration: [],
    testExceptions: [],
  });

  const report = runGate(VERIFY_CONTRACT, ticketsPath);
  assert.equal(report.gate, 'verify-contract-delivery');
  assert.ok(report.findings.length > 0);
  assert.ok(report.findings.every((entry) => entry.fixes.length > 0));
});

test('C005: spec completeness renders a custom field and reports no gap', () => {
  const ticketsPath = writeFixture({
    status: 'made',
    title: 'Fixture',
    background: 'the background',
    customFutureField: 'custom value',
  });

  const report = runGate(VERIFY_SPEC, ticketsPath);
  assert.equal(report.gate, 'verify-spec-completeness');
  assert.deepEqual(report.findings, []);
});

test('C005: skip classification report mode names an unproven skip', () => {
  const ticketsPath = writeFixture({ status: 'made', title: 'Fixture' });
  const skipsPath = path.join(path.dirname(ticketsPath), 'skips.json');
  fs.writeFileSync(skipsPath, JSON.stringify([
    { check: 'distribution', reason: 'not implemented yet' },
  ]));

  const report = runGate(VERIFY_SKIP, ticketsPath, ['--skips=' + skipsPath]);
  assert.equal(report.gate, 'verify-skip-classification');
  assert.deepEqual(report.findings.map((entry) => entry.code), ['UNPROVEN_SKIP']);
});

test('C005: review record report mode names a missing field', () => {
  const ticketsPath = writeFixture({
    status: 'reviewed',
    title: 'Fixture',
    instrumentation: 'tests pass',
    rfcDiscrepancies: [],
    notes: '',
  });

  const report = runGate(VERIFY_REVIEW, ticketsPath);
  assert.equal(report.gate, 'verify-review-record');
  assert.equal(report.findings.length, 1);
  assert.equal(report.findings[0].code, 'REVIEW_RECORD_MISSING');
});
