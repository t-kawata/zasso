/**
 * test-discovery — the single definition of what counts as a test file in this
 * repository, and of which surface each one belongs to.
 *
 * Why this module exists rather than a glob in each runner: measured 2026-09-11,
 * the repository held 307 test files across three surfaces and no command reached
 * all of them. The legacy runner's glob covered only `.test.js` and `.test.cjs`
 * and could not see the 124 `.mjs` files at all; the Makefile reached 112 of the
 * 120 project `.js`/`.cjs` files; and the three suite runners each carried their
 * own private copy of the same recursive walk. Three definitions of "a test file"
 * is how a file goes missing without anyone editing anything.
 *
 * The result must be treated as a frozen list: `discoverTestFiles` is called once
 * per run and the returned array is what gets executed. Re-discovering between
 * the two would allow a file created mid-run to enter the executed set without ever
 * having been counted in the discovered set, which is the hole this module exists
 * to close.
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** The two roots discovery walks, relative to a project root. */
export const TESTS_ROOT = 'tests';
export const CLAUDE_TESTS_ROOT = '.claude/tests';

/** The aggregate entry point, relative to a project root. */
export const AGGREGATE_RUNNER_PATH = 'tests/run-all-surfaces.mjs';

/**
 * Extensions the runner can execute. `.test.js` is CommonJS or ESM depending on
 * the nearest package.json, which is why it is listed beside the explicit two
 * rather than derived from them.
 */
export const TEST_FILE_EXTENSIONS = Object.freeze(['.test.js', '.test.cjs', '.test.mjs']);

/**
 * Extensions that look like tests and are not executed. Listing them makes an
 * extension the runner does not know about visible in the report instead of
 * absent from it — "we did not run it" and "it does not exist" are different
 * statements and must not print the same.
 */
export const UNSUPPORTED_TEST_EXTENSIONS = Object.freeze(['.test.ts', '.test.mts']);

/** Directories never descended into, whatever they contain. */
export const EXCLUDED_DIRECTORIES = Object.freeze(['node_modules', '.git', 'corpus', 'dist']);

/** The three surfaces, in the order the report presents them. */
export const SURFACE_NAMES = Object.freeze({
  CLAUDE_TESTS: 'claude-tests',
  PROJECT_JS_CJS: 'project-js-cjs',
  PROJECT_MJS: 'project-mjs',
});

/** Terminal states a surface can report. `empty` and `not-run` are not successes. */
export const SURFACE_STATUS = Object.freeze({
  PASS: 'pass',
  FAIL: 'fail',
  EMPTY: 'empty',
  NOT_RUN: 'not-run',
});

/**
 * The Node floor. `node --test` gained its module-mock flag and its current
 * discovery semantics across the 20→22 boundary, so a run below it would produce
 * a surface this runner cannot describe honestly.
 */
export const REQUIRED_NODE_MAJOR = 22;

/**
 * The failures `.claude/tests` is known to produce, measured 2026-09-11. They are
 * the PX-142 acceptance baseline: plugin-root resolution and hook-format
 * assertions unrelated to this runner. A run at this count is not a failure; a run
 * above it is, and the difference is reported rather than tolerated.
 */
export const BASELINE_FAILURE_COUNT = 14;

/**
 * The environment marker that tells a nested aggregate it is nested.
 *
 * The aggregate runs the `.mjs` surface, and a test in that surface runs the
 * aggregate. Without a guard that is unbounded recursion: the child spawns a
 * grandchild that spawns the same child again. The marker is how a run knows it is
 * inside another run.
 */
export const AGGREGATE_DEPTH_ENV = 'CONVER_AGGREGATE_DEPTH';

/**
 * The tests that invoke the aggregate, and therefore cannot be run by it.
 *
 * Declared rather than inferred: a file enters this list by being a test of the
 * aggregate, which is a fact about the file's purpose and not something derivable
 * from its contents. A nested run sets these aside and names them in the report,
 * because a file that is excluded silently is indistinguishable from a file that
 * was forgotten — the failure mode this whole ticket exists to remove.
 */
export const SELF_TEST_FILE_NAMES = Object.freeze(['verification-surface.test.mjs']);

/**
 * Whether this process was started by another aggregate.
 *
 * @param {Record<string, string|undefined>} env — usually `process.env`
 * @returns {boolean}
 */
export function isNestedRun(env) {
  return env?.[AGGREGATE_DEPTH_ENV] !== undefined;
}

/**
 * Variables `node --test` sets in the processes it starts, which must not be
 * passed on to a surface this runner spawns.
 *
 * Measured 2026-09-11: a `node --test` child inherits `NODE_TEST_CONTEXT`, and a
 * grandchild that inherits it prints "node:test run() is being called recursively
 * within a test file. skipping running files." and executes nothing. The surface
 * then reports zero tests, which reads as an empty suite rather than as a broken
 * instrument — so the marker is removed rather than tolerated.
 */
