// The material declaration: a supplied file that answers for nothing, said out loud (PX-265).
//
// PX-264 made an unread supplied file loud — phase 4 refuses by name when no pin reads it —
// and the rule is right in purpose and too strong in effect. Its first repair, "declare a pin
// whose selector reads the file", is unavailable for most material: every census shape is
// total over the elements it claims, so a JavaScript file, a prose document or a mixed
// markdown is refused by all three, and for those the two repairs collapse into removal.
//
// This file holds the second kind of entry. A census pin names a shape that reads the file
// and the role it answers for; a material declaration carries no selector and a ground saying
// what the file is. The declaration answers for nothing — it contributes no member and borrows
// no census for any role — so the axes stay unstated and the refusal keeps its force for a file
// named by neither kind. What it buys is that a run over an existing project does not have to
// delete the record of what it was given in order to run.
//
// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
// @verifies C005
import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluateGate, unpinnedSuppliedFiles } from '../../.claude/scripts/educe-sequences/rail/gates.mjs';
import {
  SOURCE_ENTRY_KINDS,
  digestOfBytes,
  isCensusPin,
  isMaterialDeclaration,
  readArtifactSchema,
  readSpecification,
  validateArtifactShape,
} from '../../.claude/scripts/educe-sequences/rail/load.mjs';
import { buildContext, startRun } from '../../.claude/scripts/educe-sequences/rail/phases.mjs';
import { establishPins, rederiveAll } from '../../.claude/scripts/educe-sequences/rail/pins.mjs';
import { suppliedDocumentsOf, suppliedFilesOf, MATERIAL_FILE } from '../../.claude/scripts/educe-sequences/rail/supplied.mjs';
import { denominatorOf, gapsIn } from '../../.claude/scripts/sequences-slice/lib/obligation-denominator.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SPEC_SOURCE = join(PROJECT_ROOT, 'tests/educe-sequences/fixtures/spec/ledger.md');
const RUN_INPUT = JSON.parse(readFileSync(join(PROJECT_ROOT, 'tests/educe-sequences/fixtures/spec/ledger.run.json'), 'utf8'));

/** The borrowed-census fixture: the declaration, the material it names, and the artifact. */
const CENSUS_ROOT = join(PROJECT_ROOT, 'tests/educe-sequences/fixtures/census');
const CENSUS_SPEC = join(CENSUS_ROOT, 'ledger.md');
const CENSUS_SUPPLIED = join(CENSUS_ROOT, 'educe-sequences/supplied');
const CENSUS_GOLDEN = JSON.parse(readFileSync(join(CENSUS_ROOT, 'ledger-sequences.json'), 'utf8'));
const CENSUS_RUN_INPUT = JSON.parse(readFileSync(join(CENSUS_ROOT, 'ledger.run.json'), 'utf8'));

/** The census document shape: one fence whose every row carries the field. */
const REGISTRY_DOCUMENT = ['```json', '{"kind":"Admit"}', '{"kind":"Settle"}', '```', ''].join('\n');

/** The pin that names REGISTRY_DOCUMENT, in the declaration's own words. */
const REGISTRY_PIN = Object.freeze({
  name: 'registry',
  role: 'operations',
  source: 'registry.md',
  selector: { shape: 'jsonFieldRows', parameter: 'kind' },
});

/** The material a declaration answers for: a checker no census shape can read. */
const CHECKER_FILE = 'check-registry.mjs';
const CHECKER = '#!/usr/bin/env node\nconsole.log("registry completeness");\n';
const MOVED_CHECKER = '#!/usr/bin/env node\nconsole.log("registry completeness, revised");\n';

/** The declaration entry that answers for CHECKER_FILE. */
const CHECKER_DECLARATION = Object.freeze({
  name: 'checker',
  source: CHECKER_FILE,
  ground: 'the operator checker this run was given, which answers for no census',
});

/**
 * A scratch specification and its run directory.
 *
 * The declaration is the fixture's, because phase 4 also refuses an enumeration that occurs
 * nowhere — so a scratch declaration would fail the gate for a reason this file is not about.
 */
// [::TICKET::] PX-288 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-288 --for-spec --no-implementation-order`.
// [::TICKET::] PX-265, PX-266 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-265|PX-266) --for-spec --no-implementation-order`.
function scratchRun() {
  const root = mkdtempSync(join(tmpdir(), 'educe-declaration-'));
  const specPath = join(root, 'ledger.md');
  copyFileSync(SPEC_SOURCE, specPath);
  const spec = readSpecification(specPath);
  const run = startRun({ specPath, spec });
  return { root, specPath, spec, directory: run.directory, status: run.status };
}

