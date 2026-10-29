// PX-331 @verifies C001 C002 C003
// A boundary a local step crosses is part of the ticket's division interface even when the
// ticket does not own the boundary's ctr node. The registry contract must reach the ticket,
// appear in the brief, and be gated as a test-plan obligation. Case B carries no
// distribution units and keeps its old path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { mergeContracts, verifyMergedBoundaryContracts } = require('../../.claude/scripts/tickets/merge-contracts-to-tickets.js');
const { evaluateDistributionDelivery } = require('../../.claude/scripts/tickets/verify-make-distribution.js');
const { renderWorkShare } = require('../../.claude/scripts/tickets/show-ticket-context.js');

const REGISTRY = [{
  boundary_id: 'boundary-029',
  provider_package: 'pkg-0004',
  consumer_package: 'pkg-0011',
  clauses: {
    preconditions: ['transfer authority is established'],
    postconditions: ['the transfer reservation is durable'],
    invariants: ['one active transfer per soul'],
  },
}];

/** One local step that crosses a boundary the ticket does not carry as a ctr unit. */
// [::TICKET::] PX-331 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-331 --for-spec --no-implementation-order`.
function crossingStep(stepId = 'S__s1') {
  return {
    stepId,
    operationId: 'A',
    order: 1,
    contract: { pre: [], post: [], invariants: [], crosses: ['boundary:boundary-029'] },
  };
}

/** A ticket that implements the crossing step but owns no ctr boundary node. */
// [::TICKET::] PX-331 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-331 --for-spec --no-implementation-order`.
function crossingTicket(overrides = {}) {
  return {
    id: 1,
    phaseId: 0,
    nodeIds: ['N1'],
    distribution: {
      units: [{
        unitId: 'xdir-S',
        kind: 'cross-boundary-sequence',
        sequenceId: 'S',
        obligation: { mode: 'steps', outcome: 'realized', steps: [crossingStep()] },
      }],
    },
    contracts: [],
    testUnit: ['UT: op-A honours boundary-029'],
    testIntegration: [],
    ...overrides,
  };
}

/** The step contract merge attaches from the step sidecar. */
// [::TICKET::] PX-331 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-331 --for-spec --no-implementation-order`.
function stepContract() {
  return {
    id: 'C500',
    stepId: 'S__s1',
    sequenceId: 'S',
    operationId: 'A',
    sourceStep: 'S__s1',
    sourceEdge: 'step:S__s1',
    precondition: 'step pre',
    postcondition: 'step post',
    invariant: 'step invariant',
    contract: { pre: [], post: [], invariants: [], crosses: ['boundary:boundary-029'] },
  };
}

/** The graph the split reads. The ticket's node carries the operation, not the boundary. */
// [::TICKET::] PX-331 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-331 --for-spec --no-implementation-order`.
function graph() {
  return {
    nodes: [{ id: 'N1', unitIds: ['op-A'] }],
    edges: [],
  };
}

/** The package view that declares the crossed sequence and its step. */
// [::TICKET::] PX-331 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-331 --for-spec --no-implementation-order`.
function view() {
  return {
    packageId: 'pkg-0002',
    ownedSequenceUnits: [],
    crossBoundarySequenceUnits: [{
      unitId: 'xdir-S',
      sequenceId: 'S',
      ownerPackageIds: ['pkg-0002', 'pkg-0004'],
      steps: [crossingStep()],
    }],
  };
}

/** The ticket document the delivery gate reads for owner resolution. */
// [::TICKET::] PX-331 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-331 --for-spec --no-implementation-order`.
function ticketsDocument(ticket) {
  return { phases: [{ id: 0, tickets: [ticket] }] };
}

const CROSSED_NOT_DELIVERED = 'CROSSED_BOUNDARY_CONTRACT_NOT_DELIVERED';
const CROSSED_UNTESTED = 'CROSSED_BOUNDARY_CONTRACT_UNTESTED';

test('C001 a local crossing step receives the registry boundary contract without a ctr unit', () => {
  const ticket = crossingTicket();
  mergeContracts([ticket], graph(), REGISTRY, { steps: [] });

  const contract = ticket.contracts.find((entry) => entry.boundaryId === 'boundary-029');
  assert.equal(contract?.id, 'contract-boundary-029');
  assert.equal(contract?.precondition, 'transfer authority is established');
  assert.equal(contract?.postcondition, 'the transfer reservation is durable');
  assert.equal(contract?.invariant, 'one active transfer per soul');
});

test('C001 a ticket that carries the ctr unit and crosses the same boundary receives one contract', () => {
  const ticket = crossingTicket();
  ticket.distribution.units.push({
    unitId: 'ctr-boundary-029',
    kind: 'boundary',
    obligation: { mode: 'obligation', direction: 'provides', counterpart: 'pkg-0011' },
  });
  mergeContracts([ticket], graph(), REGISTRY, { steps: [] });

  const matches = ticket.contracts.filter((entry) => entry.id === 'contract-boundary-029');
  assert.equal(matches.length, 1);
});

