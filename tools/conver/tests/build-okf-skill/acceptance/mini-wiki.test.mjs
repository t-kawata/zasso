// @verifies C001
// @verifies C003
// @verifies C007
// @verifies C011
/**
 * PX-424 — end-to-end mini wiki acceptance.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { verifyOkfSkill } from '../../../.claude/scripts/amend-rfc-up/verify-okf-skill.mjs';
import { createMiniSkill } from '../lib/fixture.mjs';

// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
function runCli(skill, args) {
  return execFileSync(process.execPath, [join(skill.skillDir, 'scripts/cli.mjs'), ...args], {
    encoding: 'utf8',
  });
}

test('the mini wiki answers with cited rows', () => {
  const skill = createMiniSkill();
  try {
    const output = runCli(skill, ['ask', '--query', 'token expiry']);
    const rows = JSON.parse(output);
    assert.ok(rows.length > 0);
    assert.ok(rows.length <= 20);
    assert.match(rows[0].id, /^[A-Z]+-\d+$/);
    assert.match(rows[0].source, /^sources\//);
    assert.match(rows[0].content_sha256, /^[0-9a-f]{64}$/);
  } finally {
    rmSync(skill.root, { recursive: true, force: true });
  }
});

test('the mini wiki passes dev verification including its own tests', () => {
  const skill = createMiniSkill();
  try {
    const report = verifyOkfSkill({
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

test('the mini wiki passes installed verification after install', () => {
  const skill = createMiniSkill();
  const target = join(skill.root, 'installed');
  try {
    mkdirSync(target, { recursive: true });
    execFileSync(process.execPath, [join(skill.skillDir, 'install.js'), target]);
    const report = verifyOkfSkill({
      skillPath: join(target, '.claude/skills/mini-okf'),
      root: skill.root,
      mode: 'installed',
      pathAlias: skill.aliasPath,
    });
    assert.equal(report.status, 'machine_verified', JSON.stringify(report.checks));
    const installedCli = join(target, '.claude/skills/mini-okf/dist/skill.mjs');
    const output = execFileSync(process.execPath, [installedCli, 'ask', '--query', 'session'], { encoding: 'utf8' });
    assert.ok(JSON.parse(output).length > 0);
  } finally {
    rmSync(skill.root, { recursive: true, force: true });
  }
});
