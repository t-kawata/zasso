/**
 * C009 — the one-hop CLI payload and directory traversal.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createBasicBundle, createOneHopBundle } from '../lib/fixture-v2.mjs';

const CLI = fileURLToPath(new URL('../../../.claude/scripts/amend-rfc-up/okf-core/cli.mjs', import.meta.url));

// [::TICKET::] PX-425, PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-425|PX-426) --for-spec --no-implementation-order`.
function run(root, ...args) {
  const result = spawnSync(process.execPath, [CLI, ...args, '--root', root], { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, json: parse(result.stdout) };
}

// [::TICKET::] PX-425, PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-425|PX-426) --for-spec --no-implementation-order`.
function parse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

test('C009: show returns body, outgoing, incoming, sources, trust, and freshness', () => {
  const fixture = createOneHopBundle();
  try {
    const { status, json } = run(fixture.root, 'show', 'a');
    assert.equal(status, 0);
    assert.equal(json.id, 'a');
    assert.ok(json.body.includes('# A'));
    assert.equal(json.outgoing.length, 2);
    assert.equal(json.incoming.length, 3);
    assert.equal(json.sources.length, 2);
    assert.equal(json.trustTier, 'machine-confirmed');
    assert.equal(typeof json.freshness.stale, 'boolean');
  } finally {
    fixture.cleanup();
  }
});

test('C009: list reports directory entries without bodies', () => {
  const fixture = createBasicBundle();
  try {
    const { status, json } = run(fixture.root, 'list', '--path', 'rules');
    assert.equal(status, 0);
    assert.deepEqual(json.entries.map((entry) => entry.path), ['rules/a.md', 'rules/index.md', 'rules/rest.md']);
    assert.equal(json.entries.some((entry) => Object.hasOwn(entry, 'body')), false);
  } finally {
    fixture.cleanup();
  }
});

test('C009: outgoing and incoming are available as separate commands', () => {
  const fixture = createBasicBundle();
  try {
    const outgoing = run(fixture.root, 'outgoing', 'rules/a');
    const incoming = run(fixture.root, 'incoming', 'rules/rest');
    assert.equal(outgoing.status, 0);
    assert.deepEqual(outgoing.json.edges.map((edge) => edge.rawTarget), [
      '/rules/rest.md',
      '../identity/id.md',
      'https://example.com',
    ]);
    assert.equal(incoming.status, 0);
    assert.deepEqual(incoming.json.edges.map((edge) => edge.from), ['rules/a']);
  } finally {
    fixture.cleanup();
  }
});
