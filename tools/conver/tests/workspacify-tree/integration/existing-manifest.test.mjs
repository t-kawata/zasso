// @verifies C002
// [::TICKET::] PX-178: workspacify-tree existing-manifest preservation tests.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-178 --for-spec --no-implementation-order`

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, cpSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CONVER_ROOT = process.cwd();
const RUN_SCRIPT = '.claude/scripts/workspacify-tree/run.mjs';
const FIXTURES = join(CONVER_ROOT, 'tests/workspacify-tree/fixtures');

test('existing manifest with a different source hash is preserved (BLOCKED)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wst-exist-'));
  cpSync(join(FIXTURES, 'long-spec.md'), join(dir, 'long-spec.md'));
  cpSync(join(FIXTURES, 'decisions-long-ok.json'), join(dir, 'decisions-long-ok.json'));
  const oldManifest = JSON.stringify({ status: 'COMPLETE', input: { source_hash: 'e'.repeat(64) } });
  writeFileSync(join(dir, 'WORKSPACIFY-TREE-MANIFEST.json'), oldManifest);

  const result = spawnSync(process.execPath, [RUN_SCRIPT, 'finalize', `--spec=${join(dir, 'long-spec.md')}`, `--decisions=${join(dir, 'decisions-long-ok.json')}`, `--output-dir=${dir}`], {
    cwd: CONVER_ROOT,
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0, result.stdout);
  assert.equal(readFileSync(join(dir, 'WORKSPACIFY-TREE-MANIFEST.json'), 'utf8'), oldManifest);
});
