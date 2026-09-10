// [::TICKET::] P22-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-3 --for-spec --no-implementation-order`.
// @verifies C001
// @verifies C002
/**
 * R0.5 (scope), R3.5 (claim ledger) and R7 (cards): the slice's vocabulary.
 *
 * The spike exists to find out whether the design runs, so these tests hold the
 * three load-bearing claims to their contracts before any of the code exists:
 * a slice resolves to every directory it crosses, every claim it yields carries
 * a stable id and one of the four provenance values, and every card states one
 * falsifiable proposition with enumerated options rather than open prose.
 *
 * The F11 defence is asserted directly rather than described: evidence joined
 * by a strong lineage relation is one vote, not two. A tool that counts evidence
 * records is a rubber stamp, which is the failure this instrument exists to
 * refuse.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  SliceUnresolvedError,
  resolveSlice,
} from '../../../.claude/scripts/workspacify-reverse/lib/scope.mjs';
import {
  PROVENANCE_CLASSES,
  buildClaimLedger,
  classifyClaim,
  countIndependentSupport,
} from '../../../.claude/scripts/workspacify-reverse/lib/claim-ledger.mjs';
import {
  CARD_SUBJECT_KINDS,
  renderCardsMarkdown,
  renderDecisionCards,
} from '../../../.claude/scripts/workspacify-reverse/lib/packet.mjs';
import {
  SPIKE_CLAIMLESS_FILES,
  SPIKE_LOGIN_TWO_DIRECTORY_FILES,
  SPIKE_SINGLE_CLAIM_FILES,
  SPIKE_SLICE_FILES,
  createSyntheticTree,
} from '../helpers/scratch.mjs';

/** The word a card may never ask of its reader, in any of its spellings. */
const FREE_FORM_DEMAND = /\bdescribe\b|\bin your own words\b|\bexplain why\b|\bdiscuss\b/i;

// --- UT-1 / C001 precondition: a clean input and one vertical slice ------------

test('UT-1: resolveSlice returns every directory on the slice', () => {
  const subject = createSyntheticTree(SPIKE_LOGIN_TWO_DIRECTORY_FILES);
  const slice = resolveSlice(subject.root, 'login');

  assert.equal(slice.slice, 'login');
  assert.deepEqual(slice.directories, ['src/api', 'src/db']);
  assert.deepEqual(slice.seeds, ['src/api/login.rs']);
  subject.dispose();
});

test('UT-1b: a slice that crosses two boundaries names both providers', () => {
  const subject = createSyntheticTree(SPIKE_SLICE_FILES);
  const slice = resolveSlice(subject.root, 'login');

  assert.deepEqual(slice.directories, ['src/api', 'src/config', 'src/db']);
  assert.deepEqual(slice.seeds, ['src/api/login.rs', 'src/api/login_ffi.rs']);
  assert.ok(slice.projectSourceFiles >= 4, 'the scope records how large the whole project is');
  subject.dispose();
});

// --- UT-4 / invariant "on error": an unidentifiable slice says what failed -----

test('UT-4b: a root that cannot be read names the root rather than leaking an errno', () => {
  const missingRoot = join(tmpdir(), 'p22-3-no-such-project');
  assert.equal(existsSync(missingRoot), false, 'the test is only meaningful while this path is absent');

  assert.throws(
    () => resolveSlice(missingRoot, 'login'),
    (error) => {
      assert.ok(error instanceof SliceUnresolvedError, 'the failure is the declared type');
      assert.match(error.message, /p22-3-no-such-project/, 'the message names the root it could not read');
      assert.doesNotMatch(error.message, /ENOENT/, 'the caller is not handed a bare errno');
      return true;
    },
  );
});

test('UT-4: an unidentifiable slice names what could not be resolved', () => {
  const subject = createSyntheticTree(SPIKE_SLICE_FILES);

  assert.throws(
    () => resolveSlice(subject.root, 'no-such-use-case'),
    (error) => {
      assert.ok(error instanceof SliceUnresolvedError, 'the failure is the declared type');
      assert.match(error.message, /no-such-use-case/, 'the message names the slice');
      assert.match(error.message, /src/, 'the message names where it looked');
      assert.match(error.message, /0 seed/, 'the message says how many seeds it found');
      return true;
    },
  );
  subject.dispose();
});

// --- UT-2 / C001 postcondition: claim_id and one of four provenance values -----

test('UT-2: buildClaimLedger assigns a claim_id and one provenance value to every claim', () => {
  const subject = createSyntheticTree(SPIKE_SLICE_FILES);
  const ledger = buildClaimLedger(resolveSlice(subject.root, 'login'));

  assert.ok(ledger.claims.length > 0, 'the login slice yields at least one claim');
  for (const claim of ledger.claims) {
    assert.equal(typeof claim.claim_id, 'string');
    assert.ok(claim.claim_id.length > 0);
    assert.ok(PROVENANCE_CLASSES.includes(claim.claim_type), `${claim.claim_id} carries ${claim.claim_type}`);
    assert.ok(claim.evidence.length > 0, `${claim.claim_id} carries evidence`);
  }
  const counted = PROVENANCE_CLASSES.reduce((total, name) => total + ledger.byClass[name], 0);
  assert.equal(counted, ledger.claims.length);
  assert.equal(ledger.unresolvedRate, ledger.byClass.unresolved / ledger.claims.length);
  subject.dispose();
});

