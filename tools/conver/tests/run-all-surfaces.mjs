#!/usr/bin/env node
/**
 * run-all-surfaces — one command that reaches every test in the repository.
 *
 * The problem this replaces: measured 2026-09-11, 307 test files lived across
 * three surfaces and no command reached all of them. The Makefile reached 112 of
 * the 120 project `.js`/`.cjs` files; the legacy runner saw 183 files and none of
 * the 124 `.mjs` ones; and the `.mjs` files were reachable only through three
 * suite runners, each with its own copy of the discovery rule.
 *
 * Three decisions shape this runner, and all of them are deliberate:
 *
 *   - Every surface is driven here, one explicit path per file, and each surface
 *     has exactly one driver. The `.claude/tests` files use a bespoke harness so
 *     each is executed directly and its own summary line is read; the `tests/`
 *     surfaces go through `node --test`. Delegating the `.claude/tests` surface to
 *     its own aggregate was tried and measured wrong: that runner walks both test
 *     roots, so the 120 project `.cjs` files were executed twice — 183 discovered
 *     and 303 executed on the same tree.
 *   - A directory is never passed as an argument. On Node 26 a directory resolves
 *     as a module and the run fails, which is why every runner in this repository
 *     passes files. `buildNodeTestArgs` is the one place that decides this.
 *   - The executed set is compared against the discovered set and the difference is
 *     reported. A file that exists but did not run is the failure this command
 *     exists to make visible, so it fails the run rather than reducing a total.
 *
 * Usage: node tests/run-all-surfaces.mjs [--root=<dir>] [--surface=<name>]... [--json] [--verbose]
 *
 *   --root      the tree to analyse; defaults to the project this runner lives in
 *   --surface   run only the named surfaces, repeatable; the rest are reported as
 *               not-run, never as passing. A caller that is itself a test of this
 *               runner must not name the surface it lives in — see the note below.
 *   --json      emit the machine-readable report instead of the Markdown one
 *   --verbose   stream each child's output even when the surface passed
 *
 * The self-test guard only excludes this runner's own tests from a *nested* run.
 * A top-level run executes them, so a test that asks for a full run of the tree it
 * lives in makes the aggregate run that test, which asks for a full run, and the
 * legacy surface is paid for twice. A caller in that position names the surfaces
 * that do not contain it.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  CLAUDE_TESTS_ROOT,
  SURFACE_NAMES,
  SURFACE_STATUS,
  TESTS_ROOT,
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
  parseNodeTestTotals,
  parseLegacyFileOutput,
  partitionSelfTests,
  summariseSurface,
  unexpectedFailuresOf,
} from './lib/test-discovery.mjs';

/** Where this runner lives, and therefore the project it analyses by default. */
const MODULE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** How long a single surface may run before it is treated as unavailable. */
const SURFACE_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * A surface the run could not produce, as opposed to one that ran and disagreed.
 * The two call for different responses — a broken instrument and a moved subject
 * — so they are never reported as the same thing.
 */
// [::TICKET::] PX-204 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-204 --for-spec --no-implementation-order`.
class SurfaceUnavailableError extends Error {}

/**
 * The environment a child surface is spawned with.
 *
 * Two adjustments, and both are needed. The test-runner markers are removed
 * because a spawned surface is a fresh run: a `node --test` grandchild that
 * inherits `NODE_TEST_CONTEXT` refuses to run and reports zero tests. The depth
 * marker is added so that an aggregate started *by* one of those tests knows it is
 * nested and sets its own tests aside rather than recursing.
 */
// [::TICKET::] PX-204 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-204 --for-spec --no-implementation-order`.
function childEnvironment() {
  return childEnvironmentFrom(process.env);
}

/** Parse the command-line options. */
// [::TICKET::] PX-204 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-204 --for-spec --no-implementation-order`.
function parseArguments(argv) {
  const selected = new Set();
  const options = { selected, json: false, verbose: false, root: MODULE_ROOT };
  for (const argument of argv) {
    if (argument.startsWith('--surface=')) selected.add(argument.slice('--surface='.length));
    else if (argument.startsWith('--root=')) options.root = argument.slice('--root='.length);
    else if (argument === '--json') options.json = true;
    else if (argument === '--verbose') options.verbose = true;
  }
  for (const name of selected) {
    if (!Object.values(SURFACE_NAMES).includes(name)) {
      throw new Error(`unknown surface "${name}"; expected one of ${Object.values(SURFACE_NAMES).join(', ')}`);
    }
  }
  if (!existsSync(options.root)) {
    throw new Error(`--root names a directory that does not exist: ${options.root}`);
  }
  return options;
}

/** Whether a surface was asked for. An empty selection means every surface. */
// [::TICKET::] PX-204 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-204 --for-spec --no-implementation-order`.
function isSelected(selected, surfaceName) {
  return selected.size === 0 || selected.has(surfaceName);
}

