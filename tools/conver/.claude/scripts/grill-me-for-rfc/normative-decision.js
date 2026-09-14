#!/usr/bin/env node
// [::TICKET::] P22-13 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-13 --for-spec --no-implementation-order`.
/**
 * G4 and G5 — the record of a normative choice, and the authority behind it.
 *
 * Two rules shape this module, and both are about not overstating.
 *
 * The first is that a choice is recorded as a **selection event**, never as a
 * state the pipeline waits in. A document that could be left "awaiting approval"
 * would be a document the machine had stopped working on, and this phase runs
 * under rules that forbid deferring work. So a question is always complete: it
 * carries its choices and a default, and when no answer arrives the default is
 * adopted and recorded as the selection, with `selection_source` saying so.
 *
 * The second is that adopting a default is not the same as settling a norm. A
 * norm is what a human decided; a default is what the machine used to keep going.
 * The design's no-answer table separates the two by risk, and this module
 * implements that table rather than paraphrasing it: a low-risk default becomes a
 * provisional contract, a high-risk one keeps the proposition as an unresolved
 * contract candidate carrying `requires_human_approval`, and a safety-critical one
 * becomes a prohibitive safe default that is explicitly not a settled design. The
 * proposition that is not promoted keeps its question, so the next loop can still
 * be asked.
 *
 * The authority is a role or team identifier rather than a person's name, because
 * people change while the location of the authority and the duty to re-review do
 * not (ABOUT-REVERSE 6.5, F18).
 *
 * The prohibited-token list is not written here. It is imported, because the same
 * words are refused by the stage-two self-grill and a second spelling would drift.
 * That import also keeps this file free of the deferred-work token itself, which
 * the repository's static scanner treats as a stray marker wherever it appears.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { WorkSpacifyTreeError } from '../workspacify-tree/lib/errors.mjs';
import { FORBIDDEN_PHRASES } from '../workspacify-tree/lib/spec-defects.mjs';
import { PROVENANCE_CHAIN_LINKS } from '../workspacify-reverse/lib/origin-spec.mjs';
import { CANDIDATE_APPROVAL_KEY } from '../workspacify-reverse/lib/provenance.mjs';

/** The gate labels the reverse grill's acceptance criteria carry in ABOUT-REVERSE 6.14.3. */
const GATE_IDS = Object.freeze({ G4: 'G4', G5: 'G5' });

/** The one kind of decision record the grill writes. */
export const SELECTION_KINDS = Object.freeze({ grillSelection: 'grill-selection' });

/** Where a selection came from. There are two, and neither is a waiting state. */
export const SELECTION_SOURCES = Object.freeze({ human: 'human-grill', default: 'chosen_default' });

/** The states a normative effect can hold. A state the pipeline waits in is not among them. */
export const NORMATIVE_EFFECT_STATES = Object.freeze({
  normativeForScope: 'normative-for-scope',
  provisional: 'provisional',
});

/** The risk classes the design's no-answer table is indexed by. */
export const RISK_CLASSES = Object.freeze(['low', 'medium', 'high', 'safety-critical']);

/**
 * What a proposition becomes when a human did not answer.
 *
 * `provisional-contract` is a scope-carrying provisional clause in the RFC.
 * `unresolved-contract-candidate` is a proposition that stays out of the norm and
 * keeps its question. `prohibitive-safe-default` is a conservative constraint
 * written as undetermined, which is what a safety, authority or deletion decision
 * becomes when it was never formally taken.
 */
export const NO_ANSWER_OUTPUT_MODES = Object.freeze({
  provisionalContract: 'provisional-contract',
  provisional: 'provisional',
  unresolvedContractCandidate: 'unresolved-contract-candidate',
  prohibitiveSafeDefault: 'prohibitive-safe-default',
});

/** The output mode a proposition keeps when it must not enter the RFC as a norm. */
export const UNRESOLVED_CONTRACT_CANDIDATE = NO_ANSWER_OUTPUT_MODES.unresolvedContractCandidate;

/** How far a proposition that was not promoted has to travel before it can become a norm. */
export const ESCALATION_POLICIES = Object.freeze({
  none: 'none',
  mustGrillBeforeNormativeRfc: 'must-grill-before-normative-rfc',
});

