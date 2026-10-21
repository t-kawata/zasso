// [::TICKET::] PX-289, PX-291 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-289|PX-291) --for-spec --no-implementation-order`.
/**
 * The judgment protocol: a context-rich worklist, a context-bound record, an attack and a
 * finite decision. The script validates shape, citations and context binding; it never
 * judges whether the semantic verdict is correct.
 */
import { contextDigest, recordIdOf } from './evidence.mjs';

export const MAX_ATTACK_ROUNDS = 2;
export const RECORD_SCHEMA_VERSION = 2;
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
export const KIND_ANSWER_VOCABULARY = Object.freeze({
  judgment: Object.freeze(['consistent', 'conflicting', 'entailed', 'not_entailed']),
  distribution: Object.freeze(['present', 'absent']),
  risk: Object.freeze(['mitigated', 'accepted']),
  reading: Object.freeze(['Yes', 'No', 'present', 'absent', 'performed', 'escaped']),
  property: Object.freeze(['present', 'absent']),
});
export const ATTACK_OUTCOMES = Object.freeze(['held', 'broken', 'unresolved']);
export const ATTACK_TIER = Object.freeze({ TIER_ONE: 'tier1', STANDARD: 'standard' });
export const ARTIFACT_BASIS_SOURCES = Object.freeze(['contract_registry', 'artifact', 'view', 'ledger']);

