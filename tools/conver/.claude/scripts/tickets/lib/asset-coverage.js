'use strict';

/**
 * asset-coverage.js — the shared "is this asset named by a test?" predicate.
 *
 * The false pass this closes is a nearby match: a keyword somewhere in the test
 * plan used to satisfy a contract, and one code block used to satisfy every
 * contract. A test entry satisfies an asset only when the same entry names the
 * asset id and carries one of the asset's own terms.
 */

/** Escape a literal string for a regular expression. */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whether the text contains a word-boundary occurrence of the term. */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function mentions(text, term) {
  if (typeof text !== 'string' || typeof term !== 'string' || term.length === 0) return false;
  return new RegExp('(^|[^A-Za-z0-9_])' + escapeRegExp(term) + '([^A-Za-z0-9_]|$)').test(text);
}

/**
 * The content words of a clause, lowercased and deduplicated.
 *
 * Short words are dropped because they carry no identity: a contract clause of
 * "p", "q", "r" is anchored by the contract id alone.
 *
 * @param {unknown} text
 * @returns {string[]}
 */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function significantTerms(text) {
  const terms = String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((word) => word.length > 3);
  return [...new Set(terms)];
}

/**
 * Whether one test entry names the asset and carries every clause term.
 *
 * Requiring every content word is what separates "C001 order exists" from a
 * contract whose postcondition says "order saved": the same contract id is not
 * a substitute for the clause it is supposed to prove.
 *
 * @param {{ assetId: string, clause: string, testEntries: string[] }} input
 * @returns {boolean}
 */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function assetIsNamedByTest({ assetId, clause, testEntries }) {
  const terms = significantTerms(clause);
  return (testEntries || []).some((entry) => {
    if (!mentions(entry, assetId)) return false;
    if (terms.length === 0) return true;
    const lower = entry.toLowerCase();
    return terms.every((term) => lower.includes(term));
  });
}

/**
 * Whether one test entry carries the majority of a text's content words.
 *
 * Acceptance criteria carry no id, so the criterion's own terms are the anchor.
 *
 * @param {string} text
 * @param {string[]} testEntries
 * @returns {boolean}
 */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function textIsNamedByTest(text, testEntries) {
  const terms = significantTerms(text);
  if (terms.length === 0) return true;
  const requiredHits = Math.ceil(terms.length / 2);
  return (testEntries || []).some((entry) => {
    const lower = entry.toLowerCase();
    return terms.filter((term) => lower.includes(term)).length >= requiredHits;
  });
}

/** The language that marks a testException as a justified non-defect. */
const JUSTIFIED_EXCEPTION_RE = /not testable|cannot test|not a design defect|not an architectural defect|テスト不能|設計欠陥ではない/i;

/**
 * Whether a testException justifies leaving an asset untested.
 *
 * @param {string[]} testExceptions
 * @param {string} assetId
 * @param {string} clause
 * @returns {boolean}
 */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function hasJustifiedException(testExceptions, assetId, clause) {
  const terms = significantTerms(clause);
  return (testExceptions || []).some((exception) => {
    if (typeof exception !== 'string') return false;
    if (!JUSTIFIED_EXCEPTION_RE.test(exception)) return false;
    if (assetId && mentions(exception, assetId)) return true;
    return terms.some((term) => exception.toLowerCase().includes(term));
  });
}

module.exports = {
  escapeRegExp,
  mentions,
  significantTerms,
  assetIsNamedByTest,
  textIsNamedByTest,
  hasJustifiedException,
};
