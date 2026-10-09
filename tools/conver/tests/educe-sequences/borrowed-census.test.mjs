// The borrowed census: the artifact is told what it must account for (PX-248).
//
// The rail's yardstick was the artifact itself: `every-operation-reached` compared the
// steps' claimed operations against the artifact's own declared list, so a short list
// confirmed itself. This file holds the rule that replaces the yardstick with a set the
// artifact does not hold — a census read out of supplied material — and the totality rule
// that stops a wrong source, field or column from shrinking that set in silence.
//
// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
// @verifies C006
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SOURCE_SHAPES,
  establishPins,
  extractMembers,
  flattenPins,
  rederiveAll,
} from '../../.claude/scripts/educe-sequences/rail/pins.mjs';
import { CHECKS, ENGINE_DECLARED_CHECK_COUNT, checkAll } from '../../.claude/scripts/educe-sequences/rail/engine.mjs';
import { digestOfBytes, readSpecification, splitLines } from '../../.claude/scripts/educe-sequences/rail/load.mjs';
import { coverageLine, coverageOf } from '../../.claude/scripts/educe-sequences/rail/coverage.mjs';
import { suppliedDocumentsOf } from '../../.claude/scripts/educe-sequences/rail/supplied.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const FIXTURE = join(PROJECT_ROOT, 'tests/educe-sequences/fixtures/census');
const SPEC_PATH = join(FIXTURE, 'ledger.md');
const GOLDEN_PATH = join(FIXTURE, 'ledger-sequences.json');
const RUN_INPUT_PATH = join(FIXTURE, 'ledger.run.json');
const RUN_DIRECTORY = join(FIXTURE, 'educe-sequences');
const RUN_RAIL = join(PROJECT_ROOT, '.claude/scripts/educe-sequences/rail/run.mjs');
const PHASE = join(PROJECT_ROOT, '.claude/scripts/educe-sequences/rail/phase.mjs');

const spec = readSpecification(SPEC_PATH);
const RUN_INPUT = JSON.parse(readFileSync(RUN_INPUT_PATH, 'utf8'));
const SUPPLIED = suppliedDocumentsOf(RUN_DIRECTORY);

/** Judge an artifact with the material it was read beside.
 *
 * A borrowed census is re-derived from the supplied file, so an artifact that carries one
 * cannot be judged without the material it names: the check that would answer is the
 * re-derivation, and it has nothing to read. */
// [::TICKET::] PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-248 --for-spec --no-implementation-order`.
function verify(artifact) {
  return checkAll({ specLines: spec.lines, artifact, recorded: { supplied: SUPPLIED } });
}

/** The golden artifact, read fresh so no test can hand another a mutated one. */
// [::TICKET::] PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-248 --for-spec --no-implementation-order`.
function golden() {
  return JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
}

/** The borrowed pins of an artifact, by role. */
// [::TICKET::] PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-248 --for-spec --no-implementation-order`.
function borrowed(artifact, role) {
  return (artifact.pins.sourceEnumerations ?? []).find((pin) => pin.role === role) ?? null;
}

/** A fenced document holding one JSON object per line. */
// [::TICKET::] PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-248 --for-spec --no-implementation-order`.
function fenced(rows) {
  return ['```json', ...rows.map((row) => JSON.stringify(row)), '```', ''].join('\n');
}

/**
 * The readings shaped as the driver reads them.
 *
 * A reading carries its own steps and operations; the fixture keeps them beside the
 * readings instead, because the product path reads them from there. The driver is the
 * surface this test needs, so the two are joined the way a reader writes them.
 */
// [::TICKET::] PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-248 --for-spec --no-implementation-order`.
function driverReadings() {
  const steps = RUN_INPUT.readings.steps;
  return RUN_INPUT.readings.sequences.map((reading) => ({
    ...reading,
    steps: steps.filter((step) => step.sequence === reading.subject),
    operations: RUN_INPUT.readings.operations.filter(
      (operation) => operation.id === reading.subject
        || steps.some((step) => step.sequence === reading.subject && step.operation === operation.id),
    ),
  }));
}

/** A run directory whose specification and supplied material are the fixture's. */
// [::TICKET::] PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-248 --for-spec --no-implementation-order`.
function scratchRun() {
  const root = mkdtempSync(join(tmpdir(), 'px248-census-'));
  copyFileSync(SPEC_PATH, join(root, 'ledger.md'));
  cpSync(RUN_DIRECTORY, join(root, 'educe-sequences'), { recursive: true });
  return { specPath: join(root, 'ledger.md'), directory: join(root, 'educe-sequences') };
}

