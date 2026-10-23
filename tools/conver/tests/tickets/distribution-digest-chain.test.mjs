// PX-307 @verifies C005
// The chain is per-ticket, not a single file-level scalar. These tests pin the adjacent
// comparisons and the aggregate over sorted ticket digests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { verifyDigestChain } from '../../.claude/scripts/tickets/verify-all-ticket-coverage.js';

const MAP = 'a'.repeat(64);
const VIEW = 'b'.repeat(64);
const TICKET_DIGESTS = { 1: 'c'.repeat(64), 2: 'd'.repeat(64) };
const AGGREGATE = createHash('sha256')
  .update(JSON.stringify({ ticketDigests: TICKET_DIGESTS }))
  .digest('hex');

// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
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
