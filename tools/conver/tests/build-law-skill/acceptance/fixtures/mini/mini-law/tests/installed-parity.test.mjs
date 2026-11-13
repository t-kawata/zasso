import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
test('install copies the runtime layers', () => {
  const target = mkdtempSync(join(tmpdir(), 'mini-install-'));
  try {
    assert.equal(spawnSync(process.execPath, [join(root, 'install.js'), target], { encoding: 'utf8' }).status, 0);
    const installed = join(target, '.claude/skills/mini-law');
    assert.ok(existsSync(join(installed, 'dist/skill.mjs')));
    assert.ok(existsSync(join(installed, 'okf/nodes')));
    assert.ok(existsSync(join(installed, 'tests/fixtures/runtime/runtime.json')));
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});
