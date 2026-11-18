'use strict';

// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-443 --for-spec --no-implementation-order`.
/**
 * legacy-omission-work-unit — give a pre-v3 omission ticket a measured plan.
 *
 * The legacy constructors inherit the source ticket's `testUnit`. That plan
 * covers the source, not the omission, so the clone must replace it with one
 * planned test per failed evaluation and carry omissionUnits. A legacy finding
 * without evaluations keeps its own test plan and gains one stable unit. A
 * ticket with neither stays unmeasured, and the condense gate fails closed.
 */

const { createHash } = require('node:crypto');

/** A short stable digest for a legacy clause key. */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-443 --for-spec --no-implementation-order`.
function digestOf(text) {
  return createHash('sha256').update(String(text)).digest('hex').slice(0, 16);
}

/** The failed evaluations of one legacy omission ticket. */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-443 --for-spec --no-implementation-order`.
function failedEvaluationsOf(ticket) {
  const omissions = Array.isArray(ticket?.foundOmissions) ? ticket.foundOmissions : [];
  return omissions.flatMap((omission) => (
    Array.isArray(omission?.evaluations) ? omission.evaluations : []
  ).filter((evaluation) => evaluation?.passed === false));
}

/** The contract or source key a legacy omission belongs to. */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-443 --for-spec --no-implementation-order`.
function contractIdOf(ticket) {
  return ticket?.contracts?.[0]?.id
    ?? ticket?.originalTicketKey
    ?? ticket?.origin?.sourceTicket
    ?? 'legacy-omission';
}

/** A stable key for one failed evaluation. */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-443 --for-spec --no-implementation-order`.
function evaluationKeyOf(ticket, evaluation) {
  const criterion = evaluation?.criterion ?? 'criterion';
  const evidence = JSON.stringify(evaluation?.evidence ?? []);
  return 'legacy|' + contractIdOf(ticket) + '|' + criterion + '|' + digestOf(String(evaluation?.reason ?? '') + evidence);
}

/** The unit key of one clause set. */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-443 --for-spec --no-implementation-order`.
function unitKeyOf(clauses) {
  return 'legacy-omission-unit:' + digestOf([...clauses].sort().join('\n'));
}

/**
 * The measured plan a legacy omission ticket must carry.
 *
 * @param {object} ticket — the legacy omission clone or finding
 * @param {{replaceTestPlan?:boolean}} [options] — true for a clone that inherited
 *   the source's plan; false for a finding that already carries its own plan
 * @returns {{testUnit:string[], testIntegration:string[], omissionStableKeys:string[], omissionUnitKeys:string[], omissionUnits:object[]}|null}
 */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-443 --for-spec --no-implementation-order`.
function legacyOmissionWorkOf(ticket, options = {}) {
  const failed = failedEvaluationsOf(ticket);
  const contractId = contractIdOf(ticket);
  const rootTicketKey = ticket?.originalTicketKey ?? ticket?.origin?.sourceTicket ?? null;
  const existingTests = Array.isArray(ticket?.testUnit) ? ticket.testUnit.filter((id) => typeof id === 'string' && id.length > 0) : [];

  let clauses;
  let testUnit;
  if (failed.length > 0) {
    clauses = [...new Set(failed.map((evaluation) => evaluationKeyOf(ticket, evaluation)))].sort();
    testUnit = clauses.map((clause) => 'legacy-omission-test:' + clause);
  } else if (typeof ticket?.omissionStableKey === 'string' && ticket.omissionStableKey.length > 0) {
    clauses = [ticket.omissionStableKey];
    testUnit = options.replaceTestPlan === true || existingTests.length === 0
      ? ['legacy-omission-test:' + ticket.omissionStableKey]
      : existingTests;
  } else if (existingTests.length > 0 && options.replaceTestPlan !== true) {
    clauses = ['legacy|' + contractId + '|existing-test|' + digestOf(existingTests.join('\n'))];
    testUnit = existingTests;
  } else {
    return null;
  }

  const group = contractId;
  return {
    testUnit,
    testIntegration: [],
    omissionStableKeys: [group],
    omissionUnitKeys: [unitKeyOf(clauses)],
    omissionUnits: [{
      group,
      contractId,
      blockingClass: 'test-missing',
      clauses,
      rootTicketKey,
    }],
  };
}

module.exports = {
  failedEvaluationsOf,
  legacyOmissionWorkOf,
};
