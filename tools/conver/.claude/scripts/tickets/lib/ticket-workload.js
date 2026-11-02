'use strict';

/**
 * ticket-workload — the implementation work a ticket or phase carries.
 *
 * The split policy asks for the fewest tickets that stay below a work ceiling. Node
 * count is not that ceiling: one node can be a small requirement or a large data
 * model. This module counts the obligations the distribution already knows about —
 * implemented operations, sequence steps, boundary contracts, leaf files and node
 * kinds — so the gate and the split command read one definition.
 *
 * Pure functions only: the caller reads GRAPH, Dirs-Tree and SEQUENCES and passes
 * them in. No filesystem access happens here.
 */

/** The five components of a workload, in a stable order. */
const WORKLOAD_COMPONENTS = Object.freeze([
  'operations',
  'sequenceSteps',
  'contracts',
  'files',
  'kinds',
]);

/** The only reasons a multi-ticket phase may use to justify a split. */
const SPLIT_REASONS = Object.freeze([
  'tdd-order',
  'disjoint-io',
  'release-boundary',
  'ownership-boundary',
  'cohesion',
]);

/** The named findings the split gate reports. */
const WORKLOAD_CODES = Object.freeze({
  TICKET_WORK_OVER_BUDGET: 'TICKET_WORK_OVER_BUDGET',
  TICKET_COUNT_BELOW_WORK_MINIMUM: 'TICKET_COUNT_BELOW_WORK_MINIMUM',
  SPLIT_REASON_MISSING: 'SPLIT_REASON_MISSING',
  SPLIT_REASON_INVALID: 'SPLIT_REASON_INVALID',
  TICKET_WORK_IRREDUCIBLE: 'TICKET_WORK_IRREDUCIBLE',
  WORK_BUDGET_INVALID: 'WORK_BUDGET_INVALID',
  WORK_BUDGET_MISSING: 'WORK_BUDGET_MISSING',
});

const GRAPH_NODE_ID_PATTERN = /^N[0-9]{4}$/;

/** A workload with every component at zero. */
// [::TICKET::] PX-342 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-342 --for-spec --no-implementation-order`.
function emptyWorkload() {
  return {
    operations: 0,
    sequenceSteps: 0,
    contracts: 0,
    files: 0,
    kinds: 0,
  };
}

/** Whether an id is a graph node rather than a distribution unit appended to nodeIds. */
// [::TICKET::] PX-342 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-342 --for-spec --no-implementation-order`.
function isGraphNodeId(nodeId) {
  return typeof nodeId === 'string' && GRAPH_NODE_ID_PATTERN.test(nodeId);
}

/** The operation role each `op-*` unit plays in the package view. */
// [::TICKET::] PX-342 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-342 --for-spec --no-implementation-order`.
function operationRolesOf(view) {
  const roles = new Map();
  for (const field of ['ownedOperationUnits', 'obligationUnits']) {
    for (const unit of Array.isArray(view?.[field]) ? view[field] : []) {
      const unitId = unit?.unitId;
      if (typeof unitId !== 'string' || !unitId.startsWith('op-')) continue;
      const role = unit.roleCandidate ?? unit.role ?? 'implementer';
      roles.set(unitId, role === 'consumer' ? 'consumer' : 'implementer');
    }
  }
  return roles;
}

/** The step-bearing sequence records the view declares. */
// [::TICKET::] PX-342 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-342 --for-spec --no-implementation-order`.
function sequenceUnitsOf(view) {
  const units = [];
  for (const field of ['ownedSequenceUnits', 'crossBoundarySequenceUnits']) {
    for (const unit of Array.isArray(view?.[field]) ? view[field] : []) units.push(unit);
  }
  return units;
}

/** The leaf files the given units resolve to. */
// [::TICKET::] PX-342 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-342 --for-spec --no-implementation-order`.
function filesOfUnits(unitIds, nodeIds, context) {
  const files = new Set();
  const distributionUnits = context?.dirsTree?.distribution?.units ?? {};
  for (const unitId of unitIds) {
    for (const filePath of distributionUnits[unitId]?.paths ?? []) files.add(filePath);
  }
  if (files.size === 0) {
    for (const nodeId of nodeIds) {
      const filePath = context?.nodeToFileMap?.[nodeId];
      if (typeof filePath === 'string' && filePath.length > 0) files.add(filePath);
    }
  }
  return files;
}

/**
 * The work a set of graph nodes carries.
 *
 * A consumer operation is a reference, not implementation work, so it is excluded.
 * A sequence step counts once, in the ticket that carries the operation it drives,
 * even when several nodes also carry the sequence unit.
 *
 * @param {string[]} nodeIds
 * @param {{ graph?: object, dirsTree?: object, view?: object, nodeToFileMap?: object }} context
 * @returns {{operations:number, sequenceSteps:number, contracts:number, files:number, kinds:number}}
 */
