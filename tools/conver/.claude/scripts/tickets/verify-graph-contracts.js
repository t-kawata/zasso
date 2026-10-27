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
  carryingEdgeFor,
  combinedBoundaryDigest,
  parseBoundaryNoteRows,
  projectionMatches,
} = require('../sequences-slice/lib/boundary-contract.mjs');
const { rowsFromBoundaryNote } = require('../rfc-graph/project-boundary-contracts.js');
const { readStepContractSidecar, verifyStepContracts } = require('../rfc-graph/lib/step-contracts.mjs');
const { collectViewUnits, registryRowsForPackage } = require('../sequences-slice/lib/distribution-map.mjs');
const { findAllocateManifest } = require('../lib/package-artifacts');

/** Edge types that require non-empty contracts */
const TYPES_REQUIRING_CONTRACTS = ['depends_on', 'constrains', 'conflicts_with'];

/** Edge types that are optional (no contract requirement) */
const TYPES_OPTIONAL = ['references', 'refines', 'extends', 'supersedes', 'triggers', 'precedes', 'part_of', 'validates', 'implements'];

// [::TICKET::] PX-69, PX-70, PX-71, PX-306, PX-314, PX-318 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-69|PX-70|PX-71|PX-306|PX-314|PX-318) --for-spec --no-implementation-order`.
function parseArgs() {
  const args = process.argv.slice(2);
  let graphPath = null;
  let registryPath = null;
  let viewPath = null;
  let sidecarPath = null;
  let stepSidecarPath = null;
  for (const a of args) {
    if (a.startsWith('--graph=')) graphPath = path.resolve(a.slice('--graph='.length));
    if (a.startsWith('--registry=')) {
      const value = a.slice('--registry='.length);
      registryPath = value === '' ? '' : path.resolve(value);
    }
    if (a.startsWith('--view=')) {
      const value = a.slice('--view='.length);
      viewPath = value === '' ? null : path.resolve(value);
    }
    if (a.startsWith('--sidecar=')) {
      const value = a.slice('--sidecar='.length);
      sidecarPath = value === '' ? null : path.resolve(value);
    }
    if (a.startsWith('--step-sidecar=')) {
      const value = a.slice('--step-sidecar='.length);
      stepSidecarPath = value === '' ? null : path.resolve(value);
    }
  }
  if (graphPath === null) {
    console.error('[ERROR] --graph=<path> is required');
    console.error('Cause: Missing --graph argument');
    console.error('Action: Re-run with --graph=<path-to-GRAPH.json>');
    process.exit(1);
  }
  return { graphPath, registryPath, viewPath, sidecarPath, stepSidecarPath };
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
// [::TICKET::] PX-69, PX-70, PX-71, PX-306, PX-312, PX-313, PX-314, PX-315 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-69|PX-70|PX-71|PX-306|PX-312|PX-313|PX-314|PX-315) --for-spec --no-implementation-order`.
/** Every direction a view declares for a ctr unit, deduplicated. */
// [::TICKET::] PX-321 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-321 --for-spec --no-implementation-order`.
function directionsFor(view, unitId) {
  return [...new Set((collectViewUnits(view).get(unitId)?.records ?? [])
    .map((record) => record.direction)
    .filter((direction) => typeof direction === 'string'))];
}

// [::TICKET::] PX-315, PX-321 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-315|PX-321) --for-spec --no-implementation-order`.
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
    const directions = directionsFor(options.view, ctrUnit);
    const targets = directions.length > 0 ? directions : [null];
    const checkedEdges = new Set();
    for (const direction of targets) {
      const edge = carryingEdgeFor(graph, ctrNodes, row, { direction });
      if (edge === undefined) {
        errors.push({ edge: row.boundary_id, code: 'MISSING_BOUNDARY_CONTRACT', detail: 'no edge touches ' + ctrUnit });
        continue;
      }
      if (edge === null) {
        errors.push({ edge: row.boundary_id, code: 'AMBIGUOUS_BOUNDARY_EDGE', detail: 'more than one edge can carry ' + ctrUnit });
        continue;
      }
      const ctrOnFrom = ctrNodes.some((node) => node.id === edge.from);
      if (direction === 'provides' && !ctrOnFrom) {
        errors.push({ edge: row.boundary_id, code: 'BOUNDARY_DIRECTION_MISMATCH', detail: 'boundary is provided but the ctr node is not the edge source' });
      }
      if (direction === 'consumes' && ctrOnFrom) {
        errors.push({ edge: row.boundary_id, code: 'BOUNDARY_DIRECTION_MISMATCH', detail: 'boundary is consumed but the ctr node is the edge source' });
      }
      const edgeKey = `${edge.from}→${edge.to}(${edge.type})`;
      if (checkedEdges.has(edgeKey)) continue;
      checkedEdges.add(edgeKey);
      const note = parseBoundaryNoteRows(edge.attributes?.note);
      const namedRows = note === null
        ? null
        : rowsFromBoundaryNote(note, options.registryContracts ?? [], options.sidecarPath ?? null, edgeKey);
      const noteResolves = note !== null
        && namedRows !== null
        && namedRows.some((candidate) => candidate.boundary_id === row.boundary_id);
      if (!noteResolves || note.digest !== combinedBoundaryDigest(namedRows)) {
        errors.push({ edge: row.boundary_id, code: 'BOUNDARY_CONTRACT_MISMATCH', detail: 'edge note does not carry the registry id and clause digest' });
      }
      if (!(edge.contracts || []).some((contract) => projectionMatches(contract, row))) {
        errors.push({ edge: row.boundary_id, code: 'BOUNDARY_CONTRACT_MISMATCH', detail: 'edge has no contract matching the registry projection' });
      }
    }
  }

  return errors;
}

