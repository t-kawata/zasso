// The entries census in the specification's own coordinates (PX-266).
//
// A census read out of supplied material is what stops the artifact from being its own
// denominator, and for the entries role it was the only route to a stated axis. It was a route
// no independently authored document could take: the entries a reading produces are identified
// inside the run, so a document written before the run can only agree with them by accident.
// Measured on a live workspace, the one candidate census carried 485 identifiers of one form
// while the artifact's entries carried identifiers of another, and the intersection was empty.
//
// The obstacle is the coordinate, not the document. The specification carries coordinates that
// are facts about it rather than about the rail — its line numbers — and a census written as
// spans of the specification can be authored from the document alone, then held against a
// reading by containment. This file holds that fourth shape and the correspondence it makes
// possible, and it holds the identifier form unchanged beside it, because a project that keeps
// its census in identifiers must keep working exactly as it did.
//
// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
// @verifies C005
import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkAll } from '../../.claude/scripts/educe-sequences/rail/engine.mjs';
import { evaluateGate } from '../../.claude/scripts/educe-sequences/rail/gates.mjs';
import {
  isSpanCensusPin,
  parseSpan,
  readArtifactSchema,
  readSpecification,
  validateArtifactShape,
} from '../../.claude/scripts/educe-sequences/rail/load.mjs';
import { buildContext, startRun } from '../../.claude/scripts/educe-sequences/rail/phases.mjs';
import { SOURCE_SHAPES, establishPins, extractMembers, rederiveAll } from '../../.claude/scripts/educe-sequences/rail/pins.mjs';
import { digestOfBytes, splitLines } from '../../.claude/scripts/educe-sequences/rail/load.mjs';
import { suppliedDocumentsOf } from '../../.claude/scripts/educe-sequences/rail/supplied.mjs';
import { denominatorOf, gapsIn } from '../../.claude/scripts/sequences-slice/lib/obligation-denominator.mjs';
import { measureCoverage } from '../../.claude/scripts/sequences-slice/lib/obligation-coverage.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const CENSUS_ROOT = join(PROJECT_ROOT, 'tests/educe-sequences/fixtures/census');
const SPEC_PATH = join(CENSUS_ROOT, 'ledger.md');
const RUN_DIRECTORY = join(CENSUS_ROOT, 'educe-sequences');
const GOLDEN_PATH = join(CENSUS_ROOT, 'ledger-sequences.json');
const CENSUS_RUN_INPUT = JSON.parse(readFileSync(join(CENSUS_ROOT, 'ledger.run.json'), 'utf8'));

const spec = readSpecification(SPEC_PATH);

/** The supplied file the entries census lives in, in both coordinates. */
const ENTRIES_FILE = 'ledger-entries.md';

/**
 * The spans that cover exactly the entries the golden artifact adjudicates.
 *
 * Read off the artifact rather than guessed: its adjudicated entries are 1-23, 24-26, 27-33,
 * 34-35, 36-48 and 51-58, and the two neighbours carry no outcome and are therefore not
 * required to lie in any span.
 */
const CENSUS_SPANS = Object.freeze(['1-23', '24-26', '27-33', '34-35', '36-48', '51-58']);

/** The entries census rewritten as spans, one row per span, in the same file. */
// [::TICKET::] PX-288 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-288 --for-spec --no-implementation-order`.
// [::TICKET::] PX-266 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-266 --for-spec --no-implementation-order`.
function spanDocument(spans) {
  const rows = spans.map((span, index) => JSON.stringify({ region: `region-${index + 1}`, span }));
  return ['```json', ...rows, '```', ''].join('\n');
}

const SPAN_CENSUS = spanDocument(CENSUS_SPANS);

/** The declaration's pin for the span census: the file, the shape and the parameter. */
const SPAN_PIN = Object.freeze({
  name: 'LedgerRegion',
  role: 'entries',
  source: ENTRIES_FILE,
  selector: { shape: 'specSpans', parameter: 'span' },
});

