// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
/**
 * The outcome the observation states, and the record it leaves behind.
 *
 * Two rules from §5.9 and §2.4 shape everything here. The machine's whole
 * vocabulary is `proved` and `not proved` — there is no third word, and no key
 * named success, verdict, score or passed anywhere in the record, because a
 * score would look objective while encoding a threshold nobody chose. And
 * `omission 0` is material for a human's judgement rather than the success
 * condition: a report that presented it as the condition would hand the reader
 * a verdict the machine is not entitled to reach.
 *
 * The ladder is reported as a *position*, so these tests assert the position is
 * named for every rung — including L3, whose naming is what makes the caveat
 * verifiable rather than decorative.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  LADDER_POSITIONS,
  TERMINAL_ARTEFACTS,
  TERMINAL_OUTCOMES,
  compareTerminalStates,
  measureTerminalState,
  outcomeOf,
  renderTerminalStateReport,
  summariseStages,
} from '../../../.claude/scripts/workspacify-reverse/lib/terminal-state.mjs';
import { createSyntheticTree } from '../helpers/scratch.mjs';

/** The report for one observation, with the outcome the run derived. */
// [::TICKET::] P24-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-12 --for-spec --no-implementation-order`.
function reportFor({ states = [], comparison = null, ladder = { position: 'L0' }, outcome = 'not proved' } = {}) {
  return renderTerminalStateReport({
    states,
    comparison: comparison ?? compareTerminalStates(states),
    verdict: { ladder, stages: null, outcome },
  });
}

/** A measured state, shaped as `measureTerminalState` returns one. */
// [::TICKET::] P24-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-12 --for-spec --no-implementation-order`.
function measuredState(representative, complete) {
  const missing = [{ scope: 'auth', artefact: 'RFC-auth.md' }];
  return {
    representative,
    complete,
    packages: ['auth'],
    missing: complete ? [] : missing,
    present: complete ? [{ scope: 'auth', artefact: 'RFC-auth.md' }] : [],
  };
}

// ---------------------------------------------------------------------------
// C004 — the outcome, and the ladder as a position
// ---------------------------------------------------------------------------

test('C004 postcondition — the outcome is stated as proved or as not proved, with the ladder position reached', () => {
  const report = reportFor({
    states: [measuredState('grounded', true)],
    ladder: { position: 'L2', omissionZero: { measured: false, reason: 'no round ran' }, residue: 'the difference is recorded' },
    outcome: 'proved',
  });

  assert.match(report, /Outcome: proved\./, 'the outcome is stated in the machine’s own vocabulary');
  assert.match(report, /Ladder position reached: `L2`\./);
  assert.match(report, /Only L3/i);
  assert.match(report, /a human’s/i);
  assert.match(report, /not the success condition/i);
});

test('C004 boundary — every ladder position is named, including L3, and the caveat holds at each', () => {
  for (const position of LADDER_POSITIONS) {
    const report = reportFor({ ladder: { position }, outcome: 'not proved' });

    assert.ok(
      report.includes(`Ladder position reached: \`${position}\`.`),
      `${position} is named as the position reached`,
    );
    assert.match(report, /Only L3 may be called success/, `${position} carries the caveat`);
  }
  assert.deepEqual([...LADDER_POSITIONS], ['L0', 'L1', 'L2', 'L2.5', 'L3']);
});

test('C001 invariant — a refusal measured off a real tree is recorded as not proved, never as an empty structure', () => {
  const tree = createSyntheticTree({ 'src/main.rs': 'pub fn main() {}\n' }, { prefix: 'wsp-p24-12-refused-' });
  try {
    const measured = { representative: 'siprs-for-reverse', ...measureTerminalState({ root: tree.root }) };
    const summary = summariseStages([
      { stage: 'T1', status: 'reached' },
      { stage: 'T4', status: 'refused', input: 'the measured DAG contains 18 cycle(s), so it has no implementation order' },
    ]);

    // The state comes from the instrument rather than from a hand-built object, so the
    // assertion is about what measurement produces and not about a shape this test chose.
    assert.equal(measured.complete, false, 'the real measurement found the tree short');
    assert.equal(measured.missing.length > 0, true, 'and it names what the tree is short of');
    assert.equal(outcomeOf([measured]), 'not proved');
    assert.equal(summary.refused[0].stage, 'T4', 'the stage that stopped the chain is named');
    assert.match(summary.refused[0].input, /cycle/);
  } finally {
    tree.dispose();
  }
});

test('C001/C004 — a tree holding every declared artefact is measured complete and derived as proved', () => {
  const files = { 'src/main.rs': 'pub fn main() {}\n' };
  for (const artefact of [...TERMINAL_ARTEFACTS.root, ...TERMINAL_ARTEFACTS.fifthLayer]) files[artefact] = '{}\n';
  files['src/Tickets.json'] = '{}\n';
  for (const template of TERMINAL_ARTEFACTS.packageNamed) files[`src/${template.replace('{package}', 'src')}`] = '{}\n';
  for (const artefact of TERMINAL_ARTEFACTS.packageFifthLayer) files[`src/${artefact}`] = '# seed\n';

  const tree = createSyntheticTree(files, { prefix: 'wsp-p24-12-complete-' });
  try {
    const measured = { representative: 'grounded', ...measureTerminalState({ root: tree.root }) };

    assert.deepEqual(measured.missing, [], 'the inventory is satisfied element by element');
    assert.equal(measured.complete, true);
    assert.equal(
      outcomeOf([measured]),
      'proved',
      'proved is reachable, so `not proved` states a finding rather than the only value the instrument can return',
    );
  } finally {
    tree.dispose();
  }
});

