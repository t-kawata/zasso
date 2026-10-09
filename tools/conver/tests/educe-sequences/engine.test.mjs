// The engine, the rail-exit record, the rendering and the consumer direction
// (PX-240, contracts C001, C009, C014, C015).
// @verifies C001
// @verifies C009
// @verifies C014
// @verifies C015
// @verifies C012
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CHECKS, ENGINE_DECLARED_CHECK_COUNT, checkAll } from '../../.claude/scripts/educe-sequences/rail/engine.mjs';
import {
  RAIL_EXIT_FIELDS,
  checkRenderFreshness,
  compareCoverage,
  idsAdded,
  idsRemoved,
  readRailExits,
  renderArtifact,
  spliceCheck,
  writeRailExit,
} from '../../.claude/scripts/educe-sequences/rail/harness.mjs';
import { readArtifactSchema, readSpecification, validateArtifactShape } from '../../.claude/scripts/educe-sequences/rail/load.mjs';

const SPEC_PATH = new URL('./fixtures/spec/ledger.md', import.meta.url).pathname;
// [::TICKET::] PX-240 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-240 --for-spec --no-implementation-order`.
const GOLDEN_PATH = new URL('./fixtures/spec/ledger-sequences.json', import.meta.url).pathname;
const RENDER_PATH = new URL('./fixtures/spec/ledger-sequences.md', import.meta.url).pathname;

const spec = readSpecification(SPEC_PATH);
const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));

/** The recorded coverage block, so a change to it is a change to the record. */
// [::TICKET::] PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-244 --for-spec --no-implementation-order`.
// [::TICKET::] PX-243 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-243 --for-spec --no-implementation-order`.
// [::TICKET::] PX-247 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-247 --for-spec --no-implementation-order`.
const RECORDED_BLOCK = {
  checksRun: 21,
  rows: 10,
  sequences: 8,
  steps: 6,
  operations: 3,
  pinsRederived: 5,
  pinsTotal: 5,
};

test('C001 the fixture run is green and prints the recorded block', () => {
  const { verdicts, summary } = checkAll({ specLines: spec.lines, artifact: golden, recorded: { railExits: [] } });

  assert.deepEqual(verdicts, []);
  for (const [key, value] of Object.entries(RECORDED_BLOCK)) {
    assert.equal(summary[key], value, `summary.${key}`);
  }
  assert.equal(summary.checksRun, ENGINE_DECLARED_CHECK_COUNT);
});

test('C001 every check is declared once, so the block cannot be reached by a subset', () => {
  const ids = CHECKS.map((check) => check.id);

  assert.equal(new Set(ids).size, ids.length, 'a duplicated id would be counted twice and run once');
  assert.equal(ids.length, ENGINE_DECLARED_CHECK_COUNT);
  for (const check of CHECKS) {
    for (const field of ['originatingDefect', 'refuses', 'scope']) {
      assert.equal(typeof check[field] === 'string' && check[field].length > 0, true, `${check.id} has no ${field}`);
    }
  }
});

test('C001 an artifact whose predicate pin is absent is refused before any check runs', () => {
  const broken = structuredClone(golden);
  delete broken.pins.predicate.line;

  const outcome = checkAll({ specLines: spec.lines, artifact: broken });

  assert.equal(outcome.summary, null, 'the block is produced only after every check has run');
  assert.deepEqual(outcome.verdicts.map((verdict) => verdict.pin), ['predicate.line']);
});

test('C001 a block range past the last line is refused, naming the block and the line count', () => {
  const broken = structuredClone(golden);
  const last = broken.pins.blocks.at(-1);
  last.lastLine = spec.lines.length + 1;

  const { verdicts } = checkAll({ specLines: spec.lines, artifact: broken });

  assert.equal(verdicts[0].check, 'block-range-inside-specification');
  assert.equal(verdicts[0].subject, last.id);
  assert.match(verdicts[0].reason, new RegExp(String(spec.lines.length)));
});

test('C001 a one-line specification is accepted and every check returns rather than throwing', () => {
  const oneLine = ['# T'];
  const minimal = { ...structuredClone(golden), pins: { ...structuredClone(golden.pins), blocks: [{ id: 's1', firstLine: 1, lastLine: 1 }] } };

  const outcome = checkAll({ specLines: oneLine, artifact: minimal });

  assert.equal(Array.isArray(outcome.verdicts), true);
  assert.equal(outcome.verdicts.some((verdict) => verdict.subject === '(threw)'), false);
});

