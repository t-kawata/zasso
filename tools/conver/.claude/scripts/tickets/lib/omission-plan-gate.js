'use strict';

// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-443 --for-spec --no-implementation-order`.
/**
 * omission-plan-gate — the write precondition for an omission ticket set.
 *
 * A candidate is promoted only when every added ticket is measured implementation
 * work, the changed phases are at their contiguous partition minimum, every
 * detected clause belongs to exactly one sink, and no open ticket already owns
 * the same unit. The gate never reads condensedFrom: the live fields are the
 * obligation the survivor carries.
 */

const { PROVEN_STATUSES } = require('./blocker-plan.js');
const { workKindOf } = require('./omission-work-unit.js');
const { condensePlan } = require('./ticket-partition.js');
const { WORKLOAD_COMPONENTS, workloadOfTicket } = require('./ticket-workload.js');
const { isCompletedStatus } = require('./ticket-status.js');

const OMISSION_PLAN_CODES = Object.freeze({
  UNMEASURED: 'OMISSION_TICKET_UNMEASURED',
  EVIDENCE_TICKET: 'OMISSION_EVIDENCE_TICKET',
  OWNERSHIP: 'OMISSION_OWNERSHIP_DECLARED',
  REPAIR_TICKETIZED: 'OMISSION_REPAIR_TICKETIZED',
  NOT_MINIMAL: 'OMISSION_SET_NOT_MINIMAL',
  NOT_VERIFIED: 'OMISSION_SET_NOT_VERIFIED',
  DUPLICATE_UNIT: 'OMISSION_DUPLICATE_UNIT',
  SCHEMA: 'OMISSION_TICKET_SCHEMA_INVALID',
  CONSERVATION: 'OMISSION_OBLIGATION_LOST',
  OVER_BUDGET: 'OMISSION_TICKET_OVER_BUDGET',
});

const OMISSION_WORK_KIND = 'implementation';

/** Coverage statuses whose work is tracked outside a ticket. */
// UNMAPPED is deliberately absent: an unmapped clause needs implementation work
// and must become a ticket. Letting a status name itself as a sink would let a
// planner drop it while the conservation gate still passed.
const NON_TICKET_SINK_STATUSES = new Set([
  'CLAUSE_PROOF_MISSING',
  'CLAUSE_PROOF_STALE',
  'CLAUSE_PROOF_FAILED',
  'UNSTABLE_PROOF_TARGET',
  'UNCLASSIFIED',
  'CLAUSE_DISPOSITION_UNVERIFIED',
  'DEFERRED_EXPIRED',
  'CONFLICT',
  'CONFLICTING_TEXT',
]);

/** The clause keys a repair record names. */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-443 --for-spec --no-implementation-order`.
function repairSinkClauses(records) {
  const keys = new Set();
  for (const record of records ?? []) {
    const candidates = Array.isArray(record?.clauses) ? record.clauses : [record?.key, record?.clauseKey];
    for (const key of candidates) {
      if (typeof key === 'string' && key.startsWith('clause|')) keys.add(key);
    }
  }
  return keys;
}

/** The public key of one ticket record. */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-443 --for-spec --no-implementation-order`.
function ticketKeyOf(phaseId, ticketId) {
  return phaseId === -1 ? 'PX-' + String(ticketId) : 'P' + String(phaseId) + '-' + String(ticketId);
}

/** Flatten a document with each record's key and phase id. */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-443 --for-spec --no-implementation-order`.
function flattenTickets(document) {
  return (document?.phases ?? []).flatMap((phase) => (phase.tickets ?? []).map((ticket) => ({
    key: ticketKeyOf(phase.id, ticket.id),
    phaseId: phase.id,
    ticket,
  })));
}

/** One blocking finding. */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-443 --for-spec --no-implementation-order`.
function finding(code, subject, message) {
  return { code, subject, message };
}

/** The unit keys a ticket carries. */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-443 --for-spec --no-implementation-order`.
function unitKeysOf(ticket) {
  if (Array.isArray(ticket?.omissionUnitKeys)) return ticket.omissionUnitKeys;
  return typeof ticket?.omissionUnitKey === 'string' ? [ticket.omissionUnitKey] : [];
}

/** Whether a ticket measures at least one unit of implementation work. */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-443 --for-spec --no-implementation-order`.
function isMeasured(ticket, context) {
  const workload = workloadOfTicket(ticket, context);
  // A contract count is context, not implementation work. U1 is specifically
  // the test plan: a ticket with contracts but no tests is an evidence ticket.
  const testWork = (workload?.testUnit ?? 0) + (workload?.testIntegration ?? 0);
  return testWork > 0;
}

/** The measured clause keys that are not proven. */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-443 --for-spec --no-implementation-order`.
function measuredUniverse(coverage) {
  return new Set((coverage?.clauses ?? [])
    .filter((clause) => !PROVEN_STATUSES.has(clause.status))
    .map((clause) => clause.key));
}

/** The clause keys a ticket's live omission payload carries. */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-443 --for-spec --no-implementation-order`.
function ticketedClauses(ticket) {
  return (ticket?.omissionUnits ?? []).flatMap((unit) => unit.clauses ?? []);
}