// [::TICKET::] PX-69, PX-70, PX-71, PX-306, PX-308, PX-312, PX-313, PX-314, PX-315, PX-318, PX-322 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-69|PX-70|PX-71|PX-306|PX-308|PX-312|PX-313|PX-314|PX-315|PX-318|PX-322) --for-spec --no-implementation-order`.
function main() {
  const { graphPath, registryPath, viewPath, sidecarPath: explicitSidecarPath, stepSidecarPath: explicitStepSidecarPath } = parseArgs();
  const sidecarPath = explicitSidecarPath ?? path.join(path.dirname(graphPath), 'RFC-BOUNDARY-CONTRACTS.json');
  if (viewPath !== null && !fs.existsSync(viewPath)) {
    console.error('[ERROR] MISSING_VIEW: --view was supplied but the package view is not readable: ' + viewPath);
    process.exit(1);
  }
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
  let scopedRows = rows;
  if (rows.length > 0) {
    if (viewPath !== null) {
      const view = JSON.parse(fs.readFileSync(viewPath, 'utf8'));
      scopedRows = registryRowsForPackage(rows, view.packageId);
    } else if (registryPath === null && findAllocateManifest(path.dirname(graphPath)) !== null) {
      console.error('[ERROR] MISSING_VIEW: a package graph inside a workspacify workspace needs --view=<SEQUENCES.json> to scope the registry rows');
      console.error('Cause: the workspace registry is global, and the graph carries only its package slice');
      console.error('Action: pass --view=<package>/SEQUENCES.json, or use a workspace-level graph');
      process.exit(1);
    }
  }
  const view = viewPath !== null && fs.existsSync(viewPath)
    ? JSON.parse(fs.readFileSync(viewPath, 'utf8'))
    : null;
  const errors = verifyGraphContracts(graph, {
    registryBoundaryIds: scopedRows.map((row) => row.boundary_id),
    registryContracts: scopedRows,
    sidecarPath,
    view,
  });

  const stepSidecarPath = explicitStepSidecarPath
    ?? path.join(path.dirname(graphPath), 'RFC-STEP-CONTRACTS.json');
  const viewHasSteps = view !== null
    && ['ownedSequenceUnits', 'crossBoundarySequenceUnits'].some((field) =>
      (Array.isArray(view?.[field]) ? view[field] : []).some((unit) => Array.isArray(unit?.steps) && unit.steps.length > 0));
  if (viewHasSteps && !fs.existsSync(stepSidecarPath)) {
    errors.push({
      edge: 'step-contracts',
      code: 'CONTRACT_CHAIN_OPEN',
      detail: 'the view carries step-bearing sequences and the step-contract sidecar is missing',
    });
  } else if (view !== null && fs.existsSync(stepSidecarPath)) {
    const stepFindings = verifyStepContracts({
      view,
      graph,
      sidecar: readStepContractSidecar(stepSidecarPath),
    });
    for (const finding of stepFindings) {
      errors.push({ edge: finding.subject ?? 'step-contracts', code: finding.code, detail: finding.message });
    }
  }
  if (errors.length > 0) {
    for (const err of errors) {
      console.error('[ERROR] Edge ' + err.edge + ': ' + err.detail);
      console.error('Cause: Contract consistency violation');
      console.error('Action: Fix the edge contract and re-run graphify');
    }
    process.exit(1);
  }
  const graphEdges = graph.edges || [];
  process.stdout.write(`${JSON.stringify({ ok: true, edgeCount: graphEdges.length })}\n`);
  process.exit(0);
}

if (require.main === module) main();
module.exports = { verifyGraphContracts, resolveRegistryPath, TYPES_REQUIRING_CONTRACTS, TYPES_OPTIONAL };
