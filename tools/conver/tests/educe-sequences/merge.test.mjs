// The merge, and the refusal that makes it verifiable (PX-253).
//
// Coverage in this apparatus is a density and not a count: a generation that merges two
// records into one is an improvement carrying a smaller number, and a threshold on any of
// the measured terms would refuse the work it is meant to encourage (`rail/coverage.mjs`).
// What was missing is the other half. The artifact is recomposed every generation from the
// declaration and that generation's readings, and the artifact being replaced is not an
// input to that composition, so a merge that dropped a name left a well-formed artifact, a
// silent number falling, and no surface able to say which name left.
//
// The rule is one-directional on purpose. A name that left is a finding; a name that
// arrived is not, because a rule that reported arrivals would refuse every new operation
// and every newly declared entry, which is the threshold the design forbids. So a merge is
// permitted and only its losses are refused: naming the dropped name with a declared
// escape position, or carrying a ruling whose subject is that name, is the whole repair.
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
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { digestOf } from '../../.claude/scripts/educe-sequences/rail/load.mjs';
import { subjectsHeldBy, subjectsNamedBy, vanishedRefusal, vanishedSubjects } from '../../.claude/scripts/educe-sequences/rail/reading.mjs';
import { writeReadingsFile } from '../../.claude/scripts/educe-sequences/rail/readings.mjs';
import { runCommand } from '../../.claude/scripts/educe-sequences/rail/run.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SPEC_PATH = join(PROJECT_ROOT, 'tests/educe-sequences/fixtures/spec/ledger.md');
const GOLDEN_PATH = join(PROJECT_ROOT, 'tests/educe-sequences/fixtures/spec/ledger-sequences.json');
const RUN_INPUT_PATH = join(PROJECT_ROOT, 'tests/educe-sequences/fixtures/spec/ledger.run.json');
const COMMAND_PATH = join(PROJECT_ROOT, '.claude/commands/educe-sequences.md');
const PHASE = join(PROJECT_ROOT, '.claude/scripts/educe-sequences/rail/phase.mjs');
const RUN_RAIL = join(PROJECT_ROOT, '.claude/scripts/educe-sequences/rail/run.mjs');

const COMMAND = readFileSync(COMMAND_PATH, 'utf8');
const RUN_INPUT = JSON.parse(readFileSync(RUN_INPUT_PATH, 'utf8'));

/** The artifact the fixture's own readings compose, read fresh so no test mutates it. */
// [::TICKET::] PX-253 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-253 --for-spec --no-implementation-order`.
function golden() {
  return JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
}

/** The artifact with one operation left out, which is a merge that dropped a name. */
// [::TICKET::] PX-253 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-253 --for-spec --no-implementation-order`.
function withoutOperation(artifact, id) {
  return { ...artifact, operations: artifact.operations.filter((operation) => operation.id !== id) };
}

/**
 * The fixture's readings with two acts merged into one record.
 *
 * The steps that reached `dropped` reach `kept` instead and `dropped` is declared nowhere,
 * so the artifact is internally consistent: no step names an undeclared operation and no
 * declared operation is unreached. Every check the artifact is held to today is silent on
 * it, which is what makes it the case the new rule exists for.
 */
// [::TICKET::] PX-253 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-253 --for-spec --no-implementation-order`.
function mergedReadings({ dropped, kept, ruling = null }) {
  const steps = RUN_INPUT.readings.steps.map((step) => (step.operation === dropped ? { ...step, operation: kept } : step));
  const operations = RUN_INPUT.readings.operations.filter((operation) => operation.id !== dropped);
  const adjudications = ruling === null ? RUN_INPUT.readings.adjudications : [...RUN_INPUT.readings.adjudications, ruling];
  return { steps, operations, adjudications };
}

/** A ruling whose subject is the name the merge dropped. */
// [::TICKET::] PX-253 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-253 --for-spec --no-implementation-order`.
function rulingOn(subject, reason) {
  return { subject, outcome: 'notASequence', category: 'merged', reason, reader: 'span', predicateLimb: 'none-applies' };
}

