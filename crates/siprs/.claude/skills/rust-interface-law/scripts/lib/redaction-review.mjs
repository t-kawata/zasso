// [::TICKET::] PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-422 --for-spec --no-implementation-order`.
// [::TICKET::] PX-421 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-421 --for-spec --no-implementation-order`.
import { createHash } from 'node:crypto';

const TOKEN = /[A-Za-z][A-Za-z0-9_]*/g;
const HASH = /^[0-9a-f]{64}$/;
const DECISIONS = new Set(['redacted', 'allowlist', 'generic']);
const NORMATIVE_CONSTANT = /^(?:[A-Z]{2,}|[A-Za-z]*\d[\w.-]*|v\d+(?:\.\d+)*)$/;

export function sha256(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}

export function candidateTokens(sources) {
  const candidates = new Map();
  for (const source of sources) {
    for (const match of String(source).matchAll(TOKEN)) {
      const token = match[0];
      const hash = sha256(token.toLowerCase());
      const current = candidates.get(hash);
      const capitalized = /^[A-Z]/.test(token);
      if (current) {
        current.capitalized = current.capitalized || capitalized;
        continue;
      }
      candidates.set(hash, { token, capitalized });
    }
  }
  return candidates;
}

export function buildRedactionReview({ sources, redaction }) {
  const mapByHash = new Map(redaction.map((entry) => [entry.sha256, entry]));
  const candidates = candidateTokens(sources);
  const entries = [];
  for (const [hash, candidate] of candidates) {
    if (!candidate.capitalized && !mapByHash.has(hash)) continue;
    const mapped = mapByHash.get(hash);
    entries.push(mapped
      ? {
        sha256: hash,
        decision: 'redacted',
        category: 'project',
        reason: 'project identifier mapped to ' + mapped.placeholder,
        placeholder: mapped.placeholder,
      }
      : {
        sha256: hash,
        decision: 'generic',
        reason: 'common English or technical term',
      });
  }
  entries.sort((left, right) => left.sha256.localeCompare(right.sha256));
  return { schema: 'law-redaction-review/v1', entries };
}

export function verifyRedactionReview({ sources, redaction, review }) {
  const problems = [];
  if (review.schema !== 'law-redaction-review/v1' || !Array.isArray(review.entries)) {
    return ['review schema is invalid'];
  }
  const mapByHash = new Map(redaction.map((entry) => [entry.sha256, entry]));
  const decisions = new Map();
  for (const entry of review.entries) {
    if (!HASH.test(entry.sha256 ?? '')) problems.push('bad candidate hash');
    if (!DECISIONS.has(entry.decision)) problems.push('unknown decision: ' + entry.decision);
    if (decisions.has(entry.sha256)) problems.push('duplicate candidate: ' + entry.sha256);
    decisions.set(entry.sha256, entry);
  }
  const candidates = candidateTokens(sources);
  for (const [hash, candidate] of candidates) {
    if (!candidate.capitalized && !mapByHash.has(hash)) continue;
    if (!decisions.has(hash)) problems.push('candidate has no decision: ' + candidate.token);
  }
  for (const entry of redaction) {
    if (!decisions.has(entry.sha256)) problems.push('map entry lacks a review: ' + entry.placeholder);
  }
  for (const entry of review.entries) {
    if (entry.decision !== 'redacted' && mapByHash.has(entry.sha256)) {
      problems.push('map entry is not marked redacted');
    }
  }
  for (const [hash, candidate] of candidates) {
    if (decisions.get(hash)?.decision === 'redacted' && NORMATIVE_CONSTANT.test(candidate.token)) {
      problems.push('normative constant is redacted: ' + candidate.token);
    }
  }
  return [...new Set(problems)];
}
