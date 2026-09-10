#!/usr/bin/env node

/**
 * dump-node-context-to-spec.js — Auto-write design context to spec
 *
 * Starting from ticket nodeIds, mechanically write GRAPH.json (node details, edge relationships) and
 * Dirs-Tree.json (implementation file path) information to spec files.
 *
 * CLI:
 *   dump-node-context-to-spec.js \
 *     --tickets=<path> --graph=<path> --dirs-tree=<path> --ticket-key=<key>
 *     [--ticket-key=<key2> ...]
 *
 * Output blocks:
 *   Block 1: Node details (id, kind, language, slug, title, summary, headingRefs)
 *   Block 2: Edge relationships (edge type groups + ★/☆ distinction)
 *   Block 3: Implementation file paths (default_files + related node file paths)
 */

const fs = require('fs');
const path = require('path');
const { resolveSpecPath } = require('../lib/resolve-spec-path');

// ============================================================
// Constants
// ============================================================

/** CLI argument prefix for specifying Tickets.json path */
const TICKETS_ARG_PREFIX = '--tickets=';

/** CLI argument prefix for specifying graph file path */
const GRAPH_ARG_PREFIX = '--graph=';

/** CLI argument prefix for specifying directory tree path */
const DIRS_TREE_ARG_PREFIX = '--dirs-tree=';

/** CLI argument prefix for specifying ticket key */
const TICKET_KEY_ARG_PREFIX = '--ticket-key=';

/** Normal exit code */
const EXIT_SUCCESS = 0;

/** Abnormal exit code */
const EXIT_FAILURE = 1;

/** Top-level heading for design context */
const SECTION_HEADING = '### Design Context';

/** Edge type priority (implementation impact order) */
const EDGE_PRIORITY = [
  'depends_on',
  'precedes',
  'triggers',
  'constrains',
  'conflicts_with',
  'refines',
  'extends',
  'implements',
  'supersedes',
  'references',
  'part_of',
  'validates',
];

/** Legend for ticket-internal nodes */
const IN_TICKET_MARK = '★';
/** Legend for ticket-external nodes */
const OUT_TICKET_MARK = '☆';

// ============================================================
// CLI Argument Parsing
// ============================================================

/**
 * Parse command-line arguments
 *
 * @param {string[]} [testArgs] — Test argument array (defaults to process.argv.slice(2))
 * @returns {{ ticketsPath: string, graphPath: string, dirsTreePath: string, ticketKeys: string[] }}
 * @throws {Error} If arguments are invalid
 */
function parseArguments(testArgs) {
  const args = testArgs || process.argv.slice(2);

  // --help option
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    printUsage();
    process.exit(EXIT_SUCCESS);
  }

  // At least 3 arguments required (--tickets, --graph, --dirs-tree)
  if (args.length < 3) {
    throw new Error(
      'Insufficient arguments.\n' +
      '  Usage: dump-node-context-to-spec.js --tickets=<path> --graph=<path> --dirs-tree=<path> --ticket-key=<key>'
    );
  }

  let ticketsPath = '';
  let graphPath = '';
  let dirsTreePath = '';
  const ticketKeys = [];

  for (const arg of args) {
    if (arg.startsWith(TICKETS_ARG_PREFIX)) {
      ticketsPath = arg.slice(TICKETS_ARG_PREFIX.length);
    } else if (arg.startsWith(GRAPH_ARG_PREFIX)) {
      graphPath = arg.slice(GRAPH_ARG_PREFIX.length);
    } else if (arg.startsWith(DIRS_TREE_ARG_PREFIX)) {
      dirsTreePath = arg.slice(DIRS_TREE_ARG_PREFIX.length);
    } else if (arg.startsWith(TICKET_KEY_ARG_PREFIX)) {
      ticketKeys.push(arg.slice(TICKET_KEY_ARG_PREFIX.length));
    }
  }

  if (!ticketsPath) {
    throw new Error('--tickets=<path> not specified.');
  }
  if (!graphPath) {
    throw new Error('--graph=<path> not specified.');
  }
  if (!dirsTreePath) {
    throw new Error('--dirs-tree=<path> not specified.');
  }
  if (ticketKeys.length === 0) {
    throw new Error('--ticket-key=<key> not specified (at least one required).');
  }

  return { ticketsPath, graphPath, dirsTreePath, ticketKeys };
}

