import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../../..');
const GUARD = join(ROOT, '.claude/scripts/grill-me-for-rfc/guard-edit-surface.js');

// [::TICKET::] PX-1 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-1 --for-spec --no-implementation-order`.
function guard(target) {
  return spawnSync(process.execPath, [GUARD, target, '--json'], { encoding: 'utf8' });
}

test('guard seals the canonical SYSTEM-DESIGN.md basename', () => {
  const root = mkdtempSync(join(tmpdir(), 'guard-'));
  const result = guard(join(root, 'SYSTEM-DESIGN.md'));
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).rule, 'frozen');
});

test('guard keeps the legacy versioned basename sealed', () => {
  const root = mkdtempSync(join(tmpdir(), 'guard-'));
  const result = guard(join(root, 'GaiaSekkeiShiyousho_v31.md'));
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).rule, 'frozen');
});

test('guard still refuses an unknown path', () => {
  const root = mkdtempSync(join(tmpdir(), 'guard-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  const result = guard(join(root, 'src/random.txt'));
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).rule, 'unknown');
});

// The final two assertions verify artifacts of a renamed workspace: the supplied
// registry checker and the workspace Makefile. A distribution-only checkout carries
// neither, so the assertions are inapplicable there rather than vacuously true; the
// skip keeps the distribution suite green without weakening the workspace check.
const WORKSPACE_RENAME_MARKER = join(ROOT, 'educe-sequences/supplied/check-registry.mjs');
const WORKSPACE_RENAME_SKIP = existsSync(WORKSPACE_RENAME_MARKER)
  ? false
  : 'the checkout is a distribution, not a renamed workspace';

test('supplied registry checker names the canonical specification', { skip: WORKSPACE_RENAME_SKIP }, () => {
  const checker = readFileSync(WORKSPACE_RENAME_MARKER, 'utf8');
  assert.match(checker, /const SPEC_FILENAME = 'SYSTEM-DESIGN\.md';/);
});

test('Makefile tree recipes name the canonical sequences artifact', { skip: WORKSPACE_RENAME_SKIP }, () => {
  const makefile = readFileSync(join(ROOT, 'Makefile'), 'utf8');
  assert.match(makefile, /tree:\n\tnode .*SYSTEM-DESIGN-sequences\.json --tree/);
  assert.match(makefile, /tree-id:\n\tnode .*SYSTEM-DESIGN-sequences\.json --tree --id/);
});