// [::TICKET::] PX-342 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-342 --for-spec --no-implementation-order`.
function workloadOfNodes(nodeIds, context = {}) {
  const graphNodes = (nodeIds ?? []).filter(isGraphNodeId);
  const nodeById = new Map((context.graph?.nodes ?? []).map((node) => [node.id, node]));
  const nodes = graphNodes.map((nodeId) => nodeById.get(nodeId)).filter(Boolean);
  const units = new Set(nodes.flatMap((node) => Array.isArray(node.unitIds) ? node.unitIds : []));
  const operationRoles = operationRolesOf(context.view);

  const operations = [...units].filter((unitId) =>
    typeof unitId === 'string'
    && unitId.startsWith('op-')
    && operationRoles.get(unitId) !== 'consumer').length;
  const contracts = [...units].filter((unitId) =>
    typeof unitId === 'string' && unitId.startsWith('ctr-')).length;

  const stepKeys = new Set();
  for (const sequenceUnit of sequenceUnitsOf(context.view)) {
    const sequenceUnitId = sequenceUnit?.unitId ?? '(unnamed)';
    for (const step of Array.isArray(sequenceUnit?.steps) ? sequenceUnit.steps : []) {
      const operationUnitId = `op-${step?.operationId ?? ''}`;
      if (!units.has(operationUnitId)) continue;
      if (operationRoles.get(operationUnitId) === 'consumer') continue;
      stepKeys.add(`${sequenceUnitId}:${step?.stepId ?? step?.id ?? step?.order ?? '?'}`);
    }
  }

  const kinds = new Set(nodes
    .map((node) => node.kind)
    .filter((kind) => typeof kind === 'string' && kind.length > 0));

  return {
    operations,
    sequenceSteps: stepKeys.size,
    contracts,
    files: filesOfUnits(units, graphNodes, context).size,
    kinds: kinds.size,
  };
}

/**
 * The work a ticket carries. Distribution-unit ids in ticket.nodeIds are ignored;
 * `default_files`, when present, is the exact leaf-file set and wins over unit paths.
 */
// [::TICKET::] PX-342 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-342 --for-spec --no-implementation-order`.
function workloadOfTicket(ticket, context = {}) {
  const workload = workloadOfNodes(ticket?.nodeIds ?? [], context);
  if (Array.isArray(ticket?.default_files) && ticket.default_files.length > 0) {
    workload.files = new Set(ticket.default_files).size;
  }
  return workload;
}

/**
 * The work a phase carries.
 *
 * Once tickets exist, the phase total is the sum of their workloads. That is the
 * number the gate is about to pack, and it keeps the split gate independent of a
 * second, differently deduplicated node view. Before tickets exist, the phase is
 * measured from its nodes for the Step 5-1 report.
 */
// [::TICKET::] PX-342 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-342 --for-spec --no-implementation-order`.
function workloadOfPhase(phase, context = {}) {
  const tickets = Array.isArray(phase?.tickets) ? phase.tickets : [];
  if (tickets.length === 0) return workloadOfNodes(phase?.nodeIds ?? [], context);
  const total = emptyWorkload();
  for (const ticket of tickets) {
    const workload = workloadOfTicket(ticket, context);
    for (const component of WORKLOAD_COMPONENTS) total[component] += workload[component];
  }
  return total;
}

/**
 * The fewest tickets that can carry the workload under the ceiling.
 *
 * Component-wise ceiling, then at least one. The 3-ticket phase floor is not part of
 * this number: a phase with fewer tickets is merged by Step 5-3, never split here.
 *
 * @param {object} workload
 * @param {object} budget
 * @returns {number}
 */
// [::TICKET::] PX-342 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-342 --for-spec --no-implementation-order`.
function minimumTicketCount(workload, budget) {
  let minimum = 1;
  for (const component of WORKLOAD_COMPONENTS) {
    const ceiling = budget?.[component];
    if (!Number.isInteger(ceiling) || ceiling < 1) {
      throw new TypeError(`budget component ${component} must be a positive integer`);
    }
    const required = Math.ceil((workload?.[component] ?? 0) / ceiling);
    if (required > minimum) minimum = required;
  }
  return minimum;
}

/**
 * Validate a `ticket-work-budget.json` document.
 *
 * @param {object} document
 * @returns {{valid:boolean, errors:string[], budget:object|null}}
 */
