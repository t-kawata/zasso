#!/usr/bin/env node

/**
 * query.js — Multi-hop graph exploration
 *
 * Core of Layer 2 (graph exploration mechanism) in the graphify-rfc pipeline.
 * Performs BFS from a starting node ID up to N hops through the graph,
 * dynamically resolves line positions at runtime via headingRefs (no markers needed),
 * and formats the result as Markdown.
 *
 * Read-only, zero side effects. On missing headingRefs, outputs partial results and stderr notification.
 *
 * CLI: query.js --graph=<path> --source=<path> --id=<nodeId> --hops=<N>
 */

const fs = require("fs");
const path = require("path");
const { resolveByHeading } = require("./resolve-by-heading.js");

// ============================================================
// Constant definitions
// ============================================================

/** CLI argument prefix for the graph file path */
const GRAPH_PATH_ARG_PREFIX = "--graph=";

/** CLI argument prefix for the source file path */
const SOURCE_PATH_ARG_PREFIX = "--source=";

/** CLI argument prefix for the node ID */
const NODE_ID_ARG_PREFIX = "--id=";

/** CLI argument prefix for the hop count */
const HOPS_ARG_PREFIX = "--hops=";

/** CLI argument prefix for the Dirs-Tree.json path (optional) */
const DIRS_TREE_ARG_PREFIX = "--dirs-tree=";

/** Default hop count when not specified */
const DEFAULT_HOPS = 1;

/** Success exit code */
const EXIT_SUCCESS = 0;

/** Failure exit code */
const EXIT_FAILURE = 1;

// ============================================================
// Command line argument parsing
// ============================================================

/**
 * Parse command line arguments
 *
 * @param {string[]} [testArgs] — Test argument array (defaults to process.argv when omitted)
 * @returns {{ graphPath: string, sourcePath: string, nodeIds: string[], hops: number }}
 * @throws {Error} When arguments are invalid
 */
function parseArguments(testArgs) {
  const args = testArgs || process.argv.slice(2);

  // --help option
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    printUsage();
    process.exit(EXIT_SUCCESS);
  }

  // Search all arguments by flag name (position-independent)
  let graphPath = null, sourcePath = null, nodeIds = null;
  let hops = DEFAULT_HOPS;
  let dirsTreePath = null;

  for (const arg of args) {
    if (arg.startsWith(GRAPH_PATH_ARG_PREFIX)) {
      graphPath = arg.slice(GRAPH_PATH_ARG_PREFIX.length);
    } else if (arg.startsWith(SOURCE_PATH_ARG_PREFIX)) {
      sourcePath = arg.slice(SOURCE_PATH_ARG_PREFIX.length);
    } else if (arg.startsWith(NODE_ID_ARG_PREFIX)) {
      const rawIds = arg.slice(NODE_ID_ARG_PREFIX.length);
      // Remove empty IDs and trailing flags concatenated with debris
      // Remove trailing flags (cases concatenated with full-width spaces etc.)
      const cleaned = rawIds.replace(/[\s　]+--.*$/, '');
      if (!cleaned) continue;
      nodeIds = cleaned.split(",").map((id) => id.trim()).filter((id) => id.length > 0);
    } else if (arg.startsWith(HOPS_ARG_PREFIX)) {
      hops = parseHops(arg);
    } else if (arg.startsWith(DIRS_TREE_ARG_PREFIX)) {
      dirsTreePath = arg.slice(DIRS_TREE_ARG_PREFIX.length);
    }
  }

  // Required flag validation
  if (!graphPath) throw new Error("--graph=<path> is required.");
  if (!sourcePath) throw new Error("--source=<path> is required.");
  if (!nodeIds || nodeIds.length === 0) throw new Error("--id=<nodeId> is required.");

  return { graphPath, sourcePath, nodeIds, hops, dirsTreePath };
}

/**
 * Parse the node ID array from the --id=<nodeId> value (comma-separated)
 *
 * @param {string} idFlag — Argument string including --id=
 * @returns {string[]} Array of node IDs
 * @throws {Error} When arguments are invalid
 */
