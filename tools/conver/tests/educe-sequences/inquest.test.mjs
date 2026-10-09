// The inquest (PX-243, contracts C001-C006).
//
// The loop-back edges push a declaration and its readings until the checks are quiet, and
// they cannot discover a question nobody asked: the five briefs ask the same five
// questions in every generation, and nothing recorded what was asked, by which lens,
// against which subject, or what the answer rested on. The inquest is the carrier for
// those questions, and because it re-opens in every generation a specification that
// changed or an apparatus that was read thinly is re-interrogated rather than re-verified.
//
// It sits at phase 13 and the check block requires it, because a run that reported a green
// block without having asked anything would be reporting a guarantee it had already said it
// could not make — the same idiom the weakest link uses one phase earlier.
//
// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
// @verifies C005
// @verifies C006
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkAll } from '../../.claude/scripts/educe-sequences/rail/engine.mjs';
import { PHASES, PHASE_TAGS, phaseById } from '../../.claude/scripts/educe-sequences/rail/gates.mjs';
import { readSpecification } from '../../.claude/scripts/educe-sequences/rail/load.mjs';
import { artifactPathFor } from '../../.claude/scripts/educe-sequences/rail/paths.mjs';
import { buildContext, PHASE_EXPECTS, PHASE_GUIDANCE, runPhase, runThrough, startRun } from '../../.claude/scripts/educe-sequences/rail/phases.mjs';
import { predicateFor } from '../../.claude/scripts/educe-sequences/rail/pins.mjs';
import { BRIEF_NAMES, renderBrief } from '../../.claude/scripts/educe-sequences/rail/reading.mjs';
import {
  DECLARATION_FILE,
  INQUEST_ANSWERS,
  INQUEST_FILE,
  INQUEST_LENSES,
  inquestPairs,
  inquestQuestions,
  inquestSubjects,
  missingReadingFields,
  readDeclarationFile,
  readInquestFile,
  readReadingsFile,
  writeReadingsFile,
} from '../../.claude/scripts/educe-sequences/rail/readings.mjs';
import { buildReport, healthLines, isComplete, readPhaseSettled } from '../../.claude/scripts/educe-sequences/rail/report.mjs';
import { runCommand } from '../../.claude/scripts/educe-sequences/rail/run.mjs';
import { noteDone, TRACKED_PHASES, writeStatus } from '../../.claude/scripts/educe-sequences/rail/run-state.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PHASE_SCRIPT = join(PROJECT_ROOT, '.claude/scripts/educe-sequences/rail/phase.mjs');
const COMMAND_PATH = join(PROJECT_ROOT, '.claude/commands/educe-sequences.md');
const COMMAND = readFileSync(COMMAND_PATH, 'utf8');
const BRIEF_PATH = join(PROJECT_ROOT, '.claude/scripts/educe-sequences/briefs/inquest.md');
const SPEC_SOURCE = new URL('./fixtures/spec/ledger.md', import.meta.url).pathname;
const RUN_INPUT = JSON.parse(readFileSync(new URL('./fixtures/spec/ledger.run.json', import.meta.url), 'utf8'));
const golden = JSON.parse(readFileSync(new URL('./fixtures/spec/ledger-sequences.json', import.meta.url), 'utf8'));

/** The predicate as a brief receives it, so the audit renders with its criterion. */
const PREDICATE = predicateFor(golden.pins.predicate.limbs, readSpecification(new URL('./fixtures/spec/ledger.md', import.meta.url).pathname).lines);

