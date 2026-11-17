'use strict';

/**
 * PX-436 — legacy omission-key reconciliation.
 *
 * Legacy artifacts identify a finding as `contract|<ticket>/<contract>/<element>|<code>`.
 * That key has no text hash, so it is evidence for a canonical clause, not a
 * canonical identity. Reconciliation maps it without mutating a ticket and
 * without turning a legacy PASS into a PROVEN clause.
 */

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { writeTemporaryThenRename } = require('./atomic-write.js');
const { isProofFresh } = require('./coverage-map.js');

const SIDECAR_FILE_NAME = 'CONTRACT-INVENTORY-LEGACY.json';
const LEGACY_KEY = /^contract\|([^/]+)\/([^/]+)\/([^|]+)\|(.+)$/;

/** Whether a value is a non-empty string. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

/** Parse a legacy stable key. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function parseLegacyKey(key) {
  const match = String(key ?? '').match(LEGACY_KEY);
  if (match === null) return null;
  return { owner: match[1], contractId: match[2], element: match[3], legacyCode: match[4] };
}

/** Find the canonical clauses a legacy key could denote. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function candidatesFor({ parsed, inventory }) {
  return (inventory?.clauses ?? []).filter((clause) => clause.contractId === parsed.contractId && clause.element === parsed.element);
}

/** Whether a coverage entry carries a fresh proof. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function proofIsFreshFor(entry) {
  const test = Array.isArray(entry?.tests) && entry.tests.length > 0 ? entry.tests[0] : null;
  return entry?.proof !== undefined && test !== null && isProofFresh({ proof: entry.proof, testDigest: test.digest });
}

/**
 * Reconcile legacy keys, baseline debt and legacy judgments.
 *
 * @param {{legacyStableKeys:string[], inventory:object, judgments?:object[], coverage?:object, ticketsChanged?:number}} input
 * @returns {object}
 */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function reconcileLegacy({ legacyStableKeys, inventory, judgments = [], coverage = null, ticketsChanged = 0 }) {
  const mapping = {};
  const ambiguous = [];
  const unmapped = [];
  const legacyDebt = [];
  const coverageByKey = new Map((coverage?.clauses ?? []).map((entry) => [entry.key, entry]));

  for (const legacyKey of legacyStableKeys ?? []) {
    const parsed = parseLegacyKey(legacyKey);
    if (parsed === null) {
      ambiguous.push({ legacyKey, reason: 'UNPARSABLE_LEGACY_KEY', candidates: [] });
      continue;
    }
    const candidates = candidatesFor({ parsed, inventory });
    if (candidates.length === 0) {
      unmapped.push({ legacyKey, reason: 'NO_CANONICAL_CLAUSE', contractId: parsed.contractId, element: parsed.element });
      continue;
    }
    if (candidates.length > 1) {
      ambiguous.push({ legacyKey, reason: 'MULTIPLE_CANONICAL_CLAUSES', owner: parsed.owner, candidates: candidates.map((clause) => clause.key).sort() });
      continue;
    }
    mapping[legacyKey] = candidates[0].key;
    legacyDebt.push({ legacyKey, canonicalKey: candidates[0].key, legacyCode: parsed.legacyCode });
  }

  const legacyPassWithoutProof = [];
  for (const judgment of judgments ?? []) {
    if (judgment.status !== 'PASS') continue;
    const clauses = (inventory?.clauses ?? []).filter((clause) => clause.contractId === (parseLegacyKey(judgment.assetId ?? '')?.contractId ?? judgment.assetId));
    const matching = clauses.length > 0 ? clauses : (inventory?.clauses ?? []).filter((clause) => clause.contractId === judgment.assetId);
    for (const clause of matching) {
      const entry = coverageByKey.get(clause.key);
      legacyPassWithoutProof.push({
        judgment,
        canonicalKey: clause.key,
        status: proofIsFreshFor(entry) ? 'PROVEN' : 'EVIDENCE_UNPROVEN',
      });
    }
    if (matching.length === 0) {
      legacyPassWithoutProof.push({ judgment, canonicalKey: null, status: 'EVIDENCE_UNPROVEN' });
    }
  }

  legacyPassWithoutProof.sort((left, right) => String(left.canonicalKey).localeCompare(String(right.canonicalKey)));
  const payload = { mapping, ambiguous, unmapped, legacyDebt, legacyPassWithoutProof, ticketsChanged };
  return {
    version: 1,
    ...payload,
    digest: 'sha256:' + createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
  };
}

/** Write the reconciliation sidecar atomically. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function writeLegacySidecar({ cwd, result }) {
  const target = path.join(cwd, SIDECAR_FILE_NAME);
  writeTemporaryThenRename(target, JSON.stringify(result, null, 2) + '\n');
  return target;
}

module.exports = {
  LEGACY_KEY,
  SIDECAR_FILE_NAME,
  candidatesFor,
  parseLegacyKey,
  reconcileLegacy,
  writeLegacySidecar,
};