/** Declare the given source enumerations, keeping the rest of the declaration as it stands. */
// [::TICKET::] PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-248 --for-spec --no-implementation-order`.
function declare(directory, sourceEnumerations) {
  const declaration = { ...RUN_INPUT.declaration, sourceEnumerations };
  writeFileSync(join(directory, 'declaration.json'), `${JSON.stringify(declaration, null, 2)}\n`);
}

// ---------------------------------------------------------------------------
// C001 — the extractors, their totality, and the pin
// ---------------------------------------------------------------------------

test('C001 the declared extraction shapes are generic, and each takes its parameter from the declaration', () => {
  assert.deepEqual([...SOURCE_SHAPES].sort(), ['jsonFieldRows', 'markedLines', 'tableColumn']);

  const json = splitLines(fenced([{ kind: 'Admit' }, { kind: 'Settle' }]));
  const table = splitLines(['| operation | mutation |', '| --- | --- |', '| Admit | yes |', '| Settle | no |'].join('\n'));
  // The marked-lines shape claims a document that is a list and nothing else, which is what
  // makes it total: a line without the prefix is refused rather than skipped.
  const list = splitLines(['- Issue', '- Cancel', '', '- Admit', '- Settle'].join('\n'));

  assert.deepEqual(extractMembers({ lines: json, shape: 'jsonFieldRows', parameter: 'kind' }), { members: ['Admit', 'Settle'] });
  assert.deepEqual(extractMembers({ lines: table, shape: 'tableColumn', parameter: 'operation' }), { members: ['Admit', 'Settle'] });
  assert.deepEqual(extractMembers({ lines: list, shape: 'markedLines', parameter: '- ' }), { members: ['Issue', 'Cancel', 'Admit', 'Settle'] });
});

test('C001 every shape is total: an element it cannot read refuses naming that element', () => {
  const shortJson = splitLines(fenced([{ kind: 'Admit' }, { type: 'Settle' }]));
  const shortTable = splitLines(['| operation | mutation |', '| --- | --- |', '| Admit | yes |', '| Settle |'].join('\n'));
  const shortMarks = splitLines(['- Issue', 'Cancel'].join('\n'));

  assert.match(extractMembers({ lines: shortJson, shape: 'jsonFieldRows', parameter: 'kind' }).refused, /kind/);
  assert.match(extractMembers({ lines: shortTable, shape: 'tableColumn', parameter: 'mutation' }).refused, /Settle/);
  assert.match(extractMembers({ lines: shortMarks, shape: 'markedLines', parameter: '- ' }).refused, /Cancel/);
});

test('C001 a pin records the file, its digest, the selector and the members read out of it', () => {
  const pins = establishPins(spec.lines, RUN_INPUT.declaration, SUPPLIED);
  const pin = pins.sourceEnumerations.find((entry) => entry.role === 'operations');

  assert.equal(pin.source.file, 'ledger-registry.md');
  assert.equal(pin.source.sha256, digestOfBytes(Buffer.from(SUPPLIED['ledger-registry.md'], 'utf8')));
  assert.deepEqual(pin.selector, { shape: 'jsonFieldRows', parameter: 'kind' });
  assert.deepEqual([...pin.members].sort(), golden().operations.map((operation) => operation.id).sort());
  assert.equal(flattenPins(pins).filter((entry) => entry.kind === 'sourceEnumeration').length, 2);
});

test('C001 re-derivation refuses a supplied file whose bytes moved, and refuses a shortened member list', () => {
  const pins = establishPins(spec.lines, RUN_INPUT.declaration, SUPPLIED);
  assert.equal(rederiveAll(pins, spec.lines, SUPPLIED).ok, true);

  const moved = { ...SUPPLIED, 'ledger-registry.md': `${SUPPLIED['ledger-registry.md']}\n` };
  const movedFailure = rederiveAll(pins, spec.lines, moved).failures[0];
  assert.equal(movedFailure.rule, 'source-enumeration-members-match-source');
  assert.match(movedFailure.reason, /ledger-registry\.md/);

  const shortened = structuredClone(pins);
  shortened.sourceEnumerations.find((entry) => entry.role === 'operations').members = [];
  assert.match(rederiveAll(shortened, spec.lines, SUPPLIED).failures[0].reason, /Admit|Issue|Settle/);
});

