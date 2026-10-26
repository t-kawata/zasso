#!/usr/bin/env node
/**
 * project-boundary-contracts — bind every contract_registry row to its graph edge.
 *
 * The graph edge schema accepts only C### contract ids and four fields, so the registry
 * id and the full-clause digest travel in attributes.note. The projection is deterministic:
 * one C9xx id per registry row, the three projected clause fields, and one note that names
 * every boundary the edge carries. The script never writes the graph directly; attach
 * mode hands each changed edge to crud.js, the sole graph write path.
 *
 * Usage:
 *   node project-boundary-contracts.js --graph=<GRAPH.json> --registry=<ALLOCATE-MANIFEST.json> [--mode=attach|verify] [--sidecar=<path>]
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const {
  boundaryClauseDigest,
  boundaryContractProjection,
  boundaryNoteForRows,
  boundarySidecarNote,
  combinedBoundaryDigest,
  parseBoundaryNoteRows,
  projectionMatches,
} = require('../sequences-slice/lib/boundary-contract.mjs');

const EXIT_OK = 0;
const EXIT_FAILURE = 1;
const NOTE_LIMIT = 240;
const CONTRACT_ID_BASE = 900;

const MESSAGES = Object.freeze({
  MISSING_BOUNDARY_EDGE: 'MISSING_BOUNDARY_EDGE',
  CONTRACT_ID_COLLISION: 'CONTRACT_ID_COLLISION',
  BOUNDARY_NOTE_TOO_LONG: 'BOUNDARY_NOTE_TOO_LONG',
  MISSING_BOUNDARY_CONTRACT: 'MISSING_BOUNDARY_CONTRACT',
  BOUNDARY_CONTRACT_MISMATCH: 'BOUNDARY_CONTRACT_MISMATCH',
});

// [::TICKET::] PX-312, PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313) --for-spec --no-implementation-order`.
function finding(code, subject, message) {
  return { code, subject: subject ?? null, message };
}

// [::TICKET::] PX-312, PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313) --for-spec --no-implementation-order`.
function contractIdFor(index) {
  return `C${String(CONTRACT_ID_BASE + index).padStart(3, '0')}`;
}

/** The boundaries whose ctr unit is carried by either endpoint of an edge. */
// [::TICKET::] PX-312, PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313) --for-spec --no-implementation-order`.
function rowsOfEdge(edge, graph, registry) {
  const endpointNodeIds = new Set([edge.from, edge.to]);
  return (registry ?? []).filter((row) => (graph.nodes ?? []).some((node) => endpointNodeIds.has(node.id)
    && (node.unitIds ?? []).includes(`ctr-${row.boundary_id}`)));
}

/** The note that binds every boundary the edge carries. */
// [::TICKET::] PX-312, PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313) --for-spec --no-implementation-order`.
function noteForRows(rows) {
  return boundaryNoteForRows(rows);
}

/** The registry rows a parsed note resolves to, or null when one does not resolve. */
// [::TICKET::] PX-314 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-314 --for-spec --no-implementation-order`.
function rowsFromBoundaryNote(parsed, registry, sidecarPath, edgeKey = null) {
  if (parsed.sidecar === null) {
    const rows = parsed.ids.map((id) => (registry ?? []).find((row) => row.boundary_id === id));
    return rows.some((row) => row === undefined) ? null : rows;
  }
  const sidecar = readBoundarySidecar(sidecarPath ?? parsed.sidecar);
  if (sidecar === null || sidecar.boundaries === undefined) return null;
  const ids = sidecar.edges !== undefined && edgeKey !== null
    ? (sidecar.edges[edgeKey] ?? [])
    : Object.keys(sidecar.boundaries).sort();
  if (ids.length === 0) return null;
  const rows = ids.map((id) => (registry ?? []).find((row) => row.boundary_id === id));
  if (rows.some((row) => row === undefined)) return null;
  for (const row of rows) {
    const sidecarRow = sidecar.boundaries[row.boundary_id];
    if (sidecarRow === undefined
        || sidecarRow.clauseDigest !== boundaryClauseDigest(row)
        || JSON.stringify(sidecarRow.clauses) !== JSON.stringify(row.clauses)) {
      return null;
    }
  }
  return rows;
}

/** Write the full clause table that a too-long note can no longer carry inline. */
// [::TICKET::] PX-314 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-314 --for-spec --no-implementation-order`.
function writeBoundarySidecar(sidecarPath, registry, rowsByEdge) {
  const boundaries = Object.fromEntries((registry ?? []).map((row, index) => [row.boundary_id, {
    contractId: contractIdFor(index),
    clauseDigest: boundaryClauseDigest(row),
    clauses: row.clauses,
  }]));
  const edges = Object.fromEntries([...rowsByEdge.entries()].map(([edgeKey, rows]) => [
    edgeKey,
    (rows ?? []).map((row) => row.boundary_id),
  ]));
  fs.writeFileSync(sidecarPath, `${JSON.stringify({ schemaVersion: 1, boundaries, edges }, null, 2)}\n`);
}

