// @verifies C002
// @verifies C003
// @verifies C004
// @verifies C005
// [::TICKET::] P26-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-5 --for-spec --no-implementation-order`.
/**
 * The matrix, and the four ways a file fails to close it.
 *
 * The unit is the package, so completeness is a property of `packages x items` and not
 * of the file: a file that says a great deal about one package and nothing about the
 * next is not a smaller semantics, it is an incomplete one. Closure is therefore
 * checked cell by cell, and a cell is closed by a reading or by a decline that gives a
 * reason a reader can weigh.
 *
 * The other three rules keep the closure from being satisfied mechanically. A reading
 * that repeats the measurement is not an interpretation; the same sentence cannot
 * answer two cells; and the items whose subject is a counterpart have to name one.
 * None of these judges whether a reading is *good* — that is the author's and the
 * reviewer's, and the command file says so — but together they remove the ways of
 * appearing complete without saying anything.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateDesignSemantics,
} from '../../../.claude/scripts/workspacify-reverse/lib/design-semantics.mjs';
import { SEMANTICS_ITEMS } from '../../../.claude/scripts/workspacify-reverse/lib/design-semantics-schema.mjs';

const PACKAGES = Object.freeze(['src/api', 'src/state']);

/** The measured claims the readings rest on: two crossings in src/api, one elsewhere. */
const MEASURED = Object.freeze([
  {
    claim_id: 'clm-login-boundary_crossing-1',
    claim_type: 'observed',
    scope: 'src/api',
    statement: 'src/api consumes src/model through the reference at src/api/login.rs:1',
    falsification: 'remove the reference at src/api/login.rs:1 and observe whether the consumer still resolves',
    evidence: [{ source_span: { file: 'src/api/login.rs', line: 1 }, evidence_mode: 'source_static' }],
    basis: [],
  },
  {
    claim_id: 'clm-login-boundary_crossing-2',
    claim_type: 'observed',
    scope: 'src/api',
    statement: 'src/api consumes src/state through the reference at src/api/login.rs:2',
    falsification: 'remove the reference at src/api/login.rs:2 and observe whether the consumer still resolves',
    evidence: [{ source_span: { file: 'src/api/login.rs', line: 2 }, evidence_mode: 'source_static' }],
    basis: [],
  },
  {
    claim_id: 'clm-mod-boundary_crossing-3',
    claim_type: 'observed',
    scope: 'src/state',
    statement: 'src/state consumes src/model through the reference at src/state/mod.rs:1',
    falsification: 'remove the reference at src/state/mod.rs:1 and observe whether the consumer still resolves',
    evidence: [{ source_span: { file: 'src/state/mod.rs', line: 1 }, evidence_mode: 'source_static' }],
    basis: [],
  },
]);

const MEASURED_IDS = MEASURED.map((claim) => claim.claim_id);

/** The crossings the run measured in one scope, which the boundary cell has to account for. */
// [::TICKET::] P26-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-5 --for-spec --no-implementation-order`.
function crossingsIn(scope) {
  return MEASURED.filter((claim) => claim.scope === scope && claim.claim_id.includes('boundary_crossing'))
    .map((claim) => claim.claim_id);
}

/**
 * One reading for a cell, phrased so it is not a restatement of any measurement.
 *
 * The basis is the scope's own crossings, because `boundary` is required to account for
 * every one of them and a fixture that gave every cell the same basis would be asserting
 * against a file no author would write.
 */
// [::TICKET::] P26-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-5 --for-spec --no-implementation-order`.
function reading(scope, item, overrides = {}) {
  return {
    scope,
    item,
    statement: `${scope} answers ${item} in the terms the code states it, which no measurement can state`,
    falsification: 'remove the condition at src/api/login.rs:4 and observe whether any test fails',
    basis: crossingsIn(scope).length > 0 ? crossingsIn(scope) : [MEASURED_IDS[0]],
    ...overrides,
  };
}

/** Every cell of every package, written. */
// [::TICKET::] P26-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-5 --for-spec --no-implementation-order`.
function closedReadings() {
  return PACKAGES.flatMap((scope) => SEMANTICS_ITEMS.map((entry) => reading(scope, entry.key)));
}

/** Every cell of every package, declined with a reason. */
// [::TICKET::] P26-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-5 --for-spec --no-implementation-order`.
function closedDeclines(reason = 'this package holds nothing to state here') {
  return PACKAGES.flatMap((scope) => SEMANTICS_ITEMS.map((entry) => ({ scope, item: entry.key, reason })));
}

const validate = (authored) => validateDesignSemantics({ authored, claims: MEASURED, packages: PACKAGES });

test('C002 precondition: the matrix is packages x SEMANTICS_ITEMS', () => {
  assert.equal(PACKAGES.length * SEMANTICS_ITEMS.length, closedReadings().length);
  assert.equal(closedReadings().length, 42, 'two packages, 21 items each');
});

test('C002 postcondition: a closed file is admitted and yields one claim per reading', () => {
  const { claims, findings } = validate({ readings: closedReadings(), declined: [] });

  assert.deepEqual(findings, []);
  assert.equal(claims.length, 42, 'every cell became a claim');
  assert.equal(new Set(claims.map((claim) => claim.claim_id)).size, 42, 'and each carries its own id');
});

test('C002 boundary: every cell declined is closed, and admits nothing', () => {
  const { claims, findings } = validate({ readings: [], declined: closedDeclines() });

  assert.deepEqual(findings, []);
  assert.deepEqual(claims, [], 'closed by decline, with no claim invented');
});

