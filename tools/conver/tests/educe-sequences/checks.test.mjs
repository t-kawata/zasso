// [::TICKET::] PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-248 --for-spec --no-implementation-order`.
// The check constructor library (PX-241, contracts C001, C002).
// @verifies C001
// @verifies C002
//
// A check is written from one of six shapes: two records must agree, the apparatus
// output must cover its input, every member must fall in exactly one declared bucket,
// every declared name must be reached, a claim must cite a carrier, and a claim must
// be grounded in the line it names. Before this module existed the shapes were mixed
// into the checks themselves, so the only way to write a new check was to copy an old
// one — which is why the ad-hoc surface produced a module with an empty body.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  PIN_KINDS,
  agreeOn,
  citeFrom,
  coverEvery,
  groundIn,
  pinCheck,
  placeEach,
  reachEvery,
} from '../../.claude/scripts/educe-sequences/rail/checks.mjs';
import { CHECKS, checkAll } from '../../.claude/scripts/educe-sequences/rail/engine.mjs';
import { readSpecification } from '../../.claude/scripts/educe-sequences/rail/load.mjs';
import { flattenPins } from '../../.claude/scripts/educe-sequences/rail/pins.mjs';
// [::TICKET::] PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-241 --for-spec --no-implementation-order`.

const SPEC_PATH = new URL('./fixtures/spec/ledger.md', import.meta.url).pathname;
const GOLDEN_PATH = new URL('./fixtures/spec/ledger-sequences.json', import.meta.url).pathname;

const spec = readSpecification(SPEC_PATH);
const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
const context = { specLines: spec.lines, artifact: golden };

/** The five pin checks the constructor builds, each paired with the kind it re-derives. */
/** The contract every constructed check carries, so a test names one thing once. */
const CONTRACT = { id: 'a-check', defect: 'a defect', refuses: 'a refusal', scope: 'every artifact' };

const PIN_CHECKS = [
  ['predicate-pin-rederives', 'predicate'],
  ['row-schema-pin-rederives', 'rowSchema'],
  ['enumeration-pin-rederives', 'enumeration'],
  ['block-partition-rederives', 'blocks'],
  ['form-pin-proposes', 'form'],
  ['source-enumeration-pin-rederives', 'sourceEnumeration'],
];

test('C001 every constructor returns a check carrying its own defect, refusal and scope', () => {
  const built = [
    pinCheck('a-pin-check', 'predicate', 'a defect', 'a refusal'),
    agreeOn(CONTRACT, { left: () => [], right: () => [] }),
    coverEvery(CONTRACT, { sources: () => [], coveredBy: () => true }),
    placeEach(CONTRACT, { members: () => [], buckets: ['only'], bucketOf: () => ({ bucket: 'only', evidence: 'x' }) }),
    reachEvery(CONTRACT, { claimed: () => [], declared: () => [], exempt: () => false }),
    citeFrom(CONTRACT, { claims: () => [], carriers: () => [] }),
    groundIn(CONTRACT, { claims: () => [] }),
  ];

  for (const check of built) {
    assert.equal(typeof check.id, 'string');
    assert.equal(check.originatingDefect, 'a defect');
    assert.equal(typeof check.refuses, 'string');
    assert.equal(typeof check.scope, 'string');
    assert.deepEqual(check.run(context), [], `${check.id} fires on work that carries no defect`);
  }
});

test('C001 a constructor called without an originating defect is refused by name', () => {
  assert.throws(
    () => coverEvery({ id: 'x', refuses: 'y' }, { sources: () => [], coveredBy: () => true }),
    /originating defect/,
  );
  assert.throws(() => agreeOn({ id: '', defect: 'd', refuses: 'r' }, { left: () => [], right: () => [] }), /id/);
});

test('C001 a selector returning nothing for a member is reported rather than thrown', () => {
  const check = coverEvery(
    { id: 'coverage', defect: 'd', refuses: 'a source covered by nothing' },
    { sources: () => [{ id: 's1' }, { id: 's2' }], coveredBy: (source) => source.id === 's1' },
  );

  const verdicts = check.run(context);
  assert.equal(verdicts.length, 1);
  assert.equal(verdicts[0].check, 'coverage');
  assert.equal(verdicts[0].subject, 's2');
});

test('C001 no constructor mutates the artifact it reads', () => {
  const before = JSON.stringify(golden);
  for (const check of CHECKS) check.run(context);
  assert.equal(JSON.stringify(golden), before);
});

test('C002 pinCheck builds every pin check, and the six ids are the recorded ones', () => {
  const built = PIN_CHECKS.map(([id, kind]) => pinCheck(id, kind, 'd', 'r'));

  assert.deepEqual(built.map((check) => check.id), PIN_CHECKS.map(([id]) => id));
  assert.deepEqual([...PIN_KINDS].sort(), PIN_CHECKS.map(([, kind]) => kind).sort(), 'the kinds the constructor accepts are the kinds the pins carry');
  for (const check of built) assert.deepEqual(check.run(context), []);
});

test('C002 every kind the artifact pins actually carry is one the constructor accepts', () => {
  const carried = new Set(flattenPins(golden.pins).map((pin) => pin.kind));

  assert.deepEqual([...carried].filter((kind) => !PIN_KINDS.includes(kind)), [], 'a pin the constructor cannot be built for would have no check');
});

test('C002 pinCheck with a kind no pin carries is refused rather than returning a check that never fires', () => {
  assert.throws(() => pinCheck('x', 'no-such-kind', 'd', 'r'), /no-such-kind/);
});

test('C002 moving the predicate pin reddens exactly the check that owns that pin', () => {
  const moved = structuredClone(golden);
  moved.pins.predicate.line = 1;

  const reddened = checkAll({ specLines: spec.lines, artifact: moved }).verdicts.map((verdict) => verdict.check);
  assert.deepEqual(reddened, ['predicate-pin-rederives']);
});

test('C002 every declared check carries the three fields a reader needs to judge it', () => {
  for (const check of CHECKS) {
    assert.equal(typeof check.id, 'string', 'a check has an id');
    assert.equal(typeof check.originatingDefect, 'string', `${check.id} states the defect it came from`);
    assert.equal(typeof check.refuses, 'string', `${check.id} states the reading it refuses`);
    assert.equal(typeof check.scope, 'string', `${check.id} states its scope`);
  }
});

test('C002 no check id is declared twice', () => {
  assert.equal(new Set(CHECKS.map((check) => check.id)).size, CHECKS.length);
});
