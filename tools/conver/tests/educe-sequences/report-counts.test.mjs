// [::TICKET::] PX-251 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-251 --for-spec --no-implementation-order`.
// The measured block the phase driver prints (PX-251, contracts C001, C003 and C004).
//
// `healthLines` is the driver's whole report, and the measured block inside it is the same
// reading the product path prints at a console. The two surfaces print one spelling because
// the product path prints the single line and no block: a composition that only the block
// carried would not answer a reader who has only the line, and a term that only the line
// carried could not be compared with the generation before it.
//
// The predecessor is read from the status history, and the history holds the coverage
// object rather than the artifact. Version 1 of that object recorded the entry ledger under
// `sequences` and the heading partition under `rows`, so a stored generation is compared
// through a declared mapping and never by field name; the keys version 1 never measured are
// named as unmeasured rather than left silent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { COVERAGE_VERSION, coverageLine, coverageOf } from '../../.claude/scripts/educe-sequences/rail/coverage.mjs';
import { checkAll } from '../../.claude/scripts/educe-sequences/rail/engine.mjs';
import { readSpecification } from '../../.claude/scripts/educe-sequences/rail/load.mjs';
import { healthLines } from '../../.claude/scripts/educe-sequences/rail/report.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const GOLDEN_ARTIFACT = join(PROJECT_ROOT, 'tests/educe-sequences/fixtures/spec/ledger-sequences.json');
const GOLDEN_SPEC = join(PROJECT_ROOT, 'tests/educe-sequences/fixtures/spec/ledger.md');

/** The nine terms the measured line carries, in the order it carries them. */
const TERM_KEYS = ['entries', 'sequences', 'steps', 'operations', 'placed', 'excused', 'sections', 'linesReached', 'census'];

/** The golden artifact, read fresh so no test can hand another a mutated one. */
// [::TICKET::] PX-251 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-251 --for-spec --no-implementation-order`.
function goldenArtifact() {
  return JSON.parse(readFileSync(GOLDEN_ARTIFACT, 'utf8'));
}

/** The summary a completed run of the golden artifact produces. */
// [::TICKET::] PX-251 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-251 --for-spec --no-implementation-order`.
function goldenSummary() {
  const spec = readSpecification(GOLDEN_SPEC);
  const { verdicts, summary } = checkAll({ specLines: spec.lines, artifact: goldenArtifact() });
  assert.deepEqual(verdicts, [], 'the golden artifact is what a passing run looks like');
  return summary;
}

/**
 * A generation of the current shape, with the partitions summing to the sets they partition.
 *
 * The status history stores the coverage object, so a predecessor in a fixture is an input
 * rather than an expectation: this builder hands the block a like-for-like predecessor
 * instead of a record from another vocabulary.
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

/** Every line of the block that is one of the measured terms. */
// [::TICKET::] PX-251 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-251 --for-spec --no-implementation-order`.
function measuredTerms(lines) {
  return lines.filter((line) => TERM_KEYS.some((key) => line.startsWith(`${key}=`)));
}

// [::TICKET::] PX-251 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-251 --for-spec --no-implementation-order`.
function blockLines(summary, { previous = null, inquest = null } = {}) {
  const status = { phases: [], readings: {}, history: previous === null ? [] : [{ generation: 1, coverage: previous }] };
  return healthLines({ summary, status, inquest });
}

// ---------------------------------------------------------------------------
// C004 — the block is the console line, one term per line
// ---------------------------------------------------------------------------

test('C004 the block prints every term of the line, in the line order, and nothing the line does not carry', () => {
  const summary = goldenSummary();
  const line = coverageLine(summary);
  const lines = blockLines(summary);

  assert.equal(measuredTerms(lines).length, TERM_KEYS.length, lines.join(' | '));
  assert.deepEqual(
    measuredTerms(lines).map((printed) => printed.slice(0, printed.indexOf('='))),
    TERM_KEYS,
  );
  for (const printed of measuredTerms(lines)) {
    assert.equal(line.includes(printed), true, `${printed} is the line's own text`);
  }
  assert.equal(lines.some((printed) => printed.startsWith('rows=')), false, 'the heading partition is named sections');
});

test('C004 the composition the block prints is the measured artifact own', () => {
  const lines = blockLines(goldenSummary());

  assert.equal(lines.includes('entries=8 (entry 6, neighbour 2)'), true, lines.join(' | '));
  assert.equal(lines.includes('steps=6 (drawn 6, elsewhere 0)'), true, 'a measured zero prints rather than being omitted');
  assert.equal(lines.includes('operations=3 (positioned 2, suppliedRule 1)'), true);
  assert.equal(lines.includes('placed=2'), true);
  assert.equal(lines.includes('excused=1'), true);
  assert.equal(lines.includes('census=none'), true);
});

test('C004 the block prints one line per term even when the artifact places nothing', () => {
  const allEscapes = {
    spec: { lines: 4 },
    pins: { blocks: [] },
    sequences: [{ id: 'a', kind: 'entry', firstLine: 1, lastLine: 2, outcome: 'direct' }],
    steps: [],
    operations: [
      { id: 'x', position: 'excluded', grounding: { presupposition: 1 } },
      { id: 'y', position: 'suppliedRule', grounding: { presupposition: 2 } },
      { id: 'z', position: 'excluded', grounding: { presupposition: 3 } },
    ],
  };
  const spec = readSpecification(GOLDEN_SPEC);
  const { summary } = checkAll({ specLines: spec.lines, artifact: allEscapes });
  const lines = blockLines({ ...summary, ...coverageOf(allEscapes) });

  assert.equal(lines.includes('placed=0'), true, 'a zero is a measured fact, not a reason to omit the term');
  assert.equal(lines.includes('operations=3 (excluded 2, suppliedRule 1)'), true);
});

