// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
/**
 * The generated manual must teach traversal, not just list commands.
 */

export const REQUIRED_SECTIONS = Object.freeze([
  '## Start Here',
  '## Directory Traversal',
  '## Concept Page',
  '## Outgoing and Incoming',
  '## Multi-Hop Reach',
  '## Required Context',
  '## Zero Results',
  '## Budget Exceeded',
  '## Trust and Freshness',
  '## Sources and Citation',
  '## Authoring and Update',
  '## Failure Modes',
]);

export const MINIMUM_SCENARIOS = 10;

export function auditUsageManual(text) {
  const manual = String(text ?? '');
  const findings = [];
  for (const section of REQUIRED_SECTIONS) {
    if (!manual.includes(section)) findings.push({ code: 'USAGE_INCOMPLETE', detail: section });
  }
  const scenarios = (manual.match(/^### Scenario/gm) ?? []).length;
  if (scenarios < MINIMUM_SCENARIOS) {
    findings.push({ code: 'USAGE_INCOMPLETE', detail: `scenarios: ${scenarios} < ${MINIMUM_SCENARIOS}` });
  }
  if (/[぀-ヿ一-鿿]/.test(manual)) findings.push({ code: 'STYLE_NOT_ENGLISH', detail: 'non-English manual' });
  return findings;
}
