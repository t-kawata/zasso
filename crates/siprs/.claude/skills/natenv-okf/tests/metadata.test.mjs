import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundle } from '../okf-core/index.mjs';
import { deriveTrustTier } from '../okf-core/metadata/trust.mjs';
import { makeTree, removeTree, pageText, INDEX_TEXT, LOG_TEXT } from './helpers/tree.mjs';

test('trust tiers come from the verification events', () => {
  assert.equal(deriveTrustTier(undefined), 'unverified');
  assert.equal(deriveTrustTier([{ by: 'machine', at: '2026-01-01' }]), 'machine-confirmed');
  assert.equal(deriveTrustTier([{ by: 'human:reviewer' }]), 'human-reviewed');
});

test('status and staleness are derived from frontmatter', async () => {
  const root = makeTree({
    'index.md': INDEX_TEXT,
    'log.md': LOG_TEXT,
    'pages/one/index.md': '# one\n\n- [A](./a.md)\n- [B](./b.md)\n- [C](./c.md)\n',
    'pages/one/a.md': pageText({
      title: 'A',
      body: '# A\n',
      extra: { stale_after: '2020-01-01', status: 'stable' },
    }),
    'pages/one/b.md': pageText({ title: 'B', body: '# B\n', extra: { status: 'deprecated' } }),
    'pages/one/c.md': pageText({ title: 'C', body: '# C\n', extra: { stale_after: '2999-01-01' } }),
  });
  try {
    const bundle = await loadBundle(root);
    const a = bundle.byId.get('pages/one/a');
    const b = bundle.byId.get('pages/one/b');
    const c = bundle.byId.get('pages/one/c');
    assert.equal(a.isStale(new Date('2026-01-01T00:00:00Z')), true);
    assert.equal(b.status, 'deprecated');
    assert.equal(b.isStale(new Date('2026-01-01T00:00:00Z')), false);
    assert.equal(c.isStale(new Date('2026-01-01T00:00:00Z')), false);
    assert.equal(c.status, 'stable');
  } finally {
    removeTree(root);
  }
});

test('sources keep id, resource, and title', async () => {
  const root = makeTree({
    'index.md': INDEX_TEXT,
    'log.md': LOG_TEXT,
    'pages/one/index.md': '# one\n\n- [A](./a.md)\n',
    'pages/one/a.md': pageText({
      title: 'A',
      body: '# A\n',
      extra: {
        sources: [{ resource: 'sources/doc.md', id: 'doc-1', title: 'Doc' }],
        verified: [{ by: 'machine', at: '2026-01-01' }],
      },
    }),
  });
  try {
    const bundle = await loadBundle(root);
    const a = bundle.byId.get('pages/one/a');
    assert.deepEqual(a.sources, [{ id: 'doc-1', resource: 'sources/doc.md', title: 'Doc' }]);
    assert.equal(a.trustTier, 'machine-confirmed');
  } finally {
    removeTree(root);
  }
});
