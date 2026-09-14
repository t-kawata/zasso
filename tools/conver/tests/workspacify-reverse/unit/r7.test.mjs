// @verifies C001
// [::TICKET::] P22-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-8 --for-spec --no-implementation-order`.
/**
 * R7 — serving, and the refusals that keep a claim honest.
 *
 * Two jobs are proved here. The first is serving: every claim a human has to
 * decide is handed over with its question, the evidence that exists and a
 * default, because a card that asks for an essay has moved the judgement back
 * onto the machine without saying so. The second is refusal: a normative clause
 * whose provenance chain is broken is not a norm, and a claim whose evidence
 * cannot be located is not observed — both are demoted and counted rather than
 * emitted with a dangling reference, because a silent drop would read as "this
 * was considered and settled".
 *
 * The third is the packet's shape. Above `CARD_LAYERING_THRESHOLD` the exit
 * serves the layered decisions the spike calibrated rather than a flat list in
 * identifier order, and what it does not print it counts and names the reason
 * for. The selection is one function so that the experiment and the exit cannot
 * drift apart a second time.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  assertPacketReconciles,
  CARD_LAYERING_THRESHOLD,
  PACKET_LEVELS,
  renderDecisionCards,
  renderServing,
  renderServingMarkdown,
  selectServingCards,
  SERVING_LIMIT,
  WITHHOLDING_RULES,
} from '../../../.claude/scripts/workspacify-reverse/lib/packet.mjs';
import { compareText } from '../../../.claude/scripts/workspacify-reverse/lib/holdout-ledger.mjs';
import {
  PROVENANCE_CHAIN_LINKS,
  DEMOTION_REASONS,
  validateOriginSpec,
} from '../../../.claude/scripts/workspacify-reverse/lib/origin-spec.mjs';
import { PROVENANCE_CLASSES } from '../../../.claude/scripts/workspacify-reverse/lib/provenance.mjs';
import { createSyntheticTree } from '../helpers/scratch.mjs';

/** A tree with one file long enough that a stated line number can be located. */
const EVIDENCE_TREE = Object.freeze({
  'src/api/login.rs': [
    'use crate::db::users::User;',
    '',
    'pub fn login(user: &User) -> bool {',
    '    assert!(!user.name.is_empty());',
    '    !user.name.is_empty()',
    '}',
    '',
  ].join('\n'),
});

/** A claim in the shape the ledger produces, with every field the design names. */
// [::TICKET::] P22-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-8 --for-spec --no-implementation-order`.
function claimOf(overrides) {
  return {
    claim_id: 'clm-api-login-001',
    claim_type: 'unresolved',
    scope: 'src/api',
    statement: 'The crossing from `src/api` into `src/db` is an intended boundary',
    falsification: 'a caller that reaches `src/db` without passing the boundary',
    evidence: [{ source_span: { file: 'src/api/login.rs', line: 4 }, evidence_mode: 'source_static' }],
    support: ['ev-api-login-004'],
    counterevidence: [],
    grill_question: 'Is the crossing an intended boundary or an accident of history?',
    ...overrides,
  };
}

/** A ledger carrying the claims a run would hand over. */
// [::TICKET::] P22-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-8 --for-spec --no-implementation-order`.
function ledgerOf(claims) {
  return { root: '/tmp/nowhere', claims };
}

// --- Serving ---------------------------------------------------------------------

test('UT-1: renderServing gives every unresolved claim its question, evidence and default', () => {
  const ledger = ledgerOf([
    claimOf({}),
    claimOf({ claim_id: 'clm-db-users-002', scope: 'src/db' }),
  ]);

  const serving = renderServing(ledger);

  assert.equal(serving.served.length, 2);
  assert.equal(serving.servedCount, 2);
  assert.equal(serving.empty, false);
  for (const served of serving.served) {
    assert.ok(served.question.length > 0, 'an unresolved claim must be asked about');
    assert.ok(served.default.length > 0, 'a decision the machine cannot make is never lost');
    assert.ok(served.evidence.length > 0, 'the material must be in front of the reader');
    assert.match(served.evidence[0], /src\/api\/login\.rs:4/, 'evidence is located, not summarised');
    assert.equal(served.claim_id.startsWith('clm-'), true);
  }
});

