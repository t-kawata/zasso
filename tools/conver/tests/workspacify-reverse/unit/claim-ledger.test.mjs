// @verifies C002
// @verifies C003
// [::TICKET::] P22-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-5 --for-spec --no-implementation-order`.
/**
 * R3.5 — the claim ledger, and the evidence independence it is built to refuse.
 *
 * The ledger's job is not to collect support. Counting a unit test, a comment
 * and a README line derived from one design decision as three pieces of
 * evidence is the reverse-rotation form of a false green (F11), so what these
 * tests mostly assert is that the count a claim reports is a count of
 * *components*, never of records — and that where the text cannot settle the
 * question the ledger says `unknown` instead of guessing and calling the guess
 * proof.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createSyntheticTree } from '../helpers/scratch.mjs';
import { REPORT_LIST_LIMIT, emptyCoverage } from '../../../.claude/scripts/workspacify-reverse/lib/analysis-tech.mjs';

import {
  buildClaimLedger,
  buildEvidence,
  classifyClaim,
  renderClaimLedger,
} from '../../../.claude/scripts/workspacify-reverse/lib/claim-ledger.mjs';
import {
  computeIndependence,
  countIndependentSupport,
} from '../../../.claude/scripts/workspacify-reverse/lib/evidence-independence.mjs';
import {
  CANDIDATE_CLASSIFICATION,
  FOLDED_STRENGTHS,
  GROUP_KEY_SEPARATOR,
  INDEPENDENCE_ASSESSMENTS,
  INDEPENDENCE_POLICY,
  LINEAGE_RELATIONS,
  PROVENANCE_CLASSES,
  groupKey,
} from '../../../.claude/scripts/workspacify-reverse/lib/provenance.mjs';

const LEDGER_FIXTURE_FILES = Object.freeze({
  'Cargo.toml': '[package]\nname = "ledger-subject"\n',
  'src/api/login.rs': [
    'use crate::error::LoginError;',
    '',
    'pub fn login(name: &str, locked: bool) -> Result<u8, LoginError> {',
    '    assert!(!name.is_empty());',
    '    if locked {',
    '        return Err(LoginError::Locked);',
    '    }',
    '    Ok(1)',
    '}',
    '',
  ].join('\n'),
  'src/error.rs': ['pub enum LoginError {', '    Locked,', '}', ''].join('\n'),
  'src/api/gated.rs': [
    '#[cfg(feature = "ffi")]',
    'pub fn bridge() -> bool {',
    '    assert!(true);',
    '    true',
    '}',
    '',
  ].join('\n'),
});

/** The evidence record shape the ledger stores, built through the real factory. */
// [::TICKET::] P22-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-5 --for-spec --no-implementation-order`.
function evidenceOf(evidenceId, span, lineageEdges) {
  return { ...buildEvidence(span, 'impl', evidenceId), lineage_edges: lineageEdges };
}

// --- the shared key: the separator cannot be forged by what it joins -----------

test('a group key cannot be forged by the values it joins', () => {
  // The defect this closes is silent and reads as a merge. Joined with a space,
  // ("src/a b", "c") and ("src/a", "b c") spell the same key, so two package
  // edges become one and the count is wrong in the direction nobody checks.
  assert.notEqual(groupKey('src/a b', 'c'), groupKey('src/a', 'b c'));
  assert.notEqual(groupKey('a', 'bc'), groupKey('ab', 'c'));
  assert.notEqual(groupKey('a', 'b'), groupKey('ab', ''));
  assert.equal(groupKey('a', 'b'), groupKey('a', 'b'), 'the key is stable for identical parts');
  assert.equal(GROUP_KEY_SEPARATOR, String.fromCharCode(0), 'the separator is a character no part can contain');
  // A part that is absent is the empty string, never the text "undefined".
  assert.equal(groupKey('a', null, undefined), groupKey('a', '', ''));
});

// --- C002 precondition ---------------------------------------------------------

