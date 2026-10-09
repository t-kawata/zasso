// The generation (PX-242, contracts C001-C007).
//
// A run directory used to be good for one invocation. The loop counter was spent over
// the lifetime of the directory and never refunded, so a repaired declaration was
// refused for ever; a completed run could not re-enter Step 0 at all, because the
// command's own gate requires a next phase and every phase was done; and one appended
// line to the specification printed "remove the run directory to start again", which
// destroys the declaration and the readings the artifact was built from.
//
// Each invocation now opens a generation: the budget is returned, the [read] phases are
// re-opened so the reader is asked again, and every inherited asset stays where it is.
// What survives an edit is decided by citation rather than wholesale, and what the
// invocation is given after the specification path is filed as material rather than
// becoming a second argument.
//
// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
// @verifies C005
// @verifies C006
// @verifies C007
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PHASES, PHASE_TAGS, unchangedRepeatReason } from '../../.claude/scripts/educe-sequences/rail/gates.mjs';
import { digestOfTree } from '../../.claude/scripts/educe-sequences/rail/harness.mjs';
import { assetDigestOf, INVALIDATION_PRIMITIVES, survivingAssets } from '../../.claude/scripts/educe-sequences/rail/inherit.mjs';
import { digestOf, readSpecification } from '../../.claude/scripts/educe-sequences/rail/load.mjs';
import { artifactPathFor } from '../../.claude/scripts/educe-sequences/rail/paths.mjs';
import {
  beginRun,
  buildContext,
  HALT_EXIT_CODE,
  nextPhase,
  runPhase,
  runThrough,
  startRun,
} from '../../.claude/scripts/educe-sequences/rail/phases.mjs';
import { DECLARATION_FILE, INQUEST_FILE, writeReadingsFile } from '../../.claude/scripts/educe-sequences/rail/readings.mjs';
import {
  generationOf,
  loopsFor,
  noteDone,
  noteLoop,
  openPhases,
  phaseState,
  readStatus,
  runDirectoryFor,
  statusPath,
  TRACKED_PHASES,
  writeStatus,
} from '../../.claude/scripts/educe-sequences/rail/run-state.mjs';
import { digestOfSupplied, fileSuppliedMaterial, MATERIAL_FILE, SUPPLIED_DIRECTORY, suppliedDigestOf } from '../../.claude/scripts/educe-sequences/rail/supplied.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PHASE_SCRIPT = join(PROJECT_ROOT, '.claude/scripts/educe-sequences/rail/phase.mjs');
const TOOL_ROOT = join(PROJECT_ROOT, '.claude/scripts/educe-sequences');
const SPEC_SOURCE = new URL('./fixtures/spec/ledger.md', import.meta.url).pathname;
const RUN_INPUT = JSON.parse(readFileSync(new URL('./fixtures/spec/ledger.run.json', import.meta.url), 'utf8'));

/** The ids the phase table declares as the ones a reader performs. */
const READ_IDS = PHASES.filter((phase) => phase.tag === PHASE_TAGS.READ).map((phase) => phase.id);

/** A throwaway specification, so no test writes into the committed fixture. */
// [::TICKET::] PX-242, PX-243, PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-242|PX-243|PX-244) --for-spec --no-implementation-order`.
function scratchRun() {
  const root = mkdtempSync(join(tmpdir(), 'educe-generation-'));
  const specPath = join(root, 'ledger.md');
  copyFileSync(SPEC_SOURCE, specPath);
  return { root, specPath, spec: readSpecification(specPath), directory: join(root, 'educe-sequences') };
}

/** Seed a run's reading files from the recorded run input, without a declaration. */
// [::TICKET::] PX-242, PX-243, PX-244, PX-247 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-242|PX-243|PX-244|PX-247) --for-spec --no-implementation-order`.
function seedReadings(directory) {
  const span = RUN_INPUT.readings.sequences.map((reading) => ({ ...reading, steps: [], operations: [] }));
  span[0].steps = RUN_INPUT.readings.steps;
  span[0].operations = RUN_INPUT.readings.operations;
  writeReadingsFile(join(directory, 'readings-span.jsonl'), span);
  writeReadingsFile(join(directory, 'readings-adjudicate.jsonl'), RUN_INPUT.readings.adjudications);
  writeReadingsFile(join(directory, 'readings-reroute.jsonl'), []);
  writeReadingsFile(join(directory, 'readings-adversarial.jsonl'), RUN_INPUT.readings.adversarial);
  writeReadingsFile(join(directory, INQUEST_FILE), RUN_INPUT.readings.inquest);
}

/** Seed a run's reading files from the recorded run input. */
// [::TICKET::] PX-242, PX-243, PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-242|PX-243|PX-244) --for-spec --no-implementation-order`.
function seed(directory) {
  writeFileSync(join(directory, DECLARATION_FILE), `${JSON.stringify(RUN_INPUT.declaration, null, 2)}\n`);
  seedReadings(directory);
}

