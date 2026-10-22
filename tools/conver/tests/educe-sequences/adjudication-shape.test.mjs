// The adjudications the artifact carries, and the shape it declares for them (PX-268).
//
// The collection was carried by whatever the reader wrote: `readings-adjudicate.jsonl` reached
// the artifact through a pass-through, was proven by nothing, and carried a vocabulary no
// declaration owned. Measured on the real Gaia artifact that is 954 rows, 40 distinct outcomes,
// an empty intersection with every vocabulary the schema declares, and 0 rows any check decides
// — while the census's section arm (267 of that artifact's 292 sections have no entry starting
// inside them) rests on those rows naming their section. These cases hold the row to the fields
// the schema declares, hold the outcome to the declared vocabulary, hold the subject to what the
// artifact declares, and hold the prover to the same shape every other reading is proven in.
//
// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
// @verifies C005
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { buildArtifact } from '../../.claude/scripts/educe-sequences/rail/artifact.mjs';
import { CHECKS, checkAll } from '../../.claude/scripts/educe-sequences/rail/engine.mjs';
import { PHASES } from '../../.claude/scripts/educe-sequences/rail/gates.mjs';
import { COUNTER_MUTATION_CORPUS, SPEC_MUTATION_CORPUS, runCase } from '../../.claude/scripts/educe-sequences/rail/harness.mjs';
import { ADJUDICATION_FIELDS, PREDICATE_LIMB_FIELD, readArtifactSchema, readSpecification } from '../../.claude/scripts/educe-sequences/rail/load.mjs';
import { suppliedDigestOf, suppliedDocumentsOf } from '../../.claude/scripts/educe-sequences/rail/supplied.mjs';
import { countInterrogatives, proveAdjudicationReadings, renderBrief, renderPredicateClause } from '../../.claude/scripts/educe-sequences/rail/reading.mjs';
import { READING_FIELDS } from '../../.claude/scripts/educe-sequences/rail/readings.mjs';
import { healthLines, selectionLines } from '../../.claude/scripts/educe-sequences/rail/report.mjs';

const CHECK = 'every-adjudication-is-in-the-declared-shape';
const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const RAIL_DIRECTORY = join(PROJECT_ROOT, '.claude/scripts/educe-sequences/rail');
const FIXTURE_ROOT = new URL('./fixtures/spec/', import.meta.url).pathname;
const SPEC_PATH = join(FIXTURE_ROOT, 'ledger.md');
const STATUS = { phases: [], readings: {}, history: [] };

const spec = readSpecification(SPEC_PATH);
const golden = JSON.parse(readFileSync(join(FIXTURE_ROOT, 'ledger-sequences.json'), 'utf8'));
const RUN_INPUT = JSON.parse(readFileSync(join(FIXTURE_ROOT, 'ledger.run.json'), 'utf8'));

/** The verdicts this check reports over an artifact, and nothing else's. */
// [::TICKET::] PX-268 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-268 --for-spec --no-implementation-order`.
function verdictsFor(artifact) {
  return checkAll({ specLines: spec.lines, artifact }).verdicts.filter((verdict) => verdict.check === CHECK);
}

/** An artifact holding one more ruling, which names nothing. */
// [::TICKET::] PX-268 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-268 --for-spec --no-implementation-order`.
function withANamelessRuling(artifact) {
  const [ruling] = artifact.adjudications;
  const appended = { subject: '', outcome: ruling.outcome, reader: ruling.reader };
  return { ...artifact, adjudications: [...artifact.adjudications, appended] };
}

/** An artifact with one adjudication patched, aimed at the row the check examines. */
// [::TICKET::] PX-268 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-268 --for-spec --no-implementation-order`.
function withAdjudication(artifact, subject, patch) {
  const replace = (row) => (row.subject === subject ? { ...row, ...patch } : row);
  return { ...artifact, adjudications: artifact.adjudications.map(replace) };
}

/** The artifact the fixture's own readings compose, with the adjudications the caller names. */
// [::TICKET::] PX-268 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-268 --for-spec --no-implementation-order`.
function composed(adjudications) {
  return buildArtifact({
    specPath: SPEC_PATH,
    spec,
    declaration: RUN_INPUT.declaration,
    readings: { ...RUN_INPUT.readings, adjudications },
  });
}