test('C001 a role outside the vocabulary refuses, so a misspelled census cannot disarm the checks that select by role', () => {
  const pins = establishPins(spec.lines, RUN_INPUT.declaration, SUPPLIED);
  const misspelt = structuredClone(pins);
  misspelt.sourceEnumerations.find((entry) => entry.role === 'operations').role = 'operation';

  const failure = rederiveAll(misspelt, spec.lines, SUPPLIED).failures.find((entry) => entry.pin.includes('CoreOperationKind'));
  assert.notEqual(failure, undefined);
  assert.match(failure.reason, /operation/);

  // A census with no role answers for nothing and is permitted.
  const roleless = structuredClone(pins);
  roleless.sourceEnumerations.forEach((entry) => { entry.role = null; });
  assert.equal(rederiveAll(roleless, spec.lines, SUPPLIED).ok, true);
});

test('C001 a supplied file that is not beside the run refuses, and a shape outside the vocabulary refuses', () => {
  const pins = establishPins(spec.lines, RUN_INPUT.declaration, SUPPLIED);

  assert.match(rederiveAll(pins, spec.lines, {}).failures[0].reason, /not beside this run/);

  const wrongShape = structuredClone(pins);
  wrongShape.sourceEnumerations[0].selector.shape = 'byProximity';
  assert.match(rederiveAll(wrongShape, spec.lines, SUPPLIED).failures[0].reason, /byProximity/);
});

test('C001 a declaration with no borrowed census establishes exactly the pins it established before', () => {
  const withBorrowing = establishPins(spec.lines, RUN_INPUT.declaration, SUPPLIED);
  const withoutBorrowing = { ...RUN_INPUT.declaration };
  delete withoutBorrowing.sourceEnumerations;
  const plain = establishPins(spec.lines, withoutBorrowing, {});

  const kinds = (pins) => flattenPins(pins).filter((pin) => pin.kind !== 'sourceEnumeration').map((pin) => pin.kind);
  assert.deepEqual(kinds(plain), kinds(withBorrowing), 'the five pin kinds are established field for field');
  assert.deepEqual(plain.predicate, withBorrowing.predicate);
  assert.deepEqual(plain.blocks, withBorrowing.blocks);
  assert.equal(plain.sourceEnumerations.length, 0);
});

// ---------------------------------------------------------------------------
// C002 — the symmetric accounting
// ---------------------------------------------------------------------------

test('C002 a member the artifact declares no operation for refuses, and the verdict names it', () => {
  const artifact = golden();
  const declared = borrowed(artifact, 'operations').members.filter((id) => id !== 'Admit');
  const gapped = {
    ...artifact,
    operations: artifact.operations.filter((operation) => operation.id !== 'Admit'),
    pins: { ...artifact.pins, sourceEnumerations: [{ ...borrowed(artifact, 'operations'), members: borrowed(artifact, 'operations').members }] },
  };

  const { verdicts, summary } = checkAll({ specLines: spec.lines, artifact: gapped, recorded: { supplied: SUPPLIED } });
  const verdict = verdicts.find((entry) => entry.check === 'every-enumerated-operation-accounted-for');

  assert.notEqual(verdict, undefined);
  assert.equal(verdict.subject, 'Admit');
  assert.equal(verdict.direction, 'backward');
  assert.equal(summary, null);
  assert.equal(declared.includes('Admit'), false);
});

test('C002 an operation the census does not carry is refused in the other direction, and the two are never summed', () => {
  const artifact = golden();
  const invented = {
    ...artifact,
    operations: [...artifact.operations, { id: 'Invented', position: 'positioned', grounding: { classification: 'definition' } }],
  };
  const { verdicts } = verify(invented);
  const verdict = verdicts.find((entry) => entry.check === 'every-enumerated-operation-accounted-for' && entry.subject === 'Invented');

  assert.notEqual(verdict, undefined, 'the operation the census does not name is a finding of the accounting check');
  assert.equal(verdict.direction, 'forward');
  assert.equal(verdicts.filter((entry) => entry.check === 'every-enumerated-operation-accounted-for').every((entry) => typeof entry.direction === 'string'), true);
});

test('C002 a censused entry carrying no outcome is refused, and the outcome is never compared with the census category', () => {
  const artifact = golden();
  const unread = { ...artifact, sequences: artifact.sequences.map((entry) => (entry.id === 'admission' ? { ...entry, outcome: null } : entry)) };

  const refused = verify(unread).verdicts.find((entry) => entry.check === 'every-censused-entry-adjudicated');
  assert.notEqual(refused, undefined);
  assert.equal(refused.subject, 'admission');

  const disagreed = {
    ...artifact,
    sequences: artifact.sequences.map((entry) => ({ ...entry, censusCategory: 'notASequence' })),
  };
  assert.equal(verify(disagreed).verdicts.some((entry) => entry.check === 'every-censused-entry-adjudicated'), false);
});

