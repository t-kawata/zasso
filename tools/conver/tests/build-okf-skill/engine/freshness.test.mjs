// @verifies C004
/**
 * PX-424 — freshness and stale presentation.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertFreshForAnswer,
  detectStaleNodes,
  markStale,
} from '../../../.claude/scripts/amend-rfc-up/okf-engine/scripts/lib/freshness.mjs';

// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

test('C004: a changed source marks dependent nodes stale with both hashes', () => {
  const root = mkdtempSync(join(tmpdir(), 'okf-fresh-'));
  try {
    writeFileSync(join(root, 'auth.md'), 'Tokens expire after 15 minutes.\n');
    const original = sha256('Tokens expire after 15 minutes.\n');
    const lock = {
      sources: [{ alias: 'sources/auth.md', sha256: original }],
      nodes: [{ id: 'AUTH-01', sources: ['sources/auth.md'], source_sha256: original }],
    };
    const aliasMap = {
      schema: 'okf-path-alias/v1',
      input_roots: [root],
      aliases: { 'sources/auth.md': 'auth.md' },
    };
    assert.deepEqual(detectStaleNodes({ lock, sourceRoot: root, aliasMap }).stale, []);
    writeFileSync(join(root, 'auth.md'), 'Tokens expire after 30 minutes.\n');
    const freshness = detectStaleNodes({ lock, sourceRoot: root, aliasMap });
    assert.equal(freshness.stale.length, 1);
    assert.notEqual(freshness.stale[0].expected, freshness.stale[0].actual);
    assert.equal(freshness.stale[0].alias, 'sources/auth.md');
    const presented = markStale([{ node: 'AUTH-01', stale: false }], new Set(['AUTH-01']));
    assert.equal(presented[0].stale, true);
    assert.throws(() => assertFreshForAnswer({ rows: presented }), /STALE_NODE_PRESENTED/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