test('UT-2b: a source fact is observed; a condition read out of an assertion is inferred', () => {
  const subject = createSyntheticTree(SPIKE_SLICE_FILES);
  const ledger = buildClaimLedger(resolveSlice(subject.root, 'login'));
  const byId = new Map(ledger.claims.map((claim) => [claim.claim_id, claim]));

  const crossing = ledger.claims.find((claim) => claim.subjectKind === 'boundary_crossing');
  assert.equal(crossing.claim_type, 'observed', 'a crate:: reference is read from the text');
  assert.equal(crossing.evidence[0].evidence_mode, 'source_static');

  const invariant = ledger.claims.find((claim) => claim.subjectKind === 'invariant');
  assert.equal(
    invariant.claim_type,
    'inferred',
    'R3 warns that an assert proves a condition exists, not that it is an invariant',
  );
  assert.ok(invariant.falsification.length > 0, 'every claim says what would refute it');

  const failure = ledger.claims.find((claim) => claim.subjectKind === 'failure_contract');
  assert.equal(failure.claim_type, 'inferred');

  assert.ok(byId.size === ledger.claims.length);
  subject.dispose();
});

test('UT-2c: a claim inside a cfg gate is unresolved and carries a grill question', () => {
  const subject = createSyntheticTree(SPIKE_SLICE_FILES);
  const ledger = buildClaimLedger(resolveSlice(subject.root, 'login'));

  const gated = ledger.claims.filter((claim) =>
    claim.evidence.some((item) => item.source_span.file.endsWith('login_ffi.rs')),
  );
  assert.equal(gated.length, 1, 'the cfg-gated assertion is the only claim in that file');
  assert.equal(gated[0].claim_type, 'unresolved');
  assert.ok(gated[0].grill_question.length > 0, 'an unresolved claim hands a question to the human grill');
  subject.dispose();
});

test('UT-2d: a reference back into the file own module is not a boundary crossing', () => {
  const subject = createSyntheticTree({
    'src/api/login.rs': 'use crate::api::types::Login;\nuse crate::db::users::User;\n',
    'src/api/types.rs': 'pub struct Login;\n',
    'src/db/users.rs': 'pub struct User;\n',
  });
  const ledger = buildClaimLedger(resolveSlice(subject.root, 'login'));
  const crossings = ledger.claims.filter((claim) => claim.subjectKind === 'boundary_crossing');

  assert.equal(crossings.length, 1, 'only the reference into src/db crosses a boundary');
  assert.equal(crossings[0].provider, 'src/db');
  assert.ok(
    ledger.claims.every((claim) => claim.provider !== 'src/api'),
    'a card reading "from src/api into src/api" is not a decision anyone can make',
  );
  subject.dispose();
});

// --- UT-5 / invariant "on error": zero claims is an observation, not a failure -

test('UT-5: zero claims is reported as nothing to classify and is not a failure', () => {
  const subject = createSyntheticTree(SPIKE_CLAIMLESS_FILES);
  const ledger = buildClaimLedger(resolveSlice(subject.root, 'ping'));

  assert.deepEqual(ledger.claims, []);
  assert.equal(ledger.note, 'nothing to classify');
  assert.equal(ledger.unresolvedRate, 0);
  assert.deepEqual(ledger.byClass, { observed: 0, inferred: 0, normative: 0, unresolved: 0 });
  subject.dispose();
});

// --- UT-6 / boundary: a single claim is a valid slice --------------------------

test('UT-6: a single-claim ledger is valid and renders one card', () => {
  const subject = createSyntheticTree(SPIKE_SINGLE_CLAIM_FILES);
  const ledger = buildClaimLedger(resolveSlice(subject.root, 'solo'));

  assert.equal(ledger.claims.length, 1);
  const { cards, layered, suppressed } = renderDecisionCards(ledger);
  assert.equal(cards.length, 1);
  assert.equal(layered, false);
  assert.equal(suppressed, 0);
  subject.dispose();
});

// --- UT-8 / invariant: a claim_id is unique within a ledger --------------------

test('UT-8: a claim_id is unique within a ledger', () => {
  const subject = createSyntheticTree(SPIKE_SLICE_FILES);
  const ledger = buildClaimLedger(resolveSlice(subject.root, 'login'));
  const ids = ledger.claims.map((claim) => claim.claim_id);

  assert.equal(new Set(ids).size, ids.length);
  subject.dispose();
});

// --- UT-9 / C001 invariant: the F11 defence ------------------------------------