/** Whitespace collapsed, which is how a quote broken across a line break is compared. */
// [::TICKET::] PX-243, PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-243|PX-244) --for-spec --no-implementation-order`.
function normalised(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

/** The names and tags the phase table carried before the inquest was inserted. */
const PHASE_IDENTITY = Object.freeze([
  ['identity', 'det'], ['predicate', 'read'], ['row schema', 'read'], ['enumerations', 'read'],
  ['blocks', 'read'], ['pins', 'det'], ['worklist', 'det'], ['span', 'read'], ['integrate', 'det'],
  ['adversarial', 'read'], ['reroute', 'read'], ['adjudicate', 'read'], ['inquest', 'read'],
  ['checks', 'det'], ['re-derive', 'det'], ['falsify', 'det'], ['rail exit', 'ad-hoc'], ['report', 'det'],
]);

/** A throwaway specification, so no test writes into the committed fixture. */
// [::TICKET::] PX-243, PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-243|PX-244) --for-spec --no-implementation-order`.
function scratchRun() {
  const root = mkdtempSync(join(tmpdir(), 'educe-inquest-'));
  const specPath = join(root, 'ledger.md');
  copyFileSync(SPEC_SOURCE, specPath);
  return { root, specPath, spec: readSpecification(specPath), directory: join(root, 'educe-sequences') };
}

/** The subjects a declaration puts to the audit: its sections and its entries. */
// [::TICKET::] PX-243, PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-243|PX-244) --for-spec --no-implementation-order`.
function subjectsOf(declaration) {
  return inquestSubjects({ sections: declaration.sections, entries: declaration.entries });
}

/** The line an answer for a subject rests on, and the quote it carries. */
// [::TICKET::] PX-243, PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-243|PX-244) --for-spec --no-implementation-order`.
function groundingFor(specLines, declaration, subject) {
  const span = [...declaration.sections, ...declaration.entries].find((candidate) => candidate.id === subject);
  for (let line = span.firstLine; line <= span.lastLine; line += 1) {
    const text = (specLines[line - 1] ?? '').trim();
    if (text !== '' && !text.startsWith('#')) return { line, quote: text.slice(0, 40) };
  }
  throw new Error(`no substantive line in ${subject}`);
}

/** One answer, in the shape the file carries. */
// [::TICKET::] PX-243, PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-243|PX-244) --for-spec --no-implementation-order`.
function answerFor(specLines, declaration, subject, lens, overrides = {}) {
  return {
    subject,
    lens,
    question: 'Is a required act absent from this subject?',
    answer: 'No',
    ...groundingFor(specLines, declaration, subject),
    reader: 'inquest',
    ...overrides,
  };
}

/** Every pair the declaration puts, answered. */
// [::TICKET::] PX-243, PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-243|PX-244) --for-spec --no-implementation-order`.
function coveringAnswers(specLines, declaration, { omit = null, overrides = {} } = {}) {
  return subjectsOf(declaration).flatMap((subject) => INQUEST_LENSES
    .filter((lens) => !(omit !== null && omit.subject === subject && omit.lens === lens))
    .map((lens) => answerFor(specLines, declaration, subject, lens, overrides)));
}

/** Write an inquest readings file into a run directory. */
// [::TICKET::] PX-243, PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-243|PX-244) --for-spec --no-implementation-order`.
function writeInquest(directory, records) {
  mkdirSync(directory, { recursive: true });
  writeReadingsFile(join(directory, INQUEST_FILE), records);
}

/** Seed a run directory with the fixture's declaration, readings and audit. */
// [::TICKET::] PX-243, PX-244, PX-247 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-243|PX-244|PX-247) --for-spec --no-implementation-order`.
function seed(directory, specLines, declaration, { omit = null } = {}) {
  writeFileSync(join(directory, DECLARATION_FILE), `${JSON.stringify(declaration, null, 2)}\n`);
  const span = RUN_INPUT.readings.sequences.map((reading) => ({ ...reading, steps: [], operations: [] }));
  span[0].steps = RUN_INPUT.readings.steps;
  span[0].operations = RUN_INPUT.readings.operations;
  writeReadingsFile(join(directory, 'readings-span.jsonl'), span);
  writeReadingsFile(join(directory, 'readings-adjudicate.jsonl'), RUN_INPUT.readings.adjudications);
  writeReadingsFile(join(directory, 'readings-reroute.jsonl'), []);
  writeReadingsFile(join(directory, 'readings-adversarial.jsonl'), RUN_INPUT.readings.adversarial);
  writeInquest(directory, coveringAnswers(specLines, declaration, { omit }));
}

/** A context whose earlier phases are recorded done, so one phase can be entered. */
// [::TICKET::] PX-243, PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-243|PX-244) --for-spec --no-implementation-order`.
function contextThrough(id, declaration = RUN_INPUT.declaration) {
  const scratch = scratchRun();
  const run = startRun({ specPath: scratch.specPath, spec: scratch.spec });
  writeFileSync(join(run.directory, DECLARATION_FILE), `${JSON.stringify(declaration, null, 2)}\n`);
  seed(run.directory, scratch.spec.lines, declaration);
  let status = run.status;
  for (const phase of PHASES.filter((candidate) => candidate.id <= id)) {
    status = noteDone(status, phase.id, { verdict: `recorded for the test: ${phase.name}`, tag: phase.tag });
  }
  writeStatus(run.directory, status);
  return { ...scratch, directory: run.directory, context: buildContext({ specPath: scratch.specPath, spec: scratch.spec, run: { directory: run.directory, status } }) };
}

/** Run the phase driver as the command file runs it. */
// [::TICKET::] PX-243, PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-243|PX-244) --for-spec --no-implementation-order`.
function phase(argv) {
  return spawnSync('node', [PHASE_SCRIPT, ...argv], { cwd: PROJECT_ROOT, encoding: 'utf8' });
}

/** The verdicts one check returned, out of a whole block. */
// [::TICKET::] PX-243, PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-243|PX-244) --for-spec --no-implementation-order`.
function verdictsOf(id, inquest, specLines) {
  return checkAll({ specLines, artifact: golden, recorded: { inquest } }).verdicts.filter((verdict) => verdict.check === id);
}

// ---------------------------------------------------------------------------
// C001 — the inquest gates the check block
// ---------------------------------------------------------------------------

test('C001 the phase table declares eighteen phases, contiguous, each returning to a lower id', () => {
  assert.equal(PHASES.length, 18);
  assert.equal(TRACKED_PHASES, PHASES.length);
  assert.deepEqual(PHASES.map((phase) => phase.id), Array.from({ length: 18 }, (_, index) => index + 1));
  for (const phase of PHASES) {
    assert.equal(phase.backTo === null || phase.backTo < phase.id, true, `phase ${phase.id} returns to ${phase.backTo}`);
    assert.equal(Object.values(PHASE_TAGS).includes(phase.tag), true, `phase ${phase.id} carries tag ${phase.tag}`);
  }
});

test('C001 the inquest is phase 13 and the check block is 14, entered only after it', () => {
  const inquest = phaseById(13);
  assert.equal(inquest.name, 'inquest');
  assert.equal(inquest.tag, PHASE_TAGS.READ);
  assert.deepEqual(inquest.requires, [12]);
  assert.equal(inquest.backTo, 12);

  const checks = phaseById(14);
  assert.equal(checks.name, 'checks');
  assert.deepEqual(checks.requires, [9, 13]);

  const { context } = contextThrough(12);
  const refused = runPhase(14, context);
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'phase 13 is not done');
  assert.equal(refused.exitCode, 1, 'the block cannot be built before the audit is answered');
});

