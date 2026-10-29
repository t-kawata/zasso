// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-289, PX-291 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-289|PX-291) --for-spec --no-implementation-order`.
/**
 * The judgment protocol: a context-rich worklist, a context-bound record, an attack and a
 * finite decision. The script validates shape, citations and context binding; it never
 * judges whether the semantic verdict is correct.
 */
import { contextDigest, recordIdOf } from './evidence.mjs';
import { resolveClauseValues } from './clause-paths.mjs';

// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export const MAX_ATTACK_ROUNDS = 2;
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export const RECORD_SCHEMA_VERSION = 2;
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
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
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export const KIND_ANSWER_VOCABULARY = Object.freeze({
  judgment: Object.freeze(['consistent', 'conflicting', 'entailed', 'not_entailed']),
  distribution: Object.freeze(['present', 'absent']),
  risk: Object.freeze(['mitigated', 'accepted']),
  reading: Object.freeze(['Yes', 'No', 'present', 'absent', 'performed', 'escaped']),
  property: Object.freeze(['present', 'absent']),
});
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export const ATTACK_OUTCOMES = Object.freeze(['held', 'broken', 'unresolved']);
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export const ATTACK_TIER = Object.freeze({ TIER_ONE: 'tier1', STANDARD: 'standard' });
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export const ARTIFACT_BASIS_SOURCES = Object.freeze(['contract_registry', 'artifact', 'view', 'ledger']);

/** The code a searched row outside the claim anchor returns. */
export const ATTACK_ANCHOR_MISMATCH = 'ATTACK_ANCHOR_MISMATCH';

/** The anchorSet field each basis source is read from. */
const ANCHOR_FIELD_BY_SOURCE = Object.freeze({
  spec: 'spec',
  contract_registry: 'contract',
  artifact: 'artifact',
  view: 'view',
  ledger: 'ledger',
});

/** A non-empty string. */
// [::TICKET::] PX-289, PX-291, PX-292, PX-293, PX-297 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-289|PX-291|PX-292|PX-293|PX-297) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function text(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/** A non-empty string with its internal whitespace collapsed for quote comparison. */
// [::TICKET::] PX-291, PX-292, PX-293, PX-297 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-291|PX-292|PX-293|PX-297) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function normalize(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/** The case-folded form used only by the discrimination rule. */
// [::TICKET::] PX-303 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-303 --for-spec --no-implementation-order`.
function foldCase(value) {
  return normalize(value).toLowerCase();
}

const MIN_QUOTE_CHARS = 4;
const MIN_CJK_QUOTE_CHARS = 8;
const MAX_QUOTE_FREQUENCY = 0.5;
const CJK_TEXT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const PUNCTUATION_ONLY = /^[\p{P}\p{S}\s]+$/u;
const HEADING_ONLY = /^#{1,6}\s+\S/u;

/**
 * Whether a quote carries too little text to distinguish one claim from another.
 *
 * The rule measures discrimination, not truth: a bracket, a fence, a heading or a
 * single character can occur on almost any line, so it cannot serve as evidence.
 * The thresholds are deliberately low to keep legitimate short identifiers.
 */
export function isDegenerateQuote(quote) {
  const value = normalize(quote);
  if (value.length < MIN_QUOTE_CHARS) return true;
  if (PUNCTUATION_ONLY.test(value)) return true;
  if (HEADING_ONLY.test(value)) return true;
  if (CJK_TEXT.test(value) && [...value].length < MIN_CJK_QUOTE_CHARS) return true;
  return false;
}

/**
 * How often a quote occurs in the candidate values it is meant to distinguish.
 *
 * A quote that appears in most candidates does not select one of them. A single
 * candidate is not a frequency question; the degeneracy rule covers that case.
 */
export function quoteDiscrimination(quote, candidates = []) {
  const value = foldCase(quote);
  const values = (Array.isArray(candidates) ? candidates : [])
    .map((candidate) => foldCase(candidate))
    .filter((candidate) => candidate !== '');
  if (value === '' || values.length < 2) return { ok: value !== '', ratio: 0 };
  const matches = values.filter((candidate) => candidate.includes(value)).length;
  const ratio = matches / values.length;
  return { ok: ratio <= MAX_QUOTE_FREQUENCY, ratio };
}

