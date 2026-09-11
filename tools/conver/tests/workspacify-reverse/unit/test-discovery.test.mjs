// @verifies C001
// @verifies C002
// @verifies C004
/**
 * test-discovery — the single definition of what a test file is, and of which
 * surface it belongs to.
 *
 * These tests assert properties of the discovery rule rather than the counts of
 * the tree as it stood on one day: the tree grows, and a test pinned to a literal
 * 307 would go red for the wrong reason and be "fixed" by editing the number.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AGGREGATE_DEPTH_ENV,
  BASELINE_FAILURE_COUNT,
  CLAUDE_TESTS_ROOT,
  EXCLUDED_DIRECTORIES,
  REQUIRED_NODE_MAJOR,
  SELF_TEST_FILE_NAMES,
  SURFACE_NAMES,
  TEST_FILE_EXTENSIONS,
  TESTS_ROOT,
  UNSUPPORTED_TEST_EXTENSIONS,
  assertNodeVersionSupported,
  buildNodeTestArgs,
  childEnvironmentFrom,
  compareDiscoveredToExecuted,
  discoverTestFiles,
  exitCodeForRun,
  findUnsupportedTestFiles,
  groupBySurface,
  isLegacySkipNotice,
  isNestedRun,
  isWithinBaseline,
  parseNodeTestTotals,
  parseLegacyFileOutput,
  partitionSelfTests,
  summariseSurface,
  unexpectedFailuresOf,
} from '../../../tests/lib/test-discovery.mjs';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** A scratch tree holding the two roots discovery walks, so a fixture is independent of this repository. */
// [::TICKET::] PX-204 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-204 --for-spec --no-implementation-order`.
function makeScratchTree(files) {
  const root = mkdtempSync(join(tmpdir(), 'px204-discovery-'));
  for (const relative of files) {
    const full = join(root, relative);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, "test('placeholder', () => {});\n");
  }
  return root;
}

// ---------------------------------------------------------------------------
// UT-1 — discovery finds every supported file beneath both roots
// ---------------------------------------------------------------------------

test('UT-1 discovery finds exactly the files an independent walk finds', () => {
  const discovered = discoverTestFiles(PROJECT_ROOT);
  const independentlyWalked = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRECTORIES.includes(entry.name)) walk(full);
      } else if (TEST_FILE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
        independentlyWalked.push(full);
      }
    }
  };
  walk(join(PROJECT_ROOT, CLAUDE_TESTS_ROOT));
  walk(join(PROJECT_ROOT, TESTS_ROOT));

  assert.ok(discovered.length > 0, 'discovery must find at least one file');
  assert.deepEqual(
    [...discovered].sort(),
    [...independentlyWalked].sort(),
    'discovery must agree with an independent walk of the same two roots',
  );
  for (const file of discovered) {
    assert.equal(isAbsolute(file), true, file + ' must be absolute');
    assert.ok(TEST_FILE_EXTENSIONS.some((extension) => file.endsWith(extension)));
  }
});

// ---------------------------------------------------------------------------
// UT-2 — the discovered set partitions into the declared surfaces
// ---------------------------------------------------------------------------

test('UT-2 the surfaces partition the discovered set and their counts sum to the total', () => {
  const discovered = discoverTestFiles(PROJECT_ROOT);
  const surfaces = groupBySurface(discovered);
  const grouped = Object.values(surfaces).flat();

  assert.deepEqual(
    Object.keys(surfaces).sort(),
    Object.values(SURFACE_NAMES).sort(),
    'every declared surface must appear, and no undeclared one',
  );
  assert.equal(grouped.length, discovered.length, 'every file must land in exactly one surface');
  assert.equal(
    Object.values(surfaces).reduce((total, files) => total + files.length, 0),
    discovered.length,
    'the surface counts must sum to the discovered total',
  );
  for (const files of Object.values(surfaces)) {
    assert.equal(new Set(files).size, files.length, 'a surface must not repeat a file');
  }
});

// ---------------------------------------------------------------------------
// UT-3 — surface assignment is decided by the path alone
// ---------------------------------------------------------------------------

