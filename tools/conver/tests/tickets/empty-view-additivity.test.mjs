// PX-308 @verifies C001
// An empty view is a package the operations do not reach. It must keep the verdict it had
// before the distribution chain existed, and only a view that distributes a unit may
// require the map and its digest.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { verifyAllTicketCoverage } from '../../.claude/scripts/tickets/verify-all-ticket-coverage.js';

// [::TICKET::] PX-308 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-308 --for-spec --no-implementation-order`.
function fixtureTickets() {
  return {
    phases: [{
      id: -1,
      name: 'PX',
      nodeIds: ['N0001'],
      tickets: [{ id: 1, phaseId: -1, nodeIds: ['N0001'] }],
    }],
  };
}

test('C001 an empty view plus a Dirs-Tree does not request the digest chain', () => {
  const report = verifyAllTicketCoverage(fixtureTickets(), {
    view: {},
    viewUnitIds: [],
    dirs: {},
    graph: { nodes: [{ id: 'N0001', unitIds: [] }] },
  });

  assert.equal(report.valid, true);
  assert.equal(report.unitFindings.some((finding) => finding.code === 'MISSING_DISTRIBUTION_DIGEST'), false);
});

test('C001 a view carrying one unit still requires the distribution digest chain', () => {
  const report = verifyAllTicketCoverage(fixtureTickets(), {
    view: { ownedOperationUnits: [{ unitId: 'op-A' }] },
    viewUnitIds: ['op-A'],
    dirs: {},
    graph: { nodes: [{ id: 'N0001', unitIds: ['op-A'] }] },
  });

  assert.ok(report.unitFindings.some((finding) => finding.code === 'MISSING_DISTRIBUTION_DIGEST'));
  assert.equal(report.valid, false);
});