test('C001 no library source carries a bare specification literal or the host project name', () => {
  const sources = CHECKS.map((check) => JSON.stringify(check)).join('\n');

  assert.equal(/\b\d{4,5}\b/.test(sources), false, 'a four-or-five digit literal in a check is a host value');
  assert.equal(sources.includes('Gaia'), false);
});

test('C009 a spliced check with its defect, mutation and counter-case is recorded with no empty field', () => {
  const store = join(mkdtempSync(join(tmpdir(), 'educe-rail-')), 'rail-exits.jsonl');
  const record = spliceCheck({
    contract: { check: 'a-new-check', defect: 'a defect class no existing check was asked about' },
    cases: {
      mutationCase: { inputs: 'a mutated specification', outputShape: 'one verdict', readBy: 'the engine' },
      counterCase: { name: 'a counter-mutation on correct work' },
    },
    executed: { reddened: true, attributable: true, counterGreen: true },
    storePath: store,
  });

  for (const field of RAIL_EXIT_FIELDS) {
    assert.equal(record[field] === undefined || record[field] === '', false, `${field} is empty`);
  }
  assert.equal(readRailExits(store).length, 1);
});

test('C009 a splice with no originating defect, and a record with an empty field, are both refused', () => {
  const store = join(mkdtempSync(join(tmpdir(), 'educe-rail-')), 'rail-exits.jsonl');

  assert.throws(() => spliceCheck({ contract: { check: 'c' }, cases: { mutationCase: {}, counterCase: {} }, storePath: store }), /originating defect/);
  assert.throws(() => spliceCheck({ contract: { check: 'c', defect: 'd' }, cases: { mutationCase: {}, counterCase: {} }, storePath: store }), /executed outcome/);
  assert.throws(() => writeRailExit(Object.fromEntries(RAIL_EXIT_FIELDS.map((field) => [field, field === 'verifiedBy' ? '' : 'x'])), store), /empty field/);
  assert.throws(() => writeRailExit(Object.fromEntries(RAIL_EXIT_FIELDS.map((field) => [field, field === 'executed' ? { reddened: true } : 'x'])), store), /claims no executed outcome/);
});

test('C009 the printed rail-exit count equals the records on disk', () => {
  const store = join(mkdtempSync(join(tmpdir(), 'educe-rail-')), 'rail-exits.jsonl');
  writeRailExit(Object.fromEntries(RAIL_EXIT_FIELDS.map((field) => [field, field === 'promoted' ? false : (field === 'executed' ? { reddened: true, attributable: true, counterGreen: true } : 'recorded')])), store);

  const records = readRailExits(store);
  const { summary } = checkAll({ specLines: spec.lines, artifact: golden, recorded: { railExits: records } });

  assert.equal(summary.railExits, records.length);
  assert.equal(summary.promotionCandidates, records.filter((record) => record.promoted === false).length);
});

test('C014 the committed rendering is byte-equal to a re-render of the artifact', () => {
  const outcome = checkRenderFreshness({ artifact: golden, committedPath: RENDER_PATH });

  assert.deepEqual(outcome.files, []);
  assert.equal(outcome.ok, true);
  assert.equal(Buffer.from(renderArtifact(golden), 'utf8').length, readFileSync(RENDER_PATH).length);
});

test('C014 a hand-edited rendering fails the freshness check and names the file', () => {
  const directory = mkdtempSync(join(tmpdir(), 'educe-render-'));
  const edited = join(directory, 'ledger-sequences.md');
  writeFileSync(edited, `${renderArtifact(golden)}\nhand edited\n`);

  const outcome = checkRenderFreshness({ artifact: golden, committedPath: edited });

  assert.equal(outcome.ok, false);
  assert.match(outcome.files[0], /ledger-sequences\.md/);
});

test('C015 a consumer implementing every declared operation passes both directions', () => {
  const consumer = { declared: golden.operations.map((operation) => operation.id) };

  const report = compareCoverage({ artifact: golden, consumer });

  assert.deepEqual(report.declaredNotImplemented, []);
  assert.deepEqual(report.implementedNotDeclared, []);
});

