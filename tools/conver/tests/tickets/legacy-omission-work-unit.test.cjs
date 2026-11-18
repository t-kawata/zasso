'use strict';

/**
 * PX-443 follow-up — the legacy omission path must produce measured tickets.
 *
 * A legacy omission clone inherits the source ticket's test plan. That plan
 * belongs to the source, not to the omission, so the clone must replace it with
 * one planned test per failed evaluation and carry omissionUnits. Otherwise the
 * post-merge condense gate treats it as an evidence ticket and fails closed.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  legacyOmissionWorkOf,
} = require('../../.claude/scripts/tickets/lib/legacy-omission-work-unit.js');
const {
  condensePlan,
} = require('../../.claude/scripts/tickets/lib/ticket-partition.js');
const {
  CALIBRATED_WORKLOAD_COMPONENTS,
  parseWorkBudget,
} = require('../../.claude/scripts/tickets/lib/ticket-workload.js');
const {
  condenseAfterMerge,
} = require('../../.claude/scripts/rfc-graph/phasify-omissions.js');

const SHIPPED_BUDGET = parseWorkBudget(JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '../../.claude/scripts/tickets/ticket-work-budget.json'),
  'utf8',
))).budget;

/** A source ticket with two failed evaluations. */
function sourceTicket() {
  return {
    title: 'Source',
    status: 'reviewed',
    contracts: [{ id: 'C001', sourceEdge: 'N0001->N0002', precondition: 'p', postcondition: 'q', invariant: 'r' }],
    testUnit: ['UT: source one', 'UT: source two'],
    testIntegration: [],
    nodeIds: ['N0001'],
    default_files: ['src/a.js'],
    foundOmissions: [{
      severity: 'critical',
      evaluations: [
        { criterion: 'A', passed: false, reason: 'missing boundary test', evidence: [{ file: 'src/a.js', line: 1 }] },
        { criterion: 'B', passed: true, reason: 'covered', evidence: [{ file: 'src/a.js', line: 2 }] },
        { criterion: 'C', passed: false, reason: 'assertion too weak', evidence: [{ file: 'src/a.js', line: 3 }] },
      ],
    }],
    originalTicketKey: 'P0-1',
    origin: { kind: 'omission', sourceTicket: 'P0-1' },
  };
}

test('C003: a legacy omission replaces the source test plan with one test per failed evaluation', () => {
  const work = legacyOmissionWorkOf(sourceTicket(), { replaceTestPlan: true });

  assert.equal(work.testUnit.length, 2);
  assert.equal(work.testIntegration.length, 0);
  assert.equal(work.omissionUnits.length, 1);
  assert.equal(work.omissionUnits[0].blockingClass, 'test-missing');
  assert.equal(work.omissionUnits[0].contractId, 'C001');
  assert.equal(work.omissionUnits[0].clauses.length, 2);
  assert.equal(work.omissionUnits[0].rootTicketKey, 'P0-1');
  assert.equal(work.omissionStableKeys[0], 'C001');
  assert.notDeepEqual(work.testUnit, ['UT: source one', 'UT: source two']);
});

test('C003: a legacy finding keeps its existing test plan and gains an omission unit', () => {
  const work = legacyOmissionWorkOf({
    title: 'Detected',
    contracts: [{ id: 'C002' }],
    testUnit: ['UT: stable finding'],
    testIntegration: [],
    omissionStableKey: 'detector|asset',
    originalTicketKey: 'P1-2',
  });

  assert.deepEqual(work.testUnit, ['UT: stable finding']);
  assert.equal(work.omissionUnits.length, 1);
  assert.deepEqual(work.omissionUnits[0].clauses, ['detector|asset']);
});

test('C003: a legacy omission with no evaluation and no test plan is not measured', () => {
  assert.equal(legacyOmissionWorkOf({
    title: 'Empty',
    contracts: [{ id: 'C003' }],
    testUnit: [],
    testIntegration: [],
  }), null);
});

/** One measured legacy omission ticket. */
function measuredLegacyTicket(id, contractId, work) {
  return {
    id,
    phaseId: 0,
    status: 'todo',
    title: 'Omission ' + contractId,
    nodeIds: [],
    default_files: [],
    contracts: [{ id: contractId, sourceEdge: 'N0001->N0002', precondition: 'p', postcondition: 'q', invariant: 'r' }],
    testUnit: work.testUnit,
    testIntegration: work.testIntegration,
    omissionUnits: work.omissionUnits,
    omissionUnitKeys: work.omissionUnitKeys,
    omissionStableKeys: work.omissionStableKeys,
    origin: { kind: 'omission', sourceTicket: 'P0-1' },
    changes: [],
  };
}

test('C003: two measured legacy omission tickets condense to one under the v4 budget', () => {
  const first = measuredLegacyTicket(1, 'C001', legacyOmissionWorkOf({
    contracts: [{ id: 'C001' }],
    testUnit: ['UT: one'],
    omissionStableKey: 'legacy|C001|A|one',
    originalTicketKey: 'P0-1',
  }));
  const second = measuredLegacyTicket(2, 'C002', legacyOmissionWorkOf({
    contracts: [{ id: 'C002' }],
    testUnit: ['UT: two'],
    omissionStableKey: 'legacy|C002|A|two',
    originalTicketKey: 'P0-1',
  }));

  const plan = condensePlan({ id: 0, tickets: [first, second] }, {}, SHIPPED_BUDGET, {
    components: CALIBRATED_WORKLOAD_COMPONENTS,
    mergeStatusPolicy: 'todo',
  });

  assert.equal(plan.after, 1);
  assert.equal(plan.tickets[0].testUnit.length, 2);
  assert.equal(plan.tickets[0].contracts.length, 2);
  assert.equal(plan.tickets[0].omissionUnits.length, 2);
});

test('C003: a failed post-merge condensation restores the pre-merge Tickets.json', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'px443-phasify-condense-'));
  try {
    const ticketsPath = path.join(directory, 'Tickets.json');
    const backupPath = path.join(directory, 'tmp-Tickets-backup.json');
    const before = JSON.stringify({ title: 'before', phases: [] }) + '\n';
    const after = JSON.stringify({ title: 'after', phases: [] }) + '\n';
    fs.writeFileSync(ticketsPath, after, 'utf8');
    fs.writeFileSync(backupPath, before, 'utf8');

    const failed = condenseAfterMerge({
      ticketsPath,
      backupPath,
      run: () => ({ status: 1, stderr: 'condense refused' }),
    });
    assert.equal(failed.ok, false);
    assert.equal(failed.code, 'CONDENSE_AFTER_MERGE_FAILED');
    assert.equal(fs.readFileSync(ticketsPath, 'utf8'), before);

    const gateFailed = condenseAfterMerge({
      ticketsPath,
      backupPath,
      run: (args) => (args.includes('--gate')
        ? { status: 1, stderr: 'gate refused' }
        : { status: 0, stderr: '' }),
    });
    assert.equal(gateFailed.ok, false);
    assert.equal(gateFailed.code, 'CONDENSE_GATE_FAILED');
    assert.equal(fs.readFileSync(ticketsPath, 'utf8'), before);

    fs.writeFileSync(ticketsPath, after, 'utf8');
    const ok = condenseAfterMerge({
      ticketsPath,
      backupPath,
      run: () => ({ status: 0, stderr: '' }),
    });
    assert.equal(ok.ok, true);
    assert.equal(fs.readFileSync(ticketsPath, 'utf8'), after);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
