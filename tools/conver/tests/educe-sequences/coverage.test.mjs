// [::TICKET::] PX-249 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-249 --for-spec --no-implementation-order`.
// [::TICKET::] PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-248 --for-spec --no-implementation-order`.
// What a generation measured (PX-245, contracts C002-C005).
//
// A generation used to be refused when it repeated over an unchanged set, and the only
// ways to clear that refusal were to edit the inviolable specification or to supply
// material — an automatic run stopped until a human acted. What stands in its place is a
// measurement: the artifact's own counts and the specification lines it reaches, each
// printed beside the generation before it, so a reader sees whether the returns are
// diminishing and decides outside the run whether to invoke it again.
//
// Nothing here gates on growth. The specification's true sequence space is not knowable
// from inside the rail, and a generation that merges two sequences into one is an
// improvement carrying a smaller number, so a threshold on any of these counts would
// refuse the work it is meant to encourage.
//
// @verifies C002
// @verifies C003
// @verifies C004
// @verifies C005
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import {
  COVERAGE_VERSION,
  censusSpelling,
  coverageLine,
  coverageOf,
  isComparableCoverage,
  predecessorLine,
  predecessorValueFor,
} from '../../.claude/scripts/educe-sequences/rail/coverage.mjs';
import { CHECKS, checkAll, ENGINE_DECLARED_CHECK_COUNT } from '../../.claude/scripts/educe-sequences/rail/engine.mjs';
import { readSpecification } from '../../.claude/scripts/educe-sequences/rail/load.mjs';
import { healthLines } from '../../.claude/scripts/educe-sequences/rail/report.mjs';
import { appendHistory } from '../../.claude/scripts/educe-sequences/rail/run-state.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const RAIL_DIRECTORY = join(PROJECT_ROOT, '.claude/scripts/educe-sequences/rail');
const GOLDEN_ARTIFACT = join(PROJECT_ROOT, 'tests/educe-sequences/fixtures/spec/ledger-sequences.json');
const GOLDEN_SPEC = join(PROJECT_ROOT, 'tests/educe-sequences/fixtures/spec/ledger.md');

/** The golden artifact, read fresh so no test can hand another a mutated one. */
// [::TICKET::] PX-245 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-245 --for-spec --no-implementation-order`.
function goldenArtifact() {
  return JSON.parse(readFileSync(GOLDEN_ARTIFACT, 'utf8'));
}

/** Every integer from `first` to `last`, or none when either end is not one. */
// [::TICKET::] PX-245 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-245 --for-spec --no-implementation-order`.
function range(first, last) {
  if (!Number.isInteger(first) || !Number.isInteger(last)) return [];
  const lines = [];
  for (let line = first; line <= last; line += 1) lines.push(line);
  return lines;
}

/** The lines the artifact declares, computed here so the assertion is independent. */
// [::TICKET::] PX-245 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-245 --for-spec --no-implementation-order`.
function declaredLinesIn(artifact) {
  return [
    ...artifact.sequences.flatMap((sequence) => range(sequence.firstLine, sequence.lastLine)),
    ...artifact.operations.map((operation) => operation.grounding?.presupposition),
  ].filter((line) => Number.isInteger(line) && line >= 1 && line <= artifact.spec.lines);
}

// ---------------------------------------------------------------------------
// C002 — the measured counts, and the specification lines the artifact reaches
// ---------------------------------------------------------------------------

test('C002 coverageOf returns the artifact counts and the clipped union of the lines it declares', () => {
  const artifact = goldenArtifact();

  const measured = coverageOf(artifact);

  // The ledger and the sequences it claims are two sets, and the golden fixture holds eight
  // entries of which two claim a sequence: printing the ledger under the word `sequences`
  // is the defect this ticket removes.
  assert.equal(measured.entries, artifact.sequences.length);
  assert.equal(measured.entries, 8);
  assert.deepEqual(measured.entriesByKind, { entry: 6, neighbour: 2 });
  assert.equal(measured.sequences, 2);
  assert.equal(measured.steps, artifact.steps.length);
  assert.equal(measured.stepsDrawn, 6);
  assert.equal(measured.operations, artifact.operations.length);
  assert.deepEqual(measured.operationsByPosition, { positioned: 2, suppliedRule: 1 });
  assert.equal(measured.placed, 2);
  assert.equal(measured.excused, 1);
  assert.equal(measured.sections, artifact.pins.blocks.length);
  assert.equal(measured.specLines, artifact.spec.lines);
  assert.equal(measured.linesReached, new Set(declaredLinesIn(artifact)).size);
});