test('UT-1: a claim that is already settled is counted as settled, not withheld silently', () => {
  const ledger = ledgerOf([
    claimOf({}),
    claimOf({ claim_id: 'clm-settled-003', claim_type: 'observed' }),
  ]);

  const serving = renderServing(ledger);

  assert.equal(serving.served.length, 1);
  assert.equal(serving.settledCount, 1);
  assert.equal(serving.servedCount + serving.settledCount, ledger.claims.length);
});

test('UT-7: an empty ledger produces an explicit empty report, not a report that looks short', () => {
  const serving = renderServing(ledgerOf([]));

  assert.equal(serving.empty, true);
  assert.equal(serving.servedCount, 0);
  const markdown = renderServingMarkdown(serving);
  assert.match(markdown, /no claim/i, 'the report says plainly that there was nothing to serve');
  assert.match(markdown, /empty/i);
});

test('UT-8: a single-claim ledger renders correctly', () => {
  const serving = renderServing(ledgerOf([claimOf({})]));

  assert.equal(serving.served.length, 1);
  const markdown = renderServingMarkdown(serving);
  assert.match(markdown, /clm-api-login-001/);
  assert.match(markdown, /Is the crossing an intended boundary or an accident of history\?/);
});

test('UT-9: a ledger whose every claim is unresolved still serves rather than failing', () => {
  const claims = Array.from({ length: 5 }, (_, index) => claimOf({ claim_id: `clm-many-${index}` }));
  const serving = renderServing(ledgerOf(claims));

  assert.equal(serving.servedCount, 5);
  assert.equal(serving.settledCount, 0);
  assert.equal(serving.empty, false);
});

test('UT-1: the served list is capped and the cap is stated rather than silent', () => {
  const claims = Array.from({ length: SERVING_LIMIT + 3 }, (_, index) => claimOf({ claim_id: `clm-cap-${index}` }));
  const serving = renderServing(ledgerOf(claims));

  const markdown = renderServingMarkdown(serving);
  assert.match(
    markdown,
    new RegExp(String(serving.withheldFromServing)),
    'a cap that is not stated reads as "everything was considered"',
  );
  assert.ok(serving.withheldFromServing > 0);
});

// --- C001 precondition -----------------------------------------------------------

test('C001 precondition: the ledger the spec is built from exists and carries claims', () => {
  const ledger = ledgerOf([claimOf({})]);

  assert.equal(Array.isArray(ledger.claims), true);
  assert.ok(ledger.claims.length > 0, 'the precondition names a ledger that exists');
});

// --- C001 postcondition ----------------------------------------------------------

test('C001 postcondition: every observed claim has located evidence and every unresolved claim a question', () => {
  const tree = createSyntheticTree(EVIDENCE_TREE);
  try {
    const ledger = ledgerOf([
      claimOf({ claim_id: 'clm-observed-001', claim_type: 'observed' }),
      claimOf({ claim_id: 'clm-unresolved-002' }),
    ]);

    const checked = validateOriginSpec(
      { root: tree.root, claims: ledger.claims, demotions: [] },
      { root: tree.root },
    );

    for (const claim of checked.claims.filter((entry) => entry.claim_type === 'observed')) {
      assert.ok(claim.evidence.length > 0, 'observed means read from the text');
      for (const item of claim.evidence) {
        assert.ok(item.source_span.file.length > 0);
        assert.equal(Number.isInteger(item.source_span.line), true);
      }
    }
    for (const claim of checked.claims.filter((entry) => entry.claim_type === 'unresolved')) {
      assert.equal(typeof claim.grill_question, 'string');
      assert.ok(claim.grill_question.length > 0, 'an unresolved claim hands a question to the grill');
    }
  } finally {
    tree.dispose();
  }
});

