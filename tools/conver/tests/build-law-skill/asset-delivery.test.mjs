// [::TICKET::] PX-438 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-438 --for-spec --no-implementation-order`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAssetDelivery } from '../../.claude/scripts/amend-rfc-up/law-asset/delivery.mjs';

test('a fact-bearing asset marked must is delivered', () => {
  const result = applyAssetDelivery({
    assets: [{ path: 'scripts/check.py', type: 'Procedure' }],
    delivery: { entries: [{ asset: 'scripts/check.py', mode: 'must' }] },
  });
  assert.equal(result.findings.length, 0);
  assert.equal(result.entries[0].mode, 'must');
});

test('a missing delivery entry is reported', () => {
  const result = applyAssetDelivery({
    assets: [{ path: 'scripts/check.py', type: 'Procedure' }],
    delivery: { entries: [] },
  });
  assert.ok(result.findings.some((finding) => finding.code === 'ASSET_DELIVERY_OMISSION'));
});

test('a reference entry needs delivered_by', () => {
  const result = applyAssetDelivery({
    assets: [{ path: 'scripts/check.py', type: 'Procedure' }],
    delivery: { entries: [{ asset: 'scripts/check.py', mode: 'reference' }] },
  });
  assert.ok(result.findings.some((finding) => finding.code === 'ASSET_DELIVERY_OMISSION'));
});
