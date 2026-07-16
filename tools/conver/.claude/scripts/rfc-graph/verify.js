#!/usr/bin/env node

/**
 * verify.js — Coverage, isolated node detection + headingRefs resolvability verification
 *
 * Used in graphify-rfc Step 3. Verifies that graph nodes cover all source file headings
 * (`## `) via headingRefs, that all nodes are connected by at least one edge,
 * and that all headingRefs can be uniquely resolved by resolve-by-heading.js.
 *
 * CLI: verify.js --graph=<path> --source=<path>
 *
 * Output contract:
 *   Normal case → {"ok":true} (exit code 0)
 *   Error case → {"ok":false, "uncoveredHeadings":[...], "isolatedNodes":[...], "unresolvableRefs":[...]} (exit code 1)
 *   On error, outputs a 3-part natural language error to stderr as well.
 */

const fs = require('fs');
const path = require('path');
const { resolveByHeading } = require('./resolve-by-heading.js');

// ============================================================
// Constants
// ============================================================

/** CLI argument prefix specifying the graph file path */
const GRAPH_PATH_ARG_PREFIX = '--graph=';

/** CLI argument prefix specifying the source file path */
const SOURCE_PATH_ARG_PREFIX = '--source=';

/** Successful exit code */
const EXIT_SUCCESS = 0;

/** Error exit code */
const EXIT_FAILURE = 1;

// ============================================================
// Command line argument parsing
// ============================================================

/**
 * Parse command line arguments
 *
 * @param {string[]} [testArgs] — Test argument array (defaults to process.argv when omitted)
 * @returns {{ graphPath: string, sourcePath: string }}
 * @throws {Error} If arguments are invalid
 */
function parseArguments(testArgs) {
  const args = testArgs || process.argv.slice(2);

  // --help option
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    printUsage();
    process.exit(EXIT_SUCCESS);
  }

  // Minimum arguments: --graph=<path> --source=<path>
  if (args.length < 2) {
    throw new Error(
      'Insufficient arguments.\n' +
      '  Usage: verify.js --graph=<path> --source=<path>'
    );
  }

  // Parse --graph=<path>
  const graphFlag = args[0];
  if (!graphFlag.startsWith(GRAPH_PATH_ARG_PREFIX)) {
    throw new Error(
      'First argument must be --graph=<path>.\n' +
      `   Actual value: ${graphFlag}`
    );
  }
  const graphPath = graphFlag.slice(GRAPH_PATH_ARG_PREFIX.length);
  if (!graphPath) {
    throw new Error('--graph=<path> path is empty.');
  }

  // Parse --source=<path>
  const sourceFlag = args[1];
  if (!sourceFlag.startsWith(SOURCE_PATH_ARG_PREFIX)) {
    throw new Error(
      'Second argument must be --source=<path>.\n' +
      `   Actual value: ${sourceFlag}`
    );
  }
  const sourcePath = sourceFlag.slice(SOURCE_PATH_ARG_PREFIX.length);
  if (!sourcePath) {
    throw new Error('--source=<path> path is empty.');
  }

  // Check for excess arguments
  if (args.length > 2) {
    throw new Error(
      'Excess arguments found.\n' +
      '  Usage: verify.js --graph=<path> --source=<path>'
    );
  }

  return { graphPath, sourcePath };
}

// ============================================================
// File reading
// ============================================================

/**
 * Read a graph JSON file
 *
 * @param {string} graphPath — Path to the graph file
 * @returns {Object} Parsed graph data ({ sourceFile, nodes, edges })
 * @throws {Error} If file reading or JSON parsing fails
 */
function readGraph(graphPath) {
  if (!fs.existsSync(graphPath)) {
    throw new Error(
      `Graph file not found: ${graphPath}`
    );
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
      `Failed to parse graph JSON file: ${parseError.message}`
    );
  }

  // Minimal structure validation
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    throw new Error(
      'Graph data structure is invalid. nodes and edges are required.'
    );
  }

  return graph;
}

/**
 * Read a source file as an array of lines
 *
 * @param {string} sourcePath — Path to the source file
 * @returns {string[]} Array of lines (newlines removed)
 * @throws {Error} If file reading fails
 */
function readSourceFile(sourcePath) {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(
      `Source file not found: ${sourcePath}`
    );
  }

  try {
    const content = fs.readFileSync(sourcePath, 'utf8');
    return content.split('\n');
  } catch (readError) {
    throw new Error(
      `Failed to read source file: ${readError.message}`
    );
  }
}

// ============================================================
// Validation functions (pure)
// ============================================================

/**
 * Extract level-2 headings (`## `) from the source file
 *
 * @param {string[]} sourceLines — Array of source file lines
 * @returns {Array<{ line: number, level: number, text: string, tokens: string[] }>}
 *   List of level-2 headings (line number 1-indexed, heading level, heading text, token array)
 */
