// [::TICKET::] PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-248 --for-spec --no-implementation-order`.
// Every line of the specification belongs to an entry (PX-247, C001, C002, C003, C004).
//
// The census counts sections and the reach check counts operations, and neither counts
// lines. A section is satisfied by an entry that starts at its first line however little
// of the section it spans, so the union of entry spans could cover a fraction of the
// document while every gate passed — measured on the golden fixture at 51 of 60 lines
// belonging to nobody. This file holds the rule that closes it, on both surfaces: the
// phase-5 gate and the check the product path reads.
//
// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { uncoveredRanges } from '../../.claude/scripts/educe-sequences/rail/coverage.mjs';
import { CHECKS, ENGINE_DECLARED_CHECK_COUNT, checkAll } from '../../.claude/scripts/educe-sequences/rail/engine.mjs';
import { readSpecification } from '../../.claude/scripts/educe-sequences/rail/load.mjs';
import { writeReadingsFile } from '../../.claude/scripts/educe-sequences/rail/readings.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SPEC_PATH = join(PROJECT_ROOT, 'tests/educe-sequences/fixtures/spec/ledger.md');
const GOLDEN_PATH = join(PROJECT_ROOT, 'tests/educe-sequences/fixtures/spec/ledger-sequences.json');
const RUN_INPUT_PATH = join(PROJECT_ROOT, 'tests/educe-sequences/fixtures/spec/ledger.run.json');
const DESIGN_DOC = join(PROJECT_ROOT, 'docs/EDUCE-SEQUENCES-DESIGN.md');
const PHASE = join(PROJECT_ROOT, '.claude/scripts/educe-sequences/rail/phase.mjs');
const RUN_RAIL = join(PROJECT_ROOT, '.claude/scripts/educe-sequences/rail/run.mjs');

const spec = readSpecification(SPEC_PATH);
const RUN_INPUT = JSON.parse(readFileSync(RUN_INPUT_PATH, 'utf8'));

/** The golden artifact, read fresh so no test can hand another a mutated one. */
// [::TICKET::] PX-247 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-247 --for-spec --no-implementation-order`.
function golden() {
  return JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
}

/** Every line the given spans cover, as a set. */
// [::TICKET::] PX-247 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-247 --for-spec --no-implementation-order`.
function coveredLines(spans) {
  const covered = new Set();
  for (const span of spans) {
    for (let line = span.firstLine; line <= span.lastLine; line += 1) covered.add(line);
  }
  return covered;
}

/**
 * A run directory holding a copy of the specification, opened through phases 0 and 1.
 *
 * Phase 5 requires phase 1, so a run entered directly at the gate the test is about would
 * be refused for its order rather than for its coverage.
 */
// [::TICKET::] PX-247 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-247 --for-spec --no-implementation-order`.
function scratchRun() {
  const root = mkdtempSync(join(tmpdir(), 'px247-lines-'));
  copyFileSync(SPEC_PATH, join(root, 'ledger.md'));
  const directory = join(root, 'educe-sequences');
  mkdirSync(directory, { recursive: true });
  const specPath = join(root, 'ledger.md');

  assert.equal(spawnSync('node', [PHASE, 'begin', specPath], { encoding: 'utf8' }).status, 0);
  assert.equal(spawnSync('node', [PHASE, 'run', specPath, '1'], { encoding: 'utf8' }).status, 0);
  return { specPath, directory };
}

/** Declare the given entries, keeping every other section of the declaration as the fixture states it. */
// [::TICKET::] PX-247 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-247 --for-spec --no-implementation-order`.
function declare(directory, entries) {
  const declaration = { ...RUN_INPUT.declaration, entries };
  writeFileSync(join(directory, 'declaration.json'), `${JSON.stringify(declaration, null, 2)}\n`);
}

/** The verdicts one check raised over an artifact, by check id. */
// [::TICKET::] PX-247 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-247 --for-spec --no-implementation-order`.
function verdictsOf(artifact, check) {
  return checkAll({ specLines: spec.lines, artifact }).verdicts.filter((verdict) => verdict.check === check);
}

// ---------------------------------------------------------------------------
// C001 — the runs of lines no span reaches
// ---------------------------------------------------------------------------

