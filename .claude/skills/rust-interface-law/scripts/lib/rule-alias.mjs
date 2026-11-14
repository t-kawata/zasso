// [::TICKET::] PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-427 --for-spec --no-implementation-order`.
// [::TICKET::] PX-428 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-428 --for-spec --no-implementation-order`.
/**
 * Resolve package rule rows to canonical rules and reject duplicate obligations.
 *
 * The canonical id comes from the registry. A legacy id with the same
 * obligation is an alias, not a second rule. A legacy family with no canonical
 * counterpart becomes a new canonical rule.
 */

export function resolveRuleRow(row, aliasTable = { aliases: {} }) {
  const alias = aliasTable.aliases?.[row.id];
  if (alias) {
    return {
      id: row.id,
      disposition: 'alias',
      targetConcept: alias.target,
      reason: alias.reason ?? '',
    };
  }
  return {
    id: row.id,
    disposition: 'concept',
    targetConcept: row.id,
    reason: 'canonical rule',
  };
}

export function assertNoDuplicateObligation(rows = []) {
  const byObligation = new Map();
  for (const row of rows) {
    if (!row.obligation) continue;
    if (!byObligation.has(row.obligation)) byObligation.set(row.obligation, new Set());
    byObligation.get(row.obligation).add(row.targetConcept);
  }
  for (const [obligation, targets] of byObligation) {
    if (targets.size > 1) {
      throw Object.assign(
        new Error(`ALIAS_CONFLICT: ${obligation} maps to ${[...targets].join(', ')}`),
        { code: 'ALIAS_CONFLICT', obligation, targets: [...targets] },
      );
    }
  }
}

export function planRuleUniverse({ priorIds = [], packageRuleIds = [], aliases = { aliases: {} } }) {
  const prior = new Set(priorIds);
  const canonical = new Set(priorIds);
  const added = [];
  for (const id of packageRuleIds) {
    const alias = aliases.aliases?.[id];
    if (alias) continue;
    if (canonical.has(id)) continue;
    canonical.add(id);
    added.push(id);
  }
  const canonicalIds = [...canonical].sort();
  return {
    canonicalIds,
    added: added.sort(),
    missingPrior: priorIds.filter((id) => !canonical.has(id)).sort(),
  };
}