test('C002 a record whose line field is absent or not a number contributes nothing and raises nothing', () => {
  const thin = {
    spec: { lines: 40 },
    pins: { blocks: [] },
    sequences: [{ id: 'admission', kind: 'entry', outcome: null }],
    steps: [],
    operations: [{ id: 'Admit', grounding: {} }, { id: 'Release', grounding: { presupposition: 'n/a' } }],
  };

  assert.doesNotThrow(() => coverageOf(thin));
  assert.equal(coverageOf(thin).linesReached, 0);
});

test('C002 a line of 0 or beyond specLines is not counted, and a line declared twice counts once', () => {
  const clipped = {
    spec: { lines: 10 },
    pins: { blocks: [] },
    sequences: [
      { id: 'a', kind: 'entry', firstLine: 0, lastLine: 3, outcome: null },
      { id: 'b', kind: 'entry', firstLine: 3, lastLine: 3, outcome: null },
      { id: 'c', kind: 'entry', firstLine: 8, lastLine: 99, outcome: null },
    ],
    steps: [],
    operations: [],
  };

  // 1, 2, 3 from the first two records and 8, 9, 10 from the third: 0 is below the
  // document, 99 is past its end, and line 3 is named twice but is one line.
  assert.equal(coverageOf(clipped).linesReached, 6);
});

test('C002 coverageOf is a pure function of its argument, so two calls on one artifact agree', () => {
  const artifact = goldenArtifact();

  assert.deepEqual(coverageOf(artifact), coverageOf(artifact));
  assert.deepEqual(coverageOf(structuredClone(artifact)), coverageOf(artifact));
});

// ---------------------------------------------------------------------------
// C001 — one measurement, one spelling, and each term names the set it counts
// ---------------------------------------------------------------------------

test('C001 the measured line states what each number counts, and of is used once', () => {
  const line = coverageLine(coverageOf(goldenArtifact()));

  assert.equal(
    line,
    'entries=8 (entry 6, neighbour 2) sequences=2 steps=6 (drawn 6, elsewhere 0) '
      + 'operations=3 (positioned 2, suppliedRule 1) placed=2 excused=1 sections=10 '
      + 'linesReached=60 of 60 census=none',
  );
  assert.equal(line.includes('rows='), false, 'the heading partition is named sections, not rows');
  assert.equal(line.indexOf(' of '), line.lastIndexOf(' of '), 'of names a reach and nothing else');
});

test('C001 a partition is total: every member prints, the order is by name, and a zero is a fact', () => {
  const measured = {
    entries: 3, entriesByKind: { neighbour: 2, entry: 1 }, sequences: 1,
    steps: 2, stepsDrawn: 0, operations: 0, operationsByPosition: {},
    placed: 0, excused: 0, sections: 0, linesReached: 0, specLines: 3,
    operationsEnumerated: null,
  };

  const line = coverageLine(measured);

  assert.equal(line.includes('entries=3 (entry 1, neighbour 2)'), true, 'the members are sorted by name and none is dropped');
  assert.equal(line.includes('steps=2 (drawn 0, elsewhere 2)'), true, 'a measured zero is printed rather than omitted');
  assert.equal(line.includes('operations=0 '), true);
});

test('C001 a step is drawn only when its owning entry claims a sequence', () => {
  const artifact = {
    spec: { lines: 3 },
    pins: { blocks: [] },
    sequences: [
      { id: 'a', kind: 'entry', firstLine: 1, lastLine: 1, outcome: 'direct' },
      { id: 'b', kind: 'entry', firstLine: 2, lastLine: 2, outcome: 'notASequence' },
      { id: 'c', kind: 'entry', firstLine: 3, lastLine: 3 },
    ],
    steps: [{ id: 's1', sequence: 'a' }, { id: 's2', sequence: 'b' }, { id: 's3', sequence: 'c' }],
    operations: [],
  };

  const measured = coverageOf(artifact);

  assert.equal(measured.steps, 3);
  assert.equal(measured.stepsDrawn, 1, 'only the entry ruled direct claims a sequence');
  assert.equal(coverageLine(measured).includes('steps=3 (drawn 1, elsewhere 2)'), true);
});

