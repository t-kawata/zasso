// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
// @verifies C011 C012
/**
 * Installer parity and backward-compatible command surface.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO = process.cwd();
const LAW = join(REPO, '.claude/skills/rust-interface-law');

test('C011: installer copies okf-core, metadata, and the same dist bytes', () => {
  const target = mkdtempSync(join(tmpdir(), 'law-install-test-'));
  try {
    execFileSync(process.execPath, [join(LAW, 'install.js'), target], { encoding: 'utf8' });
    const installed = join(target, '.claude/skills/rust-interface-law');
    assert.ok(existsSync(join(installed, 'okf-core/index.mjs')));
    assert.ok(existsSync(join(installed, 'package.json')));
    assert.ok(existsSync(join(installed, 'THIRD_PARTY_NOTICES.md')));
    const digest = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
    assert.equal(digest(join(installed, 'dist/skill.mjs')), digest(join(LAW, 'dist/skill.mjs')));
    const show = spawnSync(process.execPath, [join(installed, 'dist/skill.mjs'), 'show', 'REST-01'], { encoding: 'utf8' });
    assert.equal(show.status, 0, show.stderr);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test('C012: every pre-migration command still exists and explain resolves REST-01', () => {
  const cli = readFileSync(join(LAW, 'scripts/cli.mjs'), 'utf8');
  for (const command of ['applies', 'resolve', 'context', 'explain', 'template', 'scaffold', 'implementation-check', 'gate', 'attest', 'law-identity', 'law-implementation']) {
    assert.ok(cli.includes(command), command);
  }
  const explain = spawnSync(process.execPath, [join(LAW, 'dist/skill.mjs'), 'explain', '--rule', 'REST-01'], { encoding: 'utf8' });
  assert.equal(explain.status, 0, explain.stderr);
  assert.match(explain.stdout, /REST-01/);
});
