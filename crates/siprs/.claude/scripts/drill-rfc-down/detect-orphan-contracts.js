#!/usr/bin/env node
/**
 * detect-orphan-contracts.js — drill-rfc-down orphaned edge-contract detector (PX-172)
 *
 * After graphify (Step 2) adds an edge with contracts, the drill split (Step 4) has
 * no contract handling, so the new edge contracts can be ORPHANED: present in the
 * GRAPH but present in no ticket's contracts array, hence never implemented/tested.
 * This module deterministically detects every such orphan and surfaces the tickets
 * that connect to the edge (by nodeIds), so the AI can decide where each contract
 * belongs (existing ticket with an R-round, or a new ticket).
 *
 * The detector is READ-ONLY (C002) and never auto-assigns — assignment stays
 * AI-driven, per the drill design principle (deterministic facts are script-decided;
 * semantic assignment is AI-decided).
 *
 * Design context: tools/conver/README.md — 進化ループ / /drill-rfc-down (Step 4/5).
 */

/** Collect every ticket across all phases into a flat array. */
// [::TICKET::] PX-172 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-172 --for-spec --no-implementation-order`.
function collectTickets(tickets) {
  const acc = [];
  for (const phase of tickets.phases || []) {
    for (const ticket of phase.tickets || []) {
      acc.push({
        key: `${phase.id === -1 ? 'PX' : 'P' + phase.id}-${ticket.id}`,
        status: ticket.status || 'todo',
        nodeIds: ticket.nodeIds || [],
        contracts: ticket.contracts || [],
      });
    }
  }
  return acc;
}

/** Build nodeId → list of ticket keys that own the node. */
// [::TICKET::] PX-172 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-172 --for-spec --no-implementation-order`.
function buildNodeToTicketKeys(ticketList) {
  const nodeToTicketKeys = {};
  for (const ticket of ticketList) {
    for (const nodeId of ticket.nodeIds) {
      (nodeToTicketKeys[nodeId] = nodeToTicketKeys[nodeId] || []).push(ticket.key);
    }
  }
  return nodeToTicketKeys;
}

/** Whether a ticket's contracts already carry this edge contract (id + canonical sourceEdge). */
// [::TICKET::] PX-172 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-172 --for-spec --no-implementation-order`.
function contractCoveredBy(ticket, edge, contract) {
  const edgeLabel = `${edge.from}→${edge.to}`;
  return (ticket.contracts || []).some(
    (c) => c.id === contract.id && (c.sourceEdge || '').includes(edgeLabel),
  );
}

/**
 * Detect every edge contract not present in any connecting ticket's contracts.
 *
 * @param {Object} graph — parsed GRAPH (nodes, edges[].contracts)
 * @param {Object} tickets — parsed Tickets.json
 * @returns {Array<{ contract: Object, edge: Object, connectingTickets: Array<{key:string, status:string}> }>}
 */
export function detectOrphanContracts(graph, tickets) {
  const ticketList = collectTickets(tickets);
  const nodeToTicketKeys = buildNodeToTicketKeys(ticketList);
  const ticketByKey = new Map(ticketList.map((t) => [t.key, t]));
  const orphans = [];

  for (const edge of graph.edges || []) {
    const touchingKeys = new Set([
      ...(nodeToTicketKeys[edge.from] || []),
      ...(nodeToTicketKeys[edge.to] || []),
    ]);
    const connectingTickets = [...touchingKeys]
      .map((key) => ticketByKey.get(key))
      .filter(Boolean)
      .map((t) => ({ key: t.key, status: t.status }));

    for (const contract of edge.contracts || []) {
      const covered = connectingTickets.some((t) => contractCoveredBy(ticketByKey.get(t.key), edge, contract));
      if (!covered) {
        orphans.push({ contract, edge, connectingTickets });
      }
    }
  }

  return orphans;
}
