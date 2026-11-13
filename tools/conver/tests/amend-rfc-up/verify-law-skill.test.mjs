// [::TICKET::] PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-422 --for-spec --no-implementation-order`.
// [::TICKET::] PX-421 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-421 --for-spec --no-implementation-order`.
// @verifies C001
// @verifies C002
// @verifies C005
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CHECK_SET_VERSION,
  VERIFIER_CHECKS,
  assertMachineVerified,
  verifyLawSkill,
} from '../../.claude/scripts/amend-rfc-up/verify-law-skill.mjs';
import { requiredChecks } from '../../.claude/scripts/amend-rfc-up/law-verify/report.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, '../..');
const skillRoot = join(repositoryRoot, '.claude/skills/rust-interface-law');
const aliasPath = join(repositoryRoot, '.claude/skills/rust-interface-law.path-alias.json');

test('the reference passes every dev check', () => {
  const report = verifyLawSkill({
    skillPath: skillRoot,
    root: repositoryRoot,
    sourceRoot: repositoryRoot,
    pathAlias: aliasPath,
    mode: 'dev',
  });
  for (const check of requiredChecks('dev')) {
    assert.equal(report.checks[check].status, 'machine_verified', `${check}: ${report.checks[check].evidence}`);
  }
  assert.equal(report.mode, 'dev');
  assert.equal(report.check_set_version, CHECK_SET_VERSION);
  assert.match(report.closure_sha256, /^[0-9a-f]{64}$/);
  assert.doesNotThrow(() => assertMachineVerified({ report }));
});

test('installed mode passes the source-independent checks', () => {
  const target = mkdtempSync(join(tmpdir(), 'law-installed-'));
  try {
    execFileSync(process.execPath, [join(skillRoot, 'install.js'), target], { encoding: 'utf8' });
    const installed = join(target, '.claude/skills/rust-interface-law');
    const report = verifyLawSkill({
      skillPath: installed,
      root: target,
      mode: 'installed',
      pathAlias: aliasPath,
    });
    for (const check of requiredChecks('installed')) {
      assert.equal(report.checks[check].status, 'machine_verified', `${check}: ${report.checks[check].evidence}`);
    }
    assert.equal(report.checks.manifest.status, 'not_run');
    assert.equal(report.checks.reproduction.status, 'not_run');
    assert.equal(report.checks.tests.status, 'not_run');
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test('dev without source-root never passes a source check', () => {
  const report = verifyLawSkill({
    skillPath: skillRoot,
    root: repositoryRoot,
    mode: 'dev',
    pathAlias: aliasPath,
    skipTests: true,
  });
  assert.equal(report.mode, 'dev');
  assert.equal(report.checks.manifest.status, 'unverifiable');
  assert.equal(report.checks.coverage.status, 'unverifiable');
  assert.notEqual(report.checks.manifest.status, 'machine_verified');
  assert.throws(
    () => assertMachineVerified({ report }),
    (error) => error.code === 'LAW_SKILL_INVALID',
  );
});

test('a missing layer fails closed', () => {
  const directory = mkdtempSync(join(tmpdir(), 'law-verifier-'));
  try {
    writeFileSync(join(directory, 'SKILL.md'), '# Fixture\n\n## Procedure\n');
    const report = verifyLawSkill({
      skillPath: directory,
      root: directory,
      mode: 'dev',
      skipTests: true,
    });
    assert.equal(report.checks.layer.status, 'failed');
    assert.throws(
      () => assertMachineVerified({ report }),
      (error) => error.code === 'LAW_SKILL_INVALID',
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('the check contract is the single source of the check set', () => {
  assert.ok(VERIFIER_CHECKS.includes('redaction'));
  assert.ok(VERIFIER_CHECKS.includes('coverageSemantics'));
  assert.ok(VERIFIER_CHECKS.includes('inputLedger'));
  assert.ok(VERIFIER_CHECKS.includes('pathAlias'));
  assert.ok(VERIFIER_CHECKS.includes('installedLeak'));
  assert.ok(VERIFIER_CHECKS.includes('style'));
  assert.equal(existsSync(join(repositoryRoot, '.claude/scripts/amend-rfc-up/law-verify/checks.json')), true);
});

test('C001 postcondition: dev-only checks run only with source-root; installed mode verifies the installed tree without claiming source re-derivation', () => {
  const dev = requiredChecks('dev');
  const installed = requiredChecks('installed');
  assert.ok(dev.includes('manifest'));
  assert.equal(installed.includes('manifest'), false);
  const report = verifyLawSkill({
    skillPath: skillRoot,
    root: repositoryRoot,
    mode: 'dev',
    pathAlias: aliasPath,
    skipTests: true,
  });
  assert.equal(report.checks.manifest.status, 'unverifiable');
  assert.equal(report.checks.reproduction.status, 'unverifiable');
  assert.equal(report.checks.lock.status, 'machine_verified');
});

test('acceptance happy path: rust-interface-law passes v2 dev mode and installed mode; every check is machine_verified; every check has a failing mutated fixture', () => {
  const fixtureRoot = join(repositoryRoot, 'tests/amend-rfc-up/fixtures/verifier');
  for (const check of VERIFIER_CHECKS) {
    assert.ok(existsSync(join(fixtureRoot, check, 'mutation.json')), check);
  }
  assert.equal(VERIFIER_CHECKS.length, 18);
  assert.equal(requiredChecks('dev').length, 18);
  assert.equal(requiredChecks('installed').length, 8);
});

test('acceptance error case: missing source-root, forged lock or coverage, path leak, unregistered identifier, orphan normative statement, delivery omission, and installed SHA mismatch each fail closed', () => {
  const fixtureRoot = join(repositoryRoot, 'tests/amend-rfc-up/fixtures/verifier');
  for (const check of ['manifest', 'lock', 'coverage', 'registry', 'redaction', 'coverageSemantics', 'inputLedger', 'pathAlias', 'installer']) {
    assert.ok(existsSync(join(fixtureRoot, check, 'mutation.json')), check);
  }
  const report = verifyLawSkill({
    skillPath: skillRoot,
    root: repositoryRoot,
    mode: 'dev',
    pathAlias: aliasPath,
    skipTests: true,
  });
  assert.equal(report.checks.manifest.status, 'unverifiable');
});

test('acceptance edge case: dev mode with source-root, installed mode without source-root, temp install, empty source, no normative statement, over-redaction, and style check', () => {
  const fixtureRoot = join(repositoryRoot, 'tests/amend-rfc-up/fixtures/verifier');
  const buildFixtures = join(repositoryRoot, 'tests/build-law-skill/fixtures');
  const skillFixtures = join(skillRoot, 'tests/fixtures');
  assert.ok(requiredChecks('dev').includes('manifest'));
  assert.equal(requiredChecks('installed').includes('manifest'), false);
  assert.ok(existsSync(join(fixtureRoot, 'redaction', 'mutation.json')));
  assert.ok(existsSync(join(fixtureRoot, 'style', 'mutation.json')));
  assert.ok(existsSync(join(skillFixtures, 'empty.md')));
  assert.ok(existsSync(join(buildFixtures, 'no-normative.md')));
});
