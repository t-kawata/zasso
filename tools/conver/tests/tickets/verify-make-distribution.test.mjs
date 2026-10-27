// PX-324 @verifies C003 C004
// The delivery gate is conditional: no distribution is a skip, and every carried unit or
// contract that did not reach the design is a named failure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  evaluateDistributionDelivery,
  run,
} from '../../.claude/scripts/tickets/verify-make-distribution.js';

function step(stepId, operationId) {
  return { stepId, operationId, contract: { pre: ['pre'], post: ['post'], invariants: ['inv'] } };
}

function ticket(overrides = {}) {
  return {
    id: 1,
    phaseId: 0,
    testUnit: [],
    testIntegration: [],
    notes: '',
    contracts: [],
    distribution: { units: [] },
    ...overrides,
  };
}

test('C004 no distribution is skipped', () => {
  const result = evaluateDistributionDelivery(ticket());
  assert.deepEqual(result, { ok: true, skipped: 'no-distribution', findings: [] });
});

test('C003 an implement unit absent from the test plan is DISTRIBUTION_UNIT_UNTESTED', () => {
  const result = evaluateDistributionDelivery(ticket({
    distribution: { units: [{ unitId: 'op-A', kind: 'operation', operationId: 'A', obligation: { mode: 'implement' } }] },
  }));
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((entry) => entry.code === 'DISTRIBUTION_UNIT_UNTESTED'));
});

test('C003 an implement unit named in the test plan passes', () => {
  const result = evaluateDistributionDelivery(ticket({
    testUnit: ['UT: op-A returns the value'],
    distribution: { units: [{ unitId: 'op-A', kind: 'operation', operationId: 'A', obligation: { mode: 'implement' } }] },
  }));
  assert.equal(result.ok, true);
});

test('C003 a missing step contract is STEP_CONTRACT_NOT_DELIVERED', () => {
  const result = evaluateDistributionDelivery(ticket({
    distribution: { units: [{ unitId: 'xdir-S', kind: 'cross-boundary-sequence', obligation: { mode: 'steps', steps: [step('S__s1', 'A')] } }] },
  }));
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((entry) => entry.code === 'STEP_CONTRACT_NOT_DELIVERED'));
});

test('C003 a delivered step contract passes', () => {
  const result = evaluateDistributionDelivery(ticket({
    contracts: [{ stepId: 'S__s1', precondition: 'pre', postcondition: 'post', invariant: 'inv' }],
    distribution: { units: [{ unitId: 'xdir-S', kind: 'cross-boundary-sequence', obligation: { mode: 'steps', steps: [step('S__s1', 'A')] } }] },
  }));
  assert.equal(result.ok, true);
});

test('C003 a missing ctr boundary contract is BOUNDARY_CONTRACT_NOT_DELIVERED', () => {
  const result = evaluateDistributionDelivery(ticket({
    distribution: { units: [{ unitId: 'ctr-boundary-001', kind: 'boundary', obligation: { mode: 'obligation' } }] },
  }));
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((entry) => entry.code === 'BOUNDARY_CONTRACT_NOT_DELIVERED'));
});

test('C003 a delivered ctr boundary contract passes', () => {
  const result = evaluateDistributionDelivery(ticket({
    contracts: [{ boundaryId: 'boundary-001', precondition: 'p', postcondition: 'q', invariant: 'r' }],
    distribution: { units: [{ unitId: 'ctr-boundary-001', kind: 'boundary', obligation: { mode: 'obligation' } }] },
  }));
  assert.equal(result.ok, true);
});

test('C003 an undeclared reference provider is SHARED_WORK_UNDECLARED', () => {
  const result = evaluateDistributionDelivery(ticket({
    distribution: { units: [{ unitId: 'op-B', kind: 'operation', obligation: { mode: 'reference', implementerTicketId: 'P0-1', providers: ['pkg-1'] } }] },
  }));
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((entry) => entry.code === 'SHARED_WORK_UNDECLARED'));
});