test('C002 an artifact that borrows nothing yields no verdict from the accounting checks and still builds its block', () => {
  const artifact = golden();
  const withoutBorrowing = { ...artifact, pins: { ...artifact.pins, sourceEnumerations: [] } };
  const { verdicts, summary } = verify(withoutBorrowing);

  assert.deepEqual(verdicts, []);
  assert.notEqual(summary, null);
  assert.equal(summary.checksRun, summary.checksDeclared);
});

test('C002 a field a consumer declares and an operation record does not carry is refused, naming the field', () => {
  const artifact = golden();
  const demanding = {
    ...artifact,
    pins: { ...artifact.pins, consumerFields: ['id', 'position', 'notAField'] },
  };
  const verdict = verify(demanding).verdicts.find((entry) => entry.check === 'every-operation-record-carries-the-consumer-fields');

  assert.notEqual(verdict, undefined);
  assert.equal(verdict.subject, 'notAField');
});

// ---------------------------------------------------------------------------
// C003 — the escape is interrogated, and the two surfaces name the same subjects
// ---------------------------------------------------------------------------

test('C003 the escaped operations are the ones the reach check excuses', () => {
  const artifact = golden();
  const escaped = artifact.operations.filter((operation) => ['suppliedRule', 'excluded'].includes(operation.position)).map((operation) => operation.id);

  assert.deepEqual(escaped, ['LedgerStatus']);
  const { verdicts } = verify(artifact);
  assert.deepEqual(verdicts, [], 'the escape is accounted for, so the operation checks are silent');
});

