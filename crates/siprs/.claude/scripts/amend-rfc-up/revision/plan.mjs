// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.

import { OPERATION_TYPES, RULE_ID_PATTERN } from './constants.mjs';
import { failRevision } from './errors.mjs';

const TARGET_OPERATIONS = new Set([
  'update-rule',
  'retire-rule',
  'merge-rules',
  'split-rule',
  'rename-rule',
  'update-section',
  'retire-section',
  'rename-section',
  'update-concept',
  'retire-concept',
  'rename-concept',
  'update-registry-row',
  'update-api-contract',
  'update-profile',
  'update-conformance',
  'update-implementation-policy',
  'update-implementation-contract',
  'update-implementation-test',
  'update-template',
  'update-generated-index',
  'update-asset',
  'retire-asset',
]);

const EVIDENCE_OPTIONAL = new Set(['process-directive', 'completion-criterion', 'no-op']);

export function validateRevisionPlan({ plan, baseline = {}, documentMap = {}, policy = {} }) {
  if (plan?.schema !== 'revision-plan/v1') {
    failRevision('REVISION_PLAN_INVALID', `unexpected plan schema: ${plan?.schema}`, { target: 'schema' });
  }
  if (!Array.isArray(plan.operations)) {
    failRevision('REVISION_PLAN_INVALID', 'plan.operations must be an array', { target: 'operations' });
  }
  const baselineRules = baseline.rules ?? {};
  const tombstones = new Set(baseline.tombstones ?? []);
  const seenTargets = new Set();

  for (const operation of plan.operations) {
    if (!OPERATION_TYPES.includes(operation.op)) {
      failRevision('REVISION_PLAN_INVALID', `unknown operation: ${operation.op}`, { target: operation.op });
    }
    if (TARGET_OPERATIONS.has(operation.op)) {
      const target = operation.target ?? operation.id;
      if (seenTargets.has(target)) {
        failRevision('REVISION_OPERATION_CONFLICT', `more than one operation targets ${target}`, { target });
      }
      seenTargets.add(target);
      if (!Object.hasOwn(baselineRules, target)) {
        failRevision('REVISION_TARGET_MISSING', `target is absent from the baseline: ${target}`, { target });
      }
    }
    if (operation.op === 'add-rule') {
      if (!RULE_ID_PATTERN.test(operation.id ?? '')) {
        failRevision('RULE_ID_INVALID', `invalid rule id: ${operation.id}`, { target: operation.id });
      }
      if (Object.hasOwn(baselineRules, operation.id) || tombstones.has(operation.id)) {
        failRevision('RULE_ID_REUSED', `rule id is already present or tombstoned: ${operation.id}`, { target: operation.id });
      }
      if (!operation.id_rationale) {
        failRevision('ID_RATIONALE_MISSING', `add-rule needs an independence rationale: ${operation.id}`, { target: operation.id });
      }
      if (operation.specialization_of) {
        failRevision('REVISION_SPECIALIZATION_NEEDS_UPDATE', `use update-rule for a specialization: ${operation.id}`, { target: operation.id });
      }
    }
    if (operation.op === 'rename-rule') {
      const allowed = policy.allow_rename_rule === true || operation.id_invalid === true || operation.collision === true;
      if (!allowed || !operation.rename_reason) {
        failRevision('RULE_RENAME_PROHIBITED', `rename-rule is not allowed for ${operation.target}`, { target: operation.target });
      }
    }
    if (operation.op === 'split-rule') {
      const ids = [operation.kept_id, ...(operation.new_rules ?? []).map((rule) => rule.id)];
      if (!operation.kept_id || !Array.isArray(operation.new_rules) || new Set(ids).size !== ids.length) {
        failRevision('SPLIT_MAPPING_INVALID', `split mapping is incomplete for ${operation.target}`, { target: operation.target });
      }
    }
    if (operation.op === 'merge-rules' && !operation.kept_id) {
      failRevision('MERGE_MAPPING_INVALID', `merge mapping needs kept_id for ${operation.target}`, { target: operation.target });
    }
    if (!EVIDENCE_OPTIONAL.has(operation.op)) {
      assertEvidence({ operation, documentMap });
    }
  }
  return true;
}

export function assertEvidence({ operation, documentMap }) {
  const evidence = operation.evidence;
  if (!evidence || !Number.isInteger(evidence.line) || !evidence.line_sha256) {
    failRevision('REVISION_EVIDENCE_MISSING', `operation lacks a line evidence reference: ${operation.op}`, { target: operation.target ?? operation.id });
  }
  if (evidence.line < 1 || evidence.line > documentMap.lineCount) {
    failRevision('REVISION_EVIDENCE_MISMATCH', `evidence line is outside the document: ${evidence.line}`, { target: operation.target ?? operation.id });
  }
  const expected = documentMap.lineHashes?.[evidence.line - 1];
  if (expected !== evidence.line_sha256) {
    failRevision('REVISION_EVIDENCE_MISMATCH', `evidence line hash does not match line ${evidence.line}`, { target: operation.target ?? operation.id });
  }
  return true;
}

export function sortOperations(operations) {
  return [...operations].sort((left, right) => {
    const leftKey = `${left.target ?? left.id ?? ''}\0${left.op}`;
    const rightKey = `${right.target ?? right.id ?? ''}\0${right.op}`;
    return leftKey.localeCompare(rightKey);
  });
}
