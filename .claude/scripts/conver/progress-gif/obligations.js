// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
const REVIEWED_ROUND = /^R[1-9]\d*$/;

export function countGraphContracts(graph) {
  const ids = new Set();
  for (const edge of (graph && graph.edges) || []) {
    for (const contract of edge.contracts || []) {
      if (contract && contract.id) ids.add(contract.id);
    }
  }
  return ids;
}

export function countBoundaryContracts(packageId, registry) {
  const ids = new Set();
  for (const row of registry || []) {
    if (!row || !row.contract_id) continue;
    if (row.provider_package === packageId || row.consumer_package === packageId) {
      ids.add(row.contract_id);
    }
  }
  return ids;
}

export function countTicketContracts(tickets) {
  const ids = new Set();
  for (const ticket of tickets || []) {
    for (const contract of ticket.contracts || []) {
      if (contract && contract.id) ids.add(contract.id);
    }
  }
  return ids;
}

export function isReviewedStatus(status) {
  return status === 'reviewed' || REVIEWED_ROUND.test(String(status));
}

/**
 * The headline denominator is the whole contract-obligation set, not only the
 * ticket-covered subset. A reviewed count above the total is a data defect, so it is
 * clamped and reported rather than allowed to produce a percentage above 100.
 */
export function clampReviewed(reviewed, total) {
// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
  const safeTotal = Math.max(0, Number(total) || 0);
  const safeReviewed = Math.max(0, Number(reviewed) || 0);
  if (safeReviewed <= safeTotal) return { reviewed: safeReviewed, total: safeTotal, warnings: [] };
  return {
    reviewed: safeTotal,
    total: safeTotal,
    warnings: [`reviewed obligations ${safeReviewed} exceed total ${safeTotal}; clamped`],
  };
}

/**
 * Count the obligations one package owns. A graph contract is identified by its id.
 * A boundary contract is identified by its registry contract id and the package's role;
 * it is counted once for the provider and once for the consumer, because each side owes
 * a different implementation responsibility. A ticket-only id is kept so a ticket that
 * predates the current graph generation does not silently lose its work.
 */
export function countObligations(packageId, graph, registry, tickets) {
  const graphIds = countGraphContracts(graph);
  const boundaryIds = countBoundaryContracts(packageId, registry);
  const ticketIds = countTicketContracts(tickets);
  const ticketOnly = [...ticketIds].filter((id) => !graphIds.has(id) && !boundaryIds.has(id));
  const warnings = ticketOnly.map((id) =>
    `package ${packageId} ticket contract ${id} is absent from the current graph and registry (generation drift)`);
  return {
    graph: graphIds.size,
    boundary: boundaryIds.size,
    ticketOnly: ticketOnly.length,
    total: graphIds.size + boundaryIds.size + ticketOnly.length,
    warnings,
    graphIds,
    boundaryIds,
    ticketIds,
  };
}

/** Compute per-package covered and reviewed obligations from the current ticket set. */
export function computePackageObligations(packageModel, artifacts, registry) {
// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
  const tickets = artifacts.tickets ? flattenTickets(artifacts.tickets) : [];
  const counts = countObligations(packageModel.id, artifacts.graph, registry, tickets);
  const coveredIds = counts.ticketIds;
  const reviewedIds = new Set();
  for (const ticket of tickets) {
    if (!isReviewedStatus(ticket.status)) continue;
    for (const id of countTicketContracts([ticket])) reviewedIds.add(id);
  }
  const reviewed = [...reviewedIds].filter((id) => coveredIds.has(id)).length;
  const ratio = counts.total > 0 ? Math.min(reviewed, counts.total) / counts.total : 0;
  return {
    obligations: {
      graph: counts.graph,
      boundary: counts.boundary,
      ticketOnly: counts.ticketOnly,
      total: counts.total,
      covered: coveredIds.size,
      reviewed,
      ratio,
    },
    tickets: {
      total: tickets.length,
      reviewed: tickets.filter((ticket) => isReviewedStatus(ticket.status)).length,
      remanded: tickets.filter((ticket) => ticket.status === 'remanded').length,
    },
    warnings: counts.warnings,
  };
}

export function flattenTickets(document) {
  const tickets = [];
  for (const phase of (document && document.phases) || []) {
    for (const ticket of phase.tickets || []) tickets.push(ticket);
  }
  return tickets;
}
