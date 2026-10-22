#!/usr/bin/env node

/**
 * verify-ticket-closure.js — Verify ticket contract closure (Gate L2)
 *
 * Usage: node verify-ticket-closure.js --tickets=<path> --graph=<path>
 *
 * Verifies:
 * 1. Intra-ticket closure: all postcondition→precondition chains within tickets
 * 2. Inter-ticket closure: postcondition→precondition between dependent tickets
 *
 * Exits 0 on pass, 1 on failure. Outputs 3-line error template on stderr.
 *
 * [::TICKET::] PX-68: merge-contracts-to-tickets + Gate L2
 */

const fs = require('fs');
const path = require('path');

/**
 * Parse CLI arguments
 */
// [::TICKET::] PX-68, PX-69, PX-70, PX-71, PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-68|PX-69|PX-70|PX-71|PX-306) --for-spec --no-implementation-order`.
function parseArgs() {
  const args = process.argv.slice(2);
  let ticketsPath, graphPath, registryPath = null;
  for (const a of args) {
    if (a.startsWith('--tickets=')) ticketsPath = path.resolve(a.slice('--tickets='.length));
    if (a.startsWith('--graph=')) graphPath = path.resolve(a.slice('--graph='.length));
    if (a.startsWith('--registry=')) registryPath = path.resolve(a.slice('--registry='.length));
  }
  if (!ticketsPath || !graphPath) {
    console.error('[ERROR] --tickets=<path> and --graph=<path> are required');
    console.error('Cause: Missing arguments');
    console.error('Action: Provide both --tickets and --graph paths');
    process.exit(1);
  }
  return { ticketsPath, graphPath, registryPath };
}

/** The boundary ids an allocate manifest declares, or an empty list without a manifest. */
// [::TICKET::] PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-306 --for-spec --no-implementation-order`.
function registryBoundaryIds(registryPath) {
  if (registryPath === null || !fs.existsSync(registryPath)) return [];
  const document = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  return (document.contract_registry || []).map((row) => row.boundary_id).filter(Boolean);
}

/**
 * Verify closure across all tickets
 *
 * @param {Array} tickets — Array of ticket objects (flat list, all phases)
 * @param {Object} graph — Graph JSON
 * @returns {{ valid: boolean, errors: Array<{ticket: string, detail: string}> }}
 */