/**
 * Verify a candidate omission ticket set.
 *
 * @returns {{ok:boolean, findings:object[]}}
 */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-443 --for-spec --no-implementation-order`.
function verifyOmissionPlan({ before, candidate, addedKeys = [], artifacts = {} }) {
  const findings = [];
  const context = artifacts.context ?? {};
  const components = artifacts.components ?? WORKLOAD_COMPONENTS;
  const candidateRecords = flattenTickets(candidate);
  const beforeRecords = flattenTickets(before);
  const added = [];

  for (const key of addedKeys) {
    const record = candidateRecords.find((entry) => entry.key === key);
    if (record === undefined) {
      findings.push(finding(OMISSION_PLAN_CODES.SCHEMA, key, 'the added ticket is absent from the candidate'));
      continue;
    }
    added.push(record);
  }

  for (const { key, ticket } of added) {
    if (ticket?.origin?.kind !== 'omission') {
      findings.push(finding(OMISSION_PLAN_CODES.SCHEMA, key, 'origin.kind is not omission'));
    }
    if (!Array.isArray(ticket?.contracts) || ticket.contracts.length === 0) {
      findings.push(finding(OMISSION_PLAN_CODES.SCHEMA, key, 'contracts is empty'));
    }
    if ((ticket?.nodeIds ?? []).length > 0) {
      findings.push(finding(OMISSION_PLAN_CODES.OWNERSHIP, key, 'an omission ticket must not claim nodes'));
    }
    const units = Array.isArray(ticket?.omissionUnits) ? ticket.omissionUnits : [];
    if (units.length === 0) {
      findings.push(finding(OMISSION_PLAN_CODES.EVIDENCE_TICKET, key, 'omissionUnits is empty'));
    }
    if (units.some((unit) => typeof unit?.blockingClass === 'string'
      && workKindOf(unit.blockingClass) !== OMISSION_WORK_KIND)) {
      findings.push(finding(OMISSION_PLAN_CODES.REPAIR_TICKETIZED, key, 'repair or classification work became a ticket'));
    }
    if (!isMeasured(ticket, context)) {
      findings.push(finding(OMISSION_PLAN_CODES.UNMEASURED, key, 'the measured workload is zero'));
    }
    if (artifacts.budget !== null && artifacts.budget !== undefined) {
      const workload = workloadOfTicket(ticket, context);
      const over = components.filter((component) => (
        (workload?.[component] ?? 0) > (artifacts.budget?.[component] ?? Number.POSITIVE_INFINITY)
      ));
      if (over.length > 0) {
        findings.push(finding(OMISSION_PLAN_CODES.OVER_BUDGET, key, 'over budget: ' + over.join(', ')));
      }
    }
  }

  const universe = measuredUniverse(artifacts.coverage);
  const ticketed = new Set(added.flatMap(({ ticket }) => ticketedClauses(ticket)));
  const outside = [...ticketed].filter((key) => !universe.has(key));
  if (outside.length > 0) {
    findings.push(finding(OMISSION_PLAN_CODES.CONSERVATION, outside[0], 'a ticket clause is outside the measured universe'));
  }
  const unassigned = [...universe].filter((key) => !ticketed.has(key));
  // Every unassigned clause must name a recognized non-ticket sink by its
  // measured status. A non-empty repair ledger is not enough: an unassigned
  // implementation clause is lost even when some other clause owns a repair.
  const coverageByKey = new Map((artifacts.coverage?.clauses ?? []).map((clause) => [clause.key, clause]));
  const repaired = repairSinkClauses(artifacts.repairs?.records);
  for (const key of unassigned) {
    const status = coverageByKey.get(key)?.status;
    if (!NON_TICKET_SINK_STATUSES.has(status) && !repaired.has(key)) {
      findings.push(finding(OMISSION_PLAN_CODES.CONSERVATION, key, 'the clause has no ticket and no recognized non-ticket sink'));
    }
  }

  const changedPhaseIds = new Set(added.map((entry) => entry.phaseId));
  for (const phaseId of changedPhaseIds) {
    const phase = (candidate?.phases ?? []).find((entry) => entry.id === phaseId);
    if (phase === undefined) continue;
    if (artifacts.budget === null || artifacts.budget === undefined) {
      findings.push(finding(OMISSION_PLAN_CODES.NOT_VERIFIED, ticketKeyOf(phaseId, 1), 'the calibrated budget is absent'));
      continue;
    }
    const plan = condensePlan(phase, context, artifacts.budget, {
      components,
      mergeStatusPolicy: artifacts.mergeStatusPolicy ?? 'todo',
    });
    if (plan.after !== (phase.tickets ?? []).length) {
      findings.push(finding(OMISSION_PLAN_CODES.NOT_MINIMAL, ticketKeyOf(phaseId, 1), plan.after + ' partition group(s) for ' + (phase.tickets ?? []).length + ' ticket(s)'));
    }
  }

  const addedUnitKeys = new Set(added.flatMap(({ ticket }) => unitKeysOf(ticket)));
  const addedKeySet = new Set(addedKeys);
  for (const { key, ticket } of beforeRecords) {
    if (addedKeySet.has(key) || isCompletedStatus(ticket.status)) continue;
    const collision = unitKeysOf(ticket).find((unitKey) => addedUnitKeys.has(unitKey));
    if (collision !== undefined) {
      findings.push(finding(OMISSION_PLAN_CODES.DUPLICATE_UNIT, key, 'unit ' + collision + ' already belongs to an open ticket'));
    }
  }

  return { ok: findings.length === 0, findings };
}

module.exports = {
  OMISSION_PLAN_CODES,
  flattenTickets,
  ticketKeyOf,
  verifyOmissionPlan,
};
