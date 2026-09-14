// @verifies C001
// @verifies C002
// @verifies C003
/**
 * C/C++'s build database: discovery, the two counters, and the refusal to degrade.
 *
 * The design records a hard quality boundary for C/C++: with
 * `compile_commands.json`, per-translation-unit flags, working directory and
 * include conditions can be replayed; without it, the reading is an
 * approximation the analyser chose for itself. What these tests pin is that the
 * boundary is *stated* rather than crossed silently — a subject that cannot
 * supply its configuration is reported with a lowered mode and a named
 * limitation, and a subject that can is read under it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BUILD_DATABASE_LIMITATION_CODES,
  BUILD_DATABASE_MARKER,
  BUILD_DATABASE_NAMES,
  discoverBuildDatabase,
  readTranslationUnits,
  recordConfigurationUse,
} from '../../../.claude/scripts/workspacify-reverse/lib/build-database.mjs';
import {
  ANALYSIS_MODES,
  CAPABILITY_MATRIX,
  capabilityNoteFor,
  listArtefacts,
  validateLimitation,
} from '../../../.claude/scripts/workspacify-reverse/lib/analysis-tech.mjs';
import { measureDependencies } from '../../../.claude/scripts/workspacify-reverse/lib/dependencies.mjs';
import { measureStructure } from '../../../.claude/scripts/workspacify-reverse/lib/structure.mjs';
import { createSyntheticTree, hashTree } from '../helpers/scratch.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const LIB = join(PROJECT_ROOT, '.claude', 'scripts', 'workspacify-reverse', 'lib');

/** The extraction families whose conclusion the build configuration bounds. */
const EXTRACTION_ITEMS = Object.freeze([
  'E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9', 'E10', 'E11', 'E12',
]);

/** The limitation code the tree under test carries for a database it did not have. */
const ABSENT = BUILD_DATABASE_LIMITATION_CODES.absent;

/**
 * A `compile_commands.json` naming each file, as the file itself carries it.
 *
 * The recorded directory is `'.'`, which is what a database written beside the
 * build it describes commonly holds and what forces the reader to resolve a
 * relative directory against the database's own location rather than against
 * whatever directory the process happens to be in.
 */
// [::TICKET::] P24-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-6 --for-spec --no-implementation-order`.
function compileCommandsFor(files, { includePaths = ['src'], defines = [] } = {}) {
  return JSON.stringify(files.map((file) => ({
    directory: '.',
    command: ['c++', ...includePaths.map((path) => `-I${path}`), ...defines.map((name) => `-D${name}`), '-c', file].join(' '),
    file,
  })), null, 2);
}

/** A C/C++ subject whose three translation units are named by its database. */
// [::TICKET::] P24-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-6 --for-spec --no-implementation-order`.
function subjectWithDatabase() {
  const sources = ['src/widget.cpp', 'src/widget_extra.cpp', 'tests/test_widget.cpp'];
  const files = {
    'src/widget.h': 'int widget();\n',
    'src/widget.cpp': '#include "widget.h"\nint widget() { return 1; }\n',
    'src/widget_extra.cpp': 'int extra() { return 2; }\n',
    'tests/test_widget.cpp': 'int main() { return 0; }\n',
  };
  return createSyntheticTree(
    { ...files, 'compile_commands.json': compileCommandsFor(sources, { defines: ['WIDGET=1'] }) },
    { prefix: 'wsp-p24-6-db-' },
  );
}

/** A C/C++ subject that carries no database, which is the common case. */
// [::TICKET::] P24-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-6 --for-spec --no-implementation-order`.
function subjectWithoutDatabase() {
  return createSyntheticTree({
    'src/widget.h': 'int widget();\n',
    'src/widget.cpp': '#include "widget.h"\nint widget() { return 1; }\n',
  }, { prefix: 'wsp-p24-6-nodb-' });
}

/** The limitation one measurement carries for a given code, or undefined. */
// [::TICKET::] P24-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-6 --for-spec --no-implementation-order`.
function limitationFor(measurement, code) {
  return measurement.limitations.find((limitation) => limitation.code === code);
}

// ---------------------------------------------------------------------------
// C001 — discovery and the two counters
// ---------------------------------------------------------------------------

test('C001 postcondition — a database naming three units yields three records with their file, working directory, include paths and flags', () => {
  const tree = subjectWithDatabase();
  const discovered = discoverBuildDatabase({ root: tree.root, artefacts: listArtefacts(tree.root) });

  assert.equal(discovered.found, true);
  assert.equal(discovered.path, 'compile_commands.json');
  assert.equal(discovered.translationUnitCount, 3);

  const units = readTranslationUnits(discovered);
  assert.deepEqual(
    units.map((unit) => unit.file),
    ['src/widget.cpp', 'src/widget_extra.cpp', 'tests/test_widget.cpp'],
  );
  assert.deepEqual(units[0].includePaths, ['src']);
  assert.equal(units[0].compileFlags.includes('-DWIDGET=1'), true, 'the flags are carried, not summarised');
  assert.equal(units[0].workingDirectory, tree.root, 'a recorded directory is resolved against the database');
  tree.dispose();
});

