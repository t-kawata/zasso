/**
 * Whether every unit a package was told to implement still has a name at every layer.
 *
 * The chain is: the ledger assigns a unit to a package; the RFC section carries its anchor;
 * the graph node carries its id; the implementation header names it; the ticket declares
 * it; the graph is what the ship layer reads. A unit that is present at one layer and
 * absent at the next is either an omission or an invention, and the two call for different
 * repairs, so they are reported apart.
 *
 * The check returns nothing when no unit ids are present anywhere. That is the property the
 * whole reinforcement rests on: a package that predates the feature keeps the verdict it
 * had, and the extension is additive rather than a new obligation on old work.
 */
import { isUnitId } from '../../rfc-graph/lib/unit-ids.mjs';

const SEVERITY_HIGH = 'high';

/** A finding in the shape verify-consistencies.js already produces. */
// [::TICKET::] PX-258 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-258 --for-spec --no-implementation-order`.
function finding(message) {
  return { severity: SEVERITY_HIGH, message };
}

/** The unit ids a node carries, read without importing the graph reader's whole surface. */
// [::TICKET::] PX-258 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-258 --for-spec --no-implementation-order`.
function unitIdsOf(node) {
  return Array.isArray(node?.unitIds) ? node.unitIds.filter(isUnitId) : [];
}

/**
 * Every unit id a graph makes visible to the ship layer.
 *
 * crystalize-readme derives the README from the graph and reads nothing else, so this is
 * exactly the set of units the ship layer can name.
 *
 * @param {{ nodes?: Array<object> }} graph
 * @returns {string[]}
 */
// [::TICKET::] PX-258 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-258 --for-spec --no-implementation-order`.
export function unitsVisibleToShip(graph) {
  const ids = new Set();
  for (const node of graph?.nodes ?? []) {
    for (const unitId of unitIdsOf(node)) ids.add(unitId);
  }
  return [...ids];
}

/** The unit ids a header names, and the node it names them for. */
// [::TICKET::] PX-258 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-258 --for-spec --no-implementation-order`.
function readHeader(headerText) {
  const text = String(headerText);
  if (!text.includes('Initial Design Artifact')) return null;
  const nodeMatch = /^\s*node:\s*(N[0-9]{4})\b/m.exec(text);
  const unitsMatch = /^\s*units:\s*(.+)$/m.exec(text);
  return {
    nodeId: nodeMatch === null ? null : nodeMatch[1],
    unitIds: unitsMatch === null ? [] : unitsMatch[1].split(',').map((entry) => entry.trim()).filter(isUnitId),
  };
}

/** The unit ids a tickets document declares, read at the level its consumers read. */
// [::TICKET::] PX-258 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-258 --for-spec --no-implementation-order`.
function ticketUnitIdsByTicket(tickets) {
  const byTicket = [];
  for (const phase of tickets?.phases ?? []) {
    for (const ticket of phase.tickets ?? []) {
      if (!Array.isArray(ticket.nodeIds)) continue;
      const unitIds = ticket.nodeIds.filter(isUnitId);
      if (unitIds.length > 0) byTicket.push({ ticketId: ticket.id, unitIds });
    }
  }
  return byTicket;
}

/** Every ticket in a tickets document. */
// [::TICKET::] PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-306 --for-spec --no-implementation-order`.
function allTickets(tickets) {
  return (tickets?.phases ?? []).flatMap((phase) => phase?.tickets ?? []);
}

/** A unit id a ticket carries, excluding graph node ids. */
// [::TICKET::] PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-306 --for-spec --no-implementation-order`.
function ticketUnitIds(tickets) {
  return new Set(allTickets(tickets).flatMap((ticket) => (Array.isArray(ticket?.nodeIds) ? ticket.nodeIds : []))
    .filter(isUnitId));
}

/** A coded provenance finding. */
// [::TICKET::] PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-306 --for-spec --no-implementation-order`.
function provenanceFinding(code, unitId, layer, message) {
  return { code, severity: SEVERITY_HIGH, unitId, layer, message };
}

/**
 * The chain the SEQUENCES view promises: view -> ledger -> graph -> ticket.
 *
 * The view is what the package was told to implement, the ledger is what its RFC accounts
 * for, the graph is what graphify read from that RFC, and the ticket is what the split
 * assigned. A gap at any link is reported at the link that dropped it.
 *
 * @param {{viewUnitIds?: string[], ledgerUnitIds?: string[], residualUnitIds?: string[],
 *   graph?: {nodes?: Array<object>}|null, tickets?: {phases?: Array<object>}|null}} input
 * @returns {Array<{code: string, severity: string, unitId: string, layer: string, message: string}>}
 */
// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
export function checkUnitCoverage(input = {}) {
  const {
    viewUnitIds = [], ledgerUnitIds = [], residualUnitIds = [], graph = null, tickets = null,
  } = input;
  const view = new Set((Array.isArray(viewUnitIds) ? viewUnitIds : []).filter(isUnitId));
  const ledger = new Set((Array.isArray(ledgerUnitIds) ? ledgerUnitIds : []).filter(isUnitId));
  // A residual is the ledger's explicit account of a view unit it does not distribute, so
  // the rfc link is satisfied without the unit entering the graph or the tickets.
  const residual = new Set((Array.isArray(residualUnitIds) ? residualUnitIds : []).filter(isUnitId));
  const graphUnits = new Set(unitsVisibleToShip(graph));
  const ticketUnits = ticketUnitIds(tickets);
  const findings = [];
  const add = (code, unitId, layer, message) => findings.push(provenanceFinding(code, unitId, layer, message));

  for (const unitId of view) {
    if (residual.has(unitId)) continue;
    if (!ledger.has(unitId)) add('MISSING_UNIT_AT_LAYER', unitId, 'rfc', `unit ${unitId} is distributed by the view and absent from the distribution ledger`);
  }
  if (view.size > 0) {
    for (const unitId of ledger) {
      if (!view.has(unitId)) add('INVENTED_UNIT', unitId, 'rfc', `unit ${unitId} is in the ledger and no package view distributes it`);
    }
  }

  for (const unitId of ledger) {
    if (!graphUnits.has(unitId)) add('MISSING_UNIT_AT_LAYER', unitId, 'graph', `unit ${unitId} is in the ledger and no graph node carries it`);
  }
  for (const unitId of graphUnits) {
    if (!ledger.has(unitId)) add('INVENTED_UNIT', unitId, 'graph', `unit ${unitId} is carried by a graph node and the ledger does not assign it`);
  }

  for (const unitId of graphUnits) {
    if (!ticketUnits.has(unitId)) add('MISSING_UNIT_AT_LAYER', unitId, 'ticket', `unit ${unitId} is carried by the graph and no ticket declares it`);
  }
  for (const unitId of ticketUnits) {
    if (!graphUnits.has(unitId)) add('INVENTED_UNIT', unitId, 'ticket', `unit ${unitId} is declared by a ticket and the graph does not carry it`);
  }

  const seen = new Set();
  return findings.filter((entry) => {
    const key = `${entry.code}|${entry.unitId}|${entry.layer}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The nodes a graph gives a unit id. */
// [::TICKET::] PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-306 --for-spec --no-implementation-order`.
function boundaryNodes(graph, unitId) {
  return (graph?.nodes ?? []).filter((node) => unitIdsOf(node).includes(unitId));
}

/** Whether a graph edge is incident to one of the nodes. */
// [::TICKET::] PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-306 --for-spec --no-implementation-order`.
function incidentEdge(graph, nodes) {
  const ids = new Set(nodes.map((node) => node.id));
  return (graph?.edges ?? []).find((edge) => ids.has(edge.from) || ids.has(edge.to));
}

/** The edge label a ticket contract records, without the merge suffix. */
// [::TICKET::] PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-306 --for-spec --no-implementation-order`.
function edgeLabelOf(contract) {
  return String(contract?.sourceEdge ?? '').replace(/\s*\((?:internal|inbound)\)\s*$/i, '').trim();
}

/**
 * The boundary contract chain: allocate registry -> graph edge -> ticket contract.
 *
 * A registry boundary is carried as `ctr-<boundaryId>`. The graph node carrying it must
 * have a contract edge, and a ticket carrying it must carry a contract. A ticket contract
 * that names neither a graph edge nor a registry boundary was invented by the split.
 *
 * @param {{registryBoundaryIds?: string[], graph?: object|null, tickets?: object|null}} input
 * @returns {Array<{code: string, severity: string, boundaryId?: string, contractId?: string, message: string}>}
 */
export function checkBoundaryContracts({
  registryBoundaryIds = [], graph = null, tickets = null,
} = {}) {
  const findings = [];
  const ticketEntries = allTickets(tickets);
  for (const boundaryId of registryBoundaryIds) {
    const unitId = `ctr-${boundaryId}`;
    const nodes = boundaryNodes(graph, unitId);
    const edge = incidentEdge(graph, nodes);
    const hasEdgeContract = edge !== undefined && Array.isArray(edge.contracts) && edge.contracts.length > 0;
    if (nodes.length === 0 || !hasEdgeContract) {
      findings.push({
        code: 'MISSING_BOUNDARY_CONTRACT',
        severity: SEVERITY_HIGH,
        boundaryId,
        message: `boundary ${boundaryId} is in the registry and no graph node ${unitId} carries a contract edge`,
      });
      continue;
    }
    const ticket = ticketEntries.find((entry) => (entry?.nodeIds ?? []).includes(unitId)
      && Array.isArray(entry.contracts) && entry.contracts.length > 0);
    if (ticket === undefined) {
      findings.push({
        code: 'MISSING_BOUNDARY_CONTRACT',
        severity: SEVERITY_HIGH,
        boundaryId,
        message: `boundary ${boundaryId} reaches the graph and no ticket carries its contract`,
      });
    }
  }

  const edgeLabels = new Set((graph?.edges ?? []).map((edge) => `${edge.from}→${edge.to}`));
  const registry = new Set(registryBoundaryIds);
  for (const ticket of ticketEntries) {
    for (const contract of Array.isArray(ticket?.contracts) ? ticket.contracts : []) {
      const edgeResolves = edgeLabels.has(edgeLabelOf(contract));
      const registryResolves = registry.has(contract?.boundaryId)
        || [...registry].some((boundaryId) => contract?.id === `contract-${boundaryId}` || contract?.id === boundaryId);
      if (!edgeResolves && !registryResolves) {
        findings.push({
          code: 'INVENTED_TICKET_CONTRACT',
          severity: SEVERITY_HIGH,
          contractId: contract?.id ?? null,
          message: `ticket ${ticket?.id ?? '?'} carries contract ${contract?.id ?? '?'} with no graph edge and no registry boundary`,
        });
      }
    }
  }
  return findings;
}

/**
 * The provenance findings for one package.
 *
 * @param {{ nodes?: Array<object> }} graph
 * @param {Set<string>|null|undefined} ledgerUnitIds - the units the ledger assigns here, or nothing
 * @param {string[]} [headers] - the text of each generated implementation header
 * @param {{ phases?: Array<object> }|null|undefined} [tickets]
 * @returns {object[]}
 */
// [::TICKET::] PX-258 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-258 --for-spec --no-implementation-order`.
export function checkUnitProvenance(graph, ledgerUnitIds, headers = [], tickets = null) {
  const unitsInGraph = unitsVisibleToShip(graph);
  const ledger = ledgerUnitIds instanceof Set
    ? ledgerUnitIds
    : new Set(Array.isArray(ledgerUnitIds) ? ledgerUnitIds : []);
  const declaresNothing = unitsInGraph.length === 0
    && (headers ?? []).every((header) => (readHeader(header)?.unitIds ?? []).length === 0)
    && ticketUnitIdsByTicket(tickets).length === 0;
  if (declaresNothing) {
    // An empty graph is additive only when the ledger is empty too. A ledger that assigns
    // units and a graph that carries none is exactly the loss this check exists to report.
    // A null graph means the caller did not supply the chain at all (the package-level
    // preservation check), so there is nothing to compare and nothing to report.
    if (ledger.size === 0 || graph === null || graph === undefined) return [];
    return [...ledger].map((unitId) => finding(`unit ${unitId} is assigned by the ledger and no graph node or ticket carries it`));
  }

  const findings = [];
  const unitsInGraphSet = new Set(unitsInGraph);
  const unitsByNode = new Map((graph?.nodes ?? []).map((node) => [node.id, new Set(unitIdsOf(node))]));

  if (ledger.size > 0) {
    for (const unitId of unitsInGraph) {
      if (!ledger.has(unitId)) {
        findings.push(finding(`unit ${unitId} is carried by this package's graph and the ledger does not assign it here`));
      }
    }
  }

  for (const header of headers ?? []) {
    const parsed = readHeader(header);
    if (parsed === null) continue;
    if (parsed.nodeId === null) {
      findings.push(finding('a generated header names no graph node'));
      continue;
    }
    const nodeUnitIds = unitsByNode.get(parsed.nodeId);
    if (nodeUnitIds === undefined) {
      findings.push(finding(`a generated header names the graph node ${parsed.nodeId}, which this graph does not carry`));
      continue;
    }
    for (const unitId of parsed.unitIds) {
      if (!nodeUnitIds.has(unitId)) {
        findings.push(finding(`a generated header for ${parsed.nodeId} names the unit ${unitId}, which that node does not carry`));
      }
    }
  }

  const claimed = new Set();
  for (const entry of ticketUnitIdsByTicket(tickets)) {
    for (const unitId of entry.unitIds) {
      claimed.add(unitId);
      if (!unitsInGraphSet.has(unitId)) {
        findings.push(finding(`ticket ${entry.ticketId} names the unit ${unitId}, which this package's graph does not carry`));
      }
    }
  }
  for (const unitId of unitsInGraph) {
    if (ticketUnitIdsByTicket(tickets).length > 0 && !claimed.has(unitId)) {
      findings.push(finding(`unit ${unitId} is carried by this package's graph and no ticket declares it`));
    }
  }

  return findings;
}
