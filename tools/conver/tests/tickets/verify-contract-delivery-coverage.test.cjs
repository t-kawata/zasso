'use strict';

// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
/**
 * PX-437 C002 — coverage-mode contract delivery; text mode is a heuristic.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { findContractDeliveryGaps } = require('../../.claude/scripts/tickets/verify-contract-delivery.js');
const { clauseKey } = require('../../.claude/scripts/tickets/lib/contract-clause.js');

const TICKET = {
  id: 1,
  phaseId: 0,
  contracts: [{ id: 'C001', precondition: 'input is present', postcondition: 'output is stored', invariant: 'state is unchanged' }],
  testUnit: [],
  testIntegration: [],
  testExceptions: [],
};

/** A coverage map with only the precondition proven. */
// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
function coverageOf() {
  const key = (element, text) => clauseKey({ scope: 'pkg-alpha', contractId: 'C001', element, text });
  return {
    version: 1,
    clauses: [
      { key: key('precondition', 'input is present'), status: 'PROVEN', applicability: 'TESTABLE' },
      { key: key('postcondition', 'output is stored'), status: 'CLAUSE_PROOF_MISSING', applicability: 'TESTABLE' },
      { key: key('invariant', 'state is unchanged'), status: 'UNMAPPED', applicability: 'TESTABLE' },
    ],
  };
}

test('C002: coverage mode reports only the clauses the map does not prove', () => {
  const findings = findContractDeliveryGaps(TICKET, 'PX-1', 'Tickets.json', { mode: 'coverage', scope: 'pkg-alpha', coverage: coverageOf() });

  assert.equal(findings.length, 2);
  assert.equal(findings.some((finding) => /C001\/precondition/.test(finding.asset)), false);
  assert.equal(findings.some((finding) => /C001\/postcondition/.test(finding.asset)), true);
  assert.equal(findings.some((finding) => /C001\/invariant/.test(finding.asset)), true);
  assert.equal(findings.every((finding) => finding.heuristic === false), true);
});

test('C002: text mode is marked heuristic and never claims to be coverage', () => {
  const findings = findContractDeliveryGaps(TICKET, 'PX-1', 'Tickets.json');

  assert.equal(findings.length, 3);
  assert.equal(findings.every((finding) => finding.heuristic === true), true);
});

test('C002: a missing coverage map is a repair finding, not a text verdict', () => {
  const findings = findContractDeliveryGaps(TICKET, 'PX-1', 'Tickets.json', { mode: 'coverage', scope: 'pkg-alpha', coverage: null });

  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, 'REPAIR_REQUIRED');
});