// ============================================================
// File Loading
// ============================================================

/**
 * Load a JSON file
 *
 * @param {string} filePath — Path to the JSON file
 * @returns {Object} Parsed JSON data
 * @throws {Error} If file not found or JSON is invalid
 */
function loadJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

/**
 * Load Tickets.json
 *
 * @param {string} ticketsPath — Path to Tickets.json
 * @returns {Object} Parsed data
 */
function loadTickets(ticketsPath) {
  return loadJson(ticketsPath);
}

/**
 * Load GRAPH.json
 *
 * @param {string} graphPath — Path to GRAPH.json
 * @returns {Object} Parsed data
 */
function loadGraph(graphPath) {
  return loadJson(graphPath);
}

/**
 * Load Dirs-Tree.json
 *
 * @param {string} dirsTreePath — Path to Dirs-Tree.json
 * @returns {Object} Parsed data
 */
function loadDirsTree(dirsTreePath) {
  return loadJson(dirsTreePath);
}

// ============================================================
// Data Collection (Pure Functions)
// ============================================================

/**
 * Get nodeIds for a specific ticket from Tickets.json
 *
 * @param {Object} tickets — Parsed Tickets.json
 * @param {string} ticketKey — Ticket key ("P{phaseId}-{ticketId}" or "PX-{ticketId}")
 * @returns {{ nodeIds: string[], defaultFiles: string[], title: string } | null}
 *   null if not found
 */
function collectTicketNodes(tickets, ticketKey) {
  // Parse ticketKey
  const match = ticketKey.match(/^P(-?\d+)-(\d+)$/);
  if (!match) {
    return null;
  }
  const phaseId = parseInt(match[1], 10);
  const ticketId = parseInt(match[2], 10);

  const phases = tickets.phases || [];
  for (const phase of phases) {
    if (phase.id !== phaseId && phase.phaseId !== phaseId) {
      continue;
    }
    const phaseTickets = phase.tickets || [];
    for (const ticket of phaseTickets) {
      if (ticket.id === ticketId) {
        return {
          nodeIds: ticket.nodeIDs || ticket.nodeIds || [],
          defaultFiles: ticket.default_files || [],
          title: ticket.title || '',
        };
      }
    }
  }
  return null;
}

/**
 * Collect node details for the given nodeIds from GRAPH.json
 *
 * @param {Object} graph — Parsed GRAPH.json
 * @param {string[]} nodeIds — Array of node IDs to collect
 * @returns {Array} Array of node detail objects
 */
function collectNodeDetails(graph, nodeIds) {
  const nodeSet = new Set(nodeIds);
  return (graph.nodes || []).filter(n => nodeSet.has(n.id));
}

/**
 * Collect all edges involving the given nodeIds from GRAPH.json
 *
 * @param {Object} graph — Parsed GRAPH.json
 * @param {string[]} nodeIds — Array of own ticket node IDs
 * @returns {Array<{ from: string, to: string, type: string, fromInTicket: boolean, toInTicket: boolean }>}
 */
function collectEdges(graph, nodeIds) {
  const nodeSet = new Set(nodeIds);
  return (graph.edges || []).filter(e => nodeSet.has(e.from) || nodeSet.has(e.to)).map(e => ({
    from: e.from,
    to: e.to,
    type: e.type,
    fromInTicket: nodeSet.has(e.from),
    toInTicket: nodeSet.has(e.to),
  }));
}

/**
 * Build a reverse-lookup map from nodeId to filePath from Dirs-Tree.json
 *
 * Recursively traverse all trees and build a map from nodes with mappedNodeIds.
 *
 * @param {Object} dirsTree — Parsed Dirs-Tree.json
 * @returns {Object<string, string>} nodeId → filePath mapping
 */
function buildNodeIdToPathMap(dirsTree) {
  const map = {};
  const trees = dirsTree.trees || {};

  for (const lang of Object.keys(trees)) {
    traverseTree(trees[lang], '', map);
  }

  return map;
}

/**
 * Recursively traverse tree nodes and add to nodeId → filePath map
 *
 * @param {Object} node — Tree node
 * @param {string} parentPath — Accumulated path from parent directory
 * @param {Object<string, string>} map — Target map to write to
 */
