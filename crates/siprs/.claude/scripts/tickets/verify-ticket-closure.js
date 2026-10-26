#!/usr/bin/env node

/**
 * verify-ticket-closure.js — Verify ticket contract closure (Gate L2)
 *
 * Usage: node verify-ticket-closure.js --tickets=<path> [--graph=<path>] [--registry=<path>]
 *
 * The graph is derived from the Tickets directory when omitted; the registry is
 * discovered at the nearest workspace ancestor when omitted.
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
const {
  boundaryClauseDigest,
  projectionMatches,
} = require('../sequences-slice/lib/boundary-contract.mjs');
const { registryRowsForPackage } = require('../sequences-slice/lib/distribution-map.mjs');
const {
  deriveGraphPathFromTickets,
  findAllocateManifest,
} = require('../lib/package-artifacts');
const { ticketIdentity } = require('./lib/ticket-identity.js');

/**
 * Parse CLI arguments
 */
// [::TICKET::] PX-68, PX-69, PX-70, PX-71, PX-306, PX-314 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-68|PX-69|PX-70|PX-71|PX-306|PX-314) --for-spec --no-implementation-order`.
function parseArgs(argv = process.argv.slice(2)) {
  let ticketsPath, graphPath, registryPath = null, viewPath = null;
  for (const a of argv) {
    if (a.startsWith('--tickets=')) ticketsPath = path.resolve(a.slice('--tickets='.length));
    if (a.startsWith('--graph=')) graphPath = path.resolve(a.slice('--graph='.length));
    if (a.startsWith('--registry=')) registryPath = path.resolve(a.slice('--registry='.length));
    if (a.startsWith('--view=')) {
      const value = a.slice('--view='.length);
      viewPath = value === '' ? null : path.resolve(value);
    }
  }
  if (!ticketsPath) {
    console.error('[ERROR] --tickets=<path> is required');
    console.error('Cause: Missing arguments');
    console.error('Action: Provide the Tickets.json path');
    process.exit(1);
  }
  if (!graphPath) graphPath = deriveGraphPathFromTickets(ticketsPath);
  if (!graphPath) {
    console.error('[ERROR] Cannot derive GRAPH.json beside ' + ticketsPath);
    console.error('Action: pass --graph=<path> or keep exactly one *-GRAPH.json beside Tickets.json');
    process.exit(1);
  }
  if (registryPath === null) registryPath = findAllocateManifest(path.dirname(ticketsPath));
  if (viewPath === null) {
    const derivedViewPath = path.join(path.dirname(ticketsPath), 'SEQUENCES.json');
    viewPath = fs.existsSync(derivedViewPath) ? derivedViewPath : null;
  }
  return { ticketsPath, graphPath, registryPath, viewPath };
}

/** The contract rows an allocate manifest declares, or an empty list without a manifest. */
// [::TICKET::] PX-312, PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313) --for-spec --no-implementation-order`.
function registryContracts(registryPath) {
  if (registryPath === null || !fs.existsSync(registryPath)) return [];
  const document = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  return (document.contract_registry || []).filter((row) => typeof row?.boundary_id === 'string');
}

