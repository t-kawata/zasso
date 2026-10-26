#!/usr/bin/env node
// PX-311 @verifies C002
// The post-split gate must recompute the digest a ticket claims. These tests exercise the
// exported helper and the path through verifyAllTicketCoverage, so a tampered ticket is
// reported even when its stored digest fields are unchanged.

const assert = require('assert');

const {
  verifyAllTicketCoverage,
  verifyDistributionDigests,
} = require('../../.claude/scripts/tickets/verify-all-ticket-coverage.js');
const {
  digestTicketDistribution,
  digestUnitObligation,
} = require('../../.claude/scripts/tickets/add-tickets-for-phase.js');
const { digestValue } = require('../../.claude/scripts/sequences-slice/lib/digest.mjs');

const MAP_DIGEST = 'a'.repeat(64);
const VIEW_DIGEST = 'b'.repeat(64);
const stats = { passed: 0, failed: 0, total: 0 };

// [::TICKET::] PX-311 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-311 --for-spec --no-implementation-order`.
function test(name, fn) {
  stats.total += 1;
  try {
    fn();
    stats.passed += 1;
    process.stdout.write('  PASS ' + name + '\n');
  } catch (error) {
    stats.failed += 1;
    process.stdout.write('  FAIL ' + name + '\n');
    console.error('     ' + error.message);
  }
}

// [::TICKET::] PX-311 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-311 --for-spec --no-implementation-order`.
function fixtureDistribution() {
  const unit = {
    unitId: 'op-A',
    kind: 'operation',
    role: 'implementer',
    surface: null,
    obligation: { mode: 'implement', outcome: 'active' },
  };
  unit.obligationDigest = digestUnitObligation(unit.obligation);
  const distribution = {
    sourceMapDigest: MAP_DIGEST,
    sourceViewDigest: VIEW_DIGEST,
    units: [unit],
  };
  distribution.digest = digestTicketDistribution(distribution);
  return distribution;
}

// [::TICKET::] PX-311 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-311 --for-spec --no-implementation-order`.
function fixtureTickets(distribution) {
  return {
    phases: [{
      id: -1,
      nodeIds: [],
      tickets: [{ id: 1, phaseId: -1, nodeIds: [], distribution }],
    }],
  };
}

const EMPTY_MATERIAL = { view: {}, graph: { nodes: [] }, dirs: {} };

process.stdout.write('\n--- verify-all-ticket-coverage digest tests ---\n');

test('a matching distribution has no digest finding', () => {
  const phase = fixtureTickets(fixtureDistribution()).phases[0];
  assert.deepStrictEqual(verifyDistributionDigests(phase), []);
});

test('an edited obligation is reported through the coverage gate', () => {
  const tickets = fixtureTickets(fixtureDistribution());
  const unit = tickets.phases[0].tickets[0].distribution.units[0];
  unit.obligation.outcome = 'edited-after-generation';
  const report = verifyAllTicketCoverage(tickets, EMPTY_MATERIAL);
  assert.strictEqual(report.valid, false);
  assert.ok(report.unitFindings.some((entry) => entry.code === 'OBLIGATION_DIGEST_MISMATCH' && entry.unitId === 'op-A'));
});

test('edited units are reported as a ticket digest mismatch', () => {
  const tickets = fixtureTickets(fixtureDistribution());
  tickets.phases[0].tickets[0].distribution.units.push({
    unitId: 'op-B',
    kind: 'operation',
    obligation: { mode: 'reference', outcome: 'active' },
    obligationDigest: digestValue({ mode: 'reference', outcome: 'active' }),
  });
  const report = verifyAllTicketCoverage(tickets, EMPTY_MATERIAL);
  assert.ok(report.unitFindings.some((entry) => entry.code === 'TICKET_DIGEST_MISMATCH'));
});

test('missing digests fail instead of passing vacuously', () => {
  const distribution = fixtureDistribution();
  delete distribution.digest;
  delete distribution.units[0].obligationDigest;
  const phase = fixtureTickets(distribution).phases[0];
  const findings = verifyDistributionDigests(phase);
  assert.ok(findings.some((entry) => entry.code === 'TICKET_DIGEST_MISMATCH'));
  assert.ok(findings.some((entry) => entry.code === 'OBLIGATION_DIGEST_MISMATCH'));
});

test('a ticket that predates the distribution record keeps the old verdict', () => {
  const tickets = { phases: [{ id: -1, nodeIds: [], tickets: [{ id: 1, phaseId: -1, nodeIds: [] }] }] };
  const phase = tickets.phases[0];
  assert.deepStrictEqual(verifyDistributionDigests(phase), []);
});

process.stdout.write('\nTotal: ' + stats.total + ' Passed: ' + stats.passed + ' Failed: ' + stats.failed + '\n');
process.exit(stats.failed > 0 ? 1 : 0);