test('C002 error: a cell neither written nor declined is refused, naming the package and the item', () => {
  const readings = closedReadings().filter((entry) => !(entry.scope === 'src/state' && entry.item === 'concurrency'));
  const { claims, findings } = validate({ readings, declined: [] });

  assert.equal(claims, null, 'a file with one hole admits nothing');
  assert.match(findings.join(' '), /src\/state/, 'the package is named');
  assert.match(findings.join(' '), /concurrency/, 'and the item');
});

test('C002 error: a reading for a package the partition does not declare is refused', () => {
  const readings = [...closedReadings(), reading('src/absent', 'identity')];
  const { claims, findings } = validate({ readings, declined: [] });

  assert.equal(claims, null);
  assert.match(findings.join(' '), /src\/absent/, 'the orphan package is named');
});

test('C003 invariant: a refused file admits nothing, not even the cells that were sound', () => {
  const readings = [...closedReadings().slice(0, 41)].concat([]);
  const { claims, findings } = validate({ readings, declined: [] });

  assert.equal(claims, null, 'refusal is total');
  assert.ok(findings.length > 0, 'and says why');
});

test('C003 error: a decline must give a reason a reader can weigh', () => {
  for (const reason of ['', '   ', 'N/A', 'none', 'not applicable', 'see above']) {
    const declined = closedDeclines(reason);
    const { claims, findings } = validate({ readings: [], declined });

    assert.equal(claims, null, `${JSON.stringify(reason)} is not a reason`);
    assert.match(findings.join(' '), /reason/i, 'the field at fault is named');
  }
});

test('C003 error: a reading and a decline for the same cell is refused rather than resolved', () => {
  const readings = closedReadings();
  const declined = [{ scope: 'src/api', item: 'identity', reason: 'declared twice' }];
  const { claims, findings } = validate({ readings, declined });

  assert.equal(claims, null, 'a cell closed twice is a contradiction, not a preference');
  assert.match(findings.join(' '), /src\/api/, 'the cell is named');
});

test('C004 boundary: restatement is refused, paraphrase is not', () => {
  const restated = closedReadings();
  restated[0] = reading('src/api', 'identity', { statement: MEASURED[0].statement });
  assert.equal(validate({ readings: restated, declined: [] }).claims, null, 'a restatement is not a reading');

  const paraphrased = closedReadings();
  paraphrased[0] = reading('src/api', 'identity', {
    statement: 'src/api owns the request lifecycle end to end, so a caller never builds one itself',
  });
  assert.deepEqual(validate({ readings: paraphrased, declined: [] }).findings, [],
    'a floor on distinctness is not a judgement of quality');
});

test('C004 boundary: one sentence cannot answer two cells', () => {
  const shared = 'this package owns the request lifecycle and nothing else does';
  const readings = closedReadings();
  readings[0] = reading('src/api', 'identity', { statement: shared });
  readings[21] = reading('src/state', 'identity', { statement: shared });
  const { claims, findings } = validate({ readings, declined: [] });

  assert.equal(claims, null, 'the same wording in two cells is reuse');
  assert.match(findings.join(' '), /src\/api/);
  assert.match(findings.join(' '), /src\/state/);
});

test('C005: boundary accounts for every measured crossing in its own scope', () => {
  const crossings = MEASURED.filter((claim) => claim.scope === 'src/api' && claim.claim_id.includes('boundary_crossing'));
  assert.equal(crossings.length, 2, 'this scope crosses two boundaries');

  const complete = closedReadings();
  complete[PACKAGES.indexOf('src/api') * SEMANTICS_ITEMS.length + SEMANTICS_ITEMS.findIndex((entry) => entry.key === 'boundary')] =
    reading('src/api', 'boundary', { basis: crossings.map((claim) => claim.claim_id) });
  assert.deepEqual(validate({ readings: complete, declined: [] }).findings, [], 'naming both closes it');

  const partial = structuredClone(complete);
  partial[PACKAGES.indexOf('src/api') * SEMANTICS_ITEMS.length + SEMANTICS_ITEMS.findIndex((entry) => entry.key === 'boundary')] =
    reading('src/api', 'boundary', { basis: [crossings[0].claim_id] });
  const { claims, findings } = validate({ readings: partial, declined: [] });

  assert.equal(claims, null, 'a boundary that accounts for one of two crossings is not accounted for');
  assert.match(findings.join(' '), new RegExp(crossings[1].claim_id), 'the crossing left out is named');
});

test('C005: a naming item names a package, or says there is none', () => {
  const naming = SEMANTICS_ITEMS.filter((entry) => entry.checks.includes('names')).map((entry) => entry.key);
  assert.ok(naming.length >= 8, 'the schema declares the naming items');

  for (const key of naming) {
    const silent = closedReadings();
    silent[SEMANTICS_ITEMS.findIndex((entry) => entry.key === key)] =
      reading('src/api', key, { statement: 'this package is responsible for the request lifecycle' });
    assert.equal(validate({ readings: silent, declined: [] }).claims, null, `${key} may not omit its counterpart silently`);

    const named = closedReadings();
    named[SEMANTICS_ITEMS.findIndex((entry) => entry.key === key)] =
      reading('src/api', key, { statement: 'src/state owns the value and src/api reads it' });
    assert.deepEqual(validate({ readings: named, declined: [] }).findings, [], `${key} is satisfied by naming a package`);

    const none = closedReadings();
    none[SEMANTICS_ITEMS.findIndex((entry) => entry.key === key)] =
      reading('src/api', key, { statement: 'no consumer depends on this invariant' });
    assert.deepEqual(validate({ readings: none, declined: [] }).findings, [], `${key} is satisfied by stating that there is none`);
  }
});