/** The borrowed pins the fixture's declaration declares, which this file keeps beside its own. */
const OPERATIONS_PIN = CENSUS_RUN_INPUT.declaration.sourceEnumerations.find((entry) => entry.role === 'operations');

/** The same pin as the artifact records it: the file, its digest, and the members read out. */
const BORROWED_OPERATIONS = golden().pins.sourceEnumerations.find((entry) => entry.role === 'operations');

/** The fixture's supplied material, with the entries census in identifiers. */
const IDENTIFIER_SUPPLIED = suppliedDocumentsOf(RUN_DIRECTORY);

/** The same material with the entries census rewritten in the specification's coordinates. */
const SPAN_SUPPLIED = Object.freeze({ ...IDENTIFIER_SUPPLIED, [ENTRIES_FILE]: SPAN_CENSUS });

/** The golden artifact, read fresh so no test can hand another a mutated one. */
// [::TICKET::] PX-266 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-266 --for-spec --no-implementation-order`.
function golden() {
  return JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
}

/** The golden artifact with its borrowed pins replaced, which is the coordinate under test. */
// [::TICKET::] PX-266 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-266 --for-spec --no-implementation-order`.
function artifactWith(sourceEnumerations) {
  const artifact = golden();
  artifact.pins.sourceEnumerations = sourceEnumerations;
  return artifact;
}

/** A borrowed pin for the span census, in the shape the artifact records one. */
// [::TICKET::] PX-266 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-266 --for-spec --no-implementation-order`.
function spanPin(members = CENSUS_SPANS, overrides = {}) {
  return {
    name: SPAN_PIN.name,
    role: SPAN_PIN.role,
    source: { file: ENTRIES_FILE, sha256: digestOfBytes(Buffer.from(SPAN_CENSUS, 'utf8')) },
    selector: { shape: 'specSpans', parameter: 'span' },
    members: [...members],
    refusal: null,
    ...overrides,
  };
}

/** Every verdict the rail reports over an artifact, with the material it was read beside. */
// [::TICKET::] PX-266 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-266 --for-spec --no-implementation-order`.
function verdictsOf(artifact, supplied = SPAN_SUPPLIED) {
  return checkAll({ specLines: spec.lines, artifact, recorded: { supplied } }).verdicts;
}

/** The verdicts of the one check this file is about. */
// [::TICKET::] PX-266 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-266 --for-spec --no-implementation-order`.
function entryVerdicts(artifact, supplied = SPAN_SUPPLIED) {
  return verdictsOf(artifact, supplied).filter((verdict) => verdict.check === 'every-censused-entry-adjudicated');
}

/** A run directory whose specification and material are the fixture's, with the census rewritten. */
// [::TICKET::] PX-266 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-266 --for-spec --no-implementation-order`.
function spanRun() {
  const root = mkdtempSync(join(tmpdir(), 'px266-spans-'));
  copyFileSync(SPEC_PATH, join(root, 'ledger.md'));
  cpSync(RUN_DIRECTORY, join(root, 'educe-sequences'), { recursive: true });
  const directory = join(root, 'educe-sequences');
  writeFileSync(join(directory, 'supplied', ENTRIES_FILE), SPAN_CENSUS);
  const declaration = { ...CENSUS_RUN_INPUT.declaration, sourceEnumerations: [OPERATIONS_PIN, SPAN_PIN] };
  writeFileSync(join(directory, 'declaration.json'), `${JSON.stringify(declaration, null, 2)}\n`);
  const specPath = join(root, 'ledger.md');
  const run = { specPath, spec, directory, status: startRun({ specPath, spec }).status };
  return { ...run, declaration };
}

