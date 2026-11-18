'use strict';

/**
 * PX-443 follow-up — the contract-count workload component.
 *
 * The omission planner must size a ticket by the distinct RFC contracts it
 * carries, not only by its test count. A 4-contract ceiling is a real ceiling,
 * not a graph-unit metric that is always zero for an omission ticket.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  CALIBRATED_WORKLOAD_COMPONENTS,
  WORKLOAD_COMPONENTS,
  minimumTicketCount,
  parseWorkBudget,
  workloadOfTicket,
} = require('../../.claude/scripts/tickets/lib/ticket-workload.js');
const {
  minimumContiguousPartition,
} = require('../../.claude/scripts/tickets/lib/ticket-partition.js');
const {
  blockerEntriesOf,
} = require('../../.claude/scripts/tickets/lib/blocker-plan.js');
const {
  planOmissionTickets,
} = require('../../.claude/scripts/tickets/apply-omission-findings.js');
const {
  verifyOmissionPlan,
} = require('../../.claude/scripts/tickets/lib/omission-plan-gate.js');

const BASE_BUDGET = Object.freeze({
  operations: 8,
  sequenceSteps: 8,
  ownedContracts: 4,
  files: 15,
  testUnit: 100,
  testIntegration: 6,
  modules: 4,
  contractCount: 4,
});

/** One clause of a contract. */
function clause(scope, contractId, element, index) {
  return {
    key: `clause|${scope}|${contractId}|${element}|${String(index).padStart(16, '0')}`,
    scope,
    contractId,
    element,
    text: `${contractId} ${element}`,
    source: [{ artifact: 'RFC-GRAPH.json', locator: `edge/${contractId}/${element}` }],
    owners: ['P0-1'],
    status: 'TEST_MISSING',
  };
}

/** A package with one complete three-element contract per entry. */
function packageFixture(contractCount) {
  const inventoryClauses = [];
  const coverageClauses = [];
  for (let index = 1; index <= contractCount; index += 1) {
    const contractId = 'C' + String(index).padStart(3, '0');
    for (const [elementIndex, element] of ['precondition', 'postcondition', 'invariant'].entries()) {
      const entry = clause('pkg-alpha', contractId, element, index * 10 + elementIndex);
      inventoryClauses.push({ ...entry, status: undefined });
      coverageClauses.push({ key: entry.key, status: 'TEST_MISSING' });
    }
  }
  return { inventory: { scope: 'pkg-alpha', clauses: inventoryClauses }, coverage: { clauses: coverageClauses } };
}

// @verifies C003
test('C003: workloadOfTicket counts distinct contract ids', () => {
  const workload = workloadOfTicket({
    contracts: [{ id: 'C001' }, { id: 'C002' }, { id: 'C002' }, { id: null }],
    testUnit: ['t'],
  });
  assert.equal(workload.contractCount, 2);
});

// @verifies C003
test('C003: the calibrated component list adds contractCount without changing v2', () => {
  assert.equal(WORKLOAD_COMPONENTS.length, 7);
  assert.deepEqual(CALIBRATED_WORKLOAD_COMPONENTS, [...WORKLOAD_COMPONENTS, 'contractCount']);
});

// @verifies C003
test('C003: parseWorkBudget accepts v4 with contractCount and rejects a v4 without it', () => {
  const document = {
    version: 4,
    components: [...CALIBRATED_WORKLOAD_COMPONENTS],
    budget: { ...BASE_BUDGET },
    provenance: 'measured',
    partitionPolicy: 'contiguous-minimum',
    splitReasons: ['budget', 'ownership-boundary'],
  };
  const parsed = parseWorkBudget(document);
  assert.equal(parsed.valid, true);
  assert.deepEqual(parsed.components, [...CALIBRATED_WORKLOAD_COMPONENTS]);
  assert.equal(parsed.budget.contractCount, 4);

  const missing = { ...document, budget: { ...BASE_BUDGET, contractCount: undefined } };
  delete missing.budget.contractCount;
  assert.equal(parseWorkBudget(missing).valid, false);
});

