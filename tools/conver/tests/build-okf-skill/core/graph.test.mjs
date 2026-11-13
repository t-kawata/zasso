// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
/**
 * C003 — body links are edges, code-fence examples are not, and both
 * directions agree.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundle, getOutgoing, getIncoming } from '../../../.claude/scripts/amend-rfc-up/okf-core/index.mjs';
import { createBasicBundle } from '../lib/fixture-v2.mjs';

test('C003: body links become symmetric edges and a fenced link is ignored', async () => {
  const fixture = createBasicBundle();
  try {
    const bundle = await loadBundle(fixture.root);
    const outgoing = getOutgoing(bundle, 'rules/a');
    assert.deepEqual(outgoing.map((edge) => [edge.rawTarget, edge.state]), [
      ['/rules/rest.md', 'resolved'],
      ['../identity/id.md', 'resolved'],
      ['https://example.com', 'external'],
    ]);
    assert.deepEqual(getIncoming(bundle, 'rules/rest').map((edge) => edge.from), ['rules/a']);
    assert.deepEqual(getIncoming(bundle, 'identity/id').map((edge) => edge.from), ['rules/a']);
    assert.equal(outgoing.some((edge) => edge.rawTarget.includes('/rules/secret.md')), false);
  } finally {
    fixture.cleanup();
  }
});

test('C003: incoming and outgoing orders are stable', async () => {
  const fixture = createBasicBundle();
  try {
    const bundle = await loadBundle(fixture.root);
    const first = getOutgoing(bundle, 'rules/a').map((edge) => edge.rawTarget);
    const second = getOutgoing(bundle, 'rules/a').map((edge) => edge.rawTarget);
    assert.deepEqual(first, second);
    assert.deepEqual(
      getIncoming(bundle, 'rules/rest').map((edge) => edge.from),
      getIncoming(bundle, 'rules/rest').map((edge) => edge.from),
    );
  } finally {
    fixture.cleanup();
  }
});
