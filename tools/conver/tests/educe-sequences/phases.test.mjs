// The phase driver (PX-240).
//
// @verifies C016
// @verifies C017
// @verifies C018
// @verifies C019
// @verifies C020
// @verifies C015
//
// Before this module existed the command's phase table was a claim nothing evaluated.
// These tests hold the three properties that make it executable: every phase declares
// where it returns to and how many times it may loop, a phase entered before its
// requirements are done is refused by naming the missing phase, and a refusal spends a
// loop rather than being silently retried for ever.
import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PHASES, PHASE_TAGS } from '../../.claude/scripts/educe-sequences/rail/gates.mjs';
import { artifactPathFor } from '../../.claude/scripts/educe-sequences/rail/paths.mjs';
import { ENGINE_DECLARED_CHECK_COUNT } from '../../.claude/scripts/educe-sequences/rail/engine.mjs';
import { buildContext, exitCodeFor, HALT_EXIT_CODE, nextPhase, runPhase, runThrough, startRun } from '../../.claude/scripts/educe-sequences/rail/phases.mjs';
import { isComplete, readPhaseSettled } from '../../.claude/scripts/educe-sequences/rail/report.mjs';
import { readSpecification } from '../../.claude/scripts/educe-sequences/rail/load.mjs';
import { INQUEST_FILE, writeReadingsFile } from '../../.claude/scripts/educe-sequences/rail/readings.mjs';
import { digestOfTree, railExitStoreFor, writeRailExit } from '../../.claude/scripts/educe-sequences/rail/harness.mjs';
import { railExitTemplate, readCasesFile, scaffoldCheck } from '../../.claude/scripts/educe-sequences/rail/adhoc.mjs';
import { loopsFor, phaseState, readingOf, runDirectoryFor } from '../../.claude/scripts/educe-sequences/rail/run-state.mjs';
import { pathToFileURL } from 'node:url';

const SPEC_SOURCE = new URL('./fixtures/spec/ledger.md', import.meta.url).pathname;
const RUN_INPUT = JSON.parse(readFileSync(new URL('./fixtures/spec/ledger.run.json', import.meta.url), 'utf8'));
const TAGS = Object.values(PHASE_TAGS);

/** The tool tree, so a test can prove no phase wrote into it. */
const TOOL_ROOT = new URL('../../.claude/scripts/educe-sequences', import.meta.url).pathname;

/** A throwaway specification, so no test writes into the committed fixture. */
// [::TICKET::] PX-240, PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241) --for-spec --no-implementation-order`.
function scratch() {
  const root = mkdtempSync(join(tmpdir(), 'educe-phases-'));
  const specPath = join(root, 'ledger.md');
  copyFileSync(SPEC_SOURCE, specPath);
  return { root, specPath };
}

/** Seed a run's reading files from the recorded run input. */
// [::TICKET::] PX-240, PX-241, PX-243, PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241|PX-243|PX-244) --for-spec --no-implementation-order`.
function seed(run) {
  writeFileSync(join(run.directory, 'declaration.json'), `${JSON.stringify(RUN_INPUT.declaration, null, 2)}\n`);
  const span = RUN_INPUT.readings.sequences.map((reading) => ({ ...reading, steps: [], operations: [] }));
  span[0].steps = RUN_INPUT.readings.steps;
  span[0].operations = RUN_INPUT.readings.operations;
  writeReadingsFile(join(run.directory, 'readings-span.jsonl'), span);
  writeReadingsFile(join(run.directory, 'readings-adjudicate.jsonl'), RUN_INPUT.readings.adjudications);
  writeReadingsFile(join(run.directory, 'readings-reroute.jsonl'), []);
  writeReadingsFile(join(run.directory, 'readings-adversarial.jsonl'), []);
  writeReadingsFile(join(run.directory, INQUEST_FILE), RUN_INPUT.readings.inquest);
}

/** Open a run over the scratch specification. */
// [::TICKET::] PX-240, PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241) --for-spec --no-implementation-order`.
function open({ seeded = true } = {}) {
  const { specPath } = scratch();
  const spec = readSpecification(specPath);
  const run = startRun({ specPath, spec });
  if (seeded) seed(run);
  return { run, specPath, spec, context: buildContext({ specPath, spec, run: { directory: run.directory, status: run.status } }) };
}

