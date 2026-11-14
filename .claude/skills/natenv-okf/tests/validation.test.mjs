import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundle } from '../okf-core/index.mjs';
import { validateConformance } from '../okf-core/validation/conformance.mjs';
import { lintBundle } from '../okf-core/validation/lint.mjs';
import { checkProfile } from '../okf-core/validation/profile.mjs';
import { makeTree, removeTree, pageText, INDEX_TEXT, LOG_TEXT } from './helpers/tree.mjs';

function buildFixture() {
  return makeTree({
    'index.md': INDEX_TEXT,
    'log.md': LOG_TEXT,
    'pages/one/index.md': '# one\n\n- [A](./a.md)\n- [B](./b.md)\n',
    'pages/one/a.md': pageText({
      title: 'A',
      body: '# A\n\nSee [missing](./missing.md).\n',
      extra: { mystery_key: 'value' },
    }),
    'pages/one/b.md': pageText({ type: 'Mystery', title: 'B', body: '# B\n' }),
  });
}

test('conformance is the three official conditions only', async () => {
  const root = buildFixture();
  try {
    const bundle = await loadBundle(root);
    assert.deepEqual(validateConformance(bundle), []);
  } finally {
    removeTree(root);
  }
});

test('lint reports broken links, unknown type, and unknown key', async () => {
  const root = buildFixture();
  try {
    const bundle = await loadBundle(root);
    const codes = new Set(lintBundle(bundle).map((finding) => finding.code));
    assert.ok(codes.has('LINK_BROKEN'));
    assert.ok(codes.has('UNKNOWN_TYPE'));
    assert.ok(codes.has('UNKNOWN_KEY'));
  } finally {
    removeTree(root);
  }
});

test('a concept absent from its index is an orphan', async () => {
  const root = makeTree({
    'index.md': INDEX_TEXT,
    'log.md': LOG_TEXT,
    'pages/one/index.md': '# one\n\n- [A](./a.md)\n',
    'pages/one/a.md': pageText({ title: 'A', body: '# A\n' }),
    'pages/one/b.md': pageText({ title: 'B', body: '# B\n' }),
  });
  try {
    const bundle = await loadBundle(root);
    assert.ok(lintBundle(bundle).some((finding) => finding.code === 'INDEX_ORPHAN'));
  } finally {
    removeTree(root);
  }
});

test('the profile requires its declared types', async () => {
  const root = buildFixture();
  try {
    const bundle = await loadBundle(root);
    assert.deepEqual(checkProfile(bundle, { requiredTypes: ['Page'] }), []);
    assert.equal(checkProfile(bundle, { requiredTypes: ['Rule'] })[0].code, 'MISSING_REQUIRED_TYPE');
  } finally {
    removeTree(root);
  }
});
