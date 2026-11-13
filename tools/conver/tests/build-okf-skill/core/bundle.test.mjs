// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
/**
 * C001 — bundle identity is the path and reserved files are not concepts.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundle, getConcept, listDirectory } from '../../../.claude/scripts/amend-rfc-up/okf-core/index.mjs';
import { createBasicBundle } from '../lib/fixture-v2.mjs';

test('C001: loadBundle uses bundle-relative paths as ids and excludes reserved files', async () => {
  const fixture = createBasicBundle();
  try {
    const bundle = await loadBundle(fixture.root);
    assert.deepEqual(bundle.concepts.map((concept) => concept.id).sort(), [
      'identity/id',
      'rules/a',
      'rules/rest',
    ]);
    for (const concept of bundle.concepts) {
      assert.equal(concept.id, concept.path.replace(/\.md$/, ''));
    }
    assert.equal(bundle.byId.has('index'), false);
    assert.equal(bundle.byId.has('log'), false);
    assert.equal(getConcept(bundle, 'rules/a').title, 'Rule A');
  } finally {
    fixture.cleanup();
  }
});

test('C001: listDirectory separates concepts, directories, and assets', async () => {
  const fixture = createBasicBundle();
  try {
    const bundle = await loadBundle(fixture.root);
    const entries = listDirectory(bundle, 'rules');
    assert.deepEqual(entries.map((entry) => [entry.path, entry.kind]), [
      ['rules/a.md', 'concept'],
      ['rules/index.md', 'reserved'],
      ['rules/rest.md', 'concept'],
    ]);
    assert.ok(listDirectory(bundle, '').some((entry) => entry.path === 'assets' && entry.kind === 'directory'));
  } finally {
    fixture.cleanup();
  }
});
