'use strict';

/**
 * ticket-workload — the implementation work a ticket or phase carries.
 *
 * The split policy asks for the fewest tickets that stay below a work ceiling. The
 * v2 ceiling counts implementation work: operations, sequence steps, owned
 * contracts, implementation files, unit and integration test families, and the
 * distinct modules those files occupy. Provider-side boundary units, node kinds
 * and graph node count are metadata; the split report prints them but they never
 * size a ticket.
 *
 * The v1 functions keep the original five components so an existing
 * `ticket-work-budget.json` keeps its old meaning. A v2 budget selects the v2
 * functions; a v1 budget selects the legacy functions.
 *
 * Pure functions only: the caller reads GRAPH, Dirs-Tree and SEQUENCES and passes
 * them in. No filesystem access happens here.
 */

/** The seven components of a v2 workload, in a stable order. */
const WORKLOAD_COMPONENTS = Object.freeze([
  'operations',
  'sequenceSteps',
  'ownedContracts',
  'files',
  'testUnit',
  'testIntegration',
  'modules',
]);

/** The five components a version-1 budget still measures. */
const LEGACY_WORKLOAD_COMPONENTS = Object.freeze([
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
  WORK_BUDGET_INFEASIBLE: 'WORK_BUDGET_INFEASIBLE',
  SPLIT_REASON_MISSING: 'SPLIT_REASON_MISSING',
  SPLIT_REASON_INVALID: 'SPLIT_REASON_INVALID',
  TICKET_WORK_IRREDUCIBLE: 'TICKET_WORK_IRREDUCIBLE',
  WORK_BUDGET_INVALID: 'WORK_BUDGET_INVALID',
  WORK_BUDGET_MISSING: 'WORK_BUDGET_MISSING',
  TICKET_COUNT_ABOVE_MERGE_EVIDENCE: 'TICKET_COUNT_ABOVE_MERGE_EVIDENCE',
  MERGE_ATTEMPT_MISSING: 'MERGE_ATTEMPT_MISSING',
  MERGE_TRIGGER_INVALID: 'MERGE_TRIGGER_INVALID',
  SPLIT_REASON_GRAPH_MISMATCH: 'SPLIT_REASON_GRAPH_MISMATCH',
  EMPTY_DEFAULT_FILES: 'EMPTY_DEFAULT_FILES',
  ACCEPTED_IRREDUCIBLE_OVERAGE: 'ACCEPTED_IRREDUCIBLE_OVERAGE',
});

const GRAPH_NODE_ID_PATTERN = /^N[0-9]{4}$/;
const PROVIDER_BOUNDARY_UNIT_PREFIX = 'ctr-boundary-';
const RECORD_NODE_KINDS = Object.freeze(['architecture', 'rationale']);
const MIN_COHESION_BEHAVIOURS = 2;
const EXTERNAL_IO_NODE_KINDS = Object.freeze(['io', 'network', 'filesystem', 'external', 'transport']);
const HARD_EDGE_TYPES = Object.freeze([
  'depends_on', 'depends-on', 'implements', 'realizes', 'consumes', 'produces', 'requires',
]);

/** A workload with every requested component at zero. */
// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
function emptyWorkload(components = WORKLOAD_COMPONENTS) {
  const workload = {};
  for (const component of components) workload[component] = 0;
  return workload;
}

/** Whether an id is a graph node rather than a distribution unit appended to nodeIds. */
// [::TICKET::] PX-342 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-342 --for-spec --no-implementation-order`.
function isGraphNodeId(nodeId) {
  return typeof nodeId === 'string' && GRAPH_NODE_ID_PATTERN.test(nodeId);
}

/** The graph node ids a ticket declares, without the distribution units. */
// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
function graphNodeIdsOfTicket(ticket) {
  return (ticket?.nodeIds ?? []).filter(isGraphNodeId);
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

/** The view's unit records keyed by unit id. */
// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
function viewUnitRecords(view) {
  const records = new Map();
  for (const field of ['ownedOperationUnits', 'ownedSequenceUnits', 'crossBoundarySequenceUnits', 'obligationUnits']) {
    for (const unit of Array.isArray(view?.[field]) ? view[field] : []) {
      if (typeof unit?.unitId === 'string') records.set(unit.unitId, unit);
    }
  }
  return records;
}

/** Whether a unit is a provider-side boundary projection rather than implementation work. */
// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
function isProviderBoundaryUnit(unitId) {
  return typeof unitId === 'string' && unitId.startsWith(PROVIDER_BOUNDARY_UNIT_PREFIX);
}

/** Whether a path names a file rather than a directory. */
// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
function isLeafFile(filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0) return false;
  const normalized = filePath.replace(/\\/g, '/');
  if (normalized.endsWith('/')) return false;
  const basename = normalized.split('/').pop();
  return basename.includes('.') && !basename.startsWith('.');
}