/** A non-empty string. */
// [::TICKET::] PX-289, PX-291, PX-292, PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-289|PX-291|PX-292|PX-293) --for-spec --no-implementation-order`.
function text(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/** A non-empty string with its internal whitespace collapsed for quote comparison. */
// [::TICKET::] PX-291, PX-292, PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-291|PX-292|PX-293) --for-spec --no-implementation-order`.
function normalize(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/** The falsifier a worklist item carries when the obligation does not state one. */
const DEFAULT_FALSIFIER = 'Name a concrete line, fact or conflict that makes this verdict false.';

/** The tier an obligation is attacked at when the registry does not state one. */
// [::TICKET::] PX-291, PX-292, PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-291|PX-292|PX-293) --for-spec --no-implementation-order`.
function defaultAttackTier(entry) {
  if (typeof entry?.id !== 'string') return ATTACK_TIER.STANDARD;
  if (entry.id.startsWith('JUDGE:') || entry.id.startsWith('FALSIFY:')) return ATTACK_TIER.TIER_ONE;
  if (entry.kind === 'distribution' || entry.kind === 'risk') return ATTACK_TIER.TIER_ONE;
  return ATTACK_TIER.STANDARD;
}

/**
 * Build one worklist item per open semantic obligation.
 *
 * @param {Array<object>} obligations — open semantic obligations
 * @param {object} contextByObligation — map from obligation id to the minimal evidence context
 * @param {{ artifactDigest?: string|null }} [options]
 * @returns {Array<object>}
 */
export function buildWorklist(obligations = [], contextByObligation = {}, options = {}) {
  const artifactDigest = options.artifactDigest ?? null;
  const reader = options.reader ?? null;
  const attackReader = options.attackReader ?? null;
  const requireRecordId = options.requireRecordId === true;
  const prepared = obligations
    .filter((entry) => entry?.class === 'semantic' && entry?.state === 'open')
    .map((entry) => {
      const context = contextByObligation[entry.id] ?? {
        obligationId: entry.id,
        subject: entry.subject,
        claim: entry.claim,
        anchorSet: {},
      };
      const vocabulary = KIND_ANSWER_VOCABULARY[entry.kind] ?? ANSWER_VOCABULARY;
      return {
        id: entry.id,
        obligationId: entry.id,
        kind: entry.kind,
        subject: entry.subject,
        question: entry.claim,
        contextDigest: contextDigest(context),
        context,
        anchorSet: context.anchorSet ?? {},
        artifactDigest,
        reader,
        attackReader,
        requireRecordId,
        schemaVersion: RECORD_SCHEMA_VERSION,
        falsifier: entry.falsifier ?? DEFAULT_FALSIFIER,
        answerVocabulary: [...vocabulary],
        basisRequirements: 'a kind-specific basis whose quote occurs on the cited line and whose line is inside the obligation anchors',
        changes: entry.producer ?? 'the obligation stays open until a held judgment is recorded',
        attackTier: defaultAttackTier(entry),
      };
    });
  const worklistDigest = contextDigest(prepared.map((entry) => [entry.obligationId, entry.contextDigest]));
  return prepared.map((entry) => ({ ...entry, worklistDigest }));
}

/** The anchor list a basis source is checked against. */
// [::TICKET::] PX-291, PX-292, PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-291|PX-292|PX-293) --for-spec --no-implementation-order`.
function anchorsFor(anchorSet, source) {
  if (source === 'contract_registry') return Array.isArray(anchorSet?.contract) ? anchorSet.contract : [];
  if (source === 'artifact') return Array.isArray(anchorSet?.artifact) ? anchorSet.artifact : [];
  if (source === 'view') return Array.isArray(anchorSet?.view) ? anchorSet.view : [];
  if (source === 'ledger') return Array.isArray(anchorSet?.ledger) ? anchorSet.ledger : [];
  return Array.isArray(anchorSet?.spec) ? anchorSet.spec : [];
}

/** Whether one artifact-like basis names the row the anchor set expects. */
// [::TICKET::] PX-291, PX-292, PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-291|PX-292|PX-293) --for-spec --no-implementation-order`.
function artifactBasisMatches(entry, anchorSet) {
  const anchors = anchorsFor(anchorSet, entry.source);
  if (anchors.length === 0) return true;
  return anchors.some((anchor) => {
    if (entry.source === 'contract_registry') {
      return anchor.boundaryId === entry.boundaryId && anchor.field === entry.field;
    }
    if (entry.source === 'view') {
      return anchor.packageId === entry.packageId && anchor.unitId === entry.unitId;
    }
    if (entry.source === 'ledger') {
      return anchor.packageId === entry.packageId && anchor.unit === entry.unit;
    }
    return (anchor.id === (entry.id ?? entry.operationId)) && anchor.field === entry.field;
  });
}

/** The spec line a basis cites, or a coded problem. */
// [::TICKET::] PX-291, PX-292, PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-291|PX-292|PX-293) --for-spec --no-implementation-order`.
function validateSpecBasis(entry, anchorSet, linesByPath) {
  if (!Number.isInteger(entry.line) || entry.line <= 0 || !text(entry.quote)) {
    return { ok: false, code: 'BASIS_SHAPE', problem: 'a spec basis needs a positive line and a quote' };
  }
  const anchors = anchorsFor(anchorSet, 'spec');
  if (anchors.length > 0 && !anchors.some((anchor) => anchor.path === entry.path && anchor.line === entry.line)) {
    return { ok: false, code: 'BASIS_OUT_OF_SCOPE', problem: 'the cited line is outside the obligation anchors' };
  }
  if (linesByPath === undefined || linesByPath === null) return { ok: true, code: null, problem: null };
  const lines = linesByPath[entry.path];
  if (!Array.isArray(lines)) {
    return { ok: false, code: 'BASIS_SHAPE', problem: `the specification ${entry.path} was not supplied` };
  }
  const line = lines[entry.line - 1];
  if (typeof line !== 'string' || !normalize(line).includes(normalize(entry.quote))) {
    return { ok: false, code: 'QUOTE_NOT_FOUND', problem: 'the quote does not occur on the cited line' };
  }
  return { ok: true, code: null, problem: null };
}

/** One valid basis entry, or a coded problem. */
// [::TICKET::] PX-291, PX-292, PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-291|PX-292|PX-293) --for-spec --no-implementation-order`.
function validateBasisEntry(entry, anchorSet, linesByPath) {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    return { ok: false, code: 'BASIS_SHAPE', problem: 'a basis entry is not an object' };
  }
  if (!text(entry.source)) {
    return { ok: false, code: 'BASIS_SHAPE', problem: 'a basis entry names no source' };
  }
  if (ARTIFACT_BASIS_SOURCES.includes(entry.source)) {
    if (!artifactBasisMatches(entry, anchorSet)) {
      return { ok: false, code: 'BASIS_OUT_OF_SCOPE', problem: 'the basis names a row outside the obligation anchors' };
    }
    return { ok: true, code: null, problem: null };
  }
  return validateSpecBasis(entry, anchorSet, linesByPath);
}

/**
 * Validate one judgment record against the worklist item it answers.
 *
 * @returns {{ ok: boolean, problems: string[], code: string|null }}
 */
export function validateJudgmentRecord(record, item, options = {}) {
  const problems = [];
  const fail = (code, problem) => ({ ok: false, problems: [...problems, problem], code });
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    return { ok: false, problems: ['the judgment record is not an object'], code: 'BASIS_SHAPE' };
  }
  if (record.obligationId !== item?.obligationId) {
    return fail('OBLIGATION_MISMATCH', `obligationId ${record.obligationId} does not match ${item?.obligationId}`);
  }
  if (item?.schemaVersion === RECORD_SCHEMA_VERSION && record.schemaVersion !== RECORD_SCHEMA_VERSION) {
    return fail('LEGACY_RECORD', `schemaVersion ${record.schemaVersion} is not ${RECORD_SCHEMA_VERSION}`);
  }
  if (record.provisional === true) {
    return fail('PROVISIONAL_EVIDENCE', 'a provisional record cannot decide an obligation');
  }
  if (item?.reader !== undefined && item.reader !== null && record.reader !== item.reader) {
    return fail('READER_MISMATCH', `the record reader ${record.reader} is not ${item.reader}`);
  }
  if (item?.requireRecordId === true && record.recordId !== recordIdOf(record)) {
    return fail('RECORD_ID_MISMATCH', 'the recordId is not the digest of the record body');
  }
  if (item?.contextDigest !== undefined && record.contextDigest !== item.contextDigest) {
    return fail('CONTEXT_MISMATCH', 'contextDigest does not match the worklist item');
  }
  if (item?.worklistDigest !== undefined && record.worklistDigest !== item.worklistDigest) {
    return fail('WORKLIST_MISMATCH', 'worklistDigest does not match the worklist');
  }
  if (item?.artifactDigest !== undefined && item.artifactDigest !== null && record.artifactDigest !== item.artifactDigest) {
    return fail('STALE_EVIDENCE', 'artifactDigest does not match the current artifact');
  }
  const vocabulary = Array.isArray(item?.answerVocabulary) ? item.answerVocabulary : ANSWER_VOCABULARY;
  if (!text(record.verdict) || !vocabulary.includes(record.verdict)) {
    return fail('VERDICT_NOT_ALLOWED', `verdict ${record.verdict} is outside the answer vocabulary`);
  }
  if (!Array.isArray(record.basis) || record.basis.length === 0) {
    return fail('BASIS_SHAPE', 'basis must carry at least one cited row');
  }
  for (const entry of record.basis) {
    const result = validateBasisEntry(entry, item?.anchorSet ?? {}, options.linesByPath);
    if (!result.ok) return fail(result.code, result.problem);
  }
  if (record.counterexample !== undefined && record.counterexample !== null) {
    const result = validateBasisEntry(record.counterexample, item?.anchorSet ?? {}, options.linesByPath);
    if (!result.ok) return fail(result.code, result.problem);
  }
  return { ok: true, problems: [], code: null };
}