/**
 * Project the registry onto the graph without mutating the input.
 *
 * @param {{ graph: object, registry: Array<object>, sidecarPath?: string|null }} input
 * @returns {object} the projected graph
 */
// [::TICKET::] PX-312, PX-313, PX-314 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313|PX-314) --for-spec --no-implementation-order`.
function projectBoundaryContracts({ graph, registry = [], sidecarPath = null }) {
  const next = JSON.parse(JSON.stringify(graph));
  const rowsByEdge = new Map();
  for (const edge of next.edges ?? []) {
    rowsByEdge.set(`${edge.from}→${edge.to}(${edge.type})`, rowsOfEdge(edge, next, registry));
  }

  for (const [index, row] of registry.entries()) {
    const ctrUnit = `ctr-${row.boundary_id}`;
    const ctrNodes = (next.nodes ?? []).filter((node) => (node.unitIds ?? []).includes(ctrUnit));
    const edge = (next.edges ?? []).find((candidate) => ctrNodes.some((node) => candidate.from === node.id || candidate.to === node.id));
    if (edge === undefined) {
      const error = new Error(`${MESSAGES.MISSING_BOUNDARY_EDGE}: ${row.boundary_id} has no edge touching its ctr node`);
      error.code = MESSAGES.MISSING_BOUNDARY_EDGE;
      throw error;
    }
    const contractId = contractIdFor(index);
    const projected = boundaryContractProjection(row, contractId);
    const existing = edge.contracts.findIndex((contract) => contract.id === contractId);
    if (existing >= 0 && !projectionMatches(edge.contracts[existing], row)) {
      const error = new Error(`${MESSAGES.CONTRACT_ID_COLLISION}: ${contractId} is already used by a different contract`);
      error.code = MESSAGES.CONTRACT_ID_COLLISION;
      throw error;
    }
    if (existing >= 0) edge.contracts[existing] = projected;
    else edge.contracts.push(projected);
  }

  for (const edge of next.edges ?? []) {
    const rows = rowsByEdge.get(`${edge.from}→${edge.to}(${edge.type})`) ?? [];
    if (rows.length === 0) continue;
    const note = noteForRows(rows);
    if (note.length > NOTE_LIMIT) {
      if (sidecarPath === null) {
        const error = new Error(`${MESSAGES.BOUNDARY_NOTE_TOO_LONG}: ${edge.from}→${edge.to} carries ${rows.length} boundaries and no sidecar path was supplied`);
        error.code = MESSAGES.BOUNDARY_NOTE_TOO_LONG;
        throw error;
      }
      writeBoundarySidecar(sidecarPath, registry, rowsByEdge);
      edge.attributes = { ...(edge.attributes ?? {}), note: boundarySidecarNote(path.basename(sidecarPath), rows) };
      continue;
    }
    edge.attributes = { ...(edge.attributes ?? {}), note };
  }

  return next;
}

