// PX-314 @verifies C002
// verify-graph-contracts and verify-ticket-closure read the workspace registry; they must
// check only the boundary rows whose provider or consumer is this package.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { multiPackageFixture, writePackage, writeWorkspaceManifests } from '../sequences-slice/helpers/multi-package-fixture.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const VERIFY_GRAPH_CONTRACTS = join(ROOT, '.claude/scripts/tickets/verify-graph-contracts.js');
const VERIFY_TICKET_CLOSURE = join(ROOT, '.claude/scripts/tickets/verify-ticket-closure.js');

// [::TICKET::] PX-314 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-314 --for-spec --no-implementation-order`.
function withWorkspace(body) {
  const root = mkdtempSync(join(tmpdir(), 'px314-scope-'));
  try {
    return body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// [::TICKET::] PX-314 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-314 --for-spec --no-implementation-order`.
function run(script, args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
}

test('C002 verify-graph-contracts ignores a foreign registry row', () => {
  withWorkspace((root) => {
    const fixture = multiPackageFixture();
    writeWorkspaceManifests(root);
    const packageDir = join(root, 'pkg');
    writePackage(packageDir, fixture, { withDirs: false });
    const result = run(VERIFY_GRAPH_CONTRACTS, [
      `--graph=${join(packageDir, 'P-GRAPH.json')}`,
      `--registry=${join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json')}`,
      `--view=${join(packageDir, 'SEQUENCES.json')}`,
    ]);
    assert.equal(result.status, 0, result.stderr);
  });
});

test('C002 verify-ticket-closure ignores a foreign registry row', () => {
  withWorkspace((root) => {
    const fixture = multiPackageFixture();
    writeWorkspaceManifests(root);
    const packageDir = join(root, 'pkg');
    writePackage(packageDir, fixture, { withDirs: false });
    const result = run(VERIFY_TICKET_CLOSURE, [
      `--tickets=${join(packageDir, 'Tickets.json')}`,
      `--graph=${join(packageDir, 'P-GRAPH.json')}`,
      `--registry=${join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json')}`,
      `--view=${join(packageDir, 'SEQUENCES.json')}`,
    ]);
    assert.equal(result.status, 0, result.stderr);
  });
});

test('C002 verify-graph-contracts rejects an explicit missing view', () => {
  withWorkspace((root) => {
    const fixture = multiPackageFixture();
    writeWorkspaceManifests(root);
    const packageDir = join(root, 'pkg');
    writePackage(packageDir, fixture, { withDirs: false });
    const result = run(VERIFY_GRAPH_CONTRACTS, [
      `--graph=${join(packageDir, 'P-GRAPH.json')}`,
      `--registry=${join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json')}`,
      `--view=${join(packageDir, 'MISSING.json')}`,
    ]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /MISSING_VIEW/);
  });
});

test('C002 verify-ticket-closure rejects an explicit missing view', () => {
  withWorkspace((root) => {
    const fixture = multiPackageFixture();
    writeWorkspaceManifests(root);
    const packageDir = join(root, 'pkg');
    writePackage(packageDir, fixture, { withDirs: false });
    const result = run(VERIFY_TICKET_CLOSURE, [
      `--tickets=${join(packageDir, 'Tickets.json')}`,
      `--graph=${join(packageDir, 'P-GRAPH.json')}`,
      `--registry=${join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json')}`,
      `--view=${join(packageDir, 'MISSING.json')}`,
    ]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /MISSING_VIEW/);
  });
});
