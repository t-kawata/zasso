#!/usr/bin/env node

/**
 * verify-graph-contracts.js — Verify graph-level contract consistency (Gate L1)
 *
 * Usage: node verify-graph-contracts.js --graph=<path>
 *
 * Verifies:
 * 1. All edges have contracts[] (non-empty for depends_on/constrains/conflicts_with)
 * 2. All contract fields (precondition/postcondition/invariant) are non-empty
 * 3. No duplicate contract IDs across the graph
 * 4. Edge type vs contract consistency
 *
 * Exits 0 on pass, 1 on failure. 3-line error template on stderr.
 *
 * [::TICKET::] PX-69: Gate L1 + Gate M
 */

const fs = require('fs');
const path = require('path');

const {
  boundaryNoteForRows,
  parseBoundaryNoteRows,
  projectionMatches,
} = require('../sequences-slice/lib/boundary-contract.mjs');
const { findAllocateManifest } = require('../lib/package-artifacts');

/** Edge types that require non-empty contracts */
const TYPES_REQUIRING_CONTRACTS = ['depends_on', 'constrains', 'conflicts_with'];

/** Edge types that are optional (no contract requirement) */
const TYPES_OPTIONAL = ['references', 'refines', 'extends', 'supersedes', 'triggers', 'precedes', 'part_of', 'validates', 'implements'];