// [::TICKET::] PX-68, PX-69, PX-70, PX-71, PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-68|PX-69|PX-70|PX-71|PX-306) --for-spec --no-implementation-order`.
/** A normalized contract clause for the satisfaction comparison. */
// [::TICKET::] PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-306 --for-spec --no-implementation-order`.
function normalizeClause(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Whether one postcondition satisfies a later precondition.
 *
 * The two clauses are prose, so equality alone would reject every paraphrase. Containment
 * is the mechanical relation the split can check: "token issued" satisfies "token", and
 * "token issued" does not satisfy "session active".
 */
// [::TICKET::] PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-306 --for-spec --no-implementation-order`.
function postconditionSatisfiesPrecondition(postcondition, precondition) {
  const post = normalizeClause(postcondition);
  const pre = normalizeClause(precondition);
  if (post === '' || pre === '') return false;
  return post === pre || post.includes(pre) || pre.includes(post);
}

/** The contracts an edge carries, or an empty list. */
// [::TICKET::] PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-306 --for-spec --no-implementation-order`.
function contractsOf(edge) {
  return Array.isArray(edge.contracts) ? edge.contracts : [];
}

/** The ticket key a flat ticket is reported under. */
// [::TICKET::] PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-306 --for-spec --no-implementation-order`.
function ticketKeyOf(ticket) {
  return 'P' + (ticket.phaseId !== undefined ? ticket.phaseId : -1) + '-' + ticket.id;
}

/** The edge label a ticket contract records, without the merge suffix. */
// [::TICKET::] PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-306 --for-spec --no-implementation-order`.
function edgeLabelOf(contract) {
  return String(contract.sourceEdge || '').replace(/\s*\((?:internal|inbound)\)\s*$/i, '').trim();
}

// [::TICKET::] PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-306 --for-spec --no-implementation-order`.
function verifyClosure(tickets, graph, options = {}) {
  const errors = [];
  const edges = graph.edges || [];

  const nodeToTicket = {};
  for (const ticket of tickets) {
    for (const nodeId of ticket.nodeIds || []) nodeToTicket[nodeId] = ticket.id;
  }

  for (const ticket of tickets) {
    const nodeSet = new Set(ticket.nodeIds || []);
    const ticketKey = ticketKeyOf(ticket);
    const inside = edges.filter((edge) => nodeSet.has(edge.from) && nodeSet.has(edge.to));

    // A node inside this ticket that receives one contract and emits another must have
    // its incoming postcondition satisfy the outgoing precondition.
    for (const nodeId of nodeSet) {
      const incoming = inside.filter((edge) => edge.to === nodeId).flatMap((edge) => contractsOf(edge)
        .filter((contract) => contract.postcondition));
      const outgoing = inside.filter((edge) => edge.from === nodeId).flatMap((edge) => contractsOf(edge)
        .filter((contract) => contract.precondition));
      if (incoming.length === 0 || outgoing.length === 0) continue;
      for (const next of outgoing) {
        const satisfied = incoming.some((previous) => postconditionSatisfiesPrecondition(previous.postcondition, next.precondition));
        if (!satisfied) {
          errors.push({
            ticket: ticketKey,
            code: 'CONTRACT_CHAIN_OPEN',
            detail: 'Intra-ticket node ' + nodeId + ': no incoming postcondition satisfies precondition "' + next.precondition + '"',
          });
        }
      }
    }
  }

  // Inter-ticket: a crossing edge's source ticket must provide what the target ticket
  // requires. The target's contracts record the precondition it was written against.
  for (const edge of edges) {
    const fromTicketId = nodeToTicket[edge.from];
    const toTicketId = nodeToTicket[edge.to];
    if (fromTicketId === undefined || toTicketId === undefined || fromTicketId === toTicketId) continue;
    const sourceTicket = tickets.find((ticket) => ticket.id === fromTicketId);
    const targetTicket = tickets.find((ticket) => ticket.id === toTicketId);
    const label = edge.from + '→' + edge.to;
    const sourceContracts = (sourceTicket && Array.isArray(sourceTicket.contracts) ? sourceTicket.contracts : [])
      .filter((contract) => edgeLabelOf(contract) === label && contract.postcondition);
    const targetContracts = (targetTicket && Array.isArray(targetTicket.contracts) ? targetTicket.contracts : [])
      .filter((contract) => contract.precondition);
    if (sourceContracts.length === 0 || targetContracts.length === 0) continue;
    for (const target of targetContracts) {
      const satisfied = sourceContracts.some((source) => postconditionSatisfiesPrecondition(source.postcondition, target.precondition));
      if (!satisfied) {
        errors.push({
          ticket: ticketKeyOf(targetTicket),
          code: 'INTER_TICKET_CLOSURE_OPEN',
          detail: 'Inter-ticket edge ' + label + ': no source postcondition satisfies precondition "' + target.precondition + '"',
        });
      }
    }
  }

  // Boundary chain (PX-306 @verifies C003): registry -> ctr-B in graph and tickets.
  const registry = options.registryBoundaryIds || [];
  const unitIdsByTicket = tickets.flatMap((ticket) => (ticket.nodeIds || []).filter((entry) => String(entry).startsWith('ctr-')));
  for (const boundaryId of registry) {
    const unitId = 'ctr-' + boundaryId;
    const inGraph = (graph.nodes || []).some((node) => Array.isArray(node.unitIds) && node.unitIds.includes(unitId));
    const inTicket = unitIdsByTicket.includes(unitId)
      && tickets.some((ticket) => (ticket.nodeIds || []).includes(unitId)
        && Array.isArray(ticket.contracts) && ticket.contracts.length > 0);
    if (!inGraph || !inTicket) {
      errors.push({
        ticket: 'boundary',
        code: 'MISSING_BOUNDARY_CONTRACT',
        detail: 'Registry boundary ' + boundaryId + ' is not carried by a graph node and a ticket contract',
      });
    }
  }

  const edgeLabels = new Set(edges.map((edge) => edge.from + '→' + edge.to));
  const registrySet = new Set(registry);
  for (const ticket of tickets) {
    for (const contract of Array.isArray(ticket.contracts) ? ticket.contracts : []) {
      const edgeResolves = edgeLabels.has(edgeLabelOf(contract));
      const registryResolves = registrySet.has(contract.boundaryId)
        || [...registrySet].some((boundaryId) => contract.id === 'contract-' + boundaryId || contract.id === boundaryId);
      if (!edgeResolves && !registryResolves) {
        errors.push({
          ticket: ticketKeyOf(ticket),
          code: 'INVENTED_TICKET_CONTRACT',
          detail: 'Contract ' + (contract.id || '?') + ' names no graph edge and no registry boundary',
        });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// [::TICKET::] PX-68, PX-69, PX-70, PX-71, PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-68|PX-69|PX-70|PX-71|PX-306) --for-spec --no-implementation-order`.
function main() {
  const { ticketsPath, graphPath, registryPath } = parseArgs();

  if (!fs.existsSync(ticketsPath)) {
    console.error('[ERROR] Tickets.json not found: ' + ticketsPath);
    process.exit(1);
  }
  if (!fs.existsSync(graphPath)) {
    console.error('[ERROR] GRAPH.json not found: ' + graphPath);
    process.exit(1);
  }

  const ticketsData = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));

  // Flatten tickets from all phases
  const allTickets = [];
  for (const phase of ticketsData.phases) {
    if (phase.tickets) {
      for (const t of phase.tickets) {
        t.phaseId = phase.id;
        allTickets.push(t);
      }
    }
  }

  const result = verifyClosure(allTickets, graph, { registryBoundaryIds: registryBoundaryIds(registryPath) });

  if (!result.valid) {
    for (const err of result.errors) {
      console.error('[ERROR] Ticket ' + err.ticket + ': ' + err.detail);
      console.error('Cause: Contract closure violation');
      console.error('Action: Fix the contract chain in the specified ticket and re-run graphify');
    }
    process.exit(1);
  }

  console.log(JSON.stringify({ ok: true, ticketsChecked: allTickets.length }));
  process.exit(0);
}

if (require.main === module) main();
module.exports = { verifyClosure };