/** The summary a run that refused nothing reports, so what it examined can be read off it. */
// [::TICKET::] PX-268 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-268 --for-spec --no-implementation-order`.
function summaryFor(artifact) {
  return checkAll({ specLines: spec.lines, artifact }).summary;
}

/** A check that no run declares refuses nothing, which is not the same as finding nothing wrong. */
// [::TICKET::] PX-268 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-268 --for-spec --no-implementation-order`.
function declaresTheCheck() {
  assert.equal(CHECKS.some((check) => check.id === CHECK), true, 'a check no run declares cannot refuse anything');
}

// ---------------------------------------------------------------------------
// C001 — the row's shape is the declaration's, and it is declared once
// ---------------------------------------------------------------------------

test('C001 the schema declares the row, and the module reads it rather than stating it', () => {
  const schema = readArtifactSchema();

  assert.equal(Array.isArray(schema.adjudications?.required), true, 'a schema with no row shape is a collection carried unvalidated');
  assert.deepEqual([...ADJUDICATION_FIELDS], schema.adjudications.required);
  assert.equal(ADJUDICATION_FIELDS.includes('subject'), true, 'a row that names no subject resolves to nothing');
  assert.equal(ADJUDICATION_FIELDS.includes('outcome'), true, 'a row with no outcome answers nothing');
  assert.equal(ADJUDICATION_FIELDS.includes('reader'), true, 'a row with no reader is not a reading');
});

test('C001 the row shape is not restated by the modules that compose and judge rows', () => {
  // Scoped to them, and not to every module: readings.mjs declares what a reading line carries,
  // which is the reading's contract rather than the artifact row's, and the two coincide today
  // without being one list. What must not appear is a third statement of the row's shape in the
  // composer or the engine, which is where a row would be built or judged by a list of its own.
  const declaredList = new RegExp(`Object\\.freeze\\(\\['${ADJUDICATION_FIELDS.join("', '")}'`);
  for (const name of ['artifact.mjs', 'engine.mjs', 'checks.mjs']) {
    const source = readFileSync(join(RAIL_DIRECTORY, name), 'utf8');
    assert.equal(declaredList.test(source), false, `${name} holds a second copy of the declared fields`);
  }
  // The artifact's row is composed from a reading, so a declared field the reading cannot carry
  // would be a field no composer could ever fill.
  const aReadingCouldGive = [...READING_FIELDS, PREDICATE_LIMB_FIELD];
  for (const field of ADJUDICATION_FIELDS) {
    assert.equal(aReadingCouldGive.includes(field), true, `${field} is not a field a reading carries`);
  }
});

// ---------------------------------------------------------------------------
// C002 — composition carries the declared fields, and invents nothing
// ---------------------------------------------------------------------------

test('C002 a composed row keeps the declared fields and nothing else', () => {
  const row = composed(RUN_INPUT.readings.adjudications).adjudications.find((candidate) => candidate.subject === 's1');

  assert.deepEqual(Object.keys(row).sort(), ['outcome', 'predicateLimb', 'reader', 'subject']);
  assert.equal(Object.hasOwn(row, 'category'), false, 'a key the schema does not declare is not carried');
  assert.equal(Object.hasOwn(row, 'reason'), false);
  assert.equal(row.predicateLimb, 'none-applies', 'the limb PX-267 made compulsory is carried');
});

test('C002 an answer that is not a value is not carried, and the reading is not mutated', () => {
  const answered = RUN_INPUT.readings.adjudications.map((reading) => (reading.subject === 's1' ? { ...reading, predicateLimb: null } : reading));
  const row = composed(answered).adjudications.find((candidate) => candidate.subject === 's1');

  assert.equal(row.outcome, 'notASequence', 'the row still holds the ruling');
  assert.equal(Object.hasOwn(row, PREDICATE_LIMB_FIELD), false, 'and a key with no answer is not an answer');
  assert.equal(answered[0].category !== undefined, true, 'the reading keeps the keys the artifact does not carry');
});

