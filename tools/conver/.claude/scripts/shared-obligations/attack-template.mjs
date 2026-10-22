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
/** The ids an attack names as its subject, not as its searched claim. */
const SUBJECT_ID_TOKEN = /\b(?:JUDGE|FALSIFY|DIST|RISK|PROP|READ):[^\s,;]+|\b(?:op|seq|xdir|ctr|obl)-[A-Za-z0-9._:-]+|\bboundary-[A-Za-z0-9._:-]+/gi;

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function normalizeAttackText(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-306 --for-spec --no-implementation-order`.
export function templateSignature(text, subject = '') {
  // The quoted evidence and the writer's evidence/signal tags are the parts that
  // vary per record; the sentence around them is the template under test. The subject
  // id and every id-shaped token are removed for the same reason: they name which claim
  // was attacked, not what was searched, and leaving them in made every attack unique.
  let withoutSubject = String(text ?? '');
  if (typeof subject === 'string' && subject.trim() !== '') {
    withoutSubject = withoutSubject.split(subject).join(' ');
  }
  const withoutEvidence = withoutSubject
    .replace(QUOTED_SPAN, ' ')
    .replace(EVIDENCE_TAG, ' ')
    .replace(SUBJECT_ID_TOKEN, ' ');
  return normalizeAttackText(withoutEvidence)
    .replace(RISK_CLASS_WORDS, ' risk ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Reject a signature already used at or above the threshold. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-306 --for-spec --no-implementation-order`.
export function validateAttackTemplate({ attack, seen, threshold, subject = '' } = {}) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const text = typeof attack === 'string' ? attack : attack?.attack;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const signature = templateSignature(text, subject);
  if (signature === '') return { ok: false, code: 'ATTACK_SUBJECT_GENERIC', problem: 'the attack is empty' };
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const count = seen instanceof Map ? (seen.get(signature) ?? 0) : 0;
  if (count >= threshold) {
    return { ok: false, code: 'ATTACK_TEMPLATE_REUSED', problem: `the attack template was used ${count} time(s)` };
  }
  return { ok: true, code: null, problem: null };
}