test('C002 precondition: computeIndependence requires an evidence list', () => {
  assert.throws(() => computeIndependence(null), /evidence/);
  assert.throws(() => computeIndependence(undefined), /evidence/);
  assert.deepEqual(computeIndependence([]).evidence, []);
  assert.equal(computeIndependence([]).independentCount, 0);
});

// --- C002 postcondition --------------------------------------------------------

test('C002 postcondition: every evidence item carries a mode, lineage edges and an assessment', () => {
  const evidence = [
    evidenceOf('ev-impl-31', { file: 'src/api/login.rs', line: 4 }, []),
    evidenceOf('ev-test-77', { file: 'tests/login_test.rs', line: 2 }, []),
  ];
  const folded = computeIndependence(evidence, { root: null });

  for (const item of folded.evidence) {
    assert.ok(['source_static', 'build_semantic', 'runtime_dynamic'].includes(item.evidence_mode));
    assert.ok(Array.isArray(item.lineage_edges), `${item.evidence_id} carries a lineage edge list`);
    assert.ok(
      INDEPENDENCE_ASSESSMENTS.includes(item.independence_assessment),
      `${item.evidence_id} carries an independence assessment`,
    );
  }
});

// --- C002 invariant / UT-10 / UT-14 --------------------------------------------

test('UT-10 and UT-14: a folded relation collapses and similar_wording never does', () => {
  const implementationEvidence = evidenceOf('ev-impl-31', { file: 'src/authz.rs', line: 42 }, []);
  const sameSpan = evidenceOf('ev-test-77', { file: 'src/authz.rs', line: 42 }, [
    { relation: 'same_syntax_span', target: 'ev-impl-31', confidence: 'high', basis: ['src/authz.rs:42-46'] },
  ]);
  const sameCommit = evidenceOf('ev-readme-12', { file: 'README.md', line: 3 }, [
    { relation: 'same_commit', target: 'ev-impl-31', confidence: 'medium', basis: ['git:a1b2c3d'] },
  ]);
  const similarWording = evidenceOf('ev-doc-13', { file: 'docs/notes.md', line: 8 }, [
    { relation: 'similar_wording', target: 'ev-impl-31', confidence: 'weak', basis: ['docs/notes.md:8'] },
  ]);

  // Strong and medium both collapse: the design names them 高 and 中, and both
  // count as one vote. Weak stays a candidate for a human to review.
  assert.equal(countIndependentSupport([implementationEvidence, sameSpan]), 1);
  assert.equal(countIndependentSupport([implementationEvidence, sameCommit]), 1);
  assert.equal(
    countIndependentSupport([implementationEvidence, similarWording]),
    2,
    'a weak relation must never silently reduce the evidence count',
  );
  assert.equal(countIndependentSupport([]), 0);

  assert.equal(LINEAGE_RELATIONS.similar_wording, 'weak');
  assert.ok(!FOLDED_STRENGTHS.includes('weak'));
  assert.ok(FOLDED_STRENGTHS.includes('strong') && FOLDED_STRENGTHS.includes('medium'));
});

test('C002 invariant: three artefacts with one derivation count once, not three', () => {
  const implementationEvidence = evidenceOf('ev-impl-31', { file: 'src/authz.rs', line: 42 }, []);
  const testEvidence = evidenceOf('ev-test-77', { file: 'src/authz.rs', line: 42 }, [
    { relation: 'same_syntax_span', target: 'ev-impl-31', confidence: 'high', basis: ['src/authz.rs:42-46'] },
  ]);
  const readmeEvidence = evidenceOf('ev-readme-12', { file: 'README.md', line: 3 }, [
    { relation: 'same_commit', target: 'ev-impl-31', confidence: 'medium', basis: ['git:a1b2c3d'] },
  ]);

  const folded = computeIndependence([implementationEvidence, testEvidence, readmeEvidence], { root: null });
  assert.equal(folded.independentCount, 1);
  assert.ok(
    folded.independentCount < folded.evidence.length,
    'the independent group count is strictly less than the raw evidence count',
  );
});

