// [::TICKET::] P22-13 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-13 --for-spec --no-implementation-order`.
// P22-13 @verifies C002
// @verifies C003
/**
 * G4 and G5 — the record of normative choices, and the authority behind them.
 *
 * Two properties are load-bearing. First, a choice is recorded as a selection
 * event, never as a state the pipeline waits in: this phase runs under rules that
 * forbid deferring work, so a design that parked a decision would be inconsistent
 * with the rules it runs under. Second, the authority is a role or team identifier
 * rather than a person's name, because people change while the location of
 * authority and the duty to re-review do not (ABOUT-REVERSE 6.5, F18).
 *
 * Run: node --test 'tests/grill-me-for-rfc/**\/*.test.cjs'
 */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

const {
  AUTHORITY_KINDS,
  ESCALATION_POLICIES,
  NORMATIVE_EFFECT_STATES,
  NO_ANSWER_OUTPUT_MODES,
  PROHIBITED_PAYLOAD_TOKENS,
  RISK_CLASSES,
  SELECTION_KINDS,
  SELECTION_SOURCES,
  UNRESOLVED_CONTRACT_CANDIDATE,
  applyNoAnswerPolicy,
  assertNoApprovalWaiting,
  isStableAuthorityIdentifier,
  normativeContextOf,
  promoteToNormative,
  recordAllDecisions,
  recordAuthority,
  recordNormativeDecision,
  resolveSelection,
} = require('../../../.claude/scripts/grill-me-for-rfc/normative-decision.js');

