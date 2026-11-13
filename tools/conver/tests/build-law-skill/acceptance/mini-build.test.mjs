// [::TICKET::] PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-422 --for-spec --no-implementation-order`.
// @verifies C001
// @verifies C004
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  verifyLawSkill,
} from '../../../.claude/scripts/amend-rfc-up/verify-law-skill.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, '../../..');
const miniRoot = join(here, 'fixtures/mini');
const miniSkill = join(miniRoot, 'mini-law');
const miniAlias = join(miniRoot, 'mini-law.path-alias.json');

test('the mini build passes the canonical v2 verifier', () => {
  const result = spawnSync(process.execPath, [
    join(here, 'verify-law-builds.mjs'),
    '--record', join(here, 'fixtures/mini-build.json'),
    '--root', repositoryRoot,
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /machine_verified/);
});

test('the mini skill passes dev mode', () => {
  const report = verifyLawSkill({
    skillPath: miniSkill,
    root: miniRoot,
    sourceRoot: miniRoot,
    pathAlias: miniAlias,
    mode: 'dev',
  });
  for (const check of report.required_checks) {
    assert.equal(report.checks[check].status, 'machine_verified', `${check}: ${report.checks[check].evidence}`);
  }
  assert.equal(report.checks.manifest.status, 'machine_verified');
  assert.equal(report.checks.coverage.status, 'machine_verified');
  assert.equal(report.checks.coverageSemantics.status, 'machine_verified');
});

test('the mini skill passes installed mode', () => {
  const target = mkdtempSync(join(tmpdir(), 'mini-installed-'));
  try {
    assert.equal(spawnSync(process.execPath, [join(miniSkill, 'install.js'), target], { encoding: 'utf8' }).status, 0);
    const report = verifyLawSkill({
      skillPath: join(target, '.claude/skills/mini-law'),
      root: miniRoot,
      mode: 'installed',
      pathAlias: miniAlias,
    });
    for (const check of report.required_checks) {
      assert.equal(report.checks[check].status, 'machine_verified', `${check}: ${report.checks[check].evidence}`);
    }
    assert.equal(report.checks.manifest.status, 'not_run');
    assert.equal(report.checks.reproduction.status, 'not_run');
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});
