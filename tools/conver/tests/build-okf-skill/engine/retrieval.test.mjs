// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
// @verifies C003
/**
 * PX-424 — deterministic cited retrieval.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { rankNodes, assertQuery } from '../../../.claude/scripts/amend-rfc-up/okf-engine/scripts/lib/retrieval.mjs';
import { MAX_ANSWER_NODES } from '../../../.claude/scripts/amend-rfc-up/okf-engine/scripts/lib/limits.mjs';

const INDEX = [
  { id: 'AUTH-01', topic: 'auth.token', summary: 'Tokens expire after 15 minutes.', source: 'sources/auth.md', span: { start_line: 3, end_line: 3 }, content_sha256: 'a'.repeat(64) },
  { id: 'AUTH-02', topic: 'auth.token', summary: 'Refresh tokens rotate on use.', source: 'sources/auth.md', span: { start_line: 5, end_line: 5 }, content_sha256: 'b'.repeat(64) },
  { id: 'SESS-01', topic: 'session.lifecycle', summary: 'Sessions persist until sign-out.', source: 'sources/session.md', span: { start_line: 3, end_line: 3 }, content_sha256: 'c'.repeat(64) },
];

test('C003: rankNodes returns at most 20 cited rows in stable order', () => {
  const first = rankNodes({ index: INDEX, query: 'token expiry' });
  const second = rankNodes({ index: INDEX, query: 'token expiry' });
  assert.deepEqual(first, second);
  assert.ok(first.length <= MAX_ANSWER_NODES);
  assert.equal(first[0].id, 'AUTH-01');
  for (const row of first) {
    assert.match(row.source, /^sources\//);
    assert.match(row.content_sha256, /^[0-9a-f]{64}$/);
  }
});

test('C003: an empty query is rejected', () => {
  assert.throws(() => assertQuery(''), (error) => error.code === 'INVALID_QUERY');
  assert.throws(() => assertQuery('   '), (error) => error.code === 'INVALID_QUERY');
});

test('C003: a substantive summary outranks a metadata node in the same topic', () => {
  const index = [
    { id: 'REST-01', topic: 'rest.adapter', summary: '**Status:** Normative **Version:** 0.3.2', source: 'sources/rest.md', span: { start_line: 3, end_line: 3 }, content_sha256: 'a'.repeat(64) },
    { id: 'REST-02', topic: 'rest.adapter', summary: 'The REST adapter owns transport concerns and never authorizes.', source: 'sources/rest.md', span: { start_line: 9, end_line: 9 }, content_sha256: 'b'.repeat(64) },
  ];
  const rows = rankNodes({ index, query: 'REST adapter responsibilities' });
  assert.equal(rows[0].id, 'REST-02');
});
