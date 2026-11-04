// [::TICKET::] PX-358 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-358 --for-spec --no-implementation-order`.
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

// PX-358 @verifies C002
// Two edges that agree on the order are one relation. Reading the raw orientation turns
// that agreement into mutual reachability, and the condensed group can then move one
// node ahead of the node that constrains it.
test('C002 an agreeing pair stated in opposite orientations is not a cycle', () => {
  const agreeing = [
    { from: 'A', to: 'B', type: 'depends_on' },
    { from: 'B', to: 'A', type: 'constrains' },
  ];
  assert.deepEqual(condenseOrderingGraph(agreeing), []);
});

test('C002 a genuine mutual dependency is still a cycle', () => {
  const genuine = [
    { from: 'A', to: 'B', type: 'depends_on' },
    { from: 'B', to: 'A', type: 'depends_on' },
  ];
  assert.deepEqual(
    condenseOrderingGraph(genuine).map((entry) => entry.cycle.slice().sort().join(',')),
    ['A,B'],
  );
});

test('C002 a non-ordering cycle is not condensed', () => {
  assert.deepEqual(condenseOrderingGraph([
    { from: 'E', to: 'F', type: 'references' },
    { from: 'F', to: 'E', type: 'references' },
  ]), []);
});

test('C002 an ordering chain restated as constraints stays a chain', () => {
  assert.deepEqual(condenseOrderingGraph([
    { from: 'G', to: 'H', type: 'depends_on' },
    { from: 'H', to: 'G', type: 'constrains' },
    { from: 'H', to: 'I', type: 'depends_on' },
    { from: 'I', to: 'H', type: 'constrains' },
  ]), []);
});

test('C002 every encoding of one order condenses to nothing', () => {
  const encodings = [
    [{ from: 'A', to: 'B', type: 'depends_on' }],
    [{ from: 'B', to: 'A', type: 'constrains' }],
    [
      { from: 'A', to: 'B', type: 'depends_on' },
      { from: 'B', to: 'A', type: 'constrains' },
    ],
  ];
  for (const edges of encodings) assert.deepEqual(condenseOrderingGraph(edges), []);
});