test('UT-9: evidence joined by a strong lineage relation is not two independent votes', () => {
  const implementationEvidence = {
    evidence_id: 'ev-impl-31',
    source_kind: 'impl',
    evidence_mode: 'source_static',
    source_span: { file: 'src/api/login.rs', line: 5 },
    lineage_edges: [],
  };
  const testEvidence = {
    evidence_id: 'ev-test-77',
    source_kind: 'unit-test',
    evidence_mode: 'source_static',
    source_span: { file: 'src/api/login.rs', line: 5 },
    lineage_edges: [
      { relation: 'same_syntax_span', target: 'ev-impl-31', confidence: 'high', basis: ['src/api/login.rs:5'] },
    ],
  };
  assert.equal(countIndependentSupport([implementationEvidence, testEvidence]), 1);

  const weaklyRelated = {
    ...testEvidence,
    evidence_id: 'ev-readme-12',
    lineage_edges: [
      { relation: 'similar_wording', target: 'ev-impl-31', confidence: 'weak', basis: ['src/api/login.rs:5'] },
    ],
  };
  assert.equal(
    countIndependentSupport([implementationEvidence, weaklyRelated]),
    2,
    'similar_wording is a candidate for human review, never an automatic collapse',
  );
  assert.equal(countIndependentSupport([]), 0);
});

test('UT-9b: a claim folds its own evidence before reporting support', () => {
  const subject = createSyntheticTree(SPIKE_SLICE_FILES);
  const ledger = buildClaimLedger(resolveSlice(subject.root, 'login'));
  const crossing = ledger.claims.find((claim) => claim.subjectKind === 'boundary_crossing');

  assert.equal(crossing.support.length, countIndependentSupport(crossing.evidence));
  assert.ok(crossing.support.length >= 1);
  subject.dispose();
});

// --- classifyClaim: the four values are enforced, not decorated ----------------

test('C001 postcondition: a claim missing the field its class requires is refused', () => {
  const base = { claim_id: 'clm-x', evidence: [], basis: [], grill_question: '', normative_decision_id: null };

  assert.throws(() => classifyClaim({ ...base, claim_type: 'observed' }), /evidence/);
  assert.throws(() => classifyClaim({ ...base, claim_type: 'inferred' }), /basis/);
  assert.throws(() => classifyClaim({ ...base, claim_type: 'unresolved' }), /grill_question/);
  assert.throws(() => classifyClaim({ ...base, claim_type: 'normative' }), /normative_decision_id/);
  assert.throws(() => classifyClaim({ ...base, claim_type: 'settled' }), /settled/);
});

// --- UT-3 / C002: the card carries six things ----------------------------------

test('UT-3: every card carries question, options, consequences, evidence, counterexamples and a default', () => {
  const subject = createSyntheticTree(SPIKE_SLICE_FILES);
  const ledger = buildClaimLedger(resolveSlice(subject.root, 'login'));
  const { cards } = renderDecisionCards(ledger);
  const markdown = renderCardsMarkdown(cards);

  for (const heading of ['### Question', '- **Options**', '- **Consequences**', '- **Evidence**', '- **Counterexamples**', '- **Default**']) {
    assert.ok(markdown.includes(heading), `the card body must carry ${heading}`);
  }
  for (const card of cards) {
    assert.ok(card.question.length > 0);
    assert.ok(card.options.length >= 2, 'a card with one option is not a decision');
    assert.equal(card.options.length, card.consequences.length);
    assert.ok(card.default.length > 0);
    assert.ok(Array.isArray(card.counterexamples));
  }
  subject.dispose();
});

test('C002 invariant: a card subject is one falsifiable proposition and never demands prose', () => {
  const subject = createSyntheticTree(SPIKE_SLICE_FILES);
  const ledger = buildClaimLedger(resolveSlice(subject.root, 'login'));
  const { cards } = renderDecisionCards(ledger);
  const markdown = renderCardsMarkdown(cards);

  for (const card of cards) {
    assert.ok(CARD_SUBJECT_KINDS.includes(card.subjectKind), `${card.claim_id} names a declared subject kind`);
  }
  assert.ok(!FREE_FORM_DEMAND.test(markdown), 'the card asks a structured question, not for an essay');
  subject.dispose();
});

test('C002 invariant: a card whose claim is unresolved hands the question to the human grill', () => {
  const subject = createSyntheticTree(SPIKE_SLICE_FILES);
  const ledger = buildClaimLedger(resolveSlice(subject.root, 'login'));
  const { cards } = renderDecisionCards(ledger);

  const unresolvedCard = cards.find((card) => card.claimType === 'unresolved');
  assert.ok(unresolvedCard, 'the fixture yields one unresolved claim');
  assert.equal(unresolvedCard.default, unresolvedCard.options[unresolvedCard.options.length - 1]);
  assert.match(unresolvedCard.options[unresolvedCard.options.length - 1], /human grill/);
  subject.dispose();
});
