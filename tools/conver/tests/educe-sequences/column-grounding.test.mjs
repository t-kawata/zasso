// [::TICKET::] PX-300 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-300 --for-spec --no-implementation-order`.
// C005: an active operation's pinned column is present or grounded per column.
//
// The rail checked the declared columns but never an operation value. 112 active
// columns reached the gaia artifact empty and ungrounded, and every gate stayed
// green because no check read the row.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { CHECKS, checkAll, pinnedColumnGroundingProblems } from '../../.claude/scripts/educe-sequences/rail/engine.mjs';
import { readSpecification } from '../../.claude/scripts/educe-sequences/rail/load.mjs';

const COLUMN = 'required_proof_classes';
const SPEC_PATH = new URL('./fixtures/spec/ledger.md', import.meta.url).pathname;
const GOLDEN_PATH = new URL('./fixtures/spec/ledger-sequences.json', import.meta.url).pathname;
const specLines = ['the proof classes are designer supplied'];
const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));

// [::TICKET::] PX-300 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-300 --for-spec --no-implementation-order`.
function artifact(operation) {
  return {
    pins: { columns: [{ name: COLUMN, decidedBy: 'literalInLine' }] },
    operations: [operation],
  };
}

// [::TICKET::] PX-300 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-300 --for-spec --no-implementation-order`.
function grounded(overrides = {}) {
  return {
    classification: 'designer_supplied',
    line: 1,
    quote: 'designer supplied',
    ...overrides,
  };
}

test('C005 a non-empty pinned column passes', () => {
  assert.deepEqual(
    pinnedColumnGroundingProblems(artifact({ id: 'OpA', disposition: 'active', [COLUMN]: ['signature'] }), specLines),
    [],
  );
});

test('C005 an empty pinned column with complete per-column grounding passes', () => {
  assert.deepEqual(
    pinnedColumnGroundingProblems(artifact({
      id: 'OpB',
      disposition: 'active',
      [COLUMN]: [],
      grounding: { properties: { [COLUMN]: grounded() } },
    }), specLines),
    [],
  );
});

test('C005 an empty pinned column with no column grounding is refused by subject', () => {
  const problems = pinnedColumnGroundingProblems(
    artifact({ id: 'OpA', disposition: 'active', [COLUMN]: [] }),
    specLines,
  );
  assert.deepEqual(problems.map((entry) => entry.subject), [`OpA:${COLUMN}`]);
  assert.match(problems[0].reason, /no column grounding/);
});

test('C005 a grounding missing classification, line-or-citation or quote is refused', () => {
  const cases = [
    { classification: '', reason: /classification/ },
    { line: undefined, citation: undefined, reason: /line and no citation/ },
    { quote: '', reason: /quote/ },
  ];
  for (const { reason, ...overrides } of cases) {
    const problems = pinnedColumnGroundingProblems(artifact({
      id: 'OpB',
      disposition: 'active',
      [COLUMN]: [],
      grounding: { properties: { [COLUMN]: grounded(overrides) } },
    }), specLines);
    assert.equal(problems.length, 1, JSON.stringify(overrides));
    assert.match(problems[0].reason, reason);
  }
});

test('C005 a grounding quote that does not occur on the cited line is refused', () => {
  const problems = pinnedColumnGroundingProblems(artifact({
    id: 'OpC',
    disposition: 'active',
    [COLUMN]: [],
    grounding: { properties: { [COLUMN]: grounded({ quote: 'not on this line' }) } },
  }), specLines);
  assert.deepEqual(problems.map((entry) => entry.subject), [`OpC:${COLUMN}`]);
  assert.match(problems[0].reason, /does not occur on line 1/);
});

test('C005 an excluded operation owes no pinned-column value', () => {
  assert.deepEqual(
    pinnedColumnGroundingProblems(artifact({ id: 'OpD', disposition: 'excluded', [COLUMN]: [] }), specLines),
    [],
  );
});

test('C005 the check is declared and the declared set runs every member', () => {
  const check = CHECKS.find((candidate) => candidate.id === 'every-pinned-column-is-present-or-grounded');
  assert.notEqual(check, undefined);
  assert.equal(typeof check.refuses, 'string');

  const summary = checkAll({ specLines: readSpecification(SPEC_PATH).lines, artifact: golden });
  assert.equal(summary.verdicts.length, 0, JSON.stringify(summary.verdicts));
  assert.equal(summary.summary.checksRun, CHECKS.length);
});