/**
 * Run the `.claude/tests` surface, one file per child process.
 *
 * These files use a bespoke harness rather than `node:test`, so each is executed
 * directly and its own summary line is read. Driving them here rather than
 * delegating to `.claude/tests/run-all.js` is deliberate and was measured: that
 * runner walks **both** test roots, so delegating to it while also running the
 * `project-js-cjs` surface executed those 120 files twice — 183 discovered and 303
 * executed on the same tree. One driver per surface makes the executed set equal
 * the discovered set, which is the whole point of the accounting.
 *
 * @param {string} projectRoot
 * @param {string[]} files — the surface's discovered files
 * @returns {{ totals: {tests:number,pass:number,fail:number}, executedFiles: string[], output: string }}
 */
// [::TICKET::] PX-204 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-204 --for-spec --no-implementation-order`.
function runLegacySurface(projectRoot, files) {
  const totals = { tests: 0, pass: 0, fail: 0 };
  const outputs = [];
  const skipped = [];
  const uncounted = [];

  for (const file of files) {
    const result = spawnSync(process.execPath, [file], {
      cwd: projectRoot,
      encoding: 'utf8',
      env: childEnvironment(),
      maxBuffer: 256 * 1024 * 1024,
      timeout: SURFACE_TIMEOUT_MS,
    });
    if (result.error) {
      throw new SurfaceUnavailableError(`could not start ${relativeTo(projectRoot, file)}: ${result.error.message}`);
    }

    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    outputs.push(output);
    const relativeName = relativeTo(projectRoot, file);

    // Some of these files use `node:test` rather than the bespoke harness, so both
    // summary shapes are read. Whichever the file printed is the one it meant.
    const parsed = parseLegacyFileOutput(output);
    const resolved = parsed.tests > 0 ? parsed : parseNodeTestTotals(output);

    if (resolved.tests > 0) {
      totals.tests += resolved.tests;
      totals.pass += resolved.pass;
      totals.fail += resolved.fail;
    } else if (isLegacySkipNotice(output)) {
      skipped.push(relativeName);
    } else {
      // No summary and no skip notice: the file ran and said nothing countable.
      // It is named rather than counted, because inventing a failure would be as
      // wrong as ignoring it — and a file whose result cannot be read is exactly
      // the hole this command exists to expose.
      uncounted.push(relativeName);
    }
  }

  return { totals, executedFiles: files, output: outputs.join('\n'), skipped, uncounted };
}

/** A path as a reader of the report wants it: relative to the tree being analysed. */
// [::TICKET::] PX-204 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-204 --for-spec --no-implementation-order`.
function relativeTo(projectRoot, file) {
  return file.startsWith(`${projectRoot}/`) ? file.slice(projectRoot.length + 1) : file;
}

/**
 * Run one `tests/` surface under `node --test`, one explicit path per file.
 *
 * @param {string[]} files
 * @returns {{ totals: {tests:number,pass:number,fail:number}, executedFiles: string[], output: string }}
 */
// [::TICKET::] PX-204 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-204 --for-spec --no-implementation-order`.
function runProjectSurface(projectRoot, files) {
  const args = buildNodeTestArgs(files);
  if (args.length === 0) return { totals: { tests: 0, pass: 0, fail: 0 }, executedFiles: [], output: '' };

  const result = spawnSync(process.execPath, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    env: childEnvironment(),
    maxBuffer: 512 * 1024 * 1024,
    timeout: SURFACE_TIMEOUT_MS,
  });
  if (result.error) {
    throw new SurfaceUnavailableError(`could not run node --test: ${result.error.message}`);
  }

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  return { totals: parseNodeTestTotals(output), executedFiles: files, output };
}

/** Render the report a person reads. */
// [::TICKET::] PX-204 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-204 --for-spec --no-implementation-order`.
function renderReport(report) {
  const lines = ['## Verification surface', ''];
  for (const surface of Object.values(report.surfaces)) {
    if (surface.status === SURFACE_STATUS.NOT_RUN) {
      lines.push(`- **${surface.name}** — not run (${surface.files} file(s) discovered)`);
      continue;
    }
    if (surface.status === SURFACE_STATUS.EMPTY) {
      lines.push(`- **${surface.name}** — empty (no test files found)`);
      continue;
    }
    lines.push(
      `- **${surface.name}** — ${surface.files} file(s), ${surface.tests} test(s), ${surface.pass} passed, ${surface.fail} failed`,
    );
  }
  lines.push('', `Discovered ${report.discovered} test file(s); ran ${report.executed}.`);
  if (report.skipped.length > 0) {
    lines.push(`Declined to run, reporting nothing (named, not counted as failures): ${report.skipped.join(', ')}`);
  }
  if (report.uncounted.length > 0) {
    lines.push(`**Ran without a readable result summary:** ${report.uncounted.join(', ')}`);
  }
  if (report.missing.length > 0) lines.push(`**Discovered but not executed:** ${report.missing.join(', ')}`);
  if (report.selfExcluded.length > 0) {
    lines.push(`Set aside as the aggregate's own tests, so a nested run cannot recurse: ${report.selfExcluded.join(', ')}`);
  }
  if (report.unsupported.length > 0) lines.push(`Unsupported extension, not executed: ${report.unsupported.join(', ')}`);
  if (report.unexpectedFailures.length > 0) {
    lines.push('', ...report.unexpectedFailures.map((line) => `**Unexpected:** ${line}`));
  }
  const verdict = report.exitCode === 0 ? 'pass' : 'fail';
  lines.push('', `**${verdict}**`);
  return lines.join('\n');
}