// --- C001 invariant --------------------------------------------------------------

test('UT-4 / C001 invariant: a normative clause with a broken provenance chain is not classified normative', () => {
  const tree = createSyntheticTree(EVIDENCE_TREE);
  try {
    const broken = claimOf({
      claim_id: 'clm-norm-001',
      claim_type: 'normative',
      normative_decision_id: 'nd-001',
    });

    const checked = validateOriginSpec(
      { root: tree.root, claims: [broken], demotions: [] },
      { root: tree.root },
    );

    assert.notEqual(checked.claims[0].claim_type, 'normative');
    assert.equal(checked.claims[0].claim_type, 'unresolved');
    assert.ok(checked.claims[0].grill_question.length > 0);
    assert.equal(checked.demotions.length, 1);
    assert.equal(checked.demotions[0].reason, DEMOTION_REASONS.brokenProvenanceChain);
    assert.ok(checked.demotions[0].missing.length > 0, 'the broken link is named');
  } finally {
    tree.dispose();
  }
});

test('UT-4: a normative clause carrying the whole chain keeps its classification', () => {
  const tree = createSyntheticTree(EVIDENCE_TREE);
  try {
    const whole = claimOf({
      claim_id: 'clm-norm-002',
      claim_type: 'normative',
      normative_decision_id: 'nd-002',
      residual_id: 'res-002',
      evidence_bundle_hash: 'sha256:abc',
      evidence_records: [{ source_span: { file: 'src/api/login.rs', line: 4 }, evidence_mode: 'source_static' }],
      evidence: [{ source_span: { file: 'src/api/login.rs', line: 4 }, evidence_mode: 'source_static' }],
    });

    const checked = validateOriginSpec(
      { root: tree.root, claims: [whole], demotions: [] },
      { root: tree.root },
    );

    assert.equal(checked.claims[0].claim_type, 'normative');
    assert.equal(checked.demotions.length, 0);
  } finally {
    tree.dispose();
  }
});

test('C001 on error: an inferred claim that states no basis is refused', () => {
  const tree = createSyntheticTree(EVIDENCE_TREE);
  try {
    const baseless = claimOf({
      claim_id: 'clm-baseless-001',
      claim_type: 'inferred',
      basis: [],
    });

    assert.throws(
      () => validateOriginSpec({ root: tree.root, claims: [baseless], demotions: [] }, { root: tree.root }),
      /basis/i,
      'an inference must say what it infers from, or it is an assertion',
    );
  } finally {
    tree.dispose();
  }
});

test('C001 invariant: the provenance chain vocabulary is the five links the design names', () => {
  assert.deepEqual(
    [...PROVENANCE_CHAIN_LINKS],
    ['claim_id', 'normative_decision_id', 'residual_id', 'evidence_bundle_hash', 'evidence_records'],
  );
  assert.equal(Object.isFrozen(PROVENANCE_CHAIN_LINKS), true);
});

// --- C001 on-error: demotion rather than a dangling reference ---------------------

test('UT-5: a claim whose evidence cannot be located is demoted, not emitted with a dangling reference', () => {
  const tree = createSyntheticTree(EVIDENCE_TREE);
  try {
    const dangling = claimOf({
      claim_id: 'clm-dangling-001',
      claim_type: 'observed',
      evidence: [{ source_span: { file: 'src/api/absent.rs', line: 99 }, evidence_mode: 'source_static' }],
      grill_question: null,
    });

    const checked = validateOriginSpec(
      { root: tree.root, claims: [dangling], demotions: [] },
      { root: tree.root },
    );

    assert.equal(checked.claims[0].claim_type, 'unresolved');
    assert.equal(checked.demotions.length, 1);
    assert.equal(checked.demotions[0].reason, DEMOTION_REASONS.unlocatableEvidence);
    assert.ok(checked.claims[0].grill_question.length > 0, 'a demoted claim still reaches the grill');
    assert.equal(
      checked.claims.some((entry) => entry.claim_type === 'observed'
        && entry.evidence.some((item) => item.source_span.file === 'src/api/absent.rs')),
      false,
      'no claim may be emitted as observed on evidence that is not there',
    );
  } finally {
    tree.dispose();
  }
});