/** A generation in which every phase is done: the state a second invocation inherits. */
// [::TICKET::] PX-242, PX-243, PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-242|PX-243|PX-244) --for-spec --no-implementation-order`.
function seededRun() {
  const scratch = scratchRun();
  const run = startRun({ specPath: scratch.specPath, spec: scratch.spec });
  seed(run.directory);
  const context = buildContext({ specPath: scratch.specPath, spec: scratch.spec, run: { directory: run.directory, status: run.status } });
  const outcome = runThrough(context);
  assert.equal(outcome.ok, true, outcome.results.filter((result) => !result.ok).map((result) => result.reason).join('; '));
  return { ...scratch, context };
}

/**
 * A run whose declaration names a limb no line of the specification carries, with
 * identity already proven so that phase 2 can actually be entered and refused.
 */
// [::TICKET::] PX-242, PX-243, PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-242|PX-243|PX-244) --for-spec --no-implementation-order`.
function openBare() {
  const scratch = scratchRun();
  const run = startRun({ specPath: scratch.specPath, spec: scratch.spec });
  writeFileSync(join(run.directory, DECLARATION_FILE), `${JSON.stringify(declarationWithLimb('a limb no line carries'))}\n`);
  const context = buildContext({ specPath: scratch.specPath, spec: scratch.spec, run: { directory: run.directory, status: run.status } });
  runThrough(context, 1);
  return { ...scratch, context };
}

/** The recorded declaration with one limb replaced, so a gate can be made to refuse. */
// [::TICKET::] PX-242, PX-243, PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-242|PX-243|PX-244) --for-spec --no-implementation-order`.
function declarationWithLimb(limb) {
  return { ...RUN_INPUT.declaration, predicate: { limbs: [...RUN_INPUT.declaration.predicate.limbs.slice(1), limb] } };
}

/** Drive phase 2 to its limit, so the generation the next begin inherits has halted. */
// [::TICKET::] PX-242, PX-243, PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-242|PX-243|PX-244) --for-spec --no-implementation-order`.
function haltPhaseTwo(context) {
  const phase = PHASES.find((candidate) => candidate.id === 2);
  for (let refusal = 0; refusal < phase.maxLoops; refusal += 1) runPhase(2, context);
  const halted = runPhase(2, context);
  assert.equal(halted.halted, true, halted.reason);
  return halted;
}

/** Run the phase driver as the command file runs it. */
// [::TICKET::] PX-242, PX-243, PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-242|PX-243|PX-244) --for-spec --no-implementation-order`.
function begin(argv) {
  return spawnSync('node', [PHASE_SCRIPT, ...argv], { cwd: PROJECT_ROOT, encoding: 'utf8' });
}

// ---------------------------------------------------------------------------
// C001 — a generation opens with its full budget
// ---------------------------------------------------------------------------

test('C001 a generation opens with every loop returned and the superseded one kept in history', () => {
  const { specPath, spec, directory } = scratchRun();
  const first = startRun({ specPath, spec });
  noteDone(first.status, 2, { verdict: 'the predicate is stated on line 10', tag: PHASE_TAGS.READ });
  noteLoop(first.status, 2, PHASE_TAGS.READ, 'no line carries every limb');
  noteLoop(first.status, 2, PHASE_TAGS.READ, 'no line carries every limb');
  writeStatus(directory, first.status);
  assert.equal(loopsFor(first.status, 2), 2);

  const begun = beginRun({ specPath, spec });

  assert.equal(begun.mode, 'new-generation');
  assert.equal(begun.generation, 2);
  assert.equal(begun.status.phases.every((record) => record.loops === 0), true, 'every loop is returned');
  assert.deepEqual(PHASES.map((phase) => phase.id), Array.from({ length: 18 }, (_, index) => index + 1));
  assert.equal(TRACKED_PHASES, PHASES.length);
  assert.equal(READ_IDS.every((id) => phaseState(begun.status, id).status === 'open'), true, 'every phase a reader performs is open again');

  const superseded = begun.status.history.at(-1);
  assert.equal(superseded.phases.find((record) => record.id === 2).loops, 2, 'the loops the previous generation spent are readable');
  assert.equal(superseded.phases.find((record) => record.id === 2).status, 'refused');
});

test('C001 the paths the driver derives are the entry point the plan named', () => {
  const { specPath, spec } = scratchRun();

  const begun = beginRun({ specPath, spec });

  assert.equal(typeof begun.generation, 'number');
  assert.equal(begun.mode, 'new-generation');
  assert.equal(typeof begun.assets.digest, 'string');
  assert.deepEqual(begun.supplied, []);
  assert.deepEqual(begun.invalidated, []);
});

test('C001 a status written before this ticket is read as a run that has opened no generation', () => {
  const { specPath, spec, directory } = scratchRun();
  writeStatus(directory, { spec: { path: 'ledger.md', sha256: spec.sha256, lines: spec.lineCount }, phases: [], readings: {} });

  const begun = beginRun({ specPath, spec });

  assert.equal(begun.generation, 1);
  assert.deepEqual(begun.status.supplied, []);
  assert.deepEqual(begun.status.invalidated, []);
  assert.equal(Array.isArray(begun.status.history), true);
  assert.equal(begun.status.history.length, 0, 'a status that opened nothing supersedes nothing');
});

