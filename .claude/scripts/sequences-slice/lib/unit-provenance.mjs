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
  const declaresNothing = unitsInGraph.length === 0
    && (headers ?? []).every((header) => (readHeader(header)?.unitIds ?? []).length === 0)
    && ticketUnitIdsByTicket(tickets).length === 0;
  if (declaresNothing) return [];

  const findings = [];
  const unitsInGraphSet = new Set(unitsInGraph);
  const unitsByNode = new Map((graph?.nodes ?? []).map((node) => [node.id, new Set(unitIdsOf(node))]));

  if (ledgerUnitIds !== null && ledgerUnitIds !== undefined && ledgerUnitIds.size > 0) {
    for (const unitId of unitsInGraph) {
      if (!ledgerUnitIds.has(unitId)) {
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
