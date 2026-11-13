'use strict';

/**
 * PX-419 — material resolution across home, absolute, invocation, package, and repo bases.
 */

const { test } = require('node:test');
// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  resolveMaterialPaths,
} = require('../../.claude/scripts/amend-rfc-up/material.js');
const {
  cleanup,
  makeEmptyDirectory,
  makeFixturePackage,
  makeLawSkillFixture,
} = require('./helpers.cjs');

function writeFile(directory, name, text) {
  const filePath = path.join(directory, name);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text);
  return filePath;
}

// @verifies C001
test('C001: material resolves from package, invocation, repo, absolute, and home bases', () => {
  const packageDir = makeFixturePackage();
  const invocationDir = makeEmptyDirectory();
  const repoRoot = makeEmptyDirectory();
  try {
    writeFile(packageDir, 'package-material.md', '# package\n');
    writeFile(invocationDir, 'docs/invocation-material.md', '# invocation\n');
    writeFile(repoRoot, 'docs/repo-material.md', '# repo\n');

    const fromPackage = resolveMaterialPaths({
      materialArgs: ['package-material.md'], packageDir, invocationDir, repoRoot,
    });
    assert.equal(fromPackage.materials[0].kind, 'ordinary');
    assert.match(fromPackage.materials[0].sha256, /^[0-9a-f]{64}$/);
    assert.equal(fromPackage.materials[0].bytes > 0, true);

    const fromInvocation = resolveMaterialPaths({
      materialArgs: ['docs/invocation-material.md'], packageDir, invocationDir, repoRoot,
    });
    assert.equal(fromInvocation.materials[0].path, path.join(invocationDir, 'docs/invocation-material.md'));

    const fromRepo = resolveMaterialPaths({
      materialArgs: ['docs/repo-material.md'], packageDir, invocationDir, repoRoot,
    });
    assert.equal(fromRepo.materials[0].path, path.join(repoRoot, 'docs/repo-material.md'));

    const absolute = resolveMaterialPaths({
      materialArgs: [path.join(repoRoot, 'docs/repo-material.md')], packageDir, invocationDir, repoRoot,
    });
    assert.equal(absolute.materials[0].path, path.join(repoRoot, 'docs/repo-material.md'));
  } finally {
    cleanup(packageDir);
    cleanup(invocationDir);
    cleanup(repoRoot);
  }
});

// @verifies C001
test('C001: missing material reports every tried base', () => {
  const packageDir = makeFixturePackage();
  const invocationDir = makeEmptyDirectory();
  const repoRoot = makeEmptyDirectory();
  try {
    assert.throws(
      () => resolveMaterialPaths({
        materialArgs: ['missing.md'], packageDir, invocationDir, repoRoot,
      }),
      (error) => error.code === 'MATERIAL_NOT_FOUND'
        && error.triedBases.length === 3
        && error.triedBases.includes(path.join(packageDir, 'missing.md')),
    );
  } finally {
    cleanup(packageDir);
    cleanup(invocationDir);
    cleanup(repoRoot);
  }
});

test('no material and no instruction is MATERIAL_REQUIRED', () => {
  const empty = makeEmptyDirectory();
  try {
    assert.throws(
      () => resolveMaterialPaths({ materialArgs: [], packageDir: empty, instructionText: null }),
      (error) => error.code === 'MATERIAL_REQUIRED',
    );
  } finally {
    cleanup(empty);
  }
});

test('an empty material directory is MATERIAL_EMPTY_DIRECTORY', () => {
  const packageDir = makeFixturePackage();
  const empty = makeEmptyDirectory();
  try {
    assert.throws(
      () => resolveMaterialPaths({ materialArgs: [empty], packageDir }),
      (error) => error.code === 'MATERIAL_EMPTY_DIRECTORY',
    );
  } finally {
    cleanup(packageDir);
    cleanup(empty);
  }
});

test('a *-law directory is one law-skill material', () => {
  const packageDir = makeFixturePackage();
  const fixture = makeLawSkillFixture();
  const skill = `${fixture}-law`;
  fs.renameSync(fixture, skill);
  try {
    const resolved = resolveMaterialPaths({ materialArgs: [skill], packageDir });
    assert.equal(resolved.materials.length, 1);
    assert.equal(resolved.materials[0].kind, 'law-skill');
    assert.equal(resolved.materials[0].skillPath, path.resolve(skill));
  } finally {
    cleanup(packageDir);
    cleanup(skill);
  }
});

test('an ordinary directory expands to its files', () => {
  const packageDir = makeFixturePackage();
  const materialDir = makeEmptyDirectory();
  try {
    writeFile(materialDir, 'a.md', '# a\n');
    writeFile(materialDir, 'nested/b.md', '# b\n');
    const resolved = resolveMaterialPaths({ materialArgs: [materialDir], packageDir });
    assert.equal(resolved.materials.length, 2);
    assert.equal(resolved.materials.every((material) => material.kind === 'ordinary'), true);
  } finally {
    cleanup(packageDir);
    cleanup(materialDir);
  }
});

test('a home-prefixed material argument expands', () => {
  const packageDir = makeFixturePackage();
  const homeDirectory = fs.mkdtempSync(path.join(os.homedir(), '.px419-material-'));
  try {
    writeFile(homeDirectory, 'material.md', '# home\n');
    const homeRelative = path.join('~', path.basename(homeDirectory), 'material.md');
    const resolved = resolveMaterialPaths({ materialArgs: [homeRelative], packageDir });
    assert.equal(resolved.materials.length, 1);
    assert.equal(resolved.materials[0].path, path.join(homeDirectory, 'material.md'));
  } finally {
    cleanup(packageDir);
    cleanup(homeDirectory);
  }
});