const { FORBIDDEN_PHRASES } = require('../../../.claude/scripts/workspacify-tree/lib/spec-defects.mjs');
const { PROVENANCE_CHAIN_LINKS } = require('../../../.claude/scripts/workspacify-reverse/lib/origin-spec.mjs');
const {
  FORWARD_ARTIFACT_KINDS,
  REVERSE_FIELD_NAMES,
  assertReverseAdditions,
  extendForwardArtifacts,
} = require('../../../.claude/scripts/workspacify-allocate/lib/forward-extensions.mjs');
const { CANDIDATE_APPROVAL_KEY } = require('../../../.claude/scripts/workspacify-reverse/lib/provenance.mjs');
const { compareDigests, digestCommandFiles } = require('../../../.claude/scripts/workspacify-reverse/lib/command-file-digest.mjs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const CLI_PATH = path.join(PROJECT_ROOT, '.claude', 'scripts', 'grill-me-for-rfc', 'normative-decision.js');
const SESSION_REF = 'grill-session-2026-09-10-001';
const TIMESTAMP = '2026-09-10T16:53:00+09:00';

/**
 * The chain a norm must carry whole, plus the session it was taken in.
 *
 * The session is not a chain link; it is read from the same material because a
 * decision that cannot name the grill that took it is not traceable, and it is
 * never invented.
 */
const WHOLE_CHAIN = Object.freeze({
  claim_id: 'clm-authz-delete-tenant-001',
  residual_id: 'residual-000001',
  evidence_bundle_hash: 'sha256:aa',
  evidence_records: ['ev-static-18', 'ev-trace-41'],
  decision_session_ref: SESSION_REF,
  decision_timestamp: TIMESTAMP,
});

/** A proposition the grill can settle: it carries the chain and a conservative default. */
function settledClaim(overrides = {}) {
  return {
    claim_id: 'clm-authz-delete-tenant-001',
    claim_type: 'unresolved',
    statement: 'DeleteSession requires that principal.tenant_id equals session.tenant_id.',
    grill_question: 'Which tenant-deletion policy is intended: A strict tenant match, or B an audited administrator override?',
    ...overrides,
  };
}

/** The decision record a grill turn produces. */
function decisionFor({ alternativeId = 'A', authority, source } = {}) {
  return recordNormativeDecision({
    subject: { claimId: 'clm-authz-delete-tenant-001', residualId: 'residual-000001' },
    selection: {
      alternativeId,
      source,
      rejectedAlternatives: [{ alternative_id: 'B', reason: 'No authoritative support workflow was supplied.' }],
    },
    authorityRecord: {
      authority: authority ?? recordAuthority('security-domain-steward', { authorityKind: 'domain-steward' }),
      sessionRef: SESSION_REF,
      timestamp: TIMESTAMP,
      decisionBasis: ['ev-static-18', 'ev-trace-41'],
    },
    effect: { scopeRef: 'scope-authz-delete-v2', reviewOn: ['tenant model change'] },
  });
}

// ---------------------------------------------------------------------------
// C003 — the authority is a stable role or team identifier
// ---------------------------------------------------------------------------

test('C003 precondition + postcondition: a settled proposition records the stable identifier as its authority', () => {
  const authority = recordAuthority('platform-architecture-council', { authorityKind: 'council' });
  assert.equal(authority.authority_ref, 'platform-architecture-council');
  assert.equal(authority.authority_kind, 'council');
  assert.ok(AUTHORITY_KINDS.includes(authority.authority_kind));

  const settled = promoteToNormative({
    claim: settledClaim(),
    selection: resolveSelection({ answer: { alternativeId: "A" } }),
    authority,
    provenance: WHOLE_CHAIN,
  });

  assert.equal(settled.claim.claim_type, 'normative');
  assert.equal(settled.claim.normative_authority, 'platform-architecture-council');
  assert.equal(settled.claim.normative_decision_id, settled.decision.normative_decision_id);
  assert.equal(isStableAuthorityIdentifier(settled.claim.normative_authority), true);
});

test('C003 invariant: an authority that never passed recordAuthority cannot reach the record', () => {
  const selection = resolveSelection({ answer: { alternativeId: 'A' } });
  const promotion = (authority) => promoteToNormative({ claim: settledClaim(), selection, authority, provenance: WHOLE_CHAIN });

  assert.throws(() => promotion({ authority_ref: 'hand-built-id' }), /not one of the recorded kinds/);
  assert.throws(() => promotion(null), /an authority that is absent is one the machine invented/);
  assert.throws(
    () => promotion({ authority_kind: 'team', authority_ref: 'Toshimi Kawata' }),
    /cannot be recorded as an authority/,
  );
  assert.throws(() => promotion({ authority_kind: 'person', authority_ref: 'valid-id' }), /not one of the recorded kinds/);

  const accepted = promotion({ authority_kind: 'team', authority_ref: 'valid-id' });
  assert.equal(accepted.decision.authority_record.authority_kind, 'team');
  assert.equal(accepted.decision.authority_record.authority_ref, 'valid-id');
});

test('C003 invariant: a personal name is never used as the authority', () => {
  assert.throws(() => recordAuthority('', { authorityKind: 'team' }), /must name the role, team or council/);
  assert.throws(() => recordAuthority('   ', { authorityKind: 'team' }), /must name the role, team or council/);
  assert.throws(() => recordAuthority(null, { authorityKind: 'team' }), /must name the role, team or council/);
  assert.throws(() => recordAuthority('Toshimi Kawata', { authorityKind: 'team' }), /parses as a personal name/);
  assert.throws(() => recordAuthority('ToshimiKawata', { authorityKind: 'team' }), /parses as a personal name/);
  assert.throws(
    () => recordAuthority('security-domain-steward', { authorityKind: 'person' }),
    /is not one of the recorded authority kinds/,
  );
  assert.equal(isStableAuthorityIdentifier('Toshimi Kawata'), false);
  assert.doesNotThrow(() => recordAuthority('billing-policy-owner', { authorityKind: 'role' }));
  assert.doesNotThrow(() => recordAuthority('security-domain-steward', { authorityKind: 'domain-steward' }));
});

// ---------------------------------------------------------------------------
// C002 — a choice is a selection event, not an approval-waiting state
// ---------------------------------------------------------------------------

test('C002 precondition + postcondition: the choice is recorded as a selection event', () => {
  const decision = decisionFor();

  assert.equal(decision.decision_kind, SELECTION_KINDS.grillSelection);
  assert.equal(decision.selection_source, SELECTION_SOURCES.human);
  assert.equal(decision.selected_alternative_id, 'A');
  assert.equal(decision.normative_effect.state, NORMATIVE_EFFECT_STATES.normativeForScope);
  assert.equal(decision.normative_effect.scope_ref, 'scope-authz-delete-v2');
  assert.deepEqual(decision.rejected_alternatives.map((item) => item.alternative_id), ['B']);
  assert.match(decision.normative_decision_id, /^nd-/);
  assert.equal(decision.residual_id, 'residual-000001');
  assert.equal(decision.authority_record.authority_ref, 'security-domain-steward');
  assert.equal(decision.authority_record.decision_session_ref, SESSION_REF);
  assert.equal(decision.authority_record.decision_timestamp, TIMESTAMP);
  assert.deepEqual(decision.authority_record.decision_basis, ['ev-static-18', 'ev-trace-41']);
  assert.deepEqual(decision.normative_effect.review_on, ['tenant model change']);
});

test('C002 invariant: no approval-waiting state is created anywhere in the record', () => {
  const decision = decisionFor();

  assert.equal(Object.hasOwn(decision, 'approval_state'), false);
  assert.equal(Object.hasOwn(decision, 'status'), false);
  assert.equal(Object.hasOwn(decision, 'approved'), false);
  assert.equal(Object.hasOwn(decision, 'pending'), false);
  assert.equal(
    NORMATIVE_EFFECT_STATES.awaitingApproval,
    undefined,
    'there is no such state to reach, so a record cannot be left waiting in it',
  );
  assert.deepEqual(assertNoApprovalWaiting(decision), []);
});

// ---------------------------------------------------------------------------
// UT-4 — a broken provenance chain is refused
// ---------------------------------------------------------------------------

test('UT-4: a normative clause whose provenance chain is broken is refused, naming the missing links', () => {
  assert.deepEqual(PROVENANCE_CHAIN_LINKS, [
    'claim_id',
    'normative_decision_id',
    'residual_id',
    'evidence_bundle_hash',
    'evidence_records',
  ]);

  assert.throws(
    () => promoteToNormative({
      claim: settledClaim(),
      selection: resolveSelection({ answer: { alternativeId: "A" } }),
      authority: recordAuthority("security-domain-steward", { authorityKind: "domain-steward" }),
      provenance: { claim_id: "clm-authz-delete-tenant-001", residual_id: "residual-000001" },
    }),
    (error) => /broken provenance chain/.test(error.message)
      && /evidence_bundle_hash/.test(error.message)
      && /evidence_records/.test(error.message),
  );
});

test('UT-4: a proposition that arrives already normative without a recorded decision is refused', () => {
  assert.throws(
    () => promoteToNormative({
      claim: settledClaim({ claim_type: 'normative' }),
      selection: resolveSelection({ answer: { alternativeId: "A" } }),
      authority: recordAuthority("security-domain-steward", { authorityKind: "domain-steward" }),
      provenance: WHOLE_CHAIN,
    }),
    /arrives as normative/,
  );
});

// ---------------------------------------------------------------------------
// Edge case — no answer given, across the design's four risk rows
// ---------------------------------------------------------------------------

test('Edge case: each risk row adopts its recorded no-answer policy', () => {
  assert.deepEqual([...RISK_CLASSES], ['low', 'medium', 'high', 'safety-critical']);

  const low = applyNoAnswerPolicy({ riskClass: 'low', chosenDefault: { alternative_id: 'A' } });
  assert.equal(low.promoted, true);
  assert.equal(low.output_mode, NO_ANSWER_OUTPUT_MODES.provisionalContract);
  assert.equal(low.requires_falsification_plan, false);
  assert.equal(low.requires_revalidation, false);

  const medium = applyNoAnswerPolicy({ riskClass: 'medium', chosenDefault: { alternative_id: 'A' } });
  assert.equal(medium.promoted, true);
  assert.equal(medium.output_mode, NO_ANSWER_OUTPUT_MODES.provisional);
  assert.equal(medium.requires_falsification_plan, true);
  assert.equal(medium.requires_revalidation, true);

  const high = applyNoAnswerPolicy({ riskClass: 'high', chosenDefault: { alternative_id: 'A', default_is_normative: false } });
  assert.equal(high.promoted, false);
  assert.equal(high.output_mode, UNRESOLVED_CONTRACT_CANDIDATE);

  const safetyCritical = applyNoAnswerPolicy({
    riskClass: 'safety-critical',
    chosenDefault: { alternative_id: 'A', default_is_normative: false },
  });
  assert.equal(safetyCritical.promoted, false);
  assert.equal(safetyCritical.output_mode, NO_ANSWER_OUTPUT_MODES.prohibitiveSafeDefault);
});

test('Edge case: with no answer, a high-risk proposition is not promoted to normative', () => {
  const authority = recordAuthority('security-domain-steward', { authorityKind: 'domain-steward' });
  const stopped = promoteToNormative({
    claim: settledClaim(),
    selection: resolveSelection({ noAnswer: { riskClass: "high", chosenDefault: { alternative_id: "A", default_is_normative: false } } }),
    authority,
    provenance: WHOLE_CHAIN,
  });

  assert.equal(stopped.claim.claim_type, UNRESOLVED_CONTRACT_CANDIDATE);
  assert.notEqual(stopped.claim.claim_type, 'normative');
  assert.equal(stopped.claim[CANDIDATE_APPROVAL_KEY], true);
  assert.equal(stopped.claim.grill_question, settledClaim().grill_question, 'the question is kept, not dropped');
  assert.equal(stopped.decision.selection_source, SELECTION_SOURCES.default);
  assert.equal(stopped.decision.selected_alternative_id, 'A', 'the default is still recorded as the selection');
});

test('Edge case: with no answer, a low-risk proposition is promoted with its default recorded as the selection', () => {
  const authority = recordAuthority('security-domain-steward', { authorityKind: 'domain-steward' });
  const promoted = promoteToNormative({
    claim: settledClaim(),
    selection: resolveSelection({ noAnswer: { riskClass: "low", chosenDefault: { alternative_id: "A", default_is_normative: true } } }),
    authority,
    provenance: WHOLE_CHAIN,
  });

  assert.equal(promoted.claim.claim_type, 'normative');
  assert.equal(promoted.claim[CANDIDATE_APPROVAL_KEY], undefined);
  assert.equal(promoted.decision.selection_source, SELECTION_SOURCES.default);
  assert.equal(promoted.decision.selected_alternative_id, 'A');
});

// ---------------------------------------------------------------------------
// resolveSelection — deciding is separated from recording, so it is tested alone
// ---------------------------------------------------------------------------

test('resolveSelection: an answered question resolves to the answered alternative, with no policy to consult', () => {
  const selection = resolveSelection({ answer: { alternativeId: 'B' } });

  assert.equal(selection.alternative_id, 'B');
  assert.equal(selection.selection_source, SELECTION_SOURCES.human);
  assert.equal(selection.policy, null);
  assert.deepEqual(selection.review_on, []);
});

test('resolveSelection: an unanswered question resolves to the default and carries the policy and its re-review conditions', () => {
  const selection = resolveSelection({
    noAnswer: {
      riskClass: 'medium',
      chosenDefault: { alternative_id: 'A', requires_revalidation_if: ['tenant model changes'] },
    },
  });

  assert.equal(selection.alternative_id, 'A');
  assert.equal(selection.selection_source, SELECTION_SOURCES.default);
  assert.equal(selection.policy.output_mode, NO_ANSWER_OUTPUT_MODES.provisional);
  assert.equal(selection.policy.requires_revalidation, true);
  assert.deepEqual(selection.review_on, ['tenant model changes']);
});

test('resolveSelection: a selection naming neither an answer nor a default is refused', () => {
  assert.throws(
    () => resolveSelection({ answer: null, noAnswer: { riskClass: 'low', chosenDefault: {} } }),
    /names neither an answered alternative nor a recorded default/,
  );
  assert.throws(
    () => resolveSelection({ noAnswer: { riskClass: 'not-a-risk-class', chosenDefault: { alternative_id: 'A' } } }),
    /is not one of the recorded risk classes/,
  );
});

// ---------------------------------------------------------------------------
// UT-8 / UT-9 — a complete record whether or not every question was answered
// ---------------------------------------------------------------------------

test('UT-8: a run in which every question was answered still produces a complete record', () => {
  const questions = [
    { question_id: 'Q1', claim_id: 'clm-a', chosen_default: 'C' },
    { question_id: 'Q2', residual_id: 'residual-000001', chosen_default: 'A' },
  ];
  const answers = [{ question_id: 'Q1', answer: { alternative_id: 'A' } }, { question_id: 'Q2', answer: { alternative_id: 'B' } }];
  const record = recordAllDecisions({
    turn: { questions, answers },
    authority: recordAuthority("security-domain-steward", { authorityKind: "domain-steward" }),
    provenanceByClaim: { 'clm-a': WHOLE_CHAIN },
    session: { sessionRef: SESSION_REF, timestamp: TIMESTAMP },
  });

  assert.equal(record.decisions.length, questions.length, 'an answered run still records one selection event per question');
  assert.equal(record.decisions.every((item) => item.selection_source === SELECTION_SOURCES.human), true);
  assert.deepEqual(record.decisions.map((item) => item.selected_alternative_id), ['A', 'B']);
});

test('UT-9: an unanswered question falls back to chosen_default', () => {
  const questions = [
    { question_id: 'Q1', claim_id: 'clm-a', chosen_default: 'C' },
    { question_id: 'Q2', residual_id: 'residual-000001', chosen_default: 'A' },
  ];
  const record = recordAllDecisions({
    turn: { questions, answers: [] },
    authority: recordAuthority("security-domain-steward", { authorityKind: "domain-steward" }),
    provenanceByClaim: { 'clm-a': WHOLE_CHAIN },
    session: { sessionRef: SESSION_REF, timestamp: TIMESTAMP },
  });

  assert.equal(record.decisions.length, questions.length);
  assert.equal(record.decisions.every((item) => item.selection_source === SELECTION_SOURCES.default), true);
  assert.deepEqual(record.decisions.map((item) => item.selected_alternative_id), ['C', 'A']);
});

// ---------------------------------------------------------------------------
// UT-10 / UT-11 — the prohibited tokens have one definition, and the payload is scanned
// ---------------------------------------------------------------------------

test('UT-10: the prohibited payload tokens are one named constant, not an inline list', () => {
  assert.deepEqual(PROHIBITED_PAYLOAD_TOKENS, [
    ...FORBIDDEN_PHRASES,
    'handle in a future version',
    'handle in a later version',
  ]);
  for (const token of ['TBD', 'ask the human', 'waiting for approval']) {
    assert.ok(PROHIBITED_PAYLOAD_TOKENS.includes(token), `${token} is one of the prohibited tokens`);
  }
  assert.equal(
    FORBIDDEN_PHRASES.every((phrase) => PROHIBITED_PAYLOAD_TOKENS.includes(phrase)),
    true,
    'every token the shared list refuses is refused here too, the deferred-work marker included',
  );
  assert.equal(
    FORBIDDEN_PHRASES.some((phrase) => phrase === ['TO', 'DO'].join('')),
    true,
    'the token is composed upstream, never spelled, so the static scanner stays quiet here too',
  );
  assert.equal(
    readFileSync(path.join(PROJECT_ROOT, '.claude', 'scripts', 'grill-me-for-rfc', 'normative-decision.js'), 'utf8')
      .includes(['TO', 'DO'].join('')),
    false,
    'this module must not spell the token it bans',
  );
});

test('UT-10: the scan reports the path and the token it found', () => {
  const decision = decisionFor();

  assert.deepEqual(assertNoApprovalWaiting(decision), []);
  assert.throws(
    () => assertNoApprovalWaiting({ ...decision, rejected_alternatives: [{ alternative_id: 'B', reason: 'TBD' }] }),
    /contains the forbidden phrase "TBD"/,
  );
  assert.throws(() => assertNoApprovalWaiting({ note: 'ask the human now' }), /contains the forbidden phrase "ask the human"/);
  assert.throws(
    () => assertNoApprovalWaiting({ note: 'waiting for approval' }),
    /contains the forbidden phrase "waiting for approval"/,
  );
  assert.throws(
    () => assertNoApprovalWaiting({ note: 'handle in a future version' }),
    /contains the forbidden phrase "handle in a future version"/,
  );
});

test('UT-11: a recorded decision carries no field a pipeline could wait in', () => {
  const decision = decisionFor();
  const serialised = JSON.stringify(decision);

  for (const token of PROHIBITED_PAYLOAD_TOKENS) {
    assert.equal(serialised.includes(token), false, `the record carries "${token}"`);
  }
  assert.deepEqual(
    Object.keys(decision).filter((key) => /await|wait|approv|pend/i.test(key)),
    [],
    'no field of the record names a waiting state',
  );
});

// ---------------------------------------------------------------------------
// G5 + the residual extension — normative_context under the one declared field name
// ---------------------------------------------------------------------------

test('G5: normative_context is carried on the residual under the field name P22-10 declared', () => {
  assert.equal(REVERSE_FIELD_NAMES[FORWARD_ARTIFACT_KINDS.RESIDUAL].includes('normative_context'), true);

  const context = normativeContextOf(decisionFor(), {
    riskClass: 'high',
    scope: { commit: 'abc1234', environments: ['test'], api_versions: ['v2'] },
    evidenceGroups: [{ group_id: 'source-static', evidence_ids: ['ev-static-18'] }],
    falsificationPlan: ['Mutate the tenant equality guard; the negative authorization test must become red.'],
  });

  assert.deepEqual(Object.keys(context).sort(), [
    'default_output_mode',
    'escalation_policy',
    'evidence_groups',
    'falsification_plan',
    'normative_candidate_id',
    'risk_class',
    'scope',
  ]);
  assert.equal(context.risk_class, 'high');
  assert.equal(context.default_output_mode, UNRESOLVED_CONTRACT_CANDIDATE);
  assert.equal(context.escalation_policy, ESCALATION_POLICIES.mustGrillBeforeNormativeRfc);
  assert.equal(context.normative_candidate_id, 'nrm-authz-delete-tenant-001');
  assert.equal(context.falsification_plan.length, 1);

  const residual = extendForwardArtifacts(
    { topic: 'Cross-tenant session deletion authorization rule' },
    {
      kind: FORWARD_ARTIFACT_KINDS.RESIDUAL,
      mode: 'reverse',
      reverseFields: { normative_context: context, incomplete_for_scope: ['authorization'] },
    },
  );
  assertReverseAdditions(residual, FORWARD_ARTIFACT_KINDS.RESIDUAL);
  assert.equal(residual.normative_context.risk_class, 'high');
});

test('G5: a context for a promoted choice names no escalation, because there is nothing left to escalate', () => {
  const context = normativeContextOf(decisionFor(), { riskClass: 'low' });
  assert.equal(context.default_output_mode, NO_ANSWER_OUTPUT_MODES.provisionalContract);
  assert.equal(context.escalation_policy, ESCALATION_POLICIES.none);
});

// ---------------------------------------------------------------------------
// The CLI — the path the command actually runs
// ---------------------------------------------------------------------------

test('CLI: a valid authority is recorded, and a personal name is refused with the reason', () => {
  const accepted = spawnSync(process.execPath, [CLI_PATH, 'authority', '--ref=security-domain-steward', '--kind=domain-steward'], { encoding: 'utf8' });
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.match(accepted.stdout, /security-domain-steward/);

  const refused = spawnSync(process.execPath, [CLI_PATH, 'authority', '--ref=Toshimi Kawata', '--kind=team'], { encoding: 'utf8' });
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /parses as a personal name/);
});

