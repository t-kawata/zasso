// @verifies C001
// @verifies C002
// @verifies C003
/**
 * verification-surface — the aggregate entry point, end to end.
 *
 * Two kinds of test live here, and the split is deliberate.
 *
 * Most assertions run the aggregate against a **fixture tree**: a temporary
 * directory holding a handful of one-line test files. They are fast, and the
 * properties they assert — every discovered file is executed, a hole is named, an
 * empty surface is not a success, a nested run does not recurse — are properties
 * of the runner rather than of this repository.
 *
 * The assertions that genuinely need **this** repository — that the four
 * directories no `make` target reached are present, that the PX-142 baseline is
 * reported — share a single run over the real tree, and that run **never names
 * the surface this file lives in**.
 *
 * That restriction is load-bearing and was measured the hard way. This file is a
 * `.test.mjs`, so it belongs to the `project-mjs` surface. Asking for a full run of
 * the tree therefore makes the aggregate execute this file, which asks for a full
 * run, which executes the legacy surface a second time inside the first — the
 * whole suite paid for twice, because the aggregate's self-test guard only
 * excludes this file from a *nested* run. Naming `claude-tests` and
 * `project-js-cjs` reaches the same real-repo facts for the three `.cjs` reverse
 * directories and the legacy baseline, with no nesting at all; the `project-mjs`
 * surface is covered by the fixture tests above and by `make test` itself.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AGGREGATE_DEPTH_ENV,
  BASELINE_FAILURE_COUNT,
  CLAUDE_TESTS_ROOT,
  SELF_TEST_FILE_NAMES,
  SURFACE_NAMES,
  SURFACE_STATUS,
  TESTS_ROOT,
  discoverTestFiles,
} from '../../../tests/lib/test-discovery.mjs';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const RUNNER = join(PROJECT_ROOT, TESTS_ROOT, 'run-all-surfaces.mjs');

/**
 * A temporary tree holding the two roots the aggregate walks. `files` maps a
 * relative path to the source the file should contain.
 */
// [::TICKET::] PX-204 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-204 --for-spec --no-implementation-order`.
function makeFixtureTree(files) {
  const root = mkdtempSync(join(tmpdir(), 'px204-fixture-'));
  for (const [relative, source] of Object.entries(files)) {
    const full = join(root, relative);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, source);
  }
  return root;
}

/**
 * Run the aggregate against a tree and return its parsed report.
 *
 * `env` entries are applied over the ambient environment, and a `null` value
 * removes the variable. Removal is the only way to ask for a genuinely top-level
 * run from inside this file: when the whole suite runs under `make test` the
 * aggregate that started it has already set the depth marker, so inheriting the
 * ambient environment would make every run here nested.
 */
// [::TICKET::] PX-204 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-204 --for-spec --no-implementation-order`.
function runAggregate({ root = PROJECT_ROOT, arguments: argumentList = [], env = {} } = {}) {
  const childEnv = { ...process.env };
  for (const [name, value] of Object.entries(env)) {
    if (value === null) delete childEnv[name];
    else childEnv[name] = value;
  }

  const result = spawnSync(process.execPath, [RUNNER, `--root=${root}`, '--json', ...argumentList], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    env: childEnv,
  });
  const start = result.stdout.indexOf('{');
  assert.notEqual(
    start,
    -1,
    'the aggregate must print a JSON report. stdout: ' + result.stdout.slice(0, 500) + ' stderr: ' + result.stderr.slice(0, 500),
  );
  return { report: JSON.parse(result.stdout.slice(start)), status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** Digest a tree, so a test can prove a run wrote nothing into it. */
// [::TICKET::] PX-204 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-204 --for-spec --no-implementation-order`.
function digestTree(root) {
  const digest = createHash('sha256');
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (['node_modules', '.git', 'corpus'].includes(entry.name)) continue;
      const full = join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        digest.update(full.slice(root.length));
        digest.update(readFileSync(full));
      }
    }
  };
  walk(root);
  return digest.digest('hex');
}

const PASSING = "import { test } from 'node:test';\ntest('ok', () => {});\n";
const FAILING = "import { test } from 'node:test';\ntest('nope', () => { throw new Error('boom'); });\n";