test('UT-5: a line number past the end of an existing file is unlocatable too', () => {
  const tree = createSyntheticTree(EVIDENCE_TREE);
  try {
    const pastEnd = claimOf({
      claim_id: 'clm-past-end-001',
      claim_type: 'observed',
      evidence: [{ source_span: { file: 'src/api/login.rs', line: 9999 }, evidence_mode: 'source_static' }],
      grill_question: null,
    });

    const checked = validateOriginSpec(
      { root: tree.root, claims: [pastEnd], demotions: [] },
      { root: tree.root },
    );

    assert.equal(checked.claims[0].claim_type, 'unresolved');
    assert.equal(checked.demotions[0].reason, DEMOTION_REASONS.unlocatableEvidence);
  } finally {
    tree.dispose();
  }
});

test('C001: the four provenance values are the ledger vocabulary, not a second copy', () => {
  assert.deepEqual([...PROVENANCE_CLASSES], ['observed', 'inferred', 'normative', 'unresolved']);
});

// --- The layered packet ------------------------------------------------------------

/** One unresolved claim in a named scope, of a named subject kind. */
// [::TICKET::] P23-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-3 --for-spec --no-implementation-order`.
function claimInScope({ scope, subjectKind, index, overrides = {} }) {
  return claimOf({
    claim_id: `clm-${scope.replace(/[^a-z0-9]+/gi, '-')}-${subjectKind}-${index}`,
    scope,
    subjectKind,
    ...overrides,
  });
}

/** `count` unresolved contract claims in one scope: the level a boundary governs. */
// [::TICKET::] P23-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-3 --for-spec --no-implementation-order`.
function unresolvedContracts(scope, count) {
  return Array.from({ length: count }, (_, index) => claimInScope({ scope, subjectKind: 'invariant', index }));
}

/** A scope's boundary claim, settled or not. */
// [::TICKET::] P23-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-3 --for-spec --no-implementation-order`.
function boundaryOf(scope, index, claimType) {
  return claimInScope({
    scope,
    subjectKind: 'boundary_crossing',
    index,
    overrides: { claim_type: claimType },
  });
}

/** Twenty ledgers whose unresolved counts and scope shapes vary without a random source. */
// [::TICKET::] P23-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-3 --for-spec --no-implementation-order`.
function generatedLedgers() {
  return Array.from({ length: 20 }, (_, seed) => {
    const scopes = ['src/api', 'src/db', 'src/model'].slice(0, (seed % 3) + 1);
    return ledgerOf(scopes.flatMap((scope, index) => [
      ...(seed % 2 === 0 ? [boundaryOf(scope, seed, 'unresolved')] : []),
      ...unresolvedContracts(scope, CARD_LAYERING_THRESHOLD + seed + index),
    ]));
  });
}

test('C001 boundary: at the threshold the packet is flat, one claim above it is layered', () => {
  const flat = renderServing(ledgerOf(unresolvedContracts('src/api', CARD_LAYERING_THRESHOLD)), { layered: true });
  assert.equal(flat.layered, false, 'exactly at the threshold is still a flat packet');
  assert.deepEqual(flat.layers, []);
  assert.equal(flat.servedCount, CARD_LAYERING_THRESHOLD);

  const layered = renderServing(ledgerOf(unresolvedContracts('src/api', CARD_LAYERING_THRESHOLD + 1)), { layered: true });
  assert.equal(layered.layered, true, 'a ">" written as ">=" would change the shape without changing any count');
  assert.equal(layered.servedCount, CARD_LAYERING_THRESHOLD + 1);
});

