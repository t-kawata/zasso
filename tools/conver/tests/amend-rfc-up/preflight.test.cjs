'use strict';

/**
 * PX-418 — preflight: material-only interface, package context, free instruction.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  COMMAND_ARGUMENT_HINT,
  assertCanonAmendable,
  assertPackageContext,
  deriveTicketKey,
  resolveCommandVariables,
  resolveMaterialPaths,
} = require('../../.claude/scripts/amend-rfc-up/preflight.js');
const { cleanup, makeEmptyDirectory, makeFixturePackage } = require('./helpers.cjs');

// @verifies C001
test('C001: material paths accepted; free instruction is derived; thin flag rejected', () => {
  const fixture = makeFixturePackage();
  try {
    const variables = resolveCommandVariables({
      cwd: fixture,
      materialArgs: ['FINDINGS.json'],
      instructionText: 'Change the REST authorization clause.',
      repoRoot: fixture,
      lawPath: '/tmp/law.mjs',
    });
    assert.equal(variables.materialPaths.length, 1);
    assert.equal(variables.amendOut, path.join(fixture, 'amend'));
    assert.equal(variables.lawOut, path.join(fixture, 'amend', 'law'));
    assert.equal(variables.reportPath, path.join(fixture, 'amend', 'amend-rfc-up-report.json'));
    assert.ok(variables.instructionPath.startsWith(path.join(fixture, 'amend') + path.sep));
    assert.ok(variables.instructionPath.endsWith('INSTRUCTION.md'));
    assert.equal(Array.isArray(variables.materials), true);
    assert.equal(Array.isArray(variables.packages), true);
    assert.equal(variables.materials[0].sha256.length, 64);
    assert.match(fs.readFileSync(variables.instructionPath, 'utf8'), /Change the REST/);
    assert.equal(COMMAND_ARGUMENT_HINT, '[<material file|directory>...]');
    assert.throws(
      () => resolveCommandVariables({
        cwd: fixture,
        materialArgs: ['--apply'],
        instructionText: 'x',
        repoRoot: fixture,
      }),
      (error) => error.code === 'PREFLIGHT_UNKNOWN_FLAG',
    );
  } finally {
    cleanup(fixture);
  }
});

// @verifies C002
test('C002: package context derived; missing artifact fails closed', () => {
  const fixture = makeFixturePackage();
  const empty = makeEmptyDirectory();
  try {
    const variables = resolveCommandVariables({
      cwd: fixture,
      materialArgs: ['FINDINGS.json'],
      instructionText: 'x',
      repoRoot: fixture,
      lawPath: '/tmp/law.mjs',
    });
    assert.equal(variables.packageDir, fixture);
    assert.ok(fs.existsSync(variables.ticketsPath));
    assert.ok(fs.existsSync(variables.rfcPath));
    assert.equal(variables.ticketKey, 'PX-418');
    assert.throws(
      () => assertPackageContext({ cwd: empty }),
      (error) => error.code === 'PREFLIGHT_ARTIFACT_MISSING',
    );
  } finally {
    cleanup(fixture);
    cleanup(empty);
  }
});

test('instruction alone is material', () => {
  const fixture = makeFixturePackage();
  try {
    const materialPaths = resolveMaterialPaths({
      cwd: fixture,
      materialArgs: [],
      instructionText: 'Only the instruction carries the change.',
    });
    assert.deepEqual(materialPaths, []);
  } finally {
    cleanup(fixture);
  }
});

test('no material and no instruction is MATERIAL_REQUIRED', () => {
  const empty = makeEmptyDirectory();
  try {
    assert.throws(
      () => resolveMaterialPaths({ cwd: empty, materialArgs: [], instructionText: null }),
      (error) => error.code === 'MATERIAL_REQUIRED',
    );
  } finally {
    cleanup(empty);
  }
});

test('ticket key is derived from the package active ticket', () => {
  const fixture = makeFixturePackage();
  try {
    const ticketKey = deriveTicketKey({
      ticketsPath: path.join(fixture, 'Tickets.json'),
      materialPaths: [path.join(fixture, 'FINDINGS.json')],
    });
    assert.equal(ticketKey, 'PX-418');
  } finally {
    cleanup(fixture);
  }
});

test('canon state materialized-fresh is amendable', () => {
  const fixture = makeFixturePackage();
  try {
    const result = assertCanonAmendable({
      packageDir: fixture,
      canonStateRunner: () => ({ status: 0, stdout: JSON.stringify({ state: 'materialized-fresh' }) }),
    });
    assert.equal(result.state, 'materialized-fresh');
  } finally {
    cleanup(fixture);
  }
});

test('canon state standalone is CANON_NOT_AMENDABLE', () => {
  const fixture = makeFixturePackage();
  try {
    assert.throws(
      () => assertCanonAmendable({
        packageDir: fixture,
        canonStateRunner: () => ({ status: 0, stdout: JSON.stringify({ state: 'standalone' }) }),
      }),
      (error) => error.code === 'CANON_NOT_AMENDABLE',
    );
  } finally {
    cleanup(fixture);
  }
});

// @verifies C002
test('C002: a package with no active ticket gets an amendment ticket', () => {
  const fixture = makeFixturePackage({ ticketStatus: 'todo' });
  try {
    const variables = resolveCommandVariables({
      cwd: fixture,
      materialArgs: ['FINDINGS.json'],
      instructionText: 'Amend the design.',
      repoRoot: fixture,
    });
    assert.match(variables.ticketKey, /^PX-[0-9]+$/);
    assert.equal(variables.ticketCreated, true);
    const document = JSON.parse(fs.readFileSync(path.join(fixture, 'Tickets.json'), 'utf8'));
    const created = document.phases[0].tickets.find((ticket) => `PX-${ticket.id}` === variables.ticketKey);
    assert.equal(created.status, 'todo');
  } finally {
    cleanup(fixture);
  }
});
