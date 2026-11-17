import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundle } from '../okf-core/index.mjs';
import { resolveRequired } from '../okf-core/context/resolve-required.mjs';
import { buildContext } from '../okf-core/context/assemble.mjs';
import { makeTree, removeTree, pageText, INDEX_TEXT, LOG_TEXT } from './helpers/tree.mjs';

function buildFixture() {
  return makeTree({
    'index.md': INDEX_TEXT,
    'log.md': LOG_TEXT,
    'pages/one/index.md': '# one\n\n- [A](./a.md)\n- [B](./b.md)\n- [C](./c.md)\n',
    'pages/one/a.md': pageText({ title: 'A', body: '# A\n\n[see C](./c.md)\n', extra: { 'x-requires': ['pages/one/b'] } }),
    'pages/one/b.md': pageText({ title: 'B', body: '# B\n' }),
    'pages/one/c.md': pageText({ title: 'C', body: '# C\n' }),
  });
}

test('the required closure follows x-requires and names the reachable set', async () => {
  const root = buildFixture();
  try {
    const bundle = await loadBundle(root);
    const required = resolveRequired({ bundle, entryIds: ['pages/one/a'] });
    assert.deepEqual(required.required, ['pages/one/a', 'pages/one/b']);
    assert.deepEqual(required.reachable, ['pages/one/c']);
    assert.deepEqual(required.context, ['pages/one/a', 'pages/one/b', 'pages/one/c']);
  } finally {
    removeTree(root);
  }
});

test('an absent requirement is reported, not silently dropped', async () => {
  const root = makeTree({
    'index.md': INDEX_TEXT,
    'log.md': LOG_TEXT,
    'pages/one/index.md': '# one\n\n- [A](./a.md)\n',
    'pages/one/a.md': pageText({ title: 'A', body: '# A\n', extra: { 'x-requires': ['pages/one/ghost'] } }),
  });
  try {
    const bundle = await loadBundle(root);
    const required = resolveRequired({ bundle, entryIds: ['pages/one/a'] });
    assert.deepEqual(required.findings.map((finding) => finding.id), ['pages/one/ghost']);
  } finally {
    removeTree(root);
  }
});

test('over-budget context throws instead of truncating', async () => {
  const root = buildFixture();
  try {
    const bundle = await loadBundle(root);
    const required = resolveRequired({ bundle, entryIds: ['pages/one/a'] });
    assert.equal(buildContext({ bundle, requiredSet: required, budgetBytes: 1_000_000 }).concepts.length, 3);
    assert.throws(
      () => buildContext({ bundle, requiredSet: required, budgetBytes: 1 }),
      (error) => error.code === 'BUDGET_EXCEEDED',
    );
  } finally {
    removeTree(root);
  }
});