test('C015 each direction fails on its own difference set, reported separately', () => {
  const missing = { declared: golden.operations.slice(1).map((operation) => operation.id) };
  const extra = { declared: [...golden.operations.map((operation) => operation.id), 'NotInArtifact'] };

  assert.deepEqual(compareCoverage({ artifact: golden, consumer: missing }).declaredNotImplemented, [golden.operations[0].id]);
  assert.deepEqual(compareCoverage({ artifact: golden, consumer: missing }).implementedNotDeclared, []);
  assert.deepEqual(compareCoverage({ artifact: golden, consumer: extra }).implementedNotDeclared, ['NotInArtifact']);
  assert.deepEqual(compareCoverage({ artifact: golden, consumer: extra }).declaredNotImplemented, []);
});

test('C015 a rename appears as one removal and one addition rather than a silent renumbering', () => {
  const renamed = structuredClone(golden);
  renamed.operations.find((operation) => operation.id === 'LedgerStatus').id = 'LedgerLifecycle';

  assert.deepEqual(idsRemoved(golden, renamed), ['LedgerStatus']);
  assert.deepEqual(idsAdded(golden, renamed), ['LedgerLifecycle']);
});

// ---------------------------------------------------------------------------
// The single carrier (PX-241, contract C012)
// ---------------------------------------------------------------------------

test('C012 every step records the entry that realizes it and the operation it is an instance of', () => {
  const sequences = new Set(golden.sequences.map((entry) => entry.id));
  const operations = new Set(golden.operations.map((operation) => operation.id));

  assert.equal(golden.steps.length > 0, true, 'the golden run carries steps to bind');
  for (const step of golden.steps) {
    assert.equal(typeof step.sequence, 'string', `${step.id} names no sequence, so nothing derives its operations`);
    assert.equal(typeof step.operation, 'string', `${step.id} names no operation, so it reaches nothing`);
    assert.equal(sequences.has(step.sequence), true, `${step.id} names the sequence ${step.sequence}, which the artifact does not declare`);
    assert.equal(operations.has(step.operation), true, `${step.id} names the operation ${step.operation}, which the artifact does not declare`);
  }
});

test('C012 the schema states the fields a step must carry, and no step may omit them', () => {
  const schema = readArtifactSchema();

  // A step carries the act fields and the grounding pair: a step that names what was done
  // and not the line it was read from is a step no check can ask about.
  assert.deepEqual(schema.steps.required, ['id', 'sequence', 'operation', 'line', 'quote']);

  const broken = structuredClone(golden);
  delete broken.steps[0].operation;
  const problems = validateArtifactShape(broken, schema);
  assert.equal(problems.length, 1, 'a step with no operation passes the shape gate');
  assert.equal(problems[0].pin, 'steps[0].operation', 'the refusal locates the missing field');
  assert.match(problems[0].reason, /admission-1 has no operation/, 'the refusal names the step a reader must repair');
});

test('C012 the artifact carries the schema version a consumer must hold', () => {
  assert.equal(golden.schema_version, 2);
  assert.equal(readArtifactSchema().schema_version, 2);
});

// ---------------------------------------------------------------------------
// The guarantee: census, placement and totality (PX-241, contracts C003-C005)
// ---------------------------------------------------------------------------

/** A check's verdicts over an artifact, so a test names the check it is asking about. */
// [::TICKET::] PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-241 --for-spec --no-implementation-order`.
function verdictsOf(artifact, id) {
  return checkAll({ specLines: spec.lines, artifact }).verdicts.filter((verdict) => verdict.check === id);
}

test('C003 the census check is declared, and the golden artifact leaves every section explained', () => {
  assert.equal(CHECKS.some((check) => check.id === 'census-every-section-explained'), true);
  assert.deepEqual(verdictsOf(golden, 'census-every-section-explained'), []);
});

test('C003 an unexplained section is refused, naming the section and both ways it could be explained', () => {
  const unexplained = structuredClone(golden);
  unexplained.adjudications = unexplained.adjudications.filter((row) => row.subject !== 's10');

  const verdicts = verdictsOf(unexplained, 'census-every-section-explained');
  assert.equal(verdicts.length, 1);
  assert.equal(verdicts[0].subject, 's10');
  assert.match(verdicts[0].reason, /start inside|adjudication/);
});

