// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
// PX-349 @verifies C001 @verifies C002 @verifies C003 @verifies C004 @verifies C005 @verifies C006
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  WorkspaceError,
  readManifests,
  discoverPackages,
  parseTimestamp,
  parseRunId,
  resolveCanonical,
  safePackageDir,
} from '../../.claude/scripts/conver/progress-gif/parse.js';
import { writeWorkspace } from './fixtures.mjs';
import { countUnresolvedStubs } from '../../.claude/scripts/conver/progress-gif/stubs.js';

test('readManifests rejects a missing manifest with exit code 2', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conver-parse-'));
  assert.throws(() => readManifests(root), (error) => {
    assert.ok(error instanceof WorkspaceError);
    assert.equal(error.exitCode, 2);
    assert.match(error.message, /WORKSPACIFY-TREE-MANIFEST\.json/);
    return true;
  });
});

test('readManifests accepts schema differences as warnings, not failures', () => {
  const root = writeWorkspace({ packages: [{ id: 'pkg-1', name: 'one', path: 'one' }] });
  const treePath = path.join(root, 'WORKSPACIFY-TREE-MANIFEST.json');
  const allocPath = path.join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json');
  const tree = JSON.parse(fs.readFileSync(treePath, 'utf8'));
  const alloc = JSON.parse(fs.readFileSync(allocPath, 'utf8'));
  tree.status = 'RUNNING';
  alloc.status = 'RUNNING';
  alloc.completion_decision = 'INCOMPLETE';
  alloc.semantic_review = { status: 'REJECTED' };
  fs.writeFileSync(treePath, JSON.stringify(tree));
  fs.writeFileSync(allocPath, JSON.stringify(alloc));

  const result = readManifests(root);
  assert.equal(result.tree.status, 'RUNNING');
  assert.ok(result.warnings.some((warning) => /status/.test(warning)));
  assert.ok(result.warnings.some((warning) => /semantic_review/.test(warning)));
});

test('discoverPackages handles root package, dedup and implementation order', () => {
  const root = writeWorkspace({
    packages: [
      { id: 'pkg-2', name: 'two', path: 'two' },
      { id: 'pkg-1', name: 'root', path: '.' },
    ],
  });
  const { tree, alloc } = readManifests(root);
  const packages = discoverPackages(root, tree, alloc);
  assert.equal(packages.length, 2);
  assert.equal(packages[0].id, 'pkg-2');
  assert.equal(packages[0].dir, path.join(root, 'two'));
  assert.equal(packages[1].id, 'pkg-1');
  assert.equal(packages[1].dir, root);
});

test('parseTimestamp keeps date-only precision and rejects invalid values', () => {
  const dateOnly = parseTimestamp('2026-11-02');
  assert.equal(dateOnly.prec, 'day');
  assert.equal(new Date(dateOnly.t).getUTCFullYear(), 2026);
  const iso = parseTimestamp('2026-11-02T03:04:05.000Z');
  assert.equal(iso.prec, 'ms');
  assert.equal(parseTimestamp('not-a-date'), null);
  assert.equal(parseTimestamp(undefined), null);
});

test('parseRunId accepts 19-digit and 13-digit ids without a wall-clock filter', () => {
  const oldMs = Date.parse('2020-01-02T03:04:05.000Z');
  assert.equal(parseRunId(String(oldMs)).t, oldMs);
  assert.equal(parseRunId(`${oldMs}123456`).t, oldMs);
  assert.equal(parseRunId('nope'), null);
});

test('resolveCanonical ignores decoys and refuses ambiguous candidates', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conver-decoy-'));
  fs.writeFileSync(path.join(root, 'RFC-GRAPH.json'), '{}');
  fs.writeFileSync(path.join(root, 'Other-GRAPH.json'), '{}');
  fs.writeFileSync(path.join(root, 'RFC-GRAPH.delta.json'), '{}');
  const warnings = [];
  const found = resolveCanonical(root, 'RFC-GRAPH.json', /-GRAPH\.json$/, warnings);
  assert.equal(found, path.join(root, 'RFC-GRAPH.json'));
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /ambiguous/);
});

test('safePackageDir refuses paths outside the workspace and symlink ancestors', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conver-safe-'));
  assert.equal(safePackageDir(root, '../escape'), null);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'conver-outside-'));
  fs.symlinkSync(outside, path.join(root, 'link'));
  assert.equal(safePackageDir(root, 'link'), null);
});

test('countUnresolvedStubs counts strict markers and ignores generated markers', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conver-stubs-'));
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'one.js'),
    '// [::STUB::] P1-2: replace this\n// [::STUB::] MUST implement NODE_ID=N0001\n');
  fs.writeFileSync(path.join(root, 'two.js'), '// [::STUB::] MUST RESOLVE: no target\n');
  assert.equal(countUnresolvedStubs(root), 2);
});
