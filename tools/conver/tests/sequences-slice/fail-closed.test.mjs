// PX-314 @verifies C005, C006
// The CLI stage gate: a first boundify run has no Dirs-Tree yet, and a workspacify
// workspace must not silently skip a missing artifact or registry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { multiPackageFixture, writePackage, writeWorkspaceManifests } from './helpers/multi-package-fixture.mjs';

const VERIFY_CHAIN = fileURLToPath(new URL('../../.claude/scripts/sequences-slice/verify-chain.mjs', import.meta.url));

// [::TICKET::] PX-314 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-314 --for-spec --no-implementation-order`.
function withWorkspace(body) {
  const root = mkdtempSync(join(tmpdir(), 'px314-chain-'));
  try {
    return body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// [::TICKET::] PX-314 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-314 --for-spec --no-implementation-order`.
function run(args) {
  return spawnSync(process.execPath, [VERIFY_CHAIN, ...args], { encoding: 'utf8' });
}

test('C005 boundify Step 0 preflight passes without a Dirs-Tree', () => {
  withWorkspace((root) => {
    const packageDir = join(root, 'pkg');
    writePackage(packageDir, multiPackageFixture(), { withDirs: false });
    const result = run(['--stage=boundify', '--preflight', `--package=${packageDir}`]);
    assert.equal(result.status, 0, result.stderr);
  });
});

test('C005 boundify without preflight still requires the Dirs-Tree', () => {
  withWorkspace((root) => {
    const packageDir = join(root, 'pkg');
    writePackage(packageDir, multiPackageFixture(), { withDirs: false });
    const result = run(['--stage=boundify', `--package=${packageDir}`]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /MISSING_LAYER/);
  });
});

test('C006 a workspace with no root artifact is MISSING_SIDECAR, not a silent pass', () => {
  withWorkspace((root) => {
    writeWorkspaceManifests(root);
    const packageDir = join(root, 'pkg');
    writePackage(packageDir, multiPackageFixture(), { withDirs: false });
    const result = run(['--stage=graphify', `--package=${packageDir}`]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /MISSING_SIDECAR/);
  });
});

test('C006 an explicit empty registry is MISSING_REGISTRY inside a workspace', () => {
  withWorkspace((root) => {
    const fixture = multiPackageFixture();
    writeWorkspaceManifests(root);
    writeFileSync(join(root, 'P-sequences.json'), JSON.stringify(fixture.artifact));
    const packageDir = join(root, 'pkg');
    writePackage(packageDir, fixture, { withDirs: false });
    const result = run(['--stage=graphify', `--package=${packageDir}`, '--registry=']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /MISSING_REGISTRY/);
  });
});

test('C006 outside a workspace the same absence stays skipped', () => {
  withWorkspace((root) => {
    const packageDir = join(root, 'pkg');
    writePackage(packageDir, multiPackageFixture(), { withDirs: false });
    const result = run(['--stage=graphify', `--package=${packageDir}`]);
    assert.equal(result.status, 0, result.stderr);
  });
});