test('C001 a status written before this ticket that holds phase records is the generation it supersedes', () => {
  const { specPath, spec, directory } = scratchRun();
  writeStatus(directory, {
    spec: { path: 'ledger.md', sha256: spec.sha256, lines: spec.lineCount },
    phases: [{ id: 2, status: 'refused', verdict: 'no line carries every limb', loops: 2 }],
    readings: {},
  });

  const begun = beginRun({ specPath, spec });

  assert.equal(begun.generation, 2, 'records without a number are a generation in substance');
  assert.equal(begun.status.history.length, 1);
  assert.equal(begun.status.history[0].phases[0].loops, 2, 'the loops it had spent are readable');
  assert.equal(begun.status.phases.find((record) => record.id === 2).loops, 0, 'and refunded');
});

// ---------------------------------------------------------------------------
// C002 — a new generation re-opens exactly the [read] phases
// ---------------------------------------------------------------------------

test('C002 a new generation re-opens the [read] phases and every deterministic proof stays done', () => {
  const { specPath, spec, directory } = seededRun();
  writeFileSync(join(directory, DECLARATION_FILE), `${JSON.stringify(RUN_INPUT.declaration, null, 2)}\n`);

  const begun = beginRun({ specPath, spec });

  assert.equal(begun.mode, 'new-generation');
  assert.deepEqual(openPhases(begun.status), READ_IDS, 'the re-opened set is the read set the phase table declares');
  assert.equal(begun.status.phases.filter((record) => !READ_IDS.includes(record.id)).every((record) => record.status === 'done'), true);
  assert.equal(nextPhase(begun.status), 2, 'the lowest re-opened id is the first the driver proposes');
  assert.equal(READ_IDS.length > 1, true);
});

// ---------------------------------------------------------------------------
// C003 — the loop limit is per generation
// ---------------------------------------------------------------------------

test('C003 the loop budget still halts inside one generation', () => {
  const { context } = openBare();
  const phase = PHASES.find((candidate) => candidate.id === 2);
  const refusals = Array.from({ length: phase.maxLoops }, () => runPhase(2, context));

  assert.equal(refusals.every((result) => result.halted === false && result.exitCode === 1), true);
  assert.equal(phaseState(context.status, 2).loops, phase.maxLoops);

  const halted = runPhase(2, context);

  assert.equal(halted.halted, true);
  assert.equal(halted.backTo, null, 'a halt names no back-edge');
  assert.equal(halted.expects, null, 'a halt asks the reader for nothing');
  assert.equal(halted.exitCode, HALT_EXIT_CODE);
  assert.equal(phaseState(context.status, 2).loops, phase.maxLoops, 'the halt spends no further loop');
  assert.equal(halted.reason.includes(`spent ${phase.maxLoops} of its ${phase.maxLoops} loops`), true);
});

test('C003 a new generation returns the budget, so a repaired declaration is read rather than refused for ever', () => {
  const { specPath, spec, directory, context } = openBare();
  haltPhaseTwo(context);

  // The audit's finding: the reader repairs the declaration and the repair is refused,
  // because the loops were spent over the life of the directory and never returned.
  writeFileSync(join(directory, DECLARATION_FILE), `${JSON.stringify(RUN_INPUT.declaration, null, 2)}\n`);
  const begun = beginRun({ specPath, spec });
  assert.equal(begun.mode, 'new-generation');
  assert.equal(loopsFor(begun.status, 2), 0);

  const repaired = runPhase(2, buildContext({ specPath, spec, run: { directory: begun.directory, status: begun.status } }));

  assert.equal(repaired.ok, true, repaired.reason);
  assert.equal(repaired.exitCode, 0);
});

// ---------------------------------------------------------------------------
// C004 — the guard against escaping the limit without changing anything
// ---------------------------------------------------------------------------

test('C001 a new generation opens when nothing changed and the previous one halted, and the repeat is reported', () => {
  const { specPath, spec, directory, context } = openBare();
  seedReadings(directory);
  haltPhaseTwo(context);
  const superseded = generationOf(readStatus(directory));

  const reopened = beginRun({ specPath, spec });

  assert.equal(reopened.ok, true, 're-asking the reader is what a generation is for, so nothing refuses');
  assert.equal(reopened.mode, 'new-generation');
  assert.equal(reopened.generation, superseded + 1);
  assert.equal(reopened.refused, undefined);
  assert.match(reopened.notice, /phase 2/, 'the notice names the phase');
  assert.match(reopened.notice, /3 of 3/, 'the notice names the loops');
  assert.match(reopened.notice, new RegExp(`generation ${superseded}\\b`), 'the notice names the generation it supersedes');
  const reopenedStatus = readStatus(directory);
  assert.equal(nextPhase(reopenedStatus), 2, 'the [read] phases are re-opened, so the reader is asked again');
  assert.equal(phaseState(reopenedStatus, 2).loops, 0, 'and the budget is returned with them');
});

