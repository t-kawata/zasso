// @verifies C001
/**
 * E12 — the three-state reachability partition.
 *
 * The partition exists to keep two facts apart that a single boolean would
 * fuse: "this is not reached" and "this reader cannot see whether it is
 * reached". Collapsing them reports a call graph's blind spots as dead code,
 * which is the F12 failure — a reader that could not look is recorded as a
 * reader that looked and found nothing.
 *
 * The population is what the syntax layer enumerated: every declaration the
 * structure measurement holds, plus one region per file the grammar could not
 * read whole. Every region lands in exactly one state, and the three counts sum
 * to the population — asserted here as the invariant the contract names.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  NOT_ANALYSABLE,
  REACHABILITY_CAVEAT,
  REACHABILITY_REASON_NO_ENTRYPOINT_PATH,
  REACHABILITY_REASON_NO_INCOMING_REFERENCE,
  REACHABILITY_REASON_PREPROCESSOR_BOUNDARY,
  REACHABILITY_REASON_SYNTAX_LAYER_CANNOT_READ,
  REACHABILITY_STATES,
  REACHABLE,
  UNREACHABLE,
  measureReachability,
  renderReachability,
} from '../../../.claude/scripts/workspacify-reverse/lib/reachability.mjs';
import { measureDependencies } from '../../../.claude/scripts/workspacify-reverse/lib/dependencies.mjs';
import { REPRESENTATIVE_ROOTS } from '../../../.claude/scripts/workspacify-reverse/lib/language-representatives.mjs';
import { measureStructure } from '../../../.claude/scripts/workspacify-reverse/lib/structure.mjs';
import { createSyntheticTree } from '../helpers/scratch.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const LIB = join(PROJECT_ROOT, '.claude', 'scripts', 'workspacify-reverse', 'lib');

/**
 * The two directories the Go case turns on.
 *
 * `main` imports `pkg/used` and nothing imports `main` or `pkg/orphan`. That is
 * the ordinary shape a static reader meets: one package with an observed
 * inbound edge, one without, and one that only an entrypoint would rescue.
 */
const GO_TREE = Object.freeze({
  'go.mod': 'module example.test/probe\n\ngo 1.22\n',
  'main.go': 'package main\n\nimport "example.test/probe/pkg/used"\n\nfunc main() { _ = used.Used() }\n',
  'pkg/used/used.go': 'package used\n\nfunc Used() int { return 1 }\n',
  'pkg/orphan/orphan.go': 'package orphan\n\nfunc Orphan() int { return 2 }\n',
});

/** The same partition read for the six languages the extraction covers. */
const SIX = Object.freeze(['rust', 'typescript', 'javascript', 'go', 'python', 'c_cpp']);

/** Every string anywhere in a value, at full depth. */
function stringsIn(value, found = []) {
  if (typeof value === 'string') { found.push(value); return found; }
  if (Array.isArray(value)) { for (const entry of value) stringsIn(entry, found); return found; }
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) stringsIn(value[key], found);
  }
  return found;
}

/** The three counts of a measurement, in the declared state order. */
function countsOf(measurement) {
  return [
    measurement.counts.reachable,
    measurement.counts.unreachable,
    measurement.counts.notAnalysable,
  ];
}

/** Measure one synthetic tree in one language. */
function measure(tree, language, entrypoints = []) {
  return measureReachability({
    language,
    structure: measureStructure({ root: tree.root }),
    dependencies: measureDependencies({ root: tree.root }),
    entrypoints,
  });
}

// ---------------------------------------------------------------------------
// C001 postcondition — an unreachable region is named, located and reasoned
// ---------------------------------------------------------------------------

test('UT: [Normal] C001 postcondition — a package nothing imports is reported unreachable with its file:line and the reason', () => {
  const tree = createSyntheticTree(GO_TREE, { prefix: 'wsp-p24-5-go-' });
  const measured = measure(tree, 'go');

  const orphan = measured.regions.find((region) => region.symbol === 'Orphan');
  assert.equal(orphan.state, UNREACHABLE);
  assert.equal(orphan.reason, REACHABILITY_REASON_NO_INCOMING_REFERENCE);
  assert.equal(orphan.file, 'pkg/orphan/orphan.go');
  assert.ok(Number.isInteger(orphan.line) && orphan.line > 0, 'an unreachable region carries its line');

  const used = measured.regions.find((region) => region.symbol === 'Used');
  assert.equal(used.state, REACHABLE, 'an inbound import edge is what makes a package reachable');
  assert.equal(used.reason, 'incoming-reference');

  tree.dispose();
});

