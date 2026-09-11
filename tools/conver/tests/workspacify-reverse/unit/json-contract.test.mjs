import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RUNNER = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'run-all-surfaces.mjs');

test('--json emits a parseable report even when a surface fails', () => {
// [::TICKET::] PX-204 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-204 --for-spec --no-implementation-order`.
  const root = mkdtempSync(join(tmpdir(), 'px204-json-'));
  mkdirSync(join(root, 'tests', 'unit'), { recursive: true });
  writeFileSync(join(root, 'tests', 'unit', 'a.test.mjs'), "import { test } from 'node:test';\ntest('boom', () => { throw new Error('{ not json }'); });\n");
  try {
    const result = spawnSync(process.execPath, [RUNNER, `--root=${root}`, '--json', '--surface=project-mjs'], {
      encoding: 'utf8',
    });
    assert.doesNotThrow(() => JSON.parse(result.stdout), 'stdout must be exactly one JSON document: ' + result.stdout.slice(0, 300));
    assert.equal(JSON.parse(result.stdout).surfaces['project-mjs'].status, 'fail');
    assert.match(result.stderr, /not json/, 'the failing child output belongs on stderr');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