/** The kinds of stable identifier an authority may be recorded under. */
export const AUTHORITY_KINDS = Object.freeze(['role', 'team', 'council', 'domain-steward']);

/**
 * The words a grill payload must never carry.
 *
 * Built from the shared list rather than restated, and extended with the two
 * deferred-version phrasings the command's own checklist refuses. One definition,
 * so the assertion in the tests and any later validation cannot disagree.
 */
export const PROHIBITED_PAYLOAD_TOKENS = Object.freeze([
  ...FORBIDDEN_PHRASES,
  'handle in a future version',
  'handle in a later version',
]);

/** A stable identifier is one lower-case token, optionally joined by separators. */
export const STABLE_IDENTIFIER_PATTERN = /^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/;

/**
 * A personal name written as a single token, such as `ToshimiKawata`.
 *
 * A name with spaces is caught by the whitespace rule; this catches the form that
 * has none.
 */
export const PERSONAL_NAME_PATTERN = /^[A-Z][a-z]+(?:[A-Z][a-z]+)+$/;

/**
 * The design's no-answer policy, one row per risk class.
 *
 * Declared as data rather than as branches so the table can be read against the
 * design's own table line by line, and so a risk class added later cannot be
 * handled on one path and forgotten on another.
 */
export const NO_ANSWER_POLICY = Object.freeze({
  low: Object.freeze({
    promoted: true,
    output_mode: NO_ANSWER_OUTPUT_MODES.provisionalContract,
    requires_falsification_plan: false,
    requires_revalidation: false,
    requires_human_approval: false,
    reason: 'a low-risk default is recorded as a provisional contract carrying its scope',
  }),
  medium: Object.freeze({
    promoted: true,
    output_mode: NO_ANSWER_OUTPUT_MODES.provisional,
    requires_falsification_plan: true,
    requires_revalidation: true,
    requires_human_approval: false,
    reason: 'a medium-risk default is used, but only with a falsification plan and a re-review condition attached',
  }),
  high: Object.freeze({
    promoted: false,
    output_mode: NO_ANSWER_OUTPUT_MODES.unresolvedContractCandidate,
    requires_falsification_plan: true,
    requires_revalidation: true,
    requires_human_approval: true,
    reason: 'a high-risk default keeps the analysis moving and is not promoted to a norm',
  }),
  'safety-critical': Object.freeze({
    promoted: false,
    output_mode: NO_ANSWER_OUTPUT_MODES.prohibitiveSafeDefault,
    requires_falsification_plan: true,
    requires_revalidation: true,
    requires_human_approval: true,
    reason: 'a safety, authority or deletion decision without a formal choice becomes a conservative constraint '
      + 'written as undetermined, and is never treated as a settled design',
  }),
});

/** The links a decision supplies itself, so a caller cannot be asked for them. */
const DECISION_SUPPLIED_LINKS = Object.freeze(['normative_decision_id']);

/** The links that must already exist before a decision can be recorded at all. */
const LINKS_REQUIRED_BEFORE_DECISION = Object.freeze(
  PROVENANCE_CHAIN_LINKS.filter((link) => !DECISION_SUPPLIED_LINKS.includes(link)),
);

/**
 * Whether a value is a stable role, team or council identifier.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isStableAuthorityIdentifier(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return false;
  }
  if (/\s/.test(value) || PERSONAL_NAME_PATTERN.test(value)) {
    return false;
  }
  return STABLE_IDENTIFIER_PATTERN.test(value);
}

/**
 * Record who held the authority for a decision.
 *
 * The identifier is validated rather than trusted. A person's name cannot be
 * recorded, not because names are unimportant but because the record has to name
 * a place that will still exist when the person has moved on.
 *
 * @param {string} authorityRef - a stable role, team or council identifier
 * @param {{ authorityKind?: string }} [options]
 * @returns {Readonly<{ authority_kind: string, authority_ref: string }>}
 * @throws {WorkSpacifyTreeError} gateId "G5" naming what the identifier is missing
 */
