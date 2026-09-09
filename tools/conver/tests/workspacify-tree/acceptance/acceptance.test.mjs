// @verifies C005
// [::TICKET::] PX-178: workspacify-tree acceptance test (§14.4).
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-178 --for-spec --no-implementation-order`

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, cpSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const CONVER_ROOT = process.cwd();
const RUN_SCRIPT = join(CONVER_ROOT, '.claude/scripts/workspacify-tree/run.mjs');
const FIXTURES = join(CONVER_ROOT, 'tests/workspacify-tree/fixtures');
const MANIFEST_NAME = 'WORKSPACIFY-TREE-MANIFEST.json';

function sha256HexBytes(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

test('acceptance C005 [@verifies C005]: a long specification produces a COMPLETE manifest meeting every §14.4 condition', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wst-accept-'));
  const specPath = join(dir, 'long-spec.md');
  const decisionsPath = join(dir, 'decisions-long-ok.json');
  cpSync(join(FIXTURES, 'long-spec.md'), specPath);
  cpSync(join(FIXTURES, 'decisions-long-ok.json'), decisionsPath);

  const result = spawnSync(process.execPath, [RUN_SCRIPT, 'finalize', `--spec=${specPath}`, `--decisions=${decisionsPath}`], {
    cwd: dir,
    encoding: 'utf8',
  });

  // exit code == 0
  assert.equal(result.status, 0, result.stdout);
  // WORKSPACIFY-TREE-MANIFEST.json exists
  const manifestPath = join(dir, MANIFEST_NAME);
  assert.equal(existsSync(manifestPath), true);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  // manifest.status == COMPLETE
  assert.equal(manifest.status, 'COMPLETE');
  // manifest.final_audit.status == PASS
  assert.equal(manifest.final_audit.status, 'PASS');
  // final_audit counts are zero
  for (const key of ['orphan_object_count', 'orphan_claim_count', 'owner_collision_count', 'unknown_dependency_count', 'forbidden_dependency_count', 'layer_violation_count', 'cycle_count']) {
    assert.equal(manifest.final_audit[key], 0, `${key} must be zero`);
  }
  // manifest.integrity.reload_validation == PASS
  assert.equal(manifest.integrity.reload_validation, 'PASS');
  // hash(spec) == manifest.input.source_hash
  const specBytes = readFileSync(specPath);
  assert.equal(manifest.input.source_hash, sha256HexBytes(specBytes));
});
