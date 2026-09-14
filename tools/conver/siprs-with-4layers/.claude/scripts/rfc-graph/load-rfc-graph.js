#!/usr/bin/env node

/**
 * load-rfc-graph.js — Graph summary + CLI usage examples [::STUB::] Scheduled for removal
 *
 * This script has been merged into show-graph-summary-markdown.js --with-cli-examples.
 * New users should migrate to show-graph-summary-markdown.js; this script is
 * temporarily retained for compatibility (removal date TBD).
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// Constant definitions
// ============================================================

/** Graph file name suffix */
const GRAPH_FILE_SUFFIX = '-GRAPH.json';

/** Success exit code */
const EXIT_SUCCESS = 0;

/** Failure exit code */
const EXIT_FAILURE = 1;

/** Default hop count for CLI usage examples */
const DEFAULT_HOPS = 2;

/** Relative path to the scripts directory */
const SCRIPTS_DIR = '.claude/scripts/rfc-graph';

// ============================================================
// Command line argument parsing
// ============================================================

/**
 * Parse command line arguments
 *
 * @param {string[]} [testArgs] — Test argument array (defaults to process.argv when omitted)
 * @returns {{ sourcePath: string }}
 * @throws {Error} When arguments are invalid
 */
function parseArguments(testArgs) {
  const args = testArgs || process.argv.slice(2);

  // --help option
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    printUsage();
    process.exit(EXIT_SUCCESS);
  }

  // Required argument: <source-path>
  if (args.length < 1) {
    throw new Error(
      'Provide the source file path.\n' +
      '  Usage: load-rfc-graph.js <source-path>'
    );
  }

  const sourcePath = args[0];

  // Check for excess arguments
  if (args.length > 1) {
    throw new Error(
      'Excess arguments provided.\n' +
      '  Usage: load-rfc-graph.js <source-path>'
    );
  }

  return { sourcePath };
}

// ============================================================
// Graph path derivation (pure function)
// ============================================================

/**
 * Derive the graph file path from the source file path
 *
 * RFC Section 3.9.1 derivation formula: <source-dir>/<basename>-GRAPH.json
 * Source path /path/to/doc.md → /path/to/doc-GRAPH.json
 *
 * @param {string} sourcePath — Path to the source file
 * @returns {string} Path to the graph file
 */
function deriveGraphPath(sourcePath) {
  const dir = path.dirname(sourcePath);
  const baseName = path.basename(sourcePath, '.md');
  return path.join(dir, `${baseName}${GRAPH_FILE_SUFFIX}`);
}

// ============================================================
// File loading
// ============================================================

/**
 * Load a graph JSON file
 *
 * Returns null if the graph file does not exist (no error).
 *
 * @param {string} graphPath — Path to the graph file
 * @returns {Object|null} Parsed graph data, or null (file not found)
 * @throws {Error} When file read or JSON parse fails
 */
function loadGraph(graphPath) {
  if (!fs.existsSync(graphPath)) {
    return null;
  }

  let raw;
  try {
    raw = fs.readFileSync(graphPath, 'utf8');
  } catch (readError) {
    throw new Error(
      `Failed to read graph file: ${readError.message}`
    );
  }

  let graph;
  try {
    graph = JSON.parse(raw);
  } catch (parseError) {
    throw new Error(
      `Failed to parse graph file JSON: ${parseError.message}`
    );
  }

  // Minimal structure validation
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    throw new Error(
      'Invalid graph data structure. nodes and edges are required.'
    );
  }

  return graph;
}

// ============================================================
// Aggregation functions (pure functions)
// ============================================================

/**
 * Aggregate graph data and generate a summary
 *
 * @param {Object} graph — Graph data ({ nodes, edges })
 * @returns {Object} Summary information
 * @returns {number} return.nodeCount — Total node count
 * @returns {Object<string, number>} return.kindDistribution — Distribution by kind
 * @returns {number} return.edgeCount — Total edge count
 * @returns {Object<string, number>} return.typeDistribution — Distribution by type
 * @returns {string[]} return.isolatedNodes — List of isolated node IDs
 */
function summarizeGraph(graph) {
  // Aggregate distribution by kind
  const kindDistribution = {};
  for (const node of graph.nodes) {
    const kind = node.kind || 'unknown';
    kindDistribution[kind] = (kindDistribution[kind] || 0) + 1;
  }

  // Aggregate distribution by type
  const typeDistribution = {};
  for (const edge of graph.edges) {
    const type = edge.type || 'unknown';
    typeDistribution[type] = (typeDistribution[type] || 0) + 1;
  }

  // Detect isolated nodes
  const connectedNodes = new Set();
  for (const edge of graph.edges) {
    connectedNodes.add(edge.from);
    connectedNodes.add(edge.to);
  }
  const isolatedNodes = graph.nodes
    .map(node => node.id)
    .filter(id => !connectedNodes.has(id));

  return {
    nodeCount: graph.nodes.length,
    kindDistribution,
    edgeCount: graph.edges.length,
    typeDistribution,
    isolatedNodes,
  };
}