/** Whether an attack states what it searched. */
// [::TICKET::] PX-291, PX-292, PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-291|PX-292|PX-293) --for-spec --no-implementation-order`.
function validSearched(searched) {
  if (searched === null || typeof searched !== 'object' || Array.isArray(searched)) return false;
  if (!text(searched.source) || !text(searched.quote)) return false;
  const hasRange = Number.isInteger(searched.from)
    && Number.isInteger(searched.to)
    && searched.from >= 0
    && searched.from <= searched.to;
  const hasAnchor = text(searched.id) || text(searched.boundaryId) || text(searched.path);
  return hasRange || hasAnchor;
}

/**
 * Validate one attack record against the judgment it attacks.
 *
 * A concrete counterexample is the only way an attack can be broken; an attack that
 * states no counterexample is held, and an unresolved attack becomes stuck.
 */
export function validateAttackRecord(attack, record, item) {
  const problems = [];
  const fail = (code, problem) => ({ ok: false, problems: [...problems, problem], code });
  if (attack === null || typeof attack !== 'object' || Array.isArray(attack)) {
    return { ok: false, problems: ['the attack record is not an object'], code: 'ATTACK_MISMATCH' };
  }
  if (attack.obligationId !== item?.obligationId) {
    return fail('ATTACK_MISMATCH', `obligationId ${attack.obligationId} does not match ${item?.obligationId}`);
  }
  if (item?.contextDigest !== undefined && attack.contextDigest !== item.contextDigest) {
    return fail('ATTACK_MISMATCH', 'contextDigest does not match the worklist item');
  }
  if (item?.worklistDigest !== undefined && attack.worklistDigest !== item.worklistDigest) {
    return fail('ATTACK_MISMATCH', 'worklistDigest does not match the worklist');
  }
  if (!ATTACK_OUTCOMES.includes(attack.outcome)) {
    return fail('ATTACK_MISMATCH', `outcome ${attack.outcome} is not held, broken or unresolved`);
  }
  if (record !== null && record !== undefined && text(record.reader) && attack.reader === record.reader) {
    return fail('SELF_ATTACK', 'the attack reader is the judgment reader');
  }
  if (item?.attackReader !== undefined && item.attackReader !== null && attack.reader !== item.attackReader) {
    return fail('READER_MISMATCH', `the attack reader ${attack.reader} is not ${item.attackReader}`);
  }
  if (item?.attackTier === ATTACK_TIER.TIER_ONE && !validSearched(attack.searched)) {
    return fail('ATTACK_UNGROUNDED', 'a Tier 1 attack must state the rows it searched');
  }
  if (attack.outcome === 'broken' && !validBasisEntryLike(attack.counterexample)) {
    return fail('COUNTEREXAMPLE_MISSING', 'a broken attack must carry a concrete counterexample');
  }
  if (attack.outcome === 'unresolved' && !text(attack.reason)) {
    return fail('ATTACK_MISMATCH', 'an unresolved attack must state its reason');
  }
  if (!withinRoundCap(attack)) {
    return fail('ROUND_CAP', `round ${attack.round} is beyond ${MAX_ATTACK_ROUNDS}`);
  }
  return { ok: true, problems: [], code: null };
}

/** A counterexample with a source and a quote or an artifact row. */
// [::TICKET::] PX-291, PX-292, PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-291|PX-292|PX-293) --for-spec --no-implementation-order`.
function validBasisEntryLike(entry) {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return false;
  if (!text(entry.source)) return false;
  if (ARTIFACT_BASIS_SOURCES.includes(entry.source)) return true;
  return Number.isInteger(entry.line) && entry.line > 0 && text(entry.quote);
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
    const hasRebuttal = Array.isArray(rebuttal?.basis) && rebuttal.basis.some((entry) => validBasisEntryLike(entry));
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