test('C004 the guard does not fire when an asset changed, because a repair is what a new generation is for', () => {
  const { specPath, spec, directory, context } = openBare();
  haltPhaseTwo(context);
  writeFileSync(join(directory, DECLARATION_FILE), `${JSON.stringify(RUN_INPUT.declaration, null, 2)}\n`);

  const begun = beginRun({ specPath, spec });

  assert.equal(begun.refused, undefined);
  assert.equal(begun.mode, 'new-generation');
});

test('C004 the guard does not fire when the specification itself was edited, because that is the repair', () => {
  const { specPath, spec, directory, context } = openBare();
  haltPhaseTwo(context);
  appendFileSync(specPath, '\nAn operator audits the ledger.\n');
  const edited = readSpecification(specPath);

  const begun = beginRun({ specPath, spec: edited });

  assert.equal(begun.refused, undefined);
  assert.equal(begun.mode, 'new-generation');
  assert.match(readStatus(directory).spec.sha256, new RegExp(`^${edited.sha256}$`));
});

test('C001 the repeat is a fact a caller can read, and the notice names the halt it reports', () => {
  const { specPath, spec, context } = openBare();
  haltPhaseTwo(context);
  const directory = runDirectoryFor(specPath);
  const status = readStatus(directory);
  const digest = assetDigestOf(directory);

  const notice = unchangedRepeatReason(status, { assetDigest: digest, specSha256: spec.sha256 });

  assert.equal(typeof notice, 'string');
  assert.match(notice, /phase 2/);
  assert.equal(unchangedRepeatReason(status, { assetDigest: 'different', specSha256: spec.sha256 }), null, 'a repaired asset is why a new generation is opened');
  assert.equal(unchangedRepeatReason(status, { assetDigest: digest, specSha256: 'different' }), null, 'an edited specification is the repair');
  assert.equal(unchangedRepeatReason(null, { assetDigest: digest, specSha256: spec.sha256 }), null, 'a directory with nothing in it has no halt to report');
  assert.equal(
    unchangedRepeatReason({ phases: [], history: [], spec: { sha256: spec.sha256 }, assets: { digest } }, { assetDigest: digest, specSha256: spec.sha256 }),
    null,
    'a generation that halted nowhere has no repeat to report',
  );
});

test('C001 opening a generation over an unchanged set deletes none of the assets it inherits', () => {
  const { specPath, spec, directory, context } = openBare();
  seedReadings(directory);
  haltPhaseTwo(context);
  const before = readdirSync(directory).sort();

  const reopened = beginRun({ specPath, spec });

  assert.equal(reopened.mode, 'new-generation');
  const after = readdirSync(directory).sort();
  // The directory may grow — the generation files the material it was given — but an
  // inherited asset is never deleted, which is the property the refusal used to carry.
  assert.deepEqual(before.filter((name) => !after.includes(name)), [], 'no inherited asset is lost');
  assert.equal(after.includes(DECLARATION_FILE), true);
});

// ---------------------------------------------------------------------------
// C005 — the verification branch
// ---------------------------------------------------------------------------

test('C005 a second begin with nothing entered and nothing changed is a verification', () => {
  const { specPath, spec, directory } = scratchRun();
  const opened = beginRun({ specPath, spec });
  assert.equal(opened.status.entered, false);
  const before = readFileSync(statusPath(directory), 'utf8');

  const again = beginRun({ specPath, spec });

  assert.equal(again.mode, 'verification');
  assert.equal(again.generation, opened.generation);
  assert.equal(again.status.phases.every((record) => record.loops === 0), true);
  assert.equal(readFileSync(statusPath(directory), 'utf8'), before, 'a verification writes nothing');
});

test('C005 a verification leaves the artifact bytes identical', () => {
  const { specPath, spec } = scratchRun();
  beginRun({ specPath, spec });
  const artifactBefore = existsSync(artifactPathFor(specPath)) ? digestOf(artifactPathFor(specPath)) : null;

  const again = beginRun({ specPath, spec });

  const artifactAfter = existsSync(artifactPathFor(specPath)) ? digestOf(artifactPathFor(specPath)) : null;
  assert.equal(again.mode, 'verification');
  assert.equal(artifactAfter, artifactBefore);
});

test('C005 an edited specification is never reported as a verification', () => {
  const { specPath, spec } = scratchRun();
  beginRun({ specPath, spec });
  appendFileSync(specPath, '\n## 11. Added later\n\nAn operator audits the ledger.\n');
  const edited = readSpecification(specPath);

  const again = beginRun({ specPath, spec: edited });

  assert.equal(again.mode, 'new-generation', 'a verification over an edited text would carry citations from the old one');
});

// ---------------------------------------------------------------------------
// C006 — supplied material
// ---------------------------------------------------------------------------