test('C001 a thin artifact measures zero and null rather than raising', () => {
  const thin = coverageOf({});

  assert.equal(thin.entries, 0);
  assert.deepEqual(thin.entriesByKind, {}, 'a partition of nothing has no members');
  assert.equal(thin.sequences, 0);
  assert.equal(thin.steps, 0);
  assert.equal(thin.stepsDrawn, 0);
  assert.equal(thin.operations, 0);
  assert.equal(thin.placed, 0);
  assert.equal(thin.excused, 0);
  assert.equal(thin.sections, 0);
  assert.equal(thin.specLines, 0);
  assert.equal(thin.operationsEnumerated, null, 'a denominator nobody supplied is not a zero');
  assert.equal(coverageLine(thin).includes('census=none'), true);
});

test('C001 every partition sums to the set it partitions and the identities hold', () => {
  const thin = coverageOf({});
  const golden = coverageOf(goldenArtifact());

  for (const measured of [golden, thin]) {
    assert.equal(Object.values(measured.entriesByKind).reduce((sum, count) => sum + count, 0), measured.entries);
    assert.equal(Object.values(measured.operationsByPosition).reduce((sum, count) => sum + count, 0), measured.operations);
    assert.equal(measured.placed + measured.excused, measured.operations);
    assert.equal(measured.sequences <= measured.entries, true);
    assert.equal(measured.stepsDrawn <= measured.steps, true);
    assert.equal(measured.linesReached <= measured.specLines, true);
  }
});

// ---------------------------------------------------------------------------
// C002 — a borrowed denominator, and a denominator nobody supplied
// ---------------------------------------------------------------------------

test('C002 an unborrowed census is named as absent rather than replaced by the record count', () => {
  const measured = coverageOf(goldenArtifact());

  assert.equal(censusSpelling(measured), 'none');
  const line = coverageLine(measured);
  assert.equal(line.endsWith('census=none'), true);
  assert.equal(line.includes('operations=3 (positioned 2, suppliedRule 1) placed=2 excused=1'), true);
  assert.equal(/operations=3[^c]*enumerated/.test(line), false, 'the record count is never spelled as a census');
});

test('C002 a borrowed census prints its own denominator beside the declared one', () => {
  const measured = coverageOf(goldenArtifact());
  const borrowed = { ...measured, operationsEnumerated: 7, operationsReached: 5, operationsExcused: 2 };

  assert.equal(censusSpelling(borrowed), '7 (reached 5, excused 2)');
  assert.equal(borrowed.operationsReached + borrowed.operationsExcused, borrowed.operationsEnumerated);
  const line = coverageLine(borrowed);
  assert.equal(line.includes('census=7 (reached 5, excused 2)'), true);
  assert.equal(line.includes('operations=3 (positioned 2, suppliedRule 1) placed=2 excused=1'), true, 'both denominators print, and neither is substituted for the other');
  assert.equal(censusSpelling({ ...measured, operationsEnumerated: 0, operationsReached: 0, operationsExcused: 0 }), '0 (reached 0, excused 0)', 'a supplied census that is empty is not an absent census');
});

// ---------------------------------------------------------------------------
// C003 — every measured count reads beside the generation before it
// ---------------------------------------------------------------------------

/**
 * A generation of the current shape, with the partitions summing to the sets they partition.
 *
 * The predecessor a run compares against is stored in the status history, so a fixture for
 * it is an input rather than an expectation: this builder is what lets a test hand the
 * block a like-for-like predecessor instead of a record from another vocabulary.
 */
// [::TICKET::] PX-251 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-251 --for-spec --no-implementation-order`.
function generation(overrides = {}) {
  const entries = overrides.entries ?? 8;
  const placed = overrides.placed ?? 2;
  const excused = overrides.excused ?? 1;
  return {
    coverage_version: COVERAGE_VERSION,
    entries,
    entriesByKind: { entry: entries - 1, neighbour: 1 },
    sequences: overrides.sequences ?? 2,
    steps: overrides.steps ?? 6,
    stepsDrawn: overrides.stepsDrawn ?? (overrides.steps ?? 6),
    operations: overrides.operations ?? placed + excused,
    operationsByPosition: { positioned: placed, suppliedRule: excused },
    placed,
    excused,
    sections: overrides.sections ?? 10,
    linesReached: overrides.linesReached ?? 45,
    specLines: overrides.specLines ?? 60,
    operationsEnumerated: null,
    operationsReached: null,
    operationsExcused: null,
  };
}

