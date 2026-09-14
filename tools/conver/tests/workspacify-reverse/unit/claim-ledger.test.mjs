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
// @verifies C003
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSyntheticTree } from '../helpers/scratch.mjs';
import { REPORT_LIST_LIMIT, emptyCoverage } from '../../../.claude/scripts/workspacify-reverse/lib/analysis-tech.mjs';

import {
  CLAIM_FAMILY_UNREADABLE_CODE,
  buildClaimLedger,
  buildEvidence,
  classifyClaim,
  demoteObservedDynamicClaims,
  renderClaimLedger,
} from '../../../.claude/scripts/workspacify-reverse/lib/claim-ledger.mjs';

/**
 * The published probe R2.5 and R3.5 were measured against. C003's invariant is
 * asserted over this rather than over a fixture, because 4,460 claims joined
 * against 792 mechanisms is a real test of the join and a fixture is not.
 */
const PROBE_LEDGER_PATH = fileURLToPath(new URL('../analysis/CLAIM-LEDGER.json', import.meta.url));
const PROBE_SURFACE_PATH = fileURLToPath(new URL('../analysis/EXECUTION-SURFACE.json', import.meta.url));
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

// ---------------------------------------------------------------------------
// C003 — rule R-1: a claim that depends on a dynamic mechanism is not observed
// on source evidence alone
// ---------------------------------------------------------------------------

/** A mechanism in the shape R2.5's surface emits. */
// [::TICKET::] P23-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-6 --for-spec --no-implementation-order`.
function couplingMechanism(kind, file, line) {
  return { id: `${kind}:${file}:${line}`, kind, file, line, spelling: '', note: '' };
}

/** A claim anchored at one source span, in the shape the ledger's families build. */
// [::TICKET::] P23-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-6 --for-spec --no-implementation-order`.
function anchoredClaim({ id, type = 'observed', file, line, basis = [], grillQuestion = '', mechanisms = null }) {
  const claim = {
    claim_id: id,
    subjectKind: 'boundary_crossing',
    claim_type: type,
    scope: 'src',
    provider: 'src/api',
    statement: `src consumes src/api through the reference at ${file}:${line}`,
    evidence: [
      {
        evidence_id: `ev-impl-${file.split('/').join('_')}-${line}`,
        source_kind: 'impl',
        evidence_mode: 'source_static',
        source_span: { file, line },
        lineage_edges: [],
      },
    ],
    basis: [...basis],
    counterevidence: [],
    falsification: `remove the reference at ${file}:${line} and observe whether the consumer still resolves`,
    grill_question: grillQuestion,
    normative_decision_id: null,
  };
  if (mechanisms !== null) claim.mechanisms = mechanisms;
  return claim;
}

test('C003 precondition — a claim carries an evidence mode per item and the mechanism identifier it depends on', () => {
  const ledger = demoteObservedDynamicClaims({
    mechanisms: [couplingMechanism('dynamic_dispatch', 'src/handler.rs', 5)],
    claims: [anchoredClaim({ id: 'clm-handler-5', file: 'src/handler.rs', line: 5 })],
  });

  assert.deepEqual(
    ledger.claims[0].mechanisms,
    ['dynamic_dispatch:src/handler.rs:5'],
    'the join is by the source span the claim is anchored at, and the mechanism it lands on is recorded on the claim',
  );
  assert.equal(ledger.claims[0].demotion.rule, 'R-1');
});

test('C003 postcondition — a claim on source_static evidence that depends on a dynamic mechanism is demoted, and the demotion names the mechanism', () => {
  const ledger = demoteObservedDynamicClaims({
    mechanisms: [couplingMechanism('dynamic_dispatch', 'src/handler.rs', 5)],
    claims: [anchoredClaim({ id: 'clm-handler-5', file: 'src/handler.rs', line: 5 })],
  });
  const claim = ledger.claims[0];

  assert.equal(claim.claim_type, 'unresolved', 'the demotion target is unresolved when there is no basis to infer from');
  assert.ok(claim.grill_question.length > 0, 'unresolved requires the question it hands to the grill');
  assert.match(claim.grill_question, /dynamic_dispatch:src\/handler\.rs:5/);
  assert.equal(claim.demotion.from, 'observed');
  assert.deepEqual(claim.demotion.mechanisms, ['dynamic_dispatch:src/handler.rs:5']);
  assert.ok(claim.demotion.rationale.length > 0, 'the demotion states why it fired');
  assert.ok(claim.statement.length > 0, 'a demoted claim keeps its statement');
  assert.ok(claim.falsification.length > 0, 'a demoted claim keeps its falsification');
  assert.equal(claim.evidence.length, 1, 'a demoted claim keeps its evidence');
  assert.deepEqual(ledger.demotion.demoted, ['clm-handler-5']);
});

