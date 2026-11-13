import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
test('rebuild is byte-identical', () => {
  const result = spawnSync(process.execPath, [join(root, 'dist/skill.mjs'), 'rebuild', '--root', root, '--alias', join(root, '..', 'mini-law.path-alias.json')], { cwd: join(root, '..'), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /byte-identical/);
});