test('C001 postcondition — BUILD_DATABASE_NAMES is the declared search order, with compile_commands.json first', () => {
  assert.equal(Array.isArray(BUILD_DATABASE_NAMES), true);
  assert.equal(BUILD_DATABASE_NAMES[0], 'compile_commands.json', 'the search order is data rather than a branch');
  assert.equal(BUILD_DATABASE_NAMES.every((name) => typeof name === 'string' && name.length > 0), true);
});

test('C001 invariant — configs_enumerated and configs_analyzed are reported separately, and differ', () => {
  const tree = subjectWithDatabase();
  const measured = measureStructure({ root: tree.root });

  assert.equal(measured.coverage.configs_enumerated, 1, 'one configuration was found');
  assert.equal(measured.coverage.configs_analyzed, 3, 'three translation units were analysed under it');
  assert.notEqual(
    measured.coverage.configs_enumerated,
    measured.coverage.configs_analyzed,
    'found and used are never collapsed into one figure',
  );
  tree.dispose();
});

test('C001 invariant — a declared manifest and a build database are both configurations, counted apart from the units analysed', () => {
  const tree = createSyntheticTree({
    'CMakeLists.txt': 'cmake_minimum_required(VERSION 3.16)\n',
    'src/widget.cpp': 'int widget() { return 1; }\n',
    'compile_commands.json': compileCommandsFor(['src/widget.cpp']),
  }, { prefix: 'wsp-p24-6-both-' });
  const measured = measureStructure({ root: tree.root });

  assert.equal(measured.coverage.configs_enumerated, 2, 'the manifest and the database are each a configuration');
  assert.equal(measured.coverage.configs_analyzed, 1);
  tree.dispose();
});

test('C001 postcondition — the flags are replayed, not merely recorded: the same file gains an E5 edge the database names', () => {
  const tree = createSyntheticTree({
    'include/widget.h': 'int widget();\n',
    'src/widget.cpp': '#include "widget.h"\nint widget() { return 1; }\n',
    'compile_commands.json': compileCommandsFor(['src/widget.cpp'], { includePaths: ['include'] }),
  }, { prefix: 'wsp-p24-6-replay-' });

  const structure = measureStructure({ root: tree.root });
  const configuration = discoverBuildDatabase({ root: tree.root, artefacts: listArtefacts(tree.root) });

  const without = measureDependencies({ root: tree.root, structure });
  const withDatabase = measureDependencies({ root: tree.root, structure, configuration });

  const edgesOf = (measurement) => measurement.edges
    .filter((edge) => edge.from === 'src')
    .map((edge) => edge.to)
    .sort();

  assert.deepEqual(edgesOf(without), [], 'without a recorded path the include resolves to nothing this tree holds');
  assert.deepEqual(
    edgesOf(withDatabase),
    ['include'],
    'the include resolves along the path the database records, so the flag was replayed rather than noted',
  );
  tree.dispose();
});

test('C001 invariant at the empty — a database present and naming no unit is found with a count of zero', () => {
  const tree = createSyntheticTree({
    'src/widget.cpp': 'int widget() { return 1; }\n',
    'compile_commands.json': '[]',
  }, { prefix: 'wsp-p24-6-empty-' });
  const measured = measureStructure({ root: tree.root });

  assert.equal(measured.coverage.configs_enumerated, 1, 'the file is there and is counted as found');
  assert.equal(measured.coverage.configs_analyzed, 0);
  assert.equal(measured.analysis_mode, 'syntax_only', 'a database that names nothing configures nothing');
  tree.dispose();
});

test('C001 postcondition — a database under an excluded directory is found, because the walk enumerates excluded directories rather than skipping them', () => {
  const tree = createSyntheticTree({
    'src/widget.cpp': 'int widget() { return 1; }\n',
    'target/compile_commands.json': compileCommandsFor(['src/widget.cpp']),
  }, { prefix: 'wsp-p24-6-target-' });

  const artefacts = listArtefacts(tree.root);
  const inBuildOutput = artefacts.find((artefact) => artefact.path === 'target/compile_commands.json');
  assert.ok(inBuildOutput, 'the walk records an excluded directory’s entries rather than dropping them');
  assert.equal(inBuildOutput.exclusion, true, 'it is marked out_of_scope, which is not the same as absent');
  assert.equal(
    discoverBuildDatabase({ root: tree.root, artefacts }).found,
    true,
    'a build system writes the database where its output goes',
  );
  tree.dispose();
});

