// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
import { isDegenerateQuote } from './judgment.mjs';

/**
 * A blind attack is written from the worklist item, not from the judgment.
 *
 * The validation rejects an attack that is not marked blind, shares the basis quote,
 * or never names the subject it attacks.
 */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function text(value) {
  return typeof value === 'string' && value.trim() !== '';
}

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function normalized(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function fail(code, problem) {
  return { ok: false, code, problem };
}

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-303 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-303 --for-spec --no-implementation-order`.
export function validateBlindAttack(attack, item = {}) {
  if (attack === null || typeof attack !== 'object' || Array.isArray(attack)) {
    return fail('BLIND_ATTACK_REQUIRED', 'the attack record is not an object');
  }
  if (attack.blind !== true) {
    return fail('BLIND_ATTACK_REQUIRED', 'the attack does not declare blind: true');
  }
  if (text(item.reader) && attack.reader === item.reader) {
    return fail('SELF_ATTACK', 'the attack reader is the judgment reader');
  }
  if (text(item.attackReader) && attack.reader !== item.attackReader) {
    return fail('READER_MISMATCH', 'the attack reader is not the worklist attackReader');
  }
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const quote = normalized(attack.searched?.quote);
  if (!text(quote)) {
    return fail('ATTACK_QUOTE_NOT_FOUND', 'the attack carries no searched quote');
  }
  if (isDegenerateQuote(quote)) {
    return fail('ATTACK_QUOTE_NOT_DISCRIMINATING', 'the searched quote is too short or carries no discriminating text');
  }
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const basisQuotes = (Array.isArray(item.basisQuotes) ? item.basisQuotes : []).map(normalized);
  if (basisQuotes.includes(quote)) {
    return fail('ATTACK_SAME_AS_BASIS', 'the attack searched the same quote as the basis');
  }
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const subject = normalized(item.subject ?? item.obligationId);
  if (text(subject) && !normalized(attack.attack).includes(subject)) {
    return fail('ATTACK_SUBJECT_GENERIC', 'the attack does not name its subject');
  }
  if (attack.outcome === 'held' && (attack.counterexampleAttempt === undefined || attack.counterexampleAttempt === null)) {
    return fail('COUNTEREXAMPLE_ATTEMPT_MISSING', 'a held blind attack carries no counterexample attempt');
  }
  return { ok: true, code: null, problem: null };
}
