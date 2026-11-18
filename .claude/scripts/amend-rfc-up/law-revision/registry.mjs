// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.

import { failRevision } from '../revision/errors.mjs';

export function applyRegistryOperations({ baselineRegistry, operations }) {
  const rows = new Map((baselineRegistry ?? []).map((row) => [row.id, { ...row }]));
  for (const operation of operations ?? []) {
    if (!operation.op) continue;
    if (operation.op === 'update-rule') {
      requireRow(rows, operation.target);
      rows.get(operation.target).statement = operation.statement ?? rows.get(operation.target).statement;
      if (operation.class) rows.get(operation.target).class = operation.class;
      if (operation.parent) rows.get(operation.target).parent = operation.parent;
    } else if (operation.op === 'update-registry-row') {
      requireRow(rows, operation.target);
      for (const field of ['class', 'parent', 'applicability', 'verification', 'gate']) {
        if (operation[field]) rows.get(operation.target)[field] = operation[field];
      }
    } else if (operation.op === 'add-rule') {
      rows.set(operation.id, {
        id: operation.id,
        class: operation.class ?? operation.id.slice(0, 1),
        parent: operation.parent ?? operation.id.split('-')[0],
        applicability: operation.applicability ?? 'all',
        statement: operation.statement,
        verification: operation.verification ?? 'V1',
        gate: operation.gate ?? 'review',
      });
    } else if (operation.op === 'retire-rule') {
      requireRow(rows, operation.target);
      rows.delete(operation.target);
    } else if (operation.op === 'rename-rule') {
      requireRow(rows, operation.target);
      const row = rows.get(operation.target);
      rows.delete(operation.target);
      rows.set(operation.new_id, { ...row, id: operation.new_id });
    } else if (operation.op === 'merge-rules') {
      const kept = operation.kept_id;
      if (!kept) failRevision('MERGE_MAPPING_INVALID', 'merge-rules needs kept_id', { target: operation.op });
      for (const target of operation.targets ?? []) {
        if (target !== kept) rows.delete(target);
      }
    } else if (operation.op === 'split-rule') {
      const kept = operation.kept_id;
      if (!kept) failRevision('SPLIT_MAPPING_INVALID', 'split-rule needs kept_id', { target: operation.target });
      if (operation.kept_class) rows.get(kept).class = operation.kept_class;
      for (const rule of operation.new_rules ?? []) {
        rows.set(rule.id, {
          id: rule.id,
          class: rule.class,
          parent: rule.parent,
          applicability: rule.applicability ?? 'all',
          statement: rule.statement,
          verification: rule.verification ?? 'V1',
          gate: rule.gate ?? 'review',
        });
      }
    }
  }
  return [...rows.values()].sort((left, right) => left.id.localeCompare(right.id));
}

export function assertRegistryBijection(rows, ruleConcepts) {
  const registryIds = new Set((rows ?? []).map((row) => row.id));
  const conceptIds = new Set(Object.keys(ruleConcepts?.byRule ?? {}));
  for (const id of registryIds) {
    if (!conceptIds.has(id)) failRevision('REGISTRY_MISMATCH', `registry row has no rule concept: ${id}`, { target: id });
  }
  for (const id of conceptIds) {
    if (!registryIds.has(id)) failRevision('REGISTRY_MISMATCH', `rule concept has no registry row: ${id}`, { target: id });
  }
  return true;
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function requireRow(rows, target) {
  if (!target || !rows.has(target)) {
    failRevision('REVISION_TARGET_MISSING', `registry target is absent: ${target}`, { target });
  }
}