test('the phase table declares eighteen phases, each with a tag, a back-edge and a loop limit', () => {
  assert.equal(PHASES.length, 18);
  assert.deepEqual(PHASES.map((phase) => phase.id), Array.from({ length: 18 }, (_, index) => index + 1));

  for (const phase of PHASES) {
    assert.equal(TAGS.includes(phase.tag), true, `phase ${phase.id} has tag ${phase.tag}`);
    assert.equal(Number.isInteger(phase.maxLoops) && phase.maxLoops >= 1, true, `phase ${phase.id} has no loop limit`);
    assert.equal(phase.backTo === null || phase.backTo < phase.id, true, `phase ${phase.id} returns to ${phase.backTo}`);
  }
});

test('every phase a phase requires is a phase that exists', () => {
  const ids = new Set(PHASES.map((phase) => phase.id));
  for (const phase of PHASES) {
    for (const required of phase.requires) assert.equal(ids.has(required), true, `phase ${phase.id} requires ${required}`);
  }
});

test('the four brief phases are the [read] phases that collect signed claims', () => {
  const briefPhases = PHASES.filter((phase) => ['span', 'adversarial', 'reroute', 'adjudicate'].includes(phase.name));

  assert.equal(briefPhases.length, 4);
  assert.deepEqual(briefPhases.map((phase) => phase.tag), ['read', 'read', 'read', 'read']);
});

test('a phase entered before its requirements are done is refused, naming the missing phase', () => {
  const { context } = open();

  const result = runPhase(14, context);

  assert.equal(result.ok, false);
  assert.match(result.reason, /phase 9 is not done/);
  assert.equal(result.backTo, 6);
});

test('a run drives every phase to a verdict on the recorded readings', () => {
  const { context } = open();

  const outcome = runThrough(context);

  assert.equal(outcome.ok, true, outcome.results.filter((result) => !result.ok).map((result) => result.reason).join('; '));
  assert.equal(outcome.results.length, 18);
  assert.equal(context.status.phases.filter((phase) => phase.status === 'done').length, 18);
});

test('the run writes the artifact the one-argument contract derives from the specification', () => {
  const { context, specPath } = open();

  runThrough(context);

  assert.equal(context.artifactPath, artifactPathFor(specPath));
  const artifact = JSON.parse(readFileSync(context.artifactPath, 'utf8'));
  assert.equal(artifact.spec.path, 'ledger.md');
  assert.equal(artifact.sequences.find((entry) => entry.id === 'settlement').neighbour, 'settlement-replays-admission');
});

test('a phase that refuses spends a loop and names the file the reader must produce', () => {
  const { context } = open({ seeded: false });
  writeFileSync(join(context.directory, 'declaration.json'), `${JSON.stringify(RUN_INPUT.declaration, null, 2)}\n`);
  runThrough(context, 7);

  const first = runPhase(8, context);
  const second = runPhase(8, context);

  assert.equal(first.ok, false);
  assert.equal(first.expects, 'readings-span.jsonl, one signed line per entry, each carrying the steps and operations read there');
  assert.equal(second.loops, 2, 'a second refusal spends a second loop');
  assert.equal(loopsFor(context.status, 8), 2);
});

test('a refused phase is not done, so it cannot satisfy a phase that requires it', () => {
  const { context } = open({ seeded: false });
  runThrough(context, 1);

  const refused = runPhase(2, context);

  assert.equal(refused.ok, false);
  assert.equal(phaseState(context.status, 2).status, 'refused', 'a refusal is not a completion');
  assert.equal(nextPhase(context.status), 2, 'the driver still proposes the phase that never passed');

  const dependent = runPhase(3, context);
  assert.equal(dependent.ok, false);
  assert.equal(dependent.reason, 'phase 2 is not done', 'the dependent phase is refused by naming the one that never passed');
});

