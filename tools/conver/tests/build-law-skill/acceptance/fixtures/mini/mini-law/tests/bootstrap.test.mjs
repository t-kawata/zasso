import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
test('resolve discovers one unit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mini-resolve-'));
  try {
    const out = join(dir, 'manifest.json');
    const result = spawnSync(process.execPath, [join(root, 'dist/skill.mjs'), 'resolve', '--root', join(root, 'tests/fixtures/runtime/applicable'), '--paths', 'crates/app-rest/src/lib.rs', '--out', out], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(readFileSync(out, 'utf8')).units.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
