// @verifies C003
// [::TICKET::] PX-176: workspacify-tree inventory report tests.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-176 --for-spec --no-implementation-order`

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildInventoryReport } from '../../../.claude/scripts/workspacify-tree/lib/inventory-report.mjs';

test('inventory-report: builds an AI-facing summary with counts', () => {
  const objects = [
    { id: 'obj-000001', canonical_name: 'AlphaRecord', classification: 'record', normalization_status: 'CONFIRMED', source_refs: [{}] },
    { id: 'obj-000002', canonical_name: 'GammaRecord', classification: 'unknown', normalization_status: 'REVIEW_REQUIRED', source_refs: [{}] },
  ];
  const claims = [
    { id: 'claim-000001', canonical_name: 'claim_order_validity', primary_owner: null, source_refs: [{}] },
  ];
  const unresolved = [{ kind: 'unknown-classification', canonical_name: 'GammaRecord' }];
  const report = buildInventoryReport({
    objects,
    claims,
    terms: [],
    normalization_decisions: [],
    unresolved_candidates: unresolved,
  });
  assert.equal(report.objects.length, 2);
  assert.equal(report.claims.length, 1);
  assert.equal(report.unresolved_candidates.length, 1);
  assert.equal(report.stats.harvested, 3);
  assert.equal(report.stats.confirmed, 1);
  assert.equal(report.stats.review_required, 1);
  assert.equal(report.stats.unresolved, 1);
});