/** The summary a completed run of the golden artifact produces. */
// [::TICKET::] PX-245 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-245 --for-spec --no-implementation-order`.
function goldenSummary() {
  const spec = readSpecification(GOLDEN_SPEC);
  const { verdicts, summary } = checkAll({ specLines: spec.lines, artifact: goldenArtifact() });
  assert.deepEqual(verdicts, [], 'the golden artifact is what a passing run looks like');
  return summary;
}

test('C003 a measured count prints with the previous generation beside it, and alone when there is none', () => {
  const previous = generation({ entries: 3, sequences: 3, steps: 5, operations: 2, placed: 1, excused: 1, sections: 9, linesReached: 40 });
  const status = { phases: [], readings: {}, history: [{ generation: 1, coverage: previous }] };
  const summary = { ...goldenSummary(), ...generation({ entries: 4, sequences: 4, steps: 6, operations: 3, placed: 2, excused: 1, sections: 10, linesReached: 45 }) };

  const lines = healthLines({ summary, status });

  assert.equal(lines.includes('entries=4 (entry 3, neighbour 1) (previous generation: 3, change +1)'), true, lines.join(' | '));
  assert.equal(lines.includes('sequences=4 (previous generation: 3, change +1)'), true);
  assert.equal(lines.includes('steps=6 (drawn 6, elsewhere 0) (previous generation: 5, change +1)'), true);
  assert.equal(lines.includes('operations=3 (positioned 2, suppliedRule 1) (previous generation: 2, change +1)'), true);
  assert.equal(lines.includes('placed=2 (previous generation: 1, change +1)'), true);
  assert.equal(lines.includes('excused=1 (previous generation: 1, change 0)'), true);
  assert.equal(lines.includes('sections=10 (previous generation: 9, change +1)'), true);
  assert.equal(lines.includes('linesReached=45 of 60 (previous generation: 40 of 60, change +5)'), true);

  const fresh = healthLines({ summary, status: { ...status, history: [] } });
  assert.equal(fresh.includes('entries=4 (entry 3, neighbour 1)'), true);
  assert.equal(fresh.some((line) => line.includes('previous generation')), false, 'a first generation has nothing to compare against');
  assert.equal(fresh.some((line) => line.includes('change')), false, 'with nothing to compare against there is no change to report');
});

test('C003 the change is signed, so a generation that measured less reads as a fall rather than a smaller number', () => {
  const status = { phases: [], readings: {}, history: [{ generation: 1, coverage: generation({ entries: 4, sequences: 4, steps: 6, operations: 3, placed: 2, excused: 1, sections: 10, linesReached: 45 }) }] };

  const fallen = healthLines({ summary: { ...goldenSummary(), ...generation({ entries: 2, sequences: 2, steps: 6, operations: 3, placed: 2, excused: 1, sections: 10, linesReached: 41 }) }, status });
  assert.equal(fallen.includes('entries=2 (entry 1, neighbour 1) (previous generation: 4, change -2)'), true, fallen.join(' | '));
  assert.equal(fallen.includes('linesReached=41 of 60 (previous generation: 45 of 60, change -4)'), true);

  const flat = healthLines({ summary: { ...goldenSummary(), ...generation({ entries: 4, sequences: 4, steps: 6, operations: 3, placed: 2, excused: 1, sections: 10, linesReached: 45 }) }, status });
  assert.equal(flat.includes('entries=4 (entry 3, neighbour 1) (previous generation: 4, change 0)'), true, 'a repeat that moved nothing says so');
  assert.equal(flat.includes('linesReached=45 of 60 (previous generation: 45 of 60, change 0)'), true);
});

