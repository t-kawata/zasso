// [::TICKET::] P22-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-3 --for-spec --no-implementation-order`.
// @verifies C003
/**
 * The R-7 instrument: how much a slice actually costs, and what the whole
 * project would cost at that rate.
 *
 * Two properties decide whether the numbers can be believed at all. The run
 * must leave its target byte-identical, and the same inputs must produce the
 * same report — a report that changes between runs of unchanged inputs is
 * measuring the machine, not the project. Decision time and human interventions
 * are recorded by hand and supplied as inputs for exactly that reason: the
 * harness cannot observe them, so a script that timed itself would be reporting
 * wall-clock as if it were judgement.
 *
 * Card layering is a decision the design already made (7.4.1): when the count
 * would exhaust a round, boundary cards are emitted and the contract cards
 * beneath an unresolved boundary are not. What is measured, not assumed, is the
 * threshold itself.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveSlice, runSpike, measureSpikeRun, renderSpikeReport } from '../../../.claude/scripts/workspacify-reverse/lib/scope.mjs';
import { buildClaimLedger } from '../../../.claude/scripts/workspacify-reverse/lib/claim-ledger.mjs';
import { CARD_LAYERING_THRESHOLD, renderDecisionCards, renderCardsMarkdown } from '../../../.claude/scripts/workspacify-reverse/lib/packet.mjs';
import { SPIKE_SLICE_FILES, createSyntheticTree, hashTree } from '../helpers/scratch.mjs';

const RECORDED = Object.freeze({
  interventions: Object.freeze([{ at: '2026-09-10T00:00:00Z', note: 'confirmed the slice name' }]),
  decisionSamplesMs: Object.freeze([60000, 90000]),
});

/** One claim in the shape renderDecisionCards consumes. */
function makeClaim(index, overrides = {}) {
  const claimId = overrides.claim_id ?? `clm-synthetic-${index}`;
  return {
    claim_id: claimId,
    claim_type: 'observed',
    subjectKind: 'boundary_crossing',
    scope: 'src/api',
    proposition: `src/api consumes src/db at symbol ${index}`,
    evidence: [{ evidence_id: `ev-${index}`, source_span: { file: 'src/api/login.rs', line: index }, lineage_edges: [] }],
    support: [`ev-${index}`],
    counterexamples: [],
    falsification: `mutate the call at src/api/login.rs:${index} and observe whether any test fails`,
    ...overrides,
  };
}

/** A ledger holding `boundaryCount` boundary claims and `contractCount` others. */
function makeLedger({ boundaryCount, contractCount, boundaryClass = 'observed' }) {
  const claims = [];
  for (let index = 0; index < boundaryCount; index += 1) {
    claims.push(makeClaim(index, { subjectKind: 'boundary_crossing', scope: 'src/api', claim_type: boundaryClass }));
  }
  for (let index = 0; index < contractCount; index += 1) {
    claims.push(makeClaim(100 + index, { subjectKind: 'invariant', scope: 'src/api', claim_type: 'inferred' }));
  }
  return { claims, note: '', unresolvedRate: 0, byClass: { observed: boundaryCount, inferred: contractCount, normative: 0, unresolved: 0 } };
}

// --- UT-7 / acceptance edge case: above the threshold, cards are layered -------

test('UT-7: a card count above the threshold is layered rather than one unbounded list', () => {
  const ledger = makeLedger({ boundaryCount: 1, contractCount: CARD_LAYERING_THRESHOLD + 4, boundaryClass: 'unresolved' });
  const { cards, layered, suppressed } = renderDecisionCards(ledger);

  assert.equal(layered, true, 'the run declared that it layered');
  assert.ok(cards.length < ledger.claims.length, 'layering produced fewer top-level cards than claims');
  assert.equal(cards.length, 1);
  assert.equal(suppressed, ledger.claims.length - 1, 'every suppressed card is counted, never dropped silently');
  assert.ok(renderCardsMarkdown(cards).includes('suppressed'), 'the rendering says what was withheld');
});