test('C001 renumbering moves the ids and nothing else: every phase keeps its name and its tag', () => {
  assert.deepEqual(PHASES.map((phase) => [phase.name, phase.tag]), PHASE_IDENTITY);
  assert.equal(PHASES.filter((phase) => phase.tag === PHASE_TAGS.READ).length, 9);
  assert.equal(PHASE_EXPECTS[13].includes(INQUEST_FILE), true, 'phase 13 expects the inquest file');
  assert.equal(typeof PHASE_GUIDANCE[13], 'string');
});

// ---------------------------------------------------------------------------
// C002 — every subject under every lens
// ---------------------------------------------------------------------------

test('C002 a declaration whose every pair is answered returns no verdict from the coverage check', () => {
  const { spec } = scratchRun();
  const declaration = RUN_INPUT.declaration;
  const answer = coveringAnswers(spec.lines, declaration);

  assert.equal(inquestPairs(subjectsOf(declaration)).length, 18 * INQUEST_LENSES.length);
  assert.deepEqual(verdictsOf('inquest-covers-every-subject-and-lens', answer, spec.lines), []);
});

test('C002 one unanswered pair is one verdict naming the subject and the lens', () => {
  const { spec } = scratchRun();
  const declaration = RUN_INPUT.declaration;
  const subject = declaration.sections[2].id;
  const lens = INQUEST_LENSES[3];
  const answer = coveringAnswers(spec.lines, declaration, { omit: { subject, lens } });

  const verdicts = verdictsOf('inquest-covers-every-subject-and-lens', answer, spec.lines);

  assert.equal(verdicts.length, 1);
  assert.equal(verdicts[0].subject, `${subject} \u00b7 ${lens}`, 'the verdict names the pair, because the four lenses are four questions');
});

