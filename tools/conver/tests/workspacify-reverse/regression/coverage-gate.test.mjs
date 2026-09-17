// @verifies C003
// [::TICKET::] P25-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-4 --for-spec --no-implementation-order`.
/**
 * coverage-gate — the reverse library's branch coverage is a gate, not a report.
 *
 * No branch coverage figure had ever been produced for this library. The project
 * standard treats an implementation whose correctness cannot be proven as invalid, so
 * the measurement is the work and the threshold is what makes it a gate.
 *
 * The ticket expected `c8` to supply it without adding a dependency. Measured
 * 2026-09-15: `node_modules/.bin/c8` does not exist and `c8` is not in
 * `devDependencies`, so using it would mean adding one. Node 26's built-in coverage
 * does the same job with no dependency at all — `--experimental-test-coverage` reports
 * branch percentages and `--test-coverage-branches=<n>` fails the run below them.
 *
 * The threshold is 80, which is the project's own stated minimum rather than the
 * measured figure. Measured 2026-09-15 over the 50 modules the library then held, on the
 * routine basis the Makefile gates: **84.51% branch**, 94.19% line, 95.29% functions.
 * Gating at the measured number would make the gate brittle against any small change;
 * gating at the standard leaves the figure as the record.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const MODULE_DIRECTORY = join(PROJECT_ROOT, '.claude/scripts/workspacify-reverse/lib');
const MAKEFILE = readFileSync(join(PROJECT_ROOT, 'Makefile'), 'utf8');

/** The library the measurement is over, and never the tests that execute it. */
const LIBRARY_GLOB = '.claude/scripts/workspacify-reverse/lib/**';

/** The project standard's minimum. Measured 2026-09-15: 88.19% branch. */
const BRANCH_COVERAGE_THRESHOLD = 80;

/** One module, chosen because its figure is known, so both directions can be asserted cheaply. */
const SAMPLE_MODULE = join(PROJECT_ROOT, '.claude/scripts/workspacify-reverse/lib/red-reconstruction.mjs');
const SAMPLE_SUITE = join(PROJECT_ROOT, 'tests/workspacify-reverse/unit/red-plan.test.mjs');

/**
 * Run the sample suite under a branch threshold, as a fresh test runner.
 *
 * `NODE_TEST_CONTEXT` marks this process as itself a test-runner child, and a
 * `node --test` started with it set refuses to run any file — it prints "run() is
 * being called recursively within a test file. skipping running files" and exits 0,
 * so a threshold that should have failed would read as passing. The variable is
 * removed rather than worked around: the child is a runner, not a nested one.
 */
// [::TICKET::] P25-4, P25-5, P25-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P25-4|P25-5|P25-6) --for-spec --no-implementation-order`.
function coverageAt(threshold) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_TEST_WORKER_ID;

  return spawnSync(process.execPath, [
    '--test',
    '--experimental-test-coverage',
    `--test-coverage-include=${SAMPLE_MODULE}`,
    `--test-coverage-branches=${threshold}`,
    SAMPLE_SUITE,
  ], { encoding: 'utf8', env });
}

test('C003 precondition: the coverage command is a target that measures the library and states the threshold it applies', () => {
  assert.match(MAKEFILE, /^test-coverage:/m, 'the coverage command is a target, so it is run rather than remembered');
  assert.ok(MAKEFILE.includes('--test-coverage-include='), 'and it scopes the measurement');
  assert.ok(
    MAKEFILE.includes(`COVERAGE_LIBRARY := ${LIBRARY_GLOB}`),
    'to the library, named once so the target cannot drift from what this test checks',
  );
  assert.ok(
    MAKEFILE.includes(`--test-coverage-branches=${BRANCH_COVERAGE_THRESHOLD}`),
    'and it states the threshold where the measurement is taken',
  );
  assert.equal(BRANCH_COVERAGE_THRESHOLD, 80, "the project standard's minimum, not the measured figure");
});

test('C003 postcondition: a figure below the threshold fails, so the number is a gate rather than a report', () => {
  // Measured 2026-09-15: that module is at 71.23% branch. Both directions are asserted,
  // because a gate nobody has watched close is a gate nobody has watched work.
  const admitted = coverageAt(70);
  assert.equal(admitted.status, 0, 'below the measured figure the run passes');

  const refused = coverageAt(95);
  assert.equal(refused.status, 1, 'above it the run fails');
  assert.match(refused.stdout, /does not meet threshold/, 'and the failure says so rather than exiting quietly');
});

// [::TICKET::] P25-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-7 --for-spec --no-implementation-order`.
// [::TICKET::] P26-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-2 --for-spec --no-implementation-order`.
test('C003 invariant: the measurement is over the library and not over the tests, and the threshold is applied rather than printed', () => {
  assert.ok(!LIBRARY_GLOB.includes('tests/'), "a glob that caught the suite would report the tests' own coverage as the library's");
  assert.match(MAKEFILE, /--test-coverage-branches=\d+/, 'the flag is present, so the number is applied');
  // Re-measured 2026-09-17 by P26-2, which added `reverse-decisions.mjs`: the gate the
  // command file's Step 5 runs. The figure is recorded rather than derived because this
  // test's subject is the Makefile's glob, and a count imported from the thing being
  // measured would agree with it by construction. `tests/conventions/installed-copy-drift.test.mjs`
  // records the same number for the copies, which is a second place it lives; the two are
  // re-measured together whenever a module is added.
  // Re-measured 2026-09-17 by P26-3, which added the five modules the Step-level
  // subcommands read: `published-set.mjs`, `inventory.mjs`, `seam.mjs`, `step-report.mjs`
  // and `decision-writing.mjs`.
  assert.equal(
    readdirSync(MODULE_DIRECTORY).filter((name) => name.endsWith('.mjs')).length,
    56,
    'the library the measurement is taken over',
  );
});
