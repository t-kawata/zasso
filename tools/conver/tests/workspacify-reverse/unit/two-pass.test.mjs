// @verifies C003
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
/**
 * 7.7.1 — the 2-Pass Hybrid: vertical at the boundaries, horizontal inside.
 *
 * The subject of these tests is what each pass is *given*, because that is what
 * makes the split real. Pass 1 walks one execution path and owns the crossings
 * between packages, which is where a boundary is adjudicated. Pass 2 sweeps a
 * package's interior, and it is handed that package's own members and nothing
 * else — no dependency graph, no other package's files, no crossing to reason
 * about. Boundedness that is enforced by the shape of the input is a property;
 * boundedness that the implementation is asked to remember is a hope.
 *
 * The measurement bears this out. The R2 dependency edges are recorded at
 * directory granularity, so a package importing itself is not an edge at all:
 * all 55 measured edges cross a directory boundary and not one of them is
 * internal. A horizontal pass therefore has no edge material to be local about,
 * which is exactly why its input is the member set rather than an edge subset.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TWO_PASS_SCOPE,
  assertHorizontalScopeIsLocal,
  assertPassesPartitionMeasurement,
  buildHorizontalPass,
  buildTwoPassRun,
  buildVerticalPass,
  packagesOf,
} from '../../../.claude/scripts/workspacify-reverse/lib/two-pass.mjs';
import { owningDirectoryOf } from '../../../.claude/scripts/workspacify-reverse/lib/claim-ledger.mjs';

/** The project root this ticket is implemented in. */
const PROJECT_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** Where R1 and R2 were written by P22-4. */
const ANALYSIS_ROOT = fileURLToPath(new URL('../analysis/', import.meta.url));

/** One measured import edge, in the shape `measureDependencies` writes. */
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
function importEdge(from, to) {
  return {
    from,
    to,
    kind: 'syntactic_import',
    count: 1,
    locations: [{ file: `${from}/entry.rs`, line: 1, spelling: to }],
  };
}

/** Two packages that import each other, one that only consumes, one that stands alone. */
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
function syntheticPackages() {
  return [
    { directory: 'examples', members: ['examples/demo.rs'] },
    { directory: 'src', members: ['src/lib.rs'] },
    { directory: 'src/api', members: ['src/api/call.rs'] },
    { directory: 'src/model', members: ['src/model/account.rs'] },
  ];
}

/** The crossings among the synthetic packages. */
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
function syntheticEdges() {
  return [
    importEdge('examples', 'src'),
    importEdge('src', 'src/api'),
    importEdge('src/api', 'src/model'),
    importEdge('src/model', 'src/api'),
  ];
}

/** Read the R1 and R2 measurements P22-4 wrote. */
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
function recordedMeasurements() {
  return {
    structure: JSON.parse(readFileSync(join(ANALYSIS_ROOT, 'STRUCTURE.json'), 'utf8')),
    dependencies: JSON.parse(readFileSync(join(ANALYSIS_ROOT, 'DEPENDENCIES.json'), 'utf8')),
  };
}

/** Every member a horizontal scope sweep accounts for, in one flat list. */
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
function sweptMembers(horizontals) {
  return horizontals.flatMap((scope) => scope.members);
}

// --- C003 precondition: the run is in two-pass mode -------------------------------

test('C003 precondition: a two-pass run declares both passes', () => {
  const { structure, dependencies } = recordedMeasurements();
  const run = buildTwoPassRun({
    structure,
    dependencies,
    slice: { directories: ['src/api', 'src/model'] },
  });

  assert.equal(run.mode, 'two_pass');
  assert.ok(Object.values(TWO_PASS_SCOPE).every((pass) => run.scopes[pass] !== undefined));
  assert.equal(run.scopes.vertical.scope, TWO_PASS_SCOPE.VERTICAL);
  assert.ok(run.scopes.horizontal.length > 0);
  for (const scope of run.scopes.horizontal) {
    assert.equal(scope.scope, TWO_PASS_SCOPE.HORIZONTAL);
  }
});

test('C003 precondition: packages are read from the same measurement the module partitions', () => {
  const { structure } = recordedMeasurements();
  const packages = packagesOf(structure);

  assert.ok(packages.length > 0);
  for (const entry of packages) {
    assert.equal(typeof entry.directory, 'string');
    assert.ok(Array.isArray(entry.members), 'a package is a directory and the members the measurement placed in it');
  }
});

// --- C003 postcondition: Pass 2 remains local to a package ------------------------

test('C003 precondition: a package the measurement never placed is refused rather than swept as empty', () => {
  assert.throws(
    () => buildHorizontalPass({ packages: syntheticPackages(), packageName: 'src/invented' }),
    /src\/invented/,
    'an empty scope would satisfy the locality predicate vacuously, which is a silent pass',
  );
  assert.throws(
    () => buildTwoPassRun({ dependencies: recordedMeasurements().dependencies }),
    /R1 structure measurement/,
    'a run with nothing to sweep is not a two-pass run',
  );
});

test('C003 postcondition: a horizontal scope holds only members the measurement placed in its package', () => {
  const packages = syntheticPackages();
  const horizontal = buildHorizontalPass({ packages, packageName: 'src/api' });

  assert.equal(horizontal.scope, TWO_PASS_SCOPE.HORIZONTAL);
  assert.equal(horizontal.package, 'src/api');
  assert.deepEqual(horizontal.members, ['src/api/call.rs']);
  assert.ok(
    horizontal.members.every((member) => owningDirectoryOf(member) === 'src/api'),
    'a member of another package would make the pass unbounded',
  );
});