/** The fixture declaration with the sourceEnumerations a case is about. */
// [::TICKET::] PX-265, PX-266 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-265|PX-266) --for-spec --no-implementation-order`.
function declarationWith(sourceEnumerations) {
  return { ...RUN_INPUT.declaration, sourceEnumerations };
}

/** Write the run's declaration. */
// [::TICKET::] PX-265, PX-266 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-265|PX-266) --for-spec --no-implementation-order`.
function writeDeclaration(directory, declaration) {
  writeFileSync(join(directory, 'declaration.json'), `${JSON.stringify(declaration, null, 2)}\n`);
}

/** File material beside the specification, the way an invocation's material is filed. */
// [::TICKET::] PX-265, PX-266 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-265|PX-266) --for-spec --no-implementation-order`.
function writeSupplied(directory, documents) {
  const supplied = join(directory, 'supplied');
  mkdirSync(supplied, { recursive: true });
  for (const [name, content] of Object.entries(documents)) writeFileSync(join(supplied, name), content);
}

/** One phase gate, driven the way the driver drives it. */
// [::TICKET::] PX-265, PX-266 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-265|PX-266) --for-spec --no-implementation-order`.
function evaluatePhase(phaseId, { specPath, spec, directory, status }) {
  return evaluateGate(phaseId, buildContext({ specPath, spec, run: { directory, status }, recorded: {} }));
}

/**
 * The census fixture copied into a scratch run directory, with extra material beside it.
 *
 * The fixture's own specification and its two supplied files are the base because the gates
 * that drive a run need a declaration whose enumerations occur in the document, and because a
 * run that was given material is the case this ticket is about.
 */
// [::TICKET::] PX-266 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-266 --for-spec --no-implementation-order`.
function fixtureRun(prefix, documents) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const specPath = join(root, 'ledger.md');
  copyFileSync(CENSUS_SPEC, specPath);
  const spec = readSpecification(specPath);
  const directory = join(root, 'educe-sequences');
  mkdirSync(join(directory, 'supplied'), { recursive: true });
  for (const name of readdirSync(CENSUS_SUPPLIED)) {
    copyFileSync(join(CENSUS_SUPPLIED, name), join(directory, 'supplied', name));
  }
  writeSupplied(directory, documents);
  return { specPath, spec, directory, status: startRun({ specPath, spec }).status };
}

/** The census fixture's artifact with the borrowed entries a case is about. */
// [::TICKET::] PX-265, PX-266 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-265|PX-266) --for-spec --no-implementation-order`.
function artifactWith(sourceEnumerations) {
  const artifact = structuredClone(CENSUS_GOLDEN);
  artifact.pins.sourceEnumerations = sourceEnumerations;
  return artifact;
}

/** An established declaration pin, the way the rail records one. */
// [::TICKET::] PX-265, PX-266 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-265|PX-266) --for-spec --no-implementation-order`.
function establishedDeclaration(overrides = {}) {
  const run = scratchRun();
  writeSupplied(run.directory, { [CHECKER_FILE]: CHECKER });
  const documents = suppliedDocumentsOf(run.directory);
  const pins = establishPins(run.spec.lines, declarationWith([CHECKER_DECLARATION]), documents);
  return { pins, documents, spec: run.spec, pin: { ...pins.sourceEnumerations[0], ...overrides } };
}

// ---------------------------------------------------------------------------
// C001 — the two kinds, and the partition over supplied files
// ---------------------------------------------------------------------------

test('PX-265 C001 a supplied file named by a material declaration is named and not reported', () => {
  const run = scratchRun();
  writeSupplied(run.directory, { [REGISTRY_PIN.source]: REGISTRY_DOCUMENT, [CHECKER_FILE]: CHECKER });
  const declaration = declarationWith([REGISTRY_PIN, CHECKER_DECLARATION]);
  writeDeclaration(run.directory, declaration);
  const pins = establishPins(run.spec.lines, declaration, suppliedDocumentsOf(run.directory));

  assert.deepEqual(unpinnedSuppliedFiles(run, pins.sourceEnumerations), []);

  const answered = pins.sourceEnumerations[1];
  assert.equal(answered.selector, null, 'a declaration names no shape, because no shape reads it');
  assert.equal(answered.role, null, 'a declaration answers for no role');
  assert.deepEqual(answered.members, [], 'a declaration contributes no member');
  assert.equal(answered.refusal, null);
  assert.equal(answered.ground, CHECKER_DECLARATION.ground);
  assert.equal(answered.source.sha256, digestOfBytes(Buffer.from(CHECKER, 'utf8')));
});