test('C002 an exemption answers for a pair without a reading, and the report counts it as exempt', () => {
  const { spec } = scratchRun();
  const subject = RUN_INPUT.declaration.sections[2].id;
  const lens = INQUEST_LENSES[3];
  const declaration = { ...RUN_INPUT.declaration, exemptions: [{ subject, lens, why: 'the section states no procedure' }] };
  const answer = coveringAnswers(spec.lines, declaration, { omit: { subject, lens } });
  const artifact = { ...golden, exemptions: declaration.exemptions };

  const verdicts = checkAll({ specLines: spec.lines, artifact, recorded: { inquest: answer } }).verdicts
    .filter((verdict) => verdict.check === 'inquest-covers-every-subject-and-lens');

  assert.deepEqual(verdicts, []);
});

test('C002 the answered pairs plus the exempted pairs are the declared subjects crossed with the lens vocabulary', () => {
  const { spec } = scratchRun();
  const declaration = RUN_INPUT.declaration;
  const pairs = inquestPairs(subjectsOf(declaration));
  const answer = coveringAnswers(spec.lines, declaration, { omit: pairs[0] });

  assert.equal(answer.length + 1, pairs.length);
  for (const pair of pairs) {
    const answered = answer.some((record) => record.subject === pair.subject && record.lens === pair.lens);
    assert.equal(answered || pair === pairs[0], true, `${pair.subject} · ${pair.lens}`);
  }
});

// ---------------------------------------------------------------------------
// C003 — the closed vocabularies
// ---------------------------------------------------------------------------

test('C003 a lens outside the declared set is refused by the readings validator, naming the lens', () => {
  const scratch = scratchRun();
  writeInquest(scratch.directory, [answerFor(scratch.spec.lines, RUN_INPUT.declaration, 's1', 'performance')].map((record) => ({ ...record, lens: 'performance' })));

  const read = readReadingsFile(join(scratch.directory, INQUEST_FILE));

  assert.equal(read.ok, false);
  assert.match(read.problems[0], /performance/);
  assert.equal(new RegExp(INQUEST_LENSES.join('|')).test(read.problems[0]), true, 'the refusal names the vocabulary it draws from');
});

test('C003 an answer outside the declared set is refused by the placement check, naming the subject and the answer', () => {
  const { spec } = scratchRun();
  const answer = coveringAnswers(spec.lines, RUN_INPUT.declaration, { overrides: { answer: 'maybe' } });

  const verdicts = verdictsOf('inquest-answers-stay-in-the-declared-vocabulary', answer, spec.lines);

  assert.equal(verdicts.length > 0, true);
  assert.match(verdicts[0].subject, /·/, 'the verdict names the pair, so the pair is what is repaired');
  assert.match(verdicts[0].reason, /maybe/);
  assert.equal(new RegExp(INQUEST_ANSWERS.join(', ')).test(verdicts[0].reason), true);
});

test('C003 the two vocabularies have one source, and neither the command file nor the brief restates them', () => {
  assert.deepEqual([...INQUEST_LENSES], ['omission', 'contradiction', 'deficiency', 'risk']);
  assert.deepEqual([...INQUEST_ANSWERS], ['Yes', 'No', 'A', 'B', 'C']);
  assert.equal(/omission/.test(COMMAND), false, 'the command file restates a lens');
  assert.equal(/omission/.test(readFileSync(BRIEF_PATH, 'utf8')), false, 'the brief restates a lens rather than substituting it');
});

// ---------------------------------------------------------------------------
// C004 — an answer rests on a line of the specification
// ---------------------------------------------------------------------------