/** The leaf files the implementation units resolve to, excluding boundary projections. */
// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-347 --for-spec --no-implementation-order`.
function implementationFilesOfUnits(unitIds, nodeIds, context) {
  const files = new Set();
  const distributionUnits = context?.dirsTree?.distribution?.units ?? {};
  for (const unitId of unitIds) {
    if (isProviderBoundaryUnit(unitId)) continue;
    for (const filePath of distributionUnits[unitId]?.paths ?? []) {
      if (isLeafFile(filePath)) files.add(filePath);
    }
  }
  if (files.size === 0) {
    for (const nodeId of nodeIds) {
      const filePath = context?.nodeToFileMap?.[nodeId];
      if (typeof filePath === 'string' && filePath.length > 0) files.add(filePath);
    }
  }
  return files;
}

/** The legacy v1 file set: every placement path, directories included. */
// [::TICKET::] PX-342, PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-342|PX-347) --for-spec --no-implementation-order`.
function legacyFilesOfUnits(unitIds, nodeIds, context) {
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

/** The distinct top-level modules a file set occupies. */
// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
function moduleNamesOf(files) {
  const modules = new Set();
  for (const filePath of files) {
    const parts = String(filePath).replace(/\\/g, '/').split('/').filter(Boolean);
    if (parts.length === 0) continue;
    if (parts[0] === 'src' && parts.length > 1) {
      modules.add(parts[1].includes('.') ? 'root' : parts[1]);
      continue;
    }
    modules.add(parts[0].includes('.') ? 'root' : parts[0]);
  }
  return modules;
}

/** The exact implementation files a ticket owns. `default_files` wins when present. */
// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
function effectiveFileSet(ticket, context) {
  if (Array.isArray(ticket?.default_files) && ticket.default_files.length > 0) {
    return new Set(ticket.default_files);
  }
  return implementationFilesOfUnits(unitsOfTicket(ticket, context), graphNodeIdsOfTicket(ticket), context);
}

/** The graph units carried by a ticket's nodes. */
// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
function unitsOfTicket(ticket, context) {
  const nodes = graphNodesOf(ticket?.nodeIds, context);
  return new Set(nodes.flatMap((node) => Array.isArray(node.unitIds) ? node.unitIds : []));
}

/** The graph nodes for a node id list. */
// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
function graphNodesOf(nodeIds, context) {
  const nodeById = new Map((context?.graph?.nodes ?? []).map((node) => [node.id, node]));
  return (nodeIds ?? []).filter(isGraphNodeId).map((nodeId) => nodeById.get(nodeId)).filter(Boolean);
}

/**
 * The v2 implementation work a set of graph nodes carries.
 *
 * @param {string[]} nodeIds
 * @param {{ graph?: object, dirsTree?: object, view?: object, nodeToFileMap?: object }} context
 * @returns {{operations:number, sequenceSteps:number, ownedContracts:number, files:number, testUnit:number, testIntegration:number, modules:number}}
 */
// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
function workloadOfNodes(nodeIds, context = {}) {
  const nodes = graphNodesOf(nodeIds, context);
  const units = new Set(nodes.flatMap((node) => Array.isArray(node.unitIds) ? node.unitIds : []));
  const operationRoles = operationRolesOf(context.view);

  const operations = [...units].filter((unitId) =>
    typeof unitId === 'string'
    && unitId.startsWith('op-')
    && operationRoles.get(unitId) !== 'consumer').length;
  const ownedContracts = [...units].filter((unitId) =>
    typeof unitId === 'string'
    && unitId.startsWith('ctr-')
    && !isProviderBoundaryUnit(unitId)).length;

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

  const files = implementationFilesOfUnits(units, graphNodeIdsOfTicket({ nodeIds }), context);
  return {
    operations,
    sequenceSteps: stepKeys.size,
    ownedContracts,
    files: files.size,
    testUnit: 0,
    testIntegration: 0,
    modules: moduleNamesOf(files).size,
  };
}

/**
 * The legacy v1 workload a set of graph nodes carries.
 *
 * @param {string[]} nodeIds
 * @param {{ graph?: object, dirsTree?: object, view?: object, nodeToFileMap?: object }} context
 * @returns {{operations:number, sequenceSteps:number, contracts:number, files:number, kinds:number}}
 */
// [::TICKET::] PX-342, PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-342|PX-347) --for-spec --no-implementation-order`.
function legacyWorkloadOfNodes(nodeIds, context = {}) {
  const nodes = graphNodesOf(nodeIds, context);
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
    files: legacyFilesOfUnits(units, graphNodeIdsOfTicket({ nodeIds }), context).size,
    kinds: kinds.size,
  };
}

