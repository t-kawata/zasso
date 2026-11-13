// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
/**
 * Assemble the review report from measured results. Every claim carries the
 * command or artifact that produced it.
 */

export function buildFinalReport({ results = {} } = {}) {
  const sections = ['conformance', 'auditMatrix', 'scenarios', 'performance', 'comparison'];
  const claims = [];
  const add = (id, text, evidence) => claims.push({ id, text, evidence });
  add('conformance', 'conformance/lint/profile results', results.conformance ?? 'not recorded');
  add('audit', 'enforcement audit matrix', results.audit ?? 'not recorded');
  add('scenarios', 'twelve exploration scenarios', results.scenarios ?? 'not recorded');
  add('performance', 'performance budgets', results.performance ?? 'not recorded');
  add('comparison', 'law and wiki comparison', results.comparison ?? 'not recorded');
  return { sections, claims };
}