test('C003 a reference provider named in the test plan passes', () => {
  const result = evaluateDistributionDelivery(ticket({
    testIntegration: ['IT: consume P0-1 through pkg-1'],
    distribution: { units: [{ unitId: 'op-B', kind: 'operation', obligation: { mode: 'reference', implementerTicketId: 'P0-1', providers: ['pkg-1'] } }] },
  }));
  assert.equal(result.ok, true);
});

test('C003 a spec without the distribution section is DISTRIBUTION_SECTION_MISSING', () => {
  const result = evaluateDistributionDelivery(ticket({
    testUnit: ['UT: op-A'],
    distribution: { units: [{ unitId: 'op-A', kind: 'operation', operationId: 'A', obligation: { mode: 'implement' } }] },
  }), { specText: '# spec\n' });
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((entry) => entry.code === 'DISTRIBUTION_SECTION_MISSING'));
});

test('PX-326 the CLI reads SEQUENCES.json and refuses a missing foreign-step IT entry', () => {
  const root = mkdtempSync(join(tmpdir(), 'px326-cli-'));
  try {
    const target = foreignTicket();
    const document = {
      title: 'Synthetic package',
      round: 1,
      metadata: { source: 'PX-326', generatedAt: '2026-10-27' },
      phases: [{ id: 0, name: 'P0', tickets: [foreignTicketsDocument().phases[0].tickets[0], target] }],
    };
    writeFileSync(join(root, 'Tickets.json'), JSON.stringify(document, null, 2));
    writeFileSync(join(root, 'SEQUENCES.json'), JSON.stringify(foreignView(), null, 2));

    const refused = run(['--ticket-key=P0-2', `--tickets=${join(root, 'Tickets.json')}`]);
    assert.equal(refused.code, 1);
    assert.ok(refused.findings.some((entry) => entry.code === 'SHARED_STEP_INTEGRATION_MISSING'));

    document.phases[0].tickets[1].testIntegration = ['IT: S__s2 from P0-1 across boundary-001'];
    writeFileSync(join(root, 'Tickets.json'), JSON.stringify(document, null, 2));
    const accepted = run(['--ticket-key=P0-2', `--tickets=${join(root, 'Tickets.json')}`]);
    assert.equal(accepted.code, 0, JSON.stringify(accepted.findings));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C004 a missing ticket is a skip, not a failure', () => {
  const root = mkdtempSync(join(tmpdir(), 'px324-'));
  writeFileSync(join(root, 'Tickets.json'), JSON.stringify({ title: 't', metadata: {}, phases: [] }));
  const result = run(['--ticket-key=PX-9', `--tickets=${join(root, 'Tickets.json')}`]);
  assert.equal(result.code, 0);
  assert.deepEqual(result.verdict, { ok: true, skipped: 'ticket-not-found', findings: [] });
  rmSync(root, { recursive: true, force: true });
});

// F1: the producer writes the phase-local numeric id beside the durable ticket key. A
// same-package reference has no provider package, so the key is the only term the gate
// can check. Reading the numeric id alone leaves the reference unverified.
function samePackageReference() {
  return ticket({
    distribution: {
      units: [{
        unitId: 'op-B',
        kind: 'operation',
        obligation: {
          mode: 'reference',
          providers: [],
          implementerTicketId: 12,
          implementerTicketKey: 'P0-12',
        },
      }],
    },
  });
}

// PX-326: the presented division of labour and operation obligations must reach the test
// plan. These fixtures keep the existing local-step and ctr checks green so each new
// finding is isolated.
// [::TICKET::] PX-326 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-326 --for-spec --no-implementation-order`.
function foreignView({ crosses = ['boundary:boundary-001'] } = {}) {
  return {
    packageId: 'pkg-1',
    ownedSequenceUnits: [],
    crossBoundarySequenceUnits: [{
      unitId: 'xdir-S',
      sequenceId: 'S',
      ownerPackageIds: ['pkg-1', 'pkg-2'],
      steps: [
        step('S__s1', 'A'),
        { stepId: 'S__s2', operationId: 'B', order: 2, contract: { pre: ['pre2'], post: ['post2'], invariants: ['inv2'], crosses } },
      ],
    }],
  };
}

// [::TICKET::] PX-326 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-326 --for-spec --no-implementation-order`.
function foreignTicketsDocument() {
  return {
    phases: [{
      id: 0,
      tickets: [
        { id: 1, phaseId: 0, distribution: { units: [{ unitId: 'op-B', kind: 'operation', obligation: { mode: 'implement' } }] } },
        { id: 2, phaseId: 0 },
      ],
    }],
  };
}

// [::TICKET::] PX-326 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-326 --for-spec --no-implementation-order`.
function foreignTicket(overrides = {}) {
  return ticket({
    id: 2,
    testUnit: ['UT: op-A returns the value'],
    testIntegration: [],
    contracts: [
      { stepId: 'S__s1', precondition: 'pre', postcondition: 'post', invariant: 'inv' },
      { boundaryId: 'boundary-001', precondition: 'p', postcondition: 'q', invariant: 'r' },
    ],
    distribution: {
      units: [
        { unitId: 'op-A', kind: 'operation', operationId: 'A', obligation: { mode: 'implement' } },
        { unitId: 'xdir-S', kind: 'cross-boundary-sequence', sequenceId: 'S', obligation: { mode: 'steps', steps: [step('S__s1', 'A')] } },
        { unitId: 'ctr-boundary-001', kind: 'boundary', obligation: { mode: 'obligation' } },
      ],
    },
    ...overrides,
  });
}

test('PX-326 a boundary-crossing foreign step without an IT entry is SHARED_STEP_INTEGRATION_MISSING', () => {
  const result = evaluateDistributionDelivery(foreignTicket(), {
    view: foreignView(),
    ticketsDocument: foreignTicketsDocument(),
  });
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((entry) => entry.code === 'SHARED_STEP_INTEGRATION_MISSING' && entry.subject === 'S__s2'));
});

