#!/usr/bin/env node

/**
 * merge-contracts-to-tickets.js — Merge edge contracts into ticket contracts
 *
 * Usage: node merge-contracts-to-tickets.js <Tickets.json> <GRAPH.json>
 *
 * For each ticket, collects contracts from all edges between its nodeIds.
 * Contracts that are internally closed (source.postcondition === target.precondition
 * within the same ticket) are excluded from external exposure.
 * Performs atomic write to Tickets.json after updating all tickets.
 *
 * [::TICKET::] PX-68: merge-contracts-to-tickets + Gate L2
 */

const fs = require('fs');
const path = require('path');

/**
 * Parse CLI arguments
 */
// [::TICKET::] PX-68, PX-69, PX-70, PX-71 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-68|PX-69|PX-70|PX-71) --for-spec --no-implementation-order`.
function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('[ERROR] Usage: merge-contracts-to-tickets.js <Tickets.json> <GRAPH.json>');
    console.error('Cause: Missing arguments');
    console.error('Action: Provide Tickets.json path and GRAPH.json path');
    process.exit(1);
  }
  return { ticketsPath: path.resolve(args[0]), graphPath: path.resolve(args[1]) };
}

/**
 * Atomic write using temp file + rename
 */
// [::TICKET::] PX-68, PX-69, PX-70, PX-71 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-68|PX-69|PX-70|PX-71) --for-spec --no-implementation-order`.
function atomicWrite(targetPath, data) {
  const tmpPath = targetPath + '.tmp.' + process.pid;
  fs.writeFileSync(tmpPath, data, 'utf8');
  fs.renameSync(tmpPath, targetPath);
}

/**
 * Merge edge contracts into each ticket's contracts field
 *
 * For each edge within a ticket's nodeIds:
 *  - If edge has contracts, assess internal closure:
 *    source.postcondition === target.precondition → internally closed (exclude from exposure)
 *    otherwise → include in external exposure
 *  - Edge nodes span tickets → include as boundary contract (sourceEdge marks origin)
 *
 * @param {Array} tickets — Array of ticket objects
 * @param {Object} graph — Graph JSON with edges[].contracts
 * @returns {Array} — Tickets with updated contracts fields
 */
// [::TICKET::] PX-68, PX-69, PX-70, PX-71 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-68|PX-69|PX-70|PX-71) --for-spec --no-implementation-order`.
function mergeContracts(tickets, graph) {
  const edges = graph.edges || [];

  // Build nodeId → ticketId mapping for cross-ticket edge detection
  const nodeToTicket = {};
  for (const t of tickets) {
    if (t.nodeIds) {
      for (const nid of t.nodeIds) {
        nodeToTicket[nid] = t.id;
      }
    }
  }

  for (const ticket of tickets) {
    const nodeIds = ticket.nodeIds || [];
    const nodeSet = new Set(nodeIds);
    const mergedContracts = [];

    for (const edge of edges) {
      const fromInTicket = nodeSet.has(edge.from);
      const toInTicket = nodeSet.has(edge.to);

      // Only consider edges where at least one end is in this ticket
      if (!fromInTicket && !toInTicket) continue;

      const edgeContracts = edge.contracts || [];

      for (const contract of edgeContracts) {
        // Internal closure: source.postcondition === target.precondition
        // AND both ends are within the same ticket
        const isInternalClosure = fromInTicket && toInTicket
          && contract.postcondition === contract.precondition;

        if (isInternalClosure) {
          // This contract is internally resolved; do not expose externally
          continue;
        }

        // Determine sourceEdge label
        let sourceEdge;
        if (fromInTicket && toInTicket) {
          sourceEdge = edge.from + '→' + edge.to + ' (internal)';
        } else if (fromInTicket) {
          sourceEdge = edge.from + '→' + edge.to;
        } else {
          sourceEdge = edge.from + '→' + edge.to + ' (inbound)';
        }

        mergedContracts.push({
          id: contract.id,
          sourceEdge: sourceEdge,
          precondition: contract.precondition || '',
          postcondition: contract.postcondition || '',
          invariant: contract.invariant || ''
        });
      }
    }

    ticket.contracts = mergedContracts;
  }

  return tickets;
}

// [::TICKET::] PX-68, PX-69, PX-70, PX-71 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-68|PX-69|PX-70|PX-71) --for-spec --no-implementation-order`.
function main() {
  const { ticketsPath, graphPath } = parseArgs();

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

  // Process all phases and tickets
  for (const phase of ticketsData.phases) {
    if (phase.tickets) {
      mergeContracts(phase.tickets, graph);
    }
  }

  // Atomic write
  atomicWrite(ticketsPath, JSON.stringify(ticketsData, null, 2));

  // Report summary
  let totalContracts = 0;
  for (const phase of ticketsData.phases) {
    if (phase.tickets) {
      for (const t of phase.tickets) {
        totalContracts += (t.contracts || []).length;
      }
    }
  }
  console.log(JSON.stringify({ ok: true, ticketCount: ticketsData.phases.reduce((s, p) => s + (p.tickets ? p.tickets.length : 0), 0), totalContracts }));
}

if (require.main === module) main();
module.exports = { mergeContracts };
