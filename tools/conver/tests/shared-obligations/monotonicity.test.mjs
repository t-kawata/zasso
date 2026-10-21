import test from 'node:test';
import assert from 'node:assert/strict';

import { compareObligationClosure } from '../../.claude/scripts/smooth-sequences/lib/evidence-ledger.mjs';

// [::TICKET::] PX-289 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-289 --for-spec --no-implementation-order`.
test('unchanged input cannot reopen a closed obligation', () => {
  const baseline = { inputDigest: 'd1', closed: ['MESH:b/A'], evidenceDigests: { 'MESH:b/A': 'e1' } };
  const staging = { inputDigest: 'd1', open: ['MESH:b/A'], evidenceDigests: { 'MESH:b/A': 'e1' } };
  const result = compareObligationClosure({ baseline, staging });
  assert.deepEqual(result.regressions, ['MESH:b/A']);
  assert.deepEqual(result.stuck, ['MESH:b/A']);
  assert.equal(result.code, 'EVIDENCE_REGRESSION');
});

// [::TICKET::] PX-289 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-289 --for-spec --no-implementation-order`.
test('new evidence is not a regression', () => {
  const baseline = { inputDigest: 'd1', closed: ['MESH:b/A'], evidenceDigests: { 'MESH:b/A': 'e1' } };
  const staging = { inputDigest: 'd1', open: ['MESH:b/A'], evidenceDigests: { 'MESH:b/A': 'e2' } };
  const result = compareObligationClosure({ baseline, staging });
  assert.deepEqual(result.regressions, []);
  assert.equal(result.code, null);
});
