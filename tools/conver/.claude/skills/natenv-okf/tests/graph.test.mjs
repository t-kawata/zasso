import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundle, getOutgoing, getIncoming } from '../okf-core/index.mjs';
import { makeTree, removeTree, pageText, INDEX_TEXT, LOG_TEXT } from './helpers/tree.mjs';

function buildLinkedTree() {
  return makeTree({
    'index.md': INDEX_TEXT,
    'log.md': LOG_TEXT,
    'pages/one/index.md': '# one\n\n- [A](./a.md)\n- [B](./b.md)\n',
    'pages/one/a.md': pageText({ title: 'A', body: '# A\n\nSee [B](./b.md) and [public](https://example.com).\n' }),
    'pages/one/b.md': pageText({ title: 'B', body: '# B\n\nNo links.\n' }),
  });
}

test('outgoing and incoming agree for a resolved link', async () => {
  const root = buildLinkedTree();
  try {
    const bundle = await loadBundle(root);
    const outgoing = getOutgoing(bundle, 'pages/one/a').filter((edge) => edge.state === 'resolved');
    assert.deepEqual(outgoing.map((edge) => edge.to), ['pages/one/b']);
    const incoming = getIncoming(bundle, 'pages/one/b');
    assert.ok(incoming.some((edge) => edge.from === 'pages/one/a'));
    assert.deepEqual(getIncoming(bundle, 'pages/one/a'), []);
  } finally {
    removeTree(root);
  }
});

test('an external link is an edge but not a concept edge', async () => {
  const root = buildLinkedTree();
  try {
    const bundle = await loadBundle(root);
    const external = getOutgoing(bundle, 'pages/one/a').filter((edge) => edge.rawTarget.startsWith('https:'));
    assert.equal(external.length, 1);
    assert.equal(external[0].state, 'external');
    assert.equal(external[0].to, null);
  } finally {
    removeTree(root);
  }
});
