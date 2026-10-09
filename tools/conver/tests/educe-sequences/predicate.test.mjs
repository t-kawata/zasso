// The predicate decides, and the census says whether it did (PX-246, C004, C005).
//
// The pin was re-derived every run and reached nothing: it was not in the brief a reader
// reads, no ruling pointed at one of its limbs, and a declaration whose limbs are the
// chosen line's own words satisfied the re-derivation by quoting itself. Two changes make
// it a criterion — the brief carries it, and a ruling that something is not an operation
// names the limb it fails — and one measurement makes an unused predicate visible without
// becoming a gate.
//
// @verifies C004
// @verifies C005
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkAll } from '../../.claude/scripts/educe-sequences/rail/engine.mjs';
import { readSpecification, writeArtifact } from '../../.claude/scripts/educe-sequences/rail/load.mjs';
import { predicateFor } from '../../.claude/scripts/educe-sequences/rail/pins.mjs';
import { BRIEF_NAMES, PREDICATE_PLACEHOLDER, renderBrief, renderBriefFrom } from '../../.claude/scripts/educe-sequences/rail/reading.mjs';
import { applyReadings } from '../../.claude/scripts/educe-sequences/rail/reading.mjs';
import { healthLines } from '../../.claude/scripts/educe-sequences/rail/report.mjs';
import { INQUEST_LENSES, INQUEST_QUESTIONS, missingReadingFields } from '../../.claude/scripts/educe-sequences/rail/readings.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const RAIL_DIRECTORY = join(PROJECT_ROOT, '.claude/scripts/educe-sequences/rail');
const SPEC_PATH = join(PROJECT_ROOT, 'tests/educe-sequences/fixtures/spec/ledger.md');
const GOLDEN_PATH = join(PROJECT_ROOT, 'tests/educe-sequences/fixtures/spec/ledger-sequences.json');
const PHASE_SCRIPT = join(PROJECT_ROOT, '.claude/scripts/educe-sequences/rail/phase.mjs');
const RUN_DECLARATION = JSON.parse(readFileSync(join(PROJECT_ROOT, 'tests/educe-sequences/fixtures/spec/ledger.run.json'), 'utf8')).declaration;

const spec = readSpecification(SPEC_PATH);

/** The golden artifact, read fresh so no test can hand another a mutated one. */
// [::TICKET::] PX-246 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-246 --for-spec --no-implementation-order`.
function golden() {
  return JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
}

/** The predicate as a brief receives it: the line, its text, and the limbs to decide by. */
// [::TICKET::] PX-246 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-246 --for-spec --no-implementation-order`.
function predicate() {
  return predicateFor(golden().pins.predicate.limbs, spec.lines);
}

/** A ruling that something is not an operation, with the limb it names. */
// [::TICKET::] PX-246 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-246 --for-spec --no-implementation-order`.
function ruling(predicateLimb) {
  return {
    subject: 'admission', outcome: 'notASequence', category: 'document_description',
    reason: 'it says what the document specifies rather than naming an actor and an act',
    predicateLimb, reader: 'adjudicate',
  };
}

/** Apply one ruling to a scratch artifact and report the refusal, if any. */
// [::TICKET::] PX-246 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-246 --for-spec --no-implementation-order`.
function applyOne(reading) {
  const artifactPath = join(mkdtempSync(join(tmpdir(), 'px246-predicate-')), 'ledger-sequences.json');
  writeArtifact(artifactPath, golden());
  return applyReadings({ artifactPath, readings: [reading], artifact: golden(), specLines: spec.lines });
}

// ---------------------------------------------------------------------------
// C004 — the predicate reaches the reader and the ruling points at its limbs
// ---------------------------------------------------------------------------

test('C004 a ruling naming a declared limb is applied, and one naming a limb the declaration does not declare is refused', () => {
  assert.equal(applyOne(ruling('cancellation')).refused, undefined);
  assert.equal(applyOne(ruling('none-applies')).refused, undefined, 'no limb applying is a finding, not an omission');

  const wrong = applyOne(ruling('settlement'));
  assert.equal(wrong.refused[0].field, 'predicateLimb');
  assert.equal(wrong.refused[0].why.includes('settlement'), true);
  assert.equal(wrong.refused[0].why.includes('cancellation'), true, 'the refusal names what the declaration does declare');
});

test('C004 the rendered brief carries the predicate line, its text and every limb', () => {
  const declaration = predicate();
  const brief = renderBrief({ briefName: 'span', worklistPath: '/tmp/worklist.txt', predicate: declaration });

  assert.equal(brief.includes(String(declaration.line)), true, 'the line is what a reader opens');
  assert.equal(brief.includes(declaration.text), true, 'the sentence is quoted, not paraphrased');
  for (const limb of declaration.limbs) assert.equal(brief.includes(limb), true, limb);
});

test('C004 every declared brief carries the predicate, and a template that lost the clause is refused', () => {
  const declaration = predicate();
  for (const briefName of BRIEF_NAMES) {
    const brief = renderBrief({ briefName, worklistPath: '/tmp/worklist.txt', predicate: declaration });
    assert.equal(brief.includes('cancellation'), true, briefName);
  }

  const templatePath = join(PROJECT_ROOT, '.claude/scripts/educe-sequences/briefs/span.md');
  const stripped = readFileSync(templatePath, 'utf8').replace(PREDICATE_PLACEHOLDER, '');
  assert.throws(
    () => renderBriefFrom({ template: stripped, briefName: 'span', worklistPath: '/tmp/w.txt', predicate: declaration }),
    /predicate/i,
  );
});

test('C004 a ruling that asserts the entry is a sequence need not name a limb', () => {
  const direct = { subject: 'admission', outcome: 'direct', reader: 'span' };

  assert.equal(applyOne(direct).refused, undefined, 'the vocabulary is not made larger than the question it answers');
});

