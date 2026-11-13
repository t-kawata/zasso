import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
function applies(fixture, path) {
  return spawnSync(process.execPath, [join(root, 'dist/skill.mjs'), 'applies', '--root', join(root, 'tests/fixtures/runtime', fixture), '--paths', path], { encoding: 'utf8' });
}
test('applicable and unrelated paths differ', () => {
  assert.equal(applies('applicable', 'crates/app-rest/src/lib.rs').status, 0);
  assert.equal(applies('unrelated', 'crates/app-other/src/lib.rs').status, 3);
});