test('UT-3: computeIndependence attaches edges and carries the policy beside them', () => {
  const evidence = [
    evidenceOf('ev-1', { file: 'src/authz.rs', line: 42 }, []),
    evidenceOf('ev-2', { file: 'src/authz.rs', line: 99 }, []),
  ];
  const folded = computeIndependence(evidence, { root: null });

  assert.ok(folded.evidence.every((item) => Array.isArray(item.lineage_edges)));
  assert.ok(folded.evidence.every((item) => INDEPENDENCE_ASSESSMENTS.includes(item.independence_assessment)));
  assert.ok(folded.independentCount >= 1 && folded.independentCount <= folded.evidence.length);
  assert.equal(folded.independence_policy, INDEPENDENCE_POLICY);
  // The policy and the edges travel together, so a human can correct a grouping
  // later without re-running the extraction.
  assert.ok(Array.isArray(folded.policyInputs.edges));
});

test('UT-15: an undeterminable assessment is unknown, never defaulted to independent', () => {
  const evidence = [
    evidenceOf('ev-a', { file: 'src/a.rs', line: 1 }, []),
    evidenceOf('ev-b', { file: 'docs/notes.md', line: 9 }, []),
  ];
  const folded = computeIndependence(evidence, { root: null, history: null });

  assert.equal(folded.evidence[0].independence_assessment, 'unknown');
  assert.equal(folded.evidence[1].independence_assessment, 'unknown');
  assert.equal(folded.independentCount, 2, 'unknown is a legal value and still counts two components');
  assert.ok(INDEPENDENCE_ASSESSMENTS.includes('unknown'), 'unknown is first-class, not a failure');
});

// --- C003 precondition ---------------------------------------------------------

test('C003 precondition: buildClaimLedger refuses a population it was not given', () => {
  assert.throws(() => buildClaimLedger(null), /population/);
  assert.throws(() => buildClaimLedger({}), /root/);

  // A population that carries nothing classifiable yields an empty ledger and
  // says so, rather than raising: an empty extraction is an observation.
  const empty = createSyntheticTree({ 'src/api/ping.rs': 'pub fn ping() -> u8 { 1 }\n' });
  const ledger = buildClaimLedger({ root: empty.root });
  assert.deepEqual(ledger.claims, []);
  assert.equal(ledger.note, 'nothing to classify');
  empty.dispose();
});

// --- C003 postcondition / UT-11 / UT-12 ----------------------------------------

test('C003 postcondition: every claim carries id, scope, falsification and one of four values', () => {
  const subject = createSyntheticTree(LEDGER_FIXTURE_FILES);
  const ledger = buildClaimLedger({ root: subject.root });

  assert.ok(ledger.claims.length > 0, 'the fixture yields claims');
  for (const claim of ledger.claims) {
    assert.ok(claim.claim_id.length > 0, 'a claim carries a claim_id');
    assert.ok(PROVENANCE_CLASSES.includes(claim.claim_type), `${claim.claim_id} carries ${claim.claim_type}`);
    assert.ok(claim.scope.length > 0, `${claim.claim_id} states the scope it holds in`);
    assert.ok(claim.falsification.length > 0, `${claim.claim_id} states what would reject it`);
    assert.ok(claim.evidence.length > 0, `${claim.claim_id} carries the evidence it rests on`);
    assert.ok(Array.isArray(claim.support), `${claim.claim_id} reports its independent support`);
  }

  const counted = PROVENANCE_CLASSES.reduce((total, name) => total + ledger.byClass[name], 0);
  assert.equal(counted, ledger.claims.length, 'the four-value histogram accounts for every claim');
  subject.dispose();
});

test('UT-11: a claim_id is unique across the ledger', () => {
  const subject = createSyntheticTree(LEDGER_FIXTURE_FILES);
  const ledger = buildClaimLedger({ root: subject.root });

  const ids = ledger.claims.map((claim) => claim.claim_id);
  assert.equal(new Set(ids).size, ids.length);
  const candidateIds = ledger.candidates.map((candidate) => candidate.candidate_id);
  assert.equal(new Set(candidateIds).size, candidateIds.length);
  subject.dispose();
});

