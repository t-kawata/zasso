// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
/**
 * E1–E6: the observable traces of effort a held judgment must carry.
 *
 * The validator cannot observe thought. It observes what the reader searched, which
 * alternatives it rejected, which counterexample it tried, why the basis is the
 * discriminating fact, and whether the reader admits high uncertainty.
 */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export const MIN_SEARCH_BY_KIND = Object.freeze({
  judgment: 3,
  distribution: 2,
  risk: 2,
  reading: 2,
  property: 2,
  check: 1,
});

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
const MIN_ALTERNATIVE_REASON_LENGTH = 20;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
const MIN_COUNTEREXAMPLE_LENGTH = 20;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
const GENERIC_REASONS = new Set(['it is different', 'not applicable', 'no reason', 'because it is']);

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function text(value) {
  return typeof value === 'string' && value.trim() !== '';
}

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function normalized(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function fail(code, problem) {
  return { ok: false, code, problem };
}

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function validateEffortTrace(effort, item = {}, options = {}) {
  if (effort === null || typeof effort !== 'object' || Array.isArray(effort)) {
    return fail('EFFORT_MISSING', 'the obligation has no effort trace');
  }
  if (typeof effort.obligationId === 'string' && typeof item?.obligationId === 'string'
    && effort.obligationId !== item.obligationId) {
    return fail('EFFORT_MISSING', 'the effort trace names another obligation');
  }

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const kind = item?.kind ?? 'judgment';
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const minSearch = options.minSearch ?? MIN_SEARCH_BY_KIND[kind] ?? 2;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const searched = Array.isArray(effort.searched) ? effort.searched : [];
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const distinctRows = new Set(searched.map((row) => `${row?.source ?? ''}|${row?.path ?? ''}|${row?.line ?? ''}`));
  if (distinctRows.size < minSearch) {
    return fail('EFFORT_SHALLOW', `the trace searched ${distinctRows.size} row(s); ${minSearch} are required`);
  }

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const verdict = item?.verdict ?? options.verdict ?? null;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const vocabulary = Array.isArray(item?.answerVocabulary) ? item.answerVocabulary : [];
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const alternatives = Array.isArray(effort.alternatives) ? effort.alternatives : [];
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const provided = new Set(alternatives.map((entry) => entry?.verdict));
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const expected = vocabulary.filter((entry) => entry !== verdict);
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const missing = expected.filter((entry) => !provided.has(entry));
  if (missing.length > 0) {
    return fail('ALTERNATIVES_MISSING', `the trace does not consider ${missing.join(', ')}`);
  }
  for (const alternative of alternatives) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const reason = normalized(alternative?.rejectedBecause);
    if (reason.length < MIN_ALTERNATIVE_REASON_LENGTH || GENERIC_REASONS.has(reason)) {
      return fail('ALTERNATIVE_GENERIC', 'an alternative has no subject-specific rejection reason');
    }
  }

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const attempt = effort.counterexampleAttempt;
  if (attempt === null || typeof attempt !== 'object' || Array.isArray(attempt)) {
    return fail('COUNTEREXAMPLE_ATTEMPT_MISSING', 'the trace carries no counterexample attempt');
  }
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const candidate = normalized(attempt.candidate);
  if (!text(attempt.whyItFails) || !attempt.source || candidate.length < MIN_COUNTEREXAMPLE_LENGTH
    || GENERIC_REASONS.has(candidate)) {
    return fail('COUNTEREXAMPLE_GENERIC', 'the counterexample attempt is not concrete');
  }

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const discriminator = effort.discriminator;
  if (discriminator === null || typeof discriminator !== 'object' || Array.isArray(discriminator)) {
    return fail('DISCRIMINATOR_MISSING', 'the trace carries no discriminator');
  }
  if (!text(discriminator.basisRef) || !text(discriminator.ifAbsentOrFalse)) {
    return fail('DISCRIMINATOR_MISSING', 'the discriminator is incomplete');
  }
  if (verdict !== null && discriminator.ifAbsentOrFalse === verdict) {
    return fail('BASIS_NOT_DISCRIMINATING', 'the discriminator names the same verdict');
  }

  if (effort.uncertainty?.level === 'high') {
    return fail('UNCERTAINTY_HIGH', 'a high-uncertainty obligation cannot be held');
  }

  return { ok: true, code: null, problem: null };
}