test('C001 a ticket with no crossing and no ctr unit receives no boundary contract', () => {
  const ticket = crossingTicket({
    distribution: {
      units: [{
        unitId: 'seq-S',
        kind: 'sequence',
        sequenceId: 'S',
        obligation: { mode: 'steps', steps: [{ stepId: 'S__s1', operationId: 'A', order: 1, contract: { pre: [], post: [], invariants: [] } }] },
      }],
    },
  });
  mergeContracts([ticket], graph(), REGISTRY, { steps: [] });
  assert.equal(ticket.contracts.some((entry) => entry.boundaryId === 'boundary-029'), false);
});

test('C001 the crossed boundary contract is a registry-backed contract, not an invention', () => {
  const ticket = crossingTicket();
  mergeContracts([ticket], graph(), REGISTRY, { steps: [] });
  assert.deepEqual(verifyMergedBoundaryContracts([ticket], graph(), REGISTRY, { steps: [] }), []);
});

test('C002 the delivery gate fails closed when the crossed boundary contract is absent', () => {
  const ticket = crossingTicket({ contracts: [stepContract()] });
  const result = evaluateDistributionDelivery(ticket, {
    view: view(),
    ticketsDocument: ticketsDocument(ticket),
  });
  assert.ok(result.findings.some((finding) => finding.code === CROSSED_NOT_DELIVERED));
});

test('C002 the delivery gate fails when the crossed boundary contract id is not in the test plan', () => {
  const boundaryContract = {
    id: 'contract-boundary-029',
    sourceEdge: 'boundary:boundary-029',
    boundaryId: 'boundary-029',
    registryContractId: 'contract-boundary-029',
    precondition: 'transfer authority is established',
    postcondition: 'the transfer reservation is durable',
    invariant: 'one active transfer per soul',
  };
  const ticket = crossingTicket({ contracts: [stepContract(), boundaryContract] });
  const result = evaluateDistributionDelivery(ticket, {
    view: view(),
    ticketsDocument: ticketsDocument(ticket),
  });
  assert.ok(result.findings.some((finding) => finding.code === CROSSED_UNTESTED));
});

test('C002 the delivery gate passes the crossed boundary when its id is planned', () => {
  const boundaryContract = {
    id: 'contract-boundary-029',
    sourceEdge: 'boundary:boundary-029',
    boundaryId: 'boundary-029',
    registryContractId: 'contract-boundary-029',
    precondition: 'transfer authority is established',
    postcondition: 'the transfer reservation is durable',
    invariant: 'one active transfer per soul',
  };
  const ticket = crossingTicket({
    contracts: [stepContract(), boundaryContract],
    testUnit: ['UT: op-A honours contract-boundary-029 and boundary-029'],
  });
  const result = evaluateDistributionDelivery(ticket, {
    view: view(),
    ticketsDocument: ticketsDocument(ticket),
  });
  assert.equal(result.findings.some((finding) => finding.code === CROSSED_NOT_DELIVERED
    || finding.code === CROSSED_UNTESTED), false);
});

test('C003 the brief renders a crossed boundary with its direction and clauses', () => {
  const boundaryContract = {
    id: 'contract-boundary-029',
    sourceEdge: 'boundary:boundary-029',
    boundaryId: 'boundary-029',
    registryContractId: 'contract-boundary-029',
    precondition: 'transfer authority is established',
    postcondition: 'the transfer reservation is durable',
    invariant: 'one active transfer per soul',
  };
  const ticket = crossingTicket({ contracts: [stepContract(), boundaryContract] });
  const text = renderWorkShare(ticket, {
    ticketsDocument: ticketsDocument(ticket),
    view: view(),
    registry: REGISTRY,
  });
  assert.match(text, /#### Crossed boundary boundary-029/);
  assert.match(text, /- provider: pkg-0004/);
  assert.match(text, /- consumer: pkg-0011/);
  assert.match(text, /- contract id: contract-boundary-029/);
  assert.match(text, /- precondition: transfer authority is established/);
  assert.match(text, /- postcondition: the transfer reservation is durable/);
  assert.match(text, /- invariant: one active transfer per soul/);
});

test('C003 a carried ctr boundary is not rendered twice as a crossed boundary', () => {
  const boundaryContract = {
    id: 'contract-boundary-029',
    sourceEdge: 'boundary:boundary-029',
    boundaryId: 'boundary-029',
    registryContractId: 'contract-boundary-029',
    precondition: 'transfer authority is established',
    postcondition: 'the transfer reservation is durable',
    invariant: 'one active transfer per soul',
  };
  const ticket = crossingTicket({ contracts: [stepContract(), boundaryContract] });
  ticket.distribution.units.push({
    unitId: 'ctr-boundary-029',
    kind: 'boundary',
    obligation: { mode: 'obligation', direction: 'provides', counterpart: 'pkg-0011' },
  });
  const text = renderWorkShare(ticket, {
    ticketsDocument: ticketsDocument(ticket),
    view: view(),
    registry: REGISTRY,
  });
  assert.equal(text.match(/#### Boundary boundary-029/g)?.length, 1);
  assert.equal(text.includes('#### Crossed boundary boundary-029'), false);
});