test('C002 composition carries what it was given, and invents no row', () => {
  const adjudications = composed(RUN_INPUT.readings.adjudications).adjudications;

  assert.equal(adjudications.length, RUN_INPUT.readings.adjudications.length);
  assert.deepEqual(
    adjudications.map((row) => row.subject),
    RUN_INPUT.readings.adjudications.map((reading) => reading.subject),
    'a row that no reading gave would be a ruling nobody made',
  );
});


// ---------------------------------------------------------------------------
// C002 — both golden fixtures are the composer's output, and stay it
// ---------------------------------------------------------------------------

test('C002 the committed fixtures are what the composer makes of their own run inputs', () => {
  // The fixtures are outputs, so the way to hold them is to make them again: a hand-edited
  // artifact, or one composed from readings that have since moved, differs here rather than
  // passing every check that reads it. The adjudications are why this lives in this file —
  // what composition carries for that collection is what this ticket changed.
  for (const fixture of ['spec', 'census']) {
    const directory = join(PROJECT_ROOT, 'tests/educe-sequences/fixtures', fixture);
    const specPath = join(directory, 'ledger.md');
    const { declaration, readings } = JSON.parse(readFileSync(join(directory, 'ledger.run.json'), 'utf8'));
    const composed = buildArtifact({
      specPath,
      spec: readSpecification(specPath),
      declaration,
      readings: { sequences: readings.sequences, steps: readings.steps, operations: readings.operations, adjudications: readings.adjudications },
      supplied: suppliedDigestOf(join(directory, 'educe-sequences')),
      suppliedDocuments: suppliedDocumentsOf(join(directory, 'educe-sequences')),
    });

    assert.equal(`${JSON.stringify(composed, null, 2)}\n`, readFileSync(join(directory, 'ledger-sequences.json'), 'utf8'), fixture);
  }
});

// ---------------------------------------------------------------------------
// C003 — the check judges the artifact's adjudications
// ---------------------------------------------------------------------------

test('C003 the check is declared, examines every adjudication, and refuses none that is sound', () => {
  declaresTheCheck();
  assert.equal(golden.adjudications.length > 0, true, 'the refusal set being empty is evidence only when there is something it could have refused');
  assert.deepEqual(verdictsFor(golden), []);
  assert.equal(summaryFor(golden).examinations[CHECK], golden.adjudications.length, 'the count is of the rows iterated, not of the rows refused');
});

test('C003 each limb of the shape is refused by name', () => {
  const limbCases = [
    { artifact: withAdjudication(golden, 's1', { outcome: 'schema_block' }), subject: 's1' },
    { artifact: withAdjudication(golden, 's1', { category: 'prose' }), subject: 's1' },
    // Appended rather than patched: emptying a row's subject would also take a section's only
    // explanation away, and the verdict this case is about would be reported second.
    { artifact: withANamelessRuling(golden), subject: '' },
  ];

  for (const limbCase of limbCases) {
    const verdicts = verdictsFor(limbCase.artifact);
    assert.equal(verdicts.length, 1, JSON.stringify(verdicts));
    assert.equal(verdicts[0].subject, limbCase.subject);
    assert.match(verdicts[0].reason, /declared shape/);
  }
});

test('C003 an empty collection is not a refusal, and the limb stays the ruling check\'s obligation', () => {
  declaresTheCheck();
  assert.deepEqual(verdictsFor({ ...golden, adjudications: [] }), [], 'a specification with no adjudications is not incomplete');

  const nonRuling = { subject: 's5', outcome: 'singleStep', reader: 'adjudicate' };
  assert.deepEqual(verdictsFor({ ...golden, adjudications: [nonRuling] }), [], 'the shape check asks for no limb; the limb is PX-267\'s obligation');
});

// ---------------------------------------------------------------------------
// C004 — an adjudication reading is proven where every other reading is
// ---------------------------------------------------------------------------

