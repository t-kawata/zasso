// @verifies C001
// @verifies C002
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
/**
 * R0-R2.5 measured against the real experiment input.
 *
 * The subject is `siprs-for-reverse`: the project the reverse rotation is
 * actually run against. These tests are the ones that can fail for a reason
 * the synthetic fixtures cannot reproduce — a real crate's layout, a real
 * vendored dependency tree, and the fact that the target sits inside another
 * repository's work tree.
 *
 * The forward-rotation gate is asserted here too, because every later ticket
 * runs it after its own step and this is where a regression first becomes
 * visible.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { analyzeProject, classifyArtefacts, resolveScope } from '../../../.claude/scripts/workspacify-reverse/lib/scope.mjs';
import { checkBaselines } from '../../../.claude/scripts/workspacify-reverse/lib/regression-gate.mjs';
import { TARGET_LANGUAGES } from '../../../.claude/scripts/workspacify-reverse/lib/analysis-tech.mjs';
import { GRAMMAR_BY_LANGUAGE } from '../../../.claude/scripts/workspacify-reverse/lib/structure.mjs';
// [::TICKET::] P23-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-4 --for-spec --no-implementation-order`.
import {
  DANGER_SIGNALS,
  ELIGIBILITY_CONDITIONS,
  ELIGIBILITY_STAGE,
} from '../../../.claude/scripts/workspacify-reverse/lib/eligibility.mjs';
import {
  countBoundaryCrossings,
  measureDependencies,
} from '../../../.claude/scripts/workspacify-reverse/lib/dependencies.mjs';
import { extractSemantics } from '../../../.claude/scripts/workspacify-reverse/lib/semantics.mjs';
import { createSyntheticTree, hashTree } from '../helpers/scratch.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const REVERSE_ROOT = join(PROJECT_ROOT, 'siprs-for-reverse');
const targetAvailable = existsSync(REVERSE_ROOT);

/**
 * Where these integration runs stop.
 *
 * `analyzeProject` defaults to the last declared stage, as the command line
 * always has. These tests measure the R0 to R2.5 boundary over the real
 * experiment input, so they name where they stop rather than inheriting a
 * default that moves whenever a stage is added.
 */
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
const THROUGH_R2_5 = 'r2.5';

/** A throwaway directory to publish into, so no test writes into the project. */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
// [::TICKET::] P23-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-7 --for-spec --no-implementation-order`.
function scratchOutput() {
  const root = mkdtempSync(join(os.tmpdir(), 'wsp-r0r2-it-'));
  return { root, dispose: () => rmSync(root, { recursive: true, force: true }) };
}

test('IT-1 a full run over the experiment input produces a scope file and a structure report', { skip: !targetAvailable }, async () => {
  const out = scratchOutput();
  const outcome = await analyzeProject({ root: REVERSE_ROOT, out: out.root , through: THROUGH_R2_5 });

  assert.ok(existsSync(join(out.root, 'ANALYSIS-SCOPE.json')));
  assert.ok(existsSync(join(out.root, 'SCOPE-BOUNDARY.json')));
  assert.ok(existsSync(join(out.root, 'STRUCTURE.json')));
  assert.ok(existsSync(join(out.root, 'EXECUTION-SURFACE.json')));

  assert.ok(outcome.structure.coverage.files_parsed > 0, 'the crate must actually parse');
  assert.ok(outcome.structure.packages.length > 0);
  assert.ok(outcome.dependencies.edges.length > 0, 'a real crate has real module edges');
  assert.ok(outcome.surface.mechanisms.length > 0, 'the crate carries dynamic mechanisms');
  out.dispose();
});

test('IT-1 the artefact set matches the measured tree in both directions', { skip: !targetAvailable }, () => {
  const boundary = classifyArtefacts({ root: REVERSE_ROOT, scope: resolveScope(REVERSE_ROOT) });
  const recorded = new Set(boundary.artefacts.map((artefact) => artefact.path));

  // Direction one: nothing that exists in the tree is missing from the record.
  const missing = hashTree(REVERSE_ROOT);
  for (const path of Object.keys(missing)) {
    assert.ok(recorded.has(path), `${path} exists in the tree but is missing from the artefact record`);
  }
  // Direction two: nothing is recorded that does not exist.
  for (const path of recorded) {
    assert.ok(existsSync(join(REVERSE_ROOT, path)), `${path} is recorded but does not exist in the tree`);
  }
});

