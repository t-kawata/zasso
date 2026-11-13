// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
/**
 * C006 — trust and freshness are derived from OKF metadata.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundle } from '../../../.claude/scripts/amend-rfc-up/okf-core/index.mjs';
import { deriveTrustTier } from '../../../.claude/scripts/amend-rfc-up/okf-core/metadata/trust.mjs';
import { isStale } from '../../../.claude/scripts/amend-rfc-up/okf-core/metadata/lifecycle.mjs';
import { createBasicBundle } from '../lib/fixture-v2.mjs';

test('C006: trust tiers follow verified events', () => {
  assert.equal(deriveTrustTier({ by: 'machine' }), 'machine-confirmed');
  assert.equal(deriveTrustTier({ by: 'human:alice' }), 'human-reviewed');
  assert.equal(deriveTrustTier(undefined), 'unverified');
});

test('C006: staleness and deprecation are derived from metadata', () => {
  const now = new Date('2026-11-13T00:00:00Z');
  assert.equal(isStale({ stale_after: '2026-01-01' }, now), true);
  assert.equal(isStale({ stale_after: '2027-01-01' }, now), false);
  assert.equal(isStale({ status: 'deprecated' }, now), true);
});

test('C006: concepts expose the library trust tier and staleness', async () => {
  const fixture = createBasicBundle();
  try {
    const bundle = await loadBundle(fixture.root);
    const rule = bundle.byId.get('rules/a');
    assert.equal(rule.trustTier, 'machine-confirmed');
    assert.equal(rule.status, 'stable');
    assert.equal(rule.isStale(new Date('2027-11-13T00:00:00Z')), true);
  } finally {
    fixture.cleanup();
  }
});
