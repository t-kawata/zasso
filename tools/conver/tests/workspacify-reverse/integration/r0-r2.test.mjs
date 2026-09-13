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
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { analyzeProject, classifyArtefacts, resolveScope } from '../../../.claude/scripts/workspacify-reverse/lib/scope.mjs';
import { checkBaselines } from '../../../.claude/scripts/workspacify-reverse/lib/regression-gate.mjs';
import {
  countBoundaryCrossings,
  measureDependencies,
} from '../../../.claude/scripts/workspacify-reverse/lib/dependencies.mjs';
import { extractSemantics } from '../../../.claude/scripts/workspacify-reverse/lib/semantics.mjs';
import { hashTree } from '../helpers/scratch.mjs';

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
function scratchOutput() {
  const root = mkdtempSync(join(os.tmpdir(), 'wsp-r0r2-it-'));
  return { root, dispose: () => rmSync(root, { recursive: true, force: true }) };
}

test('IT-1 a full run over the experiment input produces a scope file and a structure report', { skip: !targetAvailable }, () => {
  const out = scratchOutput();
  const outcome = analyzeProject({ root: REVERSE_ROOT, out: out.root , through: THROUGH_R2_5 });

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

test('IT-3 the target tree hash is unchanged by the run', { skip: !targetAvailable }, () => {
  const out = scratchOutput();
  const before = hashTree(REVERSE_ROOT);
  analyzeProject({ root: REVERSE_ROOT, out: out.root , through: THROUGH_R2_5 });
  assert.deepEqual(hashTree(REVERSE_ROOT), before, 'the analysis must leave the target byte-identical');
  out.dispose();
});

test('IT-3 the run records the target digest it took, before and after', { skip: !targetAvailable }, () => {
  const out = scratchOutput();
  analyzeProject({ root: REVERSE_ROOT, out: out.root , through: THROUGH_R2_5 });
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

test('IT a run through r2 publishes cohesion, density and boundaryCrossings, and the cohesion identity holds over the published document', () => {
  const out = scratchOutput();
  analyzeProject({ root: TWO_PACKAGE_ROOT, out: out.root, through: 'r2' });

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

test('IT the report renders the partition material as prose with file:line embedded and states the question the reader must answer', () => {
  const out = scratchOutput();
  analyzeProject({ root: TWO_PACKAGE_ROOT, out: out.root, through: 'r2' });

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

test('IT the package set the cohesion is measured over is the set findPackageCycles condenses and the set the document publishes', () => {
  const out = scratchOutput();
  analyzeProject({ root: TWO_PACKAGE_ROOT, out: out.root, through: 'r2' });

  const published = JSON.parse(readFileSync(join(out.root, 'DEPENDENCIES.json'), 'utf8'));
  assert.deepEqual(published.cohesion.rows.map((row) => row.package), published.packages);
  assert.deepEqual(published.density.population.packages, published.packages);
  assert.deepEqual(published.packages, ['src/a', 'src/b']);
  out.dispose();
});

test('IT the new keys do not perturb the edges, packages, cycles or declared modules the run already measured', () => {
  const out = scratchOutput();
  analyzeProject({ root: TWO_PACKAGE_ROOT, out: out.root, through: 'r2' });

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
