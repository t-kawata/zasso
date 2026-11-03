// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
// PX-349 @verifies C001 @verifies C002 @verifies C003 @verifies C004 @verifies C005 @verifies C006
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  countObligations,
  countGraphContracts,
  countBoundaryContracts,
  isReviewedStatus,
  computePackageObligations,
  clampReviewed,
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

test('the package ratio is reviewed obligations over total contract obligations', () => {
  const artifacts = {
    graph,
    tickets: {
      phases: [{
        tickets: [{ id: 1, phaseId: 0, status: 'reviewed', contracts: [{ id: 'C001' }] }],
      }],
    },
  };
  const result = computePackageObligations({ id: 'pkg-1' }, artifacts, registry);
  assert.equal(result.obligations.total, 5);
  assert.equal(result.obligations.covered, 1);
  assert.equal(result.obligations.reviewed, 1);
  assert.equal(result.obligations.ratio, 0.2);
});

test('a reviewed count above the total is clamped and warned', () => {
  const result = clampReviewed(7, 5);
  assert.equal(result.reviewed, 5);
  assert.equal(result.total, 5);
  assert.ok(result.warnings.some((warning) => /clamp/i.test(warning)));
  assert.deepEqual(clampReviewed(0, 0), { reviewed: 0, total: 0, warnings: [] });
});
