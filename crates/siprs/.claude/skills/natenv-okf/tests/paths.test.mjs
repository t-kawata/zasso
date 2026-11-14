import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveReference } from '../okf-core/paths/resolve.mjs';
import { directoryOf, baseName, relativeLink } from '../okf-core/paths/directory.mjs';

test('blocks a target that climbs above the bundle root', () => {
  const resolved = resolveReference({ fromPath: 'a.md', rawTarget: '../../../../etc/passwd', files: ['a.md'] });
  assert.equal(resolved.state, 'blocked');
});

test('blocks an encoded traversal target', () => {
  const resolved = resolveReference({ fromPath: 'a.md', rawTarget: '%2e%2e%2fetc%2fpasswd', files: ['a.md'] });
  assert.equal(resolved.state, 'blocked');
});

test('resolves a sibling concept path to its id', () => {
  const resolved = resolveReference({ fromPath: 'pages/a.md', rawTarget: './b.md', files: ['pages/a.md', 'pages/b.md'] });
  assert.equal(resolved.state, 'resolved');
  assert.equal(resolved.to, 'pages/b');
});

test('reports a missing target', () => {
  const resolved = resolveReference({ fromPath: 'a.md', rawTarget: './nope.md', files: ['a.md'] });
  assert.equal(resolved.state, 'missing');
});

test('splits bundle-relative paths', () => {
  assert.equal(directoryOf('pages/a/b.md'), 'pages/a');
  assert.equal(directoryOf('a.md'), '');
  assert.equal(baseName('pages/a/b.md'), 'b.md');
});

test('renders a link relative to its directory index', () => {
  assert.equal(relativeLink('', 'pages/a.md'), './pages/a.md');
  assert.equal(relativeLink('pages/a', 'pages/a/b.md'), './b.md');
  assert.equal(relativeLink('pages/a', 'pages/b.md'), '../b.md');
});