function parseNodeIds(idFlag) {
  if (!idFlag.startsWith(NODE_ID_ARG_PREFIX)) {
    throw new Error(
      "The third argument must be --id=<nodeId>.\n" +
        `  Actual value: ${idFlag}`,
    );
  }
  const rawIds = idFlag.slice(NODE_ID_ARG_PREFIX.length);
  if (!rawIds) {
    throw new Error("--id=<nodeId> <nodeId> is empty.");
  }
  return rawIds
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

/**
 * Parse the --hops=<N> value
 *
 * @param {string} hopsFlag — Argument string including --hops=
 * @returns {number} Hop count
 * @throws {Error} When arguments are invalid
 */
function parseHops(hopsFlag) {
  if (!hopsFlag.startsWith(HOPS_ARG_PREFIX)) {
    throw new Error(
      "The fourth argument must be --hops=<N>.\n" +
        `  Actual value: ${hopsFlag}`,
    );
  }
  const hopsStr = hopsFlag.slice(HOPS_ARG_PREFIX.length);
  if (!hopsStr) {
    throw new Error("--hops=<N> <N> is empty.");
  }
  const hops = parseInt(hopsStr, 10);
  if (!Number.isInteger(hops) || hops < 1) {
    throw new Error(
      "--hops=<N> must be an integer >= 1.\n" +
        `  Actual value: ${hopsStr}`,
    );
  }
  return hops;
}

// ============================================================
// File loading
// ============================================================

/**
 * Load and parse a graph JSON file
 *
 * @param {string} graphPath — Path to the graph file
 * @returns {Object} Parsed graph object
 * @throws {Error} When reading or parsing fails
 */
function loadGraph(graphPath) {
  const resolvedPath = path.resolve(graphPath);
  const raw = fs.readFileSync(resolvedPath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (parseError) {
    throw new Error(
      `Graph file JSON parse failed: ${graphPath}\n` +
        `Cause: ${parseError.message}`,
    );
  }
}

/**
 * Load the source file
 *
 * @param {string} sourcePath — Path to the source file
 * @returns {string} File contents
 * @throws {Error} When reading fails
 */
function loadSourceFile(sourcePath) {
  const resolvedPath = path.resolve(sourcePath);
  return fs.readFileSync(resolvedPath, "utf8");
}

// ============================================================
// Node resolution
// ============================================================

/**
 * Find a node in the graph by node ID
 *
 * @param {Object} graph — Graph object
 * @param {string} nodeId — Node ID to search for
 * @returns {Object|null} Found node, or null if not found
 */
function resolveNodeById(graph, nodeId) {
  return graph.nodes.find((n) => n.id === nodeId) || null;
}

// ============================================================
// BFS multi-hop exploration
// ============================================================

/**
 * Explore the graph using BFS (Breadth-First Search)
 *
 * Treated as an undirected graph — explores both edge.from and edge.to directions.
 * visited is managed as Map<nodeId, depth> to prevent circular references.
 * Duplicate edges are prevented via a from:to:type composite key.
 *
 * @param {Object} graph — Graph object
 * @param {string} startNodeId — Starting node ID
 * @param {number} hops — Maximum hops (1 or more)
 * @returns {{ nodeIds: string[], edges: Object[] }}
 */
function multiHopBFS(graph, startNodeId, hops) {
  const visited = new Map([[startNodeId, { depth: 0, parent: null }]]);
  const queue = [startNodeId];
  const resultEdges = [];
  const edgeKeys = new Set();

  while (queue.length) {
    const current = queue.shift();
    const entry = visited.get(current);
    if (entry.depth >= hops) continue;

    for (const edge of graph.edges) {
      const neighbor =
        edge.from === current
          ? edge.to
          : edge.to === current
            ? edge.from
            : null;
      if (!neighbor) continue;

      // Prevent edge duplication via from+to+type composite key
      // from→to and to→from are treated as distinct edges by different direction
      const key = edge.from + ':' + edge.to + ':' + edge.type;
      if (!edgeKeys.has(key)) {
        edgeKeys.add(key);
        resultEdges.push(edge);
      }

      if (!visited.has(neighbor)) {
        visited.set(neighbor, {
          depth: entry.depth + 1,
          parent: current,
          edge: edge,
        });
        queue.push(neighbor);
      }
    }
  }

  return {
    nodeIds: [...visited.keys()],
    edges: resultEdges,
    depthMap: visited,
  };
}

// ============================================================
// Dynamic line resolution (headingRefs method)
// ============================================================

/**
 * Resolve line positions dynamically via resolveByHeading using headingRefs
 *
 * Successor to the marker method (legacy). Identifies the relevant line in the source
 * file using only heading level and token sequence, never line numbers.
 *
 * Retrieves the heading and texts for the matching refId from the headingRefs array,
 * then passes them to resolveByHeading. Returns undefined if not found;
 * the caller handles the missing reference warning.
 *
 * @param {string} sourceText — Full text of the source file
 * @param {Array<{refId: string, heading: number, texts: string[]}>} headingRefs — headingRefs array
 * @param {string} refId — Reference ID to resolve (e.g., "REF001")
 * @returns {{ line: number, confidence: string }|undefined}
 */
function resolveCurrentLines(sourceText, headingRefs, refId) {
  const ref = headingRefs.find((r) => r.refId === refId);
  if (!ref) return undefined;

  // resolveByHeading expects a line array, so split the string
  const sourceLines = sourceText.split("\n");
  const result = resolveByHeading(sourceLines, ref.heading, ref.texts);
  if (!result) return undefined;

  return { line: result.line, confidence: result.confidence };
}

// ============================================================
// Markdown formatted output
// ============================================================

/**
 * Reconstruct the path from the start node to targetId from the BFS depthMap
 *
 * Traces the parent chain backwards and returns an array like N0113 → N0119 → N0120.
 * Returns an empty array if targetId is not in depthMap.
 *
 * @param {Map} depthMap — BFS visit record
 * @param {string} targetId — Target node ID at the path endpoint
 * @returns {string[]} Node ID array along the path (start → end order)
 */
function buildPathToNode(depthMap, targetId) {
  if (!depthMap.has(targetId)) return [];
  const path = [];
  let current = targetId;
  while (current !== null && depthMap.has(current)) {
    path.unshift(current);
    current = depthMap.get(current).parent;
  }
  return path;
}

/**
 * Build a parent-child adjacency list from depthMap
 *
 * Aggregates child node lists under each parent from BFS visit records.
 * Child nodes are sorted by node ID.
 *
 * @param {Map} depthMap — BFS visit record ({depth, parent, edge})
 * @returns {Map<string, Array<{nodeId:string, edge:Object}>>}
 */
function buildChildMap(depthMap) {
  const map = new Map();
  if (!depthMap) return map;
  for (const [nodeId, entry] of depthMap) {
    if (entry.parent === null) continue;
    if (!map.has(entry.parent)) map.set(entry.parent, []);
    map.get(entry.parent).push({ nodeId, edge: entry.edge });
  }
  for (const [, children] of map) {
    children.sort((a, b) => a.nodeId.localeCompare(b.nodeId));
  }
  return map;
}

/**
 * Generate tree rows recursively from the parent-child adjacency list
 *
 * Each row format: {indent}- {edge.type} {direction} {nodeId} ({title})
 * direction represents the direction from the parent node (→ / ← / ↔).
 *
 * @param {string} parentId — Parent node ID
 * @param {number} depth — Indentation depth (1-based)
 * @param {Map} childMap — Output from buildChildMap
 * @param {Object} graph — Full graph (for node name resolution)
 * @param {string[]} lines — Accumulating line array (destructive append)
 */
function renderChildTree(parentId, depth, childMap, graph, lines) {
  const children = childMap.get(parentId) || [];
  const indent = "    ".repeat(depth);
  for (const { nodeId, edge } of children) {
    const childNode = resolveNodeById(graph, nodeId);
    if (!childNode) continue;
    const direction = getDirectionLabel(parentId, edge);
    lines.push(
      `${indent}- ${edge.type} ${direction} ${nodeId} (${childNode.title})`,
    );
    renderChildTree(nodeId, depth + 1, childMap, graph, lines);
  }
}

/**
 * Extract the section body starting from the given heading line up to the next
 * heading at the same level or higher
 *
 * Excludes the heading line itself, returning only the body content.
 * Extracts up to EOF if no subsequent heading exists.
 *
 * @param {string[]} sourceLines — Line array of the source file
 * @param {number} headingLineIndex — 0-based index of the heading line
 * @returns {string|null} Extracted body text, or null on failure
 */
function extractSectionContent(sourceLines, headingLineIndex) {
  if (!Array.isArray(sourceLines) || sourceLines.length === 0) return null;
  if (headingLineIndex < 0 || headingLineIndex >= sourceLines.length)
    return null;

  const headingLine = sourceLines[headingLineIndex];
  const headingMatch = headingLine.match(/^(#+)\s/);
  if (!headingMatch) return null;
  const headingLevel = headingMatch[1].length;

  // Scan until the next heading at the same level or higher (or EOF)
  let endIndex = sourceLines.length;
  for (let i = headingLineIndex + 1; i < sourceLines.length; i++) {
    const m = sourceLines[i].match(/^(#+)\s/);
    if (m && m[1].length <= headingLevel) {
      endIndex = i;
      break;
    }
  }

  // Exclude the heading line itself
  const contentLines = sourceLines.slice(headingLineIndex + 1, endIndex);
  if (contentLines.length === 0) return null;

  return contentLines.join("\n");
}

/**
 * Format node information as Markdown
 *
 * @param {Object} node — Node object
 * @param {Object[]} edges — Edge array related to this node
 * @param {Object} graph — Full graph (for node name resolution)
 * @param {string} sourceText — Source text (for line number resolution)
 * @param {Map} [depthMap] — BFS visit record (for path display of surrounding node edges)
 * @param {Object|null} [nodeToDirMap] — nodeId→file path map (optional)
 * @returns {string} Markdown formatted string
 */
function formatNodeMarkdown(node, edges, graph, sourceText, depthMap, nodeToDirMap) {
  const lines = [];

  // Heading
  lines.push(`## ${node.id}: ${node.title}`);
  lines.push("");
  // Kind
  lines.push(`**Kind**: ${node.kind}`);
  lines.push("");

  // Summary (short description in the graph JSON)
  if (node.summary) {
    lines.push(node.summary);
    lines.push("");
  }

  // RFC description (relevant section body from --source)
  if (
    sourceText &&
    Array.isArray(node.headingRefs) &&
    node.headingRefs.length > 0
  ) {
    const ref = node.headingRefs[0];
    const sourceLines = sourceText.split("\n");
    const resolved = resolveByHeading(sourceLines, ref.heading, ref.texts);
    if (resolved) {
      const content = extractSectionContent(sourceLines, resolved.line - 1);
      if (content) {
        lines.push("### RFC Description\n");
        lines.push("---");
        lines.push(content);
        lines.push("---\n");
      }
    }
  }

  // Implementation target file path (shown only when --dirs-tree is specified)
  if (nodeToDirMap) {
    const filePath = nodeToDirMap[node.id];
    lines.push("### Implementation File Path\n");
    if (filePath) {
      lines.push("```");
      lines.push(filePath);
      lines.push("```\n");
    } else {
      lines.push("(No file assigned to this node)\n");
    }
  }

  // Display relationships in tree format
  if (edges.length === 0) {
    lines.push("### Relationships With Other Nodes");
    lines.push("");
    return lines.join("\n");
  }

  lines.push("### Relationships With Other Nodes\n");

  // Build parent-child adjacency list from depthMap and recursively render child nodes
  if (depthMap) {
    const childMap = buildChildMap(depthMap);
    // Root row (search start node)
    lines.push(`- ${node.id} (${node.title})`);
    renderChildTree(node.id, 1, childMap, graph, lines);
  } else {
    // When depthMap is absent, render directly from the edges array
    const grouped = groupEdgesByType(edges);
    for (const [type, typeEdges] of grouped) {
      for (const edge of typeEdges) {
        const neighbor = edge.from === node.id ? edge.to : edge.from;
        const neighborNode = resolveNodeById(graph, neighbor);
        const title = neighborNode ? neighborNode.title : neighbor;
        const dir = getDirectionLabel(node.id, edge);
        lines.push(`  - ${edge.type} ${dir} ${neighbor} (${title})`);
      }
    }
  }

  return lines.join("\n");
}

/**
 * Group an edge array by type
 *
 * @param {Object[]} edges — Edge array
 * @returns {Map<string, Object[]>} Map grouped by type key
 */
function groupEdgesByType(edges) {
  const grouped = new Map();

  for (const edge of edges) {
    const type = edge.type || "unknown";
    if (!grouped.has(type)) {
      grouped.set(type, []);
    }
    grouped.get(type).push(edge);
  }

  return grouped;
}

/**
 * Get the direction label of an edge from the node's perspective
 *
 * @param {string} nodeId — Reference node ID
 * @param {Object} edge — Edge object
 * @returns {string} Direction label ("→", "←", "↔")
 */
function getDirectionLabel(nodeId, edge) {
  if (edge.attributes && edge.attributes.bidirectional) {
    return "↔";
  }
  if (edge.from === nodeId) {
    return "→";
  }
  return "←";
}

// ============================================================
// Three-part template error output
// ============================================================

/**
 * Write a three-part template error message to stderr
 *
 * @param {string} message — What happened
 * @param {string} cause — Why it happened
 * @param {string} action — Next action to take
 */
function printError(message, cause, action) {
  process.stderr.write(
    `[ERROR] ${message}\n` + `Cause: ${cause}\n` + `Action: ${action}\n`,
  );
}

// ============================================================
// Help display
// ============================================================

/**
 * Display usage instructions
 */
function printUsage() {
  console.log(
    "query.js — Multi-hop graph exploration\n" +
      "\n" +
      "Usage:\n" +
      "  query.js --graph=<path> --source=<path> --id=<nodeId> [--hops=<N>] [--dirs-tree=<path>]\n" +
      "\n" +
      "Options:\n" +
      "  --graph=<path>       Path to the graph file (graph.schema.json compliant)\n" +
      "  --source=<path>      Path to the source file to explore\n" +
      "  --id=<nodeId>        Start node ID(s) for exploration (comma-separated for multiple)\n" +
      "  --hops=<N>           Maximum hops (default: 1, must be >= 1)\n" +
      "  --dirs-tree=<path>   Path to Dirs-Tree.json (optional, shows implementation file paths)\n" +
      "  --help, -h           Display this help\n" +
      "\n" +
      "Exit codes:\n" +
      "  0  Normal completion\n" +
      "  1  Error exit (invalid arguments, file not found, etc.)\n" +
      "\n" +
      "Examples:\n" +
      "  query.js --graph=RFC-GRAPH.json --source=RFC.md --id=N0001 --hops=2\n" +
      "  query.js --graph=RFC-GRAPH.json --source=RFC.md --id=N0001,N0003 --hops=1\n" +
      "  query.js --graph=RFC-GRAPH.json --source=RFC.md --id=N0001 --dirs-tree=RFC-Dirs-Tree.json\n",
  );
}

// ============================================================
// Entry point
// ============================================================

/**
 * main — CLI entry point
 *
 * 1. Parse arguments
 * 2. Load graph file
 * 3. Load source file
 * 4. Resolve node
 * 5. Explore graph with BFS
 * 6. Dynamically resolve line numbers
 * 7. Format result as Markdown
 * 8. Output to stdout
 *
 * All errors are output to stderr using the three-part template, exit code 1.
 * On missing markers, output partial results + stderr notification, exit code 0.
 * Never modifies any files.
 */
function main() {
  let graphPath, sourcePath, nodeIds, hops, dirsTreePath;

  // 1. Parse arguments
  try {
    const parsed = parseArguments();
    graphPath = parsed.graphPath;
    sourcePath = parsed.sourcePath;
    nodeIds = parsed.nodeIds;
    hops = parsed.hops;
    dirsTreePath = parsed.dirsTreePath;
  } catch (parseError) {
    printError(
      "Argument parse failed.",
      parseError.message,
      "Re-run with correct arguments.",
    );
    process.exit(EXIT_FAILURE);
  }

  // 2. Load graph file
  let graph;
  try {
    graph = loadGraph(graphPath);
  } catch (graphError) {
    printError(
      "Graph file failed to load.",
      graphError.message,
      "Specify a valid graph file via --graph=<path>.",
    );
    process.exit(EXIT_FAILURE);
  }

  // 3. Load source file
  let sourceText;
  try {
    sourceText = loadSourceFile(sourcePath);
  } catch (sourceError) {
    printError(
      "Source file failed to load.",
      sourceError.message,
      "Specify a valid source file via --source=<path>.",
    );
    process.exit(EXIT_FAILURE);
  }

  // 4. Build node→dir map if Dirs-Tree.json is specified
  let nodeToDirMap = null;
  if (dirsTreePath) {
    try {
      const { buildNodeToDirMap } = require("./validate-phasify.js");
      const dirsTreeData = JSON.parse(
        fs.readFileSync(path.resolve(dirsTreePath), "utf8"),
      );
      nodeToDirMap = buildNodeToDirMap(dirsTreeData);
    } catch (e) {
      printError(
        "Dirs-Tree.json failed to load.",
        e.message,
        "Specify a valid Dirs-Tree.json via --dirs-tree=<path>.",
      );
      process.exit(EXIT_FAILURE);
    }
  }

  // Execute exploration and output for each node ID
  for (const nodeId of nodeIds) {
    // 4. Resolve node
    const startNode = resolveNodeById(graph, nodeId);
    if (!startNode) {
      printError(
        `Node ${nodeId} not found in graph.`,
        `Nodes in graph: [${graph.nodes.map((n) => n.id).join(", ")}]`,
        "Specify a valid node ID via --id=<nodeId>.",
      );
      process.exit(EXIT_FAILURE);
    }

    // 5. Explore graph with BFS
    const searchResult = multiHopBFS(graph, nodeId, hops);

    // Resolve node names excluding the start node from the exploration result
    const visitedNodes = searchResult.nodeIds
      .map((id) => resolveNodeById(graph, id))
      .filter(Boolean);

    // 6. Format result as Markdown
    const allEdges = searchResult.edges;
    const markdown = formatNodeMarkdown(
      startNode,
      allEdges,
      graph,
      sourceText,
      searchResult.depthMap,
      nodeToDirMap,
    );
    console.log(markdown);

    // Deep-dive guidance
    console.log("");
    console.log("---\n");
    console.log("### Deep Dive Method");
    console.log(
      "Use the following command to explore additional node information in depth.",
    );
    console.log("```");
    console.log(
      `node .claude/scripts/rfc-graph/query.js --graph="${graphPath}" --source="${sourcePath}"${dirsTreePath ? ' --dirs-tree="' + dirsTreePath + '"' : ''} --id=<target node ID to drill into (N??? format)> --hops=<drill depth>`,
    );
    console.log("```");

    // Output separator when multiple nodes are specified
    if (nodeIds.length > 1 && nodeIds.indexOf(nodeId) < nodeIds.length - 1) {
      console.log("");
      console.log("---");
      console.log("");
    }
  }

  process.exit(EXIT_SUCCESS);
}

// Only call main when executed as a CLI
if (require.main === module) {
  main();
}

module.exports = {
  parseArguments,
  parseNodeIds,
  parseHops,
  loadGraph,
  loadSourceFile,
  resolveNodeById,
  multiHopBFS,
  buildPathToNode,
  buildChildMap,
  renderChildTree,
  extractSectionContent,
  resolveCurrentLines,
  formatNodeMarkdown,
  groupEdgesByType,
  getDirectionLabel,
  printError,
  printUsage,
  resolveByHeading,
};