test('UT-3 groupBySurface decides from the path alone', () => {
  const root = PROJECT_ROOT;
  const surfaces = groupBySurface([
    join(root, CLAUDE_TESTS_ROOT, 'hooks', 'a.test.js'),
    join(root, CLAUDE_TESTS_ROOT, 'lib', 'b.test.cjs'),
    join(root, TESTS_ROOT, 'rfc-graph', 'c.test.cjs'),
    join(root, TESTS_ROOT, 'rfc-graph', 'd.test.js'),
    join(root, TESTS_ROOT, 'workspacify-tree', 'unit', 'e.test.mjs'),
  ]);

  assert.deepEqual(surfaces[SURFACE_NAMES.CLAUDE_TESTS].map((f) => f.split(sep).pop()), ['a.test.js', 'b.test.cjs']);
  assert.deepEqual(surfaces[SURFACE_NAMES.PROJECT_JS_CJS].map((f) => f.split(sep).pop()), ['c.test.cjs', 'd.test.js']);
  assert.deepEqual(surfaces[SURFACE_NAMES.PROJECT_MJS].map((f) => f.split(sep).pop()), ['e.test.mjs']);

  const twice = groupBySurface([join(root, TESTS_ROOT, 'x', 'y.test.mjs')]);
  assert.deepEqual(
    twice,
    groupBySurface([join(root, TESTS_ROOT, 'x', 'y.test.mjs')]),
    'the same input must produce the same grouping',
  );
});

// ---------------------------------------------------------------------------
// UT-4 / UT-20 — the argv carries no directory argument
// ---------------------------------------------------------------------------

test('UT-4 buildNodeTestArgs emits --test followed by one explicit path per file', () => {
  const files = [
    join(PROJECT_ROOT, TESTS_ROOT, 'a.test.mjs'),
    join(PROJECT_ROOT, TESTS_ROOT, 'b.test.mjs'),
  ];
  const args = buildNodeTestArgs(files);

  assert.deepEqual(args, ['--test', files[0], files[1]]);
  assert.equal(args.filter((argument) => argument === '--test').length, 1, '--test appears exactly once');
  assert.deepEqual(buildNodeTestArgs([]), [], 'an empty input produces an empty argv');
});

test('UT-20 no argument built for any surface resolves to a directory', () => {
  const discovered = discoverTestFiles(PROJECT_ROOT);
  const surfaces = groupBySurface(discovered);

  for (const [name, files] of Object.entries(surfaces)) {
    // The legacy surface runs one file per child rather than under `node --test`,
    // so it has no argv of files to check.
    if (name === SURFACE_NAMES.CLAUDE_TESTS) continue;
    const args = buildNodeTestArgs(files);
    for (const argument of args.filter((value) => value !== '--test')) {
      assert.equal(statSync(argument).isDirectory(), false, argument + ' must be a file, not a directory');
    }
  }
  const everything = buildNodeTestArgs(discovered);
  assert.equal(
    everything.some((argument) => argument === join(PROJECT_ROOT, TESTS_ROOT)),
    false,
    'a bare directory is the Node 26 defect this runner must never reproduce',
  );
});

// ---------------------------------------------------------------------------
// UT-5 — the summary's arithmetic holds
// ---------------------------------------------------------------------------

test('UT-5 summariseSurface reports tests as pass plus fail', () => {
  const summary = summariseSurface({
    name: SURFACE_NAMES.PROJECT_MJS,
    files: ['a.test.mjs', 'b.test.mjs'],
    totals: { tests: 40, pass: 38, fail: 2 },
  });

  assert.equal(summary.name, SURFACE_NAMES.PROJECT_MJS);
  assert.equal(summary.files, 2);
  assert.equal(summary.tests, summary.pass + summary.fail);
  assert.equal(summary.tests, 40);
  assert.equal(summary.status, 'fail');
});

// ---------------------------------------------------------------------------
// UT-8 — a hole in the surface is named
// ---------------------------------------------------------------------------

test('UT-8 a discovered file that was not executed is named in missing[]', () => {
  const result = compareDiscoveredToExecuted(
    ['/r/a.test.mjs', '/r/b.test.mjs', '/r/vanished.test.mjs'],
    ['/r/a.test.mjs', '/r/b.test.mjs'],
  );

  assert.deepEqual(result.missing, ['/r/vanished.test.mjs']);
  assert.deepEqual(result.unexpected, []);
});