test('C001 the range rule returns the runs no span reaches, one range per gap', () => {
  const spans = [{ firstLine: 1, lastLine: 3 }, { firstLine: 6, lastLine: 8 }];

  assert.deepEqual(uncoveredRanges({ spans, lineCount: 8 }), [{ first: 4, last: 5 }]);
  assert.deepEqual(uncoveredRanges({ spans: [{ firstLine: 1, lastLine: 8 }], lineCount: 8 }), []);
  assert.deepEqual(
    uncoveredRanges({ spans: [{ firstLine: 3, lastLine: 4 }, { firstLine: 5, lastLine: 6 }], lineCount: 6 }),
    [{ first: 1, last: 2 }],
  );
});

test('C001 a document with no spans is one range, and a span reaching outside the document covers only what is inside it', () => {
  assert.deepEqual(uncoveredRanges({ spans: [], lineCount: 3 }), [{ first: 1, last: 3 }]);
  assert.deepEqual(uncoveredRanges({ spans: [{ firstLine: 2, lastLine: 99 }], lineCount: 4 }), [{ first: 1, last: 1 }]);
  assert.deepEqual(uncoveredRanges({ spans: [{ firstLine: -5, lastLine: 2 }], lineCount: 4 }), [{ first: 3, last: 4 }]);
});

test('C001 a malformed span covers no line rather than raising', () => {
  const uncovered = [{ first: 1, last: 3 }];

  assert.deepEqual(uncoveredRanges({ spans: [{ firstLine: 'x', lastLine: 8 }], lineCount: 3 }), uncovered);
  assert.deepEqual(uncoveredRanges({ spans: [{ firstLine: 5, lastLine: 2 }], lineCount: 3 }), uncovered);
  assert.deepEqual(uncoveredRanges({ spans: [{}], lineCount: 3 }), uncovered);
});

// The declaration is reader-supplied, so a mistyped line number is data rather than an
// impossibility. A span claiming more lines than the document has must cost the document's
// length and not the span's: the gate runs on every phase, and a run that exhausts memory
// on a typo is a run nobody can repair.
test('C001 a span reaching past the document is clipped to the document rather than walked', { timeout: 5000 }, () => {
  const spans = [{ firstLine: 1, lastLine: Number.MAX_SAFE_INTEGER }];

  assert.deepEqual(uncoveredRanges({ spans, lineCount: 4 }), []);
  assert.deepEqual(uncoveredRanges({ spans: [{ firstLine: 3, lastLine: Number.MAX_SAFE_INTEGER }], lineCount: 4 }), [
    { first: 1, last: 2 },
  ]);
});

test('C001 the ranges are ascending, never adjacent, and every line they name lies inside no span', () => {
  const spans = [{ firstLine: 1, lastLine: 3 }, { firstLine: 6, lastLine: 8 }];
  const ranges = uncoveredRanges({ spans, lineCount: 8 });
  const covered = coveredLines(spans);

  for (const range of ranges) {
    assert.equal(range.last >= range.first, true);
    for (let line = range.first; line <= range.last; line += 1) assert.equal(covered.has(line), false);
  }
  for (let index = 1; index < ranges.length; index += 1) {
    assert.equal(ranges[index].first > ranges[index - 1].last + 1, true, 'two adjacent ranges would be one range');
  }
});

// ---------------------------------------------------------------------------
// C002 — the phase-5 gate
// ---------------------------------------------------------------------------

test('C002 phase 5 refuses a declaration whose entries leave a line to nobody, naming the first such line', () => {
  const run = scratchRun();
  declare(run.directory, [
    { id: 'a', kind: 'entry', firstLine: 1, lastLine: 3 },
    { id: 'b', kind: 'entry', firstLine: 5, lastLine: spec.lineCount },
  ]);

  const refused = spawnSync('node', [PHASE, 'run', run.specPath, '5'], { encoding: 'utf8' });

  assert.equal(refused.status, 1);
  assert.match(refused.stdout, /line 4 belongs to no entry, so nothing was read there/);
  assert.match(refused.stdout, /back to: phase 1/);
});