test('C004 a compliant set is not refused, and a section is a subject like any other', () => {
  const readings = [
    { subject: 's1', outcome: 'notASequence', reader: 'adjudicate', predicateLimb: 'none-applies' },
    { subject: 's5', outcome: 'singleStep', reader: 'adjudicate' },
    { subject: golden.sequences[0].id, outcome: 'notASequence', reader: 'adjudicate', predicateLimb: 'none-applies' },
    { subject: golden.operations[0].id, outcome: 'notASequence', reader: 'adjudicate', predicateLimb: 'none-applies' },
    // A name the artifact does not declare is what a merge carries a dropped region by: the
    // refusal for a vanished name asks for exactly this ruling, so it cannot be refused here.
    { subject: 'a-region-this-artifact-does-not-hold', outcome: 'notASequence', reader: 'adjudicate', predicateLimb: 'none-applies' },
  ];

  assert.deepEqual(proveAdjudicationReadings({ readings, artifact: golden, specLines: spec.lines }).refused, []);
});

test('C004 the reader\'s refusal names the field and the words that were allowed', () => {
  const broken = [
    { subject: 's1', outcome: 'schema_block', reader: 'adjudicate' },
    { subject: '', outcome: 'notASequence', reader: 'adjudicate', predicateLimb: 'none-applies' },
  ];

  for (const reading of broken) {
    const { refused } = proveAdjudicationReadings({ readings: [reading], artifact: golden, specLines: spec.lines });
    assert.equal(refused.length, 1, JSON.stringify(reading));
    assert.deepEqual(Object.keys(refused[0]).sort(), ['field', 'subject', 'why']);
  }
  const wrongWord = proveAdjudicationReadings({ readings: [broken[0]], artifact: golden, specLines: spec.lines }).refused[0];
  for (const outcome of readArtifactSchema().outcomes) {
    assert.equal(wrongWord.why.includes(outcome), true, `${outcome} is one of the words that were allowed`);
  }
});

test('C004 a ruling that answered nothing is refused for the limb it left empty', () => {
  const answeredNothing = { subject: 's1', outcome: 'notASequence', reader: 'adjudicate', predicateLimb: null };
  const { refused } = proveAdjudicationReadings({ readings: [answeredNothing], artifact: golden, specLines: spec.lines });

  assert.equal(refused.length, 1);
  assert.equal(refused[0].field, PREDICATE_LIMB_FIELD, 'the field the reading left empty, not the field the check reads');
  assert.equal(refused[0].subject, 's1');
});


// ---------------------------------------------------------------------------
// C004 — the phase that dispatched the brief proves it, and only what arrived
// ---------------------------------------------------------------------------

/** The phase-12 gate over a scratch run directory holding the artifact the caller names. */
// [::TICKET::] PX-268 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-268 --for-spec --no-implementation-order`.
function phaseTwelveOver(adjudicateLines) {
  const directory = mkdtempSync(join(tmpdir(), 'px268-gate-'));
  const artifactPath = join(directory, 'ledger-sequences.json');
  writeFileSync(artifactPath, `${JSON.stringify(golden, null, 2)}\n`);
  if (adjudicateLines !== null) writeFileSync(join(directory, 'readings-adjudicate.jsonl'), adjudicateLines);
  const phase = PHASES.find((candidate) => candidate.id === 12);
  return phase.exit({ directory, artifactPath, spec: { lines: spec.lines } });
}

test('C004 a brief that was never written is nothing to prove, not a refusal', () => {
  // This phase has no worklist when every entry already carries an outcome, and the other
  // [read] phases treat an absent brief the same way; a gate that refused here would refuse a
  // run for work it never asked for.
  const verdict = phaseTwelveOver(null);

  assert.equal(verdict.ok, true, JSON.stringify(verdict));
});

test('C004 a brief that is there and unreadable is refused by name', () => {
  const verdict = phaseTwelveOver('{ not json at all\n');

  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason.includes('is not JSON'), true, verdict.reason);
});

test('C004 a brief whose rows are outside the declared shape is refused, naming the field', () => {
  const verdict = phaseTwelveOver(`${JSON.stringify({ subject: 's1', outcome: 'schema_block', reader: 'adjudicate' })}\n`);

  assert.equal(verdict.ok, false, JSON.stringify(verdict));
  assert.equal(verdict.reason.includes('s1'), true, verdict.reason);
  assert.equal(verdict.reason.includes('outcome'), true, verdict.reason);
});

// ---------------------------------------------------------------------------
// C005 — the vocabulary is asked for, and what each check examined is printed
// ---------------------------------------------------------------------------