test('C001 invariant — recordConfigurationUse reports the two counters it was given, without deriving one from the other', () => {
  assert.deepEqual(recordConfigurationUse({ discovered: 1, analysed: 3 }), { configsEnumerated: 1, configsAnalyzed: 3 });
  assert.deepEqual(recordConfigurationUse({ discovered: 1, analysed: 0 }), { configsEnumerated: 1, configsAnalyzed: 0 });
  assert.deepEqual(recordConfigurationUse({ discovered: 0, analysed: 0 }), { configsEnumerated: 0, configsAnalyzed: 0 });
});

// ---------------------------------------------------------------------------
// C002 — the lowered mode and the named limitation
// ---------------------------------------------------------------------------

test('C002 postcondition — a subject with no database reports syntax_only and a limitation naming the database, its scope and its effect', () => {
  const tree = subjectWithoutDatabase();
  const measured = measureStructure({ root: tree.root });

  assert.equal(measured.analysis_mode, 'syntax_only');
  const limitation = limitationFor(measured, ABSENT);
  assert.ok(limitation, 'the absence is named rather than left to a silent degradation');
  assert.equal(validateLimitation(limitation), limitation, 'the entry satisfies the existing three-field contract');
  assert.match(limitation.scope, /C\/C\+\+/);
  assert.match(limitation.effect, /include/i, 'the effect states what the conclusion loses');
  assert.match(limitation.effect, new RegExp(BUILD_DATABASE_MARKER.replace('.', '\\.')));
  tree.dispose();
});

test('C002 invariant — the mode is a function of the database record, and a path that read none cannot raise it', () => {
  const without = subjectWithoutDatabase();
  const with_ = subjectWithDatabase();

  const absent = measureStructure({ root: without.root });
  const present = measureStructure({ root: with_.root });

  assert.equal(absent.analysis_mode, 'syntax_only');
  assert.equal(present.analysis_mode, 'partial_semantic', 'a configuration that was read is a stronger claim than none');
  assert.notEqual(absent.analysis_mode, present.analysis_mode, 'the published mode is the record’s function');

  for (const measurement of [absent, present]) {
    assert.equal(ANALYSIS_MODES.includes(measurement.analysis_mode), true);
  }
  assert.notEqual(present.analysis_mode, 'configured_semantic', 'nothing resolves names, so nothing claims that much');

  without.dispose();
  with_.dispose();
});

test('C002 postcondition — validateLimitation refuses a database limitation missing any one of its three fields', () => {
  const tree = subjectWithoutDatabase();
  const complete = limitationFor(measureStructure({ root: tree.root }), ABSENT);

  assert.throws(() => validateLimitation({ ...complete, code: '' }), /code/);
  assert.throws(() => validateLimitation({ ...complete, scope: '   ' }), /scope/);
  assert.throws(() => validateLimitation({ ...complete, effect: '' }), /effect/);
  tree.dispose();
});

test('C002 postcondition — a malformed database is found-but-unreadable with its parse error, never absent', () => {
  const tree = createSyntheticTree({
    'src/widget.cpp': 'int widget() { return 1; }\n',
    'compile_commands.json': '{ this is not json',
  }, { prefix: 'wsp-p24-6-broken-' });
  const measured = measureStructure({ root: tree.root });

  const unreadable = limitationFor(measured, BUILD_DATABASE_LIMITATION_CODES.unreadable);
  assert.ok(unreadable, 'an unreadable file is not the same fact as a project that never had one');
  assert.equal(typeof unreadable.effect, 'string');
  assert.ok(unreadable.effect.length > 0);
  assert.equal(limitationFor(measured, ABSENT), undefined, 'the absent case is not also reported');
  assert.equal(measured.analysis_mode, 'syntax_only');
  tree.dispose();
});

test('C001 error — an entry naming a file outside the subject root is reported by path rather than used', () => {
  const tree = createSyntheticTree({
    'src/widget.cpp': 'int widget() { return 1; }\n',
    'compile_commands.json': JSON.stringify([
      { directory: '.', command: 'c++ -c src/widget.cpp', file: 'src/widget.cpp' },
      { directory: '.', command: 'c++ -c /somewhere/else/other.cpp', file: '/somewhere/else/other.cpp' },
    ]),
  }, { prefix: 'wsp-p24-6-outside-' });

  const discovered = discoverBuildDatabase({ root: tree.root, artefacts: listArtefacts(tree.root) });
  assert.equal(discovered.translationUnitCount, 1, 'only the unit the run can read is counted as configured');
  assert.deepEqual(discovered.unusable.map((entry) => entry.file), ['/somewhere/else/other.cpp']);
  assert.equal(typeof discovered.unusable[0].reason, 'string');
  assert.deepEqual(readTranslationUnits(discovered).map((unit) => unit.file), ['src/widget.cpp']);
  tree.dispose();
});