test('C002 phase 5 passes the same document once an entry covers the line', () => {
  const run = scratchRun();
  declare(run.directory, [{ id: 'all', kind: 'entry', firstLine: 1, lastLine: spec.lineCount }]);

  const passed = spawnSync('node', [PHASE, 'run', run.specPath, '5'], { encoding: 'utf8' });

  assert.equal(passed.status, 0);
  assert.match(passed.stdout, /entries cover every line/);
});

test('C002 the rule is over the document, not the partition: a line before the first heading is inside it', () => {
  const run = scratchRun();
  // The fixture's sections begin at line 3, so a declaration tiled from the first
  // heading still leaves the two lines of the title block to nobody.
  declare(run.directory, [{ id: 'sections-only', kind: 'entry', firstLine: 3, lastLine: spec.lineCount }]);

  const refused = spawnSync('node', [PHASE, 'run', run.specPath, '5'], { encoding: 'utf8' });

  assert.equal(refused.status, 1);
  assert.match(refused.stdout, /line 1 belongs to no entry/);
});

// ---------------------------------------------------------------------------
// C003 — the check, and its agreement with the gate
// ---------------------------------------------------------------------------

test('C003 the check names one verdict per uncovered range and prints no summary beside a verdict', () => {
  const gapped = golden();
  gapped.sequences = gapped.sequences.filter((sequence) => sequence.id !== 'front-matter' && sequence.id !== 'cancellation');

  const { verdicts, summary } = checkAll({ specLines: spec.lines, artifact: gapped });

  assert.deepEqual(verdicts.map((verdict) => verdict.check), [
    'every-line-belongs-to-an-entry',
    'every-line-belongs-to-an-entry',
  ]);
  assert.deepEqual(verdicts.map((verdict) => verdict.subject), ['1-23', '36-48']);
  assert.equal(summary, null);
});

test('C003 an artifact with no verdict covers every line, and the check count follows the registry', () => {
  const tiled = golden();
  const { verdicts } = checkAll({ specLines: spec.lines, artifact: tiled });

  assert.deepEqual(verdicts, []);
  assert.equal(coveredLines(tiled.sequences).size, spec.lineCount);
  assert.equal(ENGINE_DECLARED_CHECK_COUNT, CHECKS.length);
  assert.equal(ENGINE_DECLARED_CHECK_COUNT, 28);
});

test('C003 the product path refuses a gapped artifact, names the range, and leaves it byte-identical', () => {
  const root = mkdtempSync(join(tmpdir(), 'px247-product-'));
  const specPath = join(root, 'ledger.md');
  copyFileSync(SPEC_PATH, specPath);
  const artifactPath = join(root, 'ledger-sequences.json');
  const gapped = golden();
  gapped.sequences = gapped.sequences.filter((sequence) => sequence.id !== 'front-matter');
  writeFileSync(artifactPath, `${JSON.stringify(gapped, null, 2)}\n`);
  const committed = readFileSync(artifactPath, 'utf8');

  const verified = spawnSync('node', [RUN_RAIL, specPath], { cwd: PROJECT_ROOT, encoding: 'utf8' });
  const reported = `${verified.stdout}${verified.stderr}`;

  assert.notEqual(verified.status, 0, 'a verification that refuses exits non-zero');
  assert.match(reported, /every-line-belongs-to-an-entry/);
  assert.match(reported, /1-23/, 'the refusal names the range to repair, not only the rule it broke');
  assert.equal(readFileSync(artifactPath, 'utf8'), committed, 'a refused verification writes nothing');
});

test('C003 the generation path refuses a declaration whose entries leave a gap, and names the range', () => {
  const root = mkdtempSync(join(tmpdir(), 'px247-generate-'));
  const specPath = join(root, 'ledger.md');
  copyFileSync(SPEC_PATH, specPath);
  // The entry and every reading about it are withdrawn together, so the artifact is
  // assembled and it is the coverage rule that refuses it rather than a reading that
  // names an entry the declaration no longer carries.
  const withdrawn = (records) => records.filter((record) => record.subject !== 'front-matter');
  const gapped = {
    declaration: { ...RUN_INPUT.declaration, entries: RUN_INPUT.declaration.entries.filter((entry) => entry.id !== 'front-matter') },
    readings: {
      ...RUN_INPUT.readings,
      sequences: withdrawn(RUN_INPUT.readings.sequences),
      adversarial: withdrawn(RUN_INPUT.readings.adversarial),
      inquest: withdrawn(RUN_INPUT.readings.inquest),
    },
  };

  const verified = spawnSync('node', [RUN_RAIL, specPath], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    input: JSON.stringify(gapped),
  });
  const reported = `${verified.stdout}${verified.stderr}`;

  assert.notEqual(verified.status, 0);
  assert.match(reported, /every-line-belongs-to-an-entry/);
  assert.match(reported, /1-23/, 'the refusal names the range to repair');
});

