#!/usr/bin/env node

/**
 * merge-contracts-to-tickets.js — Merge edge contracts into ticket contracts
 *
 * Usage: node merge-contracts-to-tickets.js <Tickets.json> [GRAPH.json] [--registry=<ALLOCATE-MANIFEST.json>]
 *
 * The graph is derived from the Tickets directory when omitted; the registry is
 * discovered at the nearest workspace ancestor when omitted.
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
const { isUnitId } = require('../rfc-graph/lib/unit-ids.mjs');
const {
  boundaryClauseDigest,
  canonicalClauseJoin,
  projectionMatches,
} = require('../sequences-slice/lib/boundary-contract.mjs');
const {
  readStepContractSidecar,
  stepContractEntry,
} = require('../rfc-graph/lib/step-contracts.mjs');
const {
  deriveGraphPathFromTickets,
  findAllocateManifest,
} = require('../lib/package-artifacts');

/**
 * Parse CLI arguments
 */
// [::TICKET::] PX-68, PX-69, PX-70, PX-71, PX-306, PX-318 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-68|PX-69|PX-70|PX-71|PX-306|PX-318) --for-spec --no-implementation-order`.
function parseArgs(argv = process.argv.slice(2)) {
  const args = argv.filter((entry) => !entry.startsWith('--registry=') && !entry.startsWith('--step-sidecar='));
  const registryArg = argv.find((entry) => entry.startsWith('--registry='));
  const stepSidecarArg = argv.find((entry) => entry.startsWith('--step-sidecar='));
  if (args.length < 1) {
    console.error('[ERROR] Usage: merge-contracts-to-tickets.js <Tickets.json> [GRAPH.json] [--registry=<ALLOCATE-MANIFEST.json>] [--step-sidecar=<RFC-STEP-CONTRACTS.json>]');
    console.error('Cause: Missing arguments');
    console.error('Action: Provide the Tickets.json path');
    process.exit(1);
  }
  const ticketsPath = path.resolve(args[0]);
  const graphPath = args.length >= 2
    ? path.resolve(args[1])
    : deriveGraphPathFromTickets(ticketsPath);
  if (!graphPath) {
    console.error('[ERROR] Cannot derive GRAPH.json beside ' + ticketsPath);
    console.error('Action: pass GRAPH.json explicitly or keep exactly one *-GRAPH.json beside Tickets.json');
    process.exit(1);
  }
  const defaultStepSidecar = path.join(path.dirname(graphPath), 'RFC-STEP-CONTRACTS.json');
  return {
    ticketsPath,
    graphPath,
    registryPath: registryArg === undefined
      ? findAllocateManifest(path.dirname(ticketsPath))
      : path.resolve(registryArg.slice('--registry='.length)),
    stepSidecarPath: stepSidecarArg === undefined
      ? (fs.existsSync(defaultStepSidecar) ? defaultStepSidecar : null)
      : path.resolve(stepSidecarArg.slice('--step-sidecar='.length)),
  };
}

/** The contract rows an allocate manifest declares, or an empty list without a manifest. */
// [::TICKET::] PX-306, PX-312, PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-306|PX-312|PX-313) --for-spec --no-implementation-order`.
function registryContracts(registryPath) {
  if (registryPath === null || !fs.existsSync(registryPath)) return [];
  const document = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  return (document.contract_registry || []).filter((row) => typeof row?.boundary_id === 'string');
}

/**
 * Atomic write using temp file + rename
 */