test('C003 postcondition — a claim that already carries a basis is demoted to inferred, with the rationale appended to that basis', () => {
  const ledger = demoteObservedDynamicClaims({
    mechanisms: [couplingMechanism('ffi', 'src/bridge.rs', 9)],
    claims: [
      anchoredClaim({
        id: 'clm-bridge-9',
        file: 'src/bridge.rs',
        line: 9,
        basis: ['the crossing exists in the text; that it is a contract is an inference'],
      }),
    ],
  });
  const claim = ledger.claims[0];

  assert.equal(claim.claim_type, 'inferred');
  assert.equal(claim.basis.length, 2);
  assert.match(claim.basis[1], /ffi:src\/bridge\.rs:9/);
});

test('C003 postcondition — a claim with no dynamic dependency keeps its class', () => {
  const ledger = demoteObservedDynamicClaims({
    mechanisms: [couplingMechanism('ffi', 'src/other.rs', 9)],
    claims: [anchoredClaim({ id: 'clm-account-5', file: 'src/account.rs', line: 5 })],
  });

  assert.equal(ledger.claims[0].claim_type, 'observed');
  assert.equal(ledger.claims[0].demotion, undefined);
  assert.deepEqual(ledger.demotion.demoted, []);
  assert.equal(ledger.demotion.considered, 1);
});

test('C003 boundary — the predicate is "entirely source_static", not "contains source_static"', () => {
  const claim = anchoredClaim({ id: 'clm-mixed-5', file: 'src/handler.rs', line: 5 });
  claim.evidence = [
    ...claim.evidence,
    {
      evidence_id: 'ev-build-src_handler.rs-5',
      source_kind: 'build',
      evidence_mode: 'build_semantic',
      source_span: { file: 'src/handler.rs', line: 5 },
      lineage_edges: [],
    },
  ];
  const ledger = demoteObservedDynamicClaims({
    mechanisms: [couplingMechanism('dynamic_dispatch', 'src/handler.rs', 5)],
    claims: [claim],
  });

  assert.equal(ledger.claims[0].claim_type, 'observed', 'one non-source_static item is enough for the predicate not to hold');
  assert.deepEqual(ledger.demotion.demoted, []);
});

test('C003 boundary — a claim a rule would demote that is not observed is left alone, so the rule fires once and not repeatedly', () => {
  const ledger = demoteObservedDynamicClaims({
    mechanisms: [couplingMechanism('dynamic_dispatch', 'src/handler.rs', 5)],
    claims: [anchoredClaim({ id: 'clm-already', type: 'inferred', file: 'src/handler.rs', line: 5, basis: ['x'] })],
  });

  assert.equal(ledger.claims[0].claim_type, 'inferred');
  assert.deepEqual(ledger.demotion.demoted, []);
});

test('C003 postcondition — a claim naming a mechanism the ledger cannot resolve, with neither a basis nor a grill_question, is refused by name', () => {
  assert.throws(
    () =>
      demoteObservedDynamicClaims({
        mechanisms: [],
        claims: [
          anchoredClaim({
            id: 'clm-unmatched',
            file: 'src/handler.rs',
            line: 5,
            mechanisms: ['dynamic_dispatch:src/gone.rs:99'],
          }),
        ],
      }),
    (error) => {
      assert.match(error.message, /clm-unmatched/);
      assert.match(error.message, /grill_question|basis/);
      return true;
    },
  );
});