/** The falsifier a worklist item carries when the obligation does not state one. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
const DEFAULT_FALSIFIER = 'Name a concrete line, fact or conflict that makes this verdict false.';

/** The tier an obligation is attacked at when the registry does not state one. */
// [::TICKET::] PX-291, PX-292, PX-293, PX-297 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-291|PX-292|PX-293|PX-297) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
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
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function buildWorklist(obligations = [], contextByObligation = {}, options = {}) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const artifactDigest = options.artifactDigest ?? null;
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const reader = options.reader ?? null;
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const attackReader = options.attackReader ?? null;
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const requireRecordId = options.requireRecordId === true;
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const requireEffort = options.requireEffort === true;
  const generation = options.generation ?? null;
  const generationStartedAt = options.generationStartedAt ?? null;
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const prepared = obligations
    .filter((entry) => entry?.class === 'semantic' && entry?.state === 'open')
    .map((entry) => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
      const context = contextByObligation[entry.id] ?? {
        obligationId: entry.id,
        subject: entry.subject,
        claim: entry.claim,
        anchorSet: {},
      };
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
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
        requireEffort,
        generation,
        generationStartedAt,
        basisQuotes: Array.isArray(context.basisQuotes) ? context.basisQuotes : [],
        schemaVersion: RECORD_SCHEMA_VERSION,
        falsifier: entry.falsifier ?? DEFAULT_FALSIFIER,
        answerVocabulary: [...vocabulary],
        basisRequirements: 'a kind-specific basis whose quote occurs on the cited line and whose line is inside the obligation anchors',
        changes: entry.producer ?? 'the obligation stays open until a held judgment is recorded',
        attackTier: defaultAttackTier(entry),
      };
    });
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  // The digest binds one item, not the batch. A batch digest changes whenever any other
  // obligation opens or closes, which invalidates every record already written and makes
  // a workspace oscillate between two open sets; the per-item contextDigest is the proof
  // that the record answers this question, and this digest names the pair being answered.
  return prepared.map((entry) => ({
    ...entry,
    worklistDigest: contextDigest([entry.obligationId, entry.contextDigest]),
  }));
}

/** The anchor list a basis source is checked against. */
// [::TICKET::] PX-291, PX-292, PX-293 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-291|PX-292|PX-293) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function anchorsFor(anchorSet, source) {
  if (source === 'contract_registry') return Array.isArray(anchorSet?.contract) ? anchorSet.contract : [];
  if (source === 'artifact') return Array.isArray(anchorSet?.artifact) ? anchorSet.artifact : [];
  if (source === 'view') return Array.isArray(anchorSet?.view) ? anchorSet.view : [];
  if (source === 'ledger') return Array.isArray(anchorSet?.ledger) ? anchorSet.ledger : [];
  return Array.isArray(anchorSet?.spec) ? anchorSet.spec : [];
}

/**
 * Every anchor a worklist item carries, tagged with the basis source it belongs to.
 *
 * The anchorSet stores one array per layer; the attack validator needs one list where each
 * entry says which layer it came from, so a searched row can be compared with the same
 * vocabulary a basis reads.
 */
// [::TICKET::] PX-306 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-306 --for-spec --no-implementation-order`.
export function anchorEntriesOf(anchorSet) {
  const entries = [];
  for (const [source, field] of Object.entries(ANCHOR_FIELD_BY_SOURCE)) {
    for (const anchor of anchorsFor(anchorSet, source)) {
      if (anchor !== null && typeof anchor === 'object') entries.push({ ...anchor, source });
    }
  }
  return entries;
}

/**
 * Whether a searched row names the same claim as one anchor.
 *
 * A boundary, an artifact row and a view unit are identified by their id; a specification
 * line is identified by its path and the line range it covers. Two rows that name the same
 * boundary but a different clause are not the same claim.
 */
