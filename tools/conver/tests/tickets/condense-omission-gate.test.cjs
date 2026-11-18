'use strict';

// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-443 --for-spec --no-implementation-order`.
/**
 * PX-443 C003 — a committed omission ticket with no measured work fails the
 * condense gate, and check-ticket-set reports the package.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { collectOmissionFindings } = require('../../.claude/scripts/tickets/condense-tickets.js');
const { checkTicketSet } = require('../../.claude/scripts/tickets/check-ticket-set.js');

// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-443 --for-spec --no-implementation-order`.
function omissionDocument({ testUnit, units }) {
  return {
    phases: [{
      id: 1,
      tickets: [{
        id: 1,
        phaseId: 1,
        status: 'todo',
        title: 'Omission remediation: 1 contract(s)',
        nodeIds: [],
        testUnit,
        testIntegration: [],
        contracts: [{ id: 'C001', sourceEdge: 'N0001->N0002', precondition: 'a', postcondition: 'b', invariant: 'c' }],
        omissionUnits: units,
        origin: { kind: 'omission', sourceTicket: 'P0-1' },
      }],
    }],
  };
}

test('C003: an omission ticket without measured work is reported', () => {
  const findings = collectOmissionFindings(omissionDocument({ testUnit: [], units: [] }));

  assert.equal(findings.includes('P1-1: OMISSION_TICKET_UNMEASURED'), true);
  assert.equal(findings.includes('P1-1: OMISSION_EVIDENCE_TICKET'), true);
});

test('C003: a measured omission ticket passes the helper', () => {
  const findings = collectOmissionFindings(omissionDocument({
    testUnit: ['omission-test:clause|pkg|C001|precondition|0123456789abcdef'],
    units: [{ group: 'pkg|C001', contractId: 'C001', blockingClass: 'test-missing', clauses: ['clause|pkg|C001|precondition|0123456789abcdef'] }],
  }));

  assert.deepEqual(findings, []);
});

test('C003: check-ticket-set reports a package that fails the gate', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'px443-check-'));
  const pkg = path.join(root, 'pkg');
  fs.mkdirSync(pkg);
  try {
    fs.writeFileSync(path.join(pkg, 'Tickets.json'), JSON.stringify(omissionDocument({ testUnit: [], units: [] })));
    fs.writeFileSync(path.join(pkg, 'RFC-GRAPH.json'), JSON.stringify({ nodes: [], edges: [] }));
    fs.writeFileSync(path.join(pkg, 'RFC-Dirs-Tree.json'), JSON.stringify({}));

    const result = await checkTicketSet({ root });

    assert.equal(result.targets.length, 1);
    assert.equal(result.failures.length, 1);
    assert.equal(result.failures[0].code, 'OMISSION_TICKET_UNMEASURED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
