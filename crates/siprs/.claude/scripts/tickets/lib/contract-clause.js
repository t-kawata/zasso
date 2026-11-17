'use strict';

/**
 * PX-436 — canonical clause identity.
 *
 * A clause is the smallest normative unit that can be proved. Its identity is
 * independent of a line, ticket, phase or run: the content is the normalized
 * text, and the key carries its short sha256. Normalization is fixed and
 * versioned because a change to it renumbers every existing obligation.
 */

const { createHash } = require('node:crypto');

/** The default element vocabulary. An adapter may extend it. */
const DEFAULT_ELEMENTS = Object.freeze(['precondition', 'postcondition', 'invariant']);

/** Version of the normalization rule; a change changes every text hash. */
const NORMALIZATION_VERSION = 1;

/** Version of the field splitter; a change renumbers split clauses. */
const SPLITTER_VERSION = 1;

/** Hex characters of the sha256 kept in a canonical key. */
const TEXT_HASH_LENGTH = 16;

/** The prefix every canonical clause key carries. */
const CLAUSE_KEY_PREFIX = 'clause';

/**
 * Normalize clause text.
 *
 * NFC, line endings to LF, trailing whitespace removed per line, runs of
 * whitespace collapsed to one space, surrounding text trimmed. The original
 * text is kept for display; the normalized text is the identity.
 *
 * @param {unknown} value
 * @returns {string}
 */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function normalizeClauseText(value) {
  return String(value ?? '')
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/u, ''))
    .join('\n')
    .replace(/\s+/gu, ' ')
    .trim();
}

/**
 * The short content hash of a clause.
 *
 * @param {unknown} text
 * @returns {string} 16 lowercase hex characters
 */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function textHash(text) {
  return createHash('sha256').update(normalizeClauseText(text)).digest('hex').slice(0, TEXT_HASH_LENGTH);
}

/** Whether the text carries a clause after normalization. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function isNonEmptyText(text) {
  return normalizeClauseText(text).length > 0;
}

/** Ensure a value is a non-empty string. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function requireNonEmptyString(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError('clauseKey requires a non-empty ' + name);
  }
  return value;
}

/**
 * Build the canonical key of one clause.
 *
 * @param {{ scope: string, contractId: string, element: string, ordinal?: number|null, text: string }} input
 * @returns {string} `clause|<scope>|<contract-id>|<element>[#<ordinal>]|<text-hash>`
 */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function clauseKey({ scope, contractId, element, ordinal = null, text }) {
  const ownerScope = requireNonEmptyString(scope, 'scope');
  const id = requireNonEmptyString(contractId, 'contractId');
  const name = requireNonEmptyString(element, 'element');
  const elementPart = ordinal === null || ordinal === undefined ? name : name + '#' + String(ordinal);
  return [CLAUSE_KEY_PREFIX, ownerScope, id, elementPart, textHash(text)].join('|');
}

/**
 * Recover the identity fields from a canonical key.
 *
 * @param {string} key
 * @returns {{scope:string,contractId:string,element:string,ordinal:number|null,textHash:string}|null}
 */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function parseClauseKey(key) {
  if (typeof key !== 'string') return null;
  const parts = key.split('|');
  if (parts.length !== 5 || parts[0] !== CLAUSE_KEY_PREFIX) return null;
  const [, scope, contractId, elementPart, hash] = parts;
  if (scope.length === 0 || contractId.length === 0 || elementPart.length === 0 || !/^[0-9a-f]{16}$/.test(hash)) return null;

  const ordinalMatch = elementPart.match(/^(.*)#(\d+)$/);
  const element = ordinalMatch ? ordinalMatch[1] : elementPart;
  const ordinal = ordinalMatch ? Number.parseInt(ordinalMatch[2], 10) : null;
  if (element.length === 0) return null;

  return { scope, contractId, element, ordinal, textHash: hash };
}

/**
 * Compare two strings by Unicode code point, never by locale.
 *
 * @param {string} left
 * @param {string} right
 * @returns {number}
 */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function compareClauseKeys(left, right) {
  const a = Array.from(String(left ?? ''));
  const b = Array.from(String(right ?? ''));
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const leftPoint = a[index].codePointAt(0);
    const rightPoint = b[index].codePointAt(0);
    if (leftPoint !== rightPoint) return leftPoint < rightPoint ? -1 : 1;
  }
  if (a.length === b.length) return 0;
  return a.length < b.length ? -1 : 1;
}

module.exports = {
  CLAUSE_KEY_PREFIX,
  DEFAULT_ELEMENTS,
  NORMALIZATION_VERSION,
  SPLITTER_VERSION,
  TEXT_HASH_LENGTH,
  clauseKey,
  compareClauseKeys,
  isNonEmptyText,
  normalizeClauseText,
  parseClauseKey,
  textHash,
};