// [::TICKET::] PX-204 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-204 --for-spec --no-implementation-order`.
function main() {
  assertNodeVersionSupported(process.versions.node);

  const options = parseArguments(process.argv.slice(2));
  const nested = isNestedRun(process.env);
  const discovered = discoverTestFiles(options.root);
  const unsupported = findUnsupportedTestFiles(options.root);
  const bySurface = groupBySurface(discovered);

  const surfaces = {};
  const executedFiles = [];
  const skippedFiles = [];
  const uncountedFiles = [];
  const failures = [];
  const unavailable = [];
  const selfExcluded = [];

  for (const [surfaceName, surfaceFiles] of Object.entries(bySurface)) {
    const { runnable, selfExcluded: excluded } = partitionSelfTests(surfaceFiles, { nested });
    selfExcluded.push(...excluded);

    if (!isSelected(options.selected, surfaceName)) {
      surfaces[surfaceName] = summariseSurface({ name: surfaceName, files: runnable, totals: null, selected: false });
      continue;
    }
    // A surface with no files is not run at all. Attempting it would report a
    // zero-test pass, and a surface that passed with nothing in it reads as a
    // success — the failure mode this runner exists to remove.
    if (runnable.length === 0) {
      surfaces[surfaceName] = summariseSurface({ name: surfaceName, files: runnable, totals: null });
      continue;
    }
    try {
      const run = surfaceName === SURFACE_NAMES.CLAUDE_TESTS ? runLegacySurface(options.root, runnable) : runProjectSurface(options.root, runnable);
      surfaces[surfaceName] = summariseSurface({ name: surfaceName, files: runnable, totals: run.totals });
      executedFiles.push(...run.executedFiles);
      skippedFiles.push(...(run.skipped ?? []));
      uncountedFiles.push(...(run.uncounted ?? []));
      failures.push(...unexpectedFailuresOf(surfaceName, run.totals));
      const shouldShowOutput = options.verbose || surfaces[surfaceName].status === SURFACE_STATUS.FAIL;
      if (shouldShowOutput && run.output) {
        // With --json this goes to stderr, because stdout is the report and a
        // consumer parses it whole. A failing surface's output is full of braces;
        // mixing it in makes the document unparseable at exactly the moment the
        // caller most needs to read it.
        const stream = options.json ? process.stderr : process.stdout;
        stream.write(`${run.output}\n`);
      }
    } catch (error) {
      if (!(error instanceof SurfaceUnavailableError)) throw error;
      unavailable.push(`${surfaceName}: ${error.message}`);
      surfaces[surfaceName] = summariseSurface({ name: surfaceName, files: runnable, totals: null });
    }
  }

  // The run set is decided by what was selected, not by the resulting status: a
  // selected surface the run could not produce is also `not-run`, and dropping it
  // here would quietly remove its files from the completeness comparison.
  const ranSurfaces = Object.values(surfaces).filter((surface) => surface.selected);
  const discoveredInRunSet = ranSurfaces.reduce((total, surface) => total + surface.files, 0);
  const { missing, unexpected } = compareDiscoveredToExecuted(
    ranSurfaces.flatMap((surface) => surface.filePaths),
    executedFiles,
  );

  const baselineFailures = surfaces[SURFACE_NAMES.CLAUDE_TESTS]?.fail ?? 0;
  const exitCode = exitCodeForRun({ missing, unexpected, failures, unavailable });

  const report = {
    surfaces,
    discovered: discoveredInRunSet,
    executed: executedFiles.length,
    missing,
    unexpected,
    unsupported,
    skipped: skippedFiles,
    uncounted: uncountedFiles,
    selfExcluded,
    nested,
    baselineFailures,
    unexpectedFailures: [...failures, ...unavailable],
    unavailable,
    exitCode,
  };

  if (discovered.length === 0) {
    process.stderr.write('No test files were found beneath ' + `${CLAUDE_TESTS_ROOT} or ${TESTS_ROOT} — nothing to run.\n`);
  }

  process.stdout.write(options.json ? `${JSON.stringify(report)}\n` : `${renderReport(report)}\n`);
  process.exitCode = report.exitCode;
}

main();