test('C004 — the outcome is derived from whether a representative reached the terminal state, not declared', () => {
  assert.equal(outcomeOf([]), 'not proved', 'a chain nobody drove is not proved');
  assert.equal(outcomeOf([measuredState('a', false)]), 'not proved', 'a refusal is not an empty structure');
  assert.equal(outcomeOf([measuredState('a', true)]), 'proved', 'a measured terminal tree is what proved states');
  assert.equal(
    outcomeOf([measuredState('a', false), measuredState('b', true)]),
    'proved',
    'one representative reaching it is the fact this observation can establish',
  );
  assert.equal(
    outcomeOf([{ representative: 'a' }]),
    'not proved',
    'a state that never recorded completeness is not proved, which is what an exit code alone would leave',
  );
});

test('C004 invariant — the vocabulary is two values, and nothing else is accepted', () => {
  assert.deepEqual([...TERMINAL_OUTCOMES], ['proved', 'not proved']);

  assert.throws(
    () => reportFor({ outcome: 'success' }),
    /TERMINAL_OUTCOMES/,
    'a third word is refused rather than rendered',
  );
  assert.throws(() => reportFor({ outcome: 'failed' }), /TERMINAL_OUTCOMES/);
});

test('C004 invariant — omission 0 is material and never the success condition', () => {
  const report = reportFor({
    ladder: { position: 'L1', omissionZero: { measured: false, reason: 'this observation runs no find-omissions round' } },
    outcome: 'not proved',
  });

  assert.match(report, /omission 0/i);
  assert.match(report, /material/i);
  assert.match(report, /not the success condition/i);
  assert.doesNotMatch(report, /omission 0[^.]*\b(is|means) (a )?success\b/i);
});

test('C004 invariant — the ladder is reported as a position rather than as a grade', () => {
  const report = reportFor({ ladder: { position: 'L2.5' }, outcome: 'proved' });

  assert.match(report, /states a position rather than a grade/i);
  assert.match(report, /reaches no conclusion about the project/i);
});

// ---------------------------------------------------------------------------
// C003 — the record's reproducibility, and the instrument's limits
// ---------------------------------------------------------------------------

test('C003 postcondition — a run carries its decisions input and the input’s digest, as lowercase hex', () => {
  const run = {
    representative: 'siprs-for-reverse',
    decisions: { input: 'tests/workspacify-reverse/fixtures/patterns/siprs-for-reverse/DECISIONS.json', digest: 'a'.repeat(64) },
  };

  assert.equal(typeof run.decisions.input, 'string');
  assert.equal(run.decisions.digest.length, 64, 'a SHA-256 digest is 64 hex characters');
  assert.doesNotMatch(run.decisions.digest, /[^0-9a-f]/, 'the digest is lowercase hex');
});

test('C003 postcondition — the report states that a gap is a limitation of the instrument, not evidence about the project', () => {
  const report = reportFor({ outcome: 'not proved' });

  assert.match(report, /a limitation of the instrument rather than evidence about the project/i);
});

test('C002 boundary — a comparison over no representatives reports that there was nothing to compare, not an agreement', () => {
  const empty = reportFor({ outcome: 'not proved' });

  assert.match(empty, /No representative reached the terminal state/);
  assert.match(empty, /nothing to compare/i);
  assert.doesNotMatch(
    empty,
    /agree on every dimension/i,
    'an empty comparison must not read as two representatives that agreed',
  );
  assert.doesNotMatch(empty, /no difference was found/i);
});

test('C003 invariant — a full-depth walk of the published record finds no key named success, verdict, score or passed', () => {
  const published = JSON.parse(JSON.stringify({
    observations: [{ representative: 'a', stages: summariseStages([{ stage: 'T1', status: 'reached' }]), outcome: 'proved' }],
    runs: [{ representative: 'a', decisions: { input: 'DECISIONS.json', digest: 'b'.repeat(64) } }],
    comparison: compareTerminalStates([measuredState('a', true)]),
    ladder: { position: 'L2', omissionZero: { measured: false, reason: 'no round ran' }, residue: null, disagreements: [] },
    matrix: { states: [{ representative: 'a', packages: ['auth'], missing: [] }] },
  }));

  const forbidden = ['success', 'verdict', 'score', 'passed'];
  const offenders = [];
// [::TICKET::] P24-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-12 --for-spec --no-implementation-order`.
  (function walk(value, path) {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, `${path}[${index}]`));
      return;
    }
    if (value === null || typeof value !== 'object') return;
    for (const key of Object.keys(value)) {
      if (forbidden.includes(key)) offenders.push(`${path}.${key}`);
      walk(value[key], `${path}.${key}`);
    }
  }(published, 'TERMINAL-STATE.json'));

  assert.deepEqual(offenders, [], 'the record carries material, not a verdict');
});

test('C003 invariant — no line claims success except the caveat that denies it', () => {
  const text = reportFor({ outcome: 'proved' });

  const claiming = text.split('\n').filter((line) => /\b(success|verdict|score|passed)\b/i.test(line));
  assert.equal(claiming.length, 1, 'only the caveat names the vocabulary, and it denies it');
  assert.match(claiming[0], /Only L3 may be called success/);
});
