// @verifies C004
// @verifies C005
// @verifies C006
// [::TICKET::] P26-4, P26-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P26-4|P26-5) --for-spec --no-implementation-order`.
/**
 * The readings file as a file: how it is read, what an id is a function of, and what an
 * operator is told when it is refused.
 *
 * P26-5 redefined the file's shape — one flat list of entries became `readings` plus
 * `declined`, because completeness is a property of the package x item matrix and a flat
 * list cannot express a cell that was deliberately left out. The rules this file asserts
 * are the ones P26-4 established and P26-5 kept: an unresolvable basis is refused, a
 * measurement may not be re-opened, and an id is a function of what the reading says so a
 * re-run reproduces it. The matrix itself is proved in `design-semantics-matrix.test.mjs`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  DESIGN_CLAIM_ID_PREFIX,
  READINGS_FILE_KEY,
  DECLINED_FILE_KEY,
  designClaimId,
  readSemanticsFile,
  renderSemanticsAdvice,
  renderSemanticsVerdict,
  summariseCoverage,
  validateDesignSemantics,
} from '../../../.claude/scripts/workspacify-reverse/lib/design-semantics.mjs';
import { SEMANTICS_ITEMS } from '../../../.claude/scripts/workspacify-reverse/lib/design-semantics-schema.mjs';
import { createSyntheticTree } from '../helpers/scratch.mjs';

const PACKAGES = Object.freeze(['src/api']);

/** The measured claims an authored reading is allowed to infer from. */
const MEASURED = Object.freeze([
  {
    claim_id: 'clm-account-boundary_crossing-5',
    claim_type: 'observed',
    scope: 'src/api',
    statement: 'src consumes src/api through the reference at src/account.rs:5',
    falsification: 'remove the reference at src/account.rs:5 and observe whether the consumer still resolves',
    evidence: [{ source_span: { file: 'src/account.rs', line: 5 }, evidence_mode: 'source_static' }],
    basis: [],
  },
  {
    claim_id: 'clm-account-invariant-17',
    claim_type: 'inferred',
    scope: 'src/api',
    statement: 'the condition asserted at src/account.rs:17 holds',
    falsification: 'mutate the asserted condition at src/account.rs:17 and observe whether any test fails',
    evidence: [{ source_span: { file: 'src/account.rs', line: 17 }, evidence_mode: 'source_static' }],
    basis: ['the assertion at src/account.rs:17 exists in the text'],
  },
]);

/** One sound reading, the shape the whole file is judged by. */
// [::TICKET::] P26-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-5 --for-spec --no-implementation-order`.
function soundReading(overrides = {}) {
  return {
    scope: 'src/api',
    item: 'identity',
    statement: 'src/api owns the request lifecycle, so a caller outside it never sees a half-built request',
    falsification: 'publish a request from src/account.rs:9 and observe whether a consumer can read it mid-construction',
    basis: [MEASURED[0].claim_id],
    ...overrides,
  };
}

/** Every other cell of the single package, declined, so only the reading under test varies. */
// [::TICKET::] P26-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-5 --for-spec --no-implementation-order`.
function declinesFor(exceptItem) {
  return SEMANTICS_ITEMS
    .filter((entry) => entry.key !== exceptItem)
    .map((entry) => ({ scope: 'src/api', item: entry.key, reason: `this package states no ${entry.key} beyond the measurement` }));
}

/** A file whose one reading is the entry handed over, and whose other cells are declined. */
// [::TICKET::] P26-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-5 --for-spec --no-implementation-order`.
function fileWith(reading) {
  return { readings: [reading], declined: declinesFor(reading.item) };
}

const validate = (authored) => validateDesignSemantics({ authored, claims: MEASURED, packages: PACKAGES });

test('C004 postcondition: a reading whose basis resolves becomes one inferred claim', () => {
  const { claims: admitted, findings } = validate(fileWith(soundReading()));

  assert.deepEqual(findings, []);
  assert.equal(admitted.length, 1, 'the declined cells admit nothing, so one reading is one claim');

  const [claim] = admitted;
  assert.match(claim.claim_id, new RegExp(`^${DESIGN_CLAIM_ID_PREFIX}[0-9a-f]{12}$`));
  assert.equal(claim.claim_type, 'inferred', 'an authored claim is an inference, never a measurement');
  assert.equal(claim.scope, 'src/api');
  assert.equal(claim.semantics_item, 'identity', 'and it says which item it answers');
  assert.deepEqual(claim.basis, [MEASURED[0].claim_id]);
  assert.equal(claim.evidence.length, 0, 'an authored claim cites claims, not source spans it did not read');
});