// ===========================================================================
// Fixture-tree tests — the properties of the runner itself
// ===========================================================================

test('C001 the aggregate executes every file it discovers in a fixture tree', () => {
  const root = makeFixtureTree({
    [`${TESTS_ROOT}/unit/a.test.mjs`]: PASSING,
    [`${TESTS_ROOT}/unit/nested/b.test.mjs`]: PASSING,
    [`${TESTS_ROOT}/unit/c.test.mjs`]: PASSING,
  });
  try {
    const { report, status } = runAggregate({ root, arguments: ['--surface=project-mjs'] });

    assert.equal(report.discovered, 3);
    assert.equal(report.executed, 3);
    assert.deepEqual(report.missing, []);
    assert.equal(report.surfaces[SURFACE_NAMES.PROJECT_MJS].tests, 3);
    assert.equal(status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C002 a surface that was not asked to run is reported not-run rather than passing', () => {
  const root = makeFixtureTree({ [`${TESTS_ROOT}/unit/a.test.mjs`]: PASSING });
  try {
    const { report } = runAggregate({ root, arguments: ['--surface=project-mjs'] });
    assert.equal(report.surfaces[SURFACE_NAMES.PROJECT_JS_CJS].status, SURFACE_STATUS.NOT_RUN);
    assert.equal(report.surfaces[SURFACE_NAMES.CLAUDE_TESTS].status, SURFACE_STATUS.NOT_RUN);
    assert.notEqual(report.surfaces[SURFACE_NAMES.PROJECT_MJS].status, SURFACE_STATUS.NOT_RUN);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C002 a failing test makes the surface fail and the run exit non-zero', () => {
  const root = makeFixtureTree({
    [`${TESTS_ROOT}/unit/a.test.mjs`]: PASSING,
    [`${TESTS_ROOT}/unit/b.test.mjs`]: FAILING,
  });
  try {
    const { report, status } = runAggregate({ root, arguments: ['--surface=project-mjs'] });
    assert.equal(report.surfaces[SURFACE_NAMES.PROJECT_MJS].status, SURFACE_STATUS.FAIL);
    assert.equal(report.surfaces[SURFACE_NAMES.PROJECT_MJS].fail, 1);
    assert.equal(status, 1);
    assert.ok(report.unexpectedFailures.length > 0, 'a failure outside the baseline must be named');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('UT-19 two consecutive runs over one fixture produce identical counts', () => {
  const root = makeFixtureTree({
    [`${TESTS_ROOT}/unit/a.test.mjs`]: PASSING,
    [`${TESTS_ROOT}/unit/b.test.mjs`]: PASSING,
  });
  try {
    const counts = (report) =>
      Object.fromEntries(
        Object.entries(report.surfaces).map(([name, surface]) => [name, [surface.files, surface.tests, surface.pass, surface.fail, surface.status]]),
      );
    const first = runAggregate({ root, arguments: ['--surface=project-mjs'] }).report;
    const second = runAggregate({ root, arguments: ['--surface=project-mjs'] }).report;
    assert.deepEqual(counts(first), counts(second));
    assert.equal(first.discovered, second.discovered);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('UT-16 a tree with neither root states that it found nothing and exits 0', () => {
  const root = mkdtempSync(join(tmpdir(), 'px204-empty-'));
  try {
    const result = spawnSync(process.execPath, [RUNNER, `--root=${root}`], { cwd: PROJECT_ROOT, encoding: 'utf8' });
    assert.equal(result.status, 0, 'an empty tree is not a failure: ' + result.stderr);
    assert.match(result.stdout + result.stderr, /(nothing|no test files)/i, 'the run must say it found nothing');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('IT-9 a new file is discovered and executed with no runner or Makefile edit', () => {
  const root = makeFixtureTree({ [`${TESTS_ROOT}/unit/a.test.mjs`]: PASSING });
  const runnerBefore = readFileSync(RUNNER, 'utf8');
  const makefileBefore = readFileSync(join(PROJECT_ROOT, 'Makefile'), 'utf8');
  try {
    writeFileSync(join(root, TESTS_ROOT, 'unit', 'added.test.mjs'), PASSING);
    const { report } = runAggregate({ root, arguments: ['--surface=project-mjs'] });
    const listed = Object.values(report.surfaces).flatMap((surface) => surface.filePaths ?? []);
    assert.ok(listed.some((file) => file.endsWith('added.test.mjs')), 'the new file must appear in the executed set');
    assert.equal(readFileSync(RUNNER, 'utf8'), runnerBefore, 'the runner must not change');
    assert.equal(readFileSync(join(PROJECT_ROOT, 'Makefile'), 'utf8'), makefileBefore, 'the Makefile must not change');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('UT-14 an unsupported extension is reported rather than silently ignored', () => {
  const root = makeFixtureTree({
    [`${TESTS_ROOT}/unit/a.test.mjs`]: PASSING,
    [`${TESTS_ROOT}/unit/b.test.ts`]: 'export {};\n',
  });
  try {
    const { report } = runAggregate({ root, arguments: ['--surface=project-mjs'] });
    assert.equal(report.discovered, 1);
    assert.deepEqual(report.unsupported.map((file) => file.split(sep).pop()), ['b.test.ts']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ===========================================================================
// Re-entrancy — a test of the aggregate cannot be run by the aggregate
// ===========================================================================

test('UT-21 a nested run sets the aggregate own tests aside and names them', () => {
  const selfTest = join(TESTS_ROOT, 'workspacify-reverse', 'integration', SELF_TEST_FILE_NAMES[0]);
  const root = makeFixtureTree({
    [selfTest]: PASSING,
    [`${TESTS_ROOT}/unit/other.test.mjs`]: PASSING,
  });
  try {
    const topLevel = runAggregate({
      root,
      arguments: ['--surface=project-mjs'],
      env: { [AGGREGATE_DEPTH_ENV]: null },
    });
    assert.equal(topLevel.report.nested, false, 'the marker must be absent for this to be a top-level run');
    assert.deepEqual(topLevel.report.selfExcluded, [], 'a top-level run must exclude nothing');
    assert.equal(topLevel.report.discovered, 2);

    const nested = runAggregate({
      root,
      arguments: ['--surface=project-mjs'],
      env: { [AGGREGATE_DEPTH_ENV]: '1' },
    });
    assert.equal(nested.report.nested, true);
    assert.deepEqual(
      nested.report.selfExcluded.map((file) => file.split(sep).pop()),
      [SELF_TEST_FILE_NAMES[0]],
      'the self test must be set aside by name',
    );
    assert.deepEqual(nested.report.missing, [], 'setting a file aside is not the same as losing it');
    assert.equal(nested.report.discovered, 1, 'the nested run executes everything else');
    assert.equal(nested.status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('UT-23 the runner consults the Node floor predicate on entry', () => {
  assert.match(readFileSync(RUNNER, 'utf8'), /assertNodeVersionSupported/, 'the runner must refuse an unsupported runtime');
});

test('UT-24 an unknown surface name is refused by name rather than ignored', () => {
  const root = makeFixtureTree({ [`${TESTS_ROOT}/unit/a.test.mjs`]: PASSING });
  try {
    const result = spawnSync(process.execPath, [RUNNER, `--root=${root}`, '--surface=not-a-surface'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0, 'an unrecognised surface must not be silently ignored');
    assert.match(result.stderr, /not-a-surface/, 'the refused name must appear in the error');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ===========================================================================
// The real repository — one run, shared by everything that needs it
// ===========================================================================

/**
 * The surfaces a run from inside this file may ask for.
 *
 * `project-mjs` is deliberately absent: it is the surface this file belongs to,
 * and naming it would make the aggregate run this file, which would run the
 * aggregate again. Asserted below so a later edit cannot reintroduce that.
 */
const REAL_RUN_SURFACES = [SURFACE_NAMES.CLAUDE_TESTS, SURFACE_NAMES.PROJECT_JS_CJS];

let realRunCache = null;

/**
 * One run over the real repository, shared by every assertion that needs it. The
 * read-only digest is taken around the first invocation, so the caller ordering
 * matters: UT-17 must run before the others read the cache.
 */
// [::TICKET::] PX-204 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-204 --for-spec --no-implementation-order`.
function realRun() {
  if (realRunCache === null) {
    realRunCache = runAggregate({
      arguments: REAL_RUN_SURFACES.map((name) => `--surface=${name}`),
    });
  }
  return realRunCache;
}

test('the real-repo run never asks for the surface this file lives in', () => {
  assert.equal(
    REAL_RUN_SURFACES.includes(SURFACE_NAMES.PROJECT_MJS),
    false,
    'naming project-mjs would nest this file inside the run it starts and pay for the suite twice',
  );
  assert.ok(REAL_RUN_SURFACES.length > 0, 'and it must still name something real to run');
});

test('UT-17 a full run over this repository writes nothing into either test tree', { timeout: 900_000 }, () => {
  const beforeLegacy = digestTree(join(PROJECT_ROOT, CLAUDE_TESTS_ROOT));
  const beforeProject = digestTree(join(PROJECT_ROOT, TESTS_ROOT));

  const { report, status } = realRun();

  assert.equal(digestTree(join(PROJECT_ROOT, CLAUDE_TESTS_ROOT)), beforeLegacy, 'the legacy surface must not be written to');
  assert.equal(
    digestTree(join(PROJECT_ROOT, TESTS_ROOT)),
    beforeProject,
    'the project surface must not be written to — note the baseline file this test reads is written by a different ticket',
  );
  assert.ok(report.discovered > 0);
  assert.equal(typeof status, 'number');
});

test('IT-5 the real run executes every file it discovered, for the surfaces it ran', { timeout: 900_000 }, () => {
  const { report } = realRun();

  const expectedForRunSet = Object.values(report.surfaces)
    .filter((surface) => surface.selected)
    .flatMap((surface) => surface.filePaths);
  assert.ok(expectedForRunSet.length > 0, 'the run set must not be empty');
  assert.equal(report.discovered, expectedForRunSet.length, 'the report must account for every file in the run set');
  assert.equal(report.executed, report.discovered, 'every discovered file must be executed');
  assert.deepEqual(report.missing, [], 'no file may be discovered and left unexecuted');
  assert.deepEqual(report.unexpected, [], 'nothing may execute that discovery did not count');
});

test('IT-6 the directories no make target reached are reached by this runner', { timeout: 900_000 }, () => {
  const { report } = realRun();
  const executed = Object.values(report.surfaces).flatMap((surface) => surface.filePaths ?? []);

  for (const directory of [
    join(TESTS_ROOT, 'rfc-graph', 'reverse'),
    join(TESTS_ROOT, 'tickets', 'reverse'),
    join(TESTS_ROOT, 'grill-me-for-rfc', 'reverse'),
  ]) {
    assert.ok(
      executed.some((file) => file.includes(directory + sep)),
      directory + ' must contribute at least one executed file to the run set',
    );
  }

  // The fourth directory is `.mjs`, so it belongs to the surface this file lives
  // in and is not executed here. Discovery still proves it is assigned rather than
  // dropped, and IT-5's arithmetic proves assignment is the only way in.
  const mjsReverse = discoverTestFiles(PROJECT_ROOT).filter((file) =>
    file.includes(join(TESTS_ROOT, 'workspacify-tree', 'reverse') + sep),
  );
  assert.equal(mjsReverse.length > 0, true, 'the .mjs reverse directory must be discovered');
  assert.equal(
    mjsReverse.every((file) => file.endsWith('.test.mjs')),
    true,
    'and every file in it must be a .mjs, which is why it is not in this run set',
  );
});

test('C003 the real run reports the PX-142 baseline and exits 0 on it', { timeout: 900_000 }, () => {
  const { report, status } = realRun();

  assert.equal(report.baselineFailures, BASELINE_FAILURE_COUNT, 'the legacy baseline must be reported as declared');
  assert.deepEqual(report.unexpectedFailures, [], 'no failure outside the baseline is permitted');
  assert.equal(status, 0, 'a run at the declared baseline must exit 0');
});
