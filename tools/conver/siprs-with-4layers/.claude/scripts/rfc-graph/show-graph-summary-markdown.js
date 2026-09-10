#!/usr/bin/env node

/**
 * show-graph-summary-markdown.js — Output graph summary in Markdown format
 *
 * Generates a node list grouped by kind from the graph JSON, and outputs
 * each node's title, summary, current line number (dynamically resolved from markers),
 * and edge relationships to stdout in Markdown format.
 *
 * CLI: show-graph-summary-markdown.js --graph=<path> --source=<path>
 *
 * Output contract:
 *   Success → Markdown summary written to stdout (exit code 0)
 *   Error   → 3-part template written to stderr (exit code 1)
 */

const fs = require('fs');
const path = require('path');

const { resolveByHeading } = require('./resolve-by-heading.js');

// ============================================================
// Constants
// ============================================================

/** Edge type → 3-letter abbreviation */
const EDGE_ABBREV = {
  depends_on: 'dep',
  implements: 'imp',
  refines: 'rfn',
  extends: 'ext',
  conflicts_with: 'cnf',
  triggers: 'trg',
  constrains: 'cns',
  supersedes: 'sup',
  references: 'ref',
  precedes: 'prc',
  part_of: 'prt',
  validates: 'vld',
};

// ============================================================
// Utilities
// ============================================================

function exitWithError(summary, cause, action) {
  process.stderr.write(
    `[ERROR] ${summary}\nCause: ${cause}\nAction: ${action}\n`
  );
  process.exit(1);
}

// ============================================================
// Argument parsing
// ============================================================

/** Script directory (relative path) */
const SCRIPTS_DIR = '.claude/scripts/rfc-graph';

/** Default hop count for traversal */
const DEFAULT_HOPS = 2;

function parseArguments(argv) {
  if (argv.length < 4) {
    throw new Error('Insufficient arguments.\nUsage: show-graph-summary-markdown.js --graph=<path> --source=<path> [--with-cli-examples]');
  }

  const graphArg = argv[2];
  const sourceArg = argv[3];

  if (!graphArg.startsWith('--graph=')) {
    throw new Error(`First argument must be --graph=<path>: ${graphArg}`);
  }
  if (!sourceArg.startsWith('--source=')) {
    throw new Error(`Second argument must be --source=<path>: ${sourceArg}`);
  }

  const graphPath = graphArg.slice('--graph='.length);
  const sourcePath = sourceArg.slice('--source='.length);

  if (!graphPath) {
    throw new Error('--graph=<path> path is empty.');
  }
  if (!sourcePath) {
    throw new Error('--source=<path> path is empty.');
  }

  // Optional flag
  const withCliExamples = argv.slice(4).some(a => a === '--with-cli-examples');

  return { graphPath, sourcePath, withCliExamples };
}

function loadGraph(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Graph file not found: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error(`JSON parse failed: ${filePath} — ${e.message}`);
  }
  if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
    throw new Error('Graph data structure is invalid: nodes or edges missing');
  }
  return data;
}

function loadSourceFile(filePath) {
  if (!fs.existsSync(filePath)) {
    exitWithError(
      'Source file not found.',
      `${filePath} does not exist.`,
      'Specify the correct file path with --source=<path>.'
    );
  }
  return fs.readFileSync(filePath, 'utf8');
}

// ============================================================
// Summary formatting
// ============================================================

/**
 * Truncate summary to ~25 characters
 *
 * @param {string} summary
 * @returns {string}
 */
function truncateSummary(summary) {
  if (!summary) return '';
  if (summary.length <= 25) return summary;
  return summary.substring(0, 25) + '...';
}

/**
 * Get node title
 *
 * @param {Object} node
 * @returns {string}
 */
function formatTitle(node) {
  return node.title;
}

/**
 * Convert edge type to 3-letter abbreviation
 *
 * @param {string} type
 * @returns {string}
 */
function abbreviateEdgeType(type) {
  return EDGE_ABBREV[type] || type.slice(0, 3);
}

/**
 * Build node map (id → node)
 *
 * @param {Object[]} nodes
 * @returns {Object<string, Object>}
 */
function buildNodeMap(nodes) {
  const map = {};
  for (const node of nodes) {
    map[node.id] = node;
  }
  return map;
}

/**
 * Generate Markdown summary
 *
 * @param {Object} graph — Graph data
 * @param {string} sourceText — Full source file text (for dynamic line number resolution)
 * @returns {string}
 */
