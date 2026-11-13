import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
function run(args) {
  return spawnSync(process.execPath, [join(root, 'dist/skill.mjs'), ...args], { encoding: 'utf8' });
}
test('context enforces predecessor order', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mini-context-'));
  try {
    const manifest = join(dir, 'manifest.json');
    assert.equal(run(['resolve', '--root', join(root, 'tests/fixtures/runtime/applicable'), '--paths', 'crates/app-rest/src/lib.rs', '--out', manifest]).status, 0);
    assert.notEqual(run(['context', '--manifest', manifest, '--phases', 'adapter', '--ledger', join(dir, 'a.json')]).status, 0);
    assert.equal(run(['context', '--manifest', manifest, '--phases', 'contract,core,operation,adapter', '--ledger', join(dir, 'b.json')]).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
