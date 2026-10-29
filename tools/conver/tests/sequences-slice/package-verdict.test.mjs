// PX-269 @verifies C001
// PX-269 @verifies C002
// PX-269 @verifies C003
// PX-269 @verifies C004
// PX-269 @verifies C005
//
// The judgement a directory's own documents support, as a value rather than a reading.
//
// The three states are exhaustive and exclusive, and the reasons are a closed list, so a state
// added without a case fails here rather than reaching a plan as a mark nobody can act on. Every
// input below is material another reader produced — the ledger parser, the grounding resolver,
// the discharge measurement — so these cases pin the decision and not the measurement.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PACKAGE_VERDICT_REASONS,
  SEQUENCE_VERDICT_COMPLETE,
  SEQUENCE_VERDICT_FAILED,
  SEQUENCE_VERDICT_NOT_YET,
  judgeSequenceOf,
} from '../../.claude/scripts/sequences-slice/lib/package-verdict.mjs';
import { OBLIGATION_SOURCES } from '../../.claude/scripts/sequences-slice/lib/obligation.mjs';
import { obligationSourceOf } from '../../.claude/scripts/sequences-slice/lib/view.mjs';

/** The material of a package the distribution reached and whose ledger accounts for it. */
// [::TICKET::] PX-269 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-269 --for-spec --no-implementation-order`.
function aCarriedPackage(overrides = {}) {
  return {
    view: { packageId: 'pkg-0001', obligationSource: OBLIGATION_SOURCES[0], obligationUnits: [{ unitId: 'ctr-boundary-001', relation: 'carries' }] },
    readError: null,
    unitIds: ['ctr-boundary-001'],
    withoutLedger: false,
    ledgerRefusedReason: null,
    unaccountedUnitIds: [],
    unresolvedLocations: [],
    declarationDidNotBind: false,
    ...overrides,
  };
}

/** The reasons, split by the state each one settles. */
const NOT_YET_REASONS = Object.freeze(['no-view', 'view-predates-the-carriage', 'nothing-declared']);
const FAILED_REASONS = Object.freeze([
  'unreadable-view',
  'declaration-did-not-bind',
  'ledger-refused',
  'without-ledger',
  'unaccounted-unit',
  'unresolved-location',
]);

test('C002 postcondition: the three limbs all hold, so the package is complete', () => {
  assert.deepEqual(judgeSequenceOf(aCarriedPackage()), { state: SEQUENCE_VERDICT_COMPLETE, reason: null });
});

test('C002 postcondition: each limb alone is enough to fail the package, and each names its own reason', () => {
  const failures = [
    ['withoutLedger', true, 'without-ledger'],
    ['unaccountedUnitIds', ['ctr-boundary-001'], 'unaccounted-unit'],
    ['unresolvedLocations', ['9.9'], 'unresolved-location'],
    ['ledgerRefusedReason', 'the Distribution ledger header must be exactly [Unit, Kind, Owner, RFC location, Ground] in order', 'ledger-refused'],
  ];
  for (const [limb, value, reason] of failures) {
    assert.deepEqual(judgeSequenceOf(aCarriedPackage({ [limb]: value })), { state: SEQUENCE_VERDICT_FAILED, reason }, limb);
  }
});

test('C002 boundary: one unit is enough, and a wide view is judged by the same limbs rather than by its size', () => {
  const one = judgeSequenceOf(aCarriedPackage({ unitIds: ['ctr-boundary-001'] }));
  assert.equal(one.state, SEQUENCE_VERDICT_COMPLETE);

  const wide = Array.from({ length: 92 }, (unused, index) => `ctr-boundary-${index}`);
  assert.equal(judgeSequenceOf(aCarriedPackage({ unitIds: wide })).state, SEQUENCE_VERDICT_COMPLETE);
  assert.deepEqual(
    judgeSequenceOf(aCarriedPackage({ unitIds: wide, unaccountedUnitIds: [wide[91]] })),
    { state: SEQUENCE_VERDICT_FAILED, reason: 'unaccounted-unit' },
  );
});

test('C002 invariant: a package the allocation declares nothing for is still complete when the carries relation reaches it', () => {
  // ~/shyme/gaia in one case: declared_interfaces is absent and no seed carries a serves fence, so
  // every package reads undeclared. A pass phrased over the source would leave all 29 unjudged;
  // the pass is phrased over the units carried, and 84 boundaries reach all 29 of them.
  const carriedOnly = aCarriedPackage({ view: { packageId: 'pkg-0001', obligationSource: OBLIGATION_SOURCES[1], obligationUnits: [{ unitId: 'ctr-boundary-001', relation: 'carries' }] } });
  assert.equal(obligationSourceOf(carriedOnly.view), OBLIGATION_SOURCES[1]);
  assert.deepEqual(judgeSequenceOf(carriedOnly), { state: SEQUENCE_VERDICT_COMPLETE, reason: null });
});

