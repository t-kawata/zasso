// [::TICKET::] PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-422 --for-spec --no-implementation-order`.
// [::TICKET::] PX-421 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-421 --for-spec --no-implementation-order`.
'use strict';

/**
 * PX-418 — *-law verifier caller: machine verification, canonical report, law use.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  REQUIRED_CHECKS,
  VERIFIER_SCHEMA,
  assertLawSkillValid,
  deriveLawPhases,
  resolveLawSkills,
  runLawSkill,
  verifyLawSkill,
} = require('../../.claude/scripts/amend-rfc-up/law-skill-verifier.js');
const {
  APPLIES_OUTPUT,
  LAW_SKILL_DIR,
  cleanup,
  makeFixturePackage,
  makeLawSkillFixture,
} = require('./helpers.cjs');

const CANONICAL_ROOT = path.resolve(__dirname, '../..');
const CANONICAL_SKILL = path.join(CANONICAL_ROOT, '.claude/skills/rust-interface-law');
const SOURCE_ROOT = CANONICAL_ROOT;
const ALIAS_PATH = path.join(CANONICAL_ROOT, '.claude/skills/rust-interface-law.path-alias.json');

// @verifies C004
test('C004: verifier writes a report and invalid skill throws', () => {
  const outPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'law-report-')), 'verification.json');
  const report = verifyLawSkill({
    skillPath: CANONICAL_SKILL,
    root: SOURCE_ROOT,
    target: { sourceRoot: SOURCE_ROOT, pathAlias: ALIAS_PATH, mode: 'dev' },
    outPath,
  });
  assert.ok(fs.existsSync(outPath));
  assert.equal(report.schema, VERIFIER_SCHEMA);
  assert.doesNotThrow(() => assertLawSkillValid({ report }));
  assert.throws(
    () => assertLawSkillValid({
      report: { ...report, checks: { ...report.checks, layer: { status: 'failed' } } },
    }),
    (error) => error.code === 'LAW_SKILL_INVALID',
  );
});

// @verifies C005
test('C005: every required check is machine_verified', () => {
  const outPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'law-report-')), 'verification.json');
  const report = verifyLawSkill({
    skillPath: CANONICAL_SKILL,
    root: SOURCE_ROOT,
    target: { sourceRoot: SOURCE_ROOT, pathAlias: ALIAS_PATH, mode: 'dev' },
    outPath,
  });
  for (const name of report.required_checks) {
    assert.equal(report.checks[name].status, 'machine_verified', name);
  }
});

// @verifies C006
test('C006: verified law uses applies, resolve, context only', () => {
  const skill = makeLawSkillFixture();
  const packageDir = makeFixturePackage();
  try {
    const calls = [];
    const result = runLawSkill({
      skillPath: skill,
      root: packageDir,
      packageDir,
      phases: ['adapter'],
      runner: ({ args }) => {
        const command = args[0];
        calls.push(command);
        if (command === 'applies') return { status: 0, stdout: APPLIES_OUTPUT };
        if (command === 'resolve') {
          const manifestPath = path.join(packageDir, 'amend', 'law', 'manifest.json');
          fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
          fs.writeFileSync(manifestPath, JSON.stringify({ units: [{ id: 'fixture' }] }));
          return { status: 0, stdout: '' };
        }
        return { status: 0, stdout: 'context body' };
      },
    });
    assert.equal(result.applies, true);
    assert.deepEqual(calls, ['applies', 'resolve', 'context']);
    assert.equal(calls.includes('okf'), false);
    assert.equal(result.contexts, 'context body');
  } finally {
    cleanup(skill);
    cleanup(packageDir);
  }
});

// @verifies C006
test('C006: applies and resolve receive source paths, never the package directory', () => {
  const skill = makeLawSkillFixture();
  const packageDir = makeFixturePackage();
  try {
    fs.writeFileSync(path.join(packageDir, 'src', 'surface.rs'), 'pub fn surface() {}\n');
    const calls = [];
    runLawSkill({
      skillPath: skill,
      root: packageDir,
      packageDir,
      phases: ['adapter'],
      runner: ({ args }) => {
        calls.push(args);
        if (args[0] === 'applies') return { status: 0, stdout: APPLIES_OUTPUT };
        if (args[0] === 'resolve') {
          const manifestPath = path.join(packageDir, 'amend', 'law', 'manifest.json');
          fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
          fs.writeFileSync(manifestPath, JSON.stringify({ phases: ['adapter'] }));
          return { status: 0, stdout: '' };
        }
        return { status: 0, stdout: 'context body' };
      },
    });
    for (const args of calls.filter((entry) => entry[0] === 'applies' || entry[0] === 'resolve')) {
      const paths = args[args.indexOf('--paths') + 1];
      assert.equal(paths, 'src/surface.rs');
      assert.equal(paths.endsWith('/'), false);
    }
  } finally {
    cleanup(skill);
    cleanup(packageDir);
  }
});

test('law applies exit 3 is LAW_NOT_APPLICABLE', () => {
  const skill = makeLawSkillFixture();
  const packageDir = makeFixturePackage();
  try {
    const result = runLawSkill({
      skillPath: skill,
      root: packageDir,
      packageDir,
      phases: ['adapter'],
      runner: () => ({ status: 3, stdout: '# SKIP\n' }),
    });
    assert.equal(result.applies, false);
    assert.equal(result.code, 'LAW_NOT_APPLICABLE');
  } finally {
    cleanup(skill);
    cleanup(packageDir);
  }
});

// @verifies C003
test('C003: an instruction-named *-law is resolved under the repo skills', () => {
  const resolved = resolveLawSkills({
    instructionText: 'Use rust-interface-law as needed.',
    repoRoot: path.resolve(__dirname, '../../../..'),
    claudeDir: path.resolve(__dirname, '../../../../.claude'),
  });
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].name, 'rust-interface-law');
  assert.equal(resolved[0].skillPath, path.resolve(LAW_SKILL_DIR));
});

test('C003: a missing law skill is LAW_SKILL_NOT_FOUND', () => {
  assert.throws(
    () => resolveLawSkills({
      instructionText: 'Use absent-law as needed.',
      repoRoot: path.resolve(__dirname, '../../../..'),
      claudeDir: path.resolve(__dirname, '../../../../.claude'),
    }),
    (error) => error.code === 'LAW_SKILL_NOT_FOUND',
  );
});

test('C003: phases are derived from the resolve manifest', () => {
  assert.deepEqual(deriveLawPhases({ manifest: { phases: ['contract', 'adapter'] } }), ['contract', 'adapter']);
  assert.deepEqual(
    deriveLawPhases({ manifest: { units: [{ phases: ['core'] }, { phase: 'operation' }, { phases: ['core'] }] } }),
    ['core', 'operation'],
  );
  assert.throws(
    () => deriveLawPhases({ manifest: { units: [] } }),
    (error) => error.code === 'LAW_PHASES_UNDECIDED',
  );
});
