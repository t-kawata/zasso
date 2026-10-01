// PX-231 @verifies C004
//
// The completeness argument for this ticket, not a decoration on it. A hand-written
// inventory of the trees that interpolate a path into a sink cannot be shown complete by
// reading, so the inventory is decided by a scan over the tree that exists, and the scan is
// the thing that fails when a new emission appears.
//
// Three properties are pinned here, and the second and third matter as much as the first.
// A clean verdict on the real tree says nothing if the scan inspects nothing, so a zero
// inspected count is an error rather than a pass. And a scan that reported everything would
// be as useless as one that reported nothing, so a plant that does not hold a path must
// come back clean.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { scanCommittedArtefacts, scanPathEmissions } from '../lib/path-emission.mjs';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPTS_ROOT = join(PROJECT_ROOT, '.claude', 'scripts');

/** A throwaway tree holding exactly the modules the caller writes into it. */
// [::TICKET::] PX-231 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-231 --for-spec --no-implementation-order`.
function withPlantedTree(modules, subject) {
  const root = mkdtempSync(join(tmpdir(), 'px231-emission-'));
  try {
    for (const [name, text] of Object.entries(modules)) {
      mkdirSync(join(root, dirname(name)), { recursive: true });
      writeFileSync(join(root, name), text, 'utf8');
    }
    return subject(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('C004 invariant: the tree emits no absolute path that bypassed the converter', () => {
  const report = scanPathEmissions({ root: SCRIPTS_ROOT });

  assert.ok(report.inspected > 0, 'a zero inspected count is a defect of this scan, not a clean tree');
  assert.deepEqual(
    report.bypassing.map((finding) => `${finding.file}:${finding.line}`),
    [],
    'every emission must reach its sink through toHomeRelative',
  );
});

test('C004 invariant: an emission that bypassed the converter is reported by file and line', () => {
  withPlantedTree(
    { 'lib/planted.mjs': 'const absPath = resolve(process.argv[2]);\nprocess.stdout.write(`seed at ${absPath}\\n`);\n' },
    (root) => {
      const report = scanPathEmissions({ root });

      assert.deepEqual(report.bypassing.map((finding) => finding.file), ['lib/planted.mjs']);
      assert.equal(report.bypassing[0].line, 2);
      assert.equal(report.bypassing[0].sink, 'process.stdout.write');
    },
  );
});

test('C004 invariant: the same emission passes once it is converted', () => {
  withPlantedTree(
    {
      'lib/converted.mjs': 'const absPath = resolve(process.argv[2]);\nprocess.stdout.write(`seed at ${toHomeRelative(absPath)}\\n`);\n',
    },
    (root) => {
      assert.deepEqual(scanPathEmissions({ root }).bypassing, []);
    },
  );
});

test('C004 invariant: a path made relative to the workspace root is not reported', () => {
  withPlantedTree(
    {
      'lib/relative.mjs': 'const root = resolve(process.cwd());\nprocess.stdout.write(`- seed: ${relative(root, seedPath)}\\n`);\n',
    },
    (root) => {
      assert.deepEqual(scanPathEmissions({ root }).bypassing, []);
    },
  );
});

test('C004 invariant: a value that is not a path is not reported', () => {
  withPlantedTree(
    { 'lib/counts.mjs': 'const rounds = countRounds(text);\nprocess.stdout.write(`rounds: ${rounds}\\n`);\n' },
    (root) => {
      const report = scanPathEmissions({ root });

      assert.deepEqual(report.bypassing, []);
      assert.ok(report.inspected > 0, 'the scan still walked the file, so the clean verdict means something');
    },
  );
});

test('C004 invariant: an absolute path handed to the filesystem is not reported', () => {
  withPlantedTree(
    { 'lib/reads.mjs': 'const seedPath = resolve(seedArgument);\nconst seedText = readFileSync(seedPath, "utf8");\n' },
    (root) => {
      assert.deepEqual(scanPathEmissions({ root }).bypassing, []);
    },
  );
});

test('C004 invariant: the tree the command actually ships is the one the scan reads', () => {
  const probe = scanPathEmissions({ root: SCRIPTS_ROOT });

  assert.equal(probe.root, SCRIPTS_ROOT);
  assert.ok(probe.files > 100, `the scan reached the tree rather than a corner of it: ${probe.files} files`);
});

test('C004 invariant: the scan reads the tree it is pointed at and not a cached list', () => {
  const first = scanPathEmissions({ root: SCRIPTS_ROOT });

  withPlantedTree({ 'lib/planted.mjs': 'const absPath = resolve(x);\nconsole.error(`at ${absPath}`);\n' }, (root) => {
    const planted = scanPathEmissions({ root });

    assert.equal(planted.bypassing.length, 1);
  });
  assert.equal(scanPathEmissions({ root: SCRIPTS_ROOT }).inspected, first.inspected);
  assert.ok(readFileSync(join(SCRIPTS_ROOT, 'explain-seed', 'run.mjs'), 'utf8').length > 0);
});

// PX-231 @verifies C004
/**
 * A throwaway git repository holding exactly the files the caller writes into it.
 *
 * A repository rather than a directory, because the scan asks git what is committed: the
 * question is whether an artefact the repository carries names this machine, and a file
 * nobody has committed yet is not yet an artefact anyone else will read.
 */
// [::TICKET::] PX-231 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-231 --for-spec --no-implementation-order`.
function withPlantedRepository(files, subject) {
  const root = mkdtempSync(join(tmpdir(), 'px231-artefacts-'));
  try {
    spawnSync('git', ['init', '--quiet'], { cwd: root });
    for (const [name, text] of Object.entries(files)) {
      mkdirSync(join(root, dirname(name)), { recursive: true });
      writeFileSync(join(root, name), text, 'utf8');
    }
    spawnSync('git', ['add', '--all'], { cwd: root });
    return subject(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('C004 invariant: no committed artefact names this machine', () => {
  const report = scanCommittedArtefacts({ repositoryRoot: PROJECT_ROOT });

  assert.equal(report.unavailable, null, 'the repository has to be readable for a clean verdict to mean anything');
  assert.ok(report.files > 1000, `the scan reached the tracked tree: ${report.files} files`);
  assert.deepEqual(
    report.naming.map((finding) => finding.file),
    [],
    'every committed artefact must be readable on a machine that is not this one',
  );
});

test('C004 invariant: a committed artefact that names the machine is reported by file and line', () => {
  withPlantedRepository(
    { 'notes.md': 'first line\nwritten at /Users/someone-else/project/specs/PX-1.md\n' },
    (root) => {
      const report = scanCommittedArtefacts({ repositoryRoot: root, home: '/Users/someone-else' });

      assert.deepEqual(report.naming, [{ file: 'notes.md', line: 2, occurrences: 1 }]);
    },
  );
});

test('C004 invariant: a fixture that names a machine is not reported', () => {
  withPlantedRepository(
    { 'tests/fixtures/Tickets.json': '{"file":"/Users/someone-else/project/src/a.rs"}\n' },
    (root) => {
      const report = scanCommittedArtefacts({ repositoryRoot: root, home: '/Users/someone-else' });

      assert.deepEqual(report.naming, [], 'a fixture is an input the tests assert on, not an emitted artefact');
      assert.equal(report.files, 0, 'and it was not counted as scanned either, so the verdict says what it read');
    },
  );
});

test('C004 invariant: a tree that is not a repository is reported unavailable rather than clean', () => {
  const root = mkdtempSync(join(tmpdir(), 'px231-norepo-'));
  try {
    writeFileSync(join(root, 'notes.md'), 'written at /Users/someone-else/project\n', 'utf8');

    const report = scanCommittedArtefacts({ repositoryRoot: root, home: '/Users/someone-else' });

    assert.equal(report.unavailable, 'not-a-repository', 'an absent repository must not read as an absence of findings');
    assert.deepEqual(report.naming, []);
    assert.equal(report.files, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C004 invariant: a machine with no home directory is reported rather than guessed at', () => {
  const report = scanCommittedArtefacts({ repositoryRoot: PROJECT_ROOT, home: '' });

  assert.equal(report.unavailable, 'no-home-directory');
});
