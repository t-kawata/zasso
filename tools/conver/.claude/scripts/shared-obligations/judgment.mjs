// [::TICKET::] PX-289 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-289 --for-spec --no-implementation-order`.
/**
 * The judgment protocol: a context-rich worklist, a context-bound record, an attack and a
 * finite decision. The script validates shape, citations and context binding; it never
 * judges whether the semantic verdict is correct.
 */
import { contextDigest } from './evidence.mjs';

export const MAX_ATTACK_ROUNDS = 2;
export const ANSWER_VOCABULARY = Object.freeze([
  'entailed',
  'not_entailed',
  'present',
  'absent',
  'consistent',
  'conflicting',
  'mitigated',
  'accepted',
  'Yes',
  'No',
]);
export const ATTACK_OUTCOMES = Object.freeze(['held', 'broken', 'unresolved']);

/** A non-empty string. */
// [::TICKET::] PX-289, PX-290 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-289|PX-290) --for-spec --no-implementation-order`.
function text(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/** The falsifier a worklist item carries when the obligation does not state one. */
const DEFAULT_FALSIFIER = 'Name a concrete line, fact or conflict that makes this verdict false.';

/**
 * Build one worklist item per open semantic obligation.
 *
 * @param {Array<object>} obligations — open semantic obligations
 * @param {object} contextByObligation — map from obligation id to the minimal evidence context
 * @returns {Array<object>}
 */
export function buildWorklist(obligations = [], contextByObligation = {}) {
  return obligations
    .filter((entry) => entry?.class === 'semantic' && entry?.state === 'open')
    .map((entry) => {
      const context = contextByObligation[entry.id] ?? { obligationId: entry.id, subject: entry.subject, claim: entry.claim };
      return {
        id: entry.id,
        obligationId: entry.id,
        kind: entry.kind,
        subject: entry.subject,
        question: entry.claim,
        contextDigest: contextDigest(context),
        context,
        falsifier: entry.falsifier ?? DEFAULT_FALSIFIER,
        answerVocabulary: [...ANSWER_VOCABULARY],
        basisRequirements: 'at least one {source, line, quote}; a counterexample also needs source, line and quote',
        changes: entry.producer ?? 'the obligation stays open until a held judgment is recorded',
      };
    });
}

/** Whether one basis entry names a source, a positive line and a non-empty quote. */
// [::TICKET::] PX-289, PX-290 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-289|PX-290) --for-spec --no-implementation-order`.
function validBasis(entry) {
  return text(entry?.source)
    && Number.isInteger(entry?.line)
    && entry.line > 0
    && text(entry?.quote);
}

/**
 * Validate one judgment record against the worklist item it answers.
 *
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function validateJudgmentRecord(record, item) {
  const problems = [];
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    return { ok: false, problems: ['the judgment record is not an object'] };
  }
  if (record.obligationId !== item?.obligationId) {
    problems.push(`obligationId ${record.obligationId} does not match ${item?.obligationId}`);
  }
  if (record.contextDigest !== item?.contextDigest) {
    problems.push('contextDigest does not match the worklist item');
  }
  if (!text(record.verdict) || !ANSWER_VOCABULARY.includes(record.verdict)) {
    problems.push(`verdict ${record.verdict} is outside the answer vocabulary`);
  }
  if (!Array.isArray(record.basis) || record.basis.length === 0) {
    problems.push('basis must carry at least one cited line');
  } else {
    for (const entry of record.basis) {
      if (!validBasis(entry)) problems.push('a basis entry is missing source, line or quote');
    }
  }
  if (record.counterexample !== undefined && record.counterexample !== null) {
    if (!validBasis(record.counterexample)) problems.push('a counterexample is missing source, line or quote');
  }
  return { ok: problems.length === 0, problems };
}

/**
 * Validate one attack record against the judgment it attacks.
 *
 * A concrete counterexample is the only way an attack can be broken; an attack that
 * states no counterexample is held, and an unresolved attack becomes stuck.
 */
export function validateAttackRecord(attack, record, item) {
  const problems = [];
  if (attack === null || typeof attack !== 'object' || Array.isArray(attack)) {
    return { ok: false, problems: ['the attack record is not an object'] };
  }
  if (attack.obligationId !== item?.obligationId) {
    problems.push(`obligationId ${attack.obligationId} does not match ${item?.obligationId}`);
  }
  if (!ATTACK_OUTCOMES.includes(attack.outcome)) {
    problems.push(`outcome ${attack.outcome} is not held, broken or unresolved`);
  }
  if (attack.outcome === 'broken' && !validBasis(attack.counterexample)) {
    problems.push('a broken attack must carry a concrete counterexample');
  }
  if (attack.outcome === 'unresolved' && !text(attack.reason)) {
    problems.push('an unresolved attack must state its reason');
  }
  return { ok: problems.length === 0, problems };
}

/**
 * Decide the state of one judgment.
 *
 * held: the attack held, or a broken attack was rebutted with cited evidence.
 * broken: the attack named a concrete counterexample and no rebuttal cites evidence.
 * stuck: the attack was unresolved or the round cap was reached.
 */
export function decideJudgment({ record, attack, rebuttal = null } = {}) {
  if (attack === null || attack === undefined) {
    return { state: 'open', reason: 'NO_ATTACK' };
  }
  if (attack.outcome === 'held') return { state: 'held', reason: null };
  if (attack.outcome === 'unresolved') return { state: 'stuck', reason: 'ATTACK_UNRESOLVED' };
  if (attack.outcome === 'broken') {
    const hasRebuttal = Array.isArray(rebuttal?.basis) && rebuttal.basis.some(validBasis);
    if (hasRebuttal) return { state: 'held', reason: 'COUNTEREXAMPLE_REBUTTED' };
    return { state: 'broken', reason: 'COUNTEREXAMPLE_UNREBUTTED' };
  }
  return { state: 'open', reason: 'UNKNOWN_ATTACK_OUTCOME' };
}

/** Whether a judgment's round is still inside the cap. */
export function withinRoundCap(record) {
  const round = Number.isInteger(record?.round) ? record.round : 1;
  return round <= MAX_ATTACK_ROUNDS;
}