// @verifies C003
test('C003: the shipped budget is v4 and declares the contract ceiling', () => {
  const document = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, '../../.claude/scripts/tickets/ticket-work-budget.json'),
    'utf8',
  ));
  const parsed = parseWorkBudget(document);
  assert.equal(parsed.valid, true);
  assert.equal(document.version, 4);
  assert.equal(parsed.components.includes('contractCount'), true);
  assert.equal(parsed.budget.contractCount >= 1, true);
});

// @verifies C003
test('C003: the partition splits when the next contract would exceed the contract ceiling', () => {
  const tickets = Array.from({ length: 5 }, (_, index) => ({
    id: index + 1,
    phaseId: 0,
    status: 'todo',
    contracts: [{ id: 'C' + String(index + 1).padStart(3, '0') }],
    testUnit: ['t' + index],
    testIntegration: [],
  }));
  const plan = minimumContiguousPartition(tickets, {}, { ...BASE_BUDGET, contractCount: 2 }, {
    components: CALIBRATED_WORKLOAD_COMPONENTS,
    mergeStatusPolicy: 'todo',
  });

  assert.equal(plan.count, 3);
  assert.deepEqual(plan.groups.map((group) => group.workload.contractCount), [2, 2, 1]);
});

// @verifies C003
test('C003: minimumTicketCount uses the contract ceiling', () => {
  const workload = { ...Object.fromEntries(WORKLOAD_COMPONENTS.map((component) => [component, 0])), contractCount: 5 };
  assert.equal(minimumTicketCount(workload, { ...BASE_BUDGET, contractCount: 2 }, CALIBRATED_WORKLOAD_COMPONENTS), 3);
});

// @verifies C003
test('C003: the omission planner never puts more than the contract ceiling in one ticket', () => {
  const { inventory, coverage } = packageFixture(10);
  const remainder = blockerEntriesOf({ inventory, coverage });
  const plan = planOmissionTickets({
    remainder,
    inventory,
    ticketsData: { phases: [] },
    phases: [],
    budget: BASE_BUDGET,
    components: CALIBRATED_WORKLOAD_COMPONENTS,
    context: {},
  });

  assert.equal(plan.created.length, 3);
  assert.equal(plan.created.every((ticket) => ticket.contracts.length <= BASE_BUDGET.contractCount), true);
  assert.equal(plan.created.reduce((total, ticket) => total + ticket.testUnit.length, 0), 30);

  const added = plan.created.map((ticket) => `P${ticket.phaseId}-${ticket.id}`);
  const result = verifyOmissionPlan({
    before: { phases: [] },
    candidate: plan.ticketsData,
    addedKeys: added,
    artifacts: {
      coverage,
      budget: BASE_BUDGET,
      components: CALIBRATED_WORKLOAD_COMPONENTS,
      repairs: { records: [...plan.repairs, ...plan.unprojectable] },
      context: {},
      mergeStatusPolicy: 'todo',
    },
  });
  assert.equal(result.ok, true, JSON.stringify(result.findings.slice(0, 3)));
});

// @verifies C003
test('C003: a five-contract ticket under a four-contract ceiling is over budget', () => {
  const { inventory, coverage } = packageFixture(5);
  const remainder = blockerEntriesOf({ inventory, coverage });
  const plan = planOmissionTickets({
    remainder,
    inventory,
    ticketsData: { phases: [] },
    phases: [],
    budget: { ...BASE_BUDGET, contractCount: 5, testUnit: 100 },
    components: CALIBRATED_WORKLOAD_COMPONENTS,
    context: {},
  });
  assert.equal(plan.created.length, 1);

  const added = plan.created.map((ticket) => `P${ticket.phaseId}-${ticket.id}`);
  const result = verifyOmissionPlan({
    before: { phases: [] },
    candidate: plan.ticketsData,
    addedKeys: added,
    artifacts: {
      coverage,
      budget: BASE_BUDGET,
      components: CALIBRATED_WORKLOAD_COMPONENTS,
      repairs: { records: [] },
      context: {},
      mergeStatusPolicy: 'todo',
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.findings.some((finding) => finding.code === 'OMISSION_TICKET_OVER_BUDGET'), true);
});
