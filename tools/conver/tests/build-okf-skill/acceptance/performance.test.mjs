// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
/**
 * C013 — the 2,500-concept bundle stays inside the performance budget.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { loadBundle, listDirectory, getConcept, getIncoming } from '../../../.claude/scripts/amend-rfc-up/okf-core/index.mjs';
import { createSyntheticBundle } from '../lib/fixture-v2.mjs';

test('C013: 2,500 concepts list within 200 ms and use bounded memory', async () => {
  const fixture = createSyntheticBundle({ concepts: 2500, edges: 10000 });
  try {
    const startedLoad = performance.now();
    const bundle = await loadBundle(fixture.root);
    const loadMs = performance.now() - startedLoad;
    assert.equal(bundle.concepts.length, 2500);

    const started = performance.now();
    const entries = listDirectory(bundle, '');
    const listMs = performance.now() - started;
    assert.ok(entries.length > 0);
    assert.ok(listMs < 200, `list took ${listMs}ms`);
    assert.ok(loadMs < 3000, `load took ${loadMs}ms`);

    const concept = getConcept(bundle, 'concept-0001');
    assert.equal(concept.id, 'concept-0001');
    assert.ok(getIncoming(bundle, 'concept-0001').length >= 0);
    assert.ok(process.memoryUsage().rss < 512 * 1024 * 1024);
  } finally {
    fixture.cleanup();
  }
});
