// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
// PX-349 @verifies C001 @verifies C002 @verifies C003 @verifies C004 @verifies C005 @verifies C006
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  countObligations,
  countGraphContracts,
  countBoundaryContracts,
  isReviewedStatus,
  computeReviewedRatio,
} from '../../.claude/scripts/conver/progress-gif/obligations.js';

const graph = {
  edges: [
    { contracts: [{ id: 'C001' }, { id: 'C002' }] },
    { contracts: [{ id: 'C002' }, { id: 'C003' }] },
  ],
};

const registry = [
  { contract_id: 'contract-boundary-001', provider_package: 'pkg-1', consumer_package: 'pkg-2' },
  { contract_id: 'contract-boundary-002', provider_package: 'pkg-2', consumer_package: 'pkg-1' },
  { contract_id: 'contract-boundary-003', provider_package: 'pkg-3', consumer_package: 'pkg-4' },
];

test('countGraphContracts counts each contract id once', () => {
  const ids = countGraphContracts(graph);
  assert.deepEqual([...ids].sort(), ['C001', 'C002', 'C003']);
});

test('countBoundaryContracts counts the package role and ignores other packages', () => {
  const ids = countBoundaryContracts('pkg-1', registry);
  assert.deepEqual([...ids].sort(), ['contract-boundary-001', 'contract-boundary-002']);
  assert.equal(countBoundaryContracts('pkg-9', registry).size, 0);
});

test('countObligations includes ticket-only stale ids with a warning', () => {
  const tickets = [
    { id: 1, phaseId: 0, status: 'reviewed', contracts: [{ id: 'C001' }, { id: 'C003' }] },
    { id: 2, phaseId: 0, status: 'todo', contracts: [{ id: 'contract-boundary-001' }, { id: 'C505' }] },
  ];
  const result = countObligations('pkg-1', graph, registry, tickets);
  assert.equal(result.graph, 3);
  assert.equal(result.boundary, 2);
  assert.equal(result.ticketOnly, 1);
  assert.equal(result.total, 6);
  assert.ok(result.warnings.some((warning) => /C505/.test(warning)));
});

test('isReviewedStatus accepts reviewed and completed rounds only', () => {
  assert.equal(isReviewedStatus('reviewed'), true);
  assert.equal(isReviewedStatus('R1'), true);
  assert.equal(isReviewedStatus('R12'), true);
  assert.equal(isReviewedStatus('remanded'), false);
  assert.equal(isReviewedStatus('done'), false);
  assert.equal(isReviewedStatus('todo'), false);
  assert.equal(isReviewedStatus(undefined), false);
});

test('computeReviewedRatio keeps a zero denominator at zero', () => {
  assert.deepEqual(computeReviewedRatio(0, 0), { reviewed: 0, covered: 0, ratio: 0 });
  assert.deepEqual(computeReviewedRatio(3, 4), { reviewed: 3, covered: 4, ratio: 0.75 });
});