// ---------------------------------------------------------------------------
// C003/C004 — the predecessor, per term
// ---------------------------------------------------------------------------

test('C004 a predecessor of the current vocabulary carries a change on every term and no mapping note', () => {
  const previous = generation({ entries: 3, sequences: 3, steps: 5, operations: 2, placed: 1, excused: 1, sections: 9, linesReached: 40 });
  const summary = { ...goldenSummary(), ...generation({ entries: 4, sequences: 4, steps: 6, operations: 3, placed: 2, excused: 1, sections: 10, linesReached: 45 }) };

  const lines = blockLines(summary, { previous });

  assert.equal(lines.includes('entries=4 (entry 3, neighbour 1) (previous generation: 3, change +1)'), true, lines.join(' | '));
  assert.equal(lines.includes('sequences=4 (previous generation: 3, change +1)'), true);
  assert.equal(lines.includes('linesReached=45 of 60 (previous generation: 40 of 60, change +5)'), true);
  assert.equal(lines.some((line) => line.includes('measured under coverage')), false, 'a like-for-like predecessor needs no mapping named');
  assert.equal(lines.some((line) => line.includes('not measured')), false, 'every term has a counterpart in the current vocabulary');
});

test('C004 a version-1 predecessor is compared through the mapping, which is named once', () => {
  const previous = { coverage_version: 1, sequences: 375, steps: 663, operations: 76, rows: 292, linesReached: 6190, specLines: 15971 };
  const summary = { ...goldenSummary(), ...generation({ entries: 553, sequences: 68, steps: 283, operations: 257, placed: 148, excused: 109, sections: 292, linesReached: 15971, specLines: 15971 }) };

  const lines = blockLines(summary, { previous });

  assert.equal(lines.includes('entries=553 (entry 552, neighbour 1) (previous generation: 375, change +178)'), true, lines.join(' | '));
  assert.equal(lines.includes('sections=292 (previous generation: 292, change 0)'), true);
  assert.equal(lines.includes('operations=257 (positioned 148, suppliedRule 109) (previous generation: 76, change +181)'), true);

  const notes = lines.filter((line) => line.includes('measured under coverage v1'));
  assert.equal(notes.length, 1, 'the mapping is named once for the block');
  assert.match(notes[0], /entries was recorded as sequences/);
  assert.match(notes[0], /sections was recorded as rows/);
  for (const key of ['sequences', 'placed', 'excused', 'stepsDrawn']) {
    assert.match(notes[0], new RegExp(`\\b${key}\\b`), `${key} is named as never recorded, because version 1 did not measure it`);
  }
});

test('C004 a term the predecessor never measured is named, so its absence is never silent', () => {
  const previous = { coverage_version: 1, sequences: 375, steps: 663, operations: 76, rows: 292, linesReached: 6190, specLines: 15971 };
  const lines = blockLines(goldenSummary(), { previous });

  for (const key of ['sequences', 'placed', 'excused', 'census']) {
    const printed = lines.find((line) => line.startsWith(`${key}=`));
    assert.match(printed, /\(previous generation: not measured\)/, `${key} names its own absence`);
  }
  assert.equal(lines.some((line) => /previous generation: $/.test(line)), false, 'an annotation is never left empty');
  assert.equal(lines.some((line) => line.includes('previous generation: undefined')), false);
});

test('C004 a run with no measurement prints the terms alone, and still prints the apparatus lines', () => {
  const previous = generation({ entries: 3 });
  const lines = blockLines(null, { previous });

  assert.equal(lines.some((line) => line.includes('previous generation')), false, 'a missing measurement is not a zero and has no predecessor');
  assert.equal(lines.some((line) => line.includes('change')), false);
  assert.equal(lines.includes('entries=0'), true, 'the terms still print, so the block shape does not depend on the summary');
  assert.equal(lines.some((line) => line.startsWith('phasesDone=')), true);
  assert.equal(lines.some((line) => line.startsWith('checksRun=')), true);
});

// ---------------------------------------------------------------------------
// C004 — the audit lines keep their own annotations
// ---------------------------------------------------------------------------

test('C004 the audit lines keep their annotations, so the measured block is not the only thing compared', () => {
  const inquest = { asked: 5, answered: 4, exempt: 1, previous: { asked: 3, answered: 3, exempt: 0 } };
  const lines = blockLines(goldenSummary(), { previous: generation(), inquest });

  assert.equal(lines.includes('inquestAsked=5 (previous generation: 3)'), true, lines.join(' | '));
  assert.equal(lines.includes('inquestAnswered=4 (previous generation: 3)'), true);
  assert.equal(lines.includes('inquestExempt=1 (previous generation: 0)'), true);
  assert.equal(lines.some((line) => line.includes('measured under coverage')), false, 'a current-version predecessor needs no note, and the audit lines are untouched by the mapping');
});

test('C004 the measured block and the audit lines are never summed into one total', () => {
  const inquest = { asked: 5, answered: 4, exempt: 1, previous: null };
  const lines = blockLines(goldenSummary(), { inquest });

  assert.equal(lines.includes('inquestAsked=5'), true);
  const totals = lines.filter((line) => /^(entries|inquestAsked)=/.test(line)).length;
  assert.equal(totals, 2, 'the apparatus counts and the audit counts are printed as their own lines and never added');
});