test('C003 a run with no valid measurement reports no change, because a missing measurement is not a zero', () => {
  const status = {
    phases: [],
    readings: {},
    history: [{ generation: 1, coverage: generation({ entries: 4, sequences: 4, steps: 6, operations: 3, placed: 2, excused: 1, sections: 10, linesReached: 10 }) }],
  };

  // The report is built with a null summary when the checks refused, so the run has no
  // measurement at all. Subtracting from zero would print a fall the run never took.
  const lines = healthLines({ summary: null, status });

  assert.equal(lines.some((line) => line.includes('change')), false, lines.join(' | '));
  assert.equal(lines.some((line) => line.includes('previous generation')), false, lines.join(' | '));
});

test('C003 the change is withheld when the document moved, because two revisions are not one space', () => {
  const status = {
    phases: [],
    readings: {},
    history: [{ generation: 1, coverage: generation({ entries: 3, sequences: 3, steps: 5, operations: 2, placed: 1, excused: 1, sections: 9, linesReached: 40 }) }],
  };
  const summary = { ...goldenSummary(), ...generation({ entries: 4, sequences: 4, steps: 6, operations: 3, placed: 2, excused: 1, sections: 10, linesReached: 45, specLines: 70 }) };

  const lines = healthLines({ summary, status });

  assert.equal(lines.includes('linesReached=45 of 70 (previous generation: 40 of 60)'), true, lines.join(' | '));
  assert.equal(lines.some((line) => /linesReached=.*change/.test(line)), false, 'a reach change across two lengths compares different documents');
  assert.equal(lines.includes('sequences=4 (previous generation: 3, change +1)'), true, 'the counts do not share that limit, so they keep their change');
});

test('C003 no measured count is ever summed with its predecessor', () => {
  const summary = { ...goldenSummary(), ...generation({ entries: 4, sequences: 4, steps: 6, operations: 3, placed: 2, excused: 1, sections: 10, linesReached: 45 }) };
  const status = { phases: [], readings: {}, history: [{ generation: 1, coverage: generation({ entries: 3, sequences: 3, steps: 5, operations: 2, placed: 1, excused: 1, sections: 9, linesReached: 40 }) }] };

  const lines = healthLines({ summary, status });

  assert.equal(lines.some((line) => /entries=7/.test(line)), false, 'the two generations are never added');
  assert.equal(lines.some((line) => /sequences=7/.test(line)), false);
  assert.equal(lines.some((line) => /linesReached=85/.test(line)), false);
});

test('C003 a generation that measured less than the one before it prints the smaller number and says so', () => {
  const summary = { ...goldenSummary(), ...generation({ entries: 8, sequences: 2, steps: 6, operations: 3, placed: 2, excused: 1, sections: 10, linesReached: 45 }) };
  const status = { phases: [], readings: {}, history: [{ generation: 1, coverage: generation({ entries: 8, sequences: 4, steps: 6, operations: 3, placed: 2, excused: 1, sections: 10, linesReached: 45 }) }] };

  const lines = healthLines({ summary, status });

  assert.equal(lines.includes('sequences=2 (previous generation: 4, change -2)'), true, lines.join(' | '));
});

// ---------------------------------------------------------------------------
// C003 — a predecessor measured under another vocabulary is compared per key
// ---------------------------------------------------------------------------

/**
 * A generation as version 1 of this report recorded it.
 *
 * Version 1 stored the entry ledger under `sequences`, the heading partition under `rows`,
 * and never recorded the claiming count or the placement at all. `run.mjs` reads the
 * predecessor from the status history, and the history holds the coverage object rather
 * than the artifact, so these fields are all that survives of that generation.
 */
const VERSION_ONE_GENERATION = Object.freeze({
  coverage_version: 1,
  sequences: 375,
  steps: 663,
  operations: 76,
  rows: 292,
  linesReached: 6190,
  specLines: 15971,
});

test('C003 a version-1 predecessor is compared per key through the declared mapping', () => {
  assert.equal(predecessorValueFor('entries', VERSION_ONE_GENERATION), 375, 'version 1 called the ledger sequences');
  assert.equal(predecessorValueFor('sections', VERSION_ONE_GENERATION), 292, 'version 1 called the heading partition rows');
  assert.equal(predecessorValueFor('steps', VERSION_ONE_GENERATION), 663);
  assert.equal(predecessorValueFor('operations', VERSION_ONE_GENERATION), 76);
  assert.equal(predecessorValueFor('linesReached', VERSION_ONE_GENERATION), 6190);
  assert.equal(predecessorValueFor('specLines', VERSION_ONE_GENERATION), 15971);

  for (const key of ['sequences', 'placed', 'excused', 'stepsDrawn', 'entriesByKind', 'operationsByPosition', 'census']) {
    assert.equal(predecessorValueFor(key, VERSION_ONE_GENERATION), null, `${key} was never measured by version 1`);
    assert.equal(predecessorValueFor(key, null), null);
  }
});

