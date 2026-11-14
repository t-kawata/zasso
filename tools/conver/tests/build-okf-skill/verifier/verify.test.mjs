// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
// @verifies C001
// @verifies C002
// @verifies C004
// @verifies C005
// @verifies C007
// @verifies C011
/**
 * Canonical OKF v0.2 verifier behavior.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { verifyOkfSkill } from '../../../.claude/scripts/amend-rfc-up/verify-okf-skill.mjs';
import { buildMiniSkillV2 } from '../lib/fixture-v2.mjs';

// [::TICKET::] PX-429 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-429 --for-spec --no-implementation-order`.
const CHECK_CONTRACT = JSON.parse(readFileSync(new URL('../../../.claude/scripts/amend-rfc-up/okf-verify/checks.json', import.meta.url), 'utf8'));
const DEV_REQUIRED = CHECK_CONTRACT.checks.filter((check) => check.mode === 'both' || check.mode === 'dev').length;
const INSTALLED_REQUIRED = CHECK_CONTRACT.checks.filter((check) => check.mode === 'both' || check.mode === 'installed').length;

// [::TICKET::] PX-429 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-429 --for-spec --no-implementation-order`.
function codes(report, name) {
  return new Set(report.checks[name]?.codes ?? []);
}

test('a valid mini skill is machine verified in dev mode', async () => {
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
    assert.equal(report.check_set_version, CHECK_CONTRACT.check_set_version);
    assert.equal(report.required_checks.length, DEV_REQUIRED);
    for (const name of report.required_checks) {
      assert.equal(report.checks[name].status, 'machine_verified', `${name}: ${report.checks[name].evidence}`);
    }
  } finally {
    rmSync(skill.root, { recursive: true, force: true });
  }
});

test('a missing artifact fails the layer check', async () => {
  const skill = await buildMiniSkillV2();
  try {
    rmSync(join(skill.skillDir, 'okf-core/index.mjs'));
    const report = await verifyOkfSkill({ skillPath: skill.skillDir, root: skill.root, sourceRoot: skill.root, pathAlias: skill.aliasPath, mode: 'dev', skipTests: true });
    assert.equal(report.status, 'failed');
    assert.ok(codes(report, 'layer').has('LAYER_MISSING'));
  } finally {
    rmSync(skill.root, { recursive: true, force: true });
  }
});

test('a tampered concept body fails the lock hash', async () => {
  const skill = await buildMiniSkillV2();
  try {
    const concept = skill.concepts[0];
    const file = join(skill.skillDir, 'okf', concept.path);
    writeFileSync(file, readFileSync(file, 'utf8').replaceAll('Tokens expire', 'Tokens! expire'));
    const report = await verifyOkfSkill({ skillPath: skill.skillDir, root: skill.root, sourceRoot: skill.root, pathAlias: skill.aliasPath, mode: 'dev', skipTests: true });
    assert.ok(codes(report, 'lock').has('LOCK_INVALID'));
  } finally {
    rmSync(skill.root, { recursive: true, force: true });
  }
});

test('a tampered source fails the manifest check', async () => {
  const skill = await buildMiniSkillV2();
  try {
    writeFileSync(join(skill.root, skill.sourceDir, 'auth.md'), '# Auth\n\nTokens never expire.\n');
    const report = await verifyOkfSkill({ skillPath: skill.skillDir, root: skill.root, sourceRoot: skill.root, pathAlias: skill.aliasPath, mode: 'dev', skipTests: true });
    assert.ok(codes(report, 'manifest').has('SOURCE_VIEW_DRIFT'));
  } finally {
    rmSync(skill.root, { recursive: true, force: true });
  }
});

test('a broken link passes conformance and fails lint', async () => {
  const skill = await buildMiniSkillV2();
  try {
    const concept = skill.concepts[0];
    const file = join(skill.skillDir, 'okf', concept.path);
    writeFileSync(file, `${readFileSync(file, 'utf8')}\n[missing](./missing.md)\n`);
    const report = await verifyOkfSkill({ skillPath: skill.skillDir, root: skill.root, sourceRoot: skill.root, pathAlias: skill.aliasPath, mode: 'dev', skipTests: true });
    assert.equal(report.checks.conformance.status, 'machine_verified');
    assert.ok(codes(report, 'lint').has('LINT_FAILED'));
  } finally {
    rmSync(skill.root, { recursive: true, force: true });
  }
});

test('a missing usage section blocks the build', async () => {
  const skill = await buildMiniSkillV2();
  try {
    const skillPath = join(skill.skillDir, 'SKILL.md');
    writeFileSync(skillPath, readFileSync(skillPath, 'utf8').replace('## Start Here', '## Usage'));
    const report = await verifyOkfSkill({ skillPath: skill.skillDir, root: skill.root, sourceRoot: skill.root, pathAlias: skill.aliasPath, mode: 'dev', skipTests: true });
    assert.ok(codes(report, 'usage').has('USAGE_INCOMPLETE'));
  } finally {
    rmSync(skill.root, { recursive: true, force: true });
  }
});

test('installed mode runs the installed checks', async () => {
  const skill = await buildMiniSkillV2();
  try {
    const target = join(skill.root, 'installed');
    mkdirSync(target, { recursive: true });
    execFileSync(process.execPath, [join(skill.skillDir, 'install.js'), target]);
    const report = await verifyOkfSkill({
      skillPath: join(target, '.claude/skills', basename(skill.skillDir)),
      root: skill.root,
      mode: 'installed',
      pathAlias: skill.aliasPath,
      skipTests: true,
    });
    assert.equal(report.status, 'machine_verified', JSON.stringify(report.checks));
    assert.equal(report.required_checks.length, INSTALLED_REQUIRED);
    assert.equal(report.checks.manifest.status, 'not_run');
    assert.equal(report.checks.tests.status, 'not_run');
  } finally {
    rmSync(skill.root, { recursive: true, force: true });
  }
});
