// The rulings an artifact holds, and the limb a ruling owes (PX-267).
//
// The check `adjudication-cites-a-declared-limb` exists so that the predicate is a criterion
// rather than a citation: a reading that rules something is not an operation must name the limb
// it fails, or say that none applies. Measured on the real Gaia artifact it examined nothing at
// all — its subjects were one collection selected by a hand-written pair of names, and that
// project's rows carry a different vocabulary — so it could not redden and its green meant
// nothing. These cases hold the check to the rulings the artifact holds, hold the vocabulary to
// the schema rather than to a literal, and hold the field to the reading that recorded it.
//
// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
// @verifies C005
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildArtifact } from '../../.claude/scripts/educe-sequences/rail/artifact.mjs';
import { CHECKS, checkAll } from '../../.claude/scripts/educe-sequences/rail/engine.mjs';
import { COUNTER_MUTATION_CORPUS, SPEC_MUTATION_CORPUS, digestOfTree, runCase } from '../../.claude/scripts/educe-sequences/rail/harness.mjs';
import { readArtifactSchema, readSpecification, writeArtifact } from '../../.claude/scripts/educe-sequences/rail/load.mjs';
import { ADJUDICATION_OUTCOMES, applyReadings } from '../../.claude/scripts/educe-sequences/rail/reading.mjs';
import { LIMB_RULING_OUTCOMES, NO_LIMB_APPLIES, PREDICATE_LIMB_FIELD } from '../../.claude/scripts/educe-sequences/rail/readings.mjs';

const CHECK_ID = 'adjudication-cites-a-declared-limb';
const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const RAIL_DIRECTORY = join(PROJECT_ROOT, '.claude/scripts/educe-sequences/rail');
const FIXTURE_ROOT = new URL('./fixtures/spec/', import.meta.url).pathname;
const SPEC_PATH = join(FIXTURE_ROOT, 'ledger.md');

const spec = readSpecification(SPEC_PATH);
const golden = JSON.parse(readFileSync(join(FIXTURE_ROOT, 'ledger-sequences.json'), 'utf8'));
const RUN_INPUT = JSON.parse(readFileSync(join(FIXTURE_ROOT, 'ledger.run.json'), 'utf8'));

/** The verdicts this check reports over an artifact, and nothing else's. */
// [::TICKET::] PX-267 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-267 --for-spec --no-implementation-order`.
function refusalsFor(artifact) {
  return checkAll({ specLines: spec.lines, artifact }).verdicts.filter((verdict) => verdict.check === CHECK_ID);
}

/** The rows a ruling may be read from: an entry's outcome and an adjudication's are one vocabulary. */
// [::TICKET::] PX-267 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-267 --for-spec --no-implementation-order`.
function rulingsOf(artifact) {
  return [...(artifact.sequences ?? []), ...(artifact.adjudications ?? [])]
    .filter((row) => LIMB_RULING_OUTCOMES.includes(row.outcome));
}

/** The artifact with every limb taken off the rows that carry one. */
// [::TICKET::] PX-267 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-267 --for-spec --no-implementation-order`.
function withoutLimbs(artifact) {
  const strip = (row) => {
    const { [PREDICATE_LIMB_FIELD]: limb, ...rest } = row;
    return rest;
  };
  return { ...artifact, sequences: artifact.sequences.map(strip), adjudications: artifact.adjudications.map(strip) };
}

/** The artifact with one row's limb replaced by the name given. */
// [::TICKET::] PX-267 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-267 --for-spec --no-implementation-order`.
function withLimb(artifact, subject, limb) {
  const replace = (row) => ((row.subject ?? row.id) === subject ? { ...row, [PREDICATE_LIMB_FIELD]: limb } : row);
  return { ...artifact, sequences: artifact.sequences.map(replace), adjudications: artifact.adjudications.map(replace) };
}

/** A ruling on a named entry, with the limb it cites. */
// [::TICKET::] PX-267 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-267 --for-spec --no-implementation-order`.
function rulingOn(subject, limb) {
  return { subject, outcome: 'notASequence', reader: 'span', [PREDICATE_LIMB_FIELD]: limb };
}

/** Apply one reading to a scratch copy of the artifact, and report the reader's refusal. */
// [::TICKET::] PX-267 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-267 --for-spec --no-implementation-order`.
function applyRuling(reading) {
  const artifactPath = join(mkdtempSync(join(tmpdir(), 'px267-limb-')), 'ledger-sequences.json');
  writeArtifact(artifactPath, golden);
  return applyReadings({ artifactPath, readings: [reading], artifact: golden, specLines: spec.lines });
}

