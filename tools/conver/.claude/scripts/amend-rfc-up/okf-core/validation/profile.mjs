/**
 * Profile checks: the requirements of a particular consumer.
 */

import { getConcept } from '../adapters/okforest.mjs';

export function checkProfile(bundle, profile = {}) {
  const findings = [];
  for (const id of profile.requiredConcepts ?? []) {
    if (!getConcept(bundle, id)) findings.push(finding('MISSING_REQUIRED_CONCEPT', id, 'required concept is absent'));
  }
  for (const type of profile.requiredTypes ?? []) {
    if (!bundle.concepts.some((concept) => concept.type === type)) {
      findings.push(finding('MISSING_REQUIRED_TYPE', type, 'required type is absent'));
    }
  }
  for (const ruleId of profile.requiredRules ?? []) {
    const found = bundle.concepts.some((concept) => concept.frontmatter?.['x-rule-id'] === ruleId);
    if (!found) findings.push(finding('MISSING_REQUIRED_RULE', ruleId, 'required rule is absent'));
  }
  if (profile.allowDeprecated === false) {
    for (const concept of bundle.concepts) {
      if (concept.status === 'deprecated') {
        findings.push(finding('DEPRECATED_PRESENTED', concept.path, 'deprecated concept is present in the profile context'));
      }
    }
  }
  findings.push(...missingRequirements(bundle, profile.requiredConcepts ?? []));
  return findings;
}

// [::TICKET::] PX-425, PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-425|PX-426) --for-spec --no-implementation-order`.
function missingRequirements(bundle, entryIds) {
  const findings = [];
  for (const id of entryIds) {
    const concept = getConcept(bundle, id);
    for (const required of concept?.frontmatter?.['x-requires'] ?? []) {
      if (!getConcept(bundle, required)) {
        findings.push(finding('REQUIREMENT_MISSING', id, `required concept ${required} is absent`));
      }
    }
  }
  return findings;
}

// [::TICKET::] PX-425, PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-425|PX-426) --for-spec --no-implementation-order`.
function finding(code, path, message) {
  return { code, path, message };
}