test('IT-1 the measured tree is the one the ticket names', { skip: !targetAvailable }, () => {
  const boundary = classifyArtefacts({ root: REVERSE_ROOT, scope: resolveScope(REVERSE_ROOT) });
  const rustSources = boundary.artefacts.filter(
    (artefact) => artefact.path.endsWith('.rs') && artefact.coverage === 'in_scope',
  );
  assert.equal(rustSources.length, 150, 'the ticket fixes the input at 150 .rs files outside target/');

  const vendored = boundary.artefacts.filter((artefact) => artefact.path.startsWith('vendor/'));
  assert.ok(vendored.length > 0, 'vendor/ is present and must be excluded, not ignored');
  for (const artefact of vendored) assert.equal(artefact.coverage, 'out_of_scope');

  const tests = boundary.artefacts.filter(
    (artefact) => artefact.path.startsWith('tests/') && artefact.path.endsWith('.rs'),
  );
  assert.equal(tests.length, 16, 'ten renamed verify_spec_<hash>.rs files and six originals');
  for (const artefact of tests) assert.equal(artefact.kind, 'test');
});

test('IT-1 the crate root is not mistaken for its own repository', { skip: !targetAvailable }, () => {
  const scope = resolveScope(REVERSE_ROOT);
  assert.equal(scope.target_commit.is_own_repository, false);
  assert.match(scope.target_commit.reason, /work tree|not.{0,20}its own/i);
  assert.ok(scope.target_commit.path_within_work_tree.endsWith('siprs-for-reverse'));
});

test('IT-3 the target tree hash is unchanged by the run', { skip: !targetAvailable }, async () => {
  const out = scratchOutput();
  const before = hashTree(REVERSE_ROOT);
  await analyzeProject({ root: REVERSE_ROOT, out: out.root , through: THROUGH_R2_5 });
  assert.deepEqual(hashTree(REVERSE_ROOT), before, 'the analysis must leave the target byte-identical');
  out.dispose();
});

test('IT-3 the run records the target digest it took, before and after', { skip: !targetAvailable }, async () => {
  const out = scratchOutput();
  await analyzeProject({ root: REVERSE_ROOT, out: out.root , through: THROUGH_R2_5 });
  const scope = JSON.parse(readFileSync(join(out.root, 'ANALYSIS-SCOPE.json'), 'utf8'));
  assert.ok(scope.target_digest.sha256.length === 64);
  assert.equal(scope.target_digest.unmodified, true);
  out.dispose();
});

test('IT-2 the forward rotation still reproduces every frozen value', () => {
  const result = checkBaselines({ projectRoot: PROJECT_ROOT });
  assert.equal(result.verdict, 'proved', 'no backward step may change forward-rotation behaviour');
});

// ---------------------------------------------------------------------------
// P23-2 — the partition material over a run, rather than over an argument
// ---------------------------------------------------------------------------

// @verifies C001
// @verifies C002
// @verifies C003
/**
 * The crate the partition material is measured over.
 *
 * Two packages coupled across their boundary in both directions. `src/a/mod.rs`
 * imports and calls `send` from `src/b`; `src/a/other.rs` imports from its own
 * package, which is internal coupling and not a crossing. `send` is deliberately
 * a name R3's call vocabulary reads, because a fixture whose crossing call the
 * syntax layer cannot see would prove nothing about the boundary-crossing count.
 *
 * It is a committed tree under `fixtures/` rather than a literal materialised
 * per test, so that the input every frozen count below was taken from can be
 * read and diffed by whoever has to re-derive them.
 */