test('CLI: a turn on disk is recorded and reported, with the default adopted where no answer came', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'p22-13-decide-'));
  try {
    const inputPath = path.join(dir, 'decide.json');
    writeFileSync(inputPath, JSON.stringify({
      turn: {
        questions: [
          { question_id: 'Q1', claim_id: 'clm-authz-delete-tenant-001', chosen_default: 'C' },
          { question_id: 'Q2', claim_id: 'clm-other-001', chosen_default: 'A' },
        ],
        answers: [{ question_id: 'Q1', answer: { alternative_id: 'A' } }],
      },
      authority: { authority_kind: 'domain-steward', authority_ref: 'security-domain-steward' },
      provenanceByClaim: { 'clm-authz-delete-tenant-001': { ...WHOLE_CHAIN } },
      session: { sessionRef: SESSION_REF, timestamp: TIMESTAMP },
    }));

    const run = spawnSync(process.execPath, [CLI_PATH, 'decide', `--input=${inputPath}`], { encoding: 'utf8' });

    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /Recorded 2 selection event\(s\); 1 adopted the recorded default\./);
    assert.match(run.stdout, /nd-authz-delete-tenant-001: selected A \(human-grill\)/);
    assert.match(run.stdout, /nd-other-001: selected A \(chosen_default\)/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// IT-3 — the command file was edited, never rewritten
// ---------------------------------------------------------------------------

test('IT-3: the command digest loses no heading and changes no protected section', () => {
  const baseline = JSON.parse(
    readFileSync(path.join(PROJECT_ROOT, 'tests', 'workspacify-tree', 'baselines', 'manifest-hashes.json'), 'utf8'),
  ).commandFileDigests;

  const findings = compareDigests(baseline, digestCommandFiles(PROJECT_ROOT));
  assert.deepEqual(findings, [], 'the append loses no heading, no Language Protocol table and no First-Class Rule line');
});

test('IT-3: the forward grill behaviour this ticket must not change is still reachable', () => {
  const commandText = readFileSync(
    path.join(PROJECT_ROOT, '.claude', 'commands', 'grill-me-for-rfc.md'),
    'utf8',
  );
  for (const step of ['STEP 0: Initialization', 'STEP 2: Grill Session', 'STEP 5: RFC Writing', 'STEP 8: RFC Completion Declaration']) {
    assert.ok(commandText.includes(step), `the forward workflow step "${step}" survives the append`);
  }
  assert.ok(
    commandText.includes('## Language Protocol'),
    'the Language Protocol table the command has always carried survives the append',
  );
  assert.ok(
    commandText.includes('**The user answers ONLY with Yes/No or an A/B/C choice.'),
    'the closed answer vocabulary survives: reverse mode adds questions in the same form',
  );
});