test('C001: the exit serves the sequence the spike calibrated, claim for claim', () => {
  const ledger = ledgerOf([
    boundaryOf('src/api', 1, 'unresolved'),
    boundaryOf('src/db', 2, 'unresolved'),
    ...unresolvedContracts('src/api', 20),
  ]);
  const spikeSequence = renderDecisionCards(ledger).cards
    .flatMap((card) => [card.claim_id, ...(card.children ?? []).map((child) => child.claim_id)]);

  const exitSequence = renderServing(ledger, { layered: true }).served.map((card) => card.claim_id);

  assert.deepEqual(
    exitSequence,
    spikeSequence,
    'the calibrated shape and the served shape cannot drift apart a second time',
  );
});

test('C001: the packet reports the levels it served, and their counts sum to the served count', () => {
  const ledger = ledgerOf([
    boundaryOf('src/api', 1, 'unresolved'),
    ...unresolvedContracts('src/api', 20),
  ]);

  const serving = renderServing(ledger, { layered: true });

  assert.deepEqual(serving.layers.map((layer) => layer.level), [...PACKET_LEVELS]);
  assert.equal(serving.layers.reduce((total, layer) => total + layer.cardCount, 0), serving.servedCount);
  assert.equal(serving.served[0].level, 'boundary');
  assert.equal(serving.served[0].lead, null, 'a leading card hangs from nothing');
  assert.equal(serving.served[0].claim_id, ledger.claims.find((claim) => claim.subjectKind === 'boundary_crossing').claim_id);
});

test('C003: a scope whose boundary is unresolved withholds its contract level whole, by name', () => {
  const serving = renderServing(ledgerOf([
    boundaryOf('src/api', 1, 'unresolved'),
    ...unresolvedContracts('src/api', 20),
  ]), { layered: true });

  assert.equal(serving.served.length, 1, 'the contract level is not decided while its boundary is open');
  assert.equal(serving.withheldFromServing, 20);

  const rule = serving.withheld.find((entry) => entry.rule === 'unresolvedBoundary');
  assert.equal(rule.count, 20);
  assert.deepEqual(rule.scopes, ['src/api'], 'the withholding is reported against the scope by name');
  assert.equal(serving.layers.find((layer) => layer.level === 'contract').cardCount, 0);

  const markdown = renderServingMarkdown(serving);
  assert.equal(markdown.includes(WITHHOLDING_RULES.unresolvedBoundary), true, 'the reason is named, not only the number');
  assert.match(markdown, /`src\/api`/, 'the scope the rule applied to is named');
});

test('C003: a scope with no boundary claim bundles its local conditions under the first of them', () => {
  const serving = renderServing(ledgerOf(unresolvedContracts('src/api', CARD_LAYERING_THRESHOLD + 4)), { layered: true });

  assert.equal(serving.layered, true, 'no boundary is not a reason to emit every card flat');
  assert.equal(serving.layers.find((layer) => layer.level === 'bundle').cardCount, CARD_LAYERING_THRESHOLD + 4);
  assert.equal(serving.layers.find((layer) => layer.level === 'boundary').cardCount, 0);

  const lead = serving.served[0];
  assert.equal(lead.level, 'bundle');
  assert.equal(serving.served.filter((card) => card.lead === lead.claim_id).length, CARD_LAYERING_THRESHOLD + 3);
});

test('C003: two settled boundary cards for one scope hang the contract level from exactly one of them', () => {
  const selection = selectServingCards(ledgerOf([
    boundaryOf('src/api', 1, 'observed'),
    boundaryOf('src/api', 2, 'observed'),
    ...unresolvedContracts('src/api', CARD_LAYERING_THRESHOLD + 4),
  ]));

  assert.equal(selection.layered, true);
  assert.equal(selection.suppressed, 0, 'a boundary that is not unresolved keeps its children');

  const leads = selection.cards.filter((entry) => entry.children.length > 0);
  assert.equal(leads.length, 1, 'hanging the same children from every sibling would carry each decision several times over');
  assert.equal(leads[0].children.length, CARD_LAYERING_THRESHOLD + 4);
  assert.equal(selection.cards.length, 2);
});

