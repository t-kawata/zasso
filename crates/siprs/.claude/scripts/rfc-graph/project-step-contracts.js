#!/usr/bin/env node

/**
 * project-step-contracts — bind every artifact step contract to its operation node.
 *
 * The graph node carries the operation unit; this script writes the deterministic sidecar
 * and a short `step:<stepId>;row:<n>` note on an edge incident to that node. The sidecar
 * holds the full contract, so the edge note stays under the 240-character schema limit.
 *
 * Usage:
 *   node project-step-contracts.js --graph=<GRAPH.json> --view=<SEQUENCES.json> [--sidecar=<path>] [--mode=attach|verify]
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const {
  projectStepContracts,
  readStepContractSidecar,
  stepContractNote,
  verifyStepContracts,
  writeStepContractSidecar,
} = require('./lib/step-contracts.mjs');

const EXIT_OK = 0;
const EXIT_FAILURE = 1;
const NOTE_LIMIT = 240;

/** Parse `--name=value` or `--name value`. */
// [::TICKET::] PX-318 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-318) --for-spec --no-implementation-order`.
function argumentFor(argv, name) {
  const inline = argv.find((entry) => entry.startsWith(`--${name}=`));
  if (inline !== undefined) return inline.slice(`--${name}=`.length);
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? null : argv[index + 1] ?? null;
}

/** The edge a row may bind to: an incident edge, preferring one already carrying a step note. */
// [::TICKET::] PX-318 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-318) --for-spec --no-implementation-order`.
function edgeForRow(graph, row) {
  const incident = (graph.edges ?? []).filter((edge) =>
    (row.nodeIds ?? []).includes(edge.from) || (row.nodeIds ?? []).includes(edge.to));
  return incident.find((edge) => String(edge.attributes?.note ?? '').includes('step:')) ?? incident[0];
}

/** Append one row's note to the edge, preserving any registry note. */
// [::TICKET::] PX-318 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-318) --for-spec --no-implementation-order`.
function appendNote(edge, stepId, rowIndex) {
  const parts = String(edge.attributes?.note ?? '')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
  const note = stepContractNote(stepId, rowIndex);
  if (!parts.includes(note)) parts.push(note);
  const combined = parts.join('|');
  if (combined.length > NOTE_LIMIT) {
    const error = new Error(`STEP_NOTE_TOO_LONG: ${edge.from}→${edge.to} cannot carry ${stepId}`);
    error.code = 'STEP_NOTE_TOO_LONG';
    throw error;
  }
  return combined;
}

/** Apply the step notes through crud.js, the sole graph write path. */
// [::TICKET::] PX-318 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-318) --for-spec --no-implementation-order`.
function attachNotes(graphPath, sidecar) {
  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  const patched = new Map();
  for (const [index, row] of (sidecar.steps ?? []).entries()) {
    const edge = edgeForRow(graph, row);
    if (edge === undefined) {
      const error = new Error(`CONTRACT_CHAIN_OPEN: no edge is incident to ${row.nodeIds.join(', ')}`);
      error.code = 'CONTRACT_CHAIN_OPEN';
      throw error;
    }
    const key = `${edge.from}→${edge.to}(${edge.type})`;
    const current = patched.get(key) ?? edge;
    current.attributes = {
      ...(current.attributes ?? {}),
      note: appendNote(current, row.stepId, index),
    };
    patched.set(key, current);
  }

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'step-contracts-'));
  const crudPath = path.join(__dirname, 'crud.js');
  try {
    for (const edge of patched.values()) {
      const patch = path.join(directory, `edge-${edge.from}-${edge.to}-${edge.type}.json`);
      fs.writeFileSync(patch, JSON.stringify({
        from: edge.from,
        to: edge.to,
        type: edge.type,
        attributes: edge.attributes,
        contracts: edge.contracts ?? [],
      }, null, 2));
      execFileSync(process.execPath, [crudPath, `--graph=${graphPath}`, 'update-edge', `--file=${patch}`], { stdio: 'pipe' });
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

/** Entry point. */
// [::TICKET::] PX-318 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-318) --for-spec --no-implementation-order`.
function main(argv = process.argv.slice(2)) {
  const graphPath = argumentFor(argv, 'graph');
  const viewPath = argumentFor(argv, 'view');
  const mode = argumentFor(argv, 'mode') ?? 'attach';
  if (graphPath === null || viewPath === null) {
    console.error('[ERROR] MISSING_ARGUMENT: --graph=<GRAPH.json> and --view=<SEQUENCES.json> are required');
    console.error('Cause: the step projection reads both the graph and the package view');
    console.error('Action: pass both paths and re-run');
    return EXIT_FAILURE;
  }
  const sidecarPath = argumentFor(argv, 'sidecar') ?? path.join(path.dirname(graphPath), 'RFC-STEP-CONTRACTS.json');
  if (!fs.existsSync(graphPath) || !fs.existsSync(viewPath)) {
    console.error('[ERROR] MISSING_LAYER: the graph or the view is not readable');
    console.error('Cause: the projection cannot run without both layers');
    console.error('Action: repair the missing file and re-run');
    return EXIT_FAILURE;
  }

  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  const view = JSON.parse(fs.readFileSync(viewPath, 'utf8'));

  if (mode === 'verify') {
    const findings = verifyStepContracts({
      view,
      graph,
      sidecar: readStepContractSidecar(sidecarPath),
    });
    for (const finding of findings) console.error(`${finding.code}: ${finding.subject ?? ''} ${finding.message}`);
    process.stdout.write(`${JSON.stringify({ ok: findings.length === 0, findings })}\n`);
    return findings.length === 0 ? EXIT_OK : EXIT_FAILURE;
  }

  const projected = projectStepContracts({ view, graph });
  if (!projected.ok) {
    for (const finding of projected.findings) console.error(`${finding.code}: ${finding.subject ?? ''} ${finding.message}`);
    return EXIT_FAILURE;
  }

  writeStepContractSidecar(sidecarPath, projected.sidecar);
  try {
    attachNotes(graphPath, projected.sidecar);
  } catch (error) {
    console.error(`[ERROR] ${error.code ?? 'STEP_CONTRACT_PROJECTION_FAILED'}: ${error.message}`);
    console.error('Cause: a step could not be bound to an edge in the package graph');
    console.error('Action: add an edge to the operation node or repair the graph, then re-run');
    return EXIT_FAILURE;
  }

  const updatedGraph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  const findings = verifyStepContracts({ view, graph: updatedGraph, sidecar: projected.sidecar });
  for (const finding of findings) console.error(`${finding.code}: ${finding.subject ?? ''} ${finding.message}`);
  process.stdout.write(`${JSON.stringify({ ok: findings.length === 0, steps: projected.sidecar.steps.length, sidecar: sidecarPath, findings })}\n`);
  return findings.length === 0 ? EXIT_OK : EXIT_FAILURE;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { main, appendNote, edgeForRow };