export function recordAuthority(authorityRef, { authorityKind } = {}) {
  if (typeof authorityRef !== 'string' || authorityRef.trim().length === 0) {
    throw new WorkSpacifyTreeError(
      'the authority must name the role, team or council that holds it; an empty value names nobody',
      { gateId: GATE_IDS.G5 },
    );
  }
  if (/\s/.test(authorityRef) || PERSONAL_NAME_PATTERN.test(authorityRef)) {
    throw new WorkSpacifyTreeError(
      `"${authorityRef}" parses as a personal name: people change, so record the stable identifier of the role, `
        + 'team or council instead',
      { gateId: GATE_IDS.G5 },
    );
  }
  if (!STABLE_IDENTIFIER_PATTERN.test(authorityRef)) {
    throw new WorkSpacifyTreeError(
      `"${authorityRef}" is not a stable identifier: use one lower-case token such as security-domain-steward`,
      { gateId: GATE_IDS.G5 },
    );
  }
  if (!AUTHORITY_KINDS.includes(authorityKind)) {
    throw new WorkSpacifyTreeError(
      `"${authorityKind}" is not one of the recorded authority kinds (${AUTHORITY_KINDS.join(', ')})`,
      { gateId: GATE_IDS.G5 },
    );
  }
  return Object.freeze({ authority_kind: authorityKind, authority_ref: authorityRef });
}

/**
 * Record one choice as a selection event.
 *
 * Nothing here waits. The record says what was selected, where the selection came
 * from, which alternatives were not selected and why, and what gives it normative
 * force for the scope it names.
 *
 * The parameters are the record's own four parts: the proposition being settled,
 * the selection, the record of who held the authority for it, and its effect. The
 * authority and the context it was exercised in travel together because the record
 * emits them as one object, and an input that mirrors its output is one less shape
 * to hold in mind.
 *
 * @param {{ subject: { claimId?: string, residualId?: string }, selection: { alternativeId: string, source?: string, rejectedAlternatives?: Array<object> }, authorityRecord: { authority: object, sessionRef: string, timestamp: string, decisionBasis?: Array<string> }, effect?: { scopeRef?: string|null, reviewOn?: Array<string> } }} input
 * @returns {object} the `normative_decision` record
 * @throws {WorkSpacifyTreeError} gateId "G4" when a required element is missing
 */
export function recordNormativeDecision({
  subject = {},
  selection = {},
  authorityRecord = {},
  effect = {},
} = {}) {
  const subjectId = assertDecisionSubject(subject);
  const { alternativeId, source = SELECTION_SOURCES.human, rejectedAlternatives = [] } = selection;
  const { authority, sessionRef, timestamp, decisionBasis = [] } = authorityRecord;
  const { scopeRef = null, reviewOn = [] } = effect;

  assertNonEmptyString(alternativeId, 'the selected alternative must be named');
  assertNonEmptyString(sessionRef, 'the decision must record the session it was taken in');
  assertNonEmptyString(timestamp, 'the decision must record when it was taken');
  assertRecordedAuthority(authority);
  if (!Object.values(SELECTION_SOURCES).includes(source)) {
    throw new WorkSpacifyTreeError(
      `"${source}" is not a recorded selection source (${Object.values(SELECTION_SOURCES).join(', ')})`,
      { gateId: GATE_IDS.G4 },
    );
  }

  return {
    normative_decision_id: `nd-${shortIdOf(subjectId)}`,
    residual_id: subject.residualId ?? null,
    decision_kind: SELECTION_KINDS.grillSelection,
    selected_alternative_id: alternativeId,
    selection_source: source,
    authority_record: {
      authority_kind: authority.authority_kind,
      authority_ref: authority.authority_ref,
      decision_session_ref: sessionRef,
      decision_timestamp: timestamp,
      decision_basis: [...decisionBasis],
    },
    normative_effect: {
      state: NORMATIVE_EFFECT_STATES.normativeForScope,
      scope_ref: scopeRef,
      review_on: [...reviewOn],
    },
    rejected_alternatives: rejectedAlternatives.map((alternative) => ({
      alternative_id: alternative.alternative_id,
      reason: alternative.reason,
    })),
  };
}