// [::TICKET::] PX-306 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-306 --for-spec --no-implementation-order`.
export function searchedOverlapsAnchor(searched, anchor) {
  if (searched === null || typeof searched !== 'object' || anchor === null || typeof anchor !== 'object') return false;

  const searchedBoundary = searched.boundaryId ?? null;
  const anchorBoundary = anchor.boundaryId ?? null;
  if (text(searchedBoundary) && text(anchorBoundary)) {
    if (normalize(searchedBoundary) !== normalize(anchorBoundary)) return false;
    return !text(searched.field) || !text(anchor.field) || normalize(searched.field) === normalize(anchor.field);
  }

  const searchedId = searched.id ?? searched.operationId ?? null;
  const anchorId = anchor.id ?? anchor.operationId ?? null;
  if (text(searchedId) && text(anchorId)) {
    if (normalize(searchedId) !== normalize(anchorId)) return false;
    return !text(searched.field) || !text(anchor.field) || normalize(searched.field) === normalize(anchor.field);
  }

  const searchedUnit = searched.unitId ?? searched.unit ?? null;
  const anchorUnit = anchor.unitId ?? anchor.unit ?? null;
  const searchedPackage = searched.packageId ?? null;
  const anchorPackage = anchor.packageId ?? null;
  if (text(searchedUnit) && text(anchorUnit)) {
    if (normalize(searchedUnit) !== normalize(anchorUnit)) return false;
    return !text(searchedPackage) || !text(anchorPackage) || normalize(searchedPackage) === normalize(anchorPackage);
  }

  if (text(searched.path) && text(anchor.path)) {
    if (normalize(searched.path) !== normalize(anchor.path)) return false;
    if (!Number.isInteger(anchor.line)) return true;
    const from = Number.isInteger(searched.from) ? searched.from : searched.line;
    const to = Number.isInteger(searched.to) ? searched.to : from;
    return Number.isInteger(from) && Number.isInteger(to) && from <= anchor.line && anchor.line <= to;
  }

  return false;
}

/**
 * Refuse an attack whose searched row is outside every anchor the claim carries.
 *
 * The judgment basis is the claim's own citation; when there is no basis the worklist
 * anchorSet is the claim. An empty anchor is a deficiency, not a licence to search anything.
 */
// [::TICKET::] PX-306 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-306 --for-spec --no-implementation-order`.
export function validateAttackAnchor(attack, record, item) {
  const anchors = Array.isArray(record?.basis) && record.basis.length > 0
    ? record.basis
    : anchorEntriesOf(item?.anchorSet ?? {});
  if (anchors.length === 0) {
    return { ok: false, code: ATTACK_ANCHOR_MISMATCH, problem: 'the worklist item carries no anchor' };
  }
  const searched = attack?.searched;
  if (searched === null || typeof searched !== 'object' || Array.isArray(searched)) {
    return { ok: false, code: ATTACK_ANCHOR_MISMATCH, problem: 'the attack states no searched row' };
  }
  if (anchors.some((anchor) => searchedOverlapsAnchor(searched, anchor))) {
    return { ok: true, code: null, problem: null };
  }
  return { ok: false, code: ATTACK_ANCHOR_MISMATCH, problem: 'the attack searched a row outside the claim anchor' };
}

/** Whether one artifact-like basis names the row the anchor set expects. */
// [::TICKET::] PX-291, PX-292, PX-293 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-291|PX-292|PX-293) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function artifactBasisMatches(entry, anchorSet) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
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
// [::TICKET::] PX-291, PX-292, PX-293, PX-297, PX-303 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-291|PX-292|PX-293|PX-297|PX-303) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function validateSpecBasis(entry, anchorSet, linesByPath) {
  if (!Number.isInteger(entry.line) || entry.line <= 0 || !text(entry.quote)) {
    return { ok: false, code: 'BASIS_SHAPE', problem: 'a spec basis needs a positive line and a quote' };
  }
  if (isDegenerateQuote(entry.quote)) {
    return { ok: false, code: 'BASIS_NOT_DISCRIMINATING', problem: 'the quote is too short or carries no discriminating text' };
  }
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const anchors = anchorsFor(anchorSet, 'spec');
  if (anchors.length > 0 && !anchors.some((anchor) => anchor.path === entry.path && anchor.line === entry.line)) {
    return { ok: false, code: 'BASIS_OUT_OF_SCOPE', problem: 'the cited line is outside the obligation anchors' };
  }
  if (linesByPath === undefined || linesByPath === null) return { ok: true, code: null, problem: null };
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const lines = linesByPath[entry.path];
  if (!Array.isArray(lines)) {
    return { ok: false, code: 'BASIS_SHAPE', problem: `the specification ${entry.path} was not supplied` };
  }
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const line = lines[entry.line - 1];
  if (typeof line !== 'string' || !normalize(line).includes(normalize(entry.quote))) {
    return { ok: false, code: 'QUOTE_NOT_FOUND', problem: 'the quote does not occur on the cited line' };
  }
  return { ok: true, code: null, problem: null };
}