test('a phase that has spent its loop limit is halted, naming its count and its last refusal', () => {
  const { context } = open({ seeded: false });
  writeFileSync(join(context.directory, 'declaration.json'), `${JSON.stringify(RUN_INPUT.declaration, null, 2)}\n`);
  runThrough(context, 7);

  const phase = PHASES.find((candidate) => candidate.id === 8);
  const refusals = Array.from({ length: phase.maxLoops }, () => runPhase(8, context));
  const last = refusals[refusals.length - 1];
  const halted = runPhase(8, context);

  assert.equal(refusals.every((refusal) => refusal.halted === false), true, 'a phase below its limit is refused, not halted');
  assert.equal(halted.ok, false);
  assert.equal(halted.halted, true, 'the phase is halted rather than refused once more');
  assert.equal(halted.exitCode, HALT_EXIT_CODE, 'a halt is a distinct exit, because the command must stop rather than repeat the Step');
  assert.equal(exitCodeFor(halted), HALT_EXIT_CODE, 'the exit code a Step sees when it repeats is the halt code, not a refusal');
  assert.equal(exitCodeFor({ ok: false, halted: false }), 1);
  assert.equal(exitCodeFor({ ok: true, halted: false }), 0);
  assert.equal(halted.loops, phase.maxLoops, 'the halt spends no further loop');
  assert.equal(halted.backTo, null, 'a halt names no back-edge, because there is nothing to go back to');
  assert.equal(halted.expects, null, 'a halt asks the reader for nothing, because the input is the defect');
  assert.equal(halted.reason.includes(`spent ${phase.maxLoops} of its ${phase.maxLoops} loops`), true, `the halt names the count: ${halted.reason}`);
  assert.equal(halted.reason.includes(last.reason), true, 'the halt repeats the last refusal verbatim');
});

test('a re-entered phase that now passes records what the reader reported', () => {
  const { context } = open();

  runThrough(context, 8);

  const record = readingOf(context.status, 'span');
  assert.equal(record.claims, 3);
  assert.equal(record.vacuous, false);
});

test('a phase with nothing to read is recorded as vacuous rather than as unsigned', () => {
  const { context } = open();

  runThrough(context);

  assert.equal(readingOf(context.status, 'adversarial').vacuous, true);
  assert.equal(readingOf(context.status, 'reroute').vacuous, true);
  assert.equal(readingOf(context.status, 'span').vacuous, false);
});

test('a resumed run reuses its status, so the loops it spent are not refunded', () => {
  const { run, specPath, spec, context } = open({ seeded: false });
  writeFileSync(join(run.directory, 'declaration.json'), `${JSON.stringify(RUN_INPUT.declaration, null, 2)}\n`);
  runThrough(context, 7);
  runPhase(8, context);

  const reopened = startRun({ specPath, spec });

  assert.equal(reopened.resumed, true);
  assert.equal(loopsFor(reopened.status, 8), 1);
});

test('C015 the run directory is a pure function of the specification path', () => {
  const { root, specPath } = scratch();

  assert.equal(runDirectoryFor(specPath), join(root, 'educe-sequences'));

  const spec = readSpecification(specPath);
  const run = startRun({ specPath, spec });

  assert.equal(run.directory, join(root, 'educe-sequences'));
  assert.equal(existsSync(join(root, 'educe-sequences', 'status.json')), true);
  assert.equal(run.resumed, false);
});

// [::TICKET::] PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-244 --for-spec --no-implementation-order`.
test('C015 a run writes nothing beneath the tool, including the run that scaffolds a check', async () => {
  const toolTree = digestOfTree(TOOL_ROOT);
  const { context } = open();
  runThrough(context);

  assert.equal(digestOfTree(TOOL_ROOT), toolTree, 'a phase wrote under the tool, so the one-argument contract covers products only');

  // The scaffold is the one path that used to write into the tool tree: the rail-exit
  // store was a module-level constant computed from the library's own location, so a
  // successful scaffold appended to a file inside the library. The assertion above wraps
  // `runThrough`, which never scaffolds, and therefore never reached it.
  const written = scaffoldCheck({ directory: context.directory, check: 'ledger-drift', defect: 'an entry that carries no outcome', refuses: 'an entry carrying no outcome' });
  assert.equal(written.ok, true, JSON.stringify(written.problems));
  const load = await import(pathToFileURL(written.modulePath).href);
  writeRailExit(
    railExitTemplate({ check: 'ledger-drift', defect: 'an entry that carries no outcome', cases: readCasesFile(context.directory, 'ledger-drift'), executed: { reddened: true, attributable: true, counterGreen: true } }),
    railExitStoreFor(context.directory),
  );
  assert.equal(typeof load.check.run, 'function');

  runThrough(context);

  assert.equal(digestOfTree(TOOL_ROOT), toolTree, 'the rail-exit store belongs to the run directory, not to the tool tree');
  assert.equal(existsSync(join(context.directory, 'rail-exits.jsonl')), true, 'and it was written where the run keeps its state');
  assert.equal(existsSync(join(TOOL_ROOT, 'rail-exits.jsonl')), false);
});

