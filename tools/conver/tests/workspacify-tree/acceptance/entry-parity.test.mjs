// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
// @verifies C005
// [::TICKET::] PX-181: workspacify-tree ALLOCATE entry-gate parity acceptance.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-181 --for-spec --no-implementation-order`

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, cpSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { checkTreeEntryGate } from '../../../.claude/scripts/workspacify-tree/lib/entry-parity.mjs';

const CONVER_ROOT = process.cwd();
const RUN_SCRIPT = join(CONVER_ROOT, '.claude/scripts/workspacify-tree/run.mjs');
const FIXTURES = join(CONVER_ROOT, 'tests/workspacify-tree/fixtures');
const MANIFEST_NAME = 'WORKSPACIFY-TREE-MANIFEST.json';

test('entry parity C005 [@verifies C005]: a gaia-like spec yields a manifest that passes the ALLOCATE entry gate', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wst-parity-'));
  const specPath = join(dir, 'gaia-like-spec.md');
  const decisionsPath = join(dir, 'gaia-decisions.json');
  cpSync(join(FIXTURES, 'gaia-like-spec.md'), specPath);
  cpSync(join(FIXTURES, 'gaia-decisions.json'), decisionsPath);

  const result = spawnSync(process.execPath, [RUN_SCRIPT, 'finalize', `--spec=${specPath}`, `--decisions=${decisionsPath}`], {
    cwd: dir,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stdout);

  const manifestPath = join(dir, MANIFEST_NAME);
  assert.equal(existsSync(manifestPath), true);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.status, 'COMPLETE');

  // C001: workspace.tree present and consistent with catalog
  assert.ok(manifest.workspace.tree !== undefined);
  // C002: ownership table present
  assert.ok(manifest.workspace.ownership.entries.length >= 2);
  // C003: dependency orientation
  assert.equal(manifest.dependencies.orientation, 'consumer_to_direct_dependency');
  // C004: stage2 arrays present
  assert.ok(Array.isArray(manifest.stage2_handoff.contract_definition_order));
  assert.ok(Array.isArray(manifest.stage2_handoff.contract_boundaries));
  assert.ok(manifest.stage2_handoff.entry_gate.required_status === 'COMPLETE');

  const gate = checkTreeEntryGate(manifest, specPath);
  assert.equal(gate.ok, true, JSON.stringify(gate.errors));
});

test('entry parity C005 error [@verifies C005]: a truncated manifest fails the entry gate', () => {
  const manifestPath = join(FIXTURES, 'long-spec.md');
  const truncated = { status: 'COMPLETE', input: { source_hash: 'x'.repeat(64) } };
  const gate = checkTreeEntryGate(truncated, manifestPath);
  assert.equal(gate.ok, false);
  assert.ok(gate.errors.length >= 1);
});
