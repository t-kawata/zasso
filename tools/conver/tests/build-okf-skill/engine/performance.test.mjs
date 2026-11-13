// @verifies C003
/**
 * PX-424 — retrieval stays bounded at the documented node budget.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { rankNodes } from '../../../.claude/scripts/amend-rfc-up/okf-engine/scripts/lib/retrieval.mjs';
import { MAX_ANSWER_NODES, NODE_BUDGET } from '../../../.claude/scripts/amend-rfc-up/okf-engine/scripts/lib/limits.mjs';

test('C003: a 2,500-node index ranks within the budget and returns at most 20 rows', () => {
  const index = Array.from({ length: NODE_BUDGET }, (_, index_) => ({
    id: `NODE-${String(index_ + 1).padStart(4, '0')}`,
    topic: index_ % 2 === 0 ? 'auth.token' : 'session.lifecycle',
    summary: index_ % 2 === 0 ? 'Tokens expire after 15 minutes.' : 'Sessions persist until sign-out.',
    source: `sources/doc-${index_ % 10}.md`,
    span: { start_line: 3, end_line: 3 },
    content_sha256: 'a'.repeat(64),
  }));
  const started = Date.now();
  const rows = rankNodes({ index, query: 'token expiry' });
  const elapsed = Date.now() - started;
  assert.ok(rows.length <= MAX_ANSWER_NODES);
  assert.ok(elapsed < 500, `ranking took ${elapsed}ms`);
});
