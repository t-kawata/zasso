#!/usr/bin/env node
/**
 * verify-graph-integrity.js — 5-axis graph integrity check
 *
 * --graph-after=<path> --graph-before=<path> --source=<path>
 *
 * Verifies that the graph data has not been corrupted after modification
 * at the boundary between graphify and boundify. Checks the following 5 axes:
 *
 * 1. nodes integrity: whether the set of node IDs has changed
 * 2. edges integrity: whether the edges array has changed
 * 3. headingRefs resolvability: whether all headingRefs are resolvable
 * 4. orphan nodes: whether any node has zero edges
 * 5. uncovered headings: whether all source headings are covered by node headingRefs
 *
 * Output contract:
 *   On success → {ok: true}
 *   On error → {ok: false, errors: [...], remedies: [...]}
 *             remedies is a natural-language instruction for the next AI action
 */
'use strict';

const fs = require('fs');
const path = require('path');

// Use verify.js validation functions directly
let verify;
try {
  verify = require('./verify.js');
} catch (_) {
  // fallback: in case verify.js does not export modules
}

// ============================================================
// Error message template
// ============================================================

/** 3-element template: [problem] / [cause] / [remedy] */
function formatError(problem, cause, remedy) {
  return `[ERROR] ${problem}\nCause: ${cause}\nAction: ${remedy}`;
}

// ============================================================
// Argument parsing
// ============================================================

/**
 * Parse CLI arguments
 */
function parseArgs(argv) {
  const afterFlag = argv.find(a => a.startsWith('--graph-after='));
  const beforeFlag = argv.find(a => a.startsWith('--graph-before='));
  const sourceFlag = argv.find(a => a.startsWith('--source='));

  return {
    graphAfter: afterFlag ? path.resolve(afterFlag.slice('--graph-after='.length)) : null,
    graphBefore: beforeFlag ? path.resolve(beforeFlag.slice('--graph-before='.length)) : null,
    sourcePath: sourceFlag ? path.resolve(sourceFlag.slice('--source='.length)) : null,
  };
}

// ============================================================
// Graph loading
// ============================================================