function generateSummary(graph, sourceText) {
  const nodeMap = buildNodeMap(graph.nodes);
  const lines = [];

  // First line: absolute path + node count + edge count
  lines.push(`${graph.sourceFile}  —  ${graph.nodes.length} nodes / ${graph.edges.length} edges`);
  lines.push('');

  // Group by kind
  const kindGroups = {};
  const KIND_ORDER = [
    'requirement', 'api_contract', 'data_model', 'state_machine',
    'architecture', 'security', 'error_policy', 'config',
    'test_policy', 'build_ci', 'rationale', 'glossary',
  ];

  for (const node of graph.nodes) {
    const kind = node.kind || 'other';
    if (!kindGroups[kind]) kindGroups[kind] = [];
    kindGroups[kind].push(node);
  }

  for (const kind of KIND_ORDER) {
    const nodes = kindGroups[kind];
    if (!nodes || nodes.length === 0) continue;
    delete kindGroups[kind];

    lines.push(`## ${kind} (${nodes.length} items)`);

    for (const node of nodes) {
      // Resolve line position from heading (for level display)
      let headingLevel = '';
      if (Array.isArray(node.headingRefs) && node.headingRefs.length > 0) {
        const firstRef = node.headingRefs[0];
        if (firstRef.refId) {
          const sourceLines = (typeof sourceText === 'string') ? sourceText.split('\n') : sourceText;
          const resolved = resolveByHeading(sourceLines, firstRef.heading, firstRef.texts);
          if (resolved) {
            headingLevel = `h${firstRef.heading}`;
          }
        }
      }

      // Node basic information
      const summaryText = truncateSummary(node.summary);
      lines.push(`    - ${node.id}: ${formatTitle(node)}`);
      lines.push(`        * Level: ${headingLevel || '?'}`);
      lines.push(`        * Summary: ${summaryText}`);

      // Edge list
      const edgeLines = [];
      for (const edge of graph.edges) {
        if (edge.from === node.id) {
          const target = nodeMap[edge.to];
          const targetTitle = target ? formatTitle(target) : edge.to;
          const bidir = edge.attributes && edge.attributes.bidirectional;
          const arrow = bidir ? '<->' : '->';
          edgeLines.push(
            `            - [${node.id}] ${arrow} ${edge.type} ${arrow} [${edge.to}: ${targetTitle}]`
          );
        } else if (edge.to === node.id) {
          // Skip because bidirectional was already output from the from-side
          if (edge.attributes && edge.attributes.bidirectional) continue;
          const source = nodeMap[edge.from];
          const sourceTitle = source ? formatTitle(source) : edge.from;
          edgeLines.push(
            `            - [${node.id}] <- ${edge.type} <- [${edge.from}: ${sourceTitle}]`
          );
        }
      }

      if (edgeLines.length > 0) {
        lines.push(`        * Edges:`);
        lines.push(...edgeLines);
      }
    }
    lines.push('');
  }

  // Output uncategorized kinds if any
  const remainingKinds = Object.keys(kindGroups).filter(k => kindGroups[k].length > 0);
  for (const kind of remainingKinds) {
    const nodes = kindGroups[kind];
    lines.push(`## ${kind} (${nodes.length} items)`);
    for (const node of nodes) {
      lines.push(`    - ${node.id}: ${formatTitle(node)}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================
// Main
// ============================================================

/**
 * Generate concrete CLI usage examples for crud.js and query.js (for formulate integration)
 *
 * @param {string} graphPath — Path to the graph file
 * @param {string} sourcePath — Path to the source file
 * @param {string} [firstNodeId='N0001'] — Node ID to use as traversal starting point
 * @returns {string[]} Array of CLI example lines
 */
function generateCliExamples(graphPath, sourcePath, firstNodeId) {
  const graphFileName = path.basename(graphPath);
  const sourceFileName = path.basename(sourcePath);
  const nodeId = firstNodeId || "N0001";

  return [
    "",
    "---",
    "### Graph Exploration Commands",
    "",
    "```bash",
    "# 1-hop (direct connections only)",
    "node " + SCRIPTS_DIR + "/query.js --graph=" + graphFileName + " --source=" + sourceFileName + " --id=" + nodeId + " --hops=1",
    "",
    "# 2-hop (includes children and grandchildren)",
    "node " + SCRIPTS_DIR + "/query.js --graph=" + graphFileName + " --source=" + sourceFileName + " --id=" + nodeId + " --hops=2",
    "",
    "# 3-hop (deeper relationships)",
    "node " + SCRIPTS_DIR + "/query.js --graph=" + graphFileName + " --source=" + sourceFileName + " --id=" + nodeId + " --hops=3",
    "```",
  ];
}
function main() {
  let parsed;
  try {
    parsed = parseArguments(process.argv);
  } catch (e) {
    exitWithError(
      'Argument parse failed.',
      e.message,
      'show-graph-summary-markdown.js --graph=<path> --source=<path> [--with-cli-examples]'
    );
  }

  const graph = loadGraph(parsed.graphPath);
  const sourceText = loadSourceFile(parsed.sourcePath);
  const output = generateSummary(graph, sourceText);

  // When --with-cli-examples is specified, append CLI usage examples to output
  if (parsed.withCliExamples) {
    const firstNodeId = graph.nodes.length > 0 ? graph.nodes[0].id : undefined;
    const cliExamples = generateCliExamples(parsed.graphPath, parsed.sourcePath, firstNodeId);
    console.log(output + '\n' + cliExamples.join('\n'));
  } else {
    console.log(output);
  }
}

module.exports = {
  parseArguments,
  loadGraph,
  loadSourceFile,
  truncateSummary,
  abbreviateEdgeType,
  buildNodeMap,
  generateSummary,
  generateCliExamples,
  EDGE_ABBREV,
};

if (require.main === module) {
  main();
}
