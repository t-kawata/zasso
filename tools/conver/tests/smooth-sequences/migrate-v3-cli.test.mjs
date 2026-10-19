import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

import { materializeSmoothWorkspace, minimalV2Artifact } from './helpers/workspace-fixture.mjs';

const CLI = '.claude/scripts/smooth-sequences/migrate-v3.mjs';

// [::TICKET::] PX-274 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-274 --for-spec --no-implementation-order`.
function runCli(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
}

// @verifies C001
test('--dry-run writes nothing', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    const before = readFileSync(workspace.artifactPath, 'utf8');
    const result = runCli([workspace.root, '--dry-run']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /dry-run/);
    assert.equal(readFileSync(workspace.artifactPath, 'utf8'), before);
  } finally {
    workspace.remove();
  }
});

// @verifies C002
test('the migration writes v3 and a second run is a no-op', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    const first = runCli([workspace.root]);
    assert.equal(first.status, 0, first.stderr);
    const migrated = JSON.parse(readFileSync(workspace.artifactPath, 'utf8'));
    assert.equal(migrated.schema_version, 3);
    const bytes = readFileSync(workspace.artifactPath, 'utf8');
    const second = runCli([workspace.root]);
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /already v3/);
    assert.equal(readFileSync(workspace.artifactPath, 'utf8'), bytes);
  } finally {
    workspace.remove();
  }
});

test('a missing workspace exits 2', () => {
  const result = runCli(['/tmp/smooth-sequences-migrate-missing']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /smooth-sequences|does not exist|NO_ROOT/);
});