test('C003 the predecessor is respelled in the current vocabulary rather than read by name', () => {
  assert.equal(
    predecessorLine(VERSION_ONE_GENERATION),
    'entries=375 steps=663 operations=76 sections=292 linesReached=6190 of 15971',
  );
  assert.equal(predecessorLine(VERSION_ONE_GENERATION).includes('undefined'), false, 'a version-1 record is never spelled by coverageLine');
  assert.equal(predecessorLine(null), null);
});

test('C003 the comparability of a stored record is its version, not its shape', () => {
  assert.equal(isComparableCoverage(VERSION_ONE_GENERATION), false);
  assert.equal(isComparableCoverage(coverageOf(goldenArtifact())), true);
  assert.equal(isComparableCoverage(null), false);
  assert.equal(isComparableCoverage({}), false);
});

test('C003 a version-1 predecessor yields mapped deltas and names what it never measured', () => {
  const summary = { ...goldenSummary(), ...generation({ entries: 553, sequences: 68, steps: 283, operations: 257, placed: 148, excused: 109, sections: 292, linesReached: 15971, specLines: 15971 }) };
  const status = { phases: [], readings: {}, history: [{ generation: 2, coverage: VERSION_ONE_GENERATION }] };

  const lines = healthLines({ summary, status });

  assert.equal(lines.includes('entries=553 (entry 552, neighbour 1) (previous generation: 375, change +178)'), true, lines.join(' | '));
  assert.equal(lines.includes('operations=257 (positioned 148, suppliedRule 109) (previous generation: 76, change +181)'), true);
  assert.equal(lines.includes('sections=292 (previous generation: 292, change 0)'), true);
  for (const key of ['sequences', 'placed', 'excused']) {
    assert.equal(lines.some((line) => line.startsWith(`${key}=`) && line.includes('(previous generation: not measured)')), true, `${key} names its own absence`);
  }
  assert.equal(lines.some((line) => /previous generation: $/.test(line)), false, 'an annotation is never left empty');
});

// ---------------------------------------------------------------------------
// C004 — the checks never decide on coverage
// ---------------------------------------------------------------------------

// [::TICKET::] PX-247 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-247 --for-spec --no-implementation-order`.
test('C004 attaching a coverage value to an artifact moves no verdict', () => {
  const spec = readSpecification(GOLDEN_SPEC);
  const artifact = goldenArtifact();

  const baseline = checkAll({ specLines: spec.lines, artifact });
  const decorated = { ...artifact, coverage: coverageOf(artifact) };
  const after = checkAll({ specLines: spec.lines, artifact: decorated });

  assert.deepEqual(after.verdicts, baseline.verdicts);
  assert.equal(after.summary.checksRun, baseline.summary.checksRun);
  assert.equal(ENGINE_DECLARED_CHECK_COUNT, CHECKS.length);
  assert.equal(ENGINE_DECLARED_CHECK_COUNT, 29, 'PX-246 through PX-249 each added checks, and none of them is a growth gate');
});

// [::TICKET::] PX-247 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-247 --for-spec --no-implementation-order`.
test('C002 an unreadable file answers "nothing on record" rather than stopping the run', () => {
  // Both reads this ticket added ask the same kind of question — what does this file
  // say — and for that question a file that cannot be read and a file that is not there
  // have the same answer. Neither may take down a path that would otherwise finish.
  const root = mkdtempSync(join(tmpdir(), 'educe-unreadable-'));
  const specPath = join(root, 'ledger.md');
  copyFileSync(GOLDEN_SPEC, specPath);
  copyFileSync(GOLDEN_ARTIFACT, join(root, 'ledger-sequences.json'));
  const runDirectory = join(root, 'educe-sequences');
  mkdirSync(runDirectory, { recursive: true });
  // A record that parses as a prefix of itself. The rail no longer writes one — the status
  // is replaced rather than written into — so this stands for what a hand, a half-finished
  // copy or an older run can still leave beside a specification.
  writeFileSync(join(runDirectory, 'status.json'), '{ "spec": { "path": "ledger.md"');

  const verified = spawnSync('node', [join(PROJECT_ROOT, '.claude/scripts/educe-sequences/rail/run.mjs'), specPath], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
  });

  assert.equal(verified.status, 0, verified.stderr);
  assert.match(verified.stdout, /sequences=2/);
  assert.match(verified.stdout, /entries=8 \(entry 6, neighbour 2\)/);
  assert.equal(/previous generation/.test(verified.stdout), false, 'an unreadable record yields no comparison and no crash');
});