/** The sidecar document, or null when it is absent or unreadable. */
// [::TICKET::] PX-314 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-314 --for-spec --no-implementation-order`.
function readBoundarySidecar(sidecarPath) {
  if (sidecarPath === null || !fs.existsSync(sidecarPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Verify every registry boundary against the projected graph.
 *
 * @param {object} graph
 * @param {Array<object>} registry
 * @param {{ sidecarPath?: string|null }} [options]
 * @returns {Array<{ code: string, subject: string|null, message: string }>}
 */
// [::TICKET::] PX-312, PX-313, PX-314 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313|PX-314) --for-spec --no-implementation-order`.
function verifyBoundaryContracts(graph, registry = [], { sidecarPath = null } = {}) {
  const findings = [];
  for (const row of registry) {
    const ctrUnit = `ctr-${row.boundary_id}`;
    const ctrNodes = (graph?.nodes ?? []).filter((node) => (node.unitIds ?? []).includes(ctrUnit));
    if (ctrNodes.length === 0) {
      findings.push(finding(MESSAGES.MISSING_BOUNDARY_CONTRACT, ctrUnit, `registry boundary ${row.boundary_id} has no graph node`));
      continue;
    }
    const edge = (graph?.edges ?? []).find((candidate) => ctrNodes.some((node) => candidate.from === node.id || candidate.to === node.id));
    if (edge === undefined) {
      findings.push(finding(MESSAGES.MISSING_BOUNDARY_CONTRACT, ctrUnit, `registry boundary ${row.boundary_id} has no graph edge`));
      continue;
    }
    const parsed = parseBoundaryNoteRows(edge.attributes?.note);
    const edgeKey = `${edge.from}→${edge.to}(${edge.type})`;
    const noteRows = parsed === null ? null : rowsFromBoundaryNote(parsed, registry, sidecarPath, edgeKey);
    if (noteRows === null || !noteRows.some((candidate) => candidate.boundary_id === row.boundary_id)) {
      findings.push(finding(MESSAGES.BOUNDARY_CONTRACT_MISMATCH, ctrUnit, `edge note does not name ${row.boundary_id}`));
      continue;
    }
    if (parsed.digest !== combinedBoundaryDigest(noteRows)) {
      findings.push(finding(MESSAGES.BOUNDARY_CONTRACT_MISMATCH, ctrUnit, `edge note digest does not match the named registry rows`));
    }
    if (!(edge.contracts ?? []).some((contract) => projectionMatches(contract, row))) {
      findings.push(finding(MESSAGES.BOUNDARY_CONTRACT_MISMATCH, ctrUnit, `edge has no contract matching the registry projection for ${row.boundary_id}`));
    }
  }
  return findings;
}

/** Parse `--name=value` or `--name value`. */
// [::TICKET::] PX-312, PX-313, PX-314 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313|PX-314) --for-spec --no-implementation-order`.
function argumentFor(argv, name) {
  const inline = argv.find((entry) => entry.startsWith(`--${name}=`));
  if (inline !== undefined) return inline.slice(`--${name}=`.length);
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? null : argv[index + 1] ?? null;
}

/** Apply the projection through crud.js, one edge at a time. */
// [::TICKET::] PX-312, PX-313, PX-314 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313|PX-314) --for-spec --no-implementation-order`.
function attachThroughCrud(graphPath, graph, registry, sidecarPath = null) {
  const before = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  const projected = projectBoundaryContracts({ graph: before, registry, sidecarPath });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'boundary-contracts-'));
  const crudPath = path.join(__dirname, 'crud.js');
  try {
    for (const edge of projected.edges ?? []) {
      const original = before.edges.find((candidate) => candidate.from === edge.from && candidate.to === edge.to && candidate.type === edge.type);
      if (JSON.stringify(original) === JSON.stringify(edge)) continue;
      const patch = `${directory}/edge-${edge.from}-${edge.to}.json`;
      fs.writeFileSync(patch, JSON.stringify({
        from: edge.from,
        to: edge.to,
        type: edge.type,
        attributes: edge.attributes,
        contracts: edge.contracts,
      }, null, 2));
      execFileSync(process.execPath, [crudPath, `--graph=${graphPath}`, 'update-edge', `--file=${patch}`], { stdio: 'pipe' });
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  return projected;
}

// [::TICKET::] PX-312, PX-313, PX-314 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313|PX-314) --for-spec --no-implementation-order`.
function main(argv = process.argv.slice(2)) {
  const graphPath = argumentFor(argv, 'graph');
  const registryPath = argumentFor(argv, 'registry');
  const mode = argumentFor(argv, 'mode') ?? 'attach';
  if (graphPath === null || registryPath === null) {
    console.error('[ERROR] --graph=<GRAPH.json> and --registry=<ALLOCATE-MANIFEST.json> are required');
    console.error('Cause: missing argument');
    console.error('Action: supply both paths');
    return EXIT_FAILURE;
  }
  const sidecarPath = argumentFor(argv, 'sidecar') ?? path.join(path.dirname(graphPath), 'RFC-BOUNDARY-CONTRACTS.json');
  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const registry = Array.isArray(manifest) ? manifest : manifest.contract_registry ?? [];

  if (mode === 'verify') {
    const findings = verifyBoundaryContracts(graph, registry, { sidecarPath });
    for (const entry of findings) console.error(`${entry.code}: ${entry.subject}: ${entry.message}`);
    process.stdout.write(`${JSON.stringify({ ok: findings.length === 0, findings })}\n`);
    return findings.length === 0 ? EXIT_OK : EXIT_FAILURE;
  }

  const projected = attachThroughCrud(graphPath, graph, registry, sidecarPath);
  process.stdout.write(`${JSON.stringify({ ok: true, projectedEdges: (projected.edges ?? []).length, boundaries: registry.length, sidecar: fs.existsSync(sidecarPath) ? sidecarPath : null })}\n`);
  return EXIT_OK;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  projectBoundaryContracts,
  verifyBoundaryContracts,
  contractIdFor,
  noteForRows,
  rowsFromBoundaryNote,
  readBoundarySidecar,
};
