// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-445 --for-spec --no-implementation-order`.

import { RULE_ID_PATTERN } from './constants.mjs';
import { failRevision } from './errors.mjs';

export function parseProcessDirectives({ plan }) {
  const directives = (plan?.operations ?? [])
    .filter((operation) => operation.op === 'process-directive')
    .map((operation) => ({ id: operation.id, directive: operation.directive, evidence: operation.evidence ?? null }));
  const completionCriteria = (plan?.operations ?? [])
    .filter((operation) => operation.op === 'completion-criterion')
    .map((operation) => ({
      id: operation.id,
      criterion: operation.criterion,
      conformance_target: operation.conformance_target,
      evidence: operation.evidence ?? null,
    }));
  return {
    schema: 'revision-policy/v1',
    id_policy: plan?.policy?.id_policy ?? 'append',
    allow_rename_rule: plan?.policy?.allow_rename_rule ?? false,
    directives,
    completion_criteria: completionCriteria,
  };
}

export function validatePolicy(policy) {
  if (!policy || policy.schema !== 'revision-policy/v1') {
    failRevision('REVISION_POLICY_INVALID', 'policy is missing or invalid', { target: 'policy' });
  }
  for (const directive of policy.directives ?? []) {
    if (RULE_ID_PATTERN.test(directive.id ?? '')) {
      failRevision('PROCESS_DIRECTIVE_AS_RULE', `process directive looks like a law rule: ${directive.id}`, { target: directive.id });
    }
  }
  for (const criterion of policy.completion_criteria ?? []) {
    if (!criterion.conformance_target) {
      failRevision('COMPLETION_CRITERION_UNMAPPED', `completion criterion has no conformance target: ${criterion.id}`, { target: criterion.id });
    }
  }
  return true;
}
