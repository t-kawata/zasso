#!/usr/bin/env node
/**
 * graphify-step.js --graph=<path> --delta=<path> --source=<rfc> [--dry-run|--approve|--reject]
 *
 * /drill-rfc-down Step 2 graphify step driver (PX-160).
 *
 * Runs the graphify-delta-analyzer to produce graph-delta.json, then:
 *   --dry-run  prints the candidate report and changes nothing
 *   --reject   leaves the GRAPH byte-identical (perfect-before-write gate)
 *   --approve  applies the plan via crud.js (the only GRAPH write path) and
 *              runs verify.js; exits 1 if any graph check fails
 *
 * Destructive changes (node deletion) are forbidden by default — the analyzer
 * never proposes them, and this driver never deletes.
 *
 * Design context: tools/conver/README.md — 進化ループ / /drill-rfc-down (Step 2).
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ANALYZER = path.join(SCRIPT_DIR, 'graphify-delta-analyzer.js');
const CRUD = path.resolve(SCRIPT_DIR, '../rfc-graph/crud.js');
const VERIFY = path.resolve(SCRIPT_DIR, '../rfc-graph/verify.js');

/** Spawn a node script and return the result. */
// [::TICKET::] PX-160, PX-161, PX-162 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-160|PX-161|PX-162) --for-spec --no-implementation-order`.
function runNode(script, args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
}

/** Format the dry-run report from a graph-delta object (AI judgment aid). */
// [::TICKET::] PX-160, PX-161, PX-162 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-160|PX-161|PX-162) --for-spec --no-implementation-order`.
function formatGraphDeltaReport(graphDelta) {
  const lines = ['## /drill-rfc-down Step 2 Graphify Dry-run', ''];
  lines.push(`### New node candidates (${graphDelta.newNodes.length})`);
  if (graphDelta.newNodes.length === 0) {
    lines.push('- none');
  } else {
    for (const node of graphDelta.newNodes) lines.push(`- ${node.id}: ${node.title} (kind: ${node.kind})`);
  }
  lines.push('');
  lines.push(`### Modified node candidates (${graphDelta.modifiedNodes.length})`);
  if (graphDelta.modifiedNodes.length === 0) {
    lines.push('- none');
  } else {
    for (const mod of graphDelta.modifiedNodes) lines.push(`- ${mod.id}: title -> "${mod.changes.title}"`);
  }
  lines.push('');
  lines.push(`### New edge candidates (${graphDelta.newEdges.length})`);
  if (graphDelta.newEdges.length === 0) {
    lines.push('- none');
  } else {
    for (const edge of graphDelta.newEdges) {
      const matched = graphDelta.report?.edgeMatches?.[`${edge.from}->${edge.to}`] || [];
      const hint = matched.length ? ` (matched: ${matched.join(', ')})` : '';
      lines.push(`- ${edge.from} -[${edge.type}]-> ${edge.to}${hint}`);
    }
  }
  return lines.join('\n');
}

/**
 * Apply the approved plan via crud.js. Returns true on success.
 * crud.js consumes (and deletes) the temp input files.
 */
// [::TICKET::] PX-160, PX-161, PX-162 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-160|PX-161|PX-162) --for-spec --no-implementation-order`.
function applyPlan(graphPath, graphDelta) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graphify-apply-'));
  try {
    if (graphDelta.newNodes && graphDelta.newNodes.length > 0) {
      const nodesFile = path.join(tmpDir, 'nodes.json');
      fs.writeFileSync(nodesFile, JSON.stringify(graphDelta.newNodes), 'utf8');
      const res = runNode(CRUD, [`--graph=${graphPath}`, 'create-nodes', `--file=${nodesFile}`]);
      if (res.status !== 0) { process.stderr.write(res.stderr || res.stdout); return false; }
    }
    for (const mod of graphDelta.modifiedNodes || []) {
      const patchFile = path.join(tmpDir, `patch-${mod.id}.json`);
      fs.writeFileSync(patchFile, JSON.stringify(mod.changes), 'utf8');
      const res = runNode(CRUD, [`--graph=${graphPath}`, 'update-node', `--id=${mod.id}`, `--file=${patchFile}`]);
      if (res.status !== 0) { process.stderr.write(res.stderr || res.stdout); return false; }
    }
    if (graphDelta.newEdges && graphDelta.newEdges.length > 0) {
      const edgesFile = path.join(tmpDir, 'edges.json');
      fs.writeFileSync(edgesFile, JSON.stringify(graphDelta.newEdges), 'utf8');
      const res = runNode(CRUD, [`--graph=${graphPath}`, 'create-edges', `--file=${edgesFile}`]);
      if (res.status !== 0) { process.stderr.write(res.stderr || res.stdout); return false; }
    }
    return true;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// [::TICKET::] PX-160, PX-161, PX-162 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-160|PX-161|PX-162) --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  let graphPath = '';
  let deltaPath = '';
  let sourcePath = '';
  let mode = '';
  for (const arg of args) {
    if (arg.startsWith('--graph=')) graphPath = arg.slice('--graph='.length);
    else if (arg.startsWith('--delta=')) deltaPath = arg.slice('--delta='.length);
    else if (arg.startsWith('--source=')) sourcePath = arg.slice('--source='.length);
    else if (arg === '--dry-run') mode = 'dry-run';
    else if (arg === '--approve') mode = 'approve';
    else if (arg === '--reject') mode = 'reject';
  }
  if (!graphPath || !deltaPath || !sourcePath || !mode) {
    console.error('Usage: graphify-step.js --graph=<path> --delta=<path> --source=<rfc> [--dry-run|--approve|--reject]');
    process.exit(1);
  }

  // Produce the graph-delta via the analyzer (deterministic dry-run; no GRAPH write).
  const outPath = path.join(os.tmpdir(), `graph-delta-${process.pid}.json`);
  const analyzerResult = runNode(ANALYZER, [`--delta=${deltaPath}`, `--graph=${graphPath}`, `--out=${outPath}`]);
  if (analyzerResult.status !== 0) {
    process.stderr.write(analyzerResult.stderr || analyzerResult.stdout);
    process.exit(1);
  }
  const graphDelta = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  fs.rmSync(outPath, { force: true });

  if (mode === 'dry-run') {
    process.stdout.write(formatGraphDeltaReport(graphDelta) + '\n');
    process.exit(0);
  }
  if (mode === 'reject') {
    process.stdout.write('Plan rejected. GRAPH left unchanged.\n');
    process.exit(0);
  }
  if (mode === 'approve') {
    if (!applyPlan(graphPath, graphDelta)) process.exit(1);
    const verify = runNode(VERIFY, [`--graph=${graphPath}`, `--source=${sourcePath}`]);
    if (verify.status !== 0) {
      process.stderr.write(`[ERROR] graphify-step: verify.js failed after apply:\n${verify.stderr || verify.stdout}`);
      process.exit(1);
    }
    process.stdout.write(formatGraphDeltaReport(graphDelta) + '\nApplied and verified.\n');
    process.exit(0);
  }
}

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main();
}

export { formatGraphDeltaReport, applyPlan, main };