test('PX-265 C003 a census pin beside a declaration is established exactly as it was before', () => {
  const run = scratchRun();
  writeSupplied(run.directory, { [REGISTRY_PIN.source]: REGISTRY_DOCUMENT, [CHECKER_FILE]: CHECKER });
  const declaration = declarationWith([REGISTRY_PIN, CHECKER_DECLARATION]);
  const pins = establishPins(run.spec.lines, declaration, suppliedDocumentsOf(run.directory));

  const census = pins.sourceEnumerations[0];
  assert.deepEqual(census.selector, { shape: 'jsonFieldRows', parameter: 'kind' });
  assert.equal(census.role, 'operations');
  assert.deepEqual(census.members, ['Admit', 'Settle']);
  assert.equal(census.refusal, null);
});

test('PX-265 C001 an entry carrying neither a selector nor a ground refuses by name', () => {
  const run = scratchRun();
  writeSupplied(run.directory, { [CHECKER_FILE]: CHECKER });
  const nameless = { name: 'checker', source: CHECKER_FILE };
  const pins = establishPins(run.spec.lines, declarationWith([nameless]), suppliedDocumentsOf(run.directory));

  assert.match(pins.sourceEnumerations[0].refusal, /carries no selector and no ground/);
  assert.match(pins.sourceEnumerations[0].refusal, new RegExp(CHECKER_FILE));

  const artifact = artifactWith([{ name: 'checker', role: null, source: { file: CHECKER_FILE, sha256: null }, members: [], refusal: null }]);
  const problems = validateArtifactShape(artifact, readArtifactSchema());
  assert.equal(problems.length, 1);
  assert.equal(problems[0].pin, 'sourceEnumerations[0].ground');
  assert.match(problems[0].reason, /carries no selector and no ground/);
  assert.match(problems[0].reason, /censusPin/);
  assert.match(problems[0].reason, /materialDeclaration/);
});

test('PX-265 C001 the kind is decided by one predicate, and the vocabulary is read from the schema', () => {
  assert.deepEqual([...SOURCE_ENTRY_KINDS], ['censusPin', 'materialDeclaration']);

  assert.equal(isCensusPin({ selector: { shape: 'markedLines', parameter: 'OPERATION' } }), true);
  assert.equal(isMaterialDeclaration({ ground: 'the operator checker' }), true);
  assert.equal(isMaterialDeclaration({ selector: { shape: 'markedLines', parameter: 'x' }, ground: 'and a ground' }), false, 'a pin that reads a census is a census pin');
  assert.equal(isCensusPin({ selector: null, ground: 'the operator checker' }), false);
  assert.equal(isCensusPin({}), false);
  assert.equal(isMaterialDeclaration({}), false);
  assert.equal(isMaterialDeclaration({ ground: '   ' }), false, 'a declaration that says nothing is not a declaration');
});

test('PX-265 C001 the supplied files partition into named and reported, never both and never neither', () => {
  const run = scratchRun();
  writeSupplied(run.directory, { [REGISTRY_PIN.source]: REGISTRY_DOCUMENT, [CHECKER_FILE]: CHECKER, 'a.md': 'x\n' });
  const pins = establishPins(run.spec.lines, declarationWith([REGISTRY_PIN, CHECKER_DECLARATION]), suppliedDocumentsOf(run.directory));

  const reported = unpinnedSuppliedFiles(run, pins.sourceEnumerations);
  const named = pins.sourceEnumerations.map((pin) => pin.source.file);
  const pinnable = suppliedFilesOf(run.directory).map((file) => file.name).filter((name) => name !== MATERIAL_FILE);

  assert.deepEqual(reported, ['a.md']);
  assert.deepEqual(named.filter((name) => reported.includes(name)), [], 'a file is never both named and reported');
  assert.deepEqual([...named, ...reported].sort(), [...pinnable].sort(), 'every pinnable file is accounted for');
});

// ---------------------------------------------------------------------------
// C002 — a declaration re-derives by its digest, and contributes nothing
// ---------------------------------------------------------------------------