/** One phase gate, driven the way the driver drives it. */
// [::TICKET::] PX-266 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-266 --for-spec --no-implementation-order`.
function evaluatePhase(phaseId, run) {
  return evaluateGate(phaseId, buildContext({ specPath: run.specPath, spec: run.spec, run: { directory: run.directory, status: run.status }, recorded: {} }));
}

// ---------------------------------------------------------------------------
// C001 — the span shape, its totality, and the coordinate it declares
// ---------------------------------------------------------------------------

test('PX-266 C001 the span shape reads one member per row, each a span of the specification', () => {
  const extracted = extractMembers({ lines: splitLines(SPAN_CENSUS), shape: 'specSpans', parameter: 'span' });

  assert.deepEqual(extracted.members, [...CENSUS_SPANS]);
  assert.equal(extracted.refused, undefined);
  for (const member of extracted.members) {
    const span = parseSpan(member);
    assert.ok(span.first >= 1 && span.last <= spec.lineCount, `${member} lies inside the specification`);
  }
});

test('PX-266 C001 the span shape declares a coordinate, so the shapes stay one closed vocabulary', () => {
  assert.deepEqual([...SOURCE_SHAPES], ['jsonFieldRows', 'tableColumn', 'markedLines', 'specSpans']);
  assert.equal(isSpanCensusPin(SPAN_PIN), true);
  assert.equal(isSpanCensusPin({ selector: { shape: 'jsonFieldRows', parameter: 'id' } }), false);
  assert.equal(isSpanCensusPin(null), false);
  assert.equal(isSpanCensusPin({}), false);
});

test('PX-266 C001 a member that is not a well-formed span refuses by name rather than being skipped', () => {
  const oneRow = (value) => `\`\`\`json\n${JSON.stringify({ span: value })}\n\`\`\`\n`;

  for (const value of ['not-a-span', '', '40-12', '0-5', '12-', '-5', '1.5', 'front-matter']) {
    const refused = extractMembers({ lines: splitLines(oneRow(value)), shape: 'specSpans', parameter: 'span' });
    assert.match(refused.refused, /is not a span of the specification/, `"${value}" is refused`);
    assert.equal(refused.members, undefined, `"${value}" yields no member`);
  }

  assert.deepEqual(extractMembers({ lines: splitLines(oneRow('34')), shape: 'specSpans', parameter: 'span' }).members, ['34']);
  assert.equal(parseSpan('front-matter'), null);
  assert.equal(parseSpan('35-34'), null);
  assert.equal(parseSpan('0-6'), null);
});

// ---------------------------------------------------------------------------
// C002 — the containment correspondence
// ---------------------------------------------------------------------------

test('PX-266 C002 a census of spans agrees with the entries the artifact adjudicates', () => {
  const artifact = artifactWith([BORROWED_OPERATIONS, spanPin()]);

  assert.deepEqual(verdictsOf(artifact), [], 'the whole artifact is green in the new coordinate');
});

test('PX-266 C002 a span covering no adjudicated entry refuses, and an entry covered by no span refuses', () => {
  const coveringNothing = entryVerdicts(artifactWith([BORROWED_OPERATIONS, spanPin([...CENSUS_SPANS, '49-50'])]));

  assert.deepEqual(coveringNothing.map((verdict) => verdict.direction), ['backward']);
  assert.equal(coveringNothing[0].subject, '49-50');
  assert.match(coveringNothing[0].reason, /covers no adjudicated entry/);

  const coveringLess = entryVerdicts(artifactWith([BORROWED_OPERATIONS, spanPin(['1-23', '27-33', '34-35', '36-48', '51-58'])]));

  assert.deepEqual(coveringLess.map((verdict) => verdict.direction), ['forward']);
  assert.equal(coveringLess[0].subject, 'admission');
  assert.match(coveringLess[0].reason, /lies in no censused span/);
});