function extractHeadings(sourceLines) {
  const headings = [];
  for (let i = 0; i < sourceLines.length; i++) {
    const match = sourceLines[i].match(/^#{2,2}\s+(.+)/);
    if (match) {
      headings.push({
        line: i + 1,
        level: 2,
        text: match[1].trim(),
        tokens: match[1].trim().split(/[\s、。，．・：；（）\[\]{}「」『』【】　]+/).filter(Boolean),
      });
    }
  }
  return headings;
}

/**
 * Determine whether a single heading is covered by any node's headingRefs
 *
 * Considered "covered" when the heading level matches and any text in headingRefs
 * partially matches the heading text.
 *
 * @param {{ line: number, level: number, text: string, tokens: string[] }} heading
 *   The heading to check
 * @param {Object[]} nodes — Array of graph nodes
 * @param {Object[]} nodes[].headingRefs — Each node's headingRefs
 * @returns {boolean} Whether the heading is covered
 */
function isHeadingCovered(heading, nodes) {
  for (const node of nodes) {
    if (!Array.isArray(node.headingRefs)) continue;
    for (const ref of node.headingRefs) {
      if (ref.heading !== heading.level) continue;
      const anyMatch = ref.texts.some(text =>
        heading.text.includes(text) || text.includes(heading.text)
      );
      if (anyMatch) return true;
    }
  }
  return false;
}

/**
 * Detect uncovered headings
 *
 * Verifies that all level-2 headings (`## `) in the source file appear in
 * at least one node's headingRefs. Blank lines and regular body text are excluded.
 *
 * @param {string[]} sourceLines — Array of source file lines
 * @param {Object[]} nodes — Array of graph nodes
 * @param {Object[]} nodes[].headingRefs — Each node's headingRefs
 *   ({ refId, heading: heading level, texts: token array })
 * @returns {{ covered: boolean, uncoveredHeadings: string[] }}
 *   covered: Whether all headings are covered
 *   uncoveredHeadings: List of uncovered heading texts
 */
function checkCoverage(sourceLines, nodes) {
  const headings = extractHeadings(sourceLines);

  const uncoveredHeadings = headings
    .filter(h => !isHeadingCovered(h, nodes))
    .map(h => h.text);

  return {
    covered: uncoveredHeadings.length === 0,
    uncoveredHeadings,
  };
}

/**
 * Detect isolated nodes
 *
 * Verifies that all nodes are connected by at least one edge.
 * Node IDs that never appear in any edge's from/to are considered isolated.
 *
 * @param {Object[]} nodes — Array of graph nodes
 * @param {Object[]} edges — Array of graph edges
 * @param {string} edges[].from — Source node ID
 * @param {string} edges[].to — Target node ID
 * @returns {{ connected: boolean, isolatedNodes: string[] }}
 *   connected: Whether all nodes are connected
 *   isolatedNodes: List of isolated node IDs
 */
function checkIsolated(nodes, edges) {
  const connected = new Set();
  for (const edge of edges) {
    connected.add(edge.from);
    connected.add(edge.to);
  }

  const isolatedNodes = nodes
    .map(node => node.id)
    .filter(id => !connected.has(id));

  return {
    connected: isolatedNodes.length === 0,
    isolatedNodes,
  };
}

/**
 * Verify that all headingRefs can be uniquely resolved by resolve-by-heading.js
 *
 * Runs resolveByHeading for each headingRefs entry in every node,
 * reporting unresolvable ones as unresolvableRefs.
 *
 * @param {string[]} sourceLines — Array of source file lines
 * @param {Object[]} nodes — Array of graph nodes
 * @param {Object[]} nodes[].headingRefs — Each node's headingRefs
 * @returns {{ resolvable: boolean, unresolvableRefs: Array<{ nodeId: string, refId: string, heading: number, texts: string[] }> }}
 */
function checkResolvability(sourceLines, nodes) {
  const failures = [];
  for (const node of nodes) {
    if (!Array.isArray(node.headingRefs)) continue;
    for (const ref of node.headingRefs) {
      const result = resolveByHeading(sourceLines, ref.heading, ref.texts);
      if (!result) {
        failures.push({
          nodeId: node.id,
          refId: ref.refId,
          heading: ref.heading,
          texts: ref.texts,
        });
      }
    }
  }
  return {
    resolvable: failures.length === 0,
    unresolvableRefs: failures,
  };
}

// ============================================================
// Output processing
// ============================================================

/**
 * Output the verification result and exit the process with the appropriate exit code
 *
 * Normal case: {"ok":true} to stdout, exit code 0
 * Error case: {"ok":false, ...} to stdout,
 *             exit code 1, plus a natural language 3-part template to stderr
 *
 * @param {boolean} ok — Whether verification succeeded
 * @param {string[]} uncoveredHeadings — List of uncovered heading texts
 * @param {string[]} isolatedNodes — List of isolated node IDs
 * @param {Array} unresolvableRefs — List of unresolvable headingRefs
 */
function exitWithResult(ok, uncoveredHeadings, isolatedNodes, unresolvableRefs) {
  const result = {
    ok,
    uncoveredHeadings,
    isolatedNodes,
    unresolvableRefs,
  };

  console.log(JSON.stringify(result));

  if (!ok) {
    const messages = [];

    if (uncoveredHeadings.length > 0) {
      messages.push(
        `[ERROR] ${uncoveredHeadings.length} uncovered headings.`,
        `Cause: The following headings are not covered by any node headingRefs: ${uncoveredHeadings.join(', ')}`,
        `Action: Add a node covering the section or extend headingRefs of existing nodes.`
      );
    }

    if (isolatedNodes.length > 0) {
      messages.push(
        `[ERROR] ${isolatedNodes.length} isolated nodes.`,
        `Cause: The following nodes have zero edges: ${isolatedNodes.join(', ')}`,
        `Action: Connect the nodes with crud.js create-edges.`
      );
    }

    if (unresolvableRefs && unresolvableRefs.length > 0) {
      const details = unresolvableRefs.map(
        r => `${r.nodeId}(${r.refId}): heading=${r.heading}, texts=[${r.texts.join(', ')}]`
      ).join('; ');
      messages.push(
        `[ERROR] ${unresolvableRefs.length} unresolvable headingRefs.`,
        `Cause: Could not uniquely resolve via resolve-by-heading.js: ${details}`,
        `Action: Fix the heading level or texts tokens in the node headingRefs.`
      );
    }

    process.stderr.write(messages.join('\n') + '\n');
    process.exit(EXIT_FAILURE);
  }

  process.exit(EXIT_SUCCESS);
}

// ============================================================
// Help display
// ============================================================

/**
 * Display usage information
 */
function printUsage() {
  console.log(
    'verify.js — Coverage and isolated node validation (headingRefs method)\n' +
    '\n' +
    'Usage:\n' +
    '  verify.js --graph=<path> --source=<path>\n' +
    '\n' +
    'Options:\n' +
    '  --graph=<path>   Path to the graph file (graph.schema.json compliant)\n' +
    '  --source=<path>  Path to the source file to validate\n' +
    '  --help, -h       Show this help\n' +
    '\n' +
    'Exit codes:\n' +
    '  0  All headings covered + all nodes connected\n' +
    '  1  Uncovered headings or isolated nodes exist\n'
  );
}

// ============================================================
// Entry point
// ============================================================

/**
 * main — CLI entry point
 *
 * 1. Parse arguments
 * 2. Read graph and source files
 * 3. Coverage validation
 * 4. Isolated node validation
 * 5. Output results
 *
 * All errors are output to stderr in the 3-part template format with exit code 1.
 * No file modifications are performed.
 */
function main() {
  let graphPath, sourcePath;

  try {
    const parsed = parseArguments();
    graphPath = parsed.graphPath;
    sourcePath = parsed.sourcePath;
  } catch (parseError) {
    process.stderr.write(
      `[ERROR] Argument parse failed.\n` +
      `Cause: ${parseError.message}\n` +
      `Action: Re-run with correct arguments.\n`
    );
    process.exit(EXIT_FAILURE);
  }

  let graph;
  try {
    graph = readGraph(graphPath);
  } catch (graphError) {
    process.stderr.write(
      `[ERROR] Failed to read graph file.\n` +
      `Cause: ${graphError.message}\n` +
      `Action: Specify the correct graph file path with --graph=<path>.\n`
    );
    process.exit(EXIT_FAILURE);
  }

  let sourceLines;
  try {
    sourceLines = readSourceFile(sourcePath);
  } catch (sourceError) {
    process.stderr.write(
      `[ERROR] Failed to read source file.\n` +
      `Cause: ${sourceError.message}\n` +
      `Action: Specify the correct source file path with --source=<path>.\n`
    );
    process.exit(EXIT_FAILURE);
  }

  const coverageResult = checkCoverage(sourceLines, graph.nodes);
  const isolatedResult = checkIsolated(graph.nodes, graph.edges);
  const resolvabilityResult = checkResolvability(sourceLines, graph.nodes);

  exitWithResult(
    coverageResult.covered && isolatedResult.connected && resolvabilityResult.resolvable,
    coverageResult.uncoveredHeadings,
    isolatedResult.isolatedNodes,
    resolvabilityResult.unresolvableRefs,
  );
}

// Call main only when executed as CLI
if (require.main === module) {
  main();
}

module.exports = {
  parseArguments,
  readGraph,
  readSourceFile,
  extractHeadings,
  isHeadingCovered,
  checkCoverage,
  checkIsolated,
  checkResolvability,
  exitWithResult,
  printUsage,
};