test('C003 postcondition — a claim naming a mechanism the ledger cannot resolve but carrying a grill_question becomes unresolved rather than being dropped', () => {
  const ledger = demoteObservedDynamicClaims({
    mechanisms: [],
    claims: [
      anchoredClaim({
        id: 'clm-unmatched-asked',
        file: 'src/handler.rs',
        line: 5,
        grillQuestion: 'Which implementation does the dispatch at src/handler.rs:5 select?',
        mechanisms: ['dynamic_dispatch:src/gone.rs:99'],
      }),
    ],
  });

  assert.equal(ledger.claims[0].claim_type, 'unresolved');
  assert.deepEqual(ledger.demotion.unmatched, ['dynamic_dispatch:src/gone.rs:99']);
  assert.deepEqual(ledger.demotion.demoted, ['clm-unmatched-asked']);
});

test('C003 invariant — the walk over the real probe ledger finds no observed claim on source_static evidence alone that depends on a dynamic mechanism', () => {
  const probeLedger = JSON.parse(readFileSync(PROBE_LEDGER_PATH, 'utf8'));
  const probeSurface = JSON.parse(readFileSync(PROBE_SURFACE_PATH, 'utf8'));
  const demoted = demoteObservedDynamicClaims({ ...probeLedger, mechanisms: probeSurface.mechanisms });

  const violating = demoted.claims.filter(
    (claim) =>
      claim.claim_type === 'observed' &&
      (claim.mechanisms ?? []).length > 0 &&
      (claim.evidence ?? []).every((item) => item.evidence_mode === 'source_static'),
  );
  assert.deepEqual(violating.map((claim) => claim.claim_id), [], 'R-1 is total over its predicate on the real probe ledger');

  assert.ok(demoted.demotion.demoted.length >= 1, 'the rule fires on the real ledger rather than being vacuous');
  assert.equal(demoted.byClass.observed, 336, 'the rule demotes the one claim the join finds and no more');
  assert.ok(demoted.byClass.observed > 0, 'a rule that emptied the ledger of observed claims would read as a clean, wrong result');
  assert.deepEqual(demoted.demotion.unmatched, []);
});

test('C003 invariant — the join fires on the real ledger at the line the claim is anchored at, not at every file that holds a mechanism', () => {
  const probeLedger = JSON.parse(readFileSync(PROBE_LEDGER_PATH, 'utf8'));
  const probeSurface = JSON.parse(readFileSync(PROBE_SURFACE_PATH, 'utf8'));
  const demoted = demoteObservedDynamicClaims({ ...probeLedger, mechanisms: probeSurface.mechanisms });

  for (const claim of demoted.claims) {
    if ((claim.mechanisms ?? []).length === 0) continue;
    const anchors = claim.evidence.map((item) => `${item.source_span.file}:${item.source_span.line}`);
    for (const id of claim.mechanisms) {
      const mechanism = probeSurface.mechanisms.find((item) => item.id === id);
      assert.ok(
        anchors.includes(`${mechanism.file}:${mechanism.line}`),
        `${claim.claim_id} names ${id}, which must sit at the line the claim is anchored at`,
      );
    }
  }
});

test('C003 invariant — a source file the walker listed and could not read is recorded as a limit, not thrown from', () => {
  // The population R0 measures includes entries the run cannot read — a dangling
  // symlink, a permission the process does not hold. Reading one of them threw
  // out of the whole stage, which turned a limit of the walk into a failed run
  // and made the ledger's dependency on R0's completeness invisible.
  const subject = createSyntheticTree({
    'src/api/login.rs': 'use crate::error::LoginError;\nassert!(true);\n',
    'src/error.rs': 'pub enum LoginError {\n    Locked,\n}\n',
  });
  symlinkSync(join(subject.root, 'src', 'missing.rs'), join(subject.root, 'src', 'gone.rs'));
  try {
    const ledger = buildClaimLedger({ root: subject.root });

    assert.ok(ledger.claims.length > 0, 'the readable part of the population still yields its claims');
    const limit = ledger.limitations.find((item) => item.code === CLAIM_FAMILY_UNREADABLE_CODE);
    assert.ok(limit, 'a file that is in the population and could not be read is reported, never dropped');
    assert.equal(limit.scope, 'src/gone.rs');
    assert.match(limit.effect, /could not be read/i);
    assert.equal(
      ledger.limitations.filter((item) => item.code === CLAIM_FAMILY_UNREADABLE_CODE).length,
      1,
      'the file is reported once, however many claim families would have read it',
    );
    assert.ok(
      ledger.claims.every((claim) => !claim.claim_id.includes('gone')),
      'no claim is anchored in a file that could not be read',
    );
  } finally {
    subject.dispose();
  }
});
