// @verifies C001
// @verifies C003
// @verifies C007
// @verifies C011
/**
 * End-to-end mini wiki acceptance on the OKF v0.2 layout.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';
import { verifyOkfSkill } from '../../../.claude/scripts/amend-rfc-up/verify-okf-skill.mjs';
import { buildMiniSkillV2 } from '../lib/fixture-v2.mjs';

// [::TICKET::] PX-425, PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-425|PX-426) --for-spec --no-implementation-order`.
function runCli(skill, args) {
  return execFileSync(process.execPath, [join(skill.skillDir, 'dist/skill.mjs'), ...args, '--root', join(skill.skillDir, 'okf')], {
    encoding: 'utf8',
  });
}

test('the mini wiki answers with deterministic rows', async () => {
  const skill = await buildMiniSkillV2();
  try {
    const rows = JSON.parse(runCli(skill, ['search', '--query', 'tokens'])).rows;
    assert.ok(rows.length > 0);
    assert.ok(rows.length <= 20);
    assert.match(rows[0].id, /^pages\//);
    assert.equal(typeof rows[0].score, 'number');
  } finally {
    rmSync(skill.root, { recursive: true, force: true });
  }
});

test('the mini wiki passes dev verification including its own tests', async () => {
  const skill = await buildMiniSkillV2();
  try {
    const report = await verifyOkfSkill({
      skillPath: skill.skillDir,
      root: skill.root,
      sourceRoot: skill.root,
      pathAlias: skill.aliasPath,
      mode: 'dev',
    });
    assert.equal(report.status, 'machine_verified', JSON.stringify(report.checks));
  } finally {
    rmSync(skill.root, { recursive: true, force: true });
  }
});

test('the mini wiki passes installed verification after install', async () => {
  const skill = await buildMiniSkillV2();
  const target = join(skill.root, 'installed');
  try {
    mkdirSync(target, { recursive: true });
    execFileSync(process.execPath, [join(skill.skillDir, 'install.js'), target]);
    const installed = join(target, '.claude/skills', basename(skill.skillDir));
    const report = await verifyOkfSkill({
      skillPath: installed,
      root: skill.root,
      mode: 'installed',
      pathAlias: skill.aliasPath,
    });
    assert.equal(report.status, 'machine_verified', JSON.stringify(report.checks));
    const output = execFileSync(process.execPath, [join(installed, 'dist/skill.mjs'), 'search', '--query', 'session', '--root', join(installed, 'okf')], { encoding: 'utf8' });
    assert.ok(JSON.parse(output).rows.length > 0);
  } finally {
    rmSync(skill.root, { recursive: true, force: true });
  }
});