/** The v2 work a ticket carries. */
// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
function workloadOfTicket(ticket, context = {}) {
  const workload = workloadOfNodes(ticket?.nodeIds ?? [], context);
  const files = effectiveFileSet(ticket, context);
  workload.files = files.size;
  workload.modules = moduleNamesOf(files).size;
  workload.testUnit = Array.isArray(ticket?.testUnit) ? ticket.testUnit.length : 0;
  workload.testIntegration = Array.isArray(ticket?.testIntegration) ? ticket.testIntegration.length : 0;
  return workload;
}

/** The legacy v1 work a ticket carries. */
// [::TICKET::] PX-342, PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-342|PX-347) --for-spec --no-implementation-order`.
function legacyWorkloadOfTicket(ticket, context = {}) {
  const workload = legacyWorkloadOfNodes(ticket?.nodeIds ?? [], context);
  if (Array.isArray(ticket?.default_files) && ticket.default_files.length > 0) {
    workload.files = new Set(ticket.default_files).size;
  }
  return workload;
}

/** The work a phase carries, in the requested mode. */
// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
function workloadOfPhase(phase, context = {}, options = {}) {
  const mode = options.mode === 'v1' ? 'v1' : 'v2';
  const components = options.components
    ?? (mode === 'v1' ? LEGACY_WORKLOAD_COMPONENTS : WORKLOAD_COMPONENTS);
  const workloadOf = mode === 'v1' ? legacyWorkloadOfTicket : workloadOfTicket;
  const workloadOfNodesForMode = mode === 'v1' ? legacyWorkloadOfNodes : workloadOfNodes;

  const tickets = Array.isArray(phase?.tickets) ? phase.tickets : [];
  if (tickets.length === 0) {
    const nodeWorkload = workloadOfNodesForMode(phase?.nodeIds ?? [], context);
    const result = emptyWorkload(components);
    for (const component of components) result[component] = nodeWorkload[component] ?? 0;
    return result;
  }

  const total = emptyWorkload(components);
  if (mode === 'v1') {
    for (const ticket of tickets) {
      const workload = workloadOf(ticket, context);
      for (const component of components) total[component] += workload[component] ?? 0;
    }
    return total;
  }

  // The v2 file and module counts are set-valued: two tickets that share a file
  // or a module must not double-count it at the phase level.
  const files = new Set();
  for (const ticket of tickets) {
    const workload = workloadOf(ticket, context);
    for (const component of components) {
      if (component === 'files' || component === 'modules') continue;
      total[component] += workload[component] ?? 0;
    }
    for (const filePath of effectiveFileSet(ticket, context)) files.add(filePath);
  }
  if (components.includes('files')) total.files = files.size;
  if (components.includes('modules')) total.modules = moduleNamesOf(files).size;
  return total;
}

/** The legacy v1 work a phase carries. */
// [::TICKET::] PX-342, PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-342|PX-347) --for-spec --no-implementation-order`.
function legacyWorkloadOfPhase(phase, context = {}) {
  return workloadOfPhase(phase, context, { mode: 'v1' });
}

/**
 * The fewest tickets that can carry the workload under the ceiling.
 *
 * @param {object} workload
 * @param {object} budget
 * @param {string[]} components
 * @returns {number}
 */
// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
function minimumTicketCount(workload, budget, components = WORKLOAD_COMPONENTS) {
  let minimum = 1;
  for (const component of components) {
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
 * The most tickets a phase may carry: the budget floor plus each accepted
 * discretionary refusal. A budget-forced split is not discretionary.
 */
// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
function maximumTicketCount(minimumWorkTickets, acceptedRefusals) {
  const minimum = Number.isInteger(minimumWorkTickets) && minimumWorkTickets > 0
    ? minimumWorkTickets
    : 1;
  return minimum + (Array.isArray(acceptedRefusals) ? acceptedRefusals.length : 0);
}

/** The graph node ids a phase carries, whether declared at phase or ticket level. */
// [::TICKET::] PX-343 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-343) --for-spec --no-implementation-order`.
function graphNodeIdsOfPhase(phase) {
  const nodeIds = new Set();
  for (const nodeId of phase?.nodeIds ?? []) {
    if (isGraphNodeId(nodeId)) nodeIds.add(nodeId);
  }
  for (const ticket of phase?.tickets ?? []) {
    for (const nodeId of ticket?.nodeIds ?? []) {
      if (isGraphNodeId(nodeId)) nodeIds.add(nodeId);
    }
  }
  return [...nodeIds];
}

/** The ticket key that owns a graph node, or null. */
// [::TICKET::] PX-343 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-343) --for-spec --no-implementation-order`.
function ticketKeyOfNode(phase, nodeId) {
  const ticket = (phase?.tickets ?? []).find((candidate) => (candidate?.nodeIds ?? []).includes(nodeId));
  return ticket === undefined ? null : ticketKeyOf(ticket);
}

/**
 * The largest v1 or v2 workload a single graph node carries, per component.
 */
// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
function maxNodeWorkload(phase, context = {}, options = {}) {
  const mode = options.mode === 'v1' ? 'v1' : 'v2';
  const components = options.components
    ?? (mode === 'v1' ? LEGACY_WORKLOAD_COMPONENTS : WORKLOAD_COMPONENTS);
  const workloadOfNode = mode === 'v1' ? legacyWorkloadOfNodes : workloadOfNodes;
  const nodeIds = graphNodeIdsOfPhase(phase);
  const workload = emptyWorkload(components);
  const nodeIdByComponent = Object.fromEntries(components.map((component) => [component, null]));
  for (const nodeId of nodeIds) {
    const nodeWorkload = workloadOfNode([nodeId], context);
    for (const component of components) {
      if ((nodeWorkload[component] ?? 0) > workload[component]) {
        workload[component] = nodeWorkload[component];
        nodeIdByComponent[component] = nodeId;
      }
    }
  }
  return { workload, nodeIdByComponent, nodeCount: nodeIds.length };
}

/**
 * Whether the phase can be partitioned into node-granular tickets under the budget.
 *
 * In v2 an indivisible node over budget is an accepted overage; in v1 it remains
 * a fatal `WORK_BUDGET_INFEASIBLE` so existing callers keep their behavior.
 */
// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
function feasibilityOf(phase, budget, context = {}, options = {}) {
  const mode = options.mode === 'v1' ? 'v1' : 'v2';
  const components = options.components
    ?? (mode === 'v1' ? LEGACY_WORKLOAD_COMPONENTS : WORKLOAD_COMPONENTS);
  const max = maxNodeWorkload(phase, context, { mode, components });
  const phaseWorkload = workloadOfPhase(phase, context, { mode, components });
  const minimum = minimumTicketCount(phaseWorkload, budget, components);
  const findings = [];

  for (const component of components) {
    const actual = max.workload[component];
    if (actual <= budget[component]) continue;
    const nodeId = max.nodeIdByComponent[component];
    findings.push({
      code: mode === 'v1' ? WORKLOAD_CODES.WORK_BUDGET_INFEASIBLE : WORKLOAD_CODES.ACCEPTED_IRREDUCIBLE_OVERAGE,
      ...(mode === 'v1' ? {} : { accepted: true }),
      ticketKey: ticketKeyOfNode(phase, nodeId),
      nodeId,
      component,
      actual,
      budget: budget[component],
      reason: 'IRREDUCIBLE_NODE',
      message: `node ${nodeId} alone carries ${actual} ${component}; the budget is ${budget[component]}`,
    });
  }

  let reason = findings.length > 0 ? 'IRREDUCIBLE_NODE' : null;
  if (max.nodeCount > 0 && minimum > max.nodeCount) {
    findings.push({
      code: mode === 'v1' ? WORKLOAD_CODES.WORK_BUDGET_INFEASIBLE : WORKLOAD_CODES.ACCEPTED_IRREDUCIBLE_OVERAGE,
      ...(mode === 'v1' ? {} : { accepted: true }),
      phaseKey: phaseKeyOf(phase),
      minimum,
      nodeCount: max.nodeCount,
      reason: 'MINIMUM_EXCEEDS_NODE_COUNT',
      message: `the workload needs at least ${minimum} tickets but the phase has ${max.nodeCount} indivisible nodes`,
    });
    reason = 'MINIMUM_EXCEEDS_NODE_COUNT';
  }

  return {
    feasible: mode === 'v1' ? findings.length === 0 : findings.every((finding) => finding.accepted === true),
    reason,
    findings,
    minimum,
    nodeCount: max.nodeCount,
    phaseWorkload,
    maxNodeWorkload: max.workload,
  };
}

/**
 * Validate a `ticket-work-budget.json` document.
 *
 * Version 1 keeps the five legacy components. Version 2 uses the seven
 * implementation-work components. Any other version is invalid.
 */
// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
function parseWorkBudget(document) {
  if (document === null || typeof document !== 'object' || Array.isArray(document)) {
    return { valid: false, errors: ['budget document must be an object'], budget: null, mode: null, components: null, excluded: [] };
  }
  const errors = [];
  const version = document.version;
  if (version !== 1 && version !== 2) errors.push('version must be 1 or 2');
  const mode = version === 2 ? 'v2' : 'v1';
  const components = mode === 'v1' ? LEGACY_WORKLOAD_COMPONENTS : WORKLOAD_COMPONENTS;

  const declared = Array.isArray(document.components) ? document.components : [];
  for (const component of components) {
    if (!declared.includes(component)) errors.push(`components must include ${component}`);
  }

  const budget = {};
  for (const component of components) {
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

  if (mode === 'v2' && document.excluded !== undefined) {
    if (!Array.isArray(document.excluded) || document.excluded.some((entry) => typeof entry !== 'string')) {
      errors.push('excluded must be an array of strings');
    }
  }

  const excluded = Array.isArray(document.excluded) ? document.excluded : [];
  return {
    valid: errors.length === 0,
    errors,
    budget: errors.length === 0 ? budget : null,
    mode,
    components,
    excluded,
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

/** The sorted identity of a node set, used to match merge attempts. */
// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
function nodeSetKey(nodeIds) {
  return [...new Set((nodeIds ?? []).filter(isGraphNodeId))].sort().join(',');
}

/** The merge attempts a phase carries, at phase or ticket level. */
// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
function mergeAttemptsOf(phase) {
  const attempts = [];
  if (Array.isArray(phase?.mergeAttempts)) attempts.push(...phase.mergeAttempts);
  for (const ticket of phase?.tickets ?? []) {
    if (Array.isArray(ticket?.mergeAttempts)) attempts.push(...ticket.mergeAttempts);
  }
  return attempts;
}

/** Whether a merge attempt has the shape the gate can trust. */
// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
function mergeAttemptIsValid(attempt) {
  if (attempt === null || typeof attempt !== 'object' || Array.isArray(attempt)) return false;
  if (!Array.isArray(attempt.left) || !Array.isArray(attempt.right)) return false;
  if (attempt.left.some((id) => typeof id !== 'string') || attempt.right.some((id) => typeof id !== 'string')) return false;
  if (attempt.decision !== 'merged' && attempt.decision !== 'refused') return false;
  if (attempt.decision === 'merged') return true;
  if (!SPLIT_REASONS.includes(attempt.trigger)) return false;
  if (typeof attempt.evidence !== 'string' || attempt.evidence.trim().length === 0) return false;
  if (attempt.trigger === 'cohesion') {
    if (!Array.isArray(attempt.behaviours) || attempt.behaviours.length < MIN_COHESION_BEHAVIOURS) return false;
    if (attempt.behaviours.some((behaviour) => typeof behaviour !== 'string' || behaviour.trim().length === 0)) return false;
  }
  return true;
}

/** The attempt that names the adjacent pair, in either direction. */
// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
function mergeAttemptForPair(attempts, leftNodes, rightNodes) {
  const leftKey = nodeSetKey(leftNodes);
  const rightKey = nodeSetKey(rightNodes);
  return attempts.find((attempt) => {
    if (!mergeAttemptIsValid(attempt)) return false;
    const attemptLeft = nodeSetKey(attempt.left);
    const attemptRight = nodeSetKey(attempt.right);
    return (attemptLeft === leftKey && attemptRight === rightKey)
      || (attemptLeft === rightKey && attemptRight === leftKey);
  });
}

/** The workload of the ticket formed by merging two adjacent tickets. */
// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
function workloadOfMergedTickets(left, right, context, options = {}) {
  const mode = options.mode === 'v1' ? 'v1' : 'v2';
  const workloadOf = mode === 'v1' ? legacyWorkloadOfTicket : workloadOfTicket;
  const leftFiles = left?.default_files ?? [];
  const rightFiles = right?.default_files ?? [];
  const bothHaveFiles = leftFiles.length > 0 && rightFiles.length > 0;
  const merged = {
    nodeIds: [...new Set([...(left?.nodeIds ?? []), ...(right?.nodeIds ?? [])])],
    default_files: bothHaveFiles ? [...new Set([...leftFiles, ...rightFiles])] : [],
    testUnit: [...(left?.testUnit ?? []), ...(right?.testUnit ?? [])],
    testIntegration: [...(left?.testIntegration ?? []), ...(right?.testIntegration ?? [])],
  };
  return workloadOf(merged, context);
}

/**
 * The merge-evidence findings for a phase.
 *
 * Every adjacent pair whose merged workload stays inside the budget is a
 * discretionary split and needs a valid refused attempt. A pair whose merged
 * workload exceeds the budget is budget-forced and needs no attempt.
 */
// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
function collectMergeFindings(phase, budget, context = {}, options = {}) {
  const findings = [];
  const tickets = Array.isArray(phase?.tickets) ? phase.tickets : [];
  const attempts = mergeAttemptsOf(phase);
  if (tickets.length <= 1) {
    return { findings, acceptedRefusals: [], forcedPairs: [], attempts };
  }

  for (const attempt of attempts) {
    if (!mergeAttemptIsValid(attempt)) {
      findings.push({
        code: WORKLOAD_CODES.MERGE_TRIGGER_INVALID,
        attempt,
        message: 'a mergeAttempt has no valid left/right/decision/trigger/evidence shape',
      });
    }
  }

  const mode = options.mode === 'v1' ? 'v1' : 'v2';
  const components = options.components
    ?? (mode === 'v1' ? LEGACY_WORKLOAD_COMPONENTS : WORKLOAD_COMPONENTS);
  const acceptedRefusals = [];
  const forcedPairs = [];

  for (let index = 0; index < tickets.length - 1; index += 1) {
    const left = tickets[index];
    const right = tickets[index + 1];
    const leftNodes = graphNodeIdsOfTicket(left);
    const rightNodes = graphNodeIdsOfTicket(right);
    const mergedWorkload = workloadOfMergedTickets(left, right, context, { mode });
    const forcedComponents = components.filter((component) =>
      (mergedWorkload[component] ?? 0) > budget[component]);
    if (forcedComponents.length > 0) {
      forcedPairs.push({ left: leftNodes, right: rightNodes, components: forcedComponents });
      continue;
    }

    const attempt = mergeAttemptForPair(attempts, leftNodes, rightNodes);
    if (attempt === undefined) {
      findings.push({
        code: WORKLOAD_CODES.MERGE_ATTEMPT_MISSING,
        left: leftNodes,
        right: rightNodes,
        message: `the discretionary split ${nodeSetKey(leftNodes)} | ${nodeSetKey(rightNodes)} has no refused merge attempt`,
      });
      continue;
    }
    if (attempt.decision !== 'refused') {
      findings.push({
        code: WORKLOAD_CODES.MERGE_TRIGGER_INVALID,
        attempt,
        message: 'an adjacent final pair needs decision "refused"; "merged" would mean the tickets should be one ticket',
      });
      continue;
    }
    acceptedRefusals.push(attempt);
  }

  return { findings, acceptedRefusals, forcedPairs, attempts };
}

/** Whether a hard graph edge connects the ticket to another ticket in the phase. */
// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
function hasHardIntraPhaseDependency(ticket, phase, context) {
  const ticketNodes = new Set(graphNodeIdsOfTicket(ticket));
  const otherNodes = (phase?.tickets ?? [])
    .filter((candidate) => candidate !== ticket)
    .map((candidate) => new Set(graphNodeIdsOfTicket(candidate)))
    .filter((nodes) => nodes.size > 0);
  for (const edge of context?.graph?.edges ?? []) {
    const from = edge.from ?? edge.source;
    const to = edge.to ?? edge.target;
    const strength = edge.attributes?.strength;
    const hard = strength !== 'soft' || HARD_EDGE_TYPES.includes(edge.type);
    if (!hard) continue;
    if (ticketNodes.has(from) && otherNodes.some((nodes) => nodes.has(to))) return true;
    if (ticketNodes.has(to) && otherNodes.some((nodes) => nodes.has(from))) return true;
  }
  return false;
}

/** Whether a ticket's nodes carry a unit owned by another package or a consumer boundary. */
// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
function hasForeignOwnership(ticket, context) {
  const packageId = context?.view?.packageId;
  const records = viewUnitRecords(context?.view);
  const distributionUnits = context?.dirsTree?.distribution?.units ?? {};
  for (const unitId of unitsOfTicket(ticket, context)) {
    const owners = records.get(unitId)?.ownerPackageIds;
    if (Array.isArray(owners) && owners.length > 0 && packageId !== undefined && !owners.includes(packageId)) {
      return true;
    }
    const obligation = distributionUnits[unitId]?.obligation;
    if (obligation?.direction === 'requires' && obligation.counterpart !== packageId) return true;
  }
  return false;
}

/** Whether a ticket touches an external I/O surface. */
// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
function hasExternalIoSurface(ticket, context) {
  const nodes = graphNodesOf(ticket?.nodeIds, context);
  if (nodes.some((node) => EXTERNAL_IO_NODE_KINDS.includes(node.kind))) return true;
  const records = viewUnitRecords(context?.view);
  const distributionUnits = context?.dirsTree?.distribution?.units ?? {};
  for (const unitId of unitsOfTicket(ticket, context)) {
    const recordClass = records.get(unitId)?.externalDependencyClass;
    if (typeof recordClass === 'string' && recordClass !== 'none') return true;
    const obligationClass = distributionUnits[unitId]?.obligation?.externalDependencyClass;
    if (typeof obligationClass === 'string' && obligationClass !== 'none') return true;
  }
  return false;
}

/** The split-reason findings for a phase. */
// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
function collectReasonFindings(phase, context = {}, options = {}) {
  const findings = [];
  const tickets = Array.isArray(phase?.tickets) ? phase.tickets : [];
  if (tickets.length <= 1) return findings;
  const attempts = mergeAttemptsOf(phase);
  const forcedTicketKeys = new Set();
  for (const pair of options.forcedPairs ?? []) {
    forcedTicketKeys.add(nodeSetKey(pair.left));
    forcedTicketKeys.add(nodeSetKey(pair.right));
  }

  for (const ticket of tickets) {
    const reason = ticket?.splitReason;
    if (typeof reason !== 'string' || !SPLIT_REASONS.includes(reason)) continue;
    const ticketNodes = graphNodeIdsOfTicket(ticket);
    // A budget-forced boundary proves the split by the merged workload; the
    // trigger is secondary, so the graph check applies only to discretionary pairs.
    if (forcedTicketKeys.has(nodeSetKey(ticketNodes))) continue;
    const adjacentAttempts = attempts.filter((attempt) =>
      mergeAttemptIsValid(attempt)
      && attempt.decision === 'refused'
      && (nodeSetKey(attempt.left) === nodeSetKey(ticketNodes) || nodeSetKey(attempt.right) === nodeSetKey(ticketNodes)));
    const ticketKey = ticketKeyOf(ticket);

    if (reason === 'tdd-order' && !hasHardIntraPhaseDependency(ticket, phase, context)) {
      findings.push({
        code: WORKLOAD_CODES.SPLIT_REASON_GRAPH_MISMATCH,
        ticketKey,
        trigger: reason,
        message: `${ticketKey} uses tdd-order but has no hard intra-phase dependency`,
      });
      continue;
    }
    if (reason === 'ownership-boundary' && !hasForeignOwnership(ticket, context)) {
      findings.push({
        code: WORKLOAD_CODES.SPLIT_REASON_GRAPH_MISMATCH,
        ticketKey,
        trigger: reason,
        message: `${ticketKey} uses ownership-boundary but owns no foreign or consumer boundary unit`,
      });
      continue;
    }
    if (reason === 'disjoint-io' && !hasExternalIoSurface(ticket, context)) {
      findings.push({
        code: WORKLOAD_CODES.SPLIT_REASON_GRAPH_MISMATCH,
        ticketKey,
        trigger: reason,
        message: `${ticketKey} uses disjoint-io but touches no external I/O surface`,
      });
      continue;
    }
    if (reason === 'cohesion') {
      const named = adjacentAttempts.some((attempt) =>
        Array.isArray(attempt.behaviours) && attempt.behaviours.length >= MIN_COHESION_BEHAVIOURS);
      if (!named) {
        findings.push({
          code: WORKLOAD_CODES.SPLIT_REASON_GRAPH_MISMATCH,
          ticketKey,
          trigger: reason,
          message: `${ticketKey} uses cohesion but no adjacent refusal names two unrelated observable behaviours`,
        });
      }
      continue;
    }
    if (reason === 'release-boundary') {
      const evidenced = adjacentAttempts.some((attempt) =>
        typeof attempt.evidence === 'string' && attempt.evidence.trim().length > 0);
      if (!evidenced) {
        findings.push({
          code: WORKLOAD_CODES.SPLIT_REASON_GRAPH_MISMATCH,
          ticketKey,
          trigger: reason,
          message: `${ticketKey} uses release-boundary but no adjacent refusal carries evidence`,
        });
      }
    }
  }
  return findings;
}

/** Whether every graph node of a ticket is a documentation/record node. */
// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
function isRecordTicket(ticket, context) {
  const nodes = graphNodesOf(ticket?.nodeIds, context);
  if (nodes.length === 0) return false;
  return nodes.every((node) => RECORD_NODE_KINDS.includes(node.kind));
}

/** The findings that are not merge evidence. */
// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
function collectWorkloadFindings(phase, budget, context = {}, options = {}) {
  const mode = options.mode === 'v1' ? 'v1' : 'v2';
  const components = options.components
    ?? (mode === 'v1' ? LEGACY_WORKLOAD_COMPONENTS : WORKLOAD_COMPONENTS);
  const findings = [];
  const tickets = Array.isArray(phase?.tickets) ? phase.tickets : [];
  const phaseKey = phaseKeyOf(phase);
  const feasibility = feasibilityOf(phase, budget, context, { mode, components });
  findings.push(...feasibility.findings);
  const irreducibleKeys = new Set(
    feasibility.findings
      .filter((entry) => typeof entry.nodeId === 'string' && typeof entry.ticketKey === 'string')
      .map((entry) => `${entry.ticketKey}|${entry.component}`),
  );

  for (const ticket of tickets) {
    const ticketKey = ticketKeyOf(ticket);
    const workload = workloadOfPhase({ ...phase, tickets: [ticket] }, context, { mode, components });
    for (const component of components) {
      if ((workload[component] ?? 0) <= budget[component]) continue;
      if (irreducibleKeys.has(`${ticketKey}|${component}`)) continue;
      findings.push({
        code: WORKLOAD_CODES.TICKET_WORK_OVER_BUDGET,
        ticketKey,
        component,
        actual: workload[component],
        budget: budget[component],
        message: `${ticketKey} carries ${workload[component]} ${component}; the budget is ${budget[component]}`,
      });
    }

    if (tickets.length > 1) {
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

    if (mode === 'v2' && (ticket.default_files ?? []).length === 0
      && !isRecordTicket(ticket, context)
      && (ticket.unlistedFileReason ?? '').trim().length === 0) {
      findings.push({
        code: WORKLOAD_CODES.EMPTY_DEFAULT_FILES,
        ticketKey,
        message: `${ticketKey} has no default_files and is not a record ticket; add unlistedFileReason or resolve a file`,
      });
    }
  }

  if (feasibility.reason !== 'MINIMUM_EXCEEDS_NODE_COUNT' && tickets.length < feasibility.minimum) {
    findings.push({
      code: WORKLOAD_CODES.TICKET_COUNT_BELOW_WORK_MINIMUM,
      phaseKey,
      actual: tickets.length,
      minimum: feasibility.minimum,
      message: `${phaseKey} proposes ${tickets.length} ticket(s); the workload needs at least ${feasibility.minimum}`,
    });
  }

  return findings;
}

/**
 * Analyze one phase: all findings, accepted overages and the budget report.
 */
// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
function analyzeTicketWorkload(phase, budget, context = {}, options = {}) {
  const mode = options.mode === 'v1' ? 'v1' : 'v2';
  const components = options.components
    ?? (mode === 'v1' ? LEGACY_WORKLOAD_COMPONENTS : WORKLOAD_COMPONENTS);
  const tickets = Array.isArray(phase?.tickets) ? phase.tickets : [];
  const workloadFindings = collectWorkloadFindings(phase, budget, context, { mode, components });
  const merge = mode === 'v2'
    ? collectMergeFindings(phase, budget, context, { mode, components })
    : { findings: [], acceptedRefusals: [], forcedPairs: [], attempts: [] };
  const reasonFindings = mode === 'v2'
    ? collectReasonFindings(phase, context, { mode, components, forcedPairs: merge.forcedPairs })
    : [];
  const findings = [...workloadFindings, ...merge.findings, ...reasonFindings];

  const phaseWorkload = workloadOfPhase(phase, context, { mode, components });
  const minimumWorkTickets = minimumTicketCount(phaseWorkload, budget, components);
  const upperBoundTickets = maximumTicketCount(minimumWorkTickets, merge.acceptedRefusals);
  const workloadOf = mode === 'v1' ? legacyWorkloadOfTicket : workloadOfTicket;
  if (mode === 'v2' && tickets.length > upperBoundTickets) {
    findings.push({
      code: WORKLOAD_CODES.TICKET_COUNT_ABOVE_MERGE_EVIDENCE,
      phaseKey: phaseKeyOf(phase),
      actual: tickets.length,
      maximum: upperBoundTickets,
      minimum: minimumWorkTickets,
      acceptedRefusals: merge.acceptedRefusals.length,
      message: `${phaseKeyOf(phase)} proposes ${tickets.length} ticket(s); the budget floor plus accepted refusals is ${upperBoundTickets}`,
    });
  }

  const acceptedIrreducible = findings.filter((finding) =>
    finding.code === WORKLOAD_CODES.ACCEPTED_IRREDUCIBLE_OVERAGE && finding.accepted === true);
  const fatalFindings = findings.filter((finding) => finding.accepted !== true);

  return {
    findings,
    fatalFindings,
    acceptedIrreducible,
    acceptedRefusals: merge.acceptedRefusals,
    forcedPairs: merge.forcedPairs,
    workBudget: {
      mode,
      components,
      budget,
      phaseWorkload,
      minimumWorkTickets,
      upperBoundTickets,
      acceptedIrreducible,
      acceptedRefusals: merge.acceptedRefusals,
      forcedPairs: merge.forcedPairs,
      mergeAttempts: merge.attempts,
      tickets: tickets.map((ticket) => ({
        ticketKey: ticketKeyOf(ticket),
        workload: workloadOf(ticket, context),
        splitReason: ticket.splitReason ?? null,
      })),
    },
  };
}

/** The findings the split gate acts on. */
// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
function validateTicketWorkload(phase, budget, context = {}, options = {}) {
  return analyzeTicketWorkload(phase, budget, context, options).findings;
}

/** Split findings into fatal and accepted-irreducible buckets. */
// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
function partitionFindings(findings) {
  const fatal = [];
  const acceptedIrreducible = [];
  for (const finding of findings ?? []) {
    if (finding.code === WORKLOAD_CODES.ACCEPTED_IRREDUCIBLE_OVERAGE && finding.accepted === true) {
      acceptedIrreducible.push(finding);
    } else {
      fatal.push(finding);
    }
  }
  return { fatal, acceptedIrreducible };
}

module.exports = {
  WORKLOAD_COMPONENTS,
  LEGACY_WORKLOAD_COMPONENTS,
  SPLIT_REASONS,
  WORKLOAD_CODES,
  emptyWorkload,
  workloadOfNodes,
  legacyWorkloadOfNodes,
  workloadOfTicket,
  legacyWorkloadOfTicket,
  workloadOfPhase,
  legacyWorkloadOfPhase,
  minimumTicketCount,
  maximumTicketCount,
  maxNodeWorkload,
  feasibilityOf,
  parseWorkBudget,
  validateTicketWorkload,
  analyzeTicketWorkload,
  collectMergeFindings,
  collectReasonFindings,
  collectWorkloadFindings,
  partitionFindings,
  moduleNamesOf,
  isProviderBoundaryUnit,
};
