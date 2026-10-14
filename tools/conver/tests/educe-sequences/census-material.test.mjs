// [::TICKET::] PX-266 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-266 --for-spec --no-implementation-order`.
// [::TICKET::] PX-264 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-264 --for-spec --no-implementation-order`.
// The supplied census: material that carries a census but is read by no pin (PX-264).
//
// The rail's three census shapes work, and a document of the stated shape is read. What
// failed on a live workspace was that the material sat in supplied/ and no pin named it,
// so the run closed with an empty census and an unstated denominator, and nothing said so.
// This file holds the rule that makes that omission loud: every supplied file is either
// named by a pin or refused by name, and the invocation's own guidance file is not
// material at all.
//
// @verifies C001
// @verifies C002
// @verifies C004
import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluateGate, unpinnedSuppliedFiles } from '../../.claude/scripts/educe-sequences/rail/gates.mjs';
import { readSpecification } from '../../.claude/scripts/educe-sequences/rail/load.mjs';
import { buildContext, startRun } from '../../.claude/scripts/educe-sequences/rail/phases.mjs';
import { SOURCE_SHAPES, establishPins, extractMembers } from '../../.claude/scripts/educe-sequences/rail/pins.mjs';
import { MATERIAL_FILE, suppliedDocumentsOf, suppliedFilesOf } from '../../.claude/scripts/educe-sequences/rail/supplied.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SPEC_SOURCE = join(PROJECT_ROOT, 'tests/educe-sequences/fixtures/spec/ledger.md');
const RUN_INPUT = JSON.parse(readFileSync(join(PROJECT_ROOT, 'tests/educe-sequences/fixtures/spec/ledger.run.json'), 'utf8'));

/** The borrowed-census fixture: the declaration and the material it names, which agree. */
const CENSUS_ROOT = join(PROJECT_ROOT, 'tests/educe-sequences/fixtures/census');
const CENSUS_SPEC = join(CENSUS_ROOT, 'ledger.md');
const CENSUS_SUPPLIED = join(CENSUS_ROOT, 'educe-sequences/supplied');
const CENSUS_RUN_INPUT = JSON.parse(readFileSync(join(CENSUS_ROOT, 'ledger.run.json'), 'utf8'));

/** The document shape a census is read in: one fence, every row carrying the field. */
const REGISTRY_DOCUMENT = ['```json', '{"kind":"Admit"}', '{"kind":"Settle"}', '```', ''].join('\n');

/** The pin that names REGISTRY_DOCUMENT, in the declaration's own words. */
const REGISTRY_PIN = Object.freeze({
  name: 'registry',
  role: 'operations',
  source: 'registry.md',
  selector: { shape: 'jsonFieldRows', parameter: 'kind' },
});

/**
 * A scratch specification and its run directory.
 *
 * The declaration is the fixture's, because phase 4 also refuses an enumeration that
 * occurs nowhere — so a scratch declaration would fail the gate for a reason this file
 * is not about.
 */
// [::TICKET::] PX-264 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-264 --for-spec --no-implementation-order`.
function scratchRun() {
  const root = mkdtempSync(join(tmpdir(), 'educe-census-'));
  const specPath = join(root, 'ledger.md');
  copyFileSync(SPEC_SOURCE, specPath);
  const spec = readSpecification(specPath);
  const run = startRun({ specPath, spec });
  return { root, specPath, spec, directory: run.directory, status: run.status };
}

/** The fixture declaration with the census pins a case is about.
 *
 * The fixture's declaration is the base because `establishPins` reads a predicate and a
 * row schema as well as the census, and a declaration holding only a census would fail
 * for a reason this file is not about.
 */
// [::TICKET::] PX-264 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-264 --for-spec --no-implementation-order`.
function declarationWith(sourceEnumerations) {
  return { ...RUN_INPUT.declaration, sourceEnumerations };
}

/** Write the run's declaration, with whatever census pins this case is about. */
// [::TICKET::] PX-264 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-264 --for-spec --no-implementation-order`.
function writeDeclaration(directory, sourceEnumerations) {
  const declaration = { ...RUN_INPUT.declaration, sourceEnumerations };
  writeFileSync(join(directory, 'declaration.json'), `${JSON.stringify(declaration, null, 2)}\n`);
}

/** File material beside the specification, the way an invocation's material is filed. */
// [::TICKET::] PX-264 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-264 --for-spec --no-implementation-order`.
function writeSupplied(directory, documents) {
  const supplied = join(directory, 'supplied');
  mkdirSync(supplied, { recursive: true });
  for (const [name, content] of Object.entries(documents)) writeFileSync(join(supplied, name), content);
}

/** The phase-4 gate, driven the way the driver drives it. */
// [::TICKET::] PX-264 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-264 --for-spec --no-implementation-order`.
function evaluatePhaseFour({ specPath, spec, directory, status }) {
  return evaluateGate(4, buildContext({ specPath, spec, run: { directory, status }, recorded: {} }));
}

test('PX-264 C001 a pin naming a supplied file reads its members, and no file is reported', () => {
  const run = scratchRun();
  writeSupplied(run.directory, { [REGISTRY_PIN.source]: REGISTRY_DOCUMENT });
  const pins = establishPins(run.spec.lines, declarationWith([REGISTRY_PIN]), suppliedDocumentsOf(run.directory));

  assert.deepEqual(unpinnedSuppliedFiles(run, pins.sourceEnumerations), []);
  assert.deepEqual(pins.sourceEnumerations[0].members, ['Admit', 'Settle']);
  assert.equal(pins.sourceEnumerations[0].refusal, null);
});