test('UT-12: running the extraction twice over identical input yields identical output', () => {
  const subject = createSyntheticTree(LEDGER_FIXTURE_FILES);
  const first = buildClaimLedger({ root: subject.root });
  const second = buildClaimLedger({ root: subject.root });

  assert.deepEqual(second.claims, first.claims);
  assert.deepEqual(second.candidates, first.candidates);
  assert.deepEqual(second.byClass, first.byClass);
  subject.dispose();
});

// --- C003 invariant / UT-9 -----------------------------------------------------

test('C003 invariant: every unresolved claim carries a non-empty grill_question', () => {
  const subject = createSyntheticTree(LEDGER_FIXTURE_FILES);
  const ledger = buildClaimLedger({ root: subject.root });

  const unresolved = ledger.claims.filter((claim) => claim.claim_type === 'unresolved');
  assert.ok(unresolved.length > 0, 'the cfg-gated fixture produces an unresolved claim');
  for (const claim of unresolved) {
    assert.ok(claim.grill_question.length > 0, `${claim.claim_id} asks the human something`);
    assert.equal(classifyClaim(claim), 'unresolved');
  }
  subject.dispose();
});

// --- UT-2: a class is a warrant, not a label -----------------------------------

test('UT-2: a claim missing the field its class requires is refused', () => {
  const base = {
    claim_id: 'clm-x',
    claim_type: 'observed',
    scope: 'src',
    evidence: [],
    basis: [],
    grill_question: '',
    falsification: 'mutate the guard at src/x.rs:1 and observe whether a test fails',
    normative_decision_id: null,
  };

  assert.throws(() => classifyClaim({ ...base, claim_type: 'observed' }), /evidence/);
  assert.throws(() => classifyClaim({ ...base, claim_type: 'inferred' }), /basis/);
  assert.throws(() => classifyClaim({ ...base, claim_type: 'unresolved' }), /grill_question/);
  assert.throws(() => classifyClaim({ ...base, claim_type: 'normative' }), /normative_decision_id/);
  assert.throws(() => classifyClaim({ ...base, claim_type: 'settled' }), /settled/);

  // A claim stating no falsification condition is rejected rather than stored:
  // a proposition nothing could reject is not a proposition about the code.
  const evidenced = {
    ...base,
    evidence: [buildEvidence({ file: 'src/x.rs', line: 1 }, 'impl')],
  };
  assert.throws(() => classifyClaim({ ...evidenced, falsification: '' }), /falsification/);
  assert.equal(classifyClaim(evidenced), 'observed');
});

// --- the candidate/fact separation is enforced, not documented ----------------

test('C003: a candidate is never promoted, and the ledger keeps the two apart', () => {
  const subject = createSyntheticTree(LEDGER_FIXTURE_FILES);
  const ledger = buildClaimLedger({ root: subject.root });

  assert.ok(ledger.candidates.length > 0, 'stage two produced candidates');
  for (const candidate of ledger.candidates) {
    assert.equal(candidate.classification, CANDIDATE_CLASSIFICATION);
    assert.equal(candidate.requires_human_approval, true);
    assert.notEqual(candidate.claim_type, 'normative');
  }
  // Candidates are not members of `claims`: a reader counting claims is not
  // counting candidates, and vice versa.
  const claimIds = new Set(ledger.claims.map((claim) => claim.claim_id));
  for (const candidate of ledger.candidates) {
    assert.ok(!claimIds.has(candidate.candidate_id));
  }
  subject.dispose();
});

// --- the ledger as the Markdown an AI reads before deciding --------------------