test('C003 postcondition: a member at the project root belongs to the root package', () => {
  assert.equal(
    owningDirectoryOf('build.rs'),
    '.',
    'a path with no separator has no directory to truncate, and `build.r` is not a package',
  );
  assert.equal(owningDirectoryOf('src/api/call.rs'), 'src/api');

  const packages = [{ directory: '.', members: ['build.rs'] }];
  assert.doesNotThrow(() => assertHorizontalScopeIsLocal(buildHorizontalPass({ packages, packageName: '.' })));
});

test('UT-11 / C003 postcondition: a horizontal scope cannot name another package at all', () => {
  const horizontal = buildHorizontalPass({ packages: syntheticPackages(), packageName: 'src/model' });

  assert.equal('edges' in horizontal, false, 'the dependency graph is never handed to Pass 2');
  assert.equal('cycles' in horizontal, false);
  assert.equal('packages' in horizontal, false);
  assert.deepEqual(
    Object.keys(horizontal).sort(),
    ['members', 'package', 'scope'],
    'the shape of the input is what keeps the pass bounded',
  );
});

test('C003 postcondition: every measured member lands in exactly one horizontal scope', () => {
  const { structure, dependencies } = recordedMeasurements();
  const run = buildTwoPassRun({ structure, dependencies, slice: null });
  const horizontal = run.scopes.horizontal;

  const swept = sweptMembers(horizontal);
  assert.equal(new Set(swept).size, swept.length, 'a member swept twice would be two passes over one file');
  assert.deepEqual(
    [...swept].sort(),
    [...run.population].sort(),
    'the horizontal sweep accounts for the whole measured population and nothing else',
  );
});

// --- C003 invariant: Pass 2 never considers interactions with other packages ------

test('UT-11 / C003 invariant: a foreign member is refused rather than quietly swept', () => {
  const foreign = {
    scope: TWO_PASS_SCOPE.HORIZONTAL,
    package: 'src/api',
    members: ['src/api/call.rs', 'src/model/account.rs'],
  };

  assert.throws(
    () => assertHorizontalScopeIsLocal(foreign),
    /src\/model\/account\.rs/,
    'the refusal names the member that left the package, so the cause is visible',
  );
});

test('C003 invariant: a well-formed horizontal scope passes the locality predicate', () => {
  const { structure } = recordedMeasurements();
  for (const scope of packagesOf(structure).map((entry) =>
    buildHorizontalPass({ packages: packagesOf(structure), packageName: entry.directory }))) {
    assert.doesNotThrow(() => assertHorizontalScopeIsLocal(scope));
  }
});

test('C003 invariant: the two passes partition the measurement', () => {
  const { structure, dependencies } = recordedMeasurements();
  const packages = packagesOf(structure);
  const edges = dependencies.edges;
  const population = packages.flatMap((entry) => entry.members);

  const vertical = buildVerticalPass({ packages, edges });
  const horizontals = packages.map((entry) =>
    buildHorizontalPass({ packages, packageName: entry.directory }));

  assert.equal(vertical.edges.length, edges.length, 'every measured edge is a crossing, so Pass 1 owns all of them');
  assert.equal(
    edges.filter((edge) => edge.from === edge.to).length,
    0,
    'the measurement records imports at directory granularity, so no edge is internal',
  );
  for (const scope of horizontals) {
    assert.equal('edges' in scope, false, 'no horizontal scope is handed an edge');
  }

  assert.doesNotThrow(() =>
    assertPassesPartitionMeasurement({ vertical, horizontals, edges, population }));
});

test('C003 invariant: a measurement the passes do not partition is refused', () => {
  const { structure, dependencies } = recordedMeasurements();
  const packages = packagesOf(structure);
  const vertical = buildVerticalPass({ packages, edges: dependencies.edges });
  const horizontals = packages.map((entry) =>
    buildHorizontalPass({ packages, packageName: entry.directory }));

  assert.throws(
    () => assertPassesPartitionMeasurement({
      vertical,
      horizontals: horizontals.slice(0, horizontals.length - 1),
      edges: dependencies.edges,
      population: packages.flatMap((entry) => entry.members),
    }),
    /member/i,
    'a sweep that skipped a package must be reported, not tolerated',
  );
});

test('C003 invariant: a slice narrows the vertical pass without widening the horizontal one', () => {
  const { structure, dependencies } = recordedMeasurements();
  const packages = packagesOf(structure);
  const whole = buildTwoPassRun({ structure, dependencies, slice: null });
  const sliced = buildTwoPassRun({ structure, dependencies, slice: { directories: ['src/api'] } });

  assert.ok(sliced.scopes.vertical.edges.length < whole.scopes.vertical.edges.length);
  assert.deepEqual(
    sliced.scopes.horizontal.map((scope) => scope.package),
    whole.scopes.horizontal.map((scope) => scope.package),
    'Pass 2 is a horizontal sweep of every package, so a vertical slice does not narrow it',
  );
});

// --- IT-3: the forward rotation is untouched --------------------------------------

test('IT-3: the forward-rotation regression gate exits 0', () => {
  const result = spawnSync(
    process.execPath,
    ['.claude/scripts/workspacify-reverse/run.mjs', 'regression', 'check'],
    { cwd: PROJECT_ROOT, encoding: 'utf8' },
  );

  assert.equal(result.status, 0, `the regression gate must pass:\n${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /proved/, 'the gate reports proved or not proved, never success');
});