test('UT-8b an executed file that was never discovered is named in unexpected[]', () => {
  const result = compareDiscoveredToExecuted(['/r/a.test.mjs'], ['/r/a.test.mjs', '/r/ghost.test.mjs']);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.unexpected, ['/r/ghost.test.mjs']);
});

// ---------------------------------------------------------------------------
// UT-11 — the baseline is reported, not chased
// ---------------------------------------------------------------------------

test('UT-11 the declared baseline is fourteen legacy failures and they are tolerated', () => {
  assert.equal(BASELINE_FAILURE_COUNT, 14);
  assert.equal(isWithinBaseline(SURFACE_NAMES.CLAUDE_TESTS, BASELINE_FAILURE_COUNT), true);
  assert.deepEqual(
    unexpectedFailuresOf(SURFACE_NAMES.CLAUDE_TESTS, { tests: 1859, pass: 1845, fail: BASELINE_FAILURE_COUNT }),
    [],
    'a run at the declared baseline reports no unexpected failure',
  );
  assert.equal(exitCodeForRun({}), 0, 'and therefore exits 0');
});

test('UT-11b a fifteenth legacy failure is unexpected and fails the run', () => {
  assert.equal(isWithinBaseline(SURFACE_NAMES.CLAUDE_TESTS, BASELINE_FAILURE_COUNT + 1), false);
  const failures = unexpectedFailuresOf(SURFACE_NAMES.CLAUDE_TESTS, { tests: 1860, pass: 1845, fail: 15 });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /15/);
  assert.equal(exitCodeForRun({ failures }), 1);
});

test('UT-11c a failure in any other surface is unexpected at any count', () => {
  assert.equal(isWithinBaseline(SURFACE_NAMES.PROJECT_MJS, 1), false, 'the tolerance belongs to the legacy surface alone');
  const failures = unexpectedFailuresOf(SURFACE_NAMES.PROJECT_MJS, { tests: 3, pass: 2, fail: 1 });
  assert.equal(failures.length, 1);
  assert.equal(exitCodeForRun({ failures }), 1);
});

test('UT-11d a missing file fails the run even when every executed test passed', () => {
  assert.equal(exitCodeForRun({ missing: ['/r/vanished.test.mjs'] }), 1);
  assert.equal(exitCodeForRun({ unexpected: ['/r/ghost.test.mjs'] }), 1);
  assert.equal(exitCodeForRun({ unavailable: ['project-mjs: could not run'] }), 1);
});

// ---------------------------------------------------------------------------
// UT-13 — a degenerate surface states its emptiness
// ---------------------------------------------------------------------------

test('UT-13 a surface with no files is reported empty rather than passing', () => {
  const empty = summariseSurface({ name: SURFACE_NAMES.CLAUDE_TESTS, files: [], totals: null });
  assert.equal(empty.files, 0);
  assert.equal(empty.status, 'empty');
  assert.notEqual(empty.status, 'pass');
});