test('PX-265 C002 a material declaration re-derives by its digest and computes no members', () => {
  const { pins, documents, spec } = establishedDeclaration();
  const declaration = pins.sourceEnumerations[0];

  assert.deepEqual(rederiveAll(pins, spec.lines, documents), { ok: true, failures: [] });
  assert.equal(declaration.members.length, 0, 'a file of 2 lines contributes no member however many rows it carries');

  const moved = rederiveAll(pins, spec.lines, { [CHECKER_FILE]: MOVED_CHECKER });
  assert.equal(moved.ok, false);
  assert.match(moved.failures[0].reason, /digests to .*the pin records/);

  const away = rederiveAll(pins, spec.lines, {});
  assert.match(away.failures[0].reason, new RegExp(`${CHECKER_FILE.replace('.', '\\.')} is not beside this run`));
});

test('PX-265 C002 C005 a declaration recording members, or claiming a role, refuses by name', () => {
  const { pins, documents, spec } = establishedDeclaration();
  const withPin = (pin) => ({ ...pins, sourceEnumerations: [pin] });
  const declaration = pins.sourceEnumerations[0];

  const documenting = rederiveAll(withPin({ ...declaration, members: ['E-freeze-health-gate'] }), spec.lines, documents);
  assert.match(documenting.failures[0].reason, /records 1 member/);

  const claiming = rederiveAll(withPin({ ...declaration, role: 'operations' }), spec.lines, documents);
  assert.match(claiming.failures[0].reason, /borrows no census/);

  const emptied = rederiveAll(withPin({ ...declaration, ground: '   ' }), spec.lines, documents);
  assert.match(emptied.failures[0].reason, /carries no selector and no ground/);
});

test('PX-265 C001 C004 the artifact schema accepts a declaration and still refuses a kindless entry', () => {
  const schema = readArtifactSchema();

  assert.deepEqual(validateArtifactShape(CENSUS_GOLDEN, schema), [], 'the golden artifact reports nothing new');

  const declared = artifactWith([{
    name: 'checker',
    role: null,
    source: { file: CHECKER_FILE, sha256: null },
    selector: null,
    ground: 'the operator checker this run was given',
    members: [],
    refusal: null,
  }]);
  assert.deepEqual(validateArtifactShape(declared, schema), [], 'an entry with a ground and no selector is a legal artifact entry');

  const kindless = artifactWith([{ name: 'checker', role: null, source: { file: CHECKER_FILE, sha256: null }, members: [] }]);
  assert.equal(validateArtifactShape(kindless, schema).length, 1);
});

// ---------------------------------------------------------------------------
// C003 — the census pin is not disturbed
// ---------------------------------------------------------------------------

test('PX-265 C003 the ledger census pins re-derive exactly as they did before the change', () => {
  const spec = readSpecification(CENSUS_SPEC);
  const documents = suppliedDocumentsOf(join(CENSUS_ROOT, 'educe-sequences'));
  const pins = establishPins(spec.lines, CENSUS_RUN_INPUT.declaration, documents);

  assert.deepEqual(pins.sourceEnumerations[0].selector, { shape: 'jsonFieldRows', parameter: 'kind' });
  assert.equal(pins.sourceEnumerations[0].ground, undefined, 'a census pin records no ground');
  assert.deepEqual(rederiveAll(pins, spec.lines, documents), { ok: true, failures: [] });

  const wrongShape = structuredClone(pins);
  wrongShape.sourceEnumerations[0].selector.shape = 'byProximity';
  assert.match(rederiveAll(wrongShape, spec.lines, documents).failures[0].reason, /byProximity/);

  const noParameter = structuredClone(pins);
  noParameter.sourceEnumerations[0].selector.parameter = '';
  assert.match(rederiveAll(noParameter, spec.lines, documents).failures[0].reason, /needs a parameter naming what to read/);

  const extraMember = structuredClone(pins);
  extraMember.sourceEnumerations[0].members = [...extraMember.sourceEnumerations[0].members, 'Refuse'];
  assert.match(rederiveAll(extraMember, spec.lines, documents).failures[0].reason, /occurs in no row/);

  const unlisted = structuredClone(pins);
  unlisted.sourceEnumerations[0].members = [];
  assert.match(rederiveAll(unlisted, spec.lines, documents).failures[0].reason, /which the pin does not list/);
});

// ---------------------------------------------------------------------------
// C004 — an artifact written before this change loads with no new problem
// ---------------------------------------------------------------------------

test('PX-265 C004 an artifact written before this change reports no new problem', () => {
  const schema = readArtifactSchema();

  const absent = structuredClone(CENSUS_GOLDEN);
  delete absent.pins.sourceEnumerations;
  assert.deepEqual(validateArtifactShape(absent, schema), []);

  const empty = artifactWith([]);
  assert.deepEqual(validateArtifactShape(empty, schema), []);

  const withPinsOnly = artifactWith(structuredClone(CENSUS_GOLDEN.pins.sourceEnumerations));
  assert.deepEqual(validateArtifactShape(withPinsOnly, schema), []);
});

