// [::TICKET::] PX-303 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-303 --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
/**
 * Detect an attack that is the same sentence with a different subject.
 *
 * The signature drops the risk-class words and numeric ids, so `concurrency` and
 * `replay` templates collapse to one signature while a genuinely subject-specific
 * search keeps the subject name and the searched rows.
 */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
const RISK_CLASS_WORDS = /\b(?:idempotency|replay|partial-failure|concurrency|liveness|finality|external-dependency)\b/gi;
const QUOTED_SPAN = /"[^"]*"|「[^」]*」/g;
const EVIDENCE_TAG = /\[(?:evidence|signal)\s+[0-9a-f]+\]/gi;

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function normalizeAttackText(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function templateSignature(text) {
  // The quoted evidence and the writer's evidence/signal tags are the parts that
  // vary per record; the sentence around them is the template under test.
  const withoutEvidence = String(text ?? '')
    .replace(QUOTED_SPAN, ' ')
    .replace(EVIDENCE_TAG, ' ');
  return normalizeAttackText(withoutEvidence)
    .replace(RISK_CLASS_WORDS, ' risk ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Reject a signature already used at or above the threshold. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function validateAttackTemplate({ attack, seen, threshold } = {}) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const text = typeof attack === 'string' ? attack : attack?.attack;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const signature = templateSignature(text);
  if (signature === '') return { ok: false, code: 'ATTACK_SUBJECT_GENERIC', problem: 'the attack is empty' };
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const count = seen instanceof Map ? (seen.get(signature) ?? 0) : 0;
  if (count >= threshold) {
    return { ok: false, code: 'ATTACK_TEMPLATE_REUSED', problem: `the attack template was used ${count} time(s)` };
  }
  return { ok: true, code: null, problem: null };
}
