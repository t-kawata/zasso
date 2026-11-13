import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
test('ingest verify re-derives the lock and coverage', () => {
  const result = spawnSync(process.execPath, [join(root, 'scripts/ingest.mjs'), 'verify', '--alias', join(root, '..', 'mini-law.path-alias.json')], { cwd: join(root, '..'), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /verify: 1 files/);
});