/**
 * What the design's no-answer table says about a proposition no human answered.
 *
 * The recorded `chosen_default` is consulted as well as the risk class: a default
 * that declares itself non-normative is never promoted, whatever the risk row
 * would otherwise permit. That keeps the declaration on the residual meaningful
 * rather than decorative.
 *
 * @param {{ riskClass: string, chosenDefault?: { alternative_id?: string, default_is_normative?: boolean } }} input
 * @returns {Readonly<object>}
 * @throws {WorkSpacifyTreeError} gateId "G4" on an unrecorded risk class
 */
export function applyNoAnswerPolicy({ riskClass, chosenDefault } = {}) {
  const policy = Object.hasOwn(NO_ANSWER_POLICY, riskClass) ? NO_ANSWER_POLICY[riskClass] : null;
  if (policy === null) {
    throw new WorkSpacifyTreeError(
      `"${riskClass}" is not one of the recorded risk classes (${RISK_CLASSES.join(', ')}), and the no-answer `
        + 'policy is indexed by risk',
      { gateId: GATE_IDS.G4 },
    );
  }
  if (policy.promoted && chosenDefault?.default_is_normative === false) {
    return Object.freeze({
      ...policy,
      risk_class: riskClass,
      promoted: false,
      output_mode: UNRESOLVED_CONTRACT_CANDIDATE,
      requires_human_approval: true,
      reason: 'the recorded default declares itself non-normative, so it is used to keep the analysis moving and is '
        + 'not promoted to a norm',
    });
  }
  return Object.freeze({ ...policy, risk_class: riskClass });
}

/**
 * What a question resolves to: which alternative was selected, where it came
 * from, and the policy that governs it.
 *
 * This is separated from recording because deciding is not recording, and the two
 * have different inputs: one needs the answer and the fallback, the other needs
 * the claim and the provenance chain. Splitting them is also what makes the
 * no-answer rule testable on its own, without a claim or an authority in sight.
 *
 * @param {{ answer?: { alternativeId?: string }|null, noAnswer?: { riskClass?: string, chosenDefault?: object } }} input
 * @returns {{ alternative_id: string, selection_source: string, review_on: Array<string>, policy: Readonly<object>|null }}
 * @throws {WorkSpacifyTreeError} gateId "G4" when neither an answer nor a default names an alternative
 */
export function resolveSelection({ answer = null, noAnswer = {} } = {}) {
  const { riskClass, chosenDefault } = noAnswer;
  const alternativeId = answer === null ? chosenDefault?.alternative_id : answer.alternativeId;
  if (alternativeId === undefined || alternativeId === null) {
    throw new WorkSpacifyTreeError(
      'the selection names neither an answered alternative nor a recorded default, so there is nothing to record',
      { gateId: GATE_IDS.G4 },
    );
  }
  return {
    alternative_id: alternativeId,
    selection_source: answer === null ? SELECTION_SOURCES.default : SELECTION_SOURCES.human,
    // The conditions that force a re-review belong to the choice, not to the
    // record: they say when this selection stops being the right one.
    review_on: [...(chosenDefault?.requires_revalidation_if ?? [])],
    policy: answer === null ? applyNoAnswerPolicy({ riskClass, chosenDefault }) : null,
  };
}

/**
 * Settle a proposition, or refuse to and say why.
 *
 * A refusal is never a deletion. A proposition that is not promoted keeps its
 * question and its candidate marker, so the next loop can ask again; a proposition
 * whose chain is broken is refused outright, because a norm with no recorded
 * decision is an authority the machine invented.
 *
 * @param {{ claim: object, selection: object, authority: object, provenance?: object }} input
 * @returns {{ claim: object, decision: object }}
 * @throws {WorkSpacifyTreeError} gateId "G4" on a broken chain or an already-normative arrival
 */