// [::TICKET::] P23-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-2 --for-spec --no-implementation-order`.
const TWO_PACKAGE_ROOT = fileURLToPath(new URL('../fixtures/two-package-crate/', import.meta.url));

/**
 * The counts the two-package crate produced before this ticket's measurements
 * existed, frozen so that a change which perturbs the graph fails here.
 */
const FROZEN_EDGE_COUNT = 2;
const FROZEN_PACKAGE_COUNT = 2;
const FROZEN_CYCLE_COUNT = 1;
const FROZEN_DECLARED_MODULE_COUNT = 0;

/** The fact kinds R3 reads from a call, and therefore the call-site material. */
const CALL_SHAPED_KINDS = new Set([
  'panic',
  'assert',
  'unwrap_expect',
  'error_return',
  'io_read',
  'io_write',
  'test_expected_exception',
]);

test('IT a run through r2 publishes cohesion, density and boundaryCrossings, and the cohesion identity holds over the published document', async () => {
  const out = scratchOutput();
  await analyzeProject({ root: TWO_PACKAGE_ROOT, out: out.root, through: 'r2' });

  const published = JSON.parse(readFileSync(join(out.root, 'DEPENDENCIES.json'), 'utf8'));
  assert.ok(Array.isArray(published.cohesion.rows));
  assert.equal(typeof published.density.density, 'number');
  assert.ok(Array.isArray(published.boundaryCrossings));

  for (const row of published.cohesion.rows) {
    assert.equal(row.internalCoupling + row.externalCoupling, row.incidentEdges, `${row.package} lost an edge`);
  }

  const byPackage = Object.fromEntries(published.cohesion.rows.map((row) => [row.package, row]));
  assert.deepEqual(byPackage['src/a'].memberFiles, ['src/a/mod.rs', 'src/a/other.rs']);
  assert.equal(byPackage['src/a'].internalCoupling, 1);
  assert.equal(byPackage['src/a'].externalCoupling, 2);
  assert.equal(byPackage['src/a'].incidentEdges, 3);
  assert.equal(byPackage['src/b'].internalCoupling, 0);
  assert.equal(byPackage['src/b'].externalCoupling, 2);
  assert.equal(published.density.measuredEdges, FROZEN_EDGE_COUNT);
  assert.equal(published.density.possibleOrderedPairs, 2);

  // Both crossings exist; neither carries a call count, because R2 runs before
  // R3 and the run was told to stop there.
  assert.equal(published.boundaryCrossings.length, FROZEN_EDGE_COUNT);
  assert.ok(published.boundaryCrossings.every((row) => row.measured === false));
  assert.ok(published.boundaryCrossings.every((row) => row.callSiteCount === null));
  out.dispose();
});