/**
 * Generate concrete CLI usage examples for crud.js and query.js
 *
 * @param {string} graphPath — Path to the graph file
 * @param {string} sourcePath — Path to the source file
 * @param {string} [firstNodeId='N0001'] — Node ID to use as the exploration start point
 * @returns {string[]} Array of CLI usage example lines
 */
function generateUsageExamples(graphPath, sourcePath, firstNodeId = 'N0001') {
  const graphFileName = path.basename(graphPath);
  const sourceFileName = path.basename(sourcePath);

  return [
    `List all nodes: node ${SCRIPTS_DIR}/crud.js list-nodes --graph=${graphFileName}`,
    `Get specific node: node ${SCRIPTS_DIR}/crud.js get-node --graph=${graphFileName} --id=${firstNodeId}`,
    `${DEFAULT_HOPS}hop exploration: node ${SCRIPTS_DIR}/query.js --graph=${graphFileName} --source=${sourceFileName} --id=${firstNodeId} --hops=${DEFAULT_HOPS}`,
  ];
}

// ============================================================
// Output processing
// ============================================================

/**
 * Format and output summary and CLI usage examples to stdout
 *
 * @param {Object} summary — Return value of summarizeGraph
 * @param {string} graphPath — Path to the graph file
 * @param {string[]} examples — Return value of generateUsageExamples
 */
function outputSummary(summary, graphPath, examples) {
  const graphFileName = path.basename(graphPath);

  // Distribution string by kind (e.g., requirement:4, api_contract:3)
  const kindParts = Object.entries(summary.kindDistribution)
    .sort((a, b) => b[1] - a[1]) // Descending order by count
    .map(([kind, count]) => `${kind}:${count}`)
    .join(', ');

  // Distribution string by type
  const typeParts = Object.entries(summary.typeDistribution)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `${type}:${count}`)
    .join(', ');

  const lines = [
    '[Graph Structure Summary]',
    `Graph file: ${graphFileName}`,
    `Nodes: ${summary.nodeCount}${kindParts ? ' (' + kindParts + ')' : ''}`,
    `Edges: ${summary.edgeCount}${typeParts ? ' (' + typeParts + ')' : ''}`,
    `Isolated nodes: ${summary.isolatedNodes.length}`,
    '',
    '[Graph Exploration Commands]',
    ...examples,
  ];

  console.log(lines.join('\n'));
}

// ============================================================
// Help display
// ============================================================

/**
 * Display usage information
 */
function printUsage() {
  console.log(
    'load-rfc-graph.js — Graph summary + CLI usage examples\n' +
    '\n' +
    'Usage:\n' +
    '  load-rfc-graph.js <source-path>\n' +
    '\n' +
    'Options:\n' +
    '  <source-path>  Path to the source file from which the graph was generated\n' +
    '  --help, -h     Show this help\n' +
    '\n' +
    'Exit codes:\n' +
    '  0  Normal exit (0 even when the graph file does not exist)\n' +
    '  1  Argument error or file read error\n'
  );
}

// ============================================================
// Entry point
// ============================================================

/**
 * main — CLI entry point
 *
 * 1. Parse arguments
 * 2. Derive graph path
 * 3. Load graph (no output if not found, exit code 0)
 * 4. Aggregate summary
 * 5. Generate CLI usage examples
 * 6. Output formatted result
 *
 * All errors are printed to stderr using a three-part template and exit with code 1.
 * No file modifications are performed.
 */
function main() {
  let sourcePath;

  try {
    const parsed = parseArguments();
    sourcePath = parsed.sourcePath;
  } catch (parseError) {
    process.stderr.write(
      `[ERROR] Argument parsing failed.\n` +
      `Cause: ${parseError.message}\n` +
      `Action: Re-run with correct arguments.\n`
    );
    process.exit(EXIT_FAILURE);
  }

  const graphPath = deriveGraphPath(sourcePath);

  let graph;
  try {
    graph = loadGraph(graphPath);
  } catch (graphError) {
    process.stderr.write(
      `[ERROR] Failed to load graph file.\n` +
      `Cause: ${graphError.message}\n` +
      `Action: Verify graph file permissions and contents.\n`
    );
    process.exit(EXIT_FAILURE);
  }

  // Exit normally with no output if graph does not exist
  if (graph === null) {
    process.exit(EXIT_SUCCESS);
  }

  const summary = summarizeGraph(graph);

  // Get the first node ID (for usage examples; defaults to N0001 if no nodes exist)
  const firstNodeId = graph.nodes.length > 0 ? graph.nodes[0].id : 'N0001';

  const examples = generateUsageExamples(graphPath, sourcePath, firstNodeId);

  outputSummary(summary, graphPath, examples);

  process.exit(EXIT_SUCCESS);
}

// Only call main when executed as a CLI
if (require.main === module) {
  main();
}

module.exports = {
  parseArguments,
  deriveGraphPath,
  loadGraph,
  summarizeGraph,
  generateUsageExamples,
  outputSummary,
  printUsage,
};