export function promoteToNormative({ claim, selection, authority, provenance = {} } = {}) {
  if (claim === null || typeof claim !== 'object') {
    throw new WorkSpacifyTreeError('a proposition must be supplied before it can be settled', { gateId: GATE_IDS.G4 });
  }
  if (claim.claim_type === 'normative') {
    throw new WorkSpacifyTreeError(
      `claim ${claim.claim_id} arrives as normative, but a norm enters the RFC only through a recorded selection `
        + 'event: record the decision that made it one',
      { gateId: GATE_IDS.G4 },
    );
  }

  const missing = LINKS_REQUIRED_BEFORE_DECISION.filter((link) => {
    const value = provenance?.[link];
    if (link === 'evidence_records') {
      return !Array.isArray(value) || value.length === 0;
    }
    return typeof value !== 'string' || value.length === 0;
  });
  if (missing.length > 0) {
    throw new WorkSpacifyTreeError(
      `"${claim.statement}" was proposed as a norm, but its broken provenance chain cannot record who decided it: `
        + `${missing.join(', ')} is not recorded. A norm with no recorded decision is one the machine invented.`,
      { gateId: GATE_IDS.G4 },
    );
  }

  const decision = recordNormativeDecision({
    subject: {
      claimId: claim.claim_id,
      residualId: provenance.residual_id ?? claim.residual_id ?? null,
    },
    selection: {
      alternativeId: selection.alternative_id,
      source: selection.selection_source,
      rejectedAlternatives: [],
    },
    authorityRecord: {
      authority,
      // The session and the moment are read from the provenance, never invented:
      // a decision that cannot say which grill took it is not traceable, and a
      // defaulted value would read as one that was.
      sessionRef: provenance.decision_session_ref,
      timestamp: provenance.decision_timestamp,
      decisionBasis: provenance.evidence_records ?? [],
    },
    effect: { scopeRef: provenance.scope_ref ?? null, reviewOn: selection.review_on ?? [] },
  });

  if (selection.policy !== null && selection.policy.promoted === false) {
    return {
      decision,
      claim: {
        ...claim,
        claim_type: UNRESOLVED_CONTRACT_CANDIDATE,
        normative_decision_id: decision.normative_decision_id,
        [CANDIDATE_APPROVAL_KEY]: true,
      },
    };
  }

  const promoted = { ...claim, claim_type: 'normative' };
  delete promoted[CANDIDATE_APPROVAL_KEY];
  return {
    decision,
    claim: {
      ...promoted,
      normative_decision_id: decision.normative_decision_id,
      normative_authority: authority.authority_ref,
    },
  };
}

/**
 * Record one selection event per question, answered or not.
 *
 * A run in which every question was answered and a run in which none was both
 * produce a complete record: the difference is not the number of records but what
 * `selection_source` says about each one.
 *
 * The turn travels as one object because it is one thing: the questions and the
 * answers to them are the two halves of a single exchange, and no caller has ever
 * had one without the other.
 *
 * @param {{ turn: { questions?: Array<object>, answers?: Array<object> }, authority: object, provenanceByClaim?: object, session: { sessionRef: string, timestamp: string } }} input
 * @returns {{ decisions: Array<object> }}
 */
export function recordAllDecisions({
  turn = {},
  authority,
  provenanceByClaim = {},
  session = {},
} = {}) {
  const { questions = [], answers = [] } = turn;
  const { sessionRef, timestamp } = session;
  const answersById = new Map(answers.map((entry) => [entry.question_id, entry]));
  const decisions = questions.map((question) => {
    const answer = answersById.get(question.question_id);
    const claimId = question.claim_id ?? question.residual_id;
    const provenance = question.claim_id === null || question.claim_id === undefined
      ? {}
      : (provenanceByClaim[question.claim_id] ?? {});
    return recordNormativeDecision({
      subject: { claimId, residualId: question.residual_id ?? null },
      selection: {
        alternativeId: answer?.answer?.alternative_id ?? question.chosen_default,
        source: answer === undefined ? SELECTION_SOURCES.default : SELECTION_SOURCES.human,
        rejectedAlternatives: [],
      },
      authorityRecord: {
        authority,
        sessionRef,
        timestamp,
        decisionBasis: provenance.evidence_records ?? [],
      },
      effect: { scopeRef: provenance.scope_ref ?? null, reviewOn: [] },
    });
  });
  return { decisions };
}