test('PX-264 C001 C004 a supplied file no pin names is refused by name at phase 4', () => {
  const run = scratchRun();
  writeSupplied(run.directory, { [REGISTRY_PIN.source]: REGISTRY_DOCUMENT, 'loose-notes.md': 'prose nobody pinned\n' });
  writeDeclaration(run.directory, [REGISTRY_PIN]);

  const verdict = evaluatePhaseFour(run);

  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /loose-notes\.md/);
  assert.match(verdict.reason, /sourceEnumerations pin/);
  assert.match(verdict.reason, /remove it from supplied\//);
});

test('PX-264 C004 the refusal names the roles no pin answers for', () => {
  const run = scratchRun();
  writeSupplied(run.directory, { 'loose-notes.md': 'prose nobody pinned\n' });
  writeDeclaration(run.directory, []);

  const verdict = evaluatePhaseFour(run);

  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /operations/);
  assert.match(verdict.reason, /entries/);
});

test('PX-264 C001 the invocation guidance file is not census material', () => {
  const run = scratchRun();
  writeSupplied(run.directory, { [MATERIAL_FILE]: 'read the payment section closely\n' });
  const pins = establishPins(run.spec.lines, declarationWith([]), suppliedDocumentsOf(run.directory));

  assert.deepEqual(unpinnedSuppliedFiles(run, pins.sourceEnumerations), []);
});

test('PX-264 C001 the supplied files partition into named and reported, never both and never neither', () => {
  const run = scratchRun();
  writeSupplied(run.directory, { [REGISTRY_PIN.source]: REGISTRY_DOCUMENT, 'a.md': 'x\n', 'b.md': 'y\n' });
  const pins = establishPins(run.spec.lines, declarationWith([REGISTRY_PIN]), suppliedDocumentsOf(run.directory));

  const reported = unpinnedSuppliedFiles(run, pins.sourceEnumerations);
  const named = pins.sourceEnumerations.map((pin) => pin.source.file);
  const pinnable = suppliedFilesOf(run.directory).map((file) => file.name).filter((name) => name !== MATERIAL_FILE);

  assert.deepEqual(named.filter((name) => reported.includes(name)), [], 'a file is never both named and reported');
  assert.deepEqual([...named, ...reported].sort(), [...pinnable].sort(), 'every pinnable file is accounted for');
});

test('PX-264 C002 a mixed document is refused, naming the first offending row, with no members', () => {
  const mixed = ['```json', '{"kind":"Admit"}', '{"gap":"E-freeze-health-gate"}', '```', ''].join('\n');

  const result = extractMembers({ lines: mixed.split('\n'), shape: 'jsonFieldRows', parameter: 'kind' });

  assert.match(result.refused, /does not carry kind/);
  assert.match(result.refused, /\{"gap":"E-freeze-health-gate"\}/);
  assert.equal(result.members, undefined);
});

test('PX-264 C002 the selectors stay a closed vocabulary and every one requires a parameter', () => {
  const lines = ['```json', '{"kind":"Admit"}', '```', ''];

  // PX-266 extended the vocabulary by the shape whose members are spans of the specification.
  // The contract asserted here is the closure and the parameter requirement, which the fourth
  // shape enters on the same terms as the first three — the loop below covers it too.
  assert.deepEqual([...SOURCE_SHAPES], ['jsonFieldRows', 'tableColumn', 'markedLines', 'specSpans']);
  const unknown = extractMembers({ lines, shape: 'jsonFieldRowsWhere', parameter: 'kind' });
  assert.match(unknown.refused, /is not one of jsonFieldRows, tableColumn, markedLines, specSpans/);
  for (const shape of SOURCE_SHAPES) {
    const empty = extractMembers({ lines, shape, parameter: '' });
    assert.match(empty.refused, new RegExp(`the ${shape} shape needs a parameter naming what to read`));
  }
});

test('PX-264 C001 C002 C004 the borrowed-census fixture still closes phase 4 after the change', () => {
  // The fixture's own declaration names both of the fixture's own supplied files, so the
  // refusal this ticket adds has nothing to report. Driving the real gate over the real
  // pair is what says the change is additive rather than a second rule about the same
  // material; asserting only on the scratch declaration would leave that unsaid.
  const root = mkdtempSync(join(tmpdir(), 'educe-census-fixture-'));
  const specPath = join(root, 'ledger.md');
  copyFileSync(CENSUS_SPEC, specPath);
  const spec = readSpecification(specPath);
  const directory = join(root, 'educe-sequences');
  mkdirSync(join(directory, 'supplied'), { recursive: true });
  for (const name of readdirSync(CENSUS_SUPPLIED)) {
    copyFileSync(join(CENSUS_SUPPLIED, name), join(directory, 'supplied', name));
  }
  writeFileSync(join(directory, 'declaration.json'), `${JSON.stringify(CENSUS_RUN_INPUT.declaration, null, 2)}\n`);

  const verdict = evaluatePhaseFour({ specPath, spec, directory, status: startRun({ specPath, spec }).status });

  assert.equal(verdict.ok, true, verdict.reason);
  assert.deepEqual(unpinnedSuppliedFiles({ directory }, establishPins(
    spec.lines,
    CENSUS_RUN_INPUT.declaration,
    suppliedDocumentsOf(directory),
  ).sourceEnumerations), []);
});