// [::TICKET::] PX-69, PX-70, PX-71, PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-69|PX-70|PX-71|PX-306) --for-spec --no-implementation-order`.
function parseArgs() {
  const args = process.argv.slice(2);
  let graphPath = null;
  let registryPath = null;
  for (const a of args) {
    if (a.startsWith('--graph=')) graphPath = path.resolve(a.slice('--graph='.length));
    if (a.startsWith('--registry=')) registryPath = path.resolve(a.slice('--registry='.length));
  }
  if (graphPath === null) {
    console.error('[ERROR] --graph=<path> is required');
    console.error('Cause: Missing --graph argument');
    console.error('Action: Re-run with --graph=<path-to-GRAPH.json>');
    process.exit(1);
  }
  return { graphPath, registryPath };
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
 * The registry the graph stage should read, discovering the workspace's allocate manifest
 * when no explicit path was given.
 *
 * The graph lives inside a package directory; the manifest lives at the nearest ancestor
 * holding both workspace manifests. Discovery makes the boundary check part of the stage,
 * and a graph outside a workspace keeps the check skipped rather than failing.
 *
 * @param {string} graphPath
 * @param {string|null} registryPath
 * @returns {string|null}
 */
// [::TICKET::] PX-308 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-308 --for-spec --no-implementation-order`.
function resolveRegistryPath(graphPath, registryPath) {
  if (registryPath !== null && registryPath !== undefined) return registryPath;
  return findAllocateManifest(path.dirname(graphPath));
}

/**
 * Verify graph contract consistency
 * @param {object} graph — Parsed GRAPH.json
 * @returns {Array<{edge: string, detail: string}>} — Errors (empty array = pass)
 */
// [::TICKET::] PX-69, PX-70, PX-71, PX-306, PX-312, PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-69|PX-70|PX-71|PX-306|PX-312|PX-313) --for-spec --no-implementation-order`.
function verifyGraphContracts(graph, options = {}) {
  const errors = [];
  const seenIds = {};
  const edges = graph.edges || [];

  for (const edge of edges) {
    const tag = (edge.from || '?') + '→' + (edge.to || '?') + '(' + (edge.type || '?') + ')';

    // Check 1: contracts existence
    if (!edge.contracts) {
      if (TYPES_REQUIRING_CONTRACTS.includes(edge.type)) {
        errors.push({ edge: tag, detail: 'contracts missing; type "' + edge.type + '" requires non-empty contracts' });
      }
      // For optional types, missing contracts is acceptable
      continue;
    }

    if (!Array.isArray(edge.contracts)) {
      errors.push({ edge: tag, detail: 'contracts must be an array' });
      continue;
    }

    if (edge.contracts.length === 0) {
      if (TYPES_REQUIRING_CONTRACTS.includes(edge.type)) {
        errors.push({ edge: tag, detail: 'contracts empty; type "' + edge.type + '" requires non-empty contracts' });
      }
      continue;
    }

    // Check 2: contract field non-empty + Check 3: ID uniqueness
    for (const c of edge.contracts) {
      const cp = tag + '.contracts[' + (edge.contracts.indexOf(c)) + ']';
      if (typeof c.precondition !== 'string' || c.precondition.length < 1) {
        errors.push({ edge: cp, detail: 'precondition must be non-empty string' });
      }
      if (typeof c.postcondition !== 'string' || c.postcondition.length < 1) {
        errors.push({ edge: cp, detail: 'postcondition must be non-empty string' });
      }
      if (typeof c.invariant !== 'string' || c.invariant.length < 1) {
        errors.push({ edge: cp, detail: 'invariant must be non-empty string' });
      }
      if (c.id) {
        if (seenIds[c.id]) {
          errors.push({ edge: cp, detail: 'duplicate contract id "' + c.id + '"' });
        } else {
          seenIds[c.id] = true;
        }
      }
    }
  }

  // Check 4 (PX-306 @verifies C003): every registry boundary reaches a node and a contract edge.
  for (const boundaryId of options.registryBoundaryIds || []) {
    const unitId = 'ctr-' + boundaryId;
    const nodes = (graph.nodes || []).filter((node) => Array.isArray(node.unitIds) && node.unitIds.includes(unitId));
    if (nodes.length === 0) {
      errors.push({ edge: boundaryId, code: 'MISSING_BOUNDARY_CONTRACT', detail: 'no graph node carries ' + unitId });
      continue;
    }
    const nodeIds = new Set(nodes.map((node) => node.id));
    const contracted = edges.some((edge) => (nodeIds.has(edge.from) || nodeIds.has(edge.to))
      && Array.isArray(edge.contracts) && edge.contracts.length > 0);
    if (!contracted) {
      errors.push({ edge: boundaryId, code: 'MISSING_BOUNDARY_CONTRACT', detail: 'the node carrying ' + unitId + ' has no contract edge' });
    }
  }

  // Strict registry rows: the graph edge must carry the projected clauses and the
  // registry note digest. Legacy boundary ids without clauses keep the presence check.
  for (const row of options.registryContracts ?? []) {
    if (row?.clauses === null || row?.clauses === undefined) continue;
    const ctrUnit = `ctr-${row.boundary_id}`;
    const ctrNodes = (graph.nodes || []).filter((node) => Array.isArray(node.unitIds) && node.unitIds.includes(ctrUnit));
    if (ctrNodes.length === 0) {
      errors.push({ edge: row.boundary_id, code: 'MISSING_BOUNDARY_CONTRACT', detail: 'no graph node carries ' + ctrUnit });
      continue;
    }
    const edge = edges.find((candidate) => ctrNodes.some((node) => candidate.from === node.id || candidate.to === node.id));
    if (edge === undefined) {
      errors.push({ edge: row.boundary_id, code: 'MISSING_BOUNDARY_CONTRACT', detail: 'no edge touches ' + ctrUnit });
      continue;
    }
    const note = parseBoundaryNoteRows(edge.attributes?.note);
    const namedRows = note === null
      ? []
      : note.ids.map((boundaryId) => (options.registryContracts ?? []).find((candidate) => candidate.boundary_id === boundaryId));
    const noteResolves = note !== null
      && note.ids.includes(row.boundary_id)
      && namedRows.every((candidate) => candidate !== undefined);
    if (!noteResolves || note.digest !== boundaryNoteForRows(namedRows).split('digest:')[1]) {
      errors.push({ edge: row.boundary_id, code: 'BOUNDARY_CONTRACT_MISMATCH', detail: 'edge note does not carry the registry id and clause digest' });
    }
    if (!(edge.contracts || []).some((contract) => projectionMatches(contract, row))) {
      errors.push({ edge: row.boundary_id, code: 'BOUNDARY_CONTRACT_MISMATCH', detail: 'edge has no contract matching the registry projection' });
    }
  }

  return errors;
}

// [::TICKET::] PX-69, PX-70, PX-71, PX-306, PX-308, PX-312, PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-69|PX-70|PX-71|PX-306|PX-308|PX-312|PX-313) --for-spec --no-implementation-order`.
function main() {
  const { graphPath, registryPath } = parseArgs();
  if (!fs.existsSync(graphPath)) {
    console.error('[ERROR] Graph file not found: ' + graphPath);
    process.exit(1);
  }
  let graph;
  try { graph = JSON.parse(fs.readFileSync(graphPath, 'utf8')); }
  catch (e) {
    console.error('[ERROR] Failed to parse graph JSON: ' + e.message);
    process.exit(1);
  }
  const registryPathResolved = resolveRegistryPath(graphPath, registryPath);
  const rows = registryContracts(registryPathResolved);
  const errors = verifyGraphContracts(graph, {
    registryBoundaryIds: rows.map((row) => row.boundary_id),
    registryContracts: rows,
  });
  if (errors.length > 0) {
    for (const err of errors) {
      console.error('[ERROR] Edge ' + err.edge + ': ' + err.detail);
      console.error('Cause: Contract consistency violation');
      console.error('Action: Fix the edge contract and re-run graphify');
    }
    process.exit(1);
  }
  const graphEdges = graph.edges || [];
  console.log(JSON.stringify({ ok: true, edgeCount: graphEdges.length }));
  process.exit(0);
}

if (require.main === module) main();
module.exports = { verifyGraphContracts, resolveRegistryPath, TYPES_REQUIRING_CONTRACTS, TYPES_OPTIONAL };