test('C003 the check and the phase-5 gate name the same first unread line', () => {
  const tiled = golden();
  const withoutFrontMatter = tiled.sequences.filter((sequence) => sequence.id !== 'front-matter');

  const run = scratchRun();
  declare(run.directory, withoutFrontMatter.map(({ id, kind, firstLine, lastLine }) => ({ id, kind, firstLine, lastLine })));

  const refused = spawnSync('node', [PHASE, 'run', run.specPath, '5'], { encoding: 'utf8' });
  const named = /line (\d+) belongs to no entry/.exec(refused.stdout);
  const gapped = { ...tiled, sequences: withoutFrontMatter };
  const [verdict] = verdictsOf(gapped, 'every-line-belongs-to-an-entry');

  assert.notEqual(named, null, 'the gate names the line to repair');
  assert.equal(Number(named[1]), Number(verdict.subject.split('-')[0]));
});

// ---------------------------------------------------------------------------
// C004 — the fixture, the exemption it needs, and the stated count
// ---------------------------------------------------------------------------

test('IT the checks gate names the subject of the verdict it refuses on', () => {
  const run = scratchRun();
  writeFileSync(join(run.directory, 'declaration.json'), `${JSON.stringify(RUN_INPUT.declaration, null, 2)}\n`);
  // The region is declared and read, and the reading claims a sequence while no step
  // derives an operation for it, so the artifact is assembled and the checks gate is what
  // refuses it. What is asserted is that the refusal names the entry, not only the rule.
  const claiming = RUN_INPUT.readings.sequences.map((reading) => (reading.subject === 'front-matter'
    ? { subject: reading.subject, outcome: 'direct', reader: reading.reader }
    : { ...reading, steps: [], operations: [] }));
  // The driver reads a span reading's steps and operations from the reading itself, which
  // is where a run records them; the fixture keeps them beside the readings instead.
  claiming[0].steps = RUN_INPUT.readings.steps;
  claiming[0].operations = RUN_INPUT.readings.operations;
  writeReadingsFile(join(run.directory, 'readings-span.jsonl'), claiming);
  writeReadingsFile(join(run.directory, 'readings-adjudicate.jsonl'), RUN_INPUT.readings.adjudications);

  const through = spawnSync('node', [PHASE, 'through', run.specPath, '9'], { cwd: PROJECT_ROOT, encoding: 'utf8' });

  assert.match(through.stdout, /^phase\s+9 \[det\] FAIL/m);
  assert.match(through.stdout, /every-operation-reached: front-matter — /);
});

test('C004 the golden artifact tiles the document and verifies', () => {
  const artifact = golden();
  const covered = coveredLines(artifact.sequences);

  assert.deepEqual(verdictsOf(artifact, 'every-line-belongs-to-an-entry'), []);
  assert.equal(covered.size, spec.lineCount);
  assert.equal(covered.has(1), true, 'the title block is inside the rule');
});

test('C004 an entry ruled notASequence derives no operation without being a finding, and one claiming a sequence does', () => {
  const tiled = golden();
  assert.deepEqual(verdictsOf(tiled, 'every-operation-reached'), []);

  const claiming = JSON.parse(JSON.stringify(tiled));
  claiming.sequences.find((sequence) => sequence.id === 'front-matter').outcome = 'direct';
  const unrealized = verdictsOf(claiming, 'every-operation-reached');

  assert.equal(unrealized.length, 1);
  assert.equal(unrealized[0].subject, 'front-matter');
});

test('C004 the design document states the check count the registry declares', () => {
  const stated = /reports (\d+) checks over (\d+) pins/.exec(readFileSync(DESIGN_DOC, 'utf8'));

  assert.notEqual(stated, null);
  assert.equal(Number(stated[1]), ENGINE_DECLARED_CHECK_COUNT);
});