// [::TICKET::] PX-68, PX-69, PX-70, PX-71, PX-314 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-68|PX-69|PX-70|PX-71|PX-314) --for-spec --no-implementation-order`.
function atomicWrite(targetPath, serializedTickets) {
  const tmpPath = targetPath + '.tmp.' + process.pid;
  fs.writeFileSync(tmpPath, serializedTickets, 'utf8');
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
// [::TICKET::] PX-68, PX-69, PX-70, PX-71, PX-312, PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-68|PX-69|PX-70|PX-71|PX-312|PX-313) --for-spec --no-implementation-order`.
/** A registry entry may be a full row or a legacy boundary id. */
function normalizeRegistryContracts(registry) {
  return (registry ?? []).map((entry) => (typeof entry === 'string'
    ? { boundary_id: entry, clauses: null }
    : entry));
}

/** The registry contracts a ticket owes for the ctr units it carries. */
// [::TICKET::] PX-312, PX-313, PX-326 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313|PX-326) --for-spec --no-implementation-order`.
function registryContractsForTicket(ticket, registry) {
  const unitIds = [
    ...(ticket.nodeIds ?? []),
    ...(ticket.distribution?.units ?? []).map((unit) => unit.unitId),
  ];
  const contracts = [];
  for (const row of normalizeRegistryContracts(registry)) {
    if (!unitIds.includes(`ctr-${row.boundary_id}`)) continue;
    const registryContractId = `contract-${row.boundary_id}`;
    contracts.push({
      id: registryContractId,
      // A registry contract has no graph edge, so its provenance is the boundary it
      // projects. validate-tickets requires a non-empty sourceEdge for every contract.
      sourceEdge: `boundary:${row.boundary_id}`,
      boundaryId: row.boundary_id,
      registryContractId,
      clauseDigest: row.clauses === null ? null : boundaryClauseDigest(row),
      precondition: row.clauses === null ? '' : canonicalClauseJoin(row.clauses.preconditions),
      postcondition: row.clauses === null ? '' : canonicalClauseJoin(row.clauses.postconditions),
      invariant: row.clauses === null ? '' : canonicalClauseJoin(row.clauses.invariants),
      clauses: row.clauses,
    });
  }
  return contracts;
}

/**
 * Merge edge contracts and registry boundary contracts into each ticket.
 *
 * @param {Array<object>} tickets
 * @param {object} graph
 * @param {Array<object|string>} registryContracts
 * @returns {Array<object>}
 */
// [::TICKET::] PX-312, PX-313, PX-318 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313|PX-318) --for-spec --no-implementation-order`.
function mergeContracts(tickets, graph, registryContracts = [], stepSidecar = null) {
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

    for (const contract of registryContractsForTicket(ticket, registryContracts)) {
      const existing = mergedContracts.findIndex((entry) => entry.registryContractId === contract.registryContractId);
      if (existing >= 0) mergedContracts[existing] = contract;
      else mergedContracts.push(contract);
    }

    if (stepSidecar !== null) {
      const unitIds = (ticket.distribution?.units ?? []).map((unit) => unit.unitId);
      for (const [index, row] of (stepSidecar.steps ?? []).entries()) {
        const carriesRow = (row.nodeIds ?? []).some((nodeId) => nodeSet.has(nodeId))
          || unitIds.includes(`seq-${row.sequenceId}`)
          || unitIds.includes(`xdir-${row.sequenceId}`);
        if (!carriesRow) continue;
        if (mergedContracts.some((entry) => entry.stepId === row.stepId)) continue;
        mergedContracts.push(stepContractEntry(row, index));
      }
    }

    ticket.contracts = mergedContracts;
  }

  return tickets;
}

/**
 * Verify the boundary contracts after merging (PX-306 @verifies C003).
 *
 * A ticket that carries a `ctr-` unit must carry a contract, and every contract must name
 * an edge the graph holds or a boundary the allocate registry declares. The merge copies
 * edge contracts, so a missing one means the graph never had it; an invented one means the
 * ticket was written by hand after the merge.
 *
 * @param {Array} tickets
 * @param {Object} graph
 * @param {string[]} [registryBoundaryIds]
 * @returns {Array<{code: string, ticketId: number|null, boundaryId?: string, contractId?: string}>}
 */