/**
 * A run directory holding a copy of the specification, opened through phases 0 and 1.
 *
 * Phase 9 requires phase 8, so a run entered directly at the phase under test would be
 * refused for its order rather than for the name that left.
 */
// [::TICKET::] PX-253 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-253 --for-spec --no-implementation-order`.
function scratchRun() {
  const root = mkdtempSync(join(tmpdir(), 'px253-merge-'));
  copyFileSync(SPEC_PATH, join(root, 'ledger.md'));
  const directory = join(root, 'educe-sequences');
  mkdirSync(directory, { recursive: true });
  const specPath = join(root, 'ledger.md');

  assert.equal(spawnSync('node', [PHASE, 'begin', specPath], { encoding: 'utf8' }).status, 0);
  assert.equal(spawnSync('node', [PHASE, 'run', specPath, '1'], { encoding: 'utf8' }).status, 0);
  return { specPath, directory, artifactPath: join(root, 'ledger-sequences.json') };
}

/**
 * Write the declaration and the readings one generation leaves behind.
 *
 * The driver reads a span reading's steps and operations from the reading itself, which is
 * where a run records them; the fixture keeps them beside the readings instead.
 */
// [::TICKET::] PX-253 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-253 --for-spec --no-implementation-order`.
function writeGeneration(run, readings = null) {
  const { steps, operations, adjudications } = readings ?? RUN_INPUT.readings;
  const [first, ...rest] = RUN_INPUT.readings.sequences;
  const span = [{ ...first, steps, operations }, ...rest];

  writeFileSync(join(run.directory, 'declaration.json'), `${JSON.stringify(RUN_INPUT.declaration, null, 2)}\n`);
  writeReadingsFile(join(run.directory, 'readings-span.jsonl'), span);
  writeReadingsFile(join(run.directory, 'readings-adjudicate.jsonl'), adjudications);
}

/** The readings the product path reads, in the shape it takes them on stdin. */
// [::TICKET::] PX-253 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-253 --for-spec --no-implementation-order`.
function runInputFor(readings = null) {
  const { steps, operations, adjudications } = readings ?? RUN_INPUT.readings;
  const [first, ...rest] = RUN_INPUT.readings.sequences;
  return {
    declaration: RUN_INPUT.declaration,
    readings: {
      ...RUN_INPUT.readings,
      sequences: [{ ...first, steps, operations }, ...rest],
      steps,
      operations,
      adjudications,
    },
  };
}

/** The subject a refusal sentence names, or null when it names none. */
// [::TICKET::] PX-253 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-253 --for-spec --no-implementation-order`.
function subjectNamedIn(text) {
  return /([A-Za-z][A-Za-z0-9_]*) was named by the artifact this generation replaces/.exec(text)?.[1] ?? null;
}

// ---------------------------------------------------------------------------
// C001 — a name that left is a finding, and the refusal names it
// ---------------------------------------------------------------------------

test('C001 subjectsNamedBy answers every name an artifact carries', () => {
  const names = subjectsNamedBy(golden());

  assert.equal(names.has('Admit'), true, 'an operation is a name the artifact carries');
  assert.equal(names.has('admission'), true, 'an entry is a name the artifact carries');
  assert.equal(names.has('s1'), true, 'a ruling subject is a name the artifact carries');
});

test('C001 a ruling subject is a way a name is carried and not a name a generation is held to', () => {
  // The asymmetry is the rule: what a generation is held to is what it declares — its
  // operations and its entries — while a ruling is one of the ways a held name is carried
  // forward. A rule that conflated them would hold a generation to its own rulings.
  const held = subjectsHeldBy(golden());

  assert.equal(held.has('Admit'), true);
  assert.equal(held.has('admission'), true);
  assert.equal(held.has('s1'), false);
});

test('C001 the rule names the subject that left', () => {
  assert.deepEqual(vanishedSubjects({ previous: golden(), next: withoutOperation(golden(), 'Admit') }), ['Admit']);
});

test('C001 the refusal names the subject and both remedies', () => {
  const line = vanishedRefusal('Admit');

  assert.match(line, /Admit/);
  assert.match(line, /escape position/);
  assert.match(line, /ruling whose subject is that name/);
});

