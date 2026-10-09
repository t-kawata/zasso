// A step carries the line it was read from, and the quote from that line (PX-246, C001, C002, C009).
//
// The apparatus could already check that a quote is a contiguous substring of the line it
// names — `groundIn` was written for the audit answers — and it was never applied to a
// step, and the artifact had nowhere to keep a step's line. So a decomposition could be
// assembled without being a reading and no check could tell: the defect the campaign
// measured at 1178 steps. This file holds the device in place, and holds the refusal that
// an artifact written before it does not verify.
//
// @verifies C001
// @verifies C002
// @verifies C009
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ENGINE_DECLARED_CHECK_COUNT, checkAll } from '../../.claude/scripts/educe-sequences/rail/engine.mjs';
import { digestOf, readArtifact, readSpecification, writeArtifact } from '../../.claude/scripts/educe-sequences/rail/load.mjs';
import { applyReadings } from '../../.claude/scripts/educe-sequences/rail/reading.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SPEC_PATH = join(PROJECT_ROOT, 'tests/educe-sequences/fixtures/spec/ledger.md');
const GOLDEN_PATH = join(PROJECT_ROOT, 'tests/educe-sequences/fixtures/spec/ledger-sequences.json');

const spec = readSpecification(SPEC_PATH);

/** The golden artifact, read fresh so no test can hand another a mutated one. */
// [::TICKET::] PX-246 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-246 --for-spec --no-implementation-order`.
function golden() {
  return JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
}

/** A scratch artifact path, so a test that writes one writes nothing committed. */
// [::TICKET::] PX-246 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-246 --for-spec --no-implementation-order`.
function scratchArtifactPath() {
  return join(mkdtempSync(join(tmpdir(), 'px246-grounding-')), 'ledger-sequences.json');
}

/** The verdicts one check raised over an artifact, by check id. */
// [::TICKET::] PX-246 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-246 --for-spec --no-implementation-order`.
function verdictsOf(artifact, check) {
  return checkAll({ specLines: spec.lines, artifact }).verdicts.filter((verdict) => verdict.check === check);
}

// ---------------------------------------------------------------------------
// C001 — a step is grounded in the line it names
// ---------------------------------------------------------------------------

test('C001 a grounded step raises no verdict, and a quote assembled from two places raises one naming the step', () => {
  const grounded = golden();
  const clean = checkAll({ specLines: spec.lines, artifact: grounded });
  assert.deepEqual(verdictsOf(grounded, 'step-is-grounded-in-its-line'), []);

  const assembled = golden();
  assembled.steps[0].quote = 'reading the signed instruction, verifying the signature against the issuer key';

  assert.deepEqual(
    verdictsOf(assembled, 'step-is-grounded-in-its-line').map((verdict) => verdict.subject),
    [assembled.steps[0].id],
    'the verdict names the step, not the check',
  );
  assert.equal(clean.summary.checksRun, clean.summary.checksDeclared, 'the check ran in both cases');
});

test('C001 a quote that differs from its line only in whitespace is grounded, and one that differs by a word is not', () => {
  const spaced = golden();
  spaced.steps[0].quote = spaced.steps[0].quote.replace(/ /g, '  ');
  assert.deepEqual(verdictsOf(spaced, 'step-is-grounded-in-its-line'), [], 'whitespace run length is not the reading');

  const reworded = golden();
  reworded.steps[0].quote = 'reading the unsigned instruction';
  assert.equal(verdictsOf(reworded, 'step-is-grounded-in-its-line').length, 1);
});

test('C001 the integrator refuses a reading whose step carries no quote, and writes nothing', () => {
  const artifactPath = scratchArtifactPath();
  writeArtifact(artifactPath, golden());
  const before = digestOf(artifactPath);
  const reading = {
    subject: 'admission', outcome: 'direct', reader: 'a-reader',
    steps: [{
      id: 'admission-1', sequence: 'admission', operation: 'Admit', subject: 'operator',
      predicate: 'reads', object: 'the signed instruction', contract: 'the instruction is signed',
      line: 24,
    }],
  };

  const applied = applyReadings({ artifactPath, readings: [reading], artifact: golden(), specLines: spec.lines });

  assert.equal(applied.refused[0].field, 'quote');
  assert.equal(applied.refused[0].subject, 'admission-1');
  assert.equal(digestOf(artifactPath), before, 'a refusal leaves the artifact byte-identical');
});

test('C001 an artifact whose step carries no line is refused by the shape gate, naming the field and the step', () => {
  const legacy = golden();
  delete legacy.steps[0].line;
  delete legacy.steps[0].quote;

  const { summary, verdicts } = checkAll({ specLines: spec.lines, artifact: legacy });

  assert.equal(summary, null, 'the shape gate speaks before the checks, so there is no summary to read');
  assert.equal(verdicts[0].check, 'artifact-shape', 'the refusal is not a check a later reading could satisfy');
  assert.equal(verdicts[0].pin, 'steps[0].line');
  assert.equal(verdicts[0].reason.includes('admission-1'), true, 'the step is named, not only its index');
});

