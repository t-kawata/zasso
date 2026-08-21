#!/usr/bin/env node
/**
 * graphify-step.js --graph=<path> --source=<rfc> [--delta=<path>] [--stage|--approve|--reject]
 *
 * /drill-rfc-down Step 2 graphify step driver (PX-160, PX-163).
 *
 * The AI is the engineering expert who designs the GRAPH evolution; this driver
 * only stages, validates, and promotes — it never applies an analyzer plan.
 *
 *   --stage   copies the real GRAPH to <graph>.staging.json and shows the
 *             analyzer candidates (written to <graph>.candidates.json) as an
 *             information aid. The real GRAPH is left byte-identical. The AI
 *             then designs the evolution by editing the STAGING copy via
 *             crud.js (the only GRAPH write path).
 *   --approve validates the STAGING graph with verify.js, derives the evolution
 *             delta (newNodes/modifiedNodes/newEdges) by diffing the real GRAPH
 *             against the staged graph, writes <graph>.delta.json as the Step 3
 *             handoff, and promotes the staging copy to the real GRAPH. The
 *             analyzer is NOT re-run — the staged graph, which the AI crafted
 *             through crud.js, is the plan.
 *   --reject  discards the staging copy; the real GRAPH stays byte-identical
 *             (perfect-before-write gate).
 *
 * Destructive changes (node deletion) are forbidden by default — crud.js never
 * proposes them and this driver never deletes.
 *
 * Design context: tools/conver/README.md — 進化ループ / /drill-rfc-down (Step 2).
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'url';
import { buildAdvisoryReport } from './advisory-report.js';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ANALYZER = path.join(SCRIPT_DIR, 'graphify-delta-analyzer.js');
const VERIFY = path.resolve(SCRIPT_DIR, '../rfc-graph/verify.js');

/** Spawn a node script and return the result. */
// [::TICKET::] PX-160, PX-161, PX-162, PX-163, PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-160|PX-161|PX-162|PX-163|PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function runNode(script, args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
}

/** The staging copy path the AI designs with crud.js before --approve. */
// [::TICKET::] PX-163, PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-163|PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function stagingPathOf(graphPath) {
  return `${graphPath}.staging.json`;
}

/** The candidates file path written by --stage for the AI to consult. */
// [::TICKET::] PX-163, PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-163|PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function candidatesPathOf(graphPath) {
  return `${graphPath}.candidates.json`;
}

/** The pipeline handoff path written by --approve (Step 3 boundify consumes it). */
// [::TICKET::] PX-163, PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-163|PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function deltaPathOf(graphPath) {
  return `${graphPath}.delta.json`;
}

/** A stable identity for an edge (from/to/type) used by the delta derivation. */
// [::TICKET::] PX-163, PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-163|PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function edgeKey(edge) {
  return `${edge.from}->${edge.to}->${edge.type}`;
}

/**
 * Derive the GRAPH evolution delta by diffing the real GRAPH (before promote)
 * against the staged GRAPH (the AI-crafted design). The result is deterministic:
 * it records exactly what the AI designed via crud.js, never the analyzer output.
 */
// [::TICKET::] PX-163, PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-163|PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function deriveGraphDelta(beforeGraph, stagedGraph) {
  const beforeNodes = new Map((beforeGraph.nodes || []).map((n) => [n.id, n]));
  const stagedNodes = stagedGraph.nodes || [];
  const beforeEdges = new Set((beforeGraph.edges || []).map(edgeKey));
  const stagedEdges = stagedGraph.edges || [];

  const newNodes = [];
  const modifiedNodes = [];
  for (const node of stagedNodes) {
    if (!beforeNodes.has(node.id)) {
      newNodes.push(node);
    } else if (JSON.stringify(beforeNodes.get(node.id)) !== JSON.stringify(node)) {
      modifiedNodes.push({ id: node.id, changes: node });
    }
  }
  const newEdges = stagedEdges.filter((edge) => !beforeEdges.has(edgeKey(edge)));

  return {
    sourceFile: beforeGraph.sourceFile || stagedGraph.sourceFile || '',
    newNodes,
    modifiedNodes,
    newEdges,
  };
}

/** Format the candidate report from a graph-delta object (AI judgment aid). */
// [::TICKET::] PX-160, PX-161, PX-162, PX-163, PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-160|PX-161|PX-162|PX-163|PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function formatGraphDeltaReport(graphDelta) {
  const lines = ['## /drill-rfc-down Step 2 Graphify Stage', ''];
  lines.push('### New node candidates (analyzer information, not the plan)');
  for (const node of graphDelta.newNodes || []) {
    lines.push(`- ${node.id}: ${node.title} (kind: ${node.kind})`);
  }
  if (!graphDelta.newNodes || graphDelta.newNodes.length === 0) lines.push('- none');
  lines.push('');
  lines.push('### Modified node candidates');
  for (const mod of graphDelta.modifiedNodes || []) {
    lines.push(`- ${mod.id}: title -> "${mod.changes.title}"`);
  }
  if (!graphDelta.modifiedNodes || graphDelta.modifiedNodes.length === 0) lines.push('- none');
  lines.push('');
  lines.push('### New edge candidates');
  for (const edge of graphDelta.newEdges || []) {
    const matched = graphDelta.report?.edgeMatches?.[`${edge.from}->${edge.to}`] || [];
    const hint = matched.length ? ` (matched: ${matched.join(', ')})` : '';
    lines.push(`- ${edge.from} -[${edge.type}]-> ${edge.to}${hint}`);
  }
  if (!graphDelta.newEdges || graphDelta.newEdges.length === 0) lines.push('- none');
  lines.push('');
  // The four-axis advisory (danger/omission/contradiction/deficiency) is a
  // mechanical inspection aid; it never blocks promote.
  if (graphDelta.advisory) {
    lines.push(buildAdvisoryReport(graphDelta.advisory));
  }
  lines.push('Design the evolution with crud.js on the staging graph, then run --approve.');
  return lines.join('\n');
}