test('C004 a quote the named line carries is accepted', () => {
  const { spec } = scratchRun();
  const answer = coveringAnswers(spec.lines, RUN_INPUT.declaration);

  assert.equal(answer.every((record) => spec.lines[record.line - 1].includes(record.quote)), true);
  assert.deepEqual(verdictsOf('inquest-answers-are-grounded-in-their-line', answer, spec.lines), []);
  assert.deepEqual(verdictsOf('inquest-answers-cite-a-line-inside-the-specification', answer, spec.lines), []);
});

test('C004 a quote the named line does not carry is one verdict naming the line', () => {
  const { spec } = scratchRun();
  const answer = coveringAnswers(spec.lines, RUN_INPUT.declaration, { overrides: { quote: 'aphrase that no line of this document carries' } });

  const verdicts = verdictsOf('inquest-answers-are-grounded-in-their-line', answer, spec.lines);

  assert.equal(verdicts.length, answer.length);
  assert.equal(new RegExp(`line ${answer[0].line}`).test(verdicts[0].reason), true);
});

test('C004 a quote broken across a line break is still accepted, because the comparison is normalised', () => {
  const { spec } = scratchRun();
  const grounded = groundingFor(spec.lines, RUN_INPUT.declaration, 'admission');
  const splitAt = grounded.quote.indexOf(' ');
  const broken = { ...answerFor(spec.lines, RUN_INPUT.declaration, 'admission', 'omission'), quote: `${grounded.quote.slice(0, splitAt)}\n   ${grounded.quote.slice(splitAt + 1)}` };

  assert.equal(normalised(spec.lines[broken.line - 1]).includes(normalised(broken.quote)), true);
  assert.deepEqual(verdictsOf('inquest-answers-are-grounded-in-their-line', [broken], spec.lines), []);
});

test('C004 a line beyond the specification is refused rather than thrown on', () => {
  const { spec } = scratchRun();
  const beyond = coveringAnswers(spec.lines, RUN_INPUT.declaration).map((record) => ({ ...record, line: 10000 }));

  const grounded = verdictsOf('inquest-answers-are-grounded-in-their-line', beyond, spec.lines);
  const cited = verdictsOf('inquest-answers-cite-a-line-inside-the-specification', beyond, spec.lines);

  assert.equal(grounded.length, beyond.length, 'specLines[9999] is undefined and the check says so rather than throwing');
  assert.equal(cited.length, beyond.length, 'and the citation resolves to nothing');
});

test('C004 grounding is decided against the specification, never against the artifact', () => {
  const { spec } = scratchRun();
  const inArtifactOnly = answerFor(spec.lines, RUN_INPUT.declaration, 'admission', 'omission', { quote: 'settlement-replays-admission' });

  assert.equal(golden.sequences.some((entry) => entry.id === inArtifactOnly.quote), true, 'the phrase exists in the artifact');
  assert.equal(spec.lines[inArtifactOnly.line - 1].includes(inArtifactOnly.quote), false, 'and not on the line the answer names');
  assert.equal(verdictsOf('inquest-answers-are-grounded-in-their-line', [inArtifactOnly], spec.lines).length, 1);
});

test('C004 a record missing any declared field is refused by the readings validator', () => {
  assert.deepEqual(missingReadingFields({ subject: 'a', lens: 'omission', question: 'q', answer: 'Yes', line: 3, quote: 'x', reader: 'inquest' }), []);
  assert.deepEqual(missingReadingFields({ subject: 'a', lens: 'omission', question: 'q', answer: 'Yes', line: 3, quote: 'x' }), ['reader']);
  assert.deepEqual(missingReadingFields({ subject: 'a', outcome: 'direct', reader: 'span' }), [], 'the sequence shape is unchanged');
});

// ---------------------------------------------------------------------------
// C005 — the audit is a re-reading, not a repetition
// ---------------------------------------------------------------------------

test('C005 the questions cross the declared subjects with the lenses and carry the previous answer', () => {
  const { spec } = scratchRun();
  const declaration = RUN_INPUT.declaration;
  const previous = [answerFor(spec.lines, declaration, 'admission', 'omission', { answer: 'Yes' })];

  const questions = inquestQuestions({ declaration, previousAnswers: previous });

  assert.equal(questions.length, 18 * INQUEST_LENSES.length);
  const matched = questions.find((entry) => entry.subject === 'admission' && entry.lens === 'omission');
  assert.equal(matched.previous, 'Yes');
  assert.equal(questions.filter((entry) => entry.previous !== null).length, 1);
  assert.equal(typeof matched.question, 'string');
});