test('C001 no step in the committed fixture is ungrounded, so the shape the checks read is the shape the fixture holds', () => {
  const committed = readArtifact(GOLDEN_PATH);

  assert.equal(committed.steps.every((step) => Number.isInteger(step.line) && typeof step.quote === 'string' && step.quote !== ''), true);
  assert.equal(checkAll({ specLines: spec.lines, artifact: committed }).verdicts.length, 0);
});

// ---------------------------------------------------------------------------
// C002 — a step cites a line inside its entry's span, or the entry records the separation
// ---------------------------------------------------------------------------

test('C002 a step beyond its entry span is refused until the entry records the crossing', () => {
  const artifact = golden();
  const entry = artifact.sequences.find((sequence) => sequence.id === 'admission');
  // A span of one line, so the steps that share a line are not moved with the one under
  // test: the entry is what is being narrowed, not the steps.
  entry.firstLine = 25;
  entry.lastLine = 25;
  artifact.steps[0].line = 26;

  assert.deepEqual(verdictsOf(artifact, 'step-cites-a-line-inside-its-entry-span').map((verdict) => verdict.subject), ['admission-1']);

  entry.crossRefs = [{ line: 26, note: 'the act is stated in the sentence after the span' }];
  assert.deepEqual(verdictsOf(artifact, 'step-cites-a-line-inside-its-entry-span'), [], 'a recorded separation is not refused');
});

test('C002 the span endpoints are inside and one line beyond either end is outside', () => {
  const at = (line) => {
    const artifact = golden();
    const entry = artifact.sequences.find((sequence) => sequence.id === 'admission');
    entry.firstLine = 24;
    entry.lastLine = 25;
    artifact.steps[0].line = line;
    return verdictsOf(artifact, 'step-cites-a-line-inside-its-entry-span').length;
  };

  assert.equal(at(24), 0, 'the first line is inside');
  assert.equal(at(25), 0, 'the last line is inside');
  assert.equal(at(23), 1, 'one line before is outside');
  assert.equal(at(26), 1, 'one line after is outside');
});

test('C002 a crossing that names a line the step does not cite is still not a crossing', () => {
  const artifact = golden();
  const entry = artifact.sequences.find((sequence) => sequence.id === 'admission');
  entry.firstLine = 25;
  entry.lastLine = 25;
  artifact.steps[0].line = 26;
  entry.crossRefs = [{ line: 27, note: 'a different line' }];

  assert.equal(verdictsOf(artifact, 'step-cites-a-line-inside-its-entry-span').length, 1, 'the record must name the line that was cited');
});

// ---------------------------------------------------------------------------
// C009 — the migration is a refusal, not a silence
// ---------------------------------------------------------------------------

test('C009 an artifact written before this ticket is refused, and the neighbouring checks are not what refuses it', () => {
  const legacy = golden();
  for (const step of legacy.steps) {
    delete step.line;
    delete step.quote;
  }

  const { summary, verdicts } = checkAll({ specLines: spec.lines, artifact: legacy });

  assert.equal(summary, null);
  assert.equal(verdicts.every((verdict) => verdict.check === 'artifact-shape'), true);
  assert.equal(verdicts.length, legacy.steps.length * 2, 'every step names both missing fields');
});

test('C009 an artifact that keeps its steps but drops its operations is refused by the reach check, not by the shape gate', () => {
  const artifact = golden();
  artifact.operations = [];

  const { verdicts } = checkAll({ specLines: spec.lines, artifact });

  // A summary is null whenever there is any verdict, so "the checks spoke" is asserted by
  // what refused rather than by the presence of a summary.
  assert.equal(verdicts.every((verdict) => verdict.check !== 'artifact-shape'), true, 'the shape gate passed');
  assert.equal(verdicts.some((verdict) => verdict.check === 'every-operation-reached'), true);
});

// [::TICKET::] PX-247 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-247 --for-spec --no-implementation-order`.
test('C009 the declared check count is the number of checks, and this ticket is what raised it', () => {
  assert.equal(ENGINE_DECLARED_CHECK_COUNT, 21);
  assert.equal(checkAll({ specLines: spec.lines, artifact: golden() }).summary.checksDeclared, ENGINE_DECLARED_CHECK_COUNT);
});

// [::TICKET::] PX-247 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-247 --for-spec --no-implementation-order`.
test('C002 a crossing without a line or a note is refused by the shape gate, naming the sequence', () => {
  const artifact = golden();
  const index = artifact.sequences.findIndex((sequence) => sequence.id === 'admission');
  artifact.sequences[index].crossRefs = [{ note: 'no line' }];

  const { verdicts } = checkAll({ specLines: spec.lines, artifact });

  assert.equal(verdicts[0].check, 'artifact-shape');
  assert.equal(verdicts[0].pin, `sequences[${index}].crossRefs[0].line`);
  assert.equal(verdicts[0].reason.includes('admission'), true, 'the sequence is named, not only its index');
});

test('C002 a sequence without its span fields is refused by the shape gate, naming the sequence', () => {
  const artifact = golden();
  delete artifact.sequences[0].lastLine;

  const { verdicts } = checkAll({ specLines: spec.lines, artifact });

  assert.equal(verdicts[0].check, 'artifact-shape');
  assert.equal(verdicts[0].pin, 'sequences[0].lastLine');
});