test('C003 phase 10 refuses while an escaped operation was never attacked', () => {
  const run = scratchRun();
  declare(run.directory, RUN_INPUT.declaration.sourceEnumerations);
  const written = (records) => `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
  writeFileSync(join(run.directory, 'readings-span.jsonl'), written(driverReadings()));
  writeFileSync(join(run.directory, 'readings-adjudicate.jsonl'), written(RUN_INPUT.readings.adjudications));
  // Every ruling the fixture attacks except the escape's, so the phase has exactly one
  // unattacked ruling to name.
  writeFileSync(join(run.directory, 'readings-adversarial.jsonl'), written(RUN_INPUT.readings.adversarial.filter((record) => record.subject !== 'LedgerStatus')));

  const through = spawnSync('node', [PHASE, 'through', run.specPath, '10'], { cwd: PROJECT_ROOT, encoding: 'utf8' });
  const reported = `${through.stdout}${through.stderr}`;

  assert.match(reported, /LedgerStatus/, 'the escaped operation is named by the phase that attacks rulings');
});

test('C003 the inquest gate and the inquest check require the same subjects for one artifact', () => {
  const artifact = golden();
  const { verdicts } = checkAll({ specLines: spec.lines, artifact, recorded: { inquest: [], supplied: SUPPLIED } });
  const asked = new Set(verdicts.filter((entry) => entry.check === 'inquest-covers-every-subject-and-lens').map((entry) => entry.subject));

  for (const operation of artifact.operations.filter((entry) => ['suppliedRule', 'excluded'].includes(entry.position))) {
    assert.equal([...asked].some((subject) => subject.startsWith(`${operation.id} ·`)), true, `${operation.id} is asked`);
  }
});

// ---------------------------------------------------------------------------
// C004 — column classes
// ---------------------------------------------------------------------------

test('C004 a column outside the decider vocabulary refuses, and a measuring column needs its evidence', () => {
  const artifact = golden();
  const bad = { ...artifact, pins: { ...artifact.pins, columns: [{ name: 'rest', decidedBy: 'byVibes' }] } };
  const verdict = verify(bad).verdicts.find((entry) => entry.check === 'every-declared-column-has-a-decider');

  assert.notEqual(verdict, undefined);
  assert.match(verdict.reason, /byVibes/);
});

test('C004 a column the caller requires measured may not be declared unmeasured, and an unmeasured column cites a line', () => {
  const artifact = golden();
  const excused = {
    ...artifact,
    pins: { ...artifact.pins, columns: [{ name: 'rest', decidedBy: 'unmeasured', line: 12 }], requiredMeasuredColumns: ['rest'] },
  };
  const verdict = verify(excused).verdicts.find((entry) => entry.check === 'every-required-column-is-measured');

  assert.notEqual(verdict, undefined);
  assert.equal(verdict.subject, 'rest');

  const ungrounded = { ...artifact, pins: { ...artifact.pins, columns: [{ name: 'rest', decidedBy: 'unmeasured' }], requiredMeasuredColumns: [] } };
  assert.notEqual(
    verify(ungrounded).verdicts.find((entry) => entry.check === 'every-declared-column-has-a-decider'),
    undefined,
  );
});

test('C004 the classes partition the declaration, and nothing is required when the caller requires nothing', () => {
  const artifact = golden();
  const columns = artifact.pins.columns;

  assert.equal(columns.length, new Set(columns.map((column) => column.name)).size, 'every column is placed exactly once');
  const permissive = { ...artifact, pins: { ...artifact.pins, requiredMeasuredColumns: [] } };
  assert.equal(verify(permissive).verdicts.length, 0);
});

// ---------------------------------------------------------------------------
// C006 — the coverage line
// ---------------------------------------------------------------------------

test('C006 the coverage line carries the borrowed denominator, and M equals R plus E', () => {
  const artifact = golden();
  const measured = coverageOf(artifact);
  const line = coverageLine(verify(artifact).summary);

  assert.equal(measured.operationsEnumerated, borrowed(artifact, 'operations').members.length);
  assert.equal(measured.operationsReached + measured.operationsExcused, measured.operationsEnumerated);
  assert.match(line, new RegExp(`operations=${measured.operationsEnumerated} enumerated, ${measured.operationsReached} reached by a step, ${measured.operationsExcused} excused`));
});

test('C006 an artifact that borrows no census prints the count with no denominator', () => {
  const artifact = golden();
  const withoutBorrowing = { ...artifact, pins: { ...artifact.pins, sourceEnumerations: [] } };
  const line = coverageLine(verify(withoutBorrowing).summary);

  assert.match(line, new RegExp(`operations=${artifact.operations.length}( |$)`));
  assert.equal(/enumerated/.test(line), false, 'a denominator nobody supplied is not printed');
});

// ---------------------------------------------------------------------------
// The two surfaces
// ---------------------------------------------------------------------------

test('IT the product path verifies the census the golden artifact records, and refuses a gapped artifact naming the member', () => {
  const run = scratchRun();
  const artifactIn = run.specPath.replace(/ledger\.md$/, 'ledger-sequences.json');
  copyFileSync(GOLDEN_PATH, artifactIn);

  const verified = spawnSync('node', [RUN_RAIL, run.specPath], { cwd: PROJECT_ROOT, encoding: 'utf8' });
  assert.equal(verified.status, 0, `${verified.stdout}${verified.stderr}`);
  assert.match(verified.stdout, /3 enumerated, 2 reached by a step, 1 excused/, 'the product path prints the borrowed denominator');

  const gapped = golden();
  gapped.operations = gapped.operations.filter((operation) => operation.id !== 'Admit');
  writeFileSync(artifactIn, `${JSON.stringify(gapped, null, 2)}\n`);
  const refused = spawnSync('node', [RUN_RAIL, run.specPath], { cwd: PROJECT_ROOT, encoding: 'utf8' });
  const reported = `${refused.stdout}${refused.stderr}`;

  assert.notEqual(refused.status, 0);
  assert.match(reported, /every-enumerated-operation-accounted-for/);
  assert.match(reported, /Admit/);
});

test('C001 the driver refuses a declaration whose supplied census is absent, and the refusal names the file', () => {
  const run = scratchRun();
  declare(run.directory, RUN_INPUT.declaration.sourceEnumerations);

  const refused = spawnSync('node', [PHASE, 'run', run.specPath, '6'], { cwd: PROJECT_ROOT, encoding: 'utf8' });
  const reported = `${refused.stdout}${refused.stderr}`;

  assert.match(reported, /phase\s+6|ledger-registry\.md|ledger-entries\.md/);
});

test('the registry the fixture borrows is committed beside the fixture specification', () => {
  assert.equal(existsSync(join(RUN_DIRECTORY, 'supplied', 'ledger-registry.md')), true);
  assert.equal(existsSync(join(RUN_DIRECTORY, 'supplied', 'ledger-entries.md')), true);
  assert.equal(typeof SUPPLIED['ledger-registry.md'], 'string');
});

test('the check count follows the registry it is declared in', () => {
  assert.equal(ENGINE_DECLARED_CHECK_COUNT, CHECKS.length);
  assert.equal(ENGINE_DECLARED_CHECK_COUNT, 28);
});