test('C005 the rendered brief names each subject, each lens and the previous answer', () => {
  const { spec } = scratchRun();
  const declaration = RUN_INPUT.declaration;
  const questions = inquestQuestions({ declaration, previousAnswers: [answerFor(spec.lines, declaration, 'admission', 'omission', { answer: 'Yes' })] });

  const rendered = renderBrief({ briefName: 'inquest', worklistPath: join(scratchRun().directory, 'worklist.txt'), previousAnswers: questions, predicate: PREDICATE });

  assert.match(rendered, /admission/);
  assert.match(rendered, /omission/);
  assert.match(rendered, /Yes/);
  assert.equal(rendered.includes(INQUEST_LENSES.join(', ')), true, 'the vocabulary comes from its one source');
  assert.equal(rendered.includes(INQUEST_ANSWERS.join(' / ')), true);
});

test('C005 every declared pair renders once, and a pair the previous generation never answered is not dropped', () => {
  const { spec } = scratchRun();
  const declaration = RUN_INPUT.declaration;
  const questions = inquestQuestions({ declaration, previousAnswers: [] });

  const rendered = renderBrief({ briefName: 'inquest', worklistPath: 'worklist.txt', previousAnswers: questions, predicate: PREDICATE });

  assert.equal(questions.every((entry) => entry.previous === null), true);
  assert.equal(rendered.includes('not asked'), true, 'an unanswered pair says so rather than vanishing');
  for (const entry of questions) {
    assert.equal(rendered.split(`- ${entry.subject} · ${entry.lens} —`).length - 1, 1, `${entry.subject} · ${entry.lens} renders once`);
  }
  assert.equal(rendered.split('?').length - 1, 1, 'a brief asks exactly one question');
});

test('C005 the brief is one of the roles the renderer accepts', () => {
  assert.deepEqual([...BRIEF_NAMES], ['span', 'adjudicate', 'adversarial', 'reroute', 'adhoc', 'inquest']);
  assert.equal(BRIEF_NAMES.includes('inquest'), true);
});

// ---------------------------------------------------------------------------
// C006 — an unanswered audit is visible
// ---------------------------------------------------------------------------

test('C006 a generation whose audit was not answered is incomplete while every check is green', () => {
  const { spec } = scratchRun();
  const { context } = contextThrough(12);
  const { summary } = checkAll({ specLines: spec.lines, artifact: golden, recorded: { inquest: coveringAnswers(spec.lines, RUN_INPUT.declaration) } });
  const declaredChecks = summary.checksRun;

  assert.equal(readPhaseSettled(context.status, phaseById(13)), false);
  assert.equal(isComplete({ summary, status: context.status, declaredChecks }), false);
});

test('C006 a generation whose audit was answered is settled', () => {
  const { spec } = scratchRun();
  const { context } = contextThrough(13);
  writeInquest(context.directory, coveringAnswers(spec.lines, RUN_INPUT.declaration));
  const outcome = runPhase(13, context);

  assert.equal(outcome.ok, true, outcome.reason);
  assert.equal(readPhaseSettled(context.status, phaseById(13)), true);
});

test('C006 the three counts print beside the previous generation and are never summed with the apparatus', () => {
  const { spec } = scratchRun();
  const { context } = contextThrough(13);
  const { summary } = checkAll({ specLines: spec.lines, artifact: golden, recorded: { inquest: coveringAnswers(spec.lines, RUN_INPUT.declaration) } });
  const previous = { asked: 40, answered: 40, exempt: 0 };
  const inquest = { asked: 56, answered: 56, exempt: 0 };

  // Neither call takes a declared-checks argument: PX-244 made both read
  // `summary.checksDeclared`, which is the same value and cannot disagree with it.
  const lines = healthLines({ summary, status: context.status, inquest: { ...inquest, previous } });
  const report = buildReport({ status: context.status, summary, artifact: { path: '/tmp/nothing.json', digest: 'none' }, inquest: { ...inquest, previous } });

  const printed = lines.filter((line) => line.startsWith('inquest'));
  assert.equal(printed.length, 3);
  assert.match(printed[0], /^inquestAsked=56 \(previous generation: 40\)$/);
  assert.match(printed[1], /^inquestAnswered=56 \(previous generation: 40\)$/);
  assert.match(printed[2], /^inquestExempt=0 \(previous generation: 0\)$/);
  assert.equal(lines.filter((line) => line.startsWith('checksRun')).length, 1);
  assert.equal(lines.some((line) => /(checksRun|railExits)=.*inquest/.test(line)), false, 'no line adds the two kinds of count together');
  assert.match(report, /inquestAsked=56/);
});