test('PX-326 a foreign step IT entry naming the owner, step and boundary passes', () => {
  const result = evaluateDistributionDelivery(foreignTicket({
    testIntegration: ['IT: S__s2 from P0-1 across boundary-001'],
  }), {
    view: foreignView(),
    ticketsDocument: foreignTicketsDocument(),
  });
  assert.equal(result.ok, true, JSON.stringify(result.findings));
});

test('PX-326 a foreign step that neither crosses nor links to a local step is informational', () => {
  const result = evaluateDistributionDelivery(foreignTicket(), {
    view: foreignView({ crosses: [] }),
    ticketsDocument: foreignTicketsDocument(),
  });
  assert.equal(result.ok, true, JSON.stringify(result.findings));
});

test('PX-326 a readable view that omits the sequence unit is DISTRIBUTION_VIEW_MISSING', () => {
  const result = evaluateDistributionDelivery(foreignTicket(), {
    view: { packageId: 'pkg-1', ownedSequenceUnits: [], crossBoundarySequenceUnits: [] },
    ticketsDocument: foreignTicketsDocument(),
  });
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((entry) => entry.code === 'DISTRIBUTION_VIEW_MISSING' && entry.subject === 'xdir-S'));
});

test('PX-326 a sequence unit with no readable view is DISTRIBUTION_VIEW_MISSING', () => {
  const result = evaluateDistributionDelivery(foreignTicket(), { view: null, ticketsDocument: foreignTicketsDocument() });
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((entry) => entry.code === 'DISTRIBUTION_VIEW_MISSING'));
});