/** The artifact the fixture's own readings compose, read fresh so no test mutates another's copy. */
// [::TICKET::] PX-267 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-267 --for-spec --no-implementation-order`.
function composed() {
  const { declaration, readings } = RUN_INPUT;
  return buildArtifact({
    specPath: SPEC_PATH,
    spec,
    declaration,
    readings: {
      sequences: readings.sequences,
      steps: readings.steps,
      operations: readings.operations,
      adjudications: readings.adjudications,
    },
  });
}

// ---------------------------------------------------------------------------
// C001 — the vocabulary is the declaration's, and it is declared once
// ---------------------------------------------------------------------------

test('C001 the ruling vocabulary is read from the schema, and the schema declares it', () => {
  const schema = readArtifactSchema();

  assert.deepEqual([...LIMB_RULING_OUTCOMES], schema.predicateRulings.outcomes);
  assert.equal(LIMB_RULING_OUTCOMES.length > 0, true, 'a vocabulary of nothing is the vacuity this ticket removes');
  for (const outcome of LIMB_RULING_OUTCOMES) {
    assert.equal(schema.outcomes.includes(outcome), true, `${outcome} is a declared outcome`);
  }
  assert.equal(PREDICATE_LIMB_FIELD, schema.predicateRulings.field, 'the field a ruling owes is the declaration\'s');
  assert.equal(NO_LIMB_APPLIES, schema.predicateRulings.noLimbApplies);
});

