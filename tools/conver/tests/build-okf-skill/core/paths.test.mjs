// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
/**
 * C004 — path resolution delegates containment to the OKF library.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundle } from '../../../.claude/scripts/amend-rfc-up/okf-core/index.mjs';
import { resolveReference } from '../../../.claude/scripts/amend-rfc-up/okf-core/paths/resolve.mjs';
import { createBasicBundle } from '../lib/fixture-v2.mjs';

test('C004: traversal, asset, directory, and external targets classify without reading outside root', async () => {
  const fixture = createBasicBundle();
  try {
    const bundle = await loadBundle(fixture.root);
    const resolve = (target) => resolveReference({
      fromPath: 'rules/a.md',
      rawTarget: target,
      root: fixture.root,
      files: bundle.files,
    });
    assert.equal(resolve('../../etc/passwd').state, 'blocked');
    assert.equal(resolve('/../secret.md').state, 'blocked');
    assert.equal(resolve('%2e%2e%2fsecret').state, 'blocked');
    assert.equal(resolve('../assets/logo.svg').state, 'non-concept');
    assert.equal(resolve('./').state, 'directory');
    assert.equal(resolve('https://example.com').state, 'external');
    assert.equal(resolve('/rules/rest.md').state, 'resolved');
    assert.equal(resolve('./missing.md').state, 'missing');
  } finally {
    fixture.cleanup();
  }
});