// [::TICKET::] PX-342 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-342 --for-spec --no-implementation-order`.
function parseWorkBudget(document) {
  if (document === null || typeof document !== 'object' || Array.isArray(document)) {
    return { valid: false, errors: ['budget document must be an object'], budget: null };
  }
  const errors = [];
  if (document.version !== 1) errors.push('version must be 1');

  const components = Array.isArray(document.components) ? document.components : [];
  for (const component of WORKLOAD_COMPONENTS) {
    if (!components.includes(component)) errors.push(`components must include ${component}`);
  }

  const budget = {};
  for (const component of WORKLOAD_COMPONENTS) {
    const value = document.budget?.[component];
    if (!Number.isInteger(value) || value < 1) {
      errors.push(`budget.${component} must be a positive integer`);
    } else {
      budget[component] = value;
    }
  }

  if (typeof document.provenance !== 'string' || document.provenance.trim().length === 0) {
    errors.push('provenance must be a non-empty string');
  }

  return {
    valid: errors.length === 0,
    errors,
    budget: errors.length === 0 ? budget : null,
  };
}

/** The public key of the ticket a finding names. */
// [::TICKET::] PX-342 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-342 --for-spec --no-implementation-order`.
function ticketKeyOf(ticket) {
  return ticket?.phaseId === -1 || ticket?.phaseId === undefined
    ? `PX-${ticket?.id}`
    : `P${ticket.phaseId}-${ticket.id}`;
}

/** The public key of the phase a finding names. */
// [::TICKET::] PX-342 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-342 --for-spec --no-implementation-order`.
function phaseKeyOf(phase) {
  return phase?.id === -1 ? 'PX' : `P${phase?.id}`;
}

/**
 * The findings the split gate acts on.
 *
 * @param {object} phase
 * @param {object} budget
 * @param {object} context
 * @returns {Array<{code:string, message:string, phaseKey?:string, ticketKey?:string, nodeId?:string, component?:string, actual?:number, budget?:number, minimum?:number}>}
 */
// [::TICKET::] PX-342 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-342 --for-spec --no-implementation-order`.
function validateTicketWorkload(phase, budget, context = {}) {
  const findings = [];
  const tickets = Array.isArray(phase?.tickets) ? phase.tickets : [];
  const phaseKey = phaseKeyOf(phase);

  for (const ticket of tickets) {
    const ticketKey = ticketKeyOf(ticket);
    const workload = workloadOfTicket(ticket, context);
    for (const component of WORKLOAD_COMPONENTS) {
      if (workload[component] > budget[component]) {
        findings.push({
          code: WORKLOAD_CODES.TICKET_WORK_OVER_BUDGET,
          ticketKey,
          component,
          actual: workload[component],
          budget: budget[component],
          message: `${ticketKey} carries ${workload[component]} ${component}; the budget is ${budget[component]}`,
        });
      }
    }

    for (const nodeId of (ticket.nodeIds ?? []).filter(isGraphNodeId)) {
      const nodeWorkload = workloadOfNodes([nodeId], context);
      for (const component of WORKLOAD_COMPONENTS) {
        if (nodeWorkload[component] <= budget[component]) continue;
        findings.push({
          code: WORKLOAD_CODES.TICKET_WORK_IRREDUCIBLE,
          ticketKey,
          nodeId,
          component,
          actual: nodeWorkload[component],
          budget: budget[component],
          message: `${ticketKey} cannot be split below ${nodeId}: it alone carries ${nodeWorkload[component]} ${component}; the budget is ${budget[component]}`,
        });
      }
    }
  }

  const minimum = minimumTicketCount(workloadOfPhase(phase, context), budget);
  if (tickets.length < minimum) {
    findings.push({
      code: WORKLOAD_CODES.TICKET_COUNT_BELOW_WORK_MINIMUM,
      phaseKey,
      actual: tickets.length,
      minimum,
      message: `${phaseKey} proposes ${tickets.length} ticket(s); the workload needs at least ${minimum}`,
    });
  }

  if (tickets.length > 1) {
    for (const ticket of tickets) {
      const ticketKey = ticketKeyOf(ticket);
      if (typeof ticket.splitReason !== 'string' || ticket.splitReason.length === 0) {
        findings.push({
          code: WORKLOAD_CODES.SPLIT_REASON_MISSING,
          ticketKey,
          message: `${ticketKey} is one of several tickets but carries no splitReason`,
        });
      } else if (!SPLIT_REASONS.includes(ticket.splitReason)) {
        findings.push({
          code: WORKLOAD_CODES.SPLIT_REASON_INVALID,
          ticketKey,
          message: `${ticketKey} carries splitReason "${ticket.splitReason}"; allowed: ${SPLIT_REASONS.join(', ')}`,
        });
      }
    }
  }

  return findings;
}

module.exports = {
  WORKLOAD_COMPONENTS,
  SPLIT_REASONS,
  WORKLOAD_CODES,
  workloadOfNodes,
  workloadOfTicket,
  workloadOfPhase,
  minimumTicketCount,
  parseWorkBudget,
  validateTicketWorkload,
};