function loadGraph(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

// ============================================================
// Check 1: nodes integrity
// ============================================================

/**
 * Verify that the set of node IDs matches before and after modification
 */
function checkNodesIntegrity(graphAfter, graphBefore) {
  const errors = [];
  const remedies = [];

  if (!graphAfter || !graphBefore) return { errors, remedies };

  const afterIds = new Set((graphAfter.nodes || []).map(n => n.id));
  const beforeIds = new Set((graphBefore.nodes || []).map(n => n.id));

  const added = [...afterIds].filter(id => !beforeIds.has(id));
  const removed = [...beforeIds].filter(id => !afterIds.has(id));

  if (added.length > 0) {
    errors.push(formatError(
      `${added.length} nodes added`,
      `Added node IDs: ${added.join(', ')}`,
      `Delete extra nodes with crud.js delete-node, or return to graphify to review node definitions.`
    ));
    remedies.push(`Delete extra nodes with crud.js delete-node --id=${added.join(',')}, or regenerate the graph.`);
  }

  if (removed.length > 0) {
    errors.push(formatError(
      `${removed.length} nodes removed`,
      `Removed node IDs: ${removed.join(', ')}`,
      `Re-add missing nodes with crud.js create-nodes, or regenerate the graph via graphify.`
    ));
    remedies.push(`Add missing nodes with crud.js create-nodes, or regenerate the graph.`);
  }

  return { errors, remedies };
}

// ============================================================
// Check 2: edges integrity
// ============================================================

/**
 * Verify that edges match before and after modification
 * Edges are compared as from+to+type tuples.
 */
function checkEdgesIntegrity(graphAfter, graphBefore) {
  const errors = [];
  const remedies = [];

  if (!graphAfter || !graphBefore) return { errors, remedies };

  const edgeKey = e => `${e.from}->${e.to}(${e.type})`;
  const afterEdges = new Set((graphAfter.edges || []).map(edgeKey));
  const beforeEdges = new Set((graphBefore.edges || []).map(edgeKey));

  const added = [...afterEdges].filter(k => !beforeEdges.has(k));
  const removed = [...beforeEdges].filter(k => !afterEdges.has(k));

  if (added.length > 0) {
    errors.push(formatError(
      `${added.length} edges added`,
      `Added edges: ${added.join(', ')}`,
      `Delete extra edges with crud.js delete-edges, or regenerate the graph.`
    ));
    remedies.push(`Delete extra edges and re-run.`);
  }

  if (removed.length > 0) {
    errors.push(formatError(
      `${removed.length} edges removed`,
      `Removed edges: ${removed.join(', ')}`,
      `Re-add missing edges with crud.js create-edges, or regenerate the graph.`
    ));
    remedies.push(`Add missing edges with crud.js create-edges --file=... and re-run.`);
  }

  return { errors, remedies };
}

// ============================================================
// Checks 3-5: use verify.js functions
// ============================================================

/**
 * Run verify.js's 3-axis checks (headingRefs resolvability, orphan nodes, uncovered headings)
 * as a child process and return the results.
 *
 * verify.js functions perform file I/O internally, so run them as a child process for safety.
 */
function checkWithVerifyjs(graphPath, sourcePath) {
  const errors = [];
  const remedies = [];

  if (!sourcePath || !graphPath) return { errors, remedies };

  const { execSync } = require('child_process');
  const verifyScript = path.join(__dirname, 'verify.js');

  try {
    const stdout = execSync(
      `node "${verifyScript}" --graph="${graphPath}" --source="${sourcePath}"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const result = JSON.parse(stdout.trim());
    if (!result.ok) {
      // Propagate verify.js errors as-is
      if (result.errors) {
        for (const err of result.errors) {
          errors.push(err);
        }
      }
      // General remedy
      remedies.push(
        `Resolve verify.js errors. Extend headingRefs for uncovered headings, add edges for isolated nodes, fix texts for unresolvable headingRefs. Then re-run.`
      );
    }
  } catch (err) {
    // Treat verify.js abnormal termination as an error too
    errors.push(formatError(
      'verify.js validation failed',
      err.stderr ? err.stderr.trim() : err.message,
      'Check verify.js error output and fix the cause.'
    ));
    remedies.push(`Check verify.js errors, fix them, then re-run.`);
  }

  return { errors, remedies };
}

// ============================================================
// Main
// ============================================================

/**
 * Run all 5 checks and return results
 *
 * @param {string[]} [testArgs] — argument array for testing
 */
function main(testArgs) {
  const args = testArgs || process.argv.slice(2);
  const { graphAfter, graphBefore, sourcePath } = parseArgs(args);

  // At minimum, graphAfter is required
  if (!graphAfter && !sourcePath) {
    console.error('[ERROR] Insufficient arguments\nCause: --graph-after=<path> or --source=<path> is required\nAction: Specify both arguments and re-run.');
    process.exit(1);
  }

  const allErrors = [];
  const allRemedies = [];
  const graphAfterData = graphAfter ? loadGraph(graphAfter) : null;
  const graphBeforeData = graphBefore ? loadGraph(graphBefore) : null;

  // Axis 1: nodes integrity
  const nodesResult = checkNodesIntegrity(graphAfterData, graphBeforeData);
  allErrors.push(...nodesResult.errors);
  allRemedies.push(...nodesResult.remedies);

  // Axis 2: edges integrity
  const edgesResult = checkEdgesIntegrity(graphAfterData, graphBeforeData);
  allErrors.push(...edgesResult.errors);
  allRemedies.push(...edgesResult.remedies);

  // Axes 3-5: via verify.js (headingRefs resolvability, orphan nodes, uncovered headings)
  if (graphAfter && sourcePath) {
    const verifyResult = checkWithVerifyjs(graphAfter, sourcePath);
    allErrors.push(...verifyResult.errors);
    allRemedies.push(...verifyResult.remedies);
  }

  // Deduplication
  const uniqueRemedies = [...new Set(allRemedies)];

  if (allErrors.length === 0) {
    process.stdout.write(JSON.stringify({ ok: true }) + '\n');
  } else {
    process.stdout.write(JSON.stringify({
      ok: false,
      errors: allErrors,
      remedies: uniqueRemedies,
    }, null, 2) + '\n');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main, parseArgs, checkNodesIntegrity, checkEdgesIntegrity, checkWithVerifyjs };