test('C015 a status recording another digest is refused rather than resumed', () => {
  const { specPath } = scratch();
  const spec = readSpecification(specPath);
  startRun({ specPath, spec });

  const moved = startRun({ specPath, spec: { ...spec, sha256: 'deadbeef'.repeat(8) } });

  assert.equal(moved.resumed, false);
  assert.notEqual(moved.refused, undefined);
  assert.match(moved.refused, /deadbeef/);
});

test('C015 a status belonging to another specification is refused by name', () => {
  const { root, specPath } = scratch();
  const spec = readSpecification(specPath);
  startRun({ specPath, spec });

  const otherPath = join(root, 'other.md');
  copyFileSync(SPEC_SOURCE, otherPath);
  const other = readSpecification(otherPath);

  const conflicted = startRun({ specPath: otherPath, spec: { ...other, sha256: spec.sha256 } });

  assert.equal(conflicted.resumed, false);
  assert.notEqual(conflicted.refused, undefined);
  assert.match(conflicted.refused, /ledger\.md/);
});

test('a run whose [read] phases are signed or vacuous is reported complete', () => {
  const { context } = open();

  runThrough(context);

  const reads = PHASES.filter((phase) => phase.tag === 'read');
  assert.equal(reads.every((phase) => readPhaseSettled(context.status, phase)), true);
  // The declared count is read from the summary it describes, so a hand-built summary
  // carries it: a second copy passed beside the block is a second thing to disagree.
  const declared = ENGINE_DECLARED_CHECK_COUNT;
  assert.equal(isComplete({ summary: { checksRun: declared, checksDeclared: declared, pinsRederived: 5, pinsTotal: 5 }, status: context.status }), true);
  assert.equal(isComplete({ summary: { checksRun: declared - 1, checksDeclared: declared, pinsRederived: 5, pinsTotal: 5 }, status: context.status }), false);
});

test('the next phase is the first that is not done', () => {
  const { context } = open();

  assert.equal(nextPhase(context.status), 1);
  runPhase(1, context);
  assert.equal(nextPhase(context.status), 2);
  assert.equal(phaseState(context.status, 1).status, 'done');
});

// ---------------------------------------------------------------------------
// The weakest link closes before the checks speak (PX-241, contract C007)
// ---------------------------------------------------------------------------

/** The recorded declaration with its weakest link pointing wherever a test needs. */
// [::TICKET::] PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-241 --for-spec --no-implementation-order`.
function declarationTightenedBy(tightenedBy) {
  return {
    ...RUN_INPUT.declaration,
    weakestLink: { subject: 'adjacency by citation', why: 'coverage is not a reading', tightenedBy },
  };
}

/** A run driven to phase 12 with the weakest link the test names. */
// [::TICKET::] PX-241, PX-243, PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-241|PX-243|PX-244) --for-spec --no-implementation-order`.
function runUpToChecks(tightenedBy) {
  const { context } = open();
  writeFileSync(join(context.directory, 'declaration.json'), `${JSON.stringify(declarationTightenedBy(tightenedBy), null, 2)}\n`);
  runThrough(context, 13);
  return context;
}

test('C007 phase 14 refuses while the weakest link names no declared check', () => {
  const context = runUpToChecks('no-such-check');

  const outcome = runPhase(14, context);

  assert.equal(outcome.ok, false);
  assert.match(outcome.reason, /no-such-check/);
  assert.equal(outcome.backTo, 6);
});

test('C007 the weakest link is closed before the checks speak, so a failing artifact cannot hide it', () => {
  const context = runUpToChecks('no-such-check');
  const broken = JSON.parse(readFileSync(context.artifactPath, 'utf8'));
  broken.operations.find((operation) => operation.id === 'Admit').position = 'floating';
  writeFileSync(context.artifactPath, `${JSON.stringify(broken, null, 2)}\n`);

  const outcome = runPhase(14, context);

  assert.equal(outcome.ok, false);
  assert.match(outcome.reason, /no-such-check/, 'a check verdict answered a question the weakest link had not closed');
  assert.equal(/every-operation-placed/.test(outcome.reason), false, 'the block was built before the weakest link was closed');
});

test('C007 phase 14 passes when the weakest link names a declared check', () => {
  const context = runUpToChecks('neighbour-cites-inside-span');

  const outcome = runPhase(14, context);

  assert.equal(outcome.ok, true);
  assert.match(outcome.reason, /checks ran/);
});