test('C002 begin opens a generation over an unreadable artifact rather than throwing', () => {
  const root = mkdtempSync(join(tmpdir(), 'educe-unreadable-artifact-'));
  const specPath = join(root, 'ledger.md');
  copyFileSync(GOLDEN_SPEC, specPath);
  writeFileSync(join(root, 'ledger-sequences.json'), '{ "schema_version": 1,');

  const begun = spawnSync('node', [join(PROJECT_ROOT, '.claude/scripts/educe-sequences/rail/phase.mjs'), 'begin', specPath], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
  });

  assert.equal(begun.status, 0, begun.stderr);
  assert.match(begun.stdout, /generation 1 \(new generation\)/);
  assert.equal(/superseded generation measured/.test(begun.stdout), false, 'there is no measurement to record, so none is claimed');
});

test('C004 the change between generations is a printed string and never a value the rail holds', () => {
  const spec = readSpecification(GOLDEN_SPEC);
  const artifact = goldenArtifact();

  // It is computed inside the print, so it cannot leave the report: not in what
  // `coverageOf` returns, and not in the summary a check is handed.
  assert.deepEqual(
    Object.keys(coverageOf(artifact)).sort(),
    ['coverage_version', 'entries', 'entriesByKind', 'excused', 'linesReached', 'operations', 'operationsByPosition', 'operationsEnumerated', 'operationsExcused', 'operationsReached', 'placed', 'sections', 'sequences', 'specLines', 'steps', 'stepsDrawn'],
  );
  const { summary } = checkAll({ specLines: spec.lines, artifact });
  assert.equal(Object.keys(summary).some((key) => /change|delta|previous/i.test(key)), false, Object.keys(summary).join(', '));

  const measured = coverageOf(artifact);
  const status = { phases: [], readings: {}, history: [{ generation: 1, coverage: { ...measured, sequences: measured.sequences - 1 } }] };
  assert.equal(healthLines({ summary, status }).some((line) => line.includes('change')), true, 'the change is reported, so the two absences above are about where it lives');
});

test('C004 no module under rail/ compares a coverage number against a threshold', () => {
  const modules = readdirSync(RAIL_DIRECTORY).filter((name) => name.endsWith('.mjs'));
  assert.equal(modules.length > 0, true);

  for (const name of modules) {
    const text = readFileSync(join(RAIL_DIRECTORY, name), 'utf8');
    assert.equal(/linesReached\s*[<>]=?\s*\d/.test(text), false, `${name} compares linesReached to a constant`);
    assert.equal(/coverage\.(sequences|operations|steps|rows|entries|placed|excused|stepsDrawn|sections)\s*[<>]=?\s*\d/.test(text), false, `${name} compares a coverage count to a constant`);
  }
});

// ---------------------------------------------------------------------------
// C005 — history is append-only, so a later generation cannot rewrite an earlier one
// ---------------------------------------------------------------------------

test('C005 appendHistory adds one entry carrying its coverage and leaves the earlier entries alone', () => {
  const coverage = { sequences: 4, steps: 6, operations: 3, rows: 10, linesReached: 45, specLines: 60 };
  const earlier = { generation: 1, coverage: { sequences: 3, steps: 5, operations: 2, rows: 9, linesReached: 40, specLines: 60 } };
  const before = { phases: [], history: [earlier] };

  const after = appendHistory(before, { generation: 2, phases: [], inquest: null, entered: true, coverage });

  assert.equal(after.history.length, 2);
  assert.deepEqual(after.history[0], earlier, 'the superseded generation keeps the numbers it was measured with');
  assert.deepEqual(after.history[1].coverage, coverage);
  assert.equal(before.history.length, 1, 'the status handed in is not mutated');
  assert.notEqual(after.history, before.history);
});