test('PX-266 C002 containment is strict, so a span of one line does not cover a two-line entry', () => {
  const partial = entryVerdicts(artifactWith([BORROWED_OPERATIONS, spanPin(['1-23', '24-26', '27-33', '34', '36-48', '51-58'])]));

  assert.deepEqual(partial.map((verdict) => verdict.direction), ['backward', 'forward']);
  assert.equal(partial[0].subject, '34');
  assert.equal(partial[1].subject, 'settlement', 'the entry 34-35 is not inside the span 34');

  // The same span covers the same entry once the entry is one line, which is what makes the
  // refusal above a statement about containment rather than about a span of one line.
  const oneLine = artifactWith([BORROWED_OPERATIONS, spanPin(['1-23', '24-26', '27-33', '34', '36-48', '51-58'])]);
  oneLine.sequences = oneLine.sequences.map((entry) => (entry.id === 'settlement' ? { ...entry, lastLine: 34 } : entry));
  assert.deepEqual(entryVerdicts(oneLine), []);
});

test('PX-266 C002 a census of spans and a census of identifiers are two coordinates of one check, not two checks', () => {
  const idCount = entryVerdicts(golden(), IDENTIFIER_SUPPLIED).length;
  const spanCount = entryVerdicts(artifactWith([BORROWED_OPERATIONS, spanPin()])).length;

  assert.equal(idCount, 0);
  assert.equal(spanCount, 0);
  assert.equal(
    verdictsOf(golden(), IDENTIFIER_SUPPLIED).filter((verdict) => verdict.check === 'every-censused-entry-adjudicated').length,
    verdictsOf(artifactWith([BORROWED_OPERATIONS, spanPin()])).filter((verdict) => verdict.check === 'every-censused-entry-adjudicated').length,
  );
});

// ---------------------------------------------------------------------------
// C003 — the identifier coordinate is not disturbed
// ---------------------------------------------------------------------------

test('PX-266 C003 the ledger identifier census agrees exactly as it did before the change', () => {
  const ledger = golden();

  assert.deepEqual(verdictsOf(ledger, IDENTIFIER_SUPPLIED), []);
  assert.equal(ledger.pins.sourceEnumerations[1].selector.shape, 'jsonFieldRows');
  assert.equal(isSpanCensusPin(ledger.pins.sourceEnumerations[1]), false);

  // The census still names admission and the artifact no longer adjudicates it, which is the
  // backward direction: a censused entry the reading accounts for nowhere.
  const dropped = { ...ledger, sequences: ledger.sequences.filter((entry) => entry.id !== 'admission') };
  const refusals = entryVerdicts(dropped, IDENTIFIER_SUPPLIED);

  assert.deepEqual(refusals.map((verdict) => verdict.direction), ['backward']);
  assert.equal(refusals[0].subject, 'admission');
  assert.match(refusals[0].reason, /present in the first record and absent from the second/);
});

// ---------------------------------------------------------------------------
// C004 — the sequences axis, stated by the presence of the census
// ---------------------------------------------------------------------------

test('PX-288 C011 a span entries census does not state the sequences axis', () => {
  const axes = denominatorOf({ artifact: artifactWith([spanPin()]) });

  assert.equal(axes.sequences.source, 'unstated');
  assert.equal(axes.sequences.members, 0);
  assert.deepEqual(gapsIn(axes).map((gap) => gap.axis), ['operations', 'sequences', 'boundaries']);

  const empty = denominatorOf({ artifact: artifactWith([spanPin([])]) });
  assert.equal(empty.sequences.source, 'census', 'an empty entries census states that there is no entry');
  assert.equal(empty.sequences.members, 0);
});

test('PX-266 C004 a run carrying no entries census leaves the sequences axis unstated and reported', () => {
  const without = denominatorOf({ artifact: artifactWith([{ ...spanPin(), role: 'operations' }]) });

  assert.equal(without.sequences.source, 'unstated');
  assert.deepEqual(gapsIn(without).map((gap) => gap.axis), ['sequences', 'boundaries']);
  assert.match(gapsIn(without)[0].repair, /supply a census for the sequences role/);
});

