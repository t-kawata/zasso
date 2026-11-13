// @verifies C001
// @verifies C002
// @verifies C004
// @verifies C005
// @verifies C007
// @verifies C011
/**
 * PX-424 — canonical OKF verifier behavior.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { verifyOkfSkill } from '../../../.claude/scripts/amend-rfc-up/verify-okf-skill.mjs';
import { createMiniSkill } from '../lib/fixture.mjs';

// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
function codes(report, name) {
  return new Set(report.checks[name]?.codes ?? []);
}

test('a valid mini skill is machine verified in dev mode', () => {
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
    assert.equal(report.check_set_version, '1');
    assert.equal(report.required_checks.length, 19);
    for (const name of report.required_checks) {
      assert.equal(report.checks[name].status, 'machine_verified', `${name}: ${report.checks[name].evidence}`);
    }
  } finally {
    rmSync(skill.root, { recursive: true, force: true });
  }
});

test('a missing artifact fails the layer check', () => {
  const skill = createMiniSkill();
  try {
    rmSync(join(skill.skillDir, 'source/claim-registry.json'));
    const report = verifyOkfSkill({ skillPath: skill.skillDir, root: skill.root, sourceRoot: skill.root, pathAlias: skill.aliasPath, mode: 'dev', skipTests: true });
    assert.equal(report.status, 'failed');
    assert.ok(codes(report, 'layer').has('LAYER_MISSING'));
  } finally {
    rmSync(skill.root, { recursive: true, force: true });
  }
});

test('a tampered node body fails the lock hash', () => {
  const skill = createMiniSkill();
  try {
    const index = readFileSync(join(skill.skillDir, 'okf/index.md'), 'utf8');
    const first = index.split('\n').find((line) => line.includes('./nodes/'));
    const relative = first.match(/\(\.\/nodes\/([^)]+)\)/)[1];
    const file = join(skill.skillDir, 'okf/nodes', relative);
    writeFileSync(file, readFileSync(file, 'utf8').replace(/\nTokens/, '\nTokens!'));
    const report = verifyOkfSkill({ skillPath: skill.skillDir, root: skill.root, sourceRoot: skill.root, pathAlias: skill.aliasPath, mode: 'dev', skipTests: true });
    assert.ok(codes(report, 'lock').has('LOCK_BODY_HASH_MISMATCH'));
  } finally {
    rmSync(skill.root, { recursive: true, force: true });
  }
});

test('a tampered source fails the manifest check', () => {
  const skill = createMiniSkill();
  try {
    writeFileSync(join(skill.root, 'auth.md'), '# Auth\n\nTokens never expire.\n');
    const report = verifyOkfSkill({ skillPath: skill.skillDir, root: skill.root, sourceRoot: skill.root, pathAlias: skill.aliasPath, mode: 'dev', skipTests: true });
    assert.ok(codes(report, 'manifest').has('SOURCE_VIEW_DRIFT'));
  } finally {
    rmSync(skill.root, { recursive: true, force: true });
  }
});

test('a missing source field fails provenance', () => {
  const skill = createMiniSkill();
  try {
    const lockPath = join(skill.skillDir, 'atoms.lock.json');
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    lock.nodes[0].sources = [];
    writeFileSync(lockPath, JSON.stringify(lock, null, 2));
    const report = verifyOkfSkill({ skillPath: skill.skillDir, root: skill.root, sourceRoot: skill.root, pathAlias: skill.aliasPath, mode: 'dev', skipTests: true });
    assert.ok(codes(report, 'provenance').has('CLAIM_UNSOURCED'));
  } finally {
    rmSync(skill.root, { recursive: true, force: true });
  }
});

test('an unresolved link fails the graph check', () => {
  const skill = createMiniSkill();
  try {
    const lockPath = join(skill.skillDir, 'atoms.lock.json');
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    lock.nodes[0].links = ['MISSING-99'];
    writeFileSync(lockPath, JSON.stringify(lock, null, 2));
    const report = verifyOkfSkill({ skillPath: skill.skillDir, root: skill.root, sourceRoot: skill.root, pathAlias: skill.aliasPath, mode: 'dev', skipTests: true });
    assert.ok(codes(report, 'citation').has('LINK_UNRESOLVED'));
  } finally {
    rmSync(skill.root, { recursive: true, force: true });
  }
});

test('an asymmetric conflict is rejected', () => {
  const skill = createMiniSkill();
  try {
    const lockPath = join(skill.skillDir, 'atoms.lock.json');
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    lock.nodes[0].conflicts = [lock.nodes[1].id];
    writeFileSync(lockPath, JSON.stringify(lock, null, 2));
    const report = verifyOkfSkill({ skillPath: skill.skillDir, root: skill.root, sourceRoot: skill.root, pathAlias: skill.aliasPath, mode: 'dev', skipTests: true });
    assert.ok(codes(report, 'conflicts').has('CONFLICT_ASYMMETRIC'));
  } finally {
    rmSync(skill.root, { recursive: true, force: true });
  }
});

test('a missing usage section blocks the build', () => {
  const skill = createMiniSkill();
  try {
    const skillPath = join(skill.skillDir, 'SKILL.md');
    writeFileSync(skillPath, readFileSync(skillPath, 'utf8').replace('## When to Use', '## Usage'));
    const report = verifyOkfSkill({ skillPath: skill.skillDir, root: skill.root, sourceRoot: skill.root, pathAlias: skill.aliasPath, mode: 'dev', skipTests: true });
    assert.ok(codes(report, 'usage').has('USAGE_INCOMPLETE'));
  } finally {
    rmSync(skill.root, { recursive: true, force: true });
  }
});

test('installed mode runs the eight installed checks', () => {
  const skill = createMiniSkill();
  try {
    const target = join(skill.root, 'installed');
    mkdirSync(target, { recursive: true });
    execFileSync(process.execPath, [join(skill.skillDir, 'install.js'), target]);
    const report = verifyOkfSkill({
      skillPath: join(target, '.claude/skills/mini-okf'),
      root: skill.root,
      mode: 'installed',
      pathAlias: skill.aliasPath,
      skipTests: true,
    });
    assert.equal(report.status, 'machine_verified', JSON.stringify(report.checks));
    assert.equal(report.required_checks.length, 8);
    assert.equal(report.checks.manifest.status, 'not_run');
    assert.equal(report.checks.tests.status, 'not_run');
  } finally {
    rmSync(skill.root, { recursive: true, force: true });
  }
});
