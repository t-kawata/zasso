'use strict';

/**
 * PX-443 follow-up — calibrate ticket-work-budget.json from reviewed tickets.
 *
 * The ceiling is measured, not guessed: nearest-rank P75 over completed tickets
 * that carry test work. Zero-work omission tickets and todo tickets never enter
 * the sample.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  CALIBRATED_WORKLOAD_COMPONENTS,
  parseWorkBudget,
} = require('../../.claude/scripts/tickets/lib/ticket-workload.js');
const {
  calibrateBudget,
  nearestRank,
} = require('../../.claude/scripts/tickets/calibrate-work-budget.js');

const SCRIPT = path.resolve(__dirname, '../../.claude/scripts/tickets/calibrate-work-budget.js');

const BASE_BUDGET = Object.freeze({
  operations: 8,
  sequenceSteps: 8,
  ownedContracts: 4,
  files: 15,
  testUnit: 18,
  testIntegration: 6,
  modules: 4,
  contractCount: 6,
});

/** One ticket with the fields the workload reader uses. */
function ticket(id, overrides = {}) {
  return {
    id,
    phaseId: 0,
    status: 'reviewed',
    title: 'Ticket ' + id,
    contracts: [{ id: 'C' + String(id).padStart(3, '0') }],
    testUnit: ['t' + id],
    testIntegration: [],
    default_files: [],
    ...overrides,
  };
}

/** A document with four reviewed tickets and two tickets that must be excluded. */
function fixture() {
  return {
    title: 'calibration fixture',
    phases: [
      { id: 0, name: 'P0', tickets: [
        ticket(1, { testUnit: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'], contracts: [{ id: 'C001' }] }),
        ticket(2, { testUnit: Array.from({ length: 20 }, (_, i) => 't' + i), contracts: [{ id: 'C001' }, { id: 'C002' }] }),
        ticket(3, { testUnit: Array.from({ length: 30 }, (_, i) => 't' + i), contracts: [{ id: 'C001' }, { id: 'C002' }, { id: 'C003' }] }),
        ticket(4, { testUnit: Array.from({ length: 40 }, (_, i) => 't' + i), contracts: [{ id: 'C001' }, { id: 'C002' }, { id: 'C003' }, { id: 'C004' }] }),
        ticket(5, { status: 'todo', testUnit: Array.from({ length: 1000 }, (_, i) => 'todo' + i) }),
        ticket(6, { status: 'R1', testUnit: [], contracts: [] }),
      ] },
    ],
  };
}

test('C003: nearest-rank P75 is the smallest value covering 75% of the sample', () => {
  assert.equal(nearestRank([10, 20, 30, 40], 75), 30);
  assert.equal(nearestRank([40, 10, 30, 20], 75), 30);
  assert.equal(nearestRank([10], 75), 10);
  assert.equal(nearestRank([], 75), null);
});

test('C003: calibration uses completed measured tickets and excludes todo and zero-work records', () => {
  const result = calibrateBudget({
    ticketsDocument: fixture(),
    baseBudget: { version: 4, budget: BASE_BUDGET, components: CALIBRATED_WORKLOAD_COMPONENTS },
    percentile: 75,
    now: '2026-01-01T00:00:00.000Z',
    source: 'fixture/Tickets.json',
  });

  assert.equal(result.sampleSize, 4);
  assert.equal(result.document.version, 4);
  assert.deepEqual(result.document.components, [...CALIBRATED_WORKLOAD_COMPONENTS]);
  assert.equal(result.document.budget.testUnit, 30);
  assert.equal(result.document.budget.contractCount, 3);
  assert.equal(result.document.budget.operations, BASE_BUDGET.operations);
  assert.equal(result.document.budget.sequenceSteps, BASE_BUDGET.sequenceSteps);
  assert.equal(result.document.budget.ownedContracts, BASE_BUDGET.ownedContracts);
  assert.equal(result.document.budget.files, BASE_BUDGET.files);
  assert.equal(result.document.budget.modules, BASE_BUDGET.modules);
  assert.match(result.document.provenance, /sample=4/);
  assert.match(result.document.provenance, /percentile=75/);
  assert.match(result.document.provenance, /fixture\/Tickets\.json/);
  assert.deepEqual(result.calibrated.sort(), ['contractCount', 'testUnit']);
});

test('C003: the calibrated document passes parseWorkBudget', () => {
  const result = calibrateBudget({
    ticketsDocument: fixture(),
    baseBudget: { version: 4, budget: BASE_BUDGET, components: CALIBRATED_WORKLOAD_COMPONENTS },
    percentile: 75,
    now: '2026-01-01T00:00:00.000Z',
    source: 'fixture/Tickets.json',
  });
  assert.equal(parseWorkBudget(result.document).valid, true);
});

test('C003: the CLI writes only with --write and keeps the output deterministic', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'px443-calibrate-'));
  try {
    const ticketsPath = path.join(directory, 'Tickets.json');
    const budgetPath = path.join(directory, 'base-budget.json');
    const outPath = path.join(directory, 'ticket-work-budget.json');
    fs.writeFileSync(ticketsPath, JSON.stringify(fixture()), 'utf8');
    fs.writeFileSync(budgetPath, JSON.stringify({
      version: 4,
      components: [...CALIBRATED_WORKLOAD_COMPONENTS],
      budget: { ...BASE_BUDGET },
      provenance: 'base',
      partitionPolicy: 'contiguous-minimum',
      splitReasons: ['budget', 'ownership-boundary'],
    }), 'utf8');

    const dry = spawnSync(process.execPath, [
      SCRIPT,
      '--tickets=' + ticketsPath,
      '--budget=' + budgetPath,
      '--out=' + outPath,
      '--now=2026-01-01T00:00:00.000Z',
    ], { cwd: directory, encoding: 'utf8' });
    assert.equal(dry.status, 0, dry.stderr);
    assert.equal(fs.existsSync(outPath), false);
    const dryJson = JSON.parse(dry.stdout);
    assert.equal(dryJson.budget.testUnit, 30);

    const write = spawnSync(process.execPath, [
      SCRIPT,
      '--tickets=' + ticketsPath,
      '--budget=' + budgetPath,
      '--out=' + outPath,
      '--now=2026-01-01T00:00:00.000Z',
      '--write',
    ], { cwd: directory, encoding: 'utf8' });
    assert.equal(write.status, 0, write.stderr);
    assert.equal(fs.existsSync(outPath), true);
    const written = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.equal(parseWorkBudget(written).valid, true);
    assert.equal(written.budget.testUnit, 30);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
