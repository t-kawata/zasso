// [::TICKET::] PX-195 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-195 --for-spec --no-implementation-order`.
// PX-195 @verifies C004
// Cleanup is mechanical and conservative: it removes only what the run created and
// leaves the published set — tree, seeds, allocate manifest — plus whatever
// pre-existed in the workspace.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { removeWorkspaceArtifacts, isPublishedArtifact, INTERMEDIATE_ARTIFACT_PATTERNS } from '../../../.claude/scripts/workspacify-allocate/cleanup-workspace-artifacts.mjs';
import { STAGING_PREFIX } from '../../../.claude/scripts/workspacify-allocate/lib/tree-staging.mjs';

function workspace() {
  const dir = mkdtempSync(join(tmpdir(), 'wt-195-clean-'));
  mkdirSync(join(dir, 'crates/protocol/alpha'), { recursive: true });
  writeFileSync(join(dir, 'crates/protocol/alpha/RFC-SEED.md'), '# RFC Seed: alpha\n');
  writeFileSync(join(dir, 'WORKSPACIFY-TREE-MANIFEST.json'), '{}');
  writeFileSync(join(dir, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), '{}');
  writeFileSync(join(dir, 'spec.md'), '# Spec\n');
  const stagingPath = join(dir, `${STAGING_PREFIX}1234-abcd`);
  mkdirSync(stagingPath, { recursive: true });
  writeFileSync(join(stagingPath, 'scratch.json'), '{}');
  return { dir, stagingPath };
}

test('C004 cleanup removes the staging root and keeps the published set', () => {
  const { dir, stagingPath } = workspace();
  try {
    const result = removeWorkspaceArtifacts({ workspaceRoot: dir, stagingRoot: stagingPath });
    assert.equal(result.removed.includes(`${STAGING_PREFIX}1234-abcd`), true);
    assert.equal(existsSync(stagingPath), false);
    assert.deepEqual(readdirSync(dir).sort(), ['WORKSPACIFY-ALLOCATE-MANIFEST.json', 'WORKSPACIFY-TREE-MANIFEST.json', 'crates', 'spec.md']);
    assert.equal(existsSync(join(dir, 'spec.md')), true, 'pre-existing files survive');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C004 cleanup is idempotent and tolerates a missing staging root', () => {
  const { dir, stagingPath } = workspace();
  try {
    removeWorkspaceArtifacts({ workspaceRoot: dir, stagingRoot: stagingPath });
    const second = removeWorkspaceArtifacts({ workspaceRoot: dir, stagingRoot: stagingPath });
    assert.deepEqual(second.removed, []);
    assert.equal(removeWorkspaceArtifacts({ workspaceRoot: dir, stagingRoot: null }).removed.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C004 a stale staging directory from an interrupted run is removed without touching content', () => {
  const { dir, stagingPath } = workspace();
  try {
    const content = readFileSyncSafe(join(dir, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'));
    removeWorkspaceArtifacts({ workspaceRoot: dir, stagingRoot: null });
    assert.equal(existsSync(stagingPath), false, 'a stale staging root is cleaned even without a handle');
    assert.equal(readFileSyncSafe(join(dir, 'WORKSPACIFY-ALLOCATE-MANIFEST.json')), content);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C004 the published-artifact predicate separates output from intermediates', () => {
  assert.equal(isPublishedArtifact('crates/protocol/alpha/RFC-SEED.md'), true);
  assert.equal(isPublishedArtifact('WORKSPACIFY-ALLOCATE-MANIFEST.json'), true);
  assert.equal(isPublishedArtifact('WORKSPACIFY-TREE-MANIFEST.json'), true);
  assert.equal(isPublishedArtifact(`${STAGING_PREFIX}9/scratch.json`), false);
  assert.equal(isPublishedArtifact('scratch.json'), false);
  assert.ok(INTERMEDIATE_ARTIFACT_PATTERNS.some((pattern) => STAGING_PREFIX.startsWith(pattern) || pattern === STAGING_PREFIX));
});

function readFileSyncSafe(path) {
  return readFileSync(path, 'utf8');
}
