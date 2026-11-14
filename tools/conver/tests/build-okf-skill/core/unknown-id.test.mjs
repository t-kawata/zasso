// [::TICKET::] PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-427 --for-spec --no-implementation-order`.
// @verifies C003
// C003 precondition: An id absent from the bundle
// C003 postcondition: The process exits 2 and prints at least one candidate id
/**
 * C003 — an unknown concept id must fail loudly with candidates.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createBasicBundle } from '../lib/fixture-v2.mjs';

const CLI = fileURLToPath(new URL('../../../.claude/scripts/amend-rfc-up/okf-core/cli.mjs', import.meta.url));

// [::TICKET::] PX-427, PX-428 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-427|PX-428) --for-spec --no-implementation-order`.
function run(root, ...args) {
  return spawnSync(process.execPath, [CLI, ...args, '--root', root], { encoding: 'utf8' });
}

test('C003: show with an absent id exits 2 and prints candidates', () => {
  const fixture = createBasicBundle();
  try {
    const result = run(fixture.root, 'show', 'rules/does-not-exist');
    assert.equal(result.status, 2);
    assert.match(result.stderr + result.stdout, /candidate/i);
  } finally {
    fixture.cleanup();
  }
});

test('C003 invariant: an absent id never returns exit 0 with an empty edge set', () => {
  const fixture = createBasicBundle();
  try {
    for (const command of ['show', 'outgoing', 'incoming', 'neighbors']) {
      const result = run(fixture.root, command, 'rules/does-not-exist');
      assert.notEqual(result.status, 0, `${command} must not succeed for an absent id`);
    }
  } finally {
    fixture.cleanup();
  }
});

test('C003: a known id still exits 0', () => {
  const fixture = createBasicBundle();
  try {
    const result = run(fixture.root, 'show', 'rules/a');
    assert.equal(result.status, 0);
  } finally {
    fixture.cleanup();
  }
});
