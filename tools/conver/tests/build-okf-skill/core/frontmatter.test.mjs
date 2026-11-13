// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
/**
 * C002 — frontmatter is parsed by the OKF library, not a line regex.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter } from '../../../.claude/scripts/amend-rfc-up/okf-core/parsing/frontmatter.mjs';

test('C002: unknown keys survive and only missing frontmatter or empty type fail', () => {
  const parsed = parseFrontmatter('---\ntype: Rule\nx-owner: platform\n---\nbody');
  assert.equal(parsed.data.type, 'Rule');
  assert.equal(parsed.data['x-owner'], 'platform');
  assert.deepEqual(parsed.errors, []);

  const missing = parseFrontmatter('body');
  assert.equal(missing.errors[0].code, 'FRONTMATTER_MISSING');

  const empty = parseFrontmatter('---\ntype:\n---\nbody');
  assert.equal(empty.errors[0].code, 'TYPE_EMPTY');
});

test('C002: duplicate keys are reported, not silently overwritten', () => {
  const parsed = parseFrontmatter('---\ntype: Rule\ntype: Page\n---\nbody');
  assert.equal(parsed.errors[0].code, 'FRONTMATTER_INVALID');
  assert.match(parsed.errors[0].message, /duplicate/i);
});