function traverseTree(node, parentPath, map) {
  const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;

  if (Array.isArray(node.mappedNodeIds)) {
    for (const nodeId of node.mappedNodeIds) {
      if (!map[nodeId]) {
        map[nodeId] = currentPath;
      }
    }
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      traverseTree(child, currentPath, map);
    }
  }
}

// ============================================================
// Graph Node Title Resolution Helper
// ============================================================

/**
 * Resolve title from a node ID
 *
 * @param {string} nodeId — Node ID
 * @param {Array} nodes — GRAPH.json nodes array
 * @returns {string} Node title (returns nodeId itself if not found)
 */
function resolveNodeTitle(nodeId, nodes) {
  const found = nodes.find(n => n.id === nodeId);
  return found ? found.title : nodeId;
}

// ============================================================
// Formatting (Pure Functions)
// ============================================================

/**
 * Block 1: Generate Markdown for node details
 *
 * @param {Array} nodes — Node details array
 * @param {string} ticketTitle — Ticket title
 * @returns {string} Markdown section string
 */
function formatNodeDetailsBlock(nodes, ticketTitle) {
  if (!nodes.length) {
    return '';
  }

  const lines = [
    `#### Design Context: Node Details`,
    ``,
    `Graph nodes integrated in ticket "${ticketTitle}" (${nodes.length} total):`,
    ``,
    `| ID | kind | language | slug | title | summary |`,
    `|----|------|----------|------|-------|---------|`,
  ];

  for (const node of nodes) {
    const summary = (node.summary || '').slice(0, 50);
    lines.push(`| ${node.id} | ${node.kind || '-'} | ${node.language || '-'} | ${node.slug || '-'} | ${node.title || '-'} | ${summary} |`);
  }

  lines.push('', '##### headingRefs (RFC reference positions)', '');
  lines.push(`| ID | heading level | heading text |`);
  lines.push(`|----|---------------|--------------|`);

  for (const node of nodes) {
    if (Array.isArray(node.headingRefs)) {
      for (const ref of node.headingRefs) {
        const texts = (ref.texts || []).join(', ');
        lines.push(`| ${node.id} | ${ref.heading || '-'} | ${texts} |`);
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Block 2: Generate Markdown for edge relationships
 *
 * @param {Array} edges — Edge array (output of collectEdges)
 * @param {Array} nodes — All nodes array (for title resolution)
 * @returns {string} Markdown section string
 */
function formatEdgeRelationsBlock(edges, nodes) {
  if (!edges.length) {
    return '';
  }

  // Group by edge type
  const groups = {};
  for (const e of edges) {
    if (!groups[e.type]) {
      groups[e.type] = [];
    }
    groups[e.type].push(e);
  }

  const lines = [
    `#### Design Context: Node Relationships (Edges)`,
    ``,
    `Legend: ${IN_TICKET_MARK} = node in this ticket, ${OUT_TICKET_MARK} = node in another ticket/phase`,
    ``,
  ];

  // Output in edge type priority order
  for (const edgeType of EDGE_PRIORITY) {
    const group = groups[edgeType];
    if (!group || !group.length) continue;

    const typeLabel = edgeType.replace(/_/g, ' ');
    lines.push(`##### ${edgeType}（${typeLabel}）`);
    lines.push(`| From | → | To |`);
    lines.push(`|------|---|----|`);

    for (const e of group) {
      const fromMark = e.fromInTicket ? IN_TICKET_MARK : OUT_TICKET_MARK;
      const toMark = e.toInTicket ? IN_TICKET_MARK : OUT_TICKET_MARK;
      const fromTitle = resolveNodeTitle(e.from, nodes).slice(0, 50);
      const toTitle = resolveNodeTitle(e.to, nodes).slice(0, 50);
      lines.push(`| ${fromMark} ${e.from} (${fromTitle}) | → | ${toMark} ${e.to} (${toTitle}) |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Block 3: Generate Markdown for implementation file paths
 *
 * @param {Array} nodes — Node details array
 * @param {Array} edges — Edge array
 * @param {Object} dirsTree — Parsed Dirs-Tree.json
 * @param {{ defaultFiles: string[], title: string }} ticketInfo — Ticket information
 * @returns {string} Markdown section string
 */
function formatFilePathsBlock(nodes, edges, dirsTree, ticketInfo) {
  const nodeIdToPath = buildNodeIdToPathMap(dirsTree);
  const lines = [
    `#### Design Context: Implementation File Paths`,
    ``,
  ];

  // Only output if default_files exist
  const defaultFiles = ticketInfo.defaultFiles || [];
  if (defaultFiles.length > 0) {
    lines.push(`##### Implementation target for this ticket (default_files)`);
    for (const df of defaultFiles) {
      // Identify nodeIds mapped to this file
      const mappedNodeIds = nodes.filter(n => {
        const pathForNode = nodeIdToPath[n.id];
        return pathForNode && df.includes(pathForNode);
      }).map(n => n.id);
      const suffix = mappedNodeIds.length ? ` (${mappedNodeIds.join(', ')})` : '';
      lines.push(`- \`${df}\`${suffix}`);
    }
    lines.push('');
  }

  // File paths for related nodes
  const relatedPaths = [];
  const seenPaths = new Set();

  for (const e of edges) {
    // Target nodes outside the current ticket
    const externalNodeIds = [];
    if (!e.fromInTicket) externalNodeIds.push(e.from);
    if (!e.toInTicket) externalNodeIds.push(e.to);

    for (const extId of externalNodeIds) {
      const filePath = nodeIdToPath[extId];
      if (filePath && !seenPaths.has(filePath)) {
        seenPaths.add(filePath);
        relatedPaths.push({
          nodeId: extId,
          filePath: filePath,
          relation: e.type,
          title: resolveNodeTitle(extId, nodes),
        });
      }
    }
  }

  if (relatedPaths.length > 0) {
    lines.push(`##### Related node implementation targets (edge connections)`);
    lines.push(`| Node | File path | Relation |`);
    lines.push(`|------|-----------|----------|`);
    for (const rp of relatedPaths) {
      lines.push(`| ${rp.nodeId} (${rp.title.slice(0, 30)}) | \`${rp.filePath}\` | ${rp.relation} |`);
    }
    lines.push('');
  }

  // Standard guidance note
  lines.push(`##### Using the Implementation File Header Comment`);
  lines.push(``);
  lines.push(`Each implementation file above contains an \`Initial Design Artifact — RFC-driven Implementation\``);
  lines.push(`comment block at its top. This block includes query.js exploration commands and`);
  lines.push(`edge relationship cross-references. To re-check node relationships during implementation,`);
  lines.push(`use the commands directly from this comment block.`);

  return lines.join('\n');
}

/**
 * Combine the three blocks and prepend the top-level heading
 *
 * @param {string} block1 — Node details block
 * @param {string} block2 — Edge relationship block
 * @param {string} block3 — File path block
 * @param {string} graphFileName — Graph file name
 * @returns {string} Complete section string
 */
function combineBlocks(block1, block2, block3, graphFileName) {
  const parts = [SECTION_HEADING, '', `Graph file: ${graphFileName}`, ''];

  if (block1) parts.push(block1);
  if (block2) parts.push(block2);
  if (block3) parts.push(block3);

  return parts.join('\n');
}

// ============================================================
// File Writing (Idempotent)
// ============================================================

/**
 * Append a section to a spec file (idempotent)
 *
 * Skip appending if the same section heading already exists in the spec file.
 *
 * @param {string} specPath — Path to the spec file
 * @param {string} section — Section string to append
 * @returns {boolean} true if appended, false if skipped
 */
function appendToSpec(specPath, section) {
  if (!fs.existsSync(specPath)) {
    return false;
  }
  const existingContent = fs.readFileSync(specPath, 'utf8');

  // Idempotency: skip if the same section heading already exists
  const sectionHeading = section.split('\n')[0].trim();
  if (existingContent.includes(sectionHeading)) {
    return false;
  }

  const newContent = existingContent.trimEnd() + '\n\n' + section + '\n';
  fs.writeFileSync(specPath, newContent, 'utf8');
  return true;
}

// ============================================================
// Help Display
// ============================================================

/**
 * Display usage information
 */
function printUsage() {
  console.log(
    'dump-node-context-to-spec.js — Auto-write design context to spec\n' +
    '\n' +
    'Usage:\n' +
    '  dump-node-context-to-spec.js --tickets=<path> --graph=<path> --dirs-tree=<path> --ticket-key=<key>\n' +
    '    [--ticket-key=<key2> ...]\n' +
    '\n' +
    'Options:\n' +
    '  --tickets=<path>      Path to Tickets.json\n' +
    '  --graph=<path>        Path to GRAPH.json\n' +
    '  --dirs-tree=<path>    Path to Dirs-Tree.json\n' +
    '  --ticket-key=<key>    Ticket key (multiple allowed). At least one required\n' +
    '\n' +
    'Output blocks:\n' +
    '  Block 1: Node details (id/kind/language/slug/title/summary/headingRefs)\n' +
    '  Block 2: Edge relationships (type groups + ★/☆ distinction)\n' +
    '  Block 3: Implementation file paths (default_files + Dirs-Tree resolution)\n' +
    '\n' +
    'Exit codes:\n' +
    '  0  Normal completion\n' +
    '  1  Argument error or file load error\n'
  );
}

// ============================================================
// Entry Point
// ============================================================

/**
 * main — CLI entry point
 *
 * 1. Parse arguments
 * 2. Load Tickets.json / GRAPH.json / Dirs-Tree.json
 * 3. For each --ticket-key:
 *    a. Collect nodeIds
 *    b. Collect node details + generate Block 1
 *    c. Collect edges + generate Block 2
 *    d. Collect file paths + generate Block 3
 *    e. Combine blocks
 *    f. Resolve spec path + append
 *
 * All errors are output to stderr using the 3-line template and exit with code 1.
 */
function main() {
  let ticketsPath, graphPath, dirsTreePath, ticketKeys;

  try {
    const parsed = parseArguments();
    ticketsPath = parsed.ticketsPath;
    graphPath = parsed.graphPath;
    dirsTreePath = parsed.dirsTreePath;
    ticketKeys = parsed.ticketKeys;
  } catch (parseError) {
    process.stderr.write(
      `[ERROR] Argument parse failed.\n` +
      `Cause: ${parseError.message}\n` +
      `Action: Re-run with correct arguments.\n`
    );
    process.exit(EXIT_FAILURE);
  }

  // Load files
  let tickets, graph, dirsTree;
  try {
    tickets = loadTickets(ticketsPath);
    graph = loadGraph(graphPath);
    dirsTree = loadDirsTree(dirsTreePath);
  } catch (loadError) {
    process.stderr.write(
      `[ERROR] File load failed.\n` +
      `Cause: ${loadError.message}\n` +
      `Action: Verify each file path is correct.\n`
    );
    process.exit(EXIT_FAILURE);
  }

  const graphFileName = path.basename(graphPath);
  const allNodes = graph.nodes || [];

  for (const ticketKey of ticketKeys) {
    // Collect ticket info + nodeIds
    const ticketInfo = collectTicketNodes(tickets, ticketKey);
    if (!ticketInfo) {
      process.stderr.write(
        `[ERROR] Ticket ${ticketKey} not found.\n` +
        `Cause: No matching ticket exists in Tickets.json.\n` +
        `Action: Specify a valid ticket key.\n`
      );
      process.exit(EXIT_FAILURE);
    }

    const nodeIds = ticketInfo.nodeIds;
    if (!nodeIds.length) {
      // Skip tickets with empty nodeIds (not an error)
      continue;
    }

    // Collect data
    const nodes = collectNodeDetails(graph, nodeIds);
    const edges = collectEdges(graph, nodeIds);

    // Generate blocks (pure functions)
    const block1 = formatNodeDetailsBlock(nodes, ticketInfo.title);
    const block2 = formatEdgeRelationsBlock(edges, allNodes);
    const block3 = formatFilePathsBlock(nodes, edges, dirsTree, ticketInfo);

    // Combine
    const section = combineBlocks(block1, block2, block3, graphFileName);
    console.log(section); // Output to stdout

    // Append to spec file
    const specPath = resolveSpecPath(ticketKey, ticketsPath);
    if (specPath) {
      const appended = appendToSpec(specPath, section);
      if (appended) {
        console.error(`Appended to spec: ${specPath}`);
      }
    }
  }

  process.exit(EXIT_SUCCESS);
}

// Only call main when executed as CLI
if (require.main === module) {
  main();
}

module.exports = {
  parseArguments,
  loadTickets,
  loadGraph,
  loadDirsTree,
  collectTicketNodes,
  collectNodeDetails,
  collectEdges,
  buildNodeIdToPathMap,
  formatNodeDetailsBlock,
  formatEdgeRelationsBlock,
  formatFilePathsBlock,
  combineBlocks,
  appendToSpec,
  printUsage,
};
