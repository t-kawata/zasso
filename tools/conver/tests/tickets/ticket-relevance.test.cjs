#!/usr/bin/env node
// PX-348: carried upstream from the workspace run. The per-phase add gate must be
// phase-local: an operation no ticket implements yet is not this phase's finding.

/**
 * ticket-relevance.test.cjs — what the per-phase add gate reports on.
 *
 * @verifies REL-1
 * @verifies REL-2
 */

let passed = 0;
let failed = 0;

// [::TICKET::] PX-348 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-348 --for-spec --no-implementation-order`.
function assert(condition, message) {
  if (condition) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + '\n'); }
}

process.stdout.write('\n━━━ ticket-relevance.test.cjs ━━━\n\n');

let localRelevanceOf;
try {
  ({ localRelevanceOf } = require('../../.claude/scripts/tickets/add-tickets-for-phase.js'));
} catch (e) {
  failed++;
  process.stdout.write('  ✗ Failed to load add-tickets-for-phase.js: ' + e.message + '\n\n');
  process.stdout.write('Passed: ' + passed + '\nFailed: ' + failed + '\n\n');
  process.exit(1);
}

const view = {
  ownedOperationUnits: [
    { unitId: 'op-Implemented', operationId: 'Implemented' },
    { unitId: 'op-Pending', operationId: 'Pending' },
  ],
  obligationUnits: [{ unitId: 'op-Obligated', operationId: 'Obligated' }],
};

const tickets = [
  {
    phaseId: 0,
    id: 1,
    nodeIds: ['N0001'],
    distribution: { units: [{ unitId: 'op-Implemented', operationId: 'Implemented' }] },
  },
];

const graphData = { nodes: [{ id: 'N0001', unitIds: ['op-Implemented'] }] };

// ======================================================================
// REL-1: an operation no ticket implements is not reported on.

// [::TICKET::] PX-348 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-348 --for-spec --no-implementation-order`.
(function testUnimplementedOperationIsNotLocal() {
  const result = localRelevanceOf({ tickets, graphData });
  assert(
    !result.localOperationIds.has('Pending'),
    'REL-1: an operation declared by the view but implemented by no ticket is not local',
  );
  assert(
    !result.localOperationIds.has('Obligated'),
    'REL-1: an obligation unit implemented by no ticket is not local',
  );
})();

// ======================================================================
// REL-2: an operation the document does implement stays reported on.

// [::TICKET::] PX-348 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-348 --for-spec --no-implementation-order`.
(function testImplementedOperationStaysLocal() {
  const result = localRelevanceOf({ tickets, graphData });
  assert(
    result.localOperationIds.has('Implemented'),
    'REL-2: an operation a ticket implements is still local',
  );
  assert(result.localTicketKeys.has('P0-1'), 'REL-2: the ticket key stays local');
})();

process.stdout.write('\nPassed: ' + passed + '\nFailed: ' + failed + '\n\n');
if (failed > 0) process.exit(1);
