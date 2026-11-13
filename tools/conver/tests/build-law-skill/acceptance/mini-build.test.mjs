// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
// @verifies C001 C004
/**
 * Canonical verifier acceptance on the migrated rust-interface-law tree.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyLawSkill } from '../../../.claude/scripts/amend-rfc-up/verify-law-skill.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, '../../..');
const law = join(repositoryRoot, '.claude/skills/rust-interface-law');
const alias = join(repositoryRoot, '.claude/skills/rust-interface-law.path-alias.json');

test('the migrated law skill passes dev mode', async () => {
  const report = await verifyLawSkill({
    skillPath: law,
    root: repositoryRoot,
    sourceRoot: repositoryRoot,
    pathAlias: alias,
    mode: 'dev',
  });
  assert.equal(report.status, 'machine_verified');
  assert.equal(report.check_set_version, '3');
  for (const check of report.required_checks) {
    assert.equal(report.checks[check].status, 'machine_verified', `${check}: ${report.checks[check].evidence}`);
  }
});

test('the migrated law skill passes installed mode', async () => {
  const target = mkdtempSync(join(tmpdir(), 'mini-installed-'));
  try {
    assert.equal(spawnSync(process.execPath, [join(law, 'install.js'), target], { encoding: 'utf8' }).status, 0);
    const report = await verifyLawSkill({
      skillPath: join(target, '.claude/skills/rust-interface-law'),
      root: repositoryRoot,
      mode: 'installed',
      pathAlias: alias,
    });
    assert.equal(report.status, 'machine_verified');
    assert.equal(report.checks.manifest.status, 'not_run');
    assert.equal(report.checks.reproduction.status, 'not_run');
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test('a tampered lock fails the lock check', async () => {
  const target = mkdtempSync(join(tmpdir(), 'mini-tamper-'));
  try {
    spawnSync(process.execPath, [join(law, 'install.js'), target], { encoding: 'utf8' });
    const installed = join(target, '.claude/skills/rust-interface-law');
    const lockPath = join(installed, 'atoms.lock.json');
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    lock.rules[0].content_sha256 = '0'.repeat(64);
    writeFileSync(lockPath, JSON.stringify(lock));
    const report = await verifyLawSkill({
      skillPath: installed,
      root: repositoryRoot,
      mode: 'installed',
      pathAlias: alias,
      skipTests: true,
    });
    assert.ok(report.checks.lock.codes.includes('LOCK_BODY_HASH_MISMATCH') || report.checks.lock.status === 'failed');
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});