/**
 * The `normative_context` a residual carries back to the sidecar.
 *
 * The canonical record of a decision stays in the sidecar; the residual carries the
 * minimum it needs to be re-reviewed, which is what the decision was, how risky the
 * proposition is, and under what policy it entered the RFC.
 *
 * @param {object} decision - a `normative_decision` record
 * @param {{ riskClass: string, scope?: object, evidenceGroups?: Array<object>, falsificationPlan?: Array<string> }} input
 * @returns {object} the context, keyed exactly as the design declares it
 */
export function normativeContextOf(decision, { riskClass, scope = {}, evidenceGroups = [], falsificationPlan = [] } = {}) {
  const policy = applyNoAnswerPolicy({ riskClass });
  return {
    risk_class: riskClass,
    normative_candidate_id: `nrm-${shortIdOf(decision.normative_decision_id)}`,
    scope,
    evidence_groups: evidenceGroups,
    falsification_plan: falsificationPlan,
    default_output_mode: policy.output_mode,
    escalation_policy: policy.promoted
      ? ESCALATION_POLICIES.none
      : ESCALATION_POLICIES.mustGrillBeforeNormativeRfc,
  };
}

/**
 * Scan an emitted structure for the words a grill payload must never carry.
 *
 * The scan walks every string rather than the fields known today, because the
 * failure it guards against is a phrase arriving inside a value nobody thought
 * about. A finding names the path and the phrase, so the author can repair it.
 *
 * @param {unknown} payload
 * @returns {Array<never>} the empty finding list; the throw is the assertion
 * @throws {WorkSpacifyTreeError} gateId "G4" naming the path and the phrase
 */
export function assertNoApprovalWaiting(payload) {
  const findings = [];
  for (const { path, text } of collectStrings(payload)) {
    for (const token of PROHIBITED_PAYLOAD_TOKENS) {
      if (text.includes(token)) {
        findings.push(`${path} contains the forbidden phrase "${token}"`);
      }
    }
  }
  if (findings.length > 0) {
    throw new WorkSpacifyTreeError(
      `${findings.join('; ')}. A question is always complete with its choices and its default, so a payload never `
        + 'hands work to a human or defers it',
      { gateId: GATE_IDS.G4 },
    );
  }
  return findings;
}

/** Every string of a payload, with the path that locates it. */
// [::TICKET::] P22-13 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-13 --for-spec --no-implementation-order`.
function collectStrings(value, path = 'payload') {
  if (typeof value === 'string') {
    return [{ path, text: value }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectStrings(item, `${path}[${index}]`));
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => collectStrings(item, `${path}.${key}`));
  }
  return [];
}

/**
 * Both fields of the authority the record will emit are checked here.
 *
 * Validating the reference alone was not enough: a caller can hand-build
 * `{ authority_ref }` without a kind, and the record then carries an authority
 * with no kind at all — a malformed record rather than a refused one. Every field
 * the record emits is therefore refused here unless it is a value G5 admits, so a
 * personal name and an empty value cannot reach the RFC by either route.
 */
// [::TICKET::] P22-13 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-13 --for-spec --no-implementation-order`.
function assertRecordedAuthority(authority) {
  if (authority === null || typeof authority !== 'object') {
    throw new WorkSpacifyTreeError(
      'the decision must carry an authority recorded by recordAuthority; an authority that is absent is one the machine invented',
      { gateId: GATE_IDS.G4 },
    );
  }
  if (!isStableAuthorityIdentifier(authority.authority_ref)) {
    throw new WorkSpacifyTreeError(
      `"${authority.authority_ref ?? ''}" cannot be recorded as an authority: ${AUTHORITY_KINDS.length} kinds are `
        + `recorded (${AUTHORITY_KINDS.join(', ')}) and the reference must be a stable identifier. `
        + 'A personal name or an empty value is refused here, as G5 requires.',
      { gateId: GATE_IDS.G5 },
    );
  }
  if (!AUTHORITY_KINDS.includes(authority.authority_kind)) {
    throw new WorkSpacifyTreeError(
      `the decision's authority states the kind "${authority.authority_kind}", which is not one of the recorded kinds `
        + `(${AUTHORITY_KINDS.join(', ')}): a record that cannot say what kind of body held the authority is malformed`,
      { gateId: GATE_IDS.G5 },
    );
  }
}

