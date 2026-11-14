import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundle, listDirectory } from '../okf-core/index.mjs';
import { classifyPath } from '../okf-core/bundle/classify.mjs';
import { makeTree, removeTree, pageText, INDEX_TEXT, LOG_TEXT } from './helpers/tree.mjs';

function buildFixture() {
  return makeTree({
    'index.md': INDEX_TEXT,
    'log.md': LOG_TEXT,
    'pages/one/a.md': pageText({ title: 'A', body: '# A\n\nText.\n' }),
    'pages/one/b.md': pageText({ title: 'B', body: '# B\n\nText.\n' }),
    'pages/one/index.md': '# one\n\n- [A](./a.md)\n- [B](./b.md)\n',
    'notes.txt': 'asset\n',
  });
}

test('concept ids are bundle-relative paths without the extension', async () => {
  const root = buildFixture();
  try {
    const bundle = await loadBundle(root);
    assert.deepEqual([...bundle.byId.keys()].sort(), ['pages/one/a', 'pages/one/b']);
  } finally {
    removeTree(root);
  }
});

test('reserved files are classified, not treated as concepts', async () => {
  const root = buildFixture();
  try {
    const bundle = await loadBundle(root);
    const kinds = bundle.reserved.map((file) => [file.path, file.kind]).sort();
    assert.deepEqual(kinds, [['index.md', 'index'], ['log.md', 'log'], ['pages/one/index.md', 'index']]);
  } finally {
    removeTree(root);
  }
});

test('lists directories and reserved entries without descending', async () => {
  const root = buildFixture();
  try {
    const bundle = await loadBundle(root);
    const rootEntries = listDirectory(bundle, '');
    assert.deepEqual(rootEntries.map((entry) => [entry.path, entry.kind]), [
      ['index.md', 'reserved'],
      ['log.md', 'reserved'],
      ['notes.txt', 'asset'],
      ['pages', 'directory'],
    ]);
    const pageEntries = listDirectory(bundle, '/pages/');
    assert.deepEqual(pageEntries.map((entry) => [entry.path, entry.kind]), [['pages/one', 'directory']]);
  } finally {
    removeTree(root);
  }
});

test('classifies paths by extension and reserved name', () => {
  assert.equal(classifyPath('index.md'), 'reserved-index');
  assert.equal(classifyPath('pages/a/index.md'), 'reserved-index');
  assert.equal(classifyPath('pages/a/log.md'), 'reserved-log');
  assert.equal(classifyPath('pages/a/page.md'), 'concept');
  assert.equal(classifyPath('assets/logo.png'), 'asset');
});
