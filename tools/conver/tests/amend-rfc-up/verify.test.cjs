'use strict';

/**
 * PX-418 — verify: convergence, amendment report, cross-artifact findings.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  assertConverged,
  renderFindings,
  runCrossArtifactVerify,
  runVerifyAmendment,
  runWorkspaceVerify,
  stableDigest,
} = require('../../.claude/scripts/amend-rfc-up/verify.js');
const { cleanup, makeFixturePackage } = require('./helpers.cjs');

// @verifies C011
test('C011: zero findings twice with the same digest converges', async () => {
  const ok = await assertConverged({ run: () => ({ findings: [], digest: 'sha256:stable' }), runs: 2 });
  assert.equal(ok.ok, true);
  const unstable = await assertConverged({
    run: () => ({ findings: [], digest: String(Math.random()) }),
    runs: 2,
  });
  assert.equal(unstable.ok, false);
  assert.equal(unstable.code, 'CONVERGENCE_FAILED');
});

test('convergence fails when a finding appears', async () => {
  const result = await assertConverged({
    run: () => ({ findings: [{ code: 'VERIFY_BLOCKED' }], digest: 'sha256:stable' }),
    runs: 2,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'CONVERGENCE_FAILED');
});

test('a convergence digest ignores the run timestamp but keeps every finding', async () => {
  const clean = { findings: [], generatedAt: '2026-01-01T00:00:00.000Z' };
  const later = { findings: [], generatedAt: '2026-01-02T00:00:00.000Z' };
  const blocked = { findings: [{ code: 'DRILL_FINDING' }], generatedAt: '2026-01-01T00:00:00.000Z' };

  assert.equal(stableDigest(clean), stableDigest(later));
  assert.notEqual(stableDigest(clean), stableDigest(blocked));
  const converged = await assertConverged({
    run: (index) => (index === 0
      ? { findings: [], digest: stableDigest(clean) }
      : { findings: [], digest: stableDigest(later) }),
  });
  assert.equal(converged.ok, true);
});

test('runVerifyAmendment parses the report', async () => {
  const fixture = makeFixturePackage();
  try {
    let captured;
    const result = await runVerifyAmendment({
      ticketKey: 'PX-418',
      packageDir: fixture,
      runner: ({ args }) => {
        captured = args;
        return {
          status: 0,
          stdout: JSON.stringify({ findings: [], skipped: [], unverifiable: [] }),
        };
      },
    });
    assert.deepEqual(result.findings, []);
    assert.equal(captured.includes('--ticket-key=PX-418'), true);
    assert.equal(captured.includes(`--cwd=${fixture}`), true);
  } finally {
    cleanup(fixture);
  }
});

test('runCrossArtifactVerify passes = form arguments to verify-step', async () => {
  const fixture = makeFixturePackage();
  try {
    let captured;
    await runCrossArtifactVerify({
      rfcPath: path.join(fixture, 'RFC.md'),
      graphPath: path.join(fixture, 'RFC-GRAPH.json'),
      dirsTreePath: path.join(fixture, 'RFC-Dirs-Tree.json'),
      srcDir: path.join(fixture, 'src'),
      ticketsPath: path.join(fixture, 'Tickets.json'),
      sessionDir: path.join(fixture, 'session'),
      workspaceRoot: fixture,
      runner: ({ args }) => {
        captured = args;
        return { status: 0, stdout: '{}' };
      },
    });
    assert.equal(captured.includes(`--rfc=${path.join(fixture, 'RFC.md')}`), true);
    assert.equal(captured.includes(`--session-dir=${path.join(fixture, 'session')}`), true);
    assert.equal(captured.some((argument) => argument === '--rfc'), false);
  } finally {
    cleanup(fixture);
  }
});

test('renderFindings is stable', () => {
  const lines = renderFindings({
    findings: [{ code: 'VERIFY_BLOCKED', asset: 'RFC', problem: 'high' }],
  });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /VERIFY_BLOCKED/);
  assert.match(lines[0], /RFC/);
});

// @verifies C011
test('C011: workspace verify accepts a present cross-package reference', () => {
  const packageDir = makeFixturePackage();
  try {
    const targetDir = makeFixturePackage();
    try {
      fs.writeFileSync(path.join(targetDir, 'RFC.md'), '# RFC\n\nContract C-100 is shared.\n');
      const packages = [
        { id: 'pkg-a', dir: packageDir },
        { id: 'pkg-b', dir: targetDir },
      ];
      const result = runWorkspaceVerify({
        packages,
        impacts: [{ from: 'pkg-a', to: 'pkg-b', kind: 'contract', reference: 'C-100', changeIds: ['CH1'] }],
      });
      assert.deepEqual(result.findings, []);
      assert.equal(result.ok, true);
    } finally {
      cleanup(targetDir);
    }
  } finally {
    cleanup(packageDir);
  }
});

test('C011: a missing impact target or reference is a named finding', () => {
  const packageDir = makeFixturePackage();
  try {
    const missingTarget = runWorkspaceVerify({
      packages: [{ id: 'pkg-a', dir: packageDir }],
      impacts: [{ from: 'pkg-a', to: 'pkg-absent', kind: 'contract', reference: 'C-100', changeIds: ['CH1'] }],
    });
    assert.equal(missingTarget.ok, false);
    assert.equal(missingTarget.findings[0].code, 'IMPACT_TARGET_MISSING');

    const missingReference = runWorkspaceVerify({
      packages: [{ id: 'pkg-a', dir: packageDir }, { id: 'pkg-b', dir: packageDir }],
      impacts: [{ from: 'pkg-a', to: 'pkg-b', kind: 'contract', reference: 'C-ABSENT', changeIds: ['CH1'] }],
    });
    assert.equal(missingReference.ok, false);
    assert.equal(missingReference.findings[0].code, 'IMPACT_REFERENCE_MISSING');
  } finally {
    cleanup(packageDir);
  }
});

// @verifies C011
test('C011: the verify CLI workspace subcommand reads packages and impacts', () => {
  const packageDir = makeFixturePackage();
  const packagesPath = path.join(packageDir, 'packages.json');
  const impactsPath = path.join(packageDir, 'impacts.json');
  try {
    fs.writeFileSync(packagesPath, JSON.stringify([{ id: 'pkg-a', dir: packageDir }, { id: 'pkg-b', dir: packageDir }]));
    fs.writeFileSync(impactsPath, JSON.stringify({ crossPackageImpacts: [] }));
    const result = spawnSync(process.execPath, [
      path.resolve(__dirname, '../../.claude/scripts/amend-rfc-up/verify.js'),
      'workspace',
      `--packages=@${packagesPath}`,
      `--impacts=@${impactsPath}`,
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).ok, true);
  } finally {
    cleanup(packageDir);
  }
});
