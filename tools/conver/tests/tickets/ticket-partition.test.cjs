'use strict';
// PX-394 @verifies C001 @verifies C002 @verifies C003 @verifies C004 @verifies C005 @verifies C006

/**
 * PX-394 — the deterministic contiguous partition and mechanical group merge.
 *
 * These tests are the Red phase for lib/ticket-partition.js. They fix the
 * partition minimum, contiguity, budget-forced boundaries, status composition
 * and prose preservation before any implementation exists.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  minimumContiguousPartition,
  mergeTicketGroup,
  leastAdvancedStatus,
  mergeTitles,
  partitionDigest,
  condensePlan,
} = require('../../.claude/scripts/tickets/lib/ticket-partition.js');

const BUDGET = Object.freeze({
  operations: 8,
  sequenceSteps: 8,
  ownedContracts: 4,
  files: 10,
  testUnit: 100,
  testIntegration: 100,
  modules: 100,
});

const CONTEXT = Object.freeze({ graph: { nodes: [], edges: [] }, dirsTree: {}, view: null });

// [::TICKET::] PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-394 --for-spec --no-implementation-order`.
function ticket(id, overrides = {}) {
  const fileCount = overrides.fileCount ?? 1;
  delete overrides.fileCount;
  return {
    id,
    phaseId: 0,
    status: 'todo',
    title: `Ticket ${id}`,
    nodeIds: [`N000${id}`],
    background: `background ${id}`,
    notes: `notes ${id}`,
    scope: [`scope ${id}`],
    invariants: `invariants ${id}`,
    testUnit: [`UT: unit ${id}`],
    testIntegration: [`IT: integration ${id}`],
    testExceptions: [],
    acceptanceCriteria: [`AC ${id}`],
    contracts: [{ id: 'C001', sourceEdge: 'N0001->N0002', precondition: 'a', postcondition: 'b', invariant: 'c' }],
    default_files: Array.from({ length: fileCount }, (_, index) => `src/file${id}-${index}.js`),
    ...overrides,
  };
}

test('one group when the ordered tickets fit the budget (C001)', () => {
  const tickets = [ticket(1, { fileCount: 2 }), ticket(2, { fileCount: 3 })];
  const plan = minimumContiguousPartition(tickets, CONTEXT, BUDGET);
  assert.equal(plan.count, 1);
  assert.deepEqual(plan.groups.map((group) => [group.start, group.end]), [[0, 2]]);
  assert.equal(plan.groups[0].workload.files, 5);
});

test('three groups when no adjacent merge fits, and each boundary is budget-forced (C001)', () => {
  const tickets = [ticket(1, { fileCount: 6 }), ticket(2, { fileCount: 6 }), ticket(3, { fileCount: 6 })];
  const plan = minimumContiguousPartition(tickets, CONTEXT, BUDGET);
  assert.equal(plan.count, 3);
  assert.equal(plan.forcedBoundaries.length, 2);
  for (const boundary of plan.forcedBoundaries) {
    assert.equal(boundary.reason, 'budget');
    assert.ok(boundary.components.includes('files'));
  }
});

test('groups are contiguous, cover the array once and never reorder (C002)', () => {
  const tickets = [ticket(1, { fileCount: 6 }), ticket(2, { fileCount: 6 }), ticket(3, { fileCount: 6 })];
  const before = tickets.map((entry) => entry.id);
  const plan = minimumContiguousPartition(tickets, CONTEXT, BUDGET);
  for (let index = 0; index < plan.groups.length; index += 1) {
    const expectedStart = index === 0 ? 0 : plan.groups[index - 1].end;
    assert.equal(plan.groups[index].start, expectedStart);
  }
  assert.equal(plan.groups.at(-1).end, tickets.length);
  assert.deepEqual(tickets.map((entry) => entry.id), before);
});

test('a single irreducible over-budget ticket stays alone (C001)', () => {
  const tickets = [ticket(1, { fileCount: 15 }), ticket(2, { fileCount: 2 })];
  const plan = minimumContiguousPartition(tickets, CONTEXT, BUDGET);
  assert.equal(plan.count, 2);
  assert.equal(plan.irreducible.length, 1);
  assert.equal(plan.irreducible[0].start, 0);
});

test('the tie-break is deterministic (C001, C002)', () => {
  const tickets = [ticket(1, { fileCount: 5 }), ticket(2, { fileCount: 5 }), ticket(3, { fileCount: 5 }), ticket(4, { fileCount: 5 })];
  const plan = minimumContiguousPartition(tickets, CONTEXT, BUDGET);
  assert.equal(plan.count, 2);
  assert.deepEqual(plan.groups.map((group) => [group.start, group.end]), [[0, 2], [2, 4]]);
});

test('empty and single-ticket phases are handled (C001)', () => {
  assert.equal(minimumContiguousPartition([], CONTEXT, BUDGET).count, 0);
  const single = minimumContiguousPartition([ticket(1)], CONTEXT, BUDGET);
  assert.equal(single.count, 1);
  assert.deepEqual(single.forcedBoundaries, []);
});

test('the earliest member survives and prose, nodes and contracts are preserved (C003)', () => {
  const tickets = [
    ticket(1, { nodeIds: ['N0001'] }),
    ticket(2, { nodeIds: ['N0002', 'N0001'] }),
    ticket(3, { nodeIds: ['N0003'] }),
  ];
  const merged = mergeTicketGroup(tickets, { start: 0, end: 3 });
  assert.equal(merged.ticket.id, 1);
  assert.deepEqual(merged.ticket.nodeIds, ['N0001', 'N0002', 'N0003']);
  assert.match(merged.ticket.background, /### From P0-2: Ticket 2/);
  assert.match(merged.ticket.background, /background 2/);
  assert.deepEqual(merged.absorbed.map((entry) => entry.key), ['P0-2', 'P0-3']);
  assert.equal(merged.ticket.status, 'todo');
  assert.equal(merged.ticket.condensedFrom.tickets.length, 2);
});

test('a duplicate contract id with different clauses fails (C003)', () => {
  const left = ticket(1, { contracts: [{ id: 'C001', sourceEdge: 'N0001->N0002', precondition: 'a', postcondition: 'b', invariant: 'c' }] });
  const right = ticket(2, { contracts: [{ id: 'C001', sourceEdge: 'N0001->N0002', precondition: 'x', postcondition: 'y', invariant: 'z' }] });
  assert.throws(() => mergeTicketGroup([left, right], { start: 0, end: 2 }), /DUPLICATE_CONTRACT_ID/);
});

test('the group status follows the least advanced member (C003)', () => {
  assert.equal(leastAdvancedStatus(['todo', 'planned']), 'todo');
  assert.equal(leastAdvancedStatus(['done', 'reviewed']), 'done');
  assert.equal(leastAdvancedStatus(['todo', 'remanded']), 'remanded');
  assert.equal(leastAdvancedStatus([]), 'todo');
});

test('preserve-completed keeps a reviewed ticket alone (C003)', () => {
  const reviewed = ticket(1, { status: 'reviewed' });
  const todo = ticket(2);
  const plan = minimumContiguousPartition([reviewed, todo], CONTEXT, { ...BUDGET, files: 100 }, { preserveCompleted: true });
  assert.equal(plan.count, 2);
  assert.equal(plan.skippedGroups.length, 1);
});

test('the plan digest is stable for the same input (C006)', () => {
  const tickets = [ticket(1, { fileCount: 2 }), ticket(2, { fileCount: 3 })];
  const first = minimumContiguousPartition(tickets, CONTEXT, BUDGET);
  const second = minimumContiguousPartition(tickets, CONTEXT, BUDGET);
  assert.equal(partitionDigest(first), partitionDigest(second));
  assert.equal(partitionDigest(first).length, 64);
});

test('condensePlan reports phase before and after counts (C001)', () => {
  const phase = { id: 0, tickets: [ticket(1, { fileCount: 2 }), ticket(2, { fileCount: 3 })] };
  const plan = condensePlan(phase, CONTEXT, BUDGET);
  assert.equal(plan.phaseId, 0);
  assert.equal(plan.before, 2);
  assert.equal(plan.after, 1);
  assert.equal(plan.groups.length, 1);
});

test('mergeTitles keeps each distinct title once (C003)', () => {
  assert.equal(mergeTitles(['A', 'B', 'A']), 'A / B');
});