test('C004 postcondition: a directory the distribution never reached is not-yet, and says which way', () => {
  const cases = [
    [aCarriedPackage({ view: null, unitIds: [] }), 'no-view'],
    [aCarriedPackage({ view: { packageId: 'pkg-0001', ownedOperationUnits: [{ unitId: 'op-0001' }] } }), 'view-predates-the-carriage'],
    [aCarriedPackage({ view: { packageId: 'pkg-0001', obligationSource: OBLIGATION_SOURCES[1], obligationUnits: [] }, unitIds: [] }), 'nothing-declared'],
  ];
  for (const [material, reason] of cases) {
    assert.deepEqual(judgeSequenceOf(material), { state: SEQUENCE_VERDICT_NOT_YET, reason }, reason);
  }
});

test('C004 boundary: a pre-carriage view is not-yet whatever it carries, because its units answer a different question', () => {
  const preCarriage = aCarriedPackage({
    view: { packageId: 'pkg-0001', ownedOperationUnits: [{ unitId: 'op-0001' }, { unitId: 'op-0002' }], ownedSequenceUnits: [{ unitId: 'seq-0001' }] },
    unitIds: ['op-0001', 'op-0002', 'seq-0001'],
    withoutLedger: false,
  });
  assert.deepEqual(judgeSequenceOf(preCarriage), { state: SEQUENCE_VERDICT_NOT_YET, reason: 'view-predates-the-carriage' });
});

test('C004 invariant: a document that cannot be read is failed and never not-yet', () => {
  const broken = judgeSequenceOf(aCarriedPackage({ view: null, readError: 'Unexpected end of JSON input', unitIds: [] }));
  assert.deepEqual(broken, { state: SEQUENCE_VERDICT_FAILED, reason: 'unreadable-view' });
  assert.notEqual(broken.state, SEQUENCE_VERDICT_NOT_YET);
});

test('C003 boundary: a view that declares obligations and carries none is a wiring defect, not an unmade decision', () => {
  const declaredAndEmpty = aCarriedPackage({
    view: { packageId: 'pkg-0001', obligationSource: OBLIGATION_SOURCES[0], obligationUnits: [] },
    unitIds: [],
    declarationDidNotBind: true,
  });
  assert.deepEqual(judgeSequenceOf(declaredAndEmpty), { state: SEQUENCE_VERDICT_FAILED, reason: 'declaration-did-not-bind' });
  // The same empty view with nothing declared is the other state: one is a defect, the other is a
  // decision the workspace has not made yet, and a single state for both would name one repair
  // for two different pieces of work.
  const undeclaredAndEmpty = { ...declaredAndEmpty, declarationDidNotBind: false };
  assert.deepEqual(judgeSequenceOf(undeclaredAndEmpty), { state: SEQUENCE_VERDICT_NOT_YET, reason: 'nothing-declared' });
});

test('C001 invariant: the three states are exclusive, and every reason belongs to exactly one of them', () => {
  assert.deepEqual([...PACKAGE_VERDICT_REASONS].sort(), [...NOT_YET_REASONS, ...FAILED_REASONS].sort());
  assert.equal(PACKAGE_VERDICT_REASONS.length, new Set(PACKAGE_VERDICT_REASONS).size, 'a reason listed twice would be two names for one state');
  assert.equal(Object.isFrozen(PACKAGE_VERDICT_REASONS), true);

  const states = new Set([SEQUENCE_VERDICT_COMPLETE, SEQUENCE_VERDICT_FAILED, SEQUENCE_VERDICT_NOT_YET]);
  assert.equal(states.size, 3);
  assert.equal(states.has(null), false);
  assert.equal(states.has(undefined), false);
});

test('C005 invariant: the judgement answers for a ledger it is handed and never reads one itself', () => {
  // Every limb is a value another reader produced, so a package whose ledger is momentarily
  // unreadable is answered rather than thrown, and the caller keeps the only filesystem access.
  const answered = judgeSequenceOf(aCarriedPackage({ view: undefined, readError: 'EACCES: permission denied' }));
  assert.equal(answered.state, SEQUENCE_VERDICT_FAILED);
  const noArguments = judgeSequenceOf({});
  assert.equal([SEQUENCE_VERDICT_COMPLETE, SEQUENCE_VERDICT_FAILED, SEQUENCE_VERDICT_NOT_YET].includes(noArguments.state), true);
});