test('C001 the reader states no vocabulary of its own, and its outcomes are the schema\'s', () => {
  const readings = readFileSync(join(RAIL_DIRECTORY, 'readings.mjs'), 'utf8');

  assert.equal(/Object\.freeze\(\['notASequence'/.test(readings), false, 'the hand-written list is gone');
  assert.deepEqual([...ADJUDICATION_OUTCOMES], [...readArtifactSchema().outcomes], 'and the reader vocabulary is the schema\'s');
});

test('C001 no module under rail/ keeps an outcome list as a literal', () => {
  const declared = readArtifactSchema().outcomes.join('|');
  const pattern = new RegExp(`Object\\.freeze\\(\\['(?:${declared})'`);

  for (const name of readdirSync(RAIL_DIRECTORY).filter((file) => file.endsWith('.mjs'))) {
    const source = readFileSync(join(RAIL_DIRECTORY, name), 'utf8');
    assert.equal(pattern.test(source), false, `${name} holds a second copy of the declared vocabulary`);
  }
});

test('C001 a selection of rulings is made by the declaration, never by an outcome name written into a module', () => {
  // The defect this ticket removes had two smaller instances: the phase that asks every ruling
  // to be attacked, and the rule that a ruling claims no operation to realize. Both compared one
  // outcome name, so a project whose rulings are worded otherwise would have had its rulings
  // attacked by nobody and would have had to realize operations it had already been ruled out of.
  for (const name of ['engine.mjs', 'gates.mjs']) {
    const source = readFileSync(join(RAIL_DIRECTORY, name), 'utf8');
    for (const outcome of LIMB_RULING_OUTCOMES) {
      assert.equal(new RegExp(`outcome (===|!==) '${outcome}'`).test(source), false,
        `${name} compares an outcome against "${outcome}" instead of asking the declaration`);
    }
  }
});

// ---------------------------------------------------------------------------
// C002 — composition carries the answer the reading gave, and invents nothing
// ---------------------------------------------------------------------------

test('C002 a composed row keeps the limb its reading recorded', () => {
  const artifact = composed();
  const readings = new Map(RUN_INPUT.readings.sequences.map((reading) => [reading.subject, reading]));
  const recorded = artifact.sequences.filter((row) => readings.get(row.id)?.predicateLimb !== undefined);

  assert.equal(recorded.length > 0, true, 'the fixture rules on entries, so some row carries a limb');
  for (const row of recorded) {
    assert.equal(row[PREDICATE_LIMB_FIELD], readings.get(row.id).predicateLimb, row.id);
  }
});

test('C002 a reading that recorded no answer yields a row with no key, exactly as neighbour does', () => {
  const artifact = composed();
  const recorded = (row) => RUN_INPUT.readings.sequences.find((reading) => reading.subject === row.id)?.predicateLimb !== undefined;
  const unanswered = artifact.sequences.filter((row) => !recorded(row));

  // Both halves are asserted together: that some row carries the field is what makes the
  // absence on the others a finding rather than a property of a composer that never carries it.
  assert.equal(artifact.sequences.filter((row) => Object.hasOwn(row, PREDICATE_LIMB_FIELD)).length > 0, true,
    'the composer carries the answer it was given');
  assert.equal(unanswered.length > 0, true, 'and there are rows whose reading recorded no answer');
  for (const row of unanswered) {
    assert.equal(Object.hasOwn(row, PREDICATE_LIMB_FIELD), false, `${row.id} carries a key with no answer`);
  }
});

test('C002 an answer that is not a value is not carried', () => {
  const { declaration, readings } = RUN_INPUT;
  const composing = (limb) => buildArtifact({
    specPath: SPEC_PATH,
    spec,
    declaration,
    readings: {
      sequences: readings.sequences.map((reading) => (reading.subject === 'front-matter' ? { ...reading, predicateLimb: limb } : reading)),
      steps: readings.steps,
      operations: readings.operations,
      adjudications: readings.adjudications,
    },
  });
  const rowOf = (artifact) => artifact.sequences.find((candidate) => candidate.id === 'front-matter');

  assert.equal(rowOf(composing(NO_LIMB_APPLIES)).outcome, 'notASequence', 'the row holds the ruling');
  assert.equal(rowOf(composing(NO_LIMB_APPLIES))[PREDICATE_LIMB_FIELD], NO_LIMB_APPLIES, 'and the answer it was given');

  const answeredWithNothing = rowOf(composing(null));
  assert.equal(answeredWithNothing.outcome, 'notASequence', 'a null answer is still the same ruling');
  assert.equal(Object.hasOwn(answeredWithNothing, PREDICATE_LIMB_FIELD), false, 'and a key with no answer is not an answer');
});

// ---------------------------------------------------------------------------
// C003 — the check judges the rulings the artifact holds
// ---------------------------------------------------------------------------

test('C003 an artifact whose rulings all cite a limb is not refused', () => {
  // The refusal set being empty is only evidence when there is something it could have refused.
  assert.equal(rulingsOf(golden).length > 0, true, 'the artifact holds rulings');
  assert.equal(rulingsOf(golden).every((row) => row[PREDICATE_LIMB_FIELD] !== undefined), true, 'and every one of them cites a limb');
  assert.deepEqual(refusalsFor(golden), []);
});

test('C003 the subjects are the rulings, and every one of them is judged', () => {
  const rulings = rulingsOf(golden);
  const refusals = refusalsFor(withoutLimbs(golden));

  assert.equal(rulings.length > 0, true, 'the fixture holds rulings');
  assert.equal(refusals.length, rulings.length, 'one refusal per ruling that names no limb');
  assert.deepEqual(
    refusals.map((refusal) => refusal.subject).sort(),
    rulings.map((row) => row.subject ?? row.id).sort(),
  );
});

test('C003 the rulings of both kinds are judged: an entry\'s outcome and an adjudication\'s', () => {
  const fromEntries = golden.sequences.filter((row) => LIMB_RULING_OUTCOMES.includes(row.outcome));
  const fromAdjudications = golden.adjudications.filter((row) => LIMB_RULING_OUTCOMES.includes(row.outcome));
  const subjects = refusalsFor(withoutLimbs(golden)).map((refusal) => refusal.subject);

  assert.equal(fromEntries.length > 0, true, 'the artifact holds rulings on its entries');
  assert.equal(fromAdjudications.length > 0, true, 'and rulings recorded as adjudications');
  for (const row of fromEntries) assert.equal(subjects.includes(row.id), true, row.id);
  for (const row of fromAdjudications) assert.equal(subjects.includes(row.subject), true, row.subject);
});

test('C003 the vocabulary decides, not the name of the collection', () => {
  const decoy = { subject: 'not-a-ruling', outcome: 'non_sequence_prose', reader: 'adjudicate' };
  const artifact = { ...golden, adjudications: [...golden.adjudications, decoy] };

  // The decoy moves nothing: the subjects are the same rulings before and after it is added.
  assert.equal(rulingsOf(artifact).length, rulingsOf(golden).length, 'a row the declaration does not name as a ruling owes nothing');
  assert.deepEqual(refusalsFor(artifact), []);
});

test('C003 a declared outcome that is not a ruling is not a subject', () => {
  const notARuling = readArtifactSchema().outcomes.filter((outcome) => !LIMB_RULING_OUTCOMES.includes(outcome));
  assert.equal(notARuling.length > 0, true);

  for (const outcome of notARuling) {
    const row = golden.adjudications.find((candidate) => candidate.outcome === outcome) ?? { subject: 'x', outcome, reader: 'adjudicate' };
    const artifact = { ...golden, adjudications: [...golden.adjudications.filter((candidate) => candidate !== row), { ...row, [PREDICATE_LIMB_FIELD]: undefined }] };
    // Every ruling is stripped of its limb, so the refusal set is the subject set: the row under
    // test is then excluded for its outcome rather than merely unrefused, and a selection that
    // had silently emptied could not pass.
    const refusals = refusalsFor(withoutLimbs(artifact));

    assert.equal(refusals.some((refusal) => refusal.subject === (row.subject ?? row.id)), false, outcome);
    assert.equal(refusals.length, rulingsOf(artifact).length, `${outcome}: every ruling that names no limb is still refused`);
  }
});

test('C003 a limb outside the declaration is refused, by the check and by the reader', () => {
  const refusals = refusalsFor(withLimb(golden, 'front-matter', 'invented'));

  // The check reports the ruling it refuses and the reading it refuses: the row is named, and the
  // rule is stated in the words it was declared with.
  assert.equal(refusals.length, 1);
  assert.equal(refusals[0].subject, 'front-matter');
  assert.match(refusals[0].reason, /outside the declared limbs/);

  // The reader's refusal is the surface that holds the declaration's limbs when the reading is
  // written, and it is the one that names the limb and the limbs it could have named instead.
  const refused = applyRuling(rulingOn('front-matter', 'invented'));

  assert.equal(refused.refused[0].field, PREDICATE_LIMB_FIELD);
  assert.equal(refused.refused[0].why.includes('invented'), true);
  for (const limb of golden.pins.predicate.limbs) assert.equal(refused.refused[0].why.includes(limb), true, limb);
});

test('C003 the literal for no limb applying is a finding, not an omission', () => {
  // Acceptance is only evidence beside a refusal: the same row, ruled on with a limb the
  // declaration does not name, must be refused.
  assert.equal(refusalsFor(withLimb(golden, 'front-matter', 'invented')).length, 1, 'the row is a subject at all');
  assert.deepEqual(refusalsFor(withLimb(golden, 'front-matter', NO_LIMB_APPLIES)), []);
});

// ---------------------------------------------------------------------------
// C004 — the harness judges with the material the run read
// ---------------------------------------------------------------------------

test('C004 every checkAll call site hands over the recorded material', () => {
  const sites = [];

  for (const name of ['gates.mjs', 'run.mjs', 'phase.mjs', 'harness.mjs', 'reading.mjs']) {
    const source = readFileSync(join(RAIL_DIRECTORY, name), 'utf8');
    for (const call of source.matchAll(/checkAll\(\{([^}]*)\}/g)) sites.push({ name, call: call[0] });
  }

  assert.equal(sites.length > 0, true, 'the rail calls checkAll, so the invariant has subjects');
  for (const site of sites) assert.match(site.call, /recorded/, `${site.name}: ${site.call}`);
});

// ---------------------------------------------------------------------------
// C005 — the corpus falsifies this check, and nothing else moves
// ---------------------------------------------------------------------------

test('C005 the corpus names this check, and the mutation reddens it attributably', () => {
  const testCase = SPEC_MUTATION_CORPUS.find((candidate) => candidate.check === CHECK_ID);
  const context = { artifact: golden, specLines: spec.lines, fixtureRoot: FIXTURE_ROOT };

  assert.notEqual(testCase, undefined, 'a check no mutation names is a check the gate cannot falsify');
  assert.equal(CHECKS.some((check) => check.id === CHECK_ID), true, 'and the check is still declared');

  const outcome = runCase(testCase, context);

  assert.equal(outcome.red, true, 'the mutation leaves the run green');
  assert.equal(outcome.attributable, true, outcome.reason);
  assert.equal(outcome.reddenedCheck, CHECK_ID);
  assert.equal(outcome.reason, null);
  assert.equal(outcome.restored, true, 'the case restores the tree it read');
});

test('C005 every counter-mutation stays green over an artifact that holds rulings', () => {
  const before = digestOfTree(FIXTURE_ROOT);

  for (const counter of COUNTER_MUTATION_CORPUS) {
    const outcome = runCase(counter, { artifact: golden, specLines: spec.lines, fixtureRoot: FIXTURE_ROOT });
    assert.equal(outcome.red, false, `${counter.name} reddened correct work — the rule is defective, not the subject`);
  }
  assert.equal(digestOfTree(FIXTURE_ROOT), before, 'and the corpus restored the tree it read');
});
