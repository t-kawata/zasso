// PX-307 @verifies C005
// The chain is per-ticket, not a single file-level scalar. These tests pin the adjacent
// comparisons and the aggregate over sorted ticket digests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  verifyDigestChain,
  verifyDistributionDigests,
} from '../../.claude/scripts/tickets/verify-all-ticket-coverage.js';
import {
  digestTicketDistribution,
  digestUnitObligation,
} from '../../.claude/scripts/tickets/add-tickets-for-phase.js';
import { digestValue } from '../../.claude/scripts/sequences-slice/lib/digest.mjs';

const MAP = 'a'.repeat(64);
const VIEW = 'b'.repeat(64);
const TICKET_DIGESTS = { 1: 'c'.repeat(64), 2: 'd'.repeat(64) };
const AGGREGATE = createHash('sha256')
  .update(JSON.stringify({ ticketDigests: TICKET_DIGESTS }))
  .digest('hex');

// [::TICKET::] PX-307 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-307 --for-spec --no-implementation-order`.
function fixtureChain() {
  return {
    map: { digest: MAP },
    graph: { distributionDigest: MAP },
    dirs: { distribution: { digest: MAP } },
    tickets: {
      distribution: {
        sourceMapDigest: MAP,
        sourceViewDigest: VIEW,
        ticketDigests: TICKET_DIGESTS,
        digest: AGGREGATE,
      },
    },
  };
}

test('C005 a matching chain passes', () => {
  assert.equal(verifyDigestChain(fixtureChain()).ok, true);
});

test('C005 each adjacent mismatch is named', () => {
  const graph = fixtureChain();
  graph.graph.distributionDigest = '0'.repeat(64);
  assert.equal(verifyDigestChain(graph).code, 'DISTRIBUTION_DIGEST_MISMATCH');

  const dirs = fixtureChain();
  dirs.dirs.distribution.digest = '0'.repeat(64);
  assert.equal(verifyDigestChain(dirs).code, 'DISTRIBUTION_DIGEST_MISMATCH');

  const tickets = fixtureChain();
  tickets.tickets.distribution.sourceMapDigest = '0'.repeat(64);
  assert.equal(verifyDigestChain(tickets).code, 'DISTRIBUTION_DIGEST_MISMATCH');
});

test('C005 a missing digest fails rather than passing vacuously', () => {
  const chain = fixtureChain();
  delete chain.graph.distributionDigest;
  assert.equal(verifyDigestChain(chain).code, 'MISSING_DISTRIBUTION_DIGEST');
});

test('C005 the aggregate is the digest of the sorted ticket digests', () => {
  const chain = fixtureChain();
  const expected = createHash('sha256')
    .update(JSON.stringify({ ticketDigests: { 1: 'c'.repeat(64), 2: 'd'.repeat(64) } }))
    .digest('hex');
  chain.tickets.distribution.digest = expected;
  assert.equal(verifyDigestChain(chain).ok, true);
  chain.tickets.distribution.digest = 'f'.repeat(64);
  assert.equal(verifyDigestChain(chain).code, 'DISTRIBUTION_DIGEST_MISMATCH');
});

// PX-311 @verifies C002
// The stored digest is a claim the split stage made. The verifier must recompute it from
// the current units and the current obligation, or a post-generation edit passes.
// [::TICKET::] PX-311 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-311 --for-spec --no-implementation-order`.
function fixtureDistribution() {
  const units = [{
    unitId: 'op-A',
    kind: 'operation',
    role: 'implementer',
    surface: null,
    obligation: { mode: 'implement', outcome: 'active' },
  }];
  const distribution = {
    sourceMapDigest: MAP,
    sourceViewDigest: VIEW,
    units,
    digest: digestValue({ sourceMapDigest: MAP, sourceViewDigest: VIEW, units }),
  };
  distribution.units[0].obligationDigest = digestUnitObligation(distribution.units[0].obligation);
  distribution.digest = digestTicketDistribution(distribution);
  return distribution;
}

test('C002 the writer and verifier share one digest definition', () => {
  const distribution = fixtureDistribution();
  assert.equal(distribution.digest, digestTicketDistribution(distribution));
  assert.equal(
    distribution.units[0].obligationDigest,
    digestUnitObligation(distribution.units[0].obligation),
  );
  assert.equal(digestTicketDistribution(distribution), digestValue({
    sourceMapDigest: MAP,
    sourceViewDigest: VIEW,
    units: distribution.units,
  }));
});

test('C002 a matching distribution passes recomputation', () => {
  const phase = { id: -1, tickets: [{ id: 1, distribution: fixtureDistribution() }] };
  assert.deepEqual(verifyDistributionDigests(phase), []);
});

test('C002 an edited obligation fails while the stored digest stays put', () => {
  const phase = { id: -1, tickets: [{ id: 1, distribution: fixtureDistribution() }] };
  const edited = structuredClone(phase);
  edited.tickets[0].distribution.units[0].obligation.outcome = 'edited-after-generation';
  const findings = verifyDistributionDigests(edited);
  assert.ok(findings.some((entry) => entry.code === 'OBLIGATION_DIGEST_MISMATCH' && entry.unitId === 'op-A'));
});

test('C002 edited units fail the ticket digest even when every unit digest is repaired', () => {
  const phase = { id: -1, tickets: [{ id: 1, distribution: fixtureDistribution() }] };
  const edited = structuredClone(phase);
  edited.tickets[0].distribution.units.push({
    unitId: 'op-B',
    kind: 'operation',
    obligation: { mode: 'reference', outcome: 'active' },
    obligationDigest: digestUnitObligation({ mode: 'reference', outcome: 'active' }),
  });
  const findings = verifyDistributionDigests(edited);
  assert.ok(findings.some((entry) => entry.code === 'TICKET_DIGEST_MISMATCH'));
});

test('C002 a missing stored digest is a named mismatch, never a vacuous pass', () => {
  const distribution = fixtureDistribution();
  delete distribution.digest;
  delete distribution.units[0].obligationDigest;
  const phase = { id: -1, tickets: [{ id: 1, distribution }] };
  const findings = verifyDistributionDigests(phase);
  assert.ok(findings.some((entry) => entry.code === 'TICKET_DIGEST_MISMATCH'));
  assert.ok(findings.some((entry) => entry.code === 'OBLIGATION_DIGEST_MISMATCH'));
});
