// PX-321 @verifies C001
// A package that owns an operation as a consumer must pass the split coverage gate.
// The implementer package still owes exactly one implementing ticket; a reference
// obligation in that package is a real failure.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildConsumerChainFixture } from '../sequences-slice/helpers/consumer-chain-fixture.mjs';
import {
  populateTicketDistribution,
  writeTicketDistributionAggregate,
} from '../../.claude/scripts/tickets/add-tickets-for-phase.js';
import { verifyAllTicketCoverage } from '../../.claude/scripts/tickets/verify-all-ticket-coverage.js';
import { collectViewUnits } from '../../.claude/scripts/sequences-slice/lib/distribution-map.mjs';

// [::TICKET::] PX-321 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-321 --for-spec --no-implementation-order`.
function phaseWithUnits(chain) {
  const ids = [...collectViewUnits(chain.view).keys()];
  return {
    ids,
    phase: {
      id: 0,
      nodeIds: ['N0001'],
      tickets: [{ id: 1, phaseId: 0, nodeIds: ['N0001', ...ids], contracts: [] }],
    },
  };
}

// [::TICKET::] PX-321 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-321 --for-spec --no-implementation-order`.
async function populatedCoverage(chain) {
  const { ids, phase } = phaseWithUnits(chain);
  const populated = await populateTicketDistribution(phase, chain.graph, chain.dirsTree, chain.view, chain.map);
  const document = { phases: [populated] };
  writeTicketDistributionAggregate(document);
  const report = verifyAllTicketCoverage(document, {
    view: chain.view,
    graph: chain.graph,
    dirs: chain.dirsTree,
    artifact: chain.artifact,
    viewUnitIds: ids,
    ledgerUnitIds: ids,
    residualUnitIds: [],
    map: chain.map,
  });
  return { ids, populated, report };
}

test('C001 a consumer-owner package passes the split coverage gate', async () => {
  const chain = buildConsumerChainFixture({ role: 'consumer' });
  const { report } = await populatedCoverage(chain);
  assert.deepEqual(report.unitFindings, []);
  assert.equal(report.valid, true);
});

test('C001 an implementer package with a reference ticket still fails', async () => {
  const chain = buildConsumerChainFixture({ role: 'implementer' });
  const { ids, phase } = phaseWithUnits(chain);
  const populated = await populateTicketDistribution(phase, chain.graph, chain.dirsTree, chain.view, chain.map);
  const operation = populated.tickets[0].distribution.units.find((unit) => unit.unitId === 'op-Op1');
  operation.role = 'implementer';
  operation.obligation = { mode: 'reference' };
  const document = { phases: [populated] };
  writeTicketDistributionAggregate(document);
  const report = verifyAllTicketCoverage(document, {
    view: chain.view,
    graph: chain.graph,
    dirs: chain.dirsTree,
    artifact: chain.artifact,
    viewUnitIds: ids,
    ledgerUnitIds: ids,
    residualUnitIds: [],
    map: chain.map,
  });
  assert.ok(report.unitFindings.some((finding) => finding.code === 'SEQUENCE_STEP_WITHOUT_IMPLEMENTER' && finding.stepId === 's1'));
});
