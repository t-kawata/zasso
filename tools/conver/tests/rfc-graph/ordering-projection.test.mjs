// [::TICKET::] PX-358 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-358 --for-spec --no-implementation-order`.
// PX-358 @verifies C003
// Every order reader must obtain the provider and consumer from the one projection.
// The agreeing pair states B before A in two raw orientations; a reader that walks the
// raw edges reports a violation on a consistent graph.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import { ticketPrerequisites } from '../../.claude/scripts/sequences-slice/lib/implementation-order.mjs';
import { REPO_ROOT } from '../question-gate/helpers/fixture-workspace.mjs';

const require = createRequire(import.meta.url);
const {
  kahnTopologicalSort,
  computeSoftViolations,
  getWeight,
} = require('../../.claude/scripts/rfc-graph/phasify-helpers.js');
const { checkHardConstraints } = require('../../.claude/scripts/rfc-graph/validate-phasify.js');
const { validatePhasedOmissions } = require('../../.claude/scripts/rfc-graph/phasify-omissions.js');

const MIXED = [
  { from: 'A', to: 'B', type: 'depends_on' },
  { from: 'B', to: 'A', type: 'constrains' },
];

test('C003 kahnTopologicalSort places the agreeing provider first', () => {
  const sort = kahnTopologicalSort(['A', 'B'], MIXED, getWeight);

  assert.equal(sort.success, true);
  assert.ok(sort.order.indexOf('B') < sort.order.indexOf('A'));
});

test('C003 computeSoftViolations reads the declared direction', () => {
  const soft = [{ from: 'P', to: 'C', type: 'precedes' }];

  assert.equal(computeSoftViolations(['P', 'C'], soft, getWeight).totalCost, 0);
  const reversed = computeSoftViolations(['C', 'P'], soft, getWeight);
  assert.equal(reversed.totalCost, 2);
  assert.deepEqual(reversed.violations.map((entry) => `${entry.from}->${entry.to}`), ['P->C']);
});

test('C003 validate-phasify checkHardConstraints reads the declared direction', () => {
  const phases = [{ id: 0 }, { id: 1 }];

  assert.equal(checkHardConstraints(MIXED, phases, { A: 1, B: 0 }).passed, true);
  assert.equal(checkHardConstraints(MIXED, phases, { A: 0, B: 1 }).passed, false);
});

test('C003 phasify-omissions check 3 reads the declared direction', () => {
  const nodes = [{ id: 'A' }, { id: 'B' }];
  const omissionIds = new Set(['A', 'B']);
  const forward = validatePhasedOmissions(
    { phases: [{ id: 0, nodeIds: ['B'] }, { id: 1, nodeIds: ['A'] }] },
    nodes,
    MIXED,
    omissionIds,
  );
  const backward = validatePhasedOmissions(
    { phases: [{ id: 0, nodeIds: ['A'] }, { id: 1, nodeIds: ['B'] }] },
    nodes,
    MIXED,
    omissionIds,
  );

  assert.equal(forward.checks.hardConstraints.violations.length, 0);
  assert.equal(backward.checks.hardConstraints.violations.length, 2);
});

test('C003 ticketPrerequisites places the provider ticket before the consumer', () => {
  const tickets = [
    { id: 1, phaseId: 0, nodeIds: ['B'], distribution: { units: [{ unitId: 'unit-b' }] } },
    { id: 2, phaseId: 0, nodeIds: ['A'], distribution: { units: [{ unitId: 'unit-a' }] } },
  ];

  const { prerequisites } = ticketPrerequisites({ tickets, graph: { edges: MIXED } });

  assert.deepEqual(new Set(prerequisites.get('P0-2').map((entry) => entry.ticket)), new Set(['P0-1']));
  assert.equal(prerequisites.has('P0-1'), false);
});

test('C003 no order reader keeps a private direction swap', () => {
  const readers = [
    '.claude/scripts/rfc-graph/phasify-helpers.js',
    '.claude/scripts/rfc-graph/validate-phasify.js',
    '.claude/scripts/rfc-graph/phasify-omissions.js',
    '.claude/scripts/sequences-slice/lib/implementation-order.mjs',
  ];

  for (const file of readers) {
    const source = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
    assert.equal(
      /direction === 'provider-is-(to|from)' \? edge\.(to|from) : edge\.(from|to)/.test(source),
      false,
      `${file} keeps a private direction swap`,
    );
    assert.match(source, /providerConsumerEdge/, `${file} imports the shared projection`);
  }

  const rule = fs.readFileSync(path.join(REPO_ROOT, '.claude/scripts/rfc-graph/lib/edge-order.js'), 'utf8');
  assert.match(rule, /direction === PROVIDER_IS_TO \? edge\.to : edge\.from/);
});
