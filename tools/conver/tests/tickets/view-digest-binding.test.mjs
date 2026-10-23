// PX-308 @verifies C003
// The map proves which view it was derived from. If the tickets were derived from a newer
// view, the map's roles and surfaces are stale even while every map digest still matches.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { verifyDigestChain } from '../../.claude/scripts/tickets/verify-all-ticket-coverage.js';
import { digestValue } from '../../.claude/scripts/sequences-slice/lib/digest.mjs';

const MAP_DIGEST = 'a'.repeat(64);
const TICKET_DIGESTS = { 1: 'c'.repeat(64) };

// [::TICKET::] PX-308 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-308 --for-spec --no-implementation-order`.
function fixtureChain() {
  return {
    map: { digest: MAP_DIGEST, sourceViewDigest: 'OLD' },
    graph: { distributionDigest: MAP_DIGEST },
    dirs: { distribution: { digest: MAP_DIGEST } },
    tickets: {
      distribution: {
        sourceMapDigest: MAP_DIGEST,
        sourceViewDigest: 'NEW',
        ticketDigests: TICKET_DIGESTS,
        digest: digestValue({ ticketDigests: TICKET_DIGESTS }),
      },
    },
  };
}

test('C003 a stale view digest fails at the view layer', () => {
  assert.deepEqual(verifyDigestChain(fixtureChain()), {
    ok: false,
    code: 'DISTRIBUTION_DIGEST_MISMATCH',
    layer: 'view',
  });
});

test('C003 equal view digests and equal map digests pass', () => {
  const chain = fixtureChain();
  chain.tickets.distribution.sourceViewDigest = 'OLD';
  assert.equal(verifyDigestChain(chain).ok, true);
});

test('C003 a map that predates the view digest keeps the old verdict', () => {
  const chain = fixtureChain();
  delete chain.map.sourceViewDigest;
  assert.equal(verifyDigestChain(chain).ok, true);
});