/** The boundary ids an allocate manifest declares, or an empty list without a manifest. */
// [::TICKET::] PX-306, PX-312, PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-306|PX-312|PX-313) --for-spec --no-implementation-order`.
function registryBoundaryIds(registryPath) {
  return registryContracts(registryPath).map((row) => row.boundary_id);
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
// [::TICKET::] PX-306, PX-315 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-306|PX-315) --for-spec --no-implementation-order`.
function ticketKeyOf(ticket) {
  return ticketIdentity(ticket);
}

/** The edge label a ticket contract records, without the merge suffix. */
// [::TICKET::] PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-306 --for-spec --no-implementation-order`.
function edgeLabelOf(contract) {
  return String(contract.sourceEdge || '').replace(/\s*\((?:internal|inbound)\)\s*$/i, '').trim();
}

// [::TICKET::] PX-306, PX-312, PX-313, PX-315 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-306|PX-312|PX-313|PX-315) --for-spec --no-implementation-order`.
function verifyClosure(tickets, graph, options = {}) {
  const errors = [];
  const edges = graph.edges || [];

  // Key by the ticket object, not by its numeric id: ids are numbered inside a phase, so
  // P0-1 and P1-1 would otherwise be mistaken for the same ticket and the crossing edge
  // would be skipped as intra-ticket.
  const nodeToTicket = new Map();
  for (const ticket of tickets) {
    for (const nodeId of ticket.nodeIds || []) nodeToTicket.set(nodeId, ticket);
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
    const sourceTicket = nodeToTicket.get(edge.from);
    const targetTicket = nodeToTicket.get(edge.to);
    if (sourceTicket === undefined || targetTicket === undefined || sourceTicket === targetTicket) continue;
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

  // Strict registry rows: a ticket carrying ctr-B must carry the registry projection,
  // not merely any contract. Legacy boundary ids without clauses keep the presence check.
  const strictRows = (options.registryContracts ?? []).filter((row) => row?.clauses !== null && row?.clauses !== undefined);
  for (const row of strictRows) {
    const ctrUnit = `ctr-${row.boundary_id}`;
    // Every ticket that carries the unit owes the contract. Reading only the first one
    // would let a second ticket carrying the same ctr unit pass without its projection.
    for (const ticket of tickets) {
      const carriedUnits = new Set([
        ...(ticket.nodeIds ?? []),
        ...(ticket.distribution?.units ?? []).map((unit) => unit.unitId),
      ]);
      if (!carriedUnits.has(ctrUnit)) continue;
      const contract = (ticket.contracts ?? []).find((entry) => entry.boundaryId === row.boundary_id
        || entry.registryContractId === `contract-${row.boundary_id}`
        || entry.id === `contract-${row.boundary_id}`);
      if (contract === undefined) {
        errors.push({
          ticket: ticketKeyOf(ticket),
          code: 'MISSING_BOUNDARY_CONTRACT',
          detail: `ticket carries ${ctrUnit} without the registry contract`,
        });
        continue;
      }
      if (contract.clauseDigest !== boundaryClauseDigest(row) || !projectionMatches(contract, row)) {
        errors.push({
          ticket: ticketKeyOf(ticket),
          code: 'BOUNDARY_CONTRACT_MISMATCH',
          detail: `ticket contract for ${row.boundary_id} does not match the registry projection`,
        });
      }
    }
  }

  const edgeLabels = new Set(edges.map((edge) => edge.from + '→' + edge.to));
  const registrySet = new Set([
    ...registry,
    ...(options.registryContracts ?? []).map((row) => row.boundary_id),
  ]);
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

// [::TICKET::] PX-68, PX-69, PX-70, PX-71, PX-306, PX-312, PX-313, PX-314 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-68|PX-69|PX-70|PX-71|PX-306|PX-312|PX-313|PX-314) --for-spec --no-implementation-order`.
function main() {
  const { ticketsPath, graphPath, registryPath, viewPath } = parseArgs();

  if (!fs.existsSync(ticketsPath)) {
    console.error('[ERROR] Tickets.json not found: ' + ticketsPath);
    process.exit(1);
  }
  if (!fs.existsSync(graphPath)) {
    console.error('[ERROR] GRAPH.json not found: ' + graphPath);
    process.exit(1);
  }
  if (viewPath !== null && !fs.existsSync(viewPath)) {
    console.error('[ERROR] MISSING_VIEW: --view was supplied but the package view is not readable: ' + viewPath);
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

  const rows = registryContracts(registryPath);
  const view = viewPath !== null && fs.existsSync(viewPath)
    ? JSON.parse(fs.readFileSync(viewPath, 'utf8'))
    : null;
  const scopedRows = view === null ? rows : registryRowsForPackage(rows, view.packageId);
  const result = verifyClosure(allTickets, graph, {
    registryBoundaryIds: scopedRows.map((row) => row.boundary_id),
    registryContracts: scopedRows,
  });

  if (!result.valid) {
    for (const err of result.errors) {
      console.error('[ERROR] Ticket ' + err.ticket + ': ' + err.detail);
      console.error('Cause: Contract closure violation');
      console.error('Action: Fix the contract chain in the specified ticket and re-run graphify');
    }
    process.exit(1);
  }

  process.stdout.write(`${JSON.stringify({ ok: true, ticketsChecked: allTickets.length })}\n`);
  process.exit(0);
}

if (require.main === module) main();
module.exports = { verifyClosure, parseArgs };