test('UT-7b: below the threshold every claim gets its own card', () => {
  const ledger = makeLedger({ boundaryCount: 2, contractCount: 2 });
  const { cards, layered, suppressed } = renderDecisionCards(ledger);

  assert.equal(layered, false);
  assert.equal(cards.length, ledger.claims.length);
  assert.equal(suppressed, 0);
});

test('UT-7d: a slice with no boundary crossing is still layered above the threshold', () => {
  // A slice whose claims are all local: there is no boundary card to hang them
  // beneath, and emitting them flat would be the explosion the threshold exists
  // to prevent while still reporting that layering happened.
  const ledger = makeLedger({ boundaryCount: 0, contractCount: CARD_LAYERING_THRESHOLD + 8 });

  assert.deepEqual(ledger.claims.map((claim) => claim.scope), Array(ledger.claims.length).fill('src/api'));
  const { cards, layered, suppressed } = renderDecisionCards(ledger);

  assert.equal(layered, true);
  assert.ok(cards.length < ledger.claims.length, 'the output is bounded by the scope, not the claim count');
  assert.equal(cards.length, 1);
  assert.equal(suppressed, 0, 'nothing is withheld: the local conditions are bundled, not dropped');
  assert.equal(cards[0].children.length, ledger.claims.length - 1);
});

test('UT-7e: layering bounds the output across several scopes without a boundary', () => {
  const claims = [];
  for (let index = 0; index < CARD_LAYERING_THRESHOLD + 6; index += 1) {
    for (const scope of ['src/api', 'src/db', 'src/model']) {
      claims.push(makeClaim(index * 10 + scope.length, { subjectKind: 'invariant', scope, claim_id: `clm-${scope}-${index}` }));
    }
  }
  const { cards, layered } = renderDecisionCards({ claims });

  assert.equal(layered, true);
  assert.ok(cards.length <= 3, 'one card leads each scope');
  assert.ok(cards.length < claims.length);
});

test('UT-7c: a resolved boundary card expands its contract cards when layered', () => {
  const ledger = makeLedger({ boundaryCount: 1, contractCount: CARD_LAYERING_THRESHOLD + 4 });
  const { cards, layered, suppressed } = renderDecisionCards(ledger);

  assert.equal(layered, true);
  assert.equal(suppressed, 0, 'a boundary that is not unresolved keeps its children');
  assert.equal(cards[0].children.length, ledger.claims.length - 1);
});

// --- C003 precondition: the spike has completed --------------------------------

test('C003 precondition: a completed run exposes slice, ledger, cards and measurement', () => {
  const subject = createSyntheticTree(SPIKE_SLICE_FILES);
  const outcome = runSpike({ root: subject.root, slice: 'login', recorded: RECORDED });

  assert.equal(outcome.slice.slice, 'login');
  assert.ok(Array.isArray(outcome.ledger.claims));
  assert.ok(Array.isArray(outcome.cards));
  assert.equal(typeof outcome.measurement, 'object');
  subject.dispose();
});

// --- C003 postcondition: five measured values and an extrapolation -------------

test('C003 postcondition: claim count, card count, unresolved rate, decision time and interventions are measured', () => {
  const subject = createSyntheticTree(SPIKE_SLICE_FILES);
  const slice = resolveSlice(subject.root, 'login');
  const ledger = buildClaimLedger(slice);
  const { cards } = renderDecisionCards(ledger);
  const measurement = measureSpikeRun({ slice, ledger, cards, recorded: RECORDED });

  assert.equal(measurement.claims.total, ledger.claims.length);
  assert.equal(measurement.cards.total, cards.length);
  assert.equal(measurement.unresolvedRate, measurement.claims.byClass.unresolved / measurement.claims.total);
  assert.equal(measurement.humanInterventions, 1);
  assert.equal(measurement.decisionMinutes, 2.5);
  assert.equal(measurement.decisionMinutesPerCard, 2.5 / cards.length);
  subject.dispose();
});