/** The values a field can carry, flattened for quote comparison. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-297 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-297) --for-spec --no-implementation-order`.
function fieldText(value) {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return JSON.stringify(value);
}

/**
 * Resolve an artifact basis against the operation row it names.
 *
 * The anchor set proves the obligation expected this row; this resolver proves the
 * row actually carries the field and quote the basis cites.
 */
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function resolveArtifactBasis(entry, artifact) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const operations = Array.isArray(artifact?.operations) ? artifact.operations : [];
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const operationId = entry?.id ?? entry?.operationId;
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const operation = operations.find((row) => row?.id === operationId);
  if (operation === undefined) {
    return { ok: false, code: 'BASIS_FIELD_UNRESOLVED', problem: `operation ${operationId} is absent` };
  }
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const field = entry?.field;
  if (!text(field) || !Object.prototype.hasOwnProperty.call(operation, field)) {
    return { ok: false, code: 'BASIS_FIELD_UNRESOLVED', problem: `field ${field} is absent on ${operationId}` };
  }
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const value = operation[field];
  if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
    return { ok: false, code: 'BASIS_EMPTY', problem: `field ${field} is empty on ${operationId}` };
  }
  if (!text(entry?.quote)) {
    return { ok: false, code: 'BASIS_QUOTE_MISSING', problem: 'an artifact basis needs a quote' };
  }
  if (isDegenerateQuote(entry.quote)) {
    return { ok: false, code: 'BASIS_NOT_DISCRIMINATING', problem: 'the quote is too short or carries no discriminating text' };
  }
  if (!normalize(fieldText(value)).includes(normalize(entry.quote))) {
    return { ok: false, code: 'BASIS_QUOTE_NOT_FOUND', problem: 'the quote does not occur in the field value' };
  }
  if (normalize(entry.quote) === normalize(operationId) || normalize(entry.quote) === normalize(field)) {
    return { ok: false, code: 'BASIS_SELF_REFERENTIAL', problem: 'the quote only repeats the row or field name' };
  }
  return { ok: true, code: null, problem: null };
}