test('C003 an entry that covers a section without starting inside it does not explain that section', () => {
  const covering = structuredClone(golden);
  covering.sequences = [{ id: 'wide', kind: 'entry', firstLine: 2, lastLine: 60, outcome: 'direct' }];
  covering.adjudications = [];

  const verdicts = verdictsOf(covering, 'census-every-section-explained');
  assert.equal(verdicts.length, covering.sections.length, 'coverage was read as reading');
});

test('C004 every operation is placed, and Admit and Settle are positioned by the steps that name them', () => {
  assert.equal(CHECKS.some((check) => check.id === 'every-operation-placed'), true);
  assert.deepEqual(verdictsOf(golden, 'every-operation-placed'), []);
});

test('C004 an operation whose position is outside the declared set is refused', () => {
  const wild = structuredClone(golden);
  wild.operations.push({ id: 'Floating', position: 'floating', grounding: { classification: 'definition', presupposition: 24 } });

  const verdicts = verdictsOf(wild, 'every-operation-placed');
  assert.equal(verdicts.length, 1);
  assert.equal(verdicts[0].subject, 'Floating');
  assert.match(verdicts[0].reason, /floating/);
  assert.match(verdicts[0].reason, /positioned/);
});

test('C004 a positioned operation no step names carries no evidence and is refused', () => {
  const unbacked = structuredClone(golden);
  unbacked.steps = unbacked.steps.map((step) => ({ ...step, operation: 'Settle' }));

  const verdicts = verdictsOf(unbacked, 'every-operation-placed');
  assert.equal(verdicts.length, 1);
  assert.equal(verdicts[0].subject, 'Admit');
  assert.match(verdicts[0].reason, /carries no evidence/);
});

test('C004 a singleStep operation whose defining section is absent is refused', () => {
  const lonely = structuredClone(golden);
  lonely.operations.push({ id: 'Lonely', position: 'singleStep', definingSection: 's99', grounding: { classification: 'definition', presupposition: 24 } });

  const verdicts = verdictsOf(lonely, 'every-operation-placed');
  assert.equal(verdicts.length, 1);
  assert.equal(verdicts[0].subject, 'Lonely');
  assert.match(verdicts[0].reason, /carries no evidence/);
});

test('C005 every operation is reached, and the derived map is non-empty for every entry', () => {
  assert.equal(CHECKS.some((check) => check.id === 'every-operation-reached'), true);
  assert.deepEqual(verdictsOf(golden, 'every-operation-reached'), []);
});

test('C005 a step naming an undeclared operation is reported forward and not backward', () => {
  const forward = structuredClone(golden);
  forward.steps[0].operation = 'Invented';

  const verdicts = verdictsOf(forward, 'every-operation-reached');
  const invented = verdicts.filter((verdict) => verdict.subject === 'Invented');
  assert.equal(invented.length, 1);
  assert.equal(invented[0].direction, 'forward');
  assert.equal(verdicts.some((verdict) => verdict.direction === 'backward'), false, 'the two directions are never summed into one');
});

test('C005 an operation nothing reaches and no escape covers is reported backward and not forward', () => {
  const backward = structuredClone(golden);
  backward.operations.push({ id: 'Unreached', position: 'positioned', grounding: { classification: 'definition', presupposition: 24 } });

  const verdicts = verdictsOf(backward, 'every-operation-reached');
  const unreached = verdicts.filter((verdict) => verdict.subject === 'Unreached');
  assert.equal(unreached.length, 1);
  assert.equal(unreached[0].direction, 'backward');
  assert.equal(verdicts.some((verdict) => verdict.direction === 'forward'), false);
});

test('C005 the reach is derived from the steps and stored nowhere', () => {
  const before = JSON.stringify(golden);
  checkAll({ specLines: spec.lines, artifact: golden });

  assert.equal(JSON.stringify(golden), before, 'the derived map was written back into the artifact');
});

test('C005 an entry whose steps derive no operation is refused', () => {
  const unrealized = structuredClone(golden);
  unrealized.steps = unrealized.steps.map((step) => (step.sequence === 'settlement' ? { ...step, sequence: 'admission' } : step));

  const verdicts = verdictsOf(unrealized, 'every-operation-reached');
  const unrealizedVerdict = verdicts.find((verdict) => verdict.subject === 'settlement');
  assert.notEqual(unrealizedVerdict, undefined);
  assert.equal(unrealizedVerdict.direction, 'unrealized');
});