test('the rendered ledger reports components rather than records, and names what it could not look at', () => {
  const subject = createSyntheticTree(LEDGER_FIXTURE_FILES);
  const ledger = buildClaimLedger({ root: subject.root });
  const markdown = renderClaimLedger(ledger);

  assert.match(markdown, /## Claim ledger/);
  assert.match(markdown, /independent support/);
  assert.match(markdown, /Independence policy:/);
  assert.match(markdown, /unknown/);

  for (const claim of ledger.claims) {
    assert.ok(markdown.includes(claim.claim_id), `${claim.claim_id} appears in the report`);
  }
  for (const claim of ledger.claims.filter((item) => item.claim_type === 'unresolved')) {
    assert.ok(markdown.includes(claim.grill_question), 'an unresolved claim shows the question it hands over');
  }
  subject.dispose();
});

test('the ledger records the observation channels the run did not use', () => {
  const subject = createSyntheticTree(LEDGER_FIXTURE_FILES);
  const ledger = buildClaimLedger({ root: subject.root });

  assert.ok(Array.isArray(ledger.unavailableChannels) && ledger.unavailableChannels.length > 0);
  for (const channel of ledger.unavailableChannels) {
    assert.equal(channel.used, false);
    assert.ok(channel.reason.length > 0);
  }
  subject.dispose();
});

test('a ledger larger than the report limit is capped and says how many it did not print', () => {
  // Four thousand claims rendered in full is three megabytes of bullets, which
  // is not a report anyone reads. The cap is not the risk — a *silent* cap is,
  // because it reads as the whole of the evidence, so the count of what was
  // withheld is asserted here rather than trusted.
  const manyAssertions = Array.from(
    { length: REPORT_LIST_LIMIT + 15 },
    (_, index) => `    assert!(value_${index} > 0);`,
  );
  const subject = createSyntheticTree({
    'Cargo.toml': '[package]\nname = "ledger-large"\n',
    'src/api/wide.rs': [
      'pub fn wide(value_0: u8) -> u8 {',
      ...manyAssertions,
      '    value_0',
      '}',
      '',
    ].join('\n'),
  });
  const ledger = buildClaimLedger({ root: subject.root });
  const markdown = renderClaimLedger(ledger);

  assert.ok(
    ledger.claims.length > REPORT_LIST_LIMIT,
    `the fixture yields more than ${REPORT_LIST_LIMIT} claims; it yielded ${ledger.claims.length}`,
  );

  const printed = ledger.claims.filter((claim) => markdown.includes(claim.claim_id));
  assert.equal(printed.length, REPORT_LIST_LIMIT, 'exactly the limit is printed');
  assert.match(
    markdown,
    new RegExp(`and ${ledger.claims.length - REPORT_LIST_LIMIT} more, every one recorded in the JSON`),
    'the report states how many it withheld rather than capping silently',
  );
  // The summary is what a reader decides from, so it is never capped.
  assert.match(markdown, /### Evidence independence/);
  assert.match(markdown, new RegExp(`Claims: ${ledger.claims.length}`));
  subject.dispose();
});

test('the ledger carries no undefined field, so it can be serialised', () => {
  // A renamed key that a reader still looks up by its old name yields
  // `undefined`, which JSON.stringify refuses — but only at the moment the run
  // publishes, long after the rename looked finished. Asserting the whole
  // record is free of undefined catches it where it is introduced.
  const subject = createSyntheticTree(LEDGER_FIXTURE_FILES);
  const ledger = buildClaimLedger({ root: subject.root });

  const undefinedPaths = [];
  const walk = (value, path) => {
    if (value === undefined) {
      undefinedPaths.push(path);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }
    if (value !== null && typeof value === 'object') {
      for (const key of Object.keys(value)) walk(value[key], `${path}.${key}`);
    }
  };
  walk(ledger, 'ledger');

  assert.deepEqual(undefinedPaths, [], 'a ledger with an undefined field cannot be published');
  assert.equal(ledger.independence.policy, INDEPENDENCE_POLICY);
  assert.equal(typeof ledger.independence.rawEvidenceCount, 'number');
  for (const claim of ledger.claims) {
    assert.ok(claim.statement.length > 0, `${claim.claim_id} carries the statement the schema names`);
    assert.equal(claim.independence_policy, INDEPENDENCE_POLICY);
  }
  subject.dispose();
});
