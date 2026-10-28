#!/usr/bin/env node

/**
 * project-step-contracts — bind every artifact step contract to its operation node.
 *
 * The graph node carries the operation unit; this script writes the deterministic sidecar
 * and a short `step-sidecar;digest:<hex>` note on an edge incident to that node. The
 * sidecar holds the full contract and the row-to-edge map, so the edge note stays under
 * the 240-character schema limit however many steps one operation carries.
 *
 * Usage:
 *   node project-step-contracts.js --graph=<GRAPH.json> --view=<SEQUENCES.json> [--sidecar=<path>] [--mode=attach|verify]
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  resolveGraphPath,
  resolveViewPath,
  reportResolvedPath,
} = require('../lib/package-artifacts');

const {
  STEP_NOTE_LIMIT,
  edgeForRow,
  projectStepContracts,
  readStepContractSidecar,
  stepNotesByEdge,
  verifyStepContracts,
  writeStepContractSidecar,
} = require('./lib/step-contracts.mjs');
const { composeNote } = require('./lib/note-parts.mjs');

const EXIT_OK = 0;
const EXIT_FAILURE = 1;

/** The note prefixes this projection owns; a re-run replaces them rather than stacking. */
const STEP_NOTE_PREFIXES = Object.freeze(['step:', 'step-sidecar;']);

/** Parse `--name=value` or `--name value`. */
// [::TICKET::] PX-318 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-318) --for-spec --no-implementation-order`.
function argumentFor(argv, name) {
  const inline = argv.find((entry) => entry.startsWith(`--${name}=`));
  if (inline !== undefined) return inline.slice(`--${name}=`.length);
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? null : argv[index + 1] ?? null;
}

/** Apply the step notes through crud.js, the sole graph write path. */
// [::TICKET::] PX-318, PX-322 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-318|PX-322) --for-spec --no-implementation-order`.
function attachNotes(graphPath, sidecar) {
  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  const notes = stepNotesByEdge(graph, sidecar);

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'step-contracts-'));
  const crudPath = path.join(__dirname, 'crud.js');
  try {
    for (const { edge, note } of notes.values()) {
      const composed = composeNote(edge.attributes?.note, note, {
        limit: STEP_NOTE_LIMIT,
        replacePrefixes: STEP_NOTE_PREFIXES,
      });
      const patch = path.join(directory, `edge-${edge.from}-${edge.to}-${edge.type}.json`);
      fs.writeFileSync(patch, JSON.stringify({
        from: edge.from,
        to: edge.to,
        type: edge.type,
        attributes: { ...(edge.attributes ?? {}), note: composed },
        contracts: edge.contracts ?? [],
      }, null, 2));
      execFileSync(process.execPath, [crudPath, `--graph=${graphPath}`, 'update-edge', `--file=${patch}`], { stdio: 'pipe' });
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

/** Entry point. */
// [::TICKET::] PX-318, PX-322, PX-334 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-318|PX-322|PX-334) --for-spec --no-implementation-order`.
function main(argv = process.argv.slice(2)) {
  const graphFlag = argumentFor(argv, 'graph');
  const viewFlag = argumentFor(argv, 'view');
  const mode = argumentFor(argv, 'mode') ?? 'attach';
  let graphPath;
  let viewPath;
  try {
    graphPath = graphFlag !== null
      ? path.resolve(graphFlag)
      : resolveGraphPath({ cwd: process.cwd() });
    if (graphFlag === null) reportResolvedPath('graph', graphPath);
    viewPath = viewFlag !== null
      ? path.resolve(viewFlag)
      : resolveViewPath({ cwd: process.cwd(), allowMissing: false });
    if (viewFlag === null) reportResolvedPath('view', viewPath);
  } catch (error) {
    console.error('[ERROR] ' + (error.code || 'MISSING_ARTIFACT') + ': ' + error.message);
    console.error('Cause: the step projection reads both the graph and the package view');
    console.error('Action: ' + (error.remedy || 'pass both paths and re-run'));
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
    console.error('Cause: a step note could not be composed on an edge in the package graph');
    console.error('Action: repair the graph edge note or the sidecar, then re-run');
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

module.exports = { main, edgeForRow };