test('C006 a vacuous audit and an unanswered audit do not print alike', () => {
  const { context } = contextThrough(13, { ...RUN_INPUT.declaration, sections: [], entries: [] });
  writeInquest(context.directory, []);
  const outcome = runPhase(13, context);

  assert.equal(outcome.ok, true, outcome.reason);
  assert.equal(readPhaseSettled(context.status, phaseById(13)), true, 'a declaration with nothing to ask is complete');

  const unanswered = contextThrough(13);
  assert.equal(readPhaseSettled(unanswered.context.status, phaseById(13)), false, 'a reader who never reported is not');
});

// ---------------------------------------------------------------------------
// The checks and the block
// ---------------------------------------------------------------------------

test('the four inquest checks run inside the block, and a missing audit is not a finding', () => {
  const { spec } = scratchRun();
  const without = checkAll({ specLines: spec.lines, artifact: golden });
  const empty = checkAll({ specLines: spec.lines, artifact: golden, recorded: { inquest: [] } });
  const covered = checkAll({ specLines: spec.lines, artifact: golden, recorded: { inquest: coveringAnswers(spec.lines, RUN_INPUT.declaration) } });

  assert.deepEqual(without.verdicts, [], 'no audit anywhere is not a finding: the product path has nothing to judge');
  assert.equal(without.summary.checksRun, covered.summary.checksRun, 'a check runs whether or not there is an audit to judge');
  assert.equal(covered.summary.checksRun, 21, 'the declared set grew by four across PX-246 and PX-247, and every one of them runs with or without an audit');
  assert.equal(empty.summary, null, 'an audit that was opened and answered nothing is a finding');
  assert.equal(new Set(empty.verdicts.map((verdict) => verdict.check)).has('inquest-covers-every-subject-and-lens'), true);
});

test('the inquest does not enter the artifact', () => {
  const { spec } = scratchRun();
  const before = JSON.stringify(golden);
  checkAll({ specLines: spec.lines, artifact: golden, recorded: { inquest: coveringAnswers(spec.lines, RUN_INPUT.declaration) } });

  assert.equal(JSON.stringify(golden), before, 'the checks read the artifact and never write to it');
  assert.equal(Object.keys(golden).includes('inquest'), false);
});

// ---------------------------------------------------------------------------
// Integration: the driver and the command line
// ---------------------------------------------------------------------------

test('IT through reaches every phase in order over a seeded audit, and the report prints the counts', () => {
  const { specPath, spec, directory } = scratchRun();
  const run = startRun({ specPath, spec });
  seed(directory, spec.lines, RUN_INPUT.declaration);

  const outcome = runThrough(buildContext({ specPath, spec, run: { directory, status: run.status } }));

  assert.equal(outcome.ok, true, outcome.results.filter((result) => !result.ok).map((result) => `${result.id}: ${result.reason}`).join('; '));
  assert.equal(outcome.results.length, 18);
  assert.deepEqual(outcome.results.map((result) => result.id), Array.from({ length: 18 }, (_, index) => index + 1));

  const reported = phase(['report', specPath]);
  assert.equal(reported.status, 0, reported.stderr);
  assert.match(reported.stdout, /inquestAsked=72/);
  assert.match(reported.stdout, /\*\*complete\*\*/);
});