export const INHERITED_TEST_RUNNER_VARIABLES = Object.freeze(['NODE_TEST_CONTEXT', 'NODE_TEST_WORKER_ID']);

/**
 * The environment a spawned surface runs with.
 *
 * A spawned surface is a fresh run, not a nested one: it must not think it is
 * already inside a test runner. The aggregate's own depth marker is added here for
 * the opposite reason — so that an aggregate started *by* a test knows it is
 * nested and sets its own tests aside.
 *
 * @param {Record<string, string|undefined>} env — usually `process.env`
 * @returns {Record<string, string|undefined>}
 */
export function childEnvironmentFrom(env) {
  const child = { ...env };
  for (const variable of INHERITED_TEST_RUNNER_VARIABLES) delete child[variable];
  const depth = Number.parseInt(child[AGGREGATE_DEPTH_ENV] ?? '0', 10);
  child[AGGREGATE_DEPTH_ENV] = String(Number.isInteger(depth) && depth >= 0 ? depth + 1 : 1);
  return child;
}

/**
 * Split a surface's files into those this run may execute and the aggregate's own
 * tests, which only a top-level run may execute.
 *
 * @param {string[]} files — the surface's discovered files
 * @param {{ nested: boolean }} context
 * @returns {{ runnable: string[], selfExcluded: string[] }}
 */
export function partitionSelfTests(files, { nested }) {
  if (!nested) return { runnable: [...files], selfExcluded: [] };
  const isSelfTest = (file) => SELF_TEST_FILE_NAMES.some((name) => file.endsWith(`/${name}`) || file.endsWith(name));
  return {
    runnable: files.filter((file) => !isSelfTest(file)),
    selfExcluded: files.filter(isSelfTest),
  };
}

/**
 * Refuse to run below the declared Node floor.
 *
 * A pure predicate over the version string, so the boundary is testable without a
 * second runtime being installed — the single item this ticket records as an
 * exception.
 *
 * @param {string} version — a `process.versions.node` style string, e.g. "26.0.0"
 * @throws {Error} naming the required major version when the installed one is below it
 */
export function assertNodeVersionSupported(version) {
  const major = Number.parseInt(String(version).split('.')[0], 10);
  if (!Number.isInteger(major) || major < REQUIRED_NODE_MAJOR) {
    throw new Error(
      `tests require Node.js ${REQUIRED_NODE_MAJOR} or later; this process is ${version}. ` +
        `Install a supported runtime before running the test surface.`,
    );
  }
}

/**
 * Walk the given roots and collect the files whose names end in one of the given
 * extensions, as absolute paths, sorted.
 *
 * The single walk in this module. Every caller goes through it, so "a test file"
 * has one definition and `EXCLUDED_DIRECTORIES` is applied in one place.
 *
 * @param {string[]} roots — absolute directories to walk
 * @param {readonly string[]} extensions — the suffixes to collect
 * @returns {string[]} absolute file paths, sorted
 */
// [::TICKET::] PX-204 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-204 --for-spec --no-implementation-order`.
function collectFilesWithExtension(roots, extensions) {
  const found = [];

  const walk = (directory) => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      // An absent root is a stated empty result, not a failure: UT-16 asserts
      // that a tree with neither root discovers nothing rather than throwing.
      return;
    }
    for (const entry of entries) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRECTORIES.includes(entry.name)) walk(full);
      } else if (extensions.some((extension) => entry.name.endsWith(extension))) {
        found.push(full);
      }
    }
  };

  for (const root of roots) walk(root);

  return found.sort();
}

/**
 * Every test file beneath both roots.
 *
 * @param {string} projectRoot — absolute path to the repository root
 * @returns {string[]} absolute paths of files the runner can execute
 */
export function discoverTestFiles(projectRoot) {
  return collectFilesWithExtension([join(projectRoot, CLAUDE_TESTS_ROOT), join(projectRoot, TESTS_ROOT)], TEST_FILE_EXTENSIONS);
}

/**
 * Every file beneath one root whose name ends in one of the given extensions.
 *
 * Exported so the three suite runners share this walk instead of each carrying a
 * private copy of it. Three copies of the same recursive collector is how the
 * definition of "a test file" drifts by extension — which is how the 124 `.mjs`
 * files became invisible to the legacy runner's glob.
 *
 * @param {string} root — absolute directory to walk
 * @param {{ extensions?: readonly string[] }} [options]
 * @returns {string[]} absolute file paths, sorted
 */
export function collectTestFilesUnder(root, { extensions = TEST_FILE_EXTENSIONS } = {}) {
  return collectFilesWithExtension([root], extensions);
}