test('C005 the predicate clause names the words a ruling may answer with', () => {
  const clause = renderPredicateClause(golden.pins.predicate);

  for (const outcome of readArtifactSchema().outcomes) assert.equal(clause.includes(outcome), true, outcome);

  // Every brief carries the clause, so no template had to gain a placeholder — and a brief that
  // asked its one question twice would be refused while rendering.
  const rendered = renderBrief({ briefName: 'adjudicate', worklistPath: 'worklist.txt', predicate: golden.pins.predicate });
  assert.equal(countInterrogatives(rendered) >= 1, true);
  for (const outcome of readArtifactSchema().outcomes) assert.equal(rendered.includes(outcome), true, outcome);
});

test('C005 every check that declares a selection reports what it examined, zero included', () => {
  const declaring = CHECKS.filter((check) => typeof check.examined === 'function');
  assert.equal(declaring.length > 0, true, 'a run that cannot say what it examined cannot say it examined nothing');

  const examined = summaryFor(golden).examinations;
  for (const check of declaring) assert.equal(typeof examined[check.id], 'number', check.id);
  assert.equal(examined[CHECK], golden.adjudications.length, 'the count is of the rows the check iterated');
});

// [::TICKET::] PX-300 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-300 --for-spec --no-implementation-order`.
test('C005 the report prints a zero rather than omitting it', () => {
  const summary = summaryFor(golden);
  const examinedNothing = Object.entries(summary.examinations).filter(([, count]) => count === 0).map(([id]) => id);
  const line = selectionLines(summary).find((candidate) => candidate.startsWith('checksExaminingRows='));

  // A green run of this fixture has checks with nothing to examine, which is the fact the line
  // exists for: before it, those checks and the ones that examined everything read the same.
  assert.equal(examinedNothing.length > 0, true, 'a fixture where every check has subjects cannot show this');
  assert.notEqual(line, undefined);
  const named = examinedNothing.filter((id) => line.includes(id));
  const unnamed = examinedNothing.length - named.length;
  assert.equal(named.length > 0, true, 'the line names at least one zero');
  // The line caps the names it prints and counts the rest, so a zero is never omitted:
  // it is either named or included in the trailing "…and N more".
  assert.equal(unnamed === 0 || line.includes(`…and ${unnamed} more`), true, 'every unnamed zero is counted');
  assert.equal(healthLines({ summary, status: STATUS }).includes(line), true, 'and the measured block prints it');
});
test('C005 the names the line prints are capped, and the rest are counted', () => {
  const examinations = Object.fromEntries(Array.from({ length: 11 }, (_, index) => [`check-${index}`, 0]));
  const [line] = selectionLines({ examinations });

  assert.equal((line.match(/check-\d+/g) ?? []).length, 8, line);
  assert.match(line, /…and 3 more/);
  assert.match(line, /checksExaminingRows=0 of 11/);
});


// ---------------------------------------------------------------------------
// C003/C005 — the corpus falsifies the check, and nothing else moves
// ---------------------------------------------------------------------------

test('C005 the corpus names this check, and the mutations redden it attributably', () => {
  const named = SPEC_MUTATION_CORPUS.filter((candidate) => candidate.check === CHECK);

  assert.equal(named.length, 3, 'the three limbs of the shape are three findings, and each needs a mutation');
  for (const testCase of named) {
    const outcome = runCase(testCase, { artifact: golden, specLines: spec.lines, fixtureRoot: FIXTURE_ROOT });
    assert.equal(outcome.red, true, testCase.name);
    assert.equal(outcome.attributable, true, outcome.reason);
    assert.equal(outcome.reddenedCheck, CHECK);
    assert.equal(outcome.restored, true, 'the case restores the tree it read');
  }
});

test('C005 every counter-mutation stays green over an artifact that holds adjudications', () => {
  assert.equal(COUNTER_MUTATION_CORPUS.length > 0, true);
  for (const counter of COUNTER_MUTATION_CORPUS) {
    const outcome = runCase(counter, { artifact: golden, specLines: spec.lines, fixtureRoot: FIXTURE_ROOT });
    assert.equal(outcome.red, false, `${counter.name} reddened correct work — the rule is defective, not the subject`);
  }
});