test('C003 invariant: no scope contributes more than one contract level', () => {
  const selection = selectServingCards(ledgerOf([
    boundaryOf('src/api', 1, 'observed'),
    boundaryOf('src/api', 2, 'observed'),
    ...unresolvedContracts('src/api', CARD_LAYERING_THRESHOLD + 4),
    ...unresolvedContracts('src/db', CARD_LAYERING_THRESHOLD + 2),
  ]));

  const levelsByScope = new Map();
  for (const entry of selection.cards.filter((candidate) => candidate.children.length > 0)) {
    levelsByScope.set(entry.claim.scope, (levelsByScope.get(entry.claim.scope) ?? 0) + 1);
  }

  assert.deepEqual([...levelsByScope.keys()].sort(compareText), ['src/api', 'src/db']);
  assert.equal(
    [...levelsByScope.values()].every((levels) => levels === 1),
    true,
    'a scope hangs its contract level from one card, never from every sibling',
  );
  assert.equal(selection.cards.every((entry) => typeof entry.claim.scope === 'string'), true, 'every card names its scope');
});

test('C002 invariant: served plus withheld is the unresolved count, and the rules sum to the withheld count', () => {
  const ledgers = [
    ledgerOf([]),
    ledgerOf(unresolvedContracts('src/api', CARD_LAYERING_THRESHOLD)),
    ledgerOf(unresolvedContracts('src/api', CARD_LAYERING_THRESHOLD + 1)),
    ledgerOf([
      boundaryOf('src/api', 1, 'unresolved'),
      ...unresolvedContracts('src/api', 20),
      ...unresolvedContracts('src/db', 20),
    ]),
    ...generatedLedgers(),
  ];

  for (const ledger of ledgers) {
    const unresolvedCount = ledger.claims.filter((claim) => claim.claim_type === 'unresolved').length;
    const serving = renderServing(ledger, { layered: true });

    assert.equal(serving.servedCount + serving.withheldFromServing, unresolvedCount, `ledger of ${unresolvedCount}`);
    assert.equal(
      serving.withheld.reduce((total, entry) => total + entry.count, 0),
      serving.withheldFromServing,
      `ledger of ${unresolvedCount}`,
    );
    // A flat packet has no levels to be at, so its levels account for nothing;
    // a layered one reports every served card under one of them.
    assert.equal(
      serving.layers.reduce((total, layer) => total + layer.cardCount, 0),
      serving.layered ? serving.servedCount : 0,
      `ledger of ${unresolvedCount}`,
    );
  }
});

test('C002 postcondition: a ledger larger than the serving limit states what the limit withheld, and why', () => {
  const ledger = ledgerOf(unresolvedContracts('src/api', 200));

  const serving = renderServing(ledger, { layered: true });

  assert.equal(serving.servedCount, SERVING_LIMIT, 'the packet stops at the limit');
  assert.equal(serving.withheldFromServing, 200 - SERVING_LIMIT);

  const rule = serving.withheld.find((entry) => entry.rule === 'servingLimit');
  assert.equal(rule.count, 200 - SERVING_LIMIT);
  assert.deepEqual(rule.scopes, ['src/api'], 'the rule says which scopes it applied to');

  const markdown = renderServingMarkdown(serving);
  assert.match(markdown, new RegExp(String(serving.withheldFromServing)), 'a cap that is not stated reads as "everything was considered"');
  assert.equal(markdown.includes(WITHHOLDING_RULES.servingLimit), true, 'the reason is named, not only the number');
});