test('C001 error — a sibling directory whose name extends the subject root is not read as a member of it', () => {
  const tree = createSyntheticTree({
    'src/widget.cpp': 'int widget() { return 1; }\n',
  }, { prefix: 'wsp-p24-6-sibling-' });
  // A directory beside the subject whose name begins with the subject's own.
  // A prefix comparison over the root's characters accepts it; a comparison
  // against the root plus a separator does not.
  const sibling = `${tree.root.slice(tree.root.lastIndexOf('/') + 1)}-elsewhere`;
  writeFileSync(join(tree.root, 'compile_commands.json'), JSON.stringify([
    { directory: '.', command: 'c++ -c src/widget.cpp', file: 'src/widget.cpp' },
    { directory: '.', command: 'c++ -c elsewhere.cpp', file: `../${sibling}/elsewhere.cpp` },
  ]), 'utf8');

  const discovered = discoverBuildDatabase({ root: tree.root, artefacts: listArtefacts(tree.root) });
  assert.equal(discovered.translationUnitCount, 1, 'a flag set recorded for another project is not replayed here');
  assert.deepEqual(discovered.unusable.map((entry) => entry.file), [`../${sibling}/elsewhere.cpp`]);
  tree.dispose();
});

test('C002 error — reading a database that could not be read is refused rather than answered with an empty list', () => {
  const tree = createSyntheticTree({
    'src/widget.cpp': 'int widget() { return 1; }\n',
    'compile_commands.json': '{ this is not json',
  }, { prefix: 'wsp-p24-6-refuse-' });
  const discovered = discoverBuildDatabase({ root: tree.root, artefacts: listArtefacts(tree.root) });

  assert.throws(() => readTranslationUnits(discovered), /unreadable/);
  tree.dispose();
});

test('C002 invariant — a subject that carries no C/C++ is not given the C/C++ limitation', () => {
  const tree = createSyntheticTree({ 'src/lib.rs': 'pub fn shared() -> u8 { 7 }\n' }, { prefix: 'wsp-p24-6-rust-' });
  const measured = measureStructure({ root: tree.root });

  assert.equal(limitationFor(measured, ABSENT), undefined, 'a Rust subject is not bounded by a C/C++ database');
  assert.equal(measured.analysis_mode, 'syntax_only');
  tree.dispose();
});

// ---------------------------------------------------------------------------
// C003 — the cell names the boundary, the run states which side it was on
// ---------------------------------------------------------------------------

test('C003 — every c_cpp extraction cell names the build database as the boundary', () => {
  for (const item of EXTRACTION_ITEMS) {
    assert.match(
      capabilityNoteFor('c_cpp', item),
      new RegExp(BUILD_DATABASE_MARKER.replace('.', '\\.')),
      `c_cpp/${item} names the database rather than a fact true of every C/C++ run`,
    );
  }
  assert.equal(CAPABILITY_MATRIX.c_cpp.E12, 'partial');
  assert.equal(CAPABILITY_MATRIX.c_cpp.E13, 'unsupported_in_principle');
});

test('C003 invariant — the reason is the cell’s and identical across runs, while the mode is the run’s and differs', () => {
  const without = subjectWithoutDatabase();
  const with_ = subjectWithDatabase();

  const absent = measureStructure({ root: without.root });
  const present = measureStructure({ root: with_.root });

  assert.equal(capabilityNoteFor('c_cpp', 'E5'), capabilityNoteFor('c_cpp', 'E5'));
  assert.notEqual(absent.analysis_mode, present.analysis_mode, 'removing the database record changes the published mode');

  without.dispose();
  with_.dispose();
});

// ---------------------------------------------------------------------------
// Invariants — reading, not writing, and spawning nothing
// ---------------------------------------------------------------------------

test('invariant — discovery and extraction read and never write, and the subject is byte-identical afterwards', () => {
  const tree = subjectWithDatabase();
  const before = hashTree(tree.root);

  discoverBuildDatabase({ root: tree.root, artefacts: listArtefacts(tree.root) });
  measureStructure({ root: tree.root });

  assert.deepEqual(hashTree(tree.root), before);
  tree.dispose();
});

test('invariant — the discovery module spawns no process: reading the database is a file read and a JSON parse', () => {
  for (const name of ['build-database.mjs']) {
    const source = readFileSync(join(LIB, name), 'utf8');
    assert.equal(
      /node:child_process|\bexecSync\b|\bspawnSync\b|\bexecFile\b/.test(source),
      false,
      `${name} must not spawn a process; no compiler and no build system is invoked`,
    );
  }
});