test('C006 the material and every named file are filed under the run directory and digested', () => {
  const { specPath, spec, root, directory } = scratchRun();
  const guidance = join(root, 'pre-info.md');
  const prior = join(root, 'pre-info.json');
  writeFileSync(guidance, 'section 5 names the acts\n');
  writeFileSync(prior, '{"entries":["admission"]}\n');

  const filed = fileSuppliedMaterial({ directory, material: 'Read section 5 before the worklist.', namedPaths: [guidance, prior] });

  assert.equal(filed.ok, true, JSON.stringify(filed.problems ?? []));
  assert.deepEqual(filed.files.map((file) => file.name).sort(), ['material.md', 'pre-info.json', 'pre-info.md']);
  assert.equal(filed.files.every((file) => /^[0-9a-f]{64}$/.test(file.sha256)), true);
  assert.equal(readFileSync(join(directory, SUPPLIED_DIRECTORY, 'material.md'), 'utf8'), 'Read section 5 before the worklist.\n');
  assert.equal(suppliedDigestOf(directory), filed.digest, 'the digest is a function of what the directory holds');
  assert.equal(spec.sha256.length, 64);
});

test('C006 an invocation carrying material opens a generation that records it', () => {
  const { specPath, spec, root } = scratchRun();
  const prior = join(root, 'pre-info.json');
  writeFileSync(prior, '{"entries":["admission"]}\n');

  const begun = beginRun({ specPath, spec, material: 'Use the prior artifact as a hint.', namedPaths: [prior] });
  const again = beginRun({ specPath, spec, material: 'Use the prior artifact as a hint.', namedPaths: [prior] });
  const different = beginRun({ specPath, spec, material: 'Different advice.', namedPaths: [prior] });

  assert.equal(begun.supplied.length, 2);
  assert.equal(again.mode, 'verification', 'the same material is not a change');
  assert.equal(different.mode, 'new-generation', 'different material is a change');
});

test('C006 a named path that does not exist is refused by name and nothing is written', () => {
  const { root, directory } = scratchRun();

  const refused = fileSuppliedMaterial({ directory, material: '', namedPaths: [join(root, 'absent.md')] });

  assert.equal(refused.ok, false);
  assert.equal(refused.problems[0].includes('absent.md'), true, 'the problem names the path rather than the rule');
  assert.equal(existsSync(join(directory, SUPPLIED_DIRECTORY)), false);
});

test('C006 two named paths with one basename are refused, because one would silently overwrite the other', () => {
  const { root, directory } = scratchRun();
  const first = join(root, 'a');
  const second = join(root, 'b');
  mkdirIfNeeded(first);
  mkdirIfNeeded(second);
  writeFileSync(join(first, 'prior.json'), '{}\n');
  writeFileSync(join(second, 'prior.json'), '{"different":true}\n');

  const refused = fileSuppliedMaterial({ directory, material: '', namedPaths: [join(first, 'prior.json'), join(second, 'prior.json')] });

  assert.equal(refused.ok, false);
  assert.equal(refused.problems[0].includes('prior.json'), true);
});

test('C006 a prose token that begins with a slash is material, so the invocation still opens the generation', () => {
  const { specPath, directory } = scratchRun();

  // The command is named with a leading slash wherever it is written about, so the word
  // for it appears in the guidance a reader types. Classifying that word as a path makes
  // the invocation unopenable for a reason that has nothing to do with the specification.
  const opened = begin(['begin', specPath, 'このコマンドを用いずに作った成果物を利用し /educe-sequences を成功させよ。']);

  assert.equal(opened.status, 0, opened.stderr);
  assert.match(opened.stdout, /generation 1 \(new generation\)/);
  assert.equal(
    readFileSync(join(directory, SUPPLIED_DIRECTORY, MATERIAL_FILE), 'utf8').includes('/educe-sequences'),
    true,
    'the word is filed as the guidance it is',
  );
});

test('C006 an absolute path that cannot be read is still refused by name, so the narrowing swallows no typo', () => {
  const { specPath } = scratchRun();
  const absent = join(tmpdir(), 'educe-absent-material.md');

  const opened = begin(['begin', specPath, absent]);

  assert.equal(opened.status, 1, 'a path with an extension is a path, and a missing one is still a fault');
  assert.match(opened.stderr, /does not exist/);
  assert.match(opened.stderr, /educe-absent-material\.md/);
});

test('C006 a rooted path with no extension is filed when it names a file, so material is never dropped in silence', () => {
  const { specPath, root, directory } = scratchRun();
  const script = join(root, 'preflight');
  writeFileSync(script, '#!/bin/sh\n');

  const opened = begin(['begin', specPath, script]);

  // Narrowing the classifier must not turn a real file into prose: material that is not
  // filed is material the digest does not cover, and a digest that covers less than the
  // reader supplied is a claim about a set of files that never existed together.
  assert.equal(opened.status, 0, opened.stderr);
  assert.equal(existsSync(join(directory, SUPPLIED_DIRECTORY, 'preflight')), true, 'the file is filed rather than read as a word');
});