test('C003 postcondition: the slice is extrapolated to the whole project', () => {
  const subject = createSyntheticTree(SPIKE_SLICE_FILES);
  const slice = resolveSlice(subject.root, 'login');
  const ledger = buildClaimLedger(slice);
  const { cards } = renderDecisionCards(ledger);
  const measurement = measureSpikeRun({ slice, ledger, cards, recorded: RECORDED });

  assert.equal(measurement.extrapolation.rule, 'cards per seed file multiplied by the project source file count');
  assert.equal(measurement.extrapolation.seedFiles, slice.seeds.length);
  assert.equal(measurement.extrapolation.projectSourceFiles, slice.projectSourceFiles);
  assert.ok(measurement.extrapolation.cardsToWholeProject > measurement.cards.total);
  assert.equal(
    measurement.extrapolation.cardsToWholeProject,
    Math.ceil(measurement.cards.total * (slice.projectSourceFiles / slice.seeds.length)),
  );
  subject.dispose();
});

test('C003 postcondition: recording nothing yields zero rather than an invented number', () => {
  const subject = createSyntheticTree(SPIKE_SLICE_FILES);
  const slice = resolveSlice(subject.root, 'login');
  const ledger = buildClaimLedger(slice);
  const { cards } = renderDecisionCards(ledger);
  const measurement = measureSpikeRun({ slice, ledger, cards });

  assert.equal(measurement.humanInterventions, 0);
  assert.equal(measurement.decisionMinutes, 0);
  assert.equal(measurement.decisionSamples, 0);
  subject.dispose();
});

// --- C003 invariant: measurement never modifies its target ---------------------

test('UT-10 / C003 invariant: the measurement leaves the target tree byte-identical', () => {
  const subject = createSyntheticTree(SPIKE_SLICE_FILES);
  const before = hashTree(subject.root);

  const outcome = runSpike({ root: subject.root, slice: 'login', recorded: RECORDED });

  assert.deepEqual(hashTree(subject.root), before);
  assert.equal(outcome.measurement.targetUnchanged, true);
  subject.dispose();
});

test('C003 invariant: identical inputs produce an identical report', () => {
  const subject = createSyntheticTree(SPIKE_SLICE_FILES);
  const slice = resolveSlice(subject.root, 'login');
  const ledger = buildClaimLedger(slice);
  const { cards } = renderDecisionCards(ledger);
  const measurement = measureSpikeRun({ slice, ledger, cards, recorded: RECORDED });

  const first = renderSpikeReport(measurement, { reconciliation: [], targetDigest: 'a'.repeat(64) });
  const second = renderSpikeReport(measurement, { reconciliation: [], targetDigest: 'a'.repeat(64) });
  assert.equal(first, second);
  subject.dispose();
});

// --- The report is prose the AI reads, and it says what it did not measure -----

test('the report is Markdown and carries the measured values, the extrapolation and the limits', () => {
  const subject = createSyntheticTree(SPIKE_SLICE_FILES);
  const outcome = runSpike({ root: subject.root, slice: 'login', recorded: RECORDED });
  const report = renderSpikeReport(outcome.measurement, { reconciliation: [], targetDigest: outcome.measurement.targetDigest });

  assert.ok(report.startsWith('# Spike report'), 'the report opens with its title');
  assert.ok(!report.trimStart().startsWith('{'), 'what the AI reads is Markdown, not a data structure');
  for (const value of ['claims', 'cards', 'unresolved', 'decision time', 'human interventions']) {
    assert.match(report, new RegExp(value, 'i'), `the report states ${value}`);
  }
  assert.match(report, /extrapolat/i, 'the report states the extrapolation');
  assert.match(report, /source_static/, 'the report names the analysis mode it actually used');
  assert.match(report, /P22-4/, 'the report says who owns the toolchain decision');
  subject.dispose();
});

test('the report states that the reconciliation has not been run rather than implying agreement', () => {
  const subject = createSyntheticTree(SPIKE_SLICE_FILES);
  const outcome = runSpike({ root: subject.root, slice: 'login', recorded: RECORDED });
  const report = renderSpikeReport(outcome.measurement, { reconciliation: [], targetDigest: outcome.measurement.targetDigest });

  assert.match(report, /## Disagreements/);
  assert.match(report, /spike reconcile/, 'the report names the command that produces the list');
  assert.ok(!/zero disagreements/i.test(report), 'an unrun comparison is not reported as agreement');
  subject.dispose();
});
