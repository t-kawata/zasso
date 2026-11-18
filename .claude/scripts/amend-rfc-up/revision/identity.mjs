// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.

import { RULE_ID_PATTERN } from './constants.mjs';
import { failRevision } from './errors.mjs';

export function applyIdentityOperations({
  baselineRuleIds = [],
  baselineConceptIds = [],
  tombstones = [],
  aliases = {},
  operations = [],
}) {
  const rules = {};
  for (const id of baselineRuleIds) {
    rules[id] = { concept_id: deriveRuleConceptId(id), status: 'unchanged' };
  }
  const concepts = {};
  for (const id of baselineConceptIds) {
    concepts[id] = { path: `${id}.md`, status: 'unchanged' };
  }
  const tombstonesSet = new Set(tombstones);
  const aliasMap = { ...aliases };

  for (const operation of operations) {
    switch (operation.op) {
      case 'update-rule':
        requireTarget(rules, operation.target);
        rules[operation.target].status = 'updated';
        break;
      case 'update-registry-row':
        requireTarget(rules, operation.target);
        break;
      case 'add-rule':
        if (!RULE_ID_PATTERN.test(operation.id ?? '')) {
          failRevision('RULE_ID_INVALID', `invalid rule id: ${operation.id}`, { target: operation.id });
        }
        if (Object.hasOwn(rules, operation.id) || tombstonesSet.has(operation.id)) {
          failRevision('RULE_ID_REUSED', `rule id is already present or tombstoned: ${operation.id}`, { target: operation.id });
        }
        rules[operation.id] = { concept_id: deriveRuleConceptId(operation.id), status: 'added' };
        break;
      case 'retire-rule':
        requireTarget(rules, operation.target);
        delete rules[operation.target];
        tombstonesSet.add(operation.target);
        break;
      case 'rename-rule':
        requireTarget(rules, operation.target);
        rules[operation.new_id] = { ...rules[operation.target], concept_id: deriveRuleConceptId(operation.new_id), status: 'renamed' };
        delete rules[operation.target];
        tombstonesSet.add(operation.target);
        aliasMap[operation.target] = operation.new_id;
        break;
      case 'merge-rules': {
        const kept = operation.kept_id;
        if (!kept) failRevision('MERGE_MAPPING_INVALID', 'merge-rules needs kept_id', { target: operation.op });
        for (const target of operation.targets ?? []) {
          requireTarget(rules, target);
          if (target !== kept) {
            delete rules[target];
            tombstonesSet.add(target);
            aliasMap[target] = kept;
          }
        }
        rules[kept] = { ...(rules[kept] ?? { concept_id: deriveRuleConceptId(kept) }), status: 'merged' };
        break;
      }
      case 'split-rule': {
        requireTarget(rules, operation.target);
        const kept = operation.kept_id;
        if (!kept) failRevision('SPLIT_MAPPING_INVALID', 'split-rule needs kept_id', { target: operation.target });
        rules[kept] = { ...(rules[kept] ?? { concept_id: deriveRuleConceptId(kept) }), status: 'split' };
        for (const rule of operation.new_rules ?? []) {
          rules[rule.id] = { concept_id: deriveRuleConceptId(rule.id), status: 'added' };
        }
        if (kept !== operation.target) {
          delete rules[operation.target];
          tombstonesSet.add(operation.target);
          aliasMap[operation.target] = kept;
        }
        break;
      }
      case 'update-concept':
        if (!Object.hasOwn(concepts, operation.target)) {
          failRevision('CONCEPT_LOST', `concept target is absent: ${operation.target}`, { target: operation.target });
        }
        concepts[operation.target].status = 'updated';
        break;
      case 'add-concept':
        concepts[operation.id] = { path: `${operation.id}.md`, status: 'added' };
        break;
      case 'retire-concept':
        if (!Object.hasOwn(concepts, operation.target)) {
          failRevision('CONCEPT_LOST', `concept target is absent: ${operation.target}`, { target: operation.target });
        }
        delete concepts[operation.target];
        tombstonesSet.add(operation.target);
        break;
      default:
        break;
    }
  }

  return {
    schema: 'revision-identity/v1',
    rules,
    concepts,
    tombstones: [...tombstonesSet].sort(),
    aliases: aliasMap,
  };
}

export function assertNoIdReuse(identity, baselineIds = []) {
  const baseline = new Set(baselineIds);
  for (const id of identity.tombstones ?? []) {
    if (Object.hasOwn(identity.rules ?? {}, id)) {
      failRevision('RULE_ID_REUSED', `tombstoned rule appears in the effective registry: ${id}`, { target: id });
    }
    if (baseline.has(id)) continue;
  }
  return true;
}

export function deriveRuleConceptId(id) {
  const ruleClass = String(id).slice(0, 1).toLowerCase();
  return `rules/${ruleClass}/${String(id).toLowerCase()}`;
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function requireTarget(rules, target) {
  if (!target || !Object.hasOwn(rules, target)) {
    failRevision('REVISION_TARGET_MISSING', `rule target is absent: ${target}`, { target });
  }
}
