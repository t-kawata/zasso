// PX-356 @verifies C006
// Consolidation rewrites the durable ticket key an obligation references, and the
// distribution digest covers that key. A remap without a refresh leaves a moved ticket
// failing TICKET_DIGEST_MISMATCH even though no work changed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  refreshTicketDistributionDigests,
  writeTicketDistributionAggregate,
  digestTicketDistribution,
  digestUnitObligation,
} = require('../../.claude/scripts/tickets/add-tickets-for-phase.js');
const { verifyDistributionDigests } = require('../../.claude/scripts/tickets/verify-all-ticket-coverage.js');

// [::TICKET::] PX-356 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-356 --for-spec --no-implementation-order`.
function distributionWith(implementerTicketKey) {
  return {
    sourceMapDigest: 'a'.repeat(64),
    sourceViewDigest: 'b'.repeat(64),
    units: [{
      unitId: 'op-A',
      kind: 'operation',
      role: 'implementer',
      obligation: { mode: 'reference', providers: [], implementerTicketKey },
    }],
  };
}

test('C006 a remapped obligation carries fresh unit and ticket digests', () => {
  const distribution = distributionWith('P9-3');
  distribution.units[0].obligationDigest = 'd'.repeat(64);
  distribution.digest = 'c'.repeat(64);

  const phases = [{ id: 0, tickets: [{ id: 1, phaseId: 0, distribution }] }];
  distribution.units[0].obligation.implementerTicketKey = 'P3-1';
  refreshTicketDistributionDigests(phases);

  assert.equal(distribution.units[0].obligationDigest, digestUnitObligation(distribution.units[0].obligation));
  assert.equal(distribution.digest, digestTicketDistribution(distribution));
});

test('C006 verifyDistributionDigests reports no mismatch after refresh', () => {
  const distribution = distributionWith('P9-3');
  distribution.units[0].obligationDigest = 'd'.repeat(64);
  distribution.digest = 'c'.repeat(64);
  const phase = { id: 0, tickets: [{ id: 1, phaseId: 0, distribution }] };

  distribution.units[0].obligation.implementerTicketKey = 'P3-1';
  assert.ok(verifyDistributionDigests(phase).some((finding) => finding.code === 'TICKET_DIGEST_MISMATCH'));

  refreshTicketDistributionDigests([phase]);

  assert.deepEqual(verifyDistributionDigests(phase), []);
});

test('C006 the aggregate records the refreshed ticket digest', () => {
  const distribution = distributionWith('P9-3');
  const document = { phases: [{ id: 0, tickets: [{ id: 1, phaseId: 0, distribution }] }] };
  distribution.units[0].obligation.implementerTicketKey = 'P3-1';

  refreshTicketDistributionDigests(document.phases);
  writeTicketDistributionAggregate(document);

  assert.equal(document.distribution.ticketDigests['P0-1'], distribution.digest);
});
