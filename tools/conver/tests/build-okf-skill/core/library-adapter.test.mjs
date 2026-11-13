// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
/**
 * Library adapter — the selected OKF library and the native wrapper agree.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readTree } from '@okforest/okf/node';
import { loadBundle, getOutgoing, getIncoming } from '../../../.claude/scripts/amend-rfc-up/okf-core/index.mjs';
import { createBasicBundle } from '../lib/fixture-v2.mjs';

test('library: @okforest/okf reads the same concepts and links as the wrapper', async () => {
  const fixture = createBasicBundle();
  try {
    const tree = await readTree(fixture.root);
    const bundle = await loadBundle(fixture.root);
    assert.deepEqual(tree.concepts.map((concept) => concept.id).sort(), bundle.concepts.map((concept) => concept.id).sort());
    const libraryOutgoing = tree.concepts
      .find((concept) => concept.id === 'rules/a')
      .links
      .map((link) => [link.target, link.kind, link.resolved ?? null]);
    const wrapperOutgoing = getOutgoing(bundle, 'rules/a')
      .map((edge) => [edge.rawTarget, edge.state === 'external' ? 'external' : 'internal', edge.resolvedPath ?? null]);
    assert.deepEqual(wrapperOutgoing, libraryOutgoing);
    assert.deepEqual(
      tree.backlinks('rules/rest').map((link) => link.from.replace(/\.md$/, '')),
      getIncoming(bundle, 'rules/rest').map((edge) => edge.from),
    );
  } finally {
    fixture.cleanup();
  }
});

test('library: the decision record names the primary model and the fallback', () => {
  const record = JSON.parse(readFileSync(join(process.cwd(), '.claude/scripts/amend-rfc-up/okf-core/library.json'), 'utf8'));
  assert.equal(record.primary, '@okforest/okf');
  assert.equal(record.fallback, 'native');
  assert.ok(Array.isArray(record.evaluated));
});
