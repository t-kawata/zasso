'use strict';

/**
 * gate-debt.js — compare two runs and name a growing finding set.
 *
 * A repair that fixes one defect while introducing two is not progress. Debt is
 * an identity-set relation, not a count: a run whose identities are a subset of
 * the previous run is not worse, even when it still has findings.
 */

const {
  createFinding,
  findingIdentity,
  stableStringify,
} = require('./lib/gate-finding.js');

/** The identities of a finding set. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function identitySet(findings) {
  return new Set((findings || []).map(findingIdentity));
}

/**
 * Detect whether the current identity set grew beyond the previous one.
 *
 * The first run has no previous set, so it cannot be debt.
 *
 * @param {{ previousFindings: object[]|null, currentFindings: object[] }} input
 * @returns {{ increased: boolean, added: string[], removed: string[], code: string|null }}
 */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function detectDebt({ previousFindings, currentFindings }) {
  if (previousFindings === null || previousFindings === undefined) {
    return { increased: false, added: [], removed: [], code: null };
  }

  const previousIdentities = identitySet(previousFindings);
  const currentIdentities = identitySet(currentFindings);
  const added = [...currentIdentities].filter((identity) => !previousIdentities.has(identity));
  const removed = [...previousIdentities].filter((identity) => !currentIdentities.has(identity));

  return {
    increased: added.length > 0,
    added,
    removed,
    code: added.length > 0 ? 'DEBT_INCREASED' : null,
  };
}

/** The durable key of a fix, used to deduplicate repairs. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function fixKey(fix) {
  return fix.tool + '|' + stableStringify(fix.input);
}

/**
 * Turn an increase into a repairable finding.
 *
 * The new findings already name their repairs; the debt finding inherits those
 * repairs, so the loop can apply the same tools instead of stopping to ask what
 * to do about the increase.
 *
 * @param {{ increased: boolean, added: string[] }} debt
 * @param {object[]} currentFindings
 * @returns {object} — frozen DEBT_INCREASED finding
 */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function debtFinding(debt, currentFindings) {
  const addedEntries = (currentFindings || [])
    .filter((finding) => debt.added.includes(findingIdentity(finding)));

  if (addedEntries.length === 0) {
    throw new Error('DEBT_INCREASED requires at least one added finding');
  }

  const seen = new Set();
  const inheritedFixes = [];
  for (const finding of addedEntries) {
    for (const fix of finding.fixes) {
      const key = fixKey(fix);
      if (seen.has(key)) continue;
      seen.add(key);
      inheritedFixes.push(fix);
    }
  }

  return createFinding({
    code: 'DEBT_INCREASED',
    asset: 'finding-set',
    problem: 'the finding set grew between runs: ' + debt.added.join(', '),
    fixes: inheritedFixes,
    rerun: addedEntries[0].rerun,
  });
}

module.exports = { detectDebt, debtFinding };