/** Resolve a contract-registry basis against the clause path its JUDGE kind names. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function resolveClauseBasis(entry, contractRegistry) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const contracts = Array.isArray(contractRegistry) ? contractRegistry : [];
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const contract = contracts.find((row) => row?.boundary_id === entry?.boundaryId
    || row?.contract_id === entry?.boundaryId);
  if (contract === undefined) {
    return { ok: false, code: 'CLAUSE_PATH_UNRESOLVED', problem: `boundary ${entry?.boundaryId} is absent` };
  }
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const resolved = resolveClauseValues(contract, entry?.field);
  if (resolved === null) {
    return { ok: false, code: 'CLAUSE_PATH_UNRESOLVED', problem: `field ${entry?.field} has no clause path` };
  }
  if (!text(entry?.quote)) {
    return { ok: false, code: 'BASIS_QUOTE_MISSING', problem: 'a contract-registry basis needs a quote' };
  }
  if (isDegenerateQuote(entry.quote)) {
    return { ok: false, code: 'BASIS_NOT_DISCRIMINATING', problem: 'the quote is too short or carries no discriminating text' };
  }
  if (!quoteDiscrimination(entry.quote, resolved.values).ok) {
    return { ok: false, code: 'BASIS_NOT_DISCRIMINATING', problem: 'the quote occurs in most candidate clauses' };
  }
  if (!normalize(resolved.values.join(' ')).includes(normalize(entry.quote))) {
    return { ok: false, code: 'BASIS_QUOTE_NOT_FOUND', problem: 'the quote does not occur in the resolved clause' };
  }
  return { ok: true, code: null, problem: null };
}

/** Resolve a package-RFC basis against the line the ledger names. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function resolveRfcBasis(entry, rfcByPackage) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const documents = rfcByPackage !== null && typeof rfcByPackage === 'object'
    ? Object.values(rfcByPackage)
    : [];
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const document = documents.find((row) => row?.path === entry?.path)
    ?? (Array.isArray(rfcByPackage?.lines) ? rfcByPackage : null);
  if (document === null || !Array.isArray(document?.lines)) {
    return { ok: false, code: 'BASIS_QUOTE_NOT_FOUND', problem: `the RFC ${entry?.path} was not supplied` };
  }
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const line = document.lines[(entry?.line ?? 0) - 1];
  if (typeof line !== 'string') {
    return { ok: false, code: 'S7.rfc-prose-unit-missing', problem: `the RFC line ${entry?.line} is absent` };
  }
  if (!text(entry?.quote) || !normalize(line).includes(normalize(entry.quote))) {
    return { ok: false, code: 'BASIS_QUOTE_NOT_FOUND', problem: 'the quote does not occur on the RFC line' };
  }
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const unitId = entry?.unitId ?? entry?.id;
  if (text(unitId) && !normalize(line).includes(normalize(unitId))) {
    return { ok: false, code: 'S7.rfc-prose-unit-missing', problem: `the RFC line does not name ${unitId}` };
  }
  return { ok: true, code: null, problem: null };
}

/** One valid basis entry, or a coded problem. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function validateBasisEntry(entry, anchorSet, options = {}) {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    return { ok: false, code: 'BASIS_SHAPE', problem: 'a basis entry is not an object' };
  }
  if (!text(entry.source)) {
    return { ok: false, code: 'BASIS_SHAPE', problem: 'a basis entry names no source' };
  }
  if (entry.source === 'artifact') {
    if (options.artifact !== undefined) return resolveArtifactBasis(entry, options.artifact);
    return artifactBasisMatches(entry, anchorSet)
      ? { ok: true, code: null, problem: null }
      : { ok: false, code: 'BASIS_OUT_OF_SCOPE', problem: 'the basis names a row outside the obligation anchors' };
  }
  if (entry.source === 'contract_registry') {
    if (options.contractRegistry !== undefined) return resolveClauseBasis(entry, options.contractRegistry);
    return artifactBasisMatches(entry, anchorSet)
      ? { ok: true, code: null, problem: null }
      : { ok: false, code: 'BASIS_OUT_OF_SCOPE', problem: 'the basis names a row outside the obligation anchors' };
  }
  if (entry.source === 'rfc') {
    if (options.rfcByPackage !== undefined) return resolveRfcBasis(entry, options.rfcByPackage);
    return { ok: false, code: 'BASIS_QUOTE_MISSING', problem: 'an RFC basis needs the RFC lines' };
  }
  if (entry.source === 'view') {
    return { ok: false, code: 'BASIS_QUOTE_MISSING', problem: 'a view row is not a prose basis' };
  }
  if (entry.source === 'ledger') {
    return artifactBasisMatches(entry, anchorSet)
      ? { ok: true, code: null, problem: null }
      : { ok: false, code: 'BASIS_OUT_OF_SCOPE', problem: 'the basis names a row outside the obligation anchors' };
  }
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const specResult = validateSpecBasis(entry, anchorSet, options.linesByPath);
  if (!specResult.ok) return specResult;
  if (text(options.subject)
    && (normalize(entry.quote) === normalize(options.subject) || (entry.line === 1 && normalize(entry.quote).length < 20))) {
    return { ok: false, code: 'BASIS_GENERIC', problem: 'the quote only names the subject or a header' };
  }
  return specResult;
}

/** Record one quote and reject a second obligation that reuses it. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function recordQuoteUse(seen, quote, obligationId) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const key = normalize(quote);
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const previous = seen.get(key);
  if (previous !== undefined && previous !== obligationId) {
    return { ok: false, code: 'QUOTE_REUSED', problem: `the quote already closed ${previous}` };
  }
  seen.set(key, obligationId);
  return { ok: true, code: null, problem: null };
}

/** Verify an attack's searched quote against the cited source and range. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function validateSearchedQuote(searched, sources) {
  if (!Number.isInteger(searched?.from) || searched.from < 1
    || !Number.isInteger(searched?.to) || searched.to < searched.from) {
    return { ok: false, code: 'ATTACK_RANGE_INVALID', problem: 'the searched range is missing or zero' };
  }
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const lines = sources?.[searched.path];
  if (!Array.isArray(lines)) {
    return { ok: false, code: 'ATTACK_QUOTE_NOT_FOUND', problem: `the source ${searched.path} was not supplied` };
  }
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  if (isDegenerateQuote(searched?.quote)) {
    return { ok: false, code: 'BASIS_NOT_DISCRIMINATING', problem: 'the searched quote is too short or carries no discriminating text' };
  }
  const joined = normalize(lines.slice(searched.from - 1, searched.to).join(' '));
  if (!text(searched.quote) || !joined.includes(normalize(searched.quote))) {
    return { ok: false, code: 'ATTACK_QUOTE_NOT_FOUND', problem: 'the quote does not occur in the cited range' };
  }
  return { ok: true, code: null, problem: null };
}

/** Reject an attack that copies the judgment's basis quote. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function validateAttackIndependence(attack, judgment) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const basisQuotes = (Array.isArray(judgment?.basis) ? judgment.basis : [])
    .map((entry) => normalize(entry?.quote))
    .filter((quote) => quote !== '');
  if (basisQuotes.includes(normalize(attack?.searched?.quote))) {
    return { ok: false, code: 'ATTACK_SAME_AS_BASIS', problem: 'the attack searched the basis quote' };
  }
  return { ok: true, code: null, problem: null };
}

/** A held attack owes a concrete counterexample attempt. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function validateCounterexampleAttempt(attack) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const attempt = attack?.counterexampleAttempt;
  if (attempt === null || typeof attempt !== 'object' || Array.isArray(attempt)) {
    return { ok: false, code: 'COUNTEREXAMPLE_ATTEMPT_MISSING', problem: 'the held attack carries no counterexample attempt' };
  }
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const candidate = normalize(attempt.candidate).toLowerCase();
  if (!text(attempt.whyItFails) || !attempt.source || candidate.length < 20
    || candidate === 'the claim is false') {
    return { ok: false, code: 'COUNTEREXAMPLE_GENERIC', problem: 'the counterexample attempt is not concrete' };
  }
  return { ok: true, code: null, problem: null };
}

/** The FALSIFY claim must match the subject kind, not a no-act template. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function validateFalsificationClaim(attack, item) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const attackText = normalize(attack?.attack).toLowerCase();
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const kind = item?.subjectKind;
  if ((kind === 'active-operation' || kind === 'realized-sequence')
    && attackText.includes('no act the specification orders')) {
    return { ok: false, code: 'ATTACK_SUBJECT_GENERIC', problem: 'an active subject cannot be attacked as no-act' };
  }
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const subject = normalize(item?.subject ?? item?.obligationId).toLowerCase();
  if (subject !== '' && !attackText.includes(subject)) {
    return { ok: false, code: 'ATTACK_SUBJECT_GENERIC', problem: 'the attack does not name its subject' };
  }
  return { ok: true, code: null, problem: null };
}

/** Reject an escape whose cited line orders an act. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function validateEscape({ escape, linesByPath, actPatterns = [] } = {}) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const lines = linesByPath?.[escape?.path] ?? Object.values(linesByPath ?? {})[0];
  if (!Array.isArray(lines)) {
    return { ok: false, code: 'READING_QUOTE_NOT_FOUND', problem: 'the cited source was not supplied' };
  }
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const line = lines[(escape?.line ?? 0) - 1];
  if (typeof line !== 'string') {
    return { ok: false, code: 'ESCAPE_ACT_CONFLICT', problem: 'the cited line is absent' };
  }
  if (!text(escape?.quote) || !normalize(line).includes(normalize(escape.quote))) {
    return { ok: false, code: 'ESCAPE_ACT_CONFLICT', problem: 'the cited quote does not occur on the line' };
  }
  if (escape?.escapeKind === 'no_act' && actPatterns.some((pattern) => line.includes(pattern))) {
    return { ok: false, code: 'ESCAPE_ACT_CONFLICT', problem: 'the cited line orders an act' };
  }
  return { ok: true, code: null, problem: null };
}

/** Reject an active operation whose position and no-act ground disagree. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function validatePositionDisposition(operation) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const positional = operation?.position === 'excluded' || operation?.position === 'suppliedRule';
  if (!positional || operation?.disposition !== 'active') return { ok: true, code: null, problem: null };
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const classification = operation?.grounding?.classification;
  if (classification === 'designer_supplied') return { ok: true, code: null, problem: null };
  if (classification === 'no_act_stated_by_the_specification') {
    return {
      ok: false,
      code: 'POSITION_DISPOSITION_CONFLICT',
      problem: 'an active operation is grounded as carrying no act',
    };
  }
  return { ok: true, code: null, problem: null };
}

/**
 * Validate one judgment record against the worklist item it answers.
 *
 * @returns {{ ok: boolean, problems: string[], code: string|null }}
 */
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function validateJudgmentRecord(record, item, options = {}) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const problems = [];
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
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
  if (item?.generation !== undefined && item.generation !== null && record.readerGeneration !== item.generation) {
    return fail('READER_GENERATION_STALE', `the record was written in generation ${record.readerGeneration}, not ${item.generation}`);
  }
  if (Number.isInteger(item?.generation) && item.generation > 0) {
    if (typeof item.generationStartedAt !== 'string') {
      return fail('READING_NOT_REREAD', 'the generation records no start');
    }
    if (typeof record.readAt !== 'string' || record.readAt < item.generationStartedAt) {
      return fail('READING_NOT_REREAD', 'the record predates the current generation start');
    }
  }
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const vocabulary = Array.isArray(item?.answerVocabulary) ? item.answerVocabulary : ANSWER_VOCABULARY;
  if (!text(record.verdict) || !vocabulary.includes(record.verdict)) {
    return fail('VERDICT_NOT_ALLOWED', `verdict ${record.verdict} is outside the answer vocabulary`);
  }
  if (!Array.isArray(record.basis) || record.basis.length === 0) {
    return fail('BASIS_SHAPE', 'basis must carry at least one cited row');
  }
  for (const entry of record.basis) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const result = validateBasisEntry(entry, item?.anchorSet ?? {}, options);
    if (!result.ok) return fail(result.code, result.problem);
  }
  if (record.counterexample !== undefined && record.counterexample !== null) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const result = validateBasisEntry(record.counterexample, item?.anchorSet ?? {}, options);
    if (!result.ok) return fail(result.code, result.problem);
  }
  return { ok: true, problems: [], code: null };
}