// [::TICKET::] PX-306, PX-312, PX-313, PX-318, PX-322 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-306|PX-312|PX-313|PX-318|PX-322) --for-spec --no-implementation-order`.
function verifyMergedBoundaryContracts(tickets, graph, registryContracts = [], stepSidecar = null) {
  const findings = [];
  const edgeLabels = new Set((graph.edges || []).map((edge) => edge.from + '→' + edge.to));
  const rows = normalizeRegistryContracts(registryContracts);
  const rowById = new Map(rows.map((row) => [row.boundary_id, row]));
  const registryIds = new Set(rows.map((row) => row.boundary_id));
  const stepEntries = new Map((stepSidecar?.steps ?? []).map((row, index) => [row.stepId, stepContractEntry(row, index)]));
  for (const ticket of tickets) {
    const unitIds = (ticket.nodeIds || []).filter(isUnitId);
    const contracts = Array.isArray(ticket.contracts) ? ticket.contracts : [];
    const seenContractIds = new Set();
    for (const contract of contracts) {
      if (typeof contract?.id !== 'string') continue;
      if (seenContractIds.has(contract.id)) {
        findings.push({ code: 'DUPLICATE_CONTRACT_ID', ticketId: ticket.id, contractId: contract.id });
      }
      seenContractIds.add(contract.id);
    }
    for (const unitId of unitIds.filter((entry) => entry.startsWith('ctr-'))) {
      const boundaryId = unitId.slice('ctr-'.length);
      const row = rowById.get(boundaryId);
      const contract = contracts.find((entry) => entry.boundaryId === boundaryId
        || entry.registryContractId === `contract-${boundaryId}`
        || entry.id === `contract-${boundaryId}`);
      if (row !== undefined && row.clauses !== null) {
        if (contract === undefined) {
          findings.push({ code: 'MISSING_BOUNDARY_CONTRACT', ticketId: ticket.id, boundaryId });
        } else if (contract.clauseDigest !== boundaryClauseDigest(row) || !projectionMatches(contract, row)) {
          findings.push({ code: 'BOUNDARY_CONTRACT_MISMATCH', ticketId: ticket.id, boundaryId });
        }
        continue;
      }
      // Legacy boundary ids carry no clauses; the pre-existing rule is that any merged
      // contract may stand for the boundary.
      if (contracts.length === 0) {
        findings.push({ code: 'MISSING_BOUNDARY_CONTRACT', ticketId: ticket.id, boundaryId });
      }
    }
    for (const contract of contracts) {
      const stepEntry = typeof contract.stepId === 'string' ? stepEntries.get(contract.stepId) : undefined;
      if (typeof contract.stepId === 'string') {
        if (stepEntry === undefined) {
          findings.push({ code: 'INVENTED_TICKET_CONTRACT', ticketId: ticket.id, contractId: contract.id || null });
        } else if (contract.digest !== stepEntry.digest
            || contract.precondition !== stepEntry.precondition
            || contract.postcondition !== stepEntry.postcondition
            || contract.invariant !== stepEntry.invariant) {
          findings.push({ code: 'STEP_CONTRACT_MISMATCH', ticketId: ticket.id, contractId: contract.stepId });
        }
        continue;
      }
      const label = String(contract.sourceEdge || '').replace(/\s*\((?:internal|inbound)\)\s*$/i, '').trim();
      const registryMatch = registryIds.has(contract.boundaryId)
        || (typeof contract.registryContractId === 'string'
          && [...registryIds].some((boundaryId) => contract.registryContractId === `contract-${boundaryId}`))
        || [...registryIds].some((boundaryId) => contract.id === `contract-${boundaryId}` || contract.id === boundaryId);
      if (!edgeLabels.has(label) && !registryMatch) {
        findings.push({ code: 'INVENTED_TICKET_CONTRACT', ticketId: ticket.id, contractId: contract.id || null });
      }
    }
  }

  // The loop above proves every ticket contract has a source. This loop proves the
  // reverse: every sidecar row reached at least one ticket. A merge that dropped a row
  // would otherwise leave the chain green.
  const ticketStepContracts = new Map();
  for (const ticket of tickets) {
    for (const contract of Array.isArray(ticket.contracts) ? ticket.contracts : []) {
      if (typeof contract?.stepId === 'string') ticketStepContracts.set(contract.stepId, contract);
    }
  }
  for (const [index, row] of (stepSidecar?.steps ?? []).entries()) {
    const contract = ticketStepContracts.get(row.stepId);
    if (contract === undefined) {
      findings.push({ code: 'CONTRACT_CHAIN_OPEN', ticketId: null, stepId: row.stepId });
      continue;
    }
    const expected = stepContractEntry(row, index);
    if (contract.digest !== expected.digest
        || contract.precondition !== expected.precondition
        || contract.postcondition !== expected.postcondition
        || contract.invariant !== expected.invariant) {
      findings.push({ code: 'STEP_CONTRACT_MISMATCH', ticketId: null, stepId: row.stepId });
    }
  }
  return findings;
}

// [::TICKET::] PX-68, PX-69, PX-70, PX-71, PX-306, PX-312, PX-313, PX-314, PX-318 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-68|PX-69|PX-70|PX-71|PX-306|PX-312|PX-313|PX-314|PX-318) --for-spec --no-implementation-order`.
function main() {
  const { ticketsPath, graphPath, registryPath, stepSidecarPath } = parseArgs();

  if (!fs.existsSync(ticketsPath)) {
    console.error('[ERROR] Tickets.json not found: ' + ticketsPath);
    process.exit(1);
  }
  if (!fs.existsSync(graphPath)) {
    console.error('[ERROR] GRAPH.json not found: ' + graphPath);
    process.exit(1);
  }
  if (registryPath !== null && !fs.existsSync(registryPath)) {
    console.error('[ERROR] MISSING_REGISTRY: the allocate manifest was discovered but is not readable: ' + registryPath);
    console.error('Cause: a workspacify workspace must not merge an empty registry');
    console.error('Action: restore WORKSPACIFY-ALLOCATE-MANIFEST.json or pass --registry=<path>');
    process.exit(1);
  }

  const ticketsData = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  const registry = registryContracts(registryPath);
  const stepSidecar = readStepContractSidecar(stepSidecarPath);

  // Process all phases and tickets
  const allTickets = [];
  for (const phase of ticketsData.phases) {
    if (phase.tickets) {
      mergeContracts(phase.tickets, graph, registry, stepSidecar);
      allTickets.push(...phase.tickets);
    }
  }

  // A boundary unit without its contract, or a contract with no source, is a finding.
  const findings = verifyMergedBoundaryContracts(allTickets, graph, registry, stepSidecar);
  if (findings.length > 0) {
    for (const finding of findings) {
      console.error('[ERROR] ' + finding.code + ': ' + JSON.stringify(finding));
      console.error('Cause: Boundary contract chain violation');
      console.error('Action: Fix the graph edge or the ticket nodeIds/contracts and re-run');
    }
    process.exit(1);
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
  process.stdout.write(`${JSON.stringify({ ok: true, ticketCount: ticketsData.phases.reduce((s, p) => s + (p.tickets ? p.tickets.length : 0), 0), totalContracts })}\n`);
}

if (require.main === module) main();
module.exports = { mergeContracts, verifyMergedBoundaryContracts, parseArgs };