/**
 * Every file that looks like a test and cannot be executed.
 *
 * @param {string} projectRoot — absolute path to the repository root
 * @returns {string[]} absolute paths of files with an unsupported test extension
 */
export function findUnsupportedTestFiles(projectRoot) {
  return collectFilesWithExtension([join(projectRoot, CLAUDE_TESTS_ROOT), join(projectRoot, TESTS_ROOT)], UNSUPPORTED_TEST_EXTENSIONS);
}

/**
 * Assign each file to exactly one surface.
 *
 * A pure function of the path: the surface is decided by which root the file sits
 * under and, within `tests/`, by its extension. The `.mjs` split is not cosmetic —
 * those files are ESM and are reached by a different runner today.
 *
 * @param {string[]} files — absolute paths
 * @returns {Record<string, string[]>} surface name to its files, in SURFACE_NAMES order
 */
export function groupBySurface(files) {
  const surfaces = {
    [SURFACE_NAMES.CLAUDE_TESTS]: [],
    [SURFACE_NAMES.PROJECT_JS_CJS]: [],
    [SURFACE_NAMES.PROJECT_MJS]: [],
  };
  for (const file of files) {
    if (file.includes(`/${CLAUDE_TESTS_ROOT}/`)) {
      surfaces[SURFACE_NAMES.CLAUDE_TESTS].push(file);
    } else if (file.endsWith('.test.mjs')) {
      surfaces[SURFACE_NAMES.PROJECT_MJS].push(file);
    } else {
      surfaces[SURFACE_NAMES.PROJECT_JS_CJS].push(file);
    }
  }
  return surfaces;
}

/**
 * The argv that runs a set of files under `node --test`.
 *
 * One explicit path per file and never a directory: on Node 26 a directory
 * argument resolves as a module and the run fails, which P22-1 recorded as
 * divergence 5. Building the argv here means every caller inherits that fix.
 *
 * @param {string[]} files — absolute paths
 * @returns {string[]} `[]` for no files, otherwise `['--test', ...files]`
 */
export function buildNodeTestArgs(files) {
  return files.length === 0 ? [] : ['--test', ...files];
}

/**
 * Read the `node --test` summary.
 *
 * @param {string} stdout — the child's combined output
 * @returns {{ tests: number, pass: number, fail: number }} zeroes when no summary is present
 */
export function parseNodeTestTotals(stdout) {
  const read = (label) => {
    const match = String(stdout).match(new RegExp(`^\\u2139 ${label} (\\d+)$`, 'm'));
    return match ? Number.parseInt(match[1], 10) : 0;
  };
  return { tests: read('tests'), pass: read('pass'), fail: read('fail') };
}

/**
 * The summary shapes the `.claude/tests` harnesses actually print, measured over
 * all 63 files on 2026-09-11. Three shapes are in use and no file prints more than
 * one of them:
 *
 *   Results: Passed: 60, Failed: 0          — the most common
 *   Passed: 212 / Failed: 4 on their own lines, under a Test Results heading
 *   39 passed, 0 failed                     — lower case, one line
 */
const LEGACY_SUMMARY_PATTERNS = Object.freeze([
  // Most specific first: on a tie in position, the earlier pattern wins.
  /Results:\s*Passed:\s*(\d+),\s*Failed:\s*(\d+)/g,
  /^Passed:\s*(\d+)\s+Failed:\s*(\d+)/gm,
  /^Passed:\s*(\d+)[^\S\n]*\n(?:.*\n)*?^Failed:\s*(\d+)[^\S\n]*$/gm,
  /(\d+)\s+passed,\s*(\d+)\s+failed/gi,
  // A harness that prints only a pass count had no failures to report.
  /^Passed:\s*(\d+)[^\S\n]*$/gm,
]);

/**
 * The notice a `.claude/tests` file prints when it declines to run, such as a
 * suite that needs a build step first. Its tests did not fail — they did not run,
 * and the two must not be reported as the same thing.
 */
export const LEGACY_SKIP_PATTERN = /\[warn\]\s*Skipping:/;

/**
 * Whether a file's output says it declined to run rather than reporting results.
 *
 * @param {string} stdout
 * @returns {boolean}
 */
export function isLegacySkipNotice(stdout) {
  return LEGACY_SKIP_PATTERN.test(String(stdout));
}

/**
 * Read one legacy-harness test file's own summary.
 *
 * Each file is run on its own so the surface total is the sum of per-file
 * summaries, and a file that prints none becomes visible as a file with no count
 * rather than silently contributing nothing to a larger run.
 *
 * The match taken is the one **latest in the output**, not the first. That is not
 * a detail: `hooks/hooks.test.js` writes a fixture file whose contents are
 * `Passed: 999\nFailed: 999`, and a first-match rule over the whole output reads
 * the fixture as the summary. Every harness prints its summary last, so the last
 * match is the file's own; the fixture can only ever appear earlier.
 *
 * @param {string} stdout — one file's combined output
 * @returns {{ tests: number, pass: number, fail: number }} zeroes when no summary is present
 */