test('C001 a refused generation leaves the artifact byte-identical', () => {
  const run = scratchRun();
  writeGeneration(run);
  assert.equal(spawnSync('node', [PHASE, 'through', run.specPath, '9'], { encoding: 'utf8' }).status, 0);
  const before = digestOf(run.artifactPath);

  writeGeneration(run, mergedReadings({ dropped: 'Admit', kept: 'Settle' }));
  const refused = spawnSync('node', [PHASE, 'run', run.specPath, '9'], { encoding: 'utf8' });

  assert.notEqual(refused.status, 0, 'a merge that dropped a name is refused');
  assert.match(refused.stdout, /Admit was named by the artifact this generation replaces/);
  assert.equal(digestOf(run.artifactPath), before, 'the refusal is raised before the write');
});

// ---------------------------------------------------------------------------
// C002 — a merge that carries every name, or a ruling for the one it dropped
// ---------------------------------------------------------------------------

test('C002 a merge naming every operation it replaces is silent', () => {
  const next = {
    ...golden(),
    operations: golden().operations.map((operation) => (operation.id === 'Settle' ? { ...operation, position: 'excluded' } : operation)),
  };

  assert.deepEqual(vanishedSubjects({ previous: golden(), next }), []);
});

test('C002 a merge carrying a ruling for the name it dropped is silent', () => {
  const next = {
    ...withoutOperation(golden(), 'Settle'),
    adjudications: [...golden().adjudications, rulingOn('Settle', 'merged into Admit')],
  };

  assert.deepEqual(vanishedSubjects({ previous: golden(), next }), []);
});

test('C002 a ruling that is no longer made is not a name the generation is held to', () => {
  // The fixture rules sentences whose names are neither an entry nor an operation, and the
  // consumer artifact rules hundreds of them. A ruling is how a name is carried, so holding
  // a generation to the rulings themselves would refuse a merge of two ruled regions with
  // no repair available: a name that is neither an operation nor an entry has no escape
  // position and no outcome to be named with.
  const next = { ...golden(), adjudications: golden().adjudications.filter((ruling) => ruling.subject !== 's1') };

  assert.deepEqual(vanishedSubjects({ previous: golden(), next }), []);
});

test('C002 a merge that carries a ruling is written rather than refused', () => {
  const run = scratchRun();
  writeGeneration(run);
  assert.equal(spawnSync('node', [PHASE, 'through', run.specPath, '9'], { encoding: 'utf8' }).status, 0);
  const before = digestOf(run.artifactPath);

  writeGeneration(run, mergedReadings({ dropped: 'Admit', kept: 'Settle', ruling: rulingOn('Admit', 'merged into Settle') }));
  const merged = spawnSync('node', [PHASE, 'run', run.specPath, '9'], { encoding: 'utf8' });

  assert.equal(merged.status, 0, merged.stdout + merged.stderr);
  assert.notEqual(digestOf(run.artifactPath), before, 'the merge is written');
});

// ---------------------------------------------------------------------------
// C003 — the rule never compares two revisions
// ---------------------------------------------------------------------------

test('C003 another revision is not compared', () => {
  const next = withoutOperation(golden(), 'Admit');
  const otherSpec = { ...golden(), spec: { ...golden().spec, sha256: 'a'.repeat(64) } };
  const otherMaterial = { ...golden(), supplied: { digest: 'b'.repeat(64) } };

  assert.deepEqual(vanishedSubjects({ previous: otherSpec, next }), []);
  assert.deepEqual(vanishedSubjects({ previous: otherMaterial, next }), []);
});

test('C003 a first generation has nothing to compare', () => {
  assert.deepEqual(vanishedSubjects({ previous: null, next: golden() }), []);
});