/** The subject a decision is about: the claim when there is one, otherwise the residual. */
// [::TICKET::] P22-13 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-13 --for-spec --no-implementation-order`.
function assertDecisionSubject({ claimId, residualId }) {
  const subjectId = nonEmptyStringOrNull(claimId) ?? nonEmptyStringOrNull(residualId);
  if (subjectId === null) {
    throw new WorkSpacifyTreeError(
      'a decision must name the claim or the residual it settles, so the record can be found from either end',
      { gateId: GATE_IDS.G4 },
    );
  }
  return subjectId;
}

/** A required string, refused with the reason it is required. */
// [::TICKET::] P22-13 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-13 --for-spec --no-implementation-order`.
function assertNonEmptyString(value, reason) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new WorkSpacifyTreeError(`${reason}`, { gateId: GATE_IDS.G4 });
  }
}

/** A string that carries something, or null. */
// [::TICKET::] P22-13 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-13 --for-spec --no-implementation-order`.
function nonEmptyStringOrNull(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/** The short form of an identifier: `clm-x` and `nd-x` share the `x`. */
// [::TICKET::] P22-13 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-13 --for-spec --no-implementation-order`.
function shortIdOf(identifier) {
  return String(identifier).replace(/^(?:clm|nd|nrm|residual|rev-res)-/, '');
}

/** The CLI layer: read the decision input, print what was recorded or why it was refused. */
// [::TICKET::] P22-13 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-13 --for-spec --no-implementation-order`.
function runCli(argv) {
  const [subcommand, ...options] = argv;
  try {
    if (subcommand === 'authority') {
      const ref = optionValue(options, '--ref');
      const kind = optionValue(options, '--kind');
      const authority = recordAuthority(ref, { authorityKind: kind });
      process.stdout.write(`Recorded authority ${authority.authority_ref} of kind ${authority.authority_kind}.\n`);
      return 0;
    }
    if (subcommand === 'decide') {
      const input = JSON.parse(readFileSync(optionValue(options, '--input'), 'utf8'));
      const { proceed, outcome } = narrateDecisions(input);
      process.stdout.write(`${proceed}\n\n${outcome}\n`);
      return 0;
    }
    process.stderr.write(
      'Usage:\n'
        + '  normative-decision.js authority --ref=<id> --kind=<role|team|council|domain-steward>\n'
        + '  normative-decision.js decide --input=<json>\n'
        + '    the input carries: turn (questions, answers), authority, provenanceByClaim, session\n',
    );
    return 2;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return error.exitCode ?? 1;
  }
}

/** Record every decision in a payload and describe the outcome in plain English. */
// [::TICKET::] P22-13 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-13 --for-spec --no-implementation-order`.
function narrateDecisions(input) {
  const { decisions } = recordAllDecisions(input);
  const bySource = decisions.filter((decision) => decision.selection_source === SELECTION_SOURCES.default);
  const proceeded = `Recorded ${decisions.length} selection event(s); ${bySource.length} adopted the recorded default.`;
  const lines = decisions.map((decision) => {
    const effect = decision.normative_effect;
    return `- ${decision.normative_decision_id}: selected ${decision.selected_alternative_id} `
      + `(${decision.selection_source}), ${effect.state} for ${effect.scope_ref ?? 'no recorded scope'}.`;
  });
  return { proceed: proceeded, outcome: lines.join('\n') };
}

/** The value of a `--name=value` option. */
// [::TICKET::] P22-13 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-13 --for-spec --no-implementation-order`.
function optionValue(options, name) {
  const match = options.find((option) => option.startsWith(`${name}=`));
  if (match === undefined) {
    throw new WorkSpacifyTreeError(`${name} is required`, { gateId: GATE_IDS.G4 });
  }
  return match.slice(name.length + 1);
}

// The CLI runs only when this file is the entry point, so the module stays
// importable: a module that prints and exits on import cannot be tested.
if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exit(runCli(process.argv.slice(2)));
}