test('PX-326 a reference provider named only in notes is SHARED_WORK_UNDECLARED', () => {
  const result = evaluateDistributionDelivery(ticket({
    notes: 'provider pkg-1',
    distribution: { units: [{ unitId: 'op-B', kind: 'operation', obligation: { mode: 'reference', providers: ['pkg-1'] } }] },
  }));
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((entry) => entry.code === 'SHARED_WORK_UNDECLARED'));
});

test('PX-326 a local step axis absent from the test plan is STEP_AXIS_NOT_DELIVERED', () => {
  const localStep = { stepId: 'S__s1', operationId: 'A', order: 1, contract: { pre: ['pre'], post: ['post'], invariants: ['inv'], consumes: ['object:X'] } };
  const result = evaluateDistributionDelivery(ticket({
    testUnit: ['UT: op-A returns the value'],
    contracts: [{ stepId: 'S__s1', precondition: 'pre', postcondition: 'post', invariant: 'inv', contract: { consumes: ['object:X'] } }],
    distribution: { units: [
      { unitId: 'op-A', kind: 'operation', operationId: 'A', obligation: { mode: 'implement' } },
      { unitId: 'seq-S', kind: 'sequence', obligation: { mode: 'steps', steps: [localStep] } },
    ] },
  }));
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((entry) => entry.code === 'STEP_AXIS_NOT_DELIVERED' && entry.subject === 'S__s1:consumes'));
});

test('PX-326 a local step axis named in the test plan passes', () => {
  const localStep = { stepId: 'S__s1', operationId: 'A', order: 1, contract: { pre: ['pre'], post: ['post'], invariants: ['inv'], consumes: ['object:X'] } };
  const result = evaluateDistributionDelivery(ticket({
    testUnit: ['UT: op-A consumes object:X'],
    contracts: [{ stepId: 'S__s1', precondition: 'pre', postcondition: 'post', invariant: 'inv', contract: { consumes: ['object:X'] } }],
    distribution: { units: [
      { unitId: 'op-A', kind: 'operation', operationId: 'A', obligation: { mode: 'implement' } },
      { unitId: 'seq-S', kind: 'sequence', obligation: { mode: 'steps', steps: [localStep] } },
    ] },
  }));
  assert.equal(result.ok, true, JSON.stringify(result.findings));
});

test('PX-326 an unplanned contract-bearing operation field is OPERATION_OBLIGATION_UNPLANNED', () => {
  const result = evaluateDistributionDelivery(ticket({
    testUnit: ['UT: op-A returns the value'],
    distribution: { units: [{ unitId: 'op-A', kind: 'operation', operationId: 'A', obligation: { mode: 'implement', finalityPredicate: 'none required' } }] },
  }));
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((entry) => entry.code === 'OPERATION_OBLIGATION_UNPLANNED' && entry.subject === 'op-A:finalityPredicate'));
});

test('PX-326 a planned contract-bearing operation field passes', () => {
  const result = evaluateDistributionDelivery(ticket({
    testUnit: ['UT: op-A finalityPredicate is none required'],
    distribution: { units: [{ unitId: 'op-A', kind: 'operation', operationId: 'A', obligation: { mode: 'implement', finalityPredicate: 'none required' } }] },
  }));
  assert.equal(result.ok, true, JSON.stringify(result.findings));
});

test('C003 a same-package reference requires its durable implementer key', () => {
  const unnamed = evaluateDistributionDelivery(samePackageReference());
  assert.equal(unnamed.ok, false, 'a reference with no named provider is a finding');
  assert.ok(unnamed.findings.some((entry) => entry.code === 'SHARED_WORK_UNDECLARED'));

  const named = evaluateDistributionDelivery({
    ...samePackageReference(),
    testIntegration: ['IT: consume P0-12 through its boundary contract'],
  });
  assert.equal(named.ok, true, 'naming the durable key declares the provider');

  const numericOnly = evaluateDistributionDelivery({
    ...samePackageReference(),
    testIntegration: ['IT: consume ticket 12'],
  });
  assert.equal(numericOnly.ok, false, 'the phase-local number is not the durable key');
});