test('C002 error: a packet whose selection would drop a claim fails rather than shrinking', () => {
  assert.throws(
    () => assertPacketReconciles({ unresolvedCount: 3714, servedCount: 100, withheldFromServing: 3613 }),
    (error) => /3714/.test(error.message) && /100/.test(error.message) && /3613/.test(error.message),
    'the failure names the ledger count, the served count and the withheld count',
  );
  assert.equal(assertPacketReconciles({ unresolvedCount: 3714, servedCount: 100, withheldFromServing: 3614 }), undefined);
});

test('C002 error: an unresolved claim that asks nothing is refused beyond the printed page too', () => {
  const claims = [
    ...unresolvedContracts('src/api', CARD_LAYERING_THRESHOLD + 1),
    claimInScope({ scope: 'src/db', subjectKind: 'invariant', index: 99, overrides: { grill_question: null } }),
  ];
  const refusal = /a card that asks nothing is not a decision, it is a statement with a box beside it/;

  assert.throws(() => renderServing(ledgerOf(claims), { layered: true, limit: 2 }), refusal);
  assert.throws(() => renderServing(ledgerOf(claims), { limit: 2 }), refusal);
});

test('C002 error: the layered path keeps the refusals the flat path had', () => {
  assert.throws(() => renderServing(null, { layered: true }), /no ledger with claims/);
  assert.throws(() => renderServing(ledgerOf([]), { layered: true, limit: -1 }), /whole number of claims/);
  assert.throws(() => renderServing(ledgerOf([]), { layered: true, limit: 1.5 }), /1\.5/);

  const serving = renderServing(ledgerOf(unresolvedContracts('src/api', CARD_LAYERING_THRESHOLD + 1)), { layered: true });
  assert.equal(serving.layered, true, 'the option reaches the packet rather than being ignored');
});

test('C002 boundary: the empty ledger reports an explicit empty result with the layered option on', () => {
  const serving = renderServing(ledgerOf([]), { layered: true });

  assert.equal(serving.empty, true);
  assert.equal(serving.servedCount, 0);
  assert.deepEqual(serving.layers, []);
  assert.deepEqual(serving.withheld, []);

  const markdown = renderServingMarkdown(serving);
  assert.match(markdown, /no claim/i);
  assert.match(markdown, /empty/i);
});

test('C002 invariant: the packet never serves a claim that is not unresolved', () => {
  const ledger = ledgerOf([
    claimOf({ claim_id: 'clm-settled-001', claim_type: 'observed' }),
    ...unresolvedContracts('src/api', CARD_LAYERING_THRESHOLD + 4),
  ]);

  const serving = renderServing(ledger, { layered: true });

  assert.equal(serving.settledCount, 1);
  assert.equal(serving.served.every((card) => card.claim_type === 'unresolved'), true);
  assert.equal(serving.layers.find((layer) => layer.level === 'bundle').cardCount, CARD_LAYERING_THRESHOLD + 4);
});

test('C002 invariant: two runs over one ledger produce the same packet, each layer in claim_id order', () => {
  const ledger = ledgerOf([
    boundaryOf('src/api', 1, 'unresolved'),
    boundaryOf('src/db', 2, 'unresolved'),
    ...unresolvedContracts('src/api', CARD_LAYERING_THRESHOLD + 2),
    ...unresolvedContracts('src/db', CARD_LAYERING_THRESHOLD + 2),
  ]);

  const first = renderServing(ledger, { layered: true });
  const second = renderServing(ledger, { layered: true });

  assert.deepEqual(first, second);

  const boundaryLevel = first.served.filter((card) => card.level === 'boundary').map((card) => card.claim_id);
  assert.equal(boundaryLevel.length, 2, 'both boundary claims lead, so the level is read and not merely absent');
  assert.deepEqual(
    boundaryLevel,
    [...boundaryLevel].sort(compareText),
    're-derivable means the same ledger renders the same bytes twice',
  );
});
