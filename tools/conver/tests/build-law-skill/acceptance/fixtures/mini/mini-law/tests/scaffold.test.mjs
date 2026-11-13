import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
test('an unknown CLI command exits 2', () => {
  const result = spawnSync(process.execPath, [join(root, 'dist/skill.mjs'), 'unknown'], { encoding: 'utf8' });
  assert.equal(result.status, 2);
});
