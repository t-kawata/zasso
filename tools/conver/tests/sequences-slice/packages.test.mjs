// PX-355 @verifies C001
// PX-355 @verifies C002
// PX-355 @verifies C003
// The root package is a supported workspacify shape: the tree manifest may name the
// workspace root itself with path ".". These tests hold the two facts that make the rest
// of the slice consistent: one normalization for every spelling of the root, and one
// enumeration whose authority is the manifest rather than a directory walk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { normalizePackagePath, resolvePackageByPath } from '../../.claude/scripts/sequences-slice/lib/packages.mjs';
import { packageDirectoriesOf } from '../../.claude/scripts/sequences-slice/lib/package-directories.mjs';

test('C001 normalizePackagePath maps every root spelling to . and is idempotent', () => {
// [::TICKET::] PX-355 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-355 --for-spec --no-implementation-order`.
  assert.deepEqual(['', '.', './'].map((value) => normalizePackagePath(value)), ['.', '.', '.']);
  assert.equal(normalizePackagePath('crates/pkg-a/'), 'crates/pkg-a');
  assert.equal(normalizePackagePath('crates\\pkg-a'), 'crates/pkg-a');
  assert.equal(normalizePackagePath(normalizePackagePath('crates/pkg-a')), 'crates/pkg-a');
});

test('C001 normalizePackagePath does not throw for null or undefined', () => {
  assert.equal(normalizePackagePath(null), '.');
  assert.equal(normalizePackagePath(undefined), '.');
});

test('C003 resolvePackageByPath resolves the absolute root and the relative . to the root entry', () => {
  const packages = [{ id: 'pkg-root', path: '.' }, { id: 'pkg-a', path: 'crates/pkg-a' }];

  assert.deepEqual(resolvePackageByPath(packages, '/workspace', '/workspace'), { packageId: 'pkg-root', packagePath: '.', reason: null });
  assert.deepEqual(resolvePackageByPath(packages, '.', '/workspace'), { packageId: 'pkg-root', packagePath: '.', reason: null });
  assert.deepEqual(resolvePackageByPath(packages, './', '/workspace'), { packageId: 'pkg-root', packagePath: '.', reason: null });
  assert.deepEqual(resolvePackageByPath(packages, 'crates/pkg-a', '/workspace'), { packageId: 'pkg-a', packagePath: 'crates/pkg-a', reason: null });
});

test('C003 resolvePackageByPath returns a reason naming the normalized path for an unknown directory', () => {
  const packages = [{ id: 'pkg-root', path: '.' }];
  const missing = resolvePackageByPath(packages, '/workspace/crates/absent', '/workspace');

  assert.equal(missing.packageId, null);
  assert.match(missing.reason, /crates\/absent/);
});

test('C002 packageDirectoriesOf enumerates each manifest package once and resolves the root', () => {
  const root = path.resolve('/workspace');
  const treeManifest = {
    workspace: {
      packages: [
        { id: 'pkg-root', path: '.' },
        { id: 'pkg-a', path: 'crates/pkg-a' },
        { id: 'pkg-a-alias', path: 'crates/pkg-a' },
      ],
    },
  };

  const entries = packageDirectoriesOf(root, treeManifest, { fallbackMarkers: ['SEQUENCES.json'] });

  assert.deepEqual(entries.map((entry) => entry.packagePath), ['.', 'crates/pkg-a']);
  assert.equal(entries[0].directory, root);
  assert.equal(entries[1].directory, path.join(root, 'crates/pkg-a'));
  assert.equal(new Set(entries.map((entry) => entry.directory)).size, entries.length);
});

test('C002 packageDirectoriesOf falls back to the crates walk and does not include the root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'px355-directories-'));
  try {
    fs.mkdirSync(path.join(root, 'crates', 'pkg-a'), { recursive: true });
    fs.writeFileSync(path.join(root, 'crates', 'pkg-a', 'SEQUENCES.json'), '{}');
    fs.writeFileSync(path.join(root, 'SEQUENCES.json'), '{}');

    const entries = packageDirectoriesOf(root, null, { fallbackMarkers: ['SEQUENCES.json'] });

    assert.deepEqual(entries.map((entry) => entry.packagePath), ['crates/pkg-a']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C002 packageDirectoriesOf treats a manifest without workspace.packages as absent', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'px355-directories-empty-'));
  try {
    fs.mkdirSync(path.join(root, 'crates', 'pkg-a'), { recursive: true });
    fs.writeFileSync(path.join(root, 'crates', 'pkg-a', 'SEQUENCES.json'), '{}');

    const entries = packageDirectoriesOf(root, { inventory: { objects: [] } }, { fallbackMarkers: ['SEQUENCES.json'] });

    assert.deepEqual(entries.map((entry) => entry.packagePath), ['crates/pkg-a']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