/** Whether an attack states what it searched. */
// [::TICKET::] PX-291, PX-292, PX-293, PX-297 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-291|PX-292|PX-293|PX-297) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function validSearched(searched) {
  if (searched === null || typeof searched !== 'object' || Array.isArray(searched)) return false;
  if (!text(searched.source) || !text(searched.quote)) return false;
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const hasRange = Number.isInteger(searched.from)
    && Number.isInteger(searched.to)
    && searched.from >= 0
    && searched.from <= searched.to;
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const hasAnchor = text(searched.id) || text(searched.boundaryId) || text(searched.path);
  return hasRange || hasAnchor;
}

/**
 * Validate one attack record against the judgment it attacks.
 *
 * A concrete counterexample is the only way an attack can be broken; an attack that
 * states no counterexample is held, and an unresolved attack becomes stuck.
 */
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-306 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-306 --for-spec --no-implementation-order`.
export function validateAttackRecord(attack, record, item, options = {}) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const problems = [];
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
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
  if (options.sources !== undefined) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const searched = validateSearchedQuote(attack.searched, options.sources);
    if (!searched.ok) return fail(searched.code, searched.problem);
  }
  if (options.requireAnchor === true) {
    const anchored = validateAttackAnchor(attack, record, item);
    if (!anchored.ok) return fail(anchored.code, anchored.problem);
  }
  if (record !== null && record !== undefined) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const independent = validateAttackIndependence(attack, record);
    if (!independent.ok) return fail(independent.code, independent.problem);
  }
  if (item?.subjectKind !== undefined) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const claim = validateFalsificationClaim(attack, item);
    if (!claim.ok) return fail(claim.code, claim.problem);
  }
  if (options.requireCounterexampleAttempt === true) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const attempt = validateCounterexampleAttempt(attack);
    if (!attempt.ok) return fail(attempt.code, attempt.problem);
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
// [::TICKET::] PX-291, PX-292, PX-293, PX-297 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-291|PX-292|PX-293|PX-297) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
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
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function decideJudgment({ record, attack, rebuttal = null } = {}) {
  if (attack === null || attack === undefined) {
    return { state: 'open', reason: 'NO_ATTACK' };
  }
  if (attack.outcome === 'held') return { state: 'held', reason: null };
  if (attack.outcome === 'unresolved') return { state: 'stuck', reason: 'ATTACK_UNRESOLVED' };
  if (attack.outcome === 'broken') {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const hasRebuttal = Array.isArray(rebuttal?.basis) && rebuttal.basis.some((entry) => validBasisEntryLike(entry));
    if (hasRebuttal) return { state: 'held', reason: 'COUNTEREXAMPLE_REBUTTED' };
    return { state: 'broken', reason: 'COUNTEREXAMPLE_UNREBUTTED' };
  }
  return { state: 'open', reason: 'UNKNOWN_ATTACK_OUTCOME' };
}

/** Whether a judgment's round is still inside the cap. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function withinRoundCap(record) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const round = Number.isInteger(record?.round) ? record.round : 1;
  return round <= MAX_ATTACK_ROUNDS;
}