test('UT: [Normal] C001 invariant — the three states partition the population, over the six languages', () => {
  const tree = createSyntheticTree(GO_TREE, { prefix: 'wsp-p24-5-six-' });
  for (const language of SIX) {
    const measured = measure(tree, language);
    assert.equal(
      countsOf(measured).reduce((total, count) => total + count, 0),
      measured.counts.population,
      `${language}: reachable + unreachable + not-analysable must equal the population`,
    );
    assert.equal(measured.counts.population, measured.regions.length);
    for (const region of measured.regions) {
      assert.ok(REACHABILITY_STATES.includes(region.state), `${language}: ${region.state}`);
      assert.equal(typeof region.reason, 'string');
      assert.ok(region.reason.length > 0, `${language}: an unreachable region states a reason`);
    }
  }
  tree.dispose();
});

test('UT: [Boundary] C001 invariant — a population with nothing unreachable reports an empty unreachable set with a zero count', () => {
  const tree = createSyntheticTree({
    'go.mod': 'module example.test/probe\n',
    'main.go': 'package main\n\nimport "example.test/probe/pkg/used"\n\nfunc main() { _ = used.Used() }\n',
    'pkg/used/used.go': 'package used\n\nfunc Used() int { return 1 }\n',
  }, { prefix: 'wsp-p24-5-clean-' });
  const measured = measure(tree, 'go');
  const unreachable = measured.regions.filter((region) => region.state === UNREACHABLE);

  // `main.go`'s directory has no inbound edge, so the honest answer is still
  // one unreachable region — unless the operator names it. The point of the
  // boundary is the shape, not the number: an empty set is a set, published
  // with a zero count, and distinguishable from a measurement that never ran.
  assert.equal(measured.counts.unreachable, unreachable.length);
  assert.equal(measured.counts.population > 0, true, 'a population that was measured is never empty');

  const named = measureReachability({
    language: 'go',
    structure: measureStructure({ root: tree.root }),
    dependencies: measureDependencies({ root: tree.root }),
    entrypoints: [{ file: 'main.go', reason: 'the build declares this file as its root' }],
  });
  assert.equal(named.counts.unreachable, 0, 'nothing is unreachable once the root is named');
  assert.deepEqual(named.regions.filter((region) => region.state === UNREACHABLE), []);
  assert.equal(named.counts.population, measured.counts.population, 'the population does not move with the entrypoint set');
  tree.dispose();
});

test('UT: [Boundary] C001 invariant — an empty entrypoint set states the reason it did not use rather than leaving it implied', () => {
  const tree = createSyntheticTree(GO_TREE, { prefix: 'wsp-p24-5-notes-' });
  const withoutEntrypoints = measure(tree, 'go');

  assert.deepEqual(withoutEntrypoints.entrypoints, []);
  assert.ok(
    withoutEntrypoints.notes.some((note) => note.includes(REACHABILITY_REASON_NO_ENTRYPOINT_PATH)),
    'the reason no-entrypoint-path was not exercised is published, not implied',
  );

  const withEntrypoints = measure(tree, 'go', [{ file: 'main.go', reason: 'the operator named this file' }]);
  assert.equal(withEntrypoints.entrypoints.length, 1);
  assert.equal(
    withEntrypoints.notes.some((note) => note.includes(REACHABILITY_REASON_NO_ENTRYPOINT_PATH)),
    false,
    'a reason that was available is not reported as unavailable',
  );
  tree.dispose();
});

// ---------------------------------------------------------------------------
// C001 invariant — not_analysable is never unreachable
// ---------------------------------------------------------------------------

test('UT: [Error] C001 invariant — a region the syntax layer cannot analyse is not_analysable, and the two states differ', () => {
  const tree = createSyntheticTree({
    'src/gated.cpp': '#ifdef WIDGET_EXTRA\nint extra() { return 1; }\n#endif\n',
    'src/orphan.cpp': 'int orphan() { return 2; }\n',
  }, { prefix: 'wsp-p24-5-cpp-' });
  const measured = measure(tree, 'c_cpp');

  const bySymbol = new Map(measured.regions.map((region) => [region.symbol, region]));
  assert.equal(bySymbol.get('extra').state, NOT_ANALYSABLE);
  assert.equal(bySymbol.get('extra').reason, REACHABILITY_REASON_PREPROCESSOR_BOUNDARY);
  assert.match(bySymbol.get('extra').detail, /preprocessor/i);
  assert.equal(bySymbol.get('orphan').state, UNREACHABLE);
  assert.deepEqual(
    [bySymbol.get('extra').state, bySymbol.get('orphan').state].sort(),
    [NOT_ANALYSABLE, UNREACHABLE].sort(),
    'the two cases are constructed and must produce different states',
  );
  assert.equal(countsOf(measured).reduce((total, count) => total + count, 0), measured.counts.population);
  tree.dispose();
});

