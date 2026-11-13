// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
// @verifies C007
/**
 * A *-okf SKILL.md is a usage manual, not a terse dispatch table.
 *
 * The audit requires every scenario section and at least two concrete examples.
 */

export const REQUIRED_USAGE_SECTIONS = Object.freeze([
  '## When to Use',
  '## Query Recipes',
  '## Evidence and Citation',
  '## Freshness and Conflict',
  '## Update Procedure',
  '## Page Authoring',
  '## Failure Modes',
  '## Examples',
]);

export function auditUsageManual(text) {
  const findings = [];
  for (const heading of REQUIRED_USAGE_SECTIONS) {
    if (!String(text).includes(heading)) findings.push({ code: 'USAGE_INCOMPLETE', detail: heading });
  }
  const examples = (String(text).match(/^### Example/gm) ?? []).length;
  if (examples < 2) findings.push({ code: 'USAGE_INCOMPLETE', detail: 'two examples required' });
  return findings;
}