test('IT the report renders the partition material as prose with file:line embedded and states the question the reader must answer', async () => {
  const out = scratchOutput();
  await analyzeProject({ root: TWO_PACKAGE_ROOT, out: out.root, through: 'r2' });

  const report = readFileSync(join(out.root, 'R0-R2-REPORT.md'), 'utf8');
  assert.match(report, /## The partition material/);
  assert.match(report, /[A-Za-z0-9_./-]+\.rs:\d+/);
  assert.match(report, /Decide whether/i);
  assert.match(report, /reads as a boundary/i);
  // The direction of every crossing is stated even when no call count exists,
  // so a crossing is never dropped for want of a measurement.
  assert.match(report, /\| `src\/a` \| `src\/b` \|/);
  assert.match(report, /\| `src\/b` \| `src\/a` \|/);
  assert.match(report, /_not measured_/);
  out.dispose();
});

test('IT the package set the cohesion is measured over is the set findPackageCycles condenses and the set the document publishes', async () => {
  const out = scratchOutput();
  await analyzeProject({ root: TWO_PACKAGE_ROOT, out: out.root, through: 'r2' });

  const published = JSON.parse(readFileSync(join(out.root, 'DEPENDENCIES.json'), 'utf8'));
  assert.deepEqual(published.cohesion.rows.map((row) => row.package), published.packages);
  assert.deepEqual(published.density.population.packages, published.packages);
  assert.deepEqual(published.packages, ['src/a', 'src/b']);
  out.dispose();
});

test('IT the new keys do not perturb the edges, packages, cycles or declared modules the run already measured', async () => {
  const out = scratchOutput();
  await analyzeProject({ root: TWO_PACKAGE_ROOT, out: out.root, through: 'r2' });

  const published = JSON.parse(readFileSync(join(out.root, 'DEPENDENCIES.json'), 'utf8'));
  assert.equal(published.edges.length, FROZEN_EDGE_COUNT);
  assert.equal(published.packages.length, FROZEN_PACKAGE_COUNT);
  assert.equal(published.cycles.length, FROZEN_CYCLE_COUNT);
  assert.equal(published.declaredModules.length, FROZEN_DECLARED_MODULE_COUNT);
  assert.equal(published.coupling_claim, 'hypothesis');
  assert.equal(published.represents_runtime_binding, false);
  out.dispose();
});

test('IT countBoundaryCrossings reads the same extraction the claim ledger reads, so a crossing R3 can see is reported as measured', () => {
  const dependencies = measureDependencies({ root: TWO_PACKAGE_ROOT });
  const semantics = extractSemantics({ root: TWO_PACKAGE_ROOT, dependencies });

  // The projection from R3's facts to call sites is the caller's, which is why
  // countBoundaryCrossings takes call sites as data rather than reading Rust syntax.
  const callSites = semantics.facts
    .filter((fact) => CALL_SHAPED_KINDS.has(fact.kind))
    .map((fact) => ({ file: fact.file, name: fact.text.split('(')[0].trim() }));

  const rows = countBoundaryCrossings({ packages: dependencies.packages, edges: dependencies.edges, callSites });

  assert.equal(rows.length, FROZEN_EDGE_COUNT);
  assert.ok(rows.every((row) => row.measured === true));
  const crossing = rows.find((row) => row.from === 'src/a' && row.to === 'src/b');
  assert.equal(crossing.callSiteCount, 1, 'the call to send() in src/a names the target of this edge');
  const unseen = rows.find((row) => row.from === 'src/b' && row.to === 'src/a');
  assert.equal(unseen.callSiteCount, 0, 'dispatch is not in R3 vocabulary, and zero is reported rather than dropped');
});

// [::TICKET::] P23-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-4 --for-spec --no-implementation-order`.
/**
 * R0's eligibility assessment, measured end to end.
 *
 * The unit suite asserts the reading; these assert the properties that only a
 * real run can show — that the document is published at the first prefix a run
 * can end in, that it is R0's output and not a later stage's, that an
 * eligibility finding never changes the published document set (design 1.2: a
 * refusal condition is the error this design exists to prevent), and that the
 * six languages the assessment names are the instrument's own declaration.
 */

/**
 * A subject every condition can be read from: a manifest whose declaration line
 * the report can cite, a document, two source directories, a test file and a
 * comment line.
 *
 * It is materialised per test rather than committed, because these assertions
 * are structural — which documents are published, which states the assessment
 * holds — and not a frozen count that has to be re-derived by hand. A committed
 * fixture would also collect conver's own provenance comments, which is churn
 * this test does not read.
 */
const ELIGIBLE_SUBJECT_FILES = Object.freeze({
  'Cargo.toml': '[package]\nname = "eligible-subject"\nversion = "0.1.0"\n',
  'README.md': '# Eligible subject\n\nWhy the boundary sits where it does.\n',
  'src/lib.rs': '//! Why these two packages and not three.\n\npub mod api;\npub mod db;\n',
  'src/api/mod.rs': 'pub mod login;\n',
  'src/api/login.rs': 'use crate::db::users::User;\n\npub fn login(user: &User) -> bool {\n    !user.name.is_empty()\n}\n',
  'src/db/mod.rs': 'pub mod users;\n',
  'src/db/users.rs': 'pub struct User {\n    pub name: String,\n}\n',
  'tests/login_test.rs': '#[test]\nfn logs_in() {\n    assert!(true);\n}\n',
});

/** The same shape with everything removed: no manifest, no tests directory, one flat file. */
const BARREN_SUBJECT_FILES = Object.freeze({
  'main.py': '# A flat subject: no manifest, no tests directory, no history of its own.\n\nprint("one file")\n',
});

/** Where the assessment's section ends and R0.5's begins. */
const ELIGIBILITY_HEADING = '## Eligibility — the conditions, read before anything runs';
const BOUNDARY_HEADING = '# R0.5 — the scope boundary';

test('IT a run through r0.5 publishes ELIGIBILITY.json and the report carries the section under R0 with file:line and what would settle an unsettled condition', async () => {
  const subject = createSyntheticTree(ELIGIBLE_SUBJECT_FILES);
  const out = scratchOutput();
  const outcome = await analyzeProject({ root: subject.root, out: out.root, through: 'r0.5' });

  const published = JSON.parse(readFileSync(join(out.root, 'ELIGIBILITY.json'), 'utf8'));
  assert.equal(published.stage, ELIGIBILITY_STAGE);
  assert.equal(published.conditions.length, ELIGIBILITY_CONDITIONS.length);
  assert.equal(published.signals.length, DANGER_SIGNALS.length);
  assert.equal(outcome.eligibility.stage, ELIGIBILITY_STAGE);

  const report = readFileSync(join(out.root, 'R0-R2-REPORT.md'), 'utf8');
  const eligibilityAt = report.indexOf(ELIGIBILITY_HEADING);
  const boundaryAt = report.indexOf(BOUNDARY_HEADING);
  assert.ok(eligibilityAt > -1, 'the report has no eligibility section');
  assert.ok(boundaryAt > eligibilityAt, 'the eligibility section is not under R0');

  const section = report.slice(eligibilityAt, boundaryAt);
  assert.match(section, /[A-Za-z0-9_./-]+\.(?:rs|toml|md):\d+/);
  assert.match(section, /would settle it/i);
  assert.match(section, /does not establish/i);
  subject.dispose();
  out.dispose();
});

test('IT a barren subject and a well-formed one publish the same document set, so an eligibility finding can never change what is published', async () => {
  const subject = createSyntheticTree(ELIGIBLE_SUBJECT_FILES);
  const barrenTree = createSyntheticTree(BARREN_SUBJECT_FILES);
  const wellFormedOut = scratchOutput();
  const barrenOut = scratchOutput();

  await analyzeProject({ root: subject.root, out: wellFormedOut.root, through: 'r0.5' });
  const barrenOutcome = await analyzeProject({ root: barrenTree.root, out: barrenOut.root, through: 'r0.5' });

  assert.deepEqual(
    readdirSync(barrenOut.root).sort(),
    readdirSync(wellFormedOut.root).sort(),
    'the published document set depends on what the assessment found',
  );
  // The run is not stopped and no later stage is skipped: R0.5 still ran.
  assert.deepEqual(barrenOutcome.stagesRun, ['r0', 'r0.5']);

  const barrenAssessment = JSON.parse(readFileSync(join(barrenOut.root, 'ELIGIBILITY.json'), 'utf8'));
  assert.deepEqual(
    barrenAssessment.conditions.map((condition) => condition.id),
    ELIGIBILITY_CONDITIONS.map((condition) => condition.id),
  );
  assert.deepEqual(
    barrenAssessment.signals.map((signal) => signal.id),
    DANGER_SIGNALS.map((signal) => signal.id),
  );
  subject.dispose();
  barrenTree.dispose();
  wellFormedOut.dispose();
  barrenOut.dispose();
});

test('IT the six languages the analysable-language condition names are the instrument\'s own declaration, so the assessment cannot drift from it', async () => {
  const subject = createSyntheticTree(ELIGIBLE_SUBJECT_FILES);
  const out = scratchOutput();
  await analyzeProject({ root: subject.root, out: out.root, through: 'r0.5' });

  const published = JSON.parse(readFileSync(join(out.root, 'ELIGIBILITY.json'), 'utf8'));
  const language = published.conditions.find((condition) => condition.id === 'main_language_analysable');

  assert.deepEqual(language.measured.languagesConsidered, [...TARGET_LANGUAGES]);
  assert.deepEqual(Object.keys(GRAMMAR_BY_LANGUAGE).sort(), [...TARGET_LANGUAGES].sort());
  assert.equal(language.state, 'established_statically');
  subject.dispose();
  out.dispose();
});

test('IT the assessment is R0\'s output: it is published at the r0.5 prefix and its states do not move when later stages run', async () => {
  const subject = createSyntheticTree(ELIGIBLE_SUBJECT_FILES);
  const shallow = scratchOutput();
  const deep = scratchOutput();

  const shallowOutcome = await analyzeProject({ root: subject.root, out: shallow.root, through: 'r0.5' });
  await analyzeProject({ root: subject.root, out: deep.root, through: 'r2' });

  assert.equal(existsSync(join(shallow.root, 'ELIGIBILITY.json')), true);
  assert.equal(shallowOutcome.stagesRun.includes('r1'), false, 'r1 must not have run in this prefix');
  assert.equal(existsSync(join(shallow.root, 'STRUCTURE.json')), false, 'the r0.5 prefix measured no structure');
  assert.equal(existsSync(join(deep.root, 'STRUCTURE.json')), true, 'the r2 run must have measured structure');

  const atR05 = JSON.parse(readFileSync(join(shallow.root, 'ELIGIBILITY.json'), 'utf8'));
  const atR2 = JSON.parse(readFileSync(join(deep.root, 'ELIGIBILITY.json'), 'utf8'));
  assert.deepEqual(
    atR05.conditions.map((condition) => condition.state),
    atR2.conditions.map((condition) => condition.state),
    'the states changed with the depth of the run, so they are not R0 facts',
  );
  assert.deepEqual(
    atR05.signals.map((signal) => signal.state),
    atR2.signals.map((signal) => signal.state),
  );
  subject.dispose();
  shallow.dispose();
  deep.dispose();
});

// ---------------------------------------------------------------------------
// R2.5's dynamic half against the real experiment input
// ---------------------------------------------------------------------------

// [::TICKET::] P23-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-6 --for-spec --no-implementation-order`.
test('IT a run through r2.5 over the experiment input publishes the coupling difference and places every mechanism', { skip: !targetAvailable }, async () => {
  const out = scratchOutput();
  try {
    await analyzeProject({ root: REVERSE_ROOT, out: out.root, through: THROUGH_R2_5 });

    const coupling = JSON.parse(readFileSync(join(out.root, 'DYNAMIC-COUPLING.json'), 'utf8'));
    const surface = JSON.parse(readFileSync(join(out.root, 'EXECUTION-SURFACE.json'), 'utf8'));

    // A 1.1 GB subject is copied into the sandbox, so the channel may legitimately
    // fail to start on a machine without the toolchain. What it may never do is
    // report an empty difference as agreement, so both branches are asserted.
    if (coupling.dynamicChannel.ran) {
      assert.equal(coupling.mechanisms.length, surface.mechanisms.length);
      assert.equal(
        coupling.difference.both.count + coupling.difference.staticOnly.count,
        surface.mechanisms.length,
        'both and staticOnly together cover the 792 mechanisms the static reading lists',
      );
    } else {
      assert.ok(coupling.dynamicChannel.reason.length > 0);
      assert.equal(coupling.mechanisms.length, 0);
      assert.match(coupling.caveat, /did not run|looked at nothing/i);
    }

    const attempts = JSON.parse(readFileSync(join(out.root, 'ANALYSIS-ATTEMPTS.json'), 'utf8'));
    assert.ok(
      attempts.rows.some((row) => row.configuration === 'sandboxed-session'),
      'the dynamic channel reports its attempt in the same ledger every other attempt lives in',
    );
    assert.equal(attempts.couldNotRunCount, 0, 'a channel that did not run is not a stage that could not run');
  } finally {
    out.dispose();
  }
});