// ---------------------------------------------------------------------------
// C005 — the coordinates a census may claim
// ---------------------------------------------------------------------------

test('PX-266 C005 a span outside the specification refuses naming the bound it crossed', () => {
  const beyond = artifactWith([spanPin(['1-23', '24-61'])]);
  const problems = validateArtifactShape(beyond, readArtifactSchema());

  assert.equal(problems.length, 1);
  assert.match(problems[0].reason, /24-61 ends at line 61, and the specification has 60 lines/);
  assert.match(problems[0].reason, new RegExp(ENTRIES_FILE));
  assert.equal(problems[0].pin, 'sourceEnumerations[0].members');
});

test('PX-266 C005 two spans that overlap refuse naming both, and the shape check stops the run there', () => {
  const overlapping = artifactWith([spanPin(['1-23', '20-30'])]);

  assert.match(validateArtifactShape(overlapping, readArtifactSchema())[0].reason, /1-23 and 20-30 overlap/);

  const verdicts = verdictsOf(overlapping);
  assert.deepEqual(verdicts.map((verdict) => verdict.check), ['artifact-shape'], 'the run reports the malformed census and nothing else');
});

test('PX-266 C005 a census of spans is measured in the specification, so it cannot answer for the operations role', () => {
  const mislabelled = spanPin(CENSUS_SPANS, { role: 'operations' });
  const pins = establishPins(spec.lines, { ...CENSUS_RUN_INPUT.declaration, sourceEnumerations: [OPERATIONS_PIN, SPAN_PIN] }, SPAN_SUPPLIED);
  const rederived = rederiveAll({ ...pins, sourceEnumerations: [mislabelled] }, spec.lines, SPAN_SUPPLIED);

  assert.equal(rederived.ok, false);
  assert.match(rederived.failures[0].reason, /measured in the specification's coordinates/);
  assert.match(rederived.failures[0].reason, /entries/);
});

// ---------------------------------------------------------------------------
// Integration — the rail, the gates and the coverage measurement
// ---------------------------------------------------------------------------

test('PX-266 C001 C002 the same run closes phases 4 and 6 with its entries census in spans', () => {
  const run = spanRun();

  const phaseFour = evaluatePhase(4, run);
  assert.equal(phaseFour.ok, true, phaseFour.reason);
  const phaseSix = evaluatePhase(6, run);
  assert.equal(phaseSix.ok, true, phaseSix.reason);

  const pins = establishPins(run.spec.lines, run.declaration, suppliedDocumentsOf(run.directory));
  const entries = pins.sourceEnumerations.find((pin) => pin.role === 'entries');
  assert.deepEqual(entries.members, [...CENSUS_SPANS]);
  assert.equal(entries.refusal, null);
  assert.deepEqual(entries.selector, { shape: 'specSpans', parameter: 'span' });
});

test('PX-266 C004 the coverage measurement reports one unstated denominator rather than two', () => {
  const run = spanRun();
  const entries = establishPins(run.spec.lines, run.declaration, suppliedDocumentsOf(run.directory))
    .sourceEnumerations.find((pin) => pin.role === 'entries');

  const coverage = measureCoverage({ artifact: artifactWith([BORROWED_OPERATIONS, entries]), allocateManifest: null, views: [] });
  const gapAxes = coverage.denominatorGaps.map((gap) => gap.axis);

  assert.equal(coverage.denominator.sequences.source, 'unstated');
  assert.equal(coverage.denominator.sequences.members, 0);
  assert.ok(gapAxes.includes('sequences'), 'a span entries census does not state the sequences axis');
  assert.ok(!gapAxes.includes('operations'), 'the operations axis is stated by its own census, which travels beside this one');
  assert.ok(gapAxes.includes('boundaries'), 'the boundaries axis is still unstated, so the measurement is not vacuous');
});