export function parseLegacyFileOutput(stdout) {
  const text = String(stdout);
  let latest = null;
  for (const pattern of LEGACY_SUMMARY_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      if (latest === null || match.index > latest.index) latest = match;
    }
  }
  if (latest === null) return { tests: 0, pass: 0, fail: 0 };
  const pass = Number.parseInt(latest[1], 10);
  // The pass-only pattern carries no second group: a harness that prints only a
  // pass count had no failures to report, which is zero and not `undefined`.
  const fail = latest[2] === undefined ? 0 : Number.parseInt(latest[2], 10);
  return { tests: pass + fail, pass, fail };
}

/**
 * Compare what discovery found against what actually ran.
 *
 * Both directions are reported. A missing file means the surface has a hole; an
 * unexpected file means something executed that was never counted, which would
 * make the totals unaccountable.
 *
 * @param {string[]} discovered — absolute paths discovery returned
 * @param {string[]} executed — absolute paths the run reported
 * @returns {{ missing: string[], unexpected: string[] }}
 */
export function compareDiscoveredToExecuted(discovered, executed) {
  const discoveredSet = new Set(discovered);
  const executedSet = new Set(executed);
  return {
    missing: discovered.filter((file) => !executedSet.has(file)),
    unexpected: executed.filter((file) => !discoveredSet.has(file)),
  };
}

/**
 * One surface's line in the report.
 *
 * @param {{ name: string, files: string[], totals: {tests:number,pass:number,fail:number}|null }} input
 * @returns {{ name: string, files: number, filePaths: string[], tests: number, pass: number, fail: number, status: string }}
 */
export function summariseSurface({ name, files, totals, selected = true }) {
  const status = !selected
    ? SURFACE_STATUS.NOT_RUN
    : files.length === 0
      ? SURFACE_STATUS.EMPTY
      : totals === null
        ? SURFACE_STATUS.NOT_RUN
        : totals.fail > 0
          ? SURFACE_STATUS.FAIL
          : SURFACE_STATUS.PASS;

  return {
    name,
    selected,
    files: files.length,
    filePaths: files,
    tests: totals?.tests ?? 0,
    pass: totals?.pass ?? 0,
    fail: totals?.fail ?? 0,
    status,
  };
}

/**
 * Whether a surface's failure count is the one the repository has accepted.
 *
 * The tolerance belongs to the legacy surface alone. A failure in any other
 * surface is unexpected by definition, because those surfaces are green today and
 * a green suite that goes red is the signal this whole runner exists to carry.
 *
 * @param {string} surfaceName
 * @param {number} failCount
 * @returns {boolean}
 */
export function isWithinBaseline(surfaceName, failCount) {
  return surfaceName === SURFACE_NAMES.CLAUDE_TESTS && failCount <= BASELINE_FAILURE_COUNT;
}

/**
 * The failures a surface reported that the declared baseline does not account for.
 *
 * @param {string} surfaceName
 * @param {{tests:number,pass:number,fail:number}|null} totals
 * @returns {string[]} one entry per surface with an unaccounted failure, empty otherwise
 */
export function unexpectedFailuresOf(surfaceName, totals) {
  if (totals === null || totals.fail === 0) return [];
  if (isWithinBaseline(surfaceName, totals.fail)) return [];
  const tolerated = surfaceName === SURFACE_NAMES.CLAUDE_TESTS ? ` (baseline ${BASELINE_FAILURE_COUNT})` : '';
  return [`${surfaceName} reported ${totals.fail} failing test(s)${tolerated}`];
}

/**
 * The run's exit code.
 *
 * Every one of these is a problem with the run rather than with the code under
 * test, and each fails it: a file discovered but not executed, a file executed but
 * never counted, a surface whose failure the baseline does not account for, and a
 * surface the run could not produce at all. The legacy baseline is already
 * excluded upstream by `unexpectedFailuresOf`, so anything reaching `failures`
 * here is by construction unaccounted for.
 *
 * A hole in the surface fails the run even when every executed test passed: an
 * incomplete run that reports success is the failure mode this whole ticket
 * removes.
 *
 * @param {{ missing?: string[], unexpected?: string[], failures?: string[], unavailable?: string[] }} input
 * @returns {0|1}
 */
export function exitCodeForRun({ missing = [], unexpected = [], failures = [], unavailable = [] } = {}) {
  return missing.length + unexpected.length + failures.length + unavailable.length > 0 ? 1 : 0;
}

/**
 * Whether a path is a file rather than a directory, used by tests that assert the
 * argv carries no directory argument.
 *
 * @param {string} path
 * @returns {boolean}
 */
export function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