// ---------------------------------------------------------------------------
// C005 — a declaration borrows no census, so the axes stay unstated
// ---------------------------------------------------------------------------

test('PX-265 C005 a material declaration borrows no role, so both axes stay unstated', () => {
  const artifact = artifactWith([{
    name: 'checker',
    role: null,
    source: { file: CHECKER_FILE, sha256: null },
    selector: null,
    ground: 'the operator checker this run was given',
    members: [],
    refusal: null,
  }]);

  const axes = denominatorOf({ artifact });
  assert.equal(axes.operations.source, 'unstated');
  assert.equal(axes.sequences.source, 'unstated');

  // The surfaces axis is the one stated by its placement, so it is absent until a demand is
  // counted against it; the other three are unstated, and the declaration moved none of them.
  const gaps = gapsIn(axes);
  assert.deepEqual(gaps.map((gap) => gap.axis), ['operations', 'sequences', 'boundaries']);
  assert.match(gaps[0].repair, /supply the census for the operations role/);
  assert.match(gaps[1].repair, /supply a census for the sequences role/);
});

test('PX-265 C005 the recorded declaration states no axis, and a census pin still does', () => {
  // The establishment's own record rather than a hand-written one: this is the entry the rail
  // writes into the artifact, and it is what the denominator reads. A declaration edited to
  // carry a role afterwards never reaches the denominator, because the re-derivation refuses
  // it first — which is the test above this one.
  const { pin } = establishedDeclaration();
  assert.equal(pin.role, null);
  assert.deepEqual(pin.members, []);

  const withDeclaration = denominatorOf({ artifact: artifactWith([pin]) });
  assert.equal(withDeclaration.operations.source, 'unstated');
  assert.equal(withDeclaration.sequences.source, 'unstated');

  const withCensus = denominatorOf({ artifact: artifactWith([structuredClone(CENSUS_GOLDEN.pins.sourceEnumerations[0])]) });
  assert.equal(withCensus.operations.source, 'census');
  assert.equal(withCensus.operations.members, 3);
});

// ---------------------------------------------------------------------------
// Integration — both kinds through the real gates over the real fixture
// ---------------------------------------------------------------------------

test('PX-265 C001 C002 C005 the census fixture closes phase 4 and phase 6 with a declaration beside it', () => {
  const run = fixtureRun('educe-declaration-fixture-', { [CHECKER_FILE]: CHECKER });
  const declaration = {
    ...CENSUS_RUN_INPUT.declaration,
    sourceEnumerations: [...CENSUS_RUN_INPUT.declaration.sourceEnumerations, CHECKER_DECLARATION],
  };
  writeDeclaration(run.directory, declaration);

  const phaseFour = evaluatePhase(4, run);
  assert.equal(phaseFour.ok, true, phaseFour.reason);
  const phaseSix = evaluatePhase(6, run);
  assert.equal(phaseSix.ok, true, phaseSix.reason);

  const pins = establishPins(run.spec.lines, declaration, suppliedDocumentsOf(run.directory));
  assert.deepEqual(pins.sourceEnumerations.map((pin) => pin.refusal), [null, null, null]);
  assert.deepEqual(pins.sourceEnumerations[2].members, []);
});

test('PX-265 C001 the same fixture refuses phase 4 when the declaration is removed', () => {
  const run = fixtureRun('educe-declaration-refused-', { [CHECKER_FILE]: CHECKER });
  writeDeclaration(run.directory, CENSUS_RUN_INPUT.declaration);

  const verdict = evaluatePhase(4, run);

  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, new RegExp(CHECKER_FILE.replace('.', '\\.')));
  assert.match(verdict.reason, /sourceEnumerations pin/);
});

// ---------------------------------------------------------------------------
// Acceptance — a run that was given material now runs without deleting it
// ---------------------------------------------------------------------------

test('PX-265 the phase-4 guidance, the command step and the recorded kind agree', () => {
  const run = scratchRun();
  writeSupplied(run.directory, { [CHECKER_FILE]: CHECKER });
  const declaration = declarationWith([CHECKER_DECLARATION]);
  writeDeclaration(run.directory, declaration);

  const verdict = evaluatePhase(4, run);

  assert.equal(verdict.ok, true, verdict.reason);
  assert.match(verdict.reason, /enumeration\(s\) carry ranges/);
});