test('C004 invariant: the id is a function of the cell and the statement, so a re-run reproduces it', () => {
  const first = validate(fileWith(soundReading())).claims[0].claim_id;
  const again = validate(fileWith(soundReading())).claims[0].claim_id;
  const otherCell = validate(fileWith(soundReading({ item: 'origin' }))).claims[0].claim_id;

  assert.equal(first, again, 'the same cell and the same wording is the same id');
  assert.notEqual(first, otherCell, 'and a different cell is a different id, so two packages may word it alike');
  assert.equal(designClaimId({ scope: 'src/api', item: 'identity', statement: 'x' }).startsWith(DESIGN_CLAIM_ID_PREFIX), true);
});

test('C004 boundary: an unresolvable basis is refused, and the declined cells are untouched by it', () => {
  const { claims: admitted, findings } = validate(fileWith(soundReading({ basis: ['clm-not-a-claim-1'] })));

  assert.equal(admitted, null, 'a refused file admits nothing, not even the cells that were sound');
  assert.match(findings.join(' '), /clm-not-a-claim-1/, 'the unresolvable id is named');
});

test('C005 invariant: a reading may not re-open a measurement', () => {
  for (const [label, overrides] of [
    ['an id that a measured claim already carries', { claim_id: MEASURED[0].claim_id }],
    ['a claim_type the author chose', { claim_type: 'observed' }],
    ['evidence the author supplied for a claim nobody measured', { evidence: [{ source_span: { file: 'x.rs', line: 1 } }] }],
  ]) {
    const { claims: admitted, findings } = validate(fileWith(soundReading(overrides)));

    assert.equal(admitted, null, `${label} is refused`);
    assert.match(findings.join(' '), /re-open|measured/i, `${label} says which rule it broke`);
  }
});

test('C005 invariant: no measured claim is returned by this module at all', () => {
  const { claims: admitted } = validate(fileWith(soundReading()));
  const measuredIds = new Set(MEASURED.map((claim) => claim.claim_id));

  assert.deepEqual(
    admitted.filter((claim) => measuredIds.has(claim.claim_id)),
    [],
    'the merge adds authored claims and never returns a measured one, so none can be replaced',
  );
});

test('C006 postcondition: the coverage summary counts written and declined per package', () => {
  const coverage = summariseCoverage({ authored: fileWith(soundReading()), packages: PACKAGES });

  assert.equal(coverage.packages, 1);
  assert.equal(coverage.cells, SEMANTICS_ITEMS.length, 'the matrix is one row of 21 cells');
  assert.equal(coverage.written, 1);
  assert.equal(coverage.declined, SEMANTICS_ITEMS.length - 1);
  assert.deepEqual(coverage.rows, [{ scope: 'src/api', written: 1, declined: SEMANTICS_ITEMS.length - 1 }]);
  assert.equal(coverage.declinedCells.length, SEMANTICS_ITEMS.length - 1);
  assert.equal(coverage.declinedCells[0].scope, 'src/api');
});

test('C004 error surface: the advice names the file, the cells and what to do', () => {
  const advice = renderSemanticsAdvice(['src/api — identity: names no basis'], { path: '/tmp/readings.json' });

  assert.match(advice, /\/tmp\/readings\.json/, 'the file it read is named');
  assert.match(advice, /src\/api — identity/, 'the cell is named');
  assert.match(advice, /What to do:/, 'and so is the act that fixes it');
});

test('C004: the verdict counts what was admitted', () => {
  assert.match(renderSemanticsVerdict({ count: 1, path: '/tmp/readings.json' }), /1 design reading was admitted/);
  assert.match(renderSemanticsVerdict({ count: 7, path: '/tmp/readings.json' }), /7 design readings were admitted/);
});

test('C004: a file that cannot be read is reported rather than thrown', () => {
  const { entries, findings } = readSemanticsFile('/nonexistent/readings.json');

  assert.equal(entries, null);
  assert.equal(findings.length, 1);
  assert.match(findings[0], /does not exist/);
});

test('C004: a file that is not the declared shape is refused rather than guessed at', () => {
  const tree = createSyntheticTree({});
  try {
    for (const [label, body] of [
      ['a bare array', [soundReading()]],
      ['a legacy flat list', { semantics: [soundReading()] }],
      ['an unknown key', { readings: [soundReading()], extra: 1 }],
      ['no cells at all', { readings: [], declined: [] }],
    ]) {
      const path = join(tree.root, 'readings.json');
      writeFileSync(path, `${JSON.stringify(body)}\n`, 'utf8');
      const { entries } = readSemanticsFile(path);
      assert.equal(entries, null, `${label} is refused`);
    }

    const sound = join(tree.root, 'sound.json');
    writeFileSync(sound, `${JSON.stringify(fileWith(soundReading()))}\n`, 'utf8');
    const { entries, findings } = readSemanticsFile(sound);
    assert.notEqual(entries, null, 'and the declared shape is read');
    assert.deepEqual(findings, []);
    assert.equal(READINGS_FILE_KEY in entries, true);
    assert.equal(DECLINED_FILE_KEY in entries, true);
  } finally {
    tree.dispose();
  }
});
