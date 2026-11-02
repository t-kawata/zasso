// PX-348 @verifies C004 C005 C006
// A narrative sequence's in-span steps follow the lines the specification states.
// The check is declared, counted, and refuses a decreasing pair by sequence and step id.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CHECKS,
  ENGINE_DECLARED_CHECK_COUNT,
  checkAll,
} from '../../.claude/scripts/educe-sequences/rail/engine.mjs';
import { readSpecification } from '../../.claude/scripts/educe-sequences/rail/load.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SPEC_PATH = join(PROJECT_ROOT, 'tests/educe-sequences/fixtures/spec/ledger.md');
const GOLDEN_PATH = join(PROJECT_ROOT, 'tests/educe-sequences/fixtures/spec/ledger-sequences.json');
const CHECK_ID = 'steps-are-in-line-order-within-their-entry';

const spec = readSpecification(SPEC_PATH);
const check = CHECKS.find((candidate) => candidate.id === CHECK_ID);

/** The golden artifact, read fresh so one test cannot mutate another's fixture. */
// [::TICKET::] PX-348 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-348 --for-spec --no-implementation-order`.
function golden() {
  return JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
}

/** The verdicts this check raises over an artifact. */
// [::TICKET::] PX-348 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-348 --for-spec --no-implementation-order`.
function verdictsOf(artifact) {
  return check.run({ artifact, specLines: spec.lines });
}

// [::TICKET::] PX-348 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-348 --for-spec --no-implementation-order`.
test('C005 the check is declared exactly once and the declared count is explicit', () => {
  assert.equal(CHECKS.filter((candidate) => candidate.id === CHECK_ID).length, 1);
  assert.equal(ENGINE_DECLARED_CHECK_COUNT, 32);
});

// [::TICKET::] PX-348 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-348 --for-spec --no-implementation-order`.
test('C004 decreasing in-span lines are refused with the sequence, step ids and both lines', () => {
  const artifact = {
    sequences: [{ id: 'S', cites: 0, firstLine: 1, lastLine: 20 }],
    steps: [
      { id: 's1', sequence: 'S', line: 12 },
      { id: 's2', sequence: 'S', line: 3 },
    ],
  };

  const verdicts = verdictsOf(artifact);

  assert.equal(verdicts.length, 1);
  assert.equal(verdicts[0].check, CHECK_ID);
  assert.equal(verdicts[0].subject, 'S/s1');
  assert.match(verdicts[0].reason, /s1/);
  assert.match(verdicts[0].reason, /s2/);
  assert.match(verdicts[0].reason, /12/);
  assert.match(verdicts[0].reason, /3/);
});

// [::TICKET::] PX-348 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-348 --for-spec --no-implementation-order`.
test('C004 non-decreasing lines and equal lines pass', () => {
  const artifact = {
    sequences: [{ id: 'S', cites: 0, firstLine: 1, lastLine: 20 }],
    steps: [
      { id: 's1', sequence: 'S', line: 3 },
      { id: 's2', sequence: 'S', line: 3 },
      { id: 's3', sequence: 'S', line: 12 },
    ],
  };

  assert.deepEqual(verdictsOf(artifact), []);
});

// [::TICKET::] PX-348 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-348 --for-spec --no-implementation-order`.
test('C004 cited, missing and non-integer spans, non-integer lines and out-of-span steps are skipped', () => {
  const base = {
    sequences: [{ id: 'S', cites: 0, firstLine: 1, lastLine: 20 }],
    steps: [
      { id: 's1', sequence: 'S', line: 12 },
      { id: 's2', sequence: 'S', line: 3 },
    ],
  };

  assert.deepEqual(check.run({ artifact: { ...base, sequences: [{ ...base.sequences[0], cites: 1 }] }, specLines: [] }), []);
  assert.deepEqual(check.run({ artifact: { ...base, sequences: [{ ...base.sequences[0], cites: undefined }] }, specLines: [] }), []);
  assert.deepEqual(check.run({ artifact: { ...base, sequences: [{ ...base.sequences[0], firstLine: '1' }] }, specLines: [] }), []);
  assert.deepEqual(check.run({ artifact: { ...base, steps: [{ id: 's1', sequence: 'S', line: '12' }, { id: 's2', sequence: 'S', line: 3 }] }, specLines: [] }), []);
  assert.deepEqual(check.run({ artifact: { ...base, steps: [{ id: 's1', sequence: 'S', line: 21 }, { id: 's2', sequence: 'S', line: 3 }] }, specLines: [] }), []);
});

// [::TICKET::] PX-348 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-348 --for-spec --no-implementation-order`.
test('C004 the check runs inside checkAll and names the first inversion', () => {
  const artifact = golden();
  const admission = artifact.sequences.find((sequence) => sequence.id === 'admission');
  admission.cites = 0;
  artifact.steps.find((step) => step.id === 'admission-1').line = 25;
  artifact.steps.find((step) => step.id === 'admission-2').line = 24;

  const { verdicts } = checkAll({ specLines: spec.lines, artifact });

  assert.ok(
    verdicts.some((verdict) => verdict.check === CHECK_ID && verdict.subject === 'admission/admission-1'),
    JSON.stringify(verdicts),
  );
});

// [::TICKET::] PX-348 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-348 --for-spec --no-implementation-order`.
test('C005 a clean artifact runs every declared check', () => {
  const { summary } = checkAll({ specLines: spec.lines, artifact: golden() });

  assert.equal(summary.checksDeclared, ENGINE_DECLARED_CHECK_COUNT);
  assert.equal(summary.checksRun, summary.checksDeclared);
});

// [::TICKET::] PX-348 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-348 --for-spec --no-implementation-order`.
test('C006 no workspace-specific value appears in the check or the verifier', () => {
  const sourceFiles = [
    join(PROJECT_ROOT, '.claude/scripts/educe-sequences/rail/engine.mjs'),
    join(PROJECT_ROOT, '.claude/scripts/sequences-slice/verify-chain.mjs'),
    join(PROJECT_ROOT, '.claude/scripts/sequences-slice/lib/implementation-order.mjs'),
  ];
  const forbidden = /S-soul-transfer|pkg-0002|gaia-soul/;

  for (const file of sourceFiles) {
    assert.equal(forbidden.test(readFileSync(file, 'utf8')), false, `${file} names a workspace-specific value`);
  }
});
