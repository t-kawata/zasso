'use strict';

// PX-347 @verifies C002 @verifies C008
// The synthetic package has the shape the v2 budget was designed for: eight
// phases, 73 graph nodes, 53 implementation files and 40 provider boundary
// units. It must produce ten tickets and consolidate to one final phase.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { buildWorkloadPackage } = require('./fixtures/workload-package.cjs');
const { analyzeTicketWorkload } = require('../../.claude/scripts/tickets/lib/ticket-workload.js');
const {
  mergeLastPhaseBackward,
  consolidateFromRight,
  renumberPhaseIds,
  renumberTicketIds,
  finalValidation,
} = require('../../.claude/scripts/tickets/consolidate-phase-tickets.js');

test('the synthetic package produces ten tickets under the v2 budget', () => {
// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
  const { phases, context, budget, stats } = buildWorkloadPackage();
  assert.equal(stats.nodes, 73);
  assert.equal(stats.files, 53);
  assert.equal(stats.boundaryUnits, 40);
  assert.equal(stats.tickets, 10);
  assert.deepEqual(phases.map((phase) => phase.tickets.length), [1, 1, 2, 1, 2, 1, 1, 1]);

  for (const phase of phases) {
    const analysis = analyzeTicketWorkload(phase, budget, context);
    assert.deepEqual(analysis.fatalFindings, [], `P${phase.id}: ${JSON.stringify(analysis.fatalFindings)}`);
  }

  const p2 = phases.find((phase) => phase.id === 2);
  const p4 = phases.find((phase) => phase.id === 4);
  assert.equal(analyzeTicketWorkload(p2, budget, context).forcedPairs.length, 1);
  assert.equal(analyzeTicketWorkload(p4, budget, context).forcedPairs.length, 1);
});

test('the synthetic package consolidates to one final phase with ten tickets', () => {
  const { phases } = buildWorkloadPackage();
  let merged = consolidateFromRight(mergeLastPhaseBackward(phases));
  merged = renumberPhaseIds(merged);
  merged = renumberTicketIds(merged);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].tickets.length, 10);
  assert.equal(merged[0].name.includes('→'), true);
  assert.equal(finalValidation(merged).valid, true, JSON.stringify(finalValidation(merged).errors));
});