/** Copy the real GRAPH to the staging path so the AI can design via crud.js. */
// [::TICKET::] PX-163, PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-163|PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function createStagingCopy(graphPath) {
  fs.copyFileSync(graphPath, stagingPathOf(graphPath));
}

/** Run the analyzer to write the candidates file and return the parsed candidates. */
// [::TICKET::] PX-163, PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-163|PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function produceCandidates(graphPath, deltaPath) {
  const outPath = candidatesPathOf(graphPath);
  const analyzerResult = runNode(ANALYZER, [`--delta=${deltaPath}`, `--graph=${graphPath}`, `--out=${outPath}`]);
  if (analyzerResult.status !== 0) {
    process.stderr.write(analyzerResult.stderr || analyzerResult.stdout);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(outPath, 'utf8'));
}

/** Emit an English Error/Cause/Action message and exit with status 1. */
// [::TICKET::] PX-163, PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-163|PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function failWithEnglishError(error, cause, action) {
  console.error(`[ERROR] graphify-step: ${error}`);
  console.error(`Cause: ${cause}`);
  console.error(`Action: ${action}`);
  process.exit(1);
}

/** Validate the staging graph with verify.js. Exits 1 with an English error on failure. */
// [::TICKET::] PX-163, PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-163|PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function verifyStagingGraph(graphPath, sourcePath) {
  const verify = runNode(VERIFY, [`--graph=${stagingPathOf(graphPath)}`, `--source=${sourcePath}`]);
  if (verify.status !== 0) {
    failWithEnglishError(
      'the staged graph failed verify.js and was NOT promoted.',
      `verify.js reported: ${(verify.stderr || verify.stdout).trim()}`,
      'design the evolution on the staging graph with crud.js so every node/edge is consistent, then re-run --approve.'
    );
  }
}

/** Promote the staging copy to the real GRAPH (the only promote path). */
// [::TICKET::] PX-163, PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-163|PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function promoteStagingToReal(graphPath) {
  fs.copyFileSync(stagingPathOf(graphPath), graphPath);
  fs.rmSync(stagingPathOf(graphPath), { force: true });
}

/** Discard the staging copy, leaving the real GRAPH untouched. */
// [::TICKET::] PX-163, PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-163|PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function discardStaging(graphPath) {
  fs.rmSync(stagingPathOf(graphPath), { force: true });
}

/**
 * Remove the transient candidates file written by --stage. Once the design is
 * committed (--approve) or discarded (--reject), the candidates are stale and
 * regenerable; the delta (.delta.json) is the persistent record and is kept.
 */
// [::TICKET::] PX-163, PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-163|PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function removeCandidates(graphPath) {
  fs.rmSync(candidatesPathOf(graphPath), { force: true });
}

// [::TICKET::] PX-160, PX-161, PX-162, PX-163, PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-160|PX-161|PX-162|PX-163|PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
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
    else if (arg === '--stage') mode = 'stage';
    else if (arg === '--approve') mode = 'approve';
    else if (arg === '--reject') mode = 'reject';
  }

  if (!graphPath || !mode) {
    console.error('Usage: graphify-step.js --graph=<path> --source=<rfc> [--delta=<path>] [--stage|--approve|--reject]');
    process.exit(1);
  }
  if (mode === 'stage' && !deltaPath) {
    failWithEnglishError(
      '--stage requires --delta to produce the candidate report.',
      'no delta path was provided, so the analyzer has nothing to analyze.',
      'run --stage with --delta=<path-to-delta.json> pointing at the Step 1 delta.'
    );
  }
  if (mode === 'approve' && !sourcePath) {
    failWithEnglishError(
      '--approve requires --source to verify the staged graph.',
      'verify.js needs the RFC source to check graph consistency.',
      'run --approve with --source=<path-to-RFC> as well as --graph.'
    );
  }

  if (mode === 'stage') {
    createStagingCopy(graphPath);
    const candidates = produceCandidates(graphPath, deltaPath);
    process.stdout.write(formatGraphDeltaReport(candidates) + '\n');
    process.exit(0);
  }
  if (mode === 'reject') {
    discardStaging(graphPath);
    removeCandidates(graphPath);
    process.stdout.write('Plan rejected. GRAPH left unchanged.\n');
    process.exit(0);
  }
  if (mode === 'approve') {
    if (!fs.existsSync(stagingPathOf(graphPath))) {
      failWithEnglishError(
        'cannot approve: no staging graph exists.',
        '--approve requires a staging copy created by --stage that the AI designed via crud.js.',
        'run --stage first, design the evolution on the staging graph with crud.js, then re-run --approve.'
      );
    }
    verifyStagingGraph(graphPath, sourcePath);
    const beforeGraph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
    const stagedGraph = JSON.parse(fs.readFileSync(stagingPathOf(graphPath), 'utf8'));
    const delta = deriveGraphDelta(beforeGraph, stagedGraph);
    fs.writeFileSync(deltaPathOf(graphPath), JSON.stringify(delta, null, 2) + '\n', 'utf8');
    promoteStagingToReal(graphPath);
    removeCandidates(graphPath);
    process.stdout.write('Staged graph verified and promoted to the real GRAPH; graph-delta.json written for Step 3.\n');
    process.exit(0);
  }
}

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main();
}

export { formatGraphDeltaReport, stagingPathOf, candidatesPathOf, deltaPathOf, deriveGraphDelta, removeCandidates, main };
