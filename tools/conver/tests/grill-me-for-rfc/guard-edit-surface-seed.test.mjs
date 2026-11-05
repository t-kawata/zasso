// [::TICKET::] PX-372 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-372 --for-spec --no-implementation-order`.
// PX-359 @verifies C001
// [::TICKET::] PX-359 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-359 --for-spec --no-implementation-order`.
/**
 * The edit boundary takes the specification name from the seed.
 *
 * A name-based pattern only protects the specification someone remembered to pattern
 * match. The seed records the one path this package was given, so the guard refuses
 * that path whatever it is called, and still refuses every path it cannot classify.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GUARD = fileURLToPath(new URL('../../.claude/scripts/grill-me-for-rfc/guard-edit-surface.js', import.meta.url));

// [::TICKET::] PX-359, PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-359|PX-360|PX-361) --for-spec --no-implementation-order`.
function seedWithSpec(path) {
  const directory = mkdtempSync(join(tmpdir(), 'guard-seed-'));
  const seedPath = join(directory, 'RFC-SEED.md');
  writeFileSync(seedPath, [
    '# RFC Seed',
    '',
    '```json',
    JSON.stringify({
      package: { id: 'pkg-0001' },
      source_spec: { path, sha256: 'a'.repeat(64) },
    }, null, 2),
    '```',
    '',
  ].join('\n'), 'utf8');
  return seedPath;
}

// [::TICKET::] PX-359, PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-359|PX-360|PX-361) --for-spec --no-implementation-order`.
function runGuard(target, extraArgs = []) {
  return spawnSync(process.execPath, [GUARD, target, ...extraArgs], { encoding: 'utf8' });
}

test('C001 postcondition: the spec path recorded in the seed is frozen whatever its name', () => {
  const seedPath = seedWithSpec('docs/CustomDesign_v9.md');
  const result = runGuard('/tmp/package/CustomDesign_v9.md', [`--seed=${seedPath}`, '--why']);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /CustomDesign_v9\.md/);
  assert.match(result.stdout + result.stderr, /frozen|input/i);
});

test('C001 invariant: default-deny survives the seed rule', () => {
  const result = runGuard('/tmp/package/NOTES.md');

  assert.equal(result.status, 1);
  assert.match(result.stderr, /unknown path/);
});

test('C001 invariant: a generated RFC is still editable beside a frozen specification', () => {
  const seedPath = seedWithSpec('docs/CustomDesign_v9.md');
  const result = runGuard('/tmp/package/RFC.md', [`--seed=${seedPath}`, '--package=/tmp/package']);

  assert.equal(result.status, 0, result.stderr);
});