test('IT an unanswered pair refuses phase 13 by name and the check block is refused entry', () => {
  const { specPath, spec, directory } = scratchRun();
  const run = startRun({ specPath, spec });
  const subject = RUN_INPUT.declaration.sections[2].id;
  const lens = INQUEST_LENSES[3];
  seed(directory, spec.lines, RUN_INPUT.declaration, { omit: { subject, lens } });
  const context = buildContext({ specPath, spec, run: { directory, status: run.status } });
  runThrough(context, 12);

  const refused = runPhase(13, context);

  assert.equal(refused.ok, false);
  assert.match(refused.reason, new RegExp(subject));
  assert.match(refused.reason, new RegExp(lens));
  assert.equal(refused.exitCode, 1);

  const blocked = runPhase(14, context);
  assert.equal(blocked.reason, 'phase 13 is not done');
  assert.equal(blocked.exitCode, 1);

  const driven = phase(['through', specPath]);
  assert.equal(driven.status, 1, 'the run stops rather than printing a green block');
  assert.equal(/checksRun=/.test(driven.stdout), false);
});

test('IT the brief the renderer accepts for the audit is the one the command file lists', () => {
  assert.equal(BRIEF_NAMES.includes('inquest'), true);
  assert.equal(/`inquest`/.test(COMMAND), true, 'the command file lists the brief name');
  assert.equal(readFileSync(BRIEF_PATH, 'utf8').includes('{{PREVIOUS_ANSWERS}}'), true);
  assert.equal(readFileSync(BRIEF_PATH, 'utf8').includes('{{LENSES}}'), true);
});

test('IT every surface judges the same audit, so the report cannot report complete over a refusal', async () => {
  const { specPath, spec, directory } = scratchRun();
  const run = startRun({ specPath, spec });
  seed(directory, spec.lines, RUN_INPUT.declaration);
  writeInquest(directory, coveringAnswers(spec.lines, RUN_INPUT.declaration, { overrides: { quote: 'a phrase no line of this document carries' } }));
  const context = buildContext({ specPath, spec, run: { directory, status: run.status } });
  runThrough(context, 13);
  assert.equal(existsSync(artifactPathFor(specPath)), true, 'the block is built over an artifact that exists');

  const checksPhase = runPhase(14, context);
  const product = await runCommand([specPath], { runInput: null });
  const reported = phase(['report', specPath]);

  assert.equal(checksPhase.ok, false, 'the checks phase refuses a misquoted answer');
  assert.equal(product.exitCode, 1, 'so does the product path');
  assert.equal(reported.status, 1, 'and the report says incomplete rather than complete');
  assert.match(reported.stderr, /inquest-answers-are-grounded-in-their-line/, 'naming what refused it');
  assert.equal(/\*\*complete\*\*/.test(reported.stdout), false);
});

test('IT the block judges the audit a real run hands it, so a misquoted answer reddens phase 14', () => {
  const { specPath, spec, directory } = scratchRun();
  const run = startRun({ specPath, spec });
  seed(directory, spec.lines, RUN_INPUT.declaration);
  writeInquest(directory, coveringAnswers(spec.lines, RUN_INPUT.declaration, { overrides: { quote: 'a phrase no line of this document carries' } }));
  const context = buildContext({ specPath, spec, run: { directory, status: run.status } });

  assert.equal(runThrough(context, 13).ok, true, 'the gate checks the shape, the signature and the coverage, not the grounding');
  const outcome = runPhase(14, context);

  assert.equal(outcome.ok, false);
  assert.match(outcome.reason, /inquest-answers-are-grounded-in-their-line/, 'a block that judged no audit would have gone quietly green');
});

test('IT the audit is recorded in the generation history, so the next generation can compare', () => {
  const { specPath, spec, directory } = scratchRun();
  const run = startRun({ specPath, spec });
  seed(directory, spec.lines, RUN_INPUT.declaration);
  const context = buildContext({ specPath, spec, run: { directory, status: run.status } });
  runThrough(context);

  const read = readInquestFile(join(directory, INQUEST_FILE));
  assert.equal(read.ok, true);
  assert.equal(read.readings.length, 72);
  assert.equal(existsSync(artifactPathFor(specPath)), true);
  const declaration = readDeclarationFile(join(directory, DECLARATION_FILE));
  assert.equal(declaration.ok, true);
});