test('the status file is replaced rather than written into, so no reader can see half a record', () => {
  const { directory } = scratchRun();
  writeStatus(directory, { generation: 1 });
  const first = statSync(statusPath(directory)).ino;

  writeStatus(directory, { generation: 2 });

  // A replacement lands as one act; an in-place write truncates first, and a reader that
  // arrives between the truncation and the last byte parses a prefix of the record. The
  // inode is the observable: a renamed file is a new file, an overwritten one is not.
  assert.notEqual(statSync(statusPath(directory)).ino, first, 'the status is replaced, not overwritten');
  assert.equal(readStatus(directory).generation, 2);
  assert.deepEqual(readdirSync(directory), ['status.json'], 'the replacement leaves nothing behind');
});

test('a status write that cannot land leaves no temporary file and no damaged record', () => {
  const { directory } = scratchRun();
  mkdirSync(statusPath(directory), { recursive: true });

  assert.throws(() => writeStatus(directory, { generation: 1 }));

  assert.deepEqual(readdirSync(directory), ['status.json'], 'the half-made file is cleaned up rather than left beside the record');
});

test('C006 the empty material digests to one value, so a run with no material is still comparable', () => {
  const { directory } = scratchRun();

  assert.equal(digestOfSupplied([]), digestOfSupplied([]));
  assert.equal(suppliedDigestOf(directory), digestOfSupplied([]));
  assert.equal(/^[0-9a-f]{64}$/.test(digestOfSupplied([])), true);
});

// ---------------------------------------------------------------------------
// C007 — an edited specification is inherited by citation
// ---------------------------------------------------------------------------

test('C007 an edited specification invalidates by citation, names the primitive, and refuses nothing', () => {
  const { specPath, spec, directory } = seededRun();
  const before = readFileSync(join(directory, DECLARATION_FILE), 'utf8');
  appendFileSync(specPath, '\n## 11. Added later\n\nAn operator audits the ledger.\n');
  const edited = readSpecification(specPath);

  const begun = beginRun({ specPath, spec: edited });

  assert.equal(begun.refused, undefined);
  assert.equal(begun.mode, 'new-generation');
  assert.equal(begun.invalidated.length > 0, true);
  assert.equal(begun.invalidated.every((entry) => INVALIDATION_PRIMITIVES.includes(entry.primitive)), true);
  assert.equal(begun.invalidated.some((entry) => entry.primitive === 'blocksFromHeadings'), true, 'the appended heading breaks the partition');
  assert.equal(begun.invalidated.some((entry) => entry.primitive === 'findLineContainingAll'), false, 'the limbs still occur on their line');
  assert.equal(readFileSync(join(directory, DECLARATION_FILE), 'utf8'), before, 'nothing is deleted to recover from an edit');
});

test('C007 a new generation over an unchanged text invalidates nothing, because no citation moved', () => {
  const { specPath, spec } = seededRun();

  const begun = beginRun({ specPath, spec });

  assert.equal(begun.mode, 'new-generation');
  assert.deepEqual(begun.invalidated, [], 'an edit that never happened invalidates no asset');
});

test('C007 a declaration whose every part still cites a line survives whole', () => {
  const { specPath, spec } = seededRun();
  appendFileSync(specPath, '\nAn operator audits the ledger.\n');
  const edited = readSpecification(specPath);

  const begun = beginRun({ specPath, spec: edited });

  assert.equal(begun.mode, 'new-generation');
  assert.deepEqual(begun.invalidated.filter((entry) => entry.asset === 'declaration.predicate'), []);
  assert.deepEqual(begun.invalidated.filter((entry) => entry.asset === 'declaration.rowSchema'), []);
});

test('C007 survivingAssets classifies each asset by the primitive that decided it', () => {
  const { specPath } = scratchRun();
  const spec = readSpecification(specPath);
  const declaration = RUN_INPUT.declaration;

  const whole = survivingAssets({ declaration, readings: RUN_INPUT.readings, specLines: spec.lines });
  assert.deepEqual(whole.invalidated.filter((entry) => entry.primitive === 'blocksFromHeadings'), []);

  const shortened = survivingAssets({ declaration, readings: RUN_INPUT.readings, specLines: spec.lines.slice(0, 40) });
  assert.equal(shortened.invalidated.some((entry) => entry.primitive === 'blocksFromHeadings'), true);
  assert.equal(shortened.invalidated.every((entry) => INVALIDATION_PRIMITIVES.includes(entry.primitive)), true);
  assert.equal(shortened.kept !== undefined, true);
});

test('C007 the invalidation vocabulary is declared once, so a reader cannot invent a primitive', () => {
  assert.equal(INVALIDATION_PRIMITIVES.includes('rederivePin'), true);
  assert.equal(INVALIDATION_PRIMITIVES.includes('blocksFromHeadings'), true);
  assert.equal(INVALIDATION_PRIMITIVES.includes('findLineContainingAll'), true);
  assert.equal(INVALIDATION_PRIMITIVES.includes('establishPins'), true);
  assert.equal(INVALIDATION_PRIMITIVES.includes('readingLineAndQuote'), true);
});

// ---------------------------------------------------------------------------
// Invariants that hold across the branches
// ---------------------------------------------------------------------------

