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
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderServing, renderServingMarkdown, SERVING_LIMIT } from '../../../.claude/scripts/workspacify-reverse/lib/packet.mjs';
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