test('C003 the product path compares the artifact beside the specification only when the digests agree', () => {
  const run = scratchRun();
  const first = spawnSync('node', [RUN_RAIL, run.specPath], { input: JSON.stringify(runInputFor()), encoding: 'utf8' });
  assert.equal(first.status, 0, first.stdout + first.stderr);

  const edited = readFileSync(run.specPath, 'utf8').replace('# Settlement Ledger Specification', '# Settlement Ledger Specification.');
  writeFileSync(run.specPath, edited);
  const second = spawnSync('node', [RUN_RAIL, run.specPath], {
    input: JSON.stringify(runInputFor(mergedReadings({ dropped: 'Admit', kept: 'Settle' }))),
    encoding: 'utf8',
  });

  assert.notEqual(second.status, 0, 'an edited specification is refused');
  assert.doesNotMatch(second.stderr, /was named by the artifact this generation replaces/, 'a revision is not compared');
});

// ---------------------------------------------------------------------------
// C004 — the rule is one-directional
// ---------------------------------------------------------------------------

test('C004 an addition is not a finding', () => {
  const next = { ...golden(), operations: [...golden().operations, { id: 'NewAct', position: 'positioned' }] };

  assert.deepEqual(vanishedSubjects({ previous: golden(), next }), []);
});

test('C004 the same names in another order are not a finding', () => {
  const next = { ...golden(), operations: [...golden().operations].reverse() };

  assert.deepEqual(vanishedSubjects({ previous: golden(), next }), []);
});

test('C004 an entry that stops claiming keeps its name and is not a finding', () => {
  const next = {
    ...golden(),
    sequences: golden().sequences.map((entry) => (entry.id === 'admission' ? { ...entry, outcome: 'notASequence' } : entry)),
  };

  assert.deepEqual(vanishedSubjects({ previous: golden(), next }), []);
});

// ---------------------------------------------------------------------------
// C005 — the command file states the procedure and the refusal
// ---------------------------------------------------------------------------

test('C005 the command file states the merge procedure and the refusal it produces', () => {
  assert.match(COMMAND, /^## Merging — when two records are one$/m, 'the merge section is stated');
  assert.match(COMMAND, /<dir of spec-file>\/educe-sequences\/declaration\.json/, 'the declaration is named under the run directory');
  assert.match(COMMAND, /^\| a name the previous generation carried .* \| Step 9 \|$/m, 'the refusal is in the Refusals table');
});

// ---------------------------------------------------------------------------
// C006 — one sentence, both surfaces
// ---------------------------------------------------------------------------

test('C006 the phase driver and the product path name the same subject', () => {
  const run = scratchRun();
  writeGeneration(run);
  assert.equal(spawnSync('node', [PHASE, 'through', run.specPath, '9'], { encoding: 'utf8' }).status, 0);

  const merged = mergedReadings({ dropped: 'Admit', kept: 'Settle' });
  writeGeneration(run, merged);

  const throughPhase = spawnSync('node', [PHASE, 'run', run.specPath, '9'], { encoding: 'utf8' });
  const throughProduct = spawnSync('node', [RUN_RAIL, run.specPath], {
    input: JSON.stringify(runInputFor(merged)),
    encoding: 'utf8',
  });

  assert.notEqual(throughPhase.status, 0);
  assert.notEqual(throughProduct.status, 0);
  assert.equal(subjectNamedIn(throughPhase.stdout), 'Admit');
  assert.equal(subjectNamedIn(throughProduct.stderr), 'Admit');
});

test('C006 the product path answers with verdicts shaped like every other refusal', async () => {
  // A caller reads `verdicts` as records: `verdict.check` is filtered on and `subject` is
  // named. An array of bare strings would answer `undefined` to both without failing.
  const run = scratchRun();
  writeGeneration(run);
  assert.equal(spawnSync('node', [PHASE, 'through', run.specPath, '9'], { encoding: 'utf8' }).status, 0);

  const result = await runCommand([run.specPath], {
    runInput: runInputFor(mergedReadings({ dropped: 'Admit', kept: 'Settle' })),
    stdout: () => {},
    stderr: () => {},
  });

  assert.equal(result.verdicts.length, 1);
  assert.equal(result.verdicts[0].subject, 'Admit');
  assert.equal(typeof result.verdicts[0].check, 'string');
  assert.match(result.verdicts[0].reason, /Admit was named by the artifact this generation replaces/);
});