test('the specification basename binds one run directory to one specification', () => {
  const { specPath, spec, root } = scratchRun();
  beginRun({ specPath, spec });
  const otherPath = join(root, 'other.md');
  copyFileSync(SPEC_SOURCE, otherPath);
  const other = readSpecification(otherPath);

  const refused = beginRun({ specPath: otherPath, spec: other });

  assert.notEqual(refused.refused, null);
  assert.match(refused.refused, /ledger\.md/);
  assert.equal(refused.generation, null);
});

test('the artifact location stays a pure function of the specification, whatever material arrives', () => {
  const { specPath, spec, root } = scratchRun();
  const prior = join(root, 'pre-info.json');
  writeFileSync(prior, '{}\n');

  assert.equal(artifactPathFor(specPath), join(root, 'ledger-sequences.json'));
  beginRun({ specPath, spec, material: 'advice', namedPaths: [prior] });
  assert.equal(artifactPathFor(specPath), join(root, 'ledger-sequences.json'));
  assert.equal(artifactPathFor(specPath).includes(SUPPLIED_DIRECTORY), false);
});

test('begin writes nothing beneath the tool', () => {
  const toolTree = digestOfTree(TOOL_ROOT);
  const { specPath, spec, root } = scratchRun();
  const prior = join(root, 'pre-info.json');
  writeFileSync(prior, '{}\n');

  beginRun({ specPath, spec, material: 'advice', namedPaths: [prior] });

  assert.equal(digestOfTree(TOOL_ROOT), toolTree, 'the run wrote under the tool, so the contract covers products only');
});

test('startRun still refunds nothing: the budget is begin\'s to return, not every opener\'s', () => {
  const { specPath, spec, directory } = scratchRun();
  const first = startRun({ specPath, spec });
  noteDone(first.status, 8, { verdict: 'three signed readings', tag: PHASE_TAGS.READ });
  noteLoop(first.status, 8, PHASE_TAGS.READ, 'readings-span.jsonl does not exist — the brief has not reported');
  writeStatus(directory, first.status);

  const reopened = startRun({ specPath, spec });

  assert.equal(reopened.resumed, true);
  assert.equal(loopsFor(reopened.status, 8), 1, 'a Step that resumed its own run has not spent a generation');
});

// ---------------------------------------------------------------------------
// Integration: the command line the command file runs
// ---------------------------------------------------------------------------

test('IT begin opens a generation, then reports a verification over an unchanged run', () => {
  const { specPath, directory } = scratchRun();

  const first = begin(['begin', specPath]);
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /^generation 1 \(new generation\)$/m);
  assert.match(first.stdout, /^asset digest: [0-9a-f]{64}$/m);
  assert.match(first.stdout, /^supplied: 0 file\(s\)$/m);
  assert.match(first.stdout, /^invalidated: 0 asset\(s\)$/m);
  assert.match(first.stdout, /^next: 1$/m, 'a run that has opened its first generation starts at identity');
  const after = readFileSync(statusPath(directory), 'utf8');

  const second = begin(['begin', specPath]);

  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /^generation 1 \(verification\)$/m);
  assert.equal(readFileSync(statusPath(directory), 'utf8'), after, 'a verification leaves the status byte-identical');
});

test('IT begin over an edited specification opens a generation and refuses nothing', () => {
  const { specPath, spec } = seededRun();
  const first = begin(['begin', specPath]);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(spec.sha256, readSpecification(specPath).sha256);
  appendFileSync(specPath, '\n## 11. Added later\n\nAn operator audits the ledger.\n');

  const second = begin(['begin', specPath]);

  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /new generation/);
  assert.equal(/remove the run directory/.test(second.stderr), false, 'an edit no longer destroys the evidence');
  assert.equal(Number(/invalidated: (\d+) asset/.exec(second.stdout)[1]) > 0, true);
});

test('IT begin opens the next generation and prints the notice when the previous one halted over an unchanged set', () => {
  const { specPath, directory } = openBare();
  for (let attempt = 0; attempt < 4; attempt += 1) begin(['through', specPath]);
  const halted = begin(['through', specPath]);
  assert.equal(halted.status, HALT_EXIT_CODE, halted.stdout);

  const reopened = begin(['begin', specPath]);

  assert.equal(reopened.status, 0, reopened.stderr);
  assert.match(reopened.stdout, /new generation/);
  assert.match(reopened.stdout, /notice: /);
  assert.match(reopened.stdout, /phase 2/);
  assert.match(reopened.stdout, /3 of 3/);
  assert.equal(/refused:/.test(reopened.stderr), false, 'an automatic run is never stopped by a repeat');
  assert.equal(existsSync(join(directory, DECLARATION_FILE)), true);
});

test('IT the product path keeps its one-argument contract', () => {
  const { specPath } = scratchRun();
  const runScript = join(PROJECT_ROOT, '.claude/scripts/educe-sequences/rail/run.mjs');
  const misused = spawnSync('node', [runScript, specPath, specPath], { cwd: PROJECT_ROOT, encoding: 'utf8' });

  assert.equal(misused.status, 2);
  assert.match(misused.stderr, /two or more arguments/);
});

