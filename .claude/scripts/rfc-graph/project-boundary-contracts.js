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

/** The rows a note names, in registry order. */
// [::TICKET::] PX-312, PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313) --for-spec --no-implementation-order`.
function rowsOfNote(note, registry) {
  const parsed = parseBoundaryNoteRows(note);
  if (parsed === null) return null;
  const rows = parsed.ids.map((id) => (registry ?? []).find((row) => row.boundary_id === id));
  if (rows.some((row) => row === undefined)) return null;
  return { rows, digest: parsed.digest };
}

/**
 * Project the registry onto the graph without mutating the input.
 *
 * @param {{ graph: object, registry: Array<object> }} input
 * @returns {object} the projected graph
 */
// [::TICKET::] PX-312, PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313) --for-spec --no-implementation-order`.
function projectBoundaryContracts({ graph, registry = [] }) {
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
      const error = new Error(`${MESSAGES.BOUNDARY_NOTE_TOO_LONG}: ${edge.from}→${edge.to} carries ${rows.length} boundaries; write the sidecar and shorten the note`);
      error.code = MESSAGES.BOUNDARY_NOTE_TOO_LONG;
      throw error;
    }
    edge.attributes = { ...(edge.attributes ?? {}), note };
  }

  return next;
}

/**
 * Verify every registry boundary against the projected graph.
 *
 * @param {object} graph
 * @param {Array<object>} registry
 * @returns {Array<{ code: string, subject: string|null, message: string }>}
 */
// [::TICKET::] PX-312, PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313) --for-spec --no-implementation-order`.
function verifyBoundaryContracts(graph, registry = []) {
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
    const parsed = rowsOfNote(edge.attributes?.note, registry);
    if (parsed === null || !parsed.rows.some((candidate) => candidate.boundary_id === row.boundary_id)) {
      findings.push(finding(MESSAGES.BOUNDARY_CONTRACT_MISMATCH, ctrUnit, `edge note does not name ${row.boundary_id}`));
      continue;
    }
    if (parsed.digest !== noteForRows(parsed.rows).split('digest:')[1]) {
      findings.push(finding(MESSAGES.BOUNDARY_CONTRACT_MISMATCH, ctrUnit, `edge note digest does not match the named registry rows`));
    }
    if (!(edge.contracts ?? []).some((contract) => projectionMatches(contract, row))) {
      findings.push(finding(MESSAGES.BOUNDARY_CONTRACT_MISMATCH, ctrUnit, `edge has no contract matching the registry projection for ${row.boundary_id}`));
    }
  }
  return findings;
}

/** Parse `--name=value` or `--name value`. */
// [::TICKET::] PX-312, PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313) --for-spec --no-implementation-order`.
function argumentFor(argv, name) {
  const inline = argv.find((entry) => entry.startsWith(`--${name}=`));
  if (inline !== undefined) return inline.slice(`--${name}=`.length);
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? null : argv[index + 1] ?? null;
}

/** Apply the projection through crud.js, one edge at a time. */
// [::TICKET::] PX-312, PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313) --for-spec --no-implementation-order`.
function attachThroughCrud(graphPath, graph, registry) {
  const before = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  const projected = projectBoundaryContracts({ graph: before, registry });
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

// [::TICKET::] PX-312, PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313) --for-spec --no-implementation-order`.
function main(argv = process.argv.slice(2)) {
  const graphPath = argumentFor(argv, 'graph');
  const registryPath = argumentFor(argv, 'registry');
  const mode = argumentFor(argv, 'mode') ?? 'attach';
  const sidecarPath = argumentFor(argv, 'sidecar');
  if (graphPath === null || registryPath === null) {
    console.error('[ERROR] --graph=<GRAPH.json> and --registry=<ALLOCATE-MANIFEST.json> are required');
    console.error('Cause: missing argument');
    console.error('Action: supply both paths');
    return EXIT_FAILURE;
  }
  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const registry = Array.isArray(manifest) ? manifest : manifest.contract_registry ?? [];

  if (mode === 'verify') {
    const findings = verifyBoundaryContracts(graph, registry);
    for (const entry of findings) console.error(`${entry.code}: ${entry.subject}: ${entry.message}`);
    console.log(JSON.stringify({ ok: findings.length === 0, findings }));
    return findings.length === 0 ? EXIT_OK : EXIT_FAILURE;
  }

  const projected = attachThroughCrud(graphPath, graph, registry);
  if (sidecarPath !== null) {
    const table = Object.fromEntries(registry.map((row, index) => [row.boundary_id, {
      contractId: contractIdFor(index),
      clauseDigest: boundaryClauseDigest(row),
      clauses: row.clauses,
    }]));
    fs.writeFileSync(sidecarPath, `${JSON.stringify({ schemaVersion: 1, boundaries: table }, null, 2)}\n`);
  }
  console.log(JSON.stringify({ ok: true, projectedEdges: (projected.edges ?? []).length, boundaries: registry.length }));
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
};