test('C004 the inquest is not asked for a limb, because it answers about a line rather than about an act', () => {
  const answer = { subject: 's1', lens: INQUEST_LENSES[0], question: INQUEST_QUESTIONS[INQUEST_LENSES[0]], answer: 'No', line: 24, quote: 'An operator admits a transfer', reader: 'inquest' };

  const required = missingReadingFields(answer);

  assert.deepEqual(required, [], 'the answer carries what its own shape requires');
  assert.equal(required.includes('predicateLimb'), false, 'and a limb is not one of them');
});

// ---------------------------------------------------------------------------
// C005 — the limb census is printed and never gated
// ---------------------------------------------------------------------------

test('C005 the census prints beside the counts, and a run with no measurement prints none', () => {
  const status = { phases: [], readings: {}, history: [] };
  const measured = { ...checkAll({ specLines: spec.lines, artifact: golden() }).summary };

  assert.equal(typeof measured.predicateLimbs, 'number');
  assert.equal(measured.predicateLimbs, 8, 'the fixture declares the eight limbs the specification states');
  assert.equal(measured.limbsCited, 0, 'the fixture rules on sections rather than on acts, and says so rather than inventing a limb');
  assert.equal(measured.limbsUnused, 8);

  const lines = healthLines({ summary: measured, status });
  assert.equal(lines.some((line) => line === 'predicateLimbs=8 cited=0 unused=8'), true, lines.join(' | '));
  assert.equal(healthLines({ summary: null, status }).some((line) => line.includes('predicateLimbs')), false);
});

test('C005 the census counts a limb once however many rulings name it, and counts only declared limbs', () => {
  const artifact = golden();
  // The rulings that stay keep naming their section, so the census moves for the reason
  // this test is about rather than because the section census lost its answers.
  artifact.adjudications = artifact.adjudications.map((row, index) => {
    if (index === 0 || index === 1) return { ...row, predicateLimb: 'cancellation' };
    if (index === 2) return { ...row, predicateLimb: 'none-applies' };
    return row;
  });

  const { summary } = checkAll({ specLines: spec.lines, artifact });

  assert.equal(summary.limbsCited, 1, 'one limb was cited, by two rulings');
  assert.equal(summary.limbsUnused, 7);
});

test('C005 no module under rail/ compares the census or a coverage count to a numeric threshold', () => {
  const modules = readdirSync(RAIL_DIRECTORY).filter((name) => name.endsWith('.mjs'));
  assert.equal(modules.length > 0, true);

  for (const name of modules) {
    const text = readFileSync(join(RAIL_DIRECTORY, name), 'utf8');
    assert.equal(/limbsCited\s*[<>]=?\s*\d/.test(text), false, `${name} compares limbsCited to a constant`);
    assert.equal(/limbsUnused\s*[<>]=?\s*\d/.test(text), false, `${name} compares limbsUnused to a constant`);
    assert.equal(/predicateLimbs\s*[<>]=?\s*\d/.test(text), false, `${name} compares predicateLimbs to a constant`);
  }
});

test('C004 the brief the command file asks for carries the predicate, on the path that asks for it', () => {
  // The unit tests render a brief by handing the renderer a predicate. The command file
  // does not: it runs `phase.mjs brief <spec> <role>`, and a defect that only the entry
  // point can see is a defect every unit test passes over.
  const root = mkdtempSync(join(tmpdir(), 'px246-brief-'));
  const specPath = join(root, 'ledger.md');
  copyFileSync(SPEC_PATH, specPath);
  mkdirSync(join(root, 'educe-sequences'), { recursive: true });
  writeFileSync(join(root, 'educe-sequences', 'declaration.json'), `${JSON.stringify({ ...RUN_DECLARATION, sectionLevel: 2 }, null, 2)}\n`);

  const rendered = spawnSync('node', [PHASE_SCRIPT, 'brief', specPath, 'span'], { cwd: PROJECT_ROOT, encoding: 'utf8' });

  assert.equal(rendered.status, 0, rendered.stderr);
  assert.equal(rendered.stdout.includes('cancellation'), true, 'the limbs reach the reader');
  // The declaration carries the limbs and not the line: the line is what the rule finds,
  // so a brief that read a line off the declaration would print "line undefined".
  const lineCarryingEveryLimb = readFileSync(SPEC_PATH, 'utf8').split('\n')
    .findIndex((line) => RUN_DECLARATION.predicate.limbs.every((limb) => line.includes(limb))) + 1;
  assert.equal(lineCarryingEveryLimb > 0, true, 'the fixture states one line carrying every limb');
  assert.match(rendered.stdout, new RegExp(`predicate is on line ${lineCarryingEveryLimb}\\b`));
  assert.equal(rendered.stdout.includes('undefined'), false);
});

test('C004 a brief asked for before the declaration exists states what to declare rather than refusing', () => {
  // This is the state Step 2 runs in: the brief is what asks for the declaration, so a
  // brief that required one would make the phase that produces it unreachable.
  const root = mkdtempSync(join(tmpdir(), 'px246-brief-none-'));
  const specPath = join(root, 'ledger.md');
  copyFileSync(SPEC_PATH, specPath);

  const rendered = spawnSync('node', [PHASE_SCRIPT, 'brief', specPath, 'span'], { cwd: PROJECT_ROOT, encoding: 'utf8' });

  assert.equal(rendered.status, 0, rendered.stderr);
  assert.equal(rendered.stdout.includes('states no predicate yet'), true);
  assert.equal(rendered.stdout.includes('names the limb it fails'), true, 'the requirement is stated even when the text is not there yet');
  assert.equal(/Cannot read properties/.test(rendered.stderr), false);
});
