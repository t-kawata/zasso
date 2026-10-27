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

test('C004 a missing ticket is a skip, not a failure', () => {
  const root = mkdtempSync(join(tmpdir(), 'px324-'));
  writeFileSync(join(root, 'Tickets.json'), JSON.stringify({ title: 't', metadata: {}, phases: [] }));
  const result = run(['--ticket-key=PX-9', `--tickets=${join(root, 'Tickets.json')}`]);
  assert.equal(result.code, 0);
  assert.deepEqual(result.verdict, { ok: true, skipped: 'ticket-not-found', findings: [] });
  rmSync(root, { recursive: true, force: true });
});