test('UT-13b a scratch tree with both roots present but empty discovers nothing and says so', () => {
  const root = makeScratchTree([join(CLAUDE_TESTS_ROOT, '.keep'), join(TESTS_ROOT, '.keep')]);
  try {
    assert.deepEqual(discoverTestFiles(root), []);
    const surfaces = groupBySurface(discoverTestFiles(root));
    for (const files of Object.values(surfaces)) assert.deepEqual(files, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// UT-14 — an extension the runner cannot execute is visible, not absent
// ---------------------------------------------------------------------------

test('UT-14 a .test.ts or .test.mts file is reported as unsupported rather than ignored', () => {
  assert.deepEqual([...UNSUPPORTED_TEST_EXTENSIONS].sort(), ['.test.mts', '.test.ts']);

  const root = makeScratchTree([join(TESTS_ROOT, 'a.test.mjs'), join(TESTS_ROOT, 'b.test.ts'), join(TESTS_ROOT, 'c.test.mts')]);
  try {
    const discovered = discoverTestFiles(root);
    const unsupported = findUnsupportedTestFiles(root);

    assert.deepEqual(discovered.map((f) => f.split(sep).pop()), ['a.test.mjs']);
    assert.deepEqual(unsupported.map((f) => f.split(sep).pop()).sort(), ['b.test.ts', 'c.test.mts']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// UT-16 — an empty repository is stated, not passed over
// ---------------------------------------------------------------------------

test('UT-16 a root with neither test directory discovers nothing without throwing', () => {
  const root = mkdtempSync(join(tmpdir(), 'px204-empty-'));
  try {
    assert.deepEqual(discoverTestFiles(root), []);
    assert.deepEqual(findUnsupportedTestFiles(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// UT-18 / UT-19 — no duplicate, and the result is deterministic
// ---------------------------------------------------------------------------

test('UT-18 no path appears twice in the discovered set', () => {
  const discovered = discoverTestFiles(PROJECT_ROOT);
  const occurrences = new Map();
  for (const file of discovered) occurrences.set(file, (occurrences.get(file) ?? 0) + 1);
  const duplicated = [...occurrences.entries()].filter(([, count]) => count > 1).map(([file]) => file);
  assert.deepEqual(duplicated, []);
});

test('UT-19 two consecutive discoveries produce the same result', () => {
  const first = discoverTestFiles(PROJECT_ROOT);
  const second = discoverTestFiles(PROJECT_ROOT);
  assert.deepEqual(first, second);
  assert.deepEqual(groupBySurface(first), groupBySurface(second));
});

// ---------------------------------------------------------------------------
// The Node floor — the boundary the ticket's single exception rests on
// ---------------------------------------------------------------------------

test('assertNodeVersionSupported accepts the floor and above and refuses below', () => {
  assert.equal(REQUIRED_NODE_MAJOR, 22);
  assert.doesNotThrow(() => assertNodeVersionSupported('22.0.0'));
  assert.doesNotThrow(() => assertNodeVersionSupported('26.0.0'));
  assert.throws(() => assertNodeVersionSupported('20.19.0'), /22/);
  assert.throws(() => assertNodeVersionSupported('18.20.4'), /22/);
});

// ---------------------------------------------------------------------------
// The two output parsers — node:test totals and the legacy runner's report
// ---------------------------------------------------------------------------

test('parseNodeTestTotals reads the node:test summary', () => {
  const stdout = [
    'ℹ tests 33',
    'ℹ suites 11',
    'ℹ pass 31',
    'ℹ fail 2',
    'ℹ cancelled 0',
    'ℹ skipped 0',
    'ℹ todo 0',
  ].join('\n');

  assert.deepEqual(parseNodeTestTotals(stdout), { tests: 33, pass: 31, fail: 2 });
});

test('parseNodeTestTotals reports zeroes rather than throwing when no summary is present', () => {
  assert.deepEqual(parseNodeTestTotals(''), { tests: 0, pass: 0, fail: 0 });
  assert.deepEqual(parseNodeTestTotals('not a summary'), { tests: 0, pass: 0, fail: 0 });
});

test('parseLegacyFileOutput reads every summary shape the harnesses print', () => {
  // Measured over all 63 files on 2026-09-11: five shapes are in use and no file
  // prints more than one of them. Missing any of these silently drops that file's
  // tests from the surface total.
  const shapes = [
    ['Results: Passed: 60, Failed: 0', { tests: 60, pass: 60, fail: 0 }],
    ['=== Test Results ===\nPassed: 212\nFailed: 4\nTotal:  216', { tests: 216, pass: 212, fail: 4 }],
    ['  ✓ a\n  ✓ b\n\nPassed: 22  Failed: 0', { tests: 22, pass: 22, fail: 0 }],
    ['=== Results: 8 passed, 0 failed ===', { tests: 8, pass: 8, fail: 0 }],
    ['━━━ Results: 65 passed, 0 failed ━━━', { tests: 65, pass: 65, fail: 0 }],
    ['  PASS a\n  PASS b\n\nPassed: 22', { tests: 22, pass: 22, fail: 0 }],
  ];
  for (const [output, expected] of shapes) {
    assert.deepEqual(parseLegacyFileOutput(output), expected, JSON.stringify(output));
  }
});

test('parseLegacyFileOutput takes the last summary, not the first', () => {
  // hooks/hooks.test.js writes a fixture whose contents are these two lines. A
  // first-match rule over the whole output reads the fixture as the summary and
  // reports 999 passing tests that do not exist.
  const output = [
    "  writeFixture('Passed: 999\\nFailed: 999');",
    '  ✓ a real test',
    '',
    'Results: Passed: 3, Failed: 1',
  ].join('\n');

  assert.deepEqual(parseLegacyFileOutput(output), { tests: 4, pass: 3, fail: 1 });
});

test('parseLegacyFileOutput reports zeroes rather than throwing when no summary is present', () => {
  assert.deepEqual(parseLegacyFileOutput(''), { tests: 0, pass: 0, fail: 0 });
  assert.deepEqual(parseLegacyFileOutput('some output with no summary'), { tests: 0, pass: 0, fail: 0 });
  assert.deepEqual(parseLegacyFileOutput('Results: Passed: not-a-number, Failed: 0'), { tests: 0, pass: 0, fail: 0 });
});

test('isLegacySkipNotice distinguishes a file that declined to run from one that failed', () => {
  assert.equal(isLegacySkipNotice('[warn] Skipping: build .opencode first (cd .opencode && npm run build)'), true);
  assert.equal(isLegacySkipNotice('Results: Passed: 3, Failed: 0'), false);
});

// ---------------------------------------------------------------------------
// Re-entrancy — a test that runs the suite cannot be inside the suite it runs
// ---------------------------------------------------------------------------

test('UT-21 a nested run is recognised as nested and a top-level run is not', () => {
  assert.equal(isNestedRun({}), false);
  assert.equal(isNestedRun({ [AGGREGATE_DEPTH_ENV]: undefined }), false);
  assert.equal(isNestedRun({ [AGGREGATE_DEPTH_ENV]: '1' }), true);
});

test('UT-21b a nested run sets the aggregate own tests aside and names them', () => {
  const selfTest = `/r/${TESTS_ROOT}/workspacify-reverse/integration/${SELF_TEST_FILE_NAMES[0]}`;
  const other = `/r/${TESTS_ROOT}/workspacify-reverse/integration/something-else.test.mjs`;
  const { runnable, selfExcluded } = partitionSelfTests([selfTest, other], { nested: true });

  assert.deepEqual(runnable, [other], 'the self test must not be run by a nested aggregate');
  assert.deepEqual(selfExcluded, [selfTest], 'and it must be named rather than silently dropped');
});

test('UT-21c a top-level run excludes nothing', () => {
  const selfTest = `/r/${TESTS_ROOT}/workspacify-reverse/integration/${SELF_TEST_FILE_NAMES[0]}`;
  const { runnable, selfExcluded } = partitionSelfTests([selfTest], { nested: false });

  assert.deepEqual(runnable, [selfTest]);
  assert.deepEqual(selfExcluded, []);
});

test('UT-21d the declared self-test set is non-empty and names files that exist', () => {
  assert.ok(SELF_TEST_FILE_NAMES.length > 0, 'a recursive runner with no declared self tests would recurse');
  for (const name of SELF_TEST_FILE_NAMES) {
    assert.equal(
      existsSync(join(PROJECT_ROOT, TESTS_ROOT, 'workspacify-reverse', 'integration', name)),
      true,
      name + ' must exist, or the guard is protecting nothing',
    );
  }
});

// ---------------------------------------------------------------------------
// The test-runner context must not leak into the children that are spawned
// ---------------------------------------------------------------------------

test('UT-25 a spawned surface does not inherit the test-runner context', () => {
  const child = childEnvironmentFrom({
    PATH: '/usr/bin',
    NODE_TEST_CONTEXT: 'child-v8',
    NODE_TEST_WORKER_ID: '1',
    HOME: '/home/x',
  });

  assert.equal(child.NODE_TEST_CONTEXT, undefined, 'a child that inherits this writes no summary at all');
  assert.equal(child.NODE_TEST_WORKER_ID, undefined);
  assert.equal(child.PATH, '/usr/bin', 'unrelated variables must survive');
  assert.equal(child.HOME, '/home/x');
  assert.equal(child[AGGREGATE_DEPTH_ENV], '1', 'the depth marker is still added');
});

test('UT-25b the depth marker counts up from an existing value', () => {
  assert.equal(childEnvironmentFrom({ [AGGREGATE_DEPTH_ENV]: '2' })[AGGREGATE_DEPTH_ENV], '3');
  assert.equal(childEnvironmentFrom({ [AGGREGATE_DEPTH_ENV]: 'not-a-number' })[AGGREGATE_DEPTH_ENV], '1');
});
