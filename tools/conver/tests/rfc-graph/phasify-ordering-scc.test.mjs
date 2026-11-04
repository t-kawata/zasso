// PX-356 @verifies C001
// SCC condensation may read only the ordering relation. A citation cycle states that two
// sections quote each other, not that either must be implemented first, so grouping them can
// hoist a consumer ahead of its hard prerequisite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
  orderingEdges,
  condenseOrderingGraph,
  buildSccConstraint,
  applySccToOrder,
  kahnTopologicalSort,
  getWeight,
} = require('../../.claude/scripts/rfc-graph/phasify-helpers.js');
const { tarjanSCC } = require('../../.claude/scripts/rfc-graph/boundify-helpers.js');

const ORDERING_FIXTURE = [
  { from: 'A', to: 'P', type: 'depends_on', attributes: { strength: 'hard' } },
  { from: 'A', to: 'B', type: 'references', attributes: { strength: 'hard' } },
  { from: 'B', to: 'A', type: 'refines', attributes: { strength: 'hard' } },
];

test('C001 orderingEdges keeps only hard directed edges', () => {
// [::TICKET::] PX-356 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-356 --for-spec --no-implementation-order`.
  assert.deepEqual(orderingEdges(ORDERING_FIXTURE).map((edge) => `${edge.from}->${edge.to}`), ['A->P']);
});

test('C001 a non-ordering cycle does not hoist a consumer across its prerequisite', () => {
  const sort = kahnTopologicalSort(['A', 'B', 'P'], ORDERING_FIXTURE, getWeight);
  assert.equal(sort.success, true);

  const allEdgeGroups = buildSccConstraint(tarjanSCC(ORDERING_FIXTURE)).sccMap;
  const orderingGroups = buildSccConstraint(condenseOrderingGraph(ORDERING_FIXTURE)).sccMap;

  assert.equal(allEdgeGroups.A, allEdgeGroups.B);
  assert.deepEqual(orderingGroups, {});

  const applied = applySccToOrder(sort.order, orderingGroups);
  assert.ok(applied.indexOf('P') < applied.indexOf('A'));
});

test('C001 a hard cycle still fails closed', () => {
  const cyclic = [
    { from: 'A', to: 'B', type: 'depends_on', attributes: { strength: 'hard' } },
    { from: 'B', to: 'A', type: 'depends_on', attributes: { strength: 'hard' } },
  ];

  assert.equal(kahnTopologicalSort(['A', 'B'], cyclic, getWeight).success, false);
  assert.equal(condenseOrderingGraph(cyclic).length, 1);
});