test('IT the artifact records the supplied digest, and verification compares it', () => {
  const { specPath, spec, root } = scratchRun();
  const runScript = join(PROJECT_ROOT, '.claude/scripts/educe-sequences/rail/run.mjs');
  const prior = join(root, 'pre-info.json');
  writeFileSync(prior, '{"entries":["admission"]}\n');
  beginRun({ specPath, spec, material: 'advice', namedPaths: [prior] });

  const written = spawnSync('node', [runScript, specPath], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    input: JSON.stringify(RUN_INPUT),
  });

  assert.equal(written.status, 0, written.stderr);
  const artifact = JSON.parse(readFileSync(artifactPathFor(specPath), 'utf8'));
  assert.equal(/^[0-9a-f]{64}$/.test(artifact.supplied.digest), true);

  const verified = spawnSync('node', [runScript, specPath], { cwd: PROJECT_ROOT, encoding: 'utf8', input: '' });
  assert.equal(verified.status, 0, verified.stderr);

  writeFileSync(join(root, 'educe-sequences', SUPPLIED_DIRECTORY, 'material.md'), 'different advice\n');
  const mismatched = spawnSync('node', [runScript, specPath], { cwd: PROJECT_ROOT, encoding: 'utf8', input: '' });
  assert.equal(mismatched.status, 1, 'an artifact whose supplied digest moved is refused');
  assert.match(mismatched.stderr, /supplied digest/);
});

/** Make every directory on the way to a path. */
// [::TICKET::] PX-242, PX-243, PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-242|PX-243|PX-244) --for-spec --no-implementation-order`.
function mkdirIfNeeded(path) {
  mkdirSync(path, { recursive: true });
}

// ---------------------------------------------------------------------------
// C008 — a supplied path written the way a reader writes it
// ---------------------------------------------------------------------------

/** A throwaway home directory holding a specification and one file to supply. */
// [::TICKET::] PX-246 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-246 --for-spec --no-implementation-order`.
function scratchHome() {
  const root = mkdtempSync(join(tmpdir(), 'px246-home-'));
  const specPath = join(root, 'ledger.md');
  copyFileSync(SPEC_SOURCE, specPath);
  writeFileSync(join(root, 'prior.md'), 'section 5 names the acts\n');
  return { root, specPath };
}

test('C008 a supplied path written with a tilde is filed when the file is under the home directory', () => {
  const { root, specPath } = scratchHome();

  const opened = spawnSync('node', [PHASE_SCRIPT, 'begin', specPath, 'use ~/prior.md as a hint'],
    { cwd: PROJECT_ROOT, encoding: 'utf8', env: { ...process.env, HOME: root } });

  assert.equal(opened.status, 0, opened.stderr);
  assert.equal(
    existsSync(join(root, 'educe-sequences', SUPPLIED_DIRECTORY, 'prior.md')),
    true,
    'the token is a path, so it is filed rather than left as prose',
  );
});

test('C008 a tilde path that does not exist is refused by the name it resolves to', () => {
  const { root, specPath } = scratchHome();

  const opened = spawnSync('node', [PHASE_SCRIPT, 'begin', specPath, 'use ~/absent.md as a hint'],
    { cwd: PROJECT_ROOT, encoding: 'utf8', env: { ...process.env, HOME: root } });

  assert.equal(opened.status, 1);
  assert.match(opened.stderr, /does not exist/);
  assert.equal(opened.stderr.includes('~/absent.md'), false, 'the unexpanded token is what hid the cause');
  assert.match(opened.stderr, new RegExp(join(root, 'absent.md')));
});

test('C006 a supplied path is filed whatever its characters, and a word that only looks like one is not', () => {
  const { specPath, root } = scratchRun();
  mkdirSync(join(root, '資料'), { recursive: true });
  writeFileSync(join(root, '資料', '仕様メモ.md'), 'the previous campaign\n');
  writeFileSync(join(root, 'ascii-note.md'), 'a bare relative name\n');
  mkdirSync(join(root, 'nested'), { recursive: true });
  writeFileSync(join(root, 'nested', 'deep.json'), '{"prior":true}\n');

  const invocation = [
    'use 資料/仕様メモ.md and ascii-note.md and nested/deep.json as hints',
    'this sentence mentions v1.2 and e.g. as prose',
  ].join(' ');
  const opened = spawnSync('node', [PHASE_SCRIPT, 'begin', specPath, invocation],
    { cwd: root, encoding: 'utf8' });

  assert.equal(opened.status, 0, opened.stderr);
  const filed = readdirSync(join(root, 'educe-sequences', SUPPLIED_DIRECTORY)).sort();
  // Material that is not filed is material the digest does not cover, and the reader is
  // never told: a path-shaped token dropped in silence is the failure this guards.
  assert.deepEqual(filed, ['ascii-note.md', 'deep.json', 'material.md', '仕様メモ.md']);
});
