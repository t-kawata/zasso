'use strict';

/**
 * PX-417 — enumerate: law applicability, closure, must rules, examples.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  extractMustRules,
  runLawApplies,
  selectPackageUnit,
  selectReferenceExamples,
} = require('../../.claude/scripts/amend-rfc-up/enumerate.js');
const { cleanup, makeEmptyDirectory, makeFixturePackage, makeLawAppliesOutput, makeLawManifest } = require('./helpers.cjs');

test('applies parses the matched unit and phases', () => {
  const fixture = makeFixturePackage();
  try {
    const result = runLawApplies({
      lawPath: '/tmp/law.mjs',
      repoRoot: fixture,
      packageDir: fixture,
      runner: () => ({ status: 0, stdout: makeLawAppliesOutput() }),
    });
    assert.equal(result.applies, true);
    assert.equal(result.unitId, 'doors-rest');
    assert.equal(result.role, 'rest');
    assert.ok(result.phases.includes('adapter'));
  } finally {
    cleanup(fixture);
  }
});

test('applies exit 3 is LAW_NOT_APPLICABLE', () => {
  const fixture = makeFixturePackage();
  try {
    const result = runLawApplies({
      lawPath: '/tmp/law.mjs',
      repoRoot: fixture,
      packageDir: fixture,
      runner: () => ({ status: 3, stdout: '# Law applicability — SKIP\n' }),
    });
    assert.equal(result.applies, false);
    assert.equal(result.code, 'LAW_NOT_APPLICABLE');
  } finally {
    cleanup(fixture);
  }
});

test('selectPackageUnit matches the package crate', () => {
  const manifest = makeLawManifest();
  const unit = selectPackageUnit({ manifest, packageDir: '/tmp/doors-rest', unitId: 'doors-rest' });
  assert.equal(unit.id, 'doors-rest');
  assert.equal(unit.role, 'rest');
});

test('extractMustRules keeps only must nodes in scope', () => {
  const manifest = makeLawManifest();
  const rules = extractMustRules({ manifest, phases: ['adapter'] });
  assert.equal(rules.length, 1);
  assert.equal(rules[0].id, 'REST-01');
});

test('selectReferenceExamples extracts a code fence from the rule body', () => {
  const manifest = makeLawManifest();
  const rules = extractMustRules({ manifest, phases: ['adapter'] });
  const examples = selectReferenceExamples({ rule: rules[0], manifest });
  assert.equal(examples.length, 1);
  assert.match(examples[0].code, /pub async fn execute/);
});

test('selectReferenceExamples returns [] when no code exists', () => {
  const manifest = makeLawManifest();
  const examples = selectReferenceExamples({
    rule: { id: 'X-01', requirement: 'No code here.', references: [] },
    manifest,
  });
  assert.deepEqual(examples, []);
});

test('law closure runner reads the manifest it wrote', () => {
  const fixture = makeFixturePackage();
  const lawOut = makeEmptyDirectory();
  try {
    const manifest = makeLawManifest();
    const result = require('../../.claude/scripts/amend-rfc-up/enumerate.js').resolveLawClosure({
      lawPath: '/tmp/law.mjs',
      repoRoot: fixture,
      packageDir: fixture,
      lawOut,
      runner: () => {
        fs.writeFileSync(path.join(lawOut, 'manifest.json'), JSON.stringify(manifest));
        return { status: 0, stdout: '# Resolved closure\n' };
      },
    });
    assert.equal(result.spec_version, '0.4.0');
    assert.equal(result.units.length, 1);
  } finally {
    cleanup(fixture);
    cleanup(lawOut);
  }
});