test('UT: [Error] C001 invariant — a file the grammar could not read is one not_analysable region per file', () => {
  const tree = createSyntheticTree({
    'Cargo.toml': '[package]\nname = "probe"\n',
    'src/broken.rs': 'pub fn broken( { \n',
    'src/fine.rs': 'pub fn fine() -> u8 { 1 }\n',
    'src/deps.rs': 'pub use crate::fine::fine;\n',
  }, { prefix: 'wsp-p24-5-broken-' });
  const measured = measure(tree, 'rust');

  const broken = measured.regions.find((region) => region.file === 'src/broken.rs');
  assert.equal(broken.state, NOT_ANALYSABLE);
  assert.equal(broken.reason, REACHABILITY_REASON_SYNTAX_LAYER_CANNOT_READ);
  assert.equal(broken.symbol, null, 'a file the reader could not read holds no declarations to name');

  assert.equal(
    measured.regions.some((region) => region.state === UNREACHABLE && region.file === 'src/broken.rs'),
    false,
    'a blind spot is never reported as dead code',
  );
  assert.equal(countsOf(measured).reduce((total, count) => total + count, 0), measured.counts.population);
  tree.dispose();
});

test('UT: [Invariant] C001 invariant as a property — the partition holds over the six representatives and a mutated tree', () => {
  for (const language of SIX) {
    const root = join(PROJECT_ROOT, REPRESENTATIVE_ROOTS[language]);
    const measured = measureReachability({
      language,
      structure: measureStructure({ root }),
      dependencies: measureDependencies({ root }),
      entrypoints: [],
    });
    assert.equal(
      countsOf(measured).reduce((total, count) => total + count, 0),
      measured.counts.population,
      `${language}: the three states partition the population`,
    );
  }

  const mutated = createSyntheticTree({ ...GO_TREE, 'pkg/orphan/orphan.go': 'package orphan\n\nfunc Renamed() int { return 2 }\n' }, { prefix: 'wsp-p24-5-mut-' });
  const measured = measure(mutated, 'go');
  assert.equal(measured.regions.some((region) => region.symbol === 'Renamed' && region.state === UNREACHABLE), true);
  assert.equal(measured.regions.some((region) => region.symbol === 'Orphan'), false, 'the walk reads the tree it was given');
  mutated.dispose();
});

test('UT: [Invariant] C001 — the measurement carries the standing caveat and renders as Markdown with the three counts', () => {
  const tree = createSyntheticTree(GO_TREE, { prefix: 'wsp-p24-5-render-' });
  const measured = measure(tree, 'go');

  assert.equal(measured.caveat, REACHABILITY_CAVEAT);
  const rendered = renderReachability(measured);
  assert.match(rendered, /## Reachability/);
  assert.ok(rendered.includes(REACHABILITY_CAVEAT));
  for (const state of REACHABILITY_STATES) assert.ok(rendered.includes(state), `the report names the state ${state}`);
  assert.equal(rendered.includes('pkg/orphan/orphan.go'), true, 'an unreachable region is rendered with its location');
  for (const string of stringsIn(measured)) {
    assert.equal(/\bdead code\b/i.test(string), false, 'the measurement states reachability, never deadness');
  }
  tree.dispose();
});

test('UT: [Error] C001 precondition — a measurement with no structure or no dependencies is refused rather than guessed at', () => {
  assert.throws(
    () => measureReachability({ language: 'go', structure: null, dependencies: {} }),
    /structure/,
  );
  assert.throws(
    () => measureReachability({ language: 'go', structure: { attempts: [], packages: [], publicItems: [], types: [], errorTypes: [], modules: [] }, dependencies: null }),
    /dependencies/,
  );
  assert.throws(() => measureReachability({ language: '', structure: {}, dependencies: {} }), /language/);

  // The reading is language-agnostic by design: it decides from the edges and
  // packages it was given, and refuses a language only when it was given none.
  // A name this module does not special-case is measured, not rejected — the
  // alternative would be a language list living here, which is the drift the
  // one-table rule exists to prevent.
  const unknown = measureReachability({
    language: 'cobol',
    structure: { attempts: [], packages: [], publicItems: [], types: [], errorTypes: [], modules: [] },
    dependencies: { edges: [] },
  });
  assert.equal(unknown.language, 'cobol');
  assert.equal(unknown.counts.population, 0);
  assert.deepEqual(countsOf(unknown), [0, 0, 0]);
});

test('UT: [Error] C001 invariant — the module reads no grammar table and no language list of its own', () => {
  const source = readFileSync(join(LIB, 'reachability.mjs'), 'utf8');
  assert.equal(
    /GRAMMAR_BY_LANGUAGE|LANGUAGE_BY_EXTENSION/.test(source),
    false,
    'the reachability reading is decided by the measurements it is given, not by a grammar table of its own',
  );
});
