#!/usr/bin/env node

/**
 * crud.js — Exclusive write path for graph files (6 subcommands)
 *
 * Provides CRUD operations for graph files used by the /graphify-rfc slash command.
 * All write operations pass schema validation before executing atomic write (temp file + rename).
 *
 * Subcommands:
 *   create-nodes --file=<nodes.json>  — Batch add nodes (duplicate ID check + schema validation)
 *   list-nodes                        — Output all nodes as JSON
 *   get-node --id=<nodeId>            — Get a single node
 *   update-node --id=<nodeId> --file=<patch.json> — Update a node (schema validation)
 *   delete-node --id=<nodeId>         — Delete a node
 *   create-edges --file=<edges.json>  — Batch add edges (from/to existence check + schema validation)
 */

const fs = require('fs');
const path = require('path');
const { validateAgainstSchema } = require('./schema/validate.js');
const { toHomeRelative } = require('../lib/path-utils');

// ============================================================
// Constants
// ============================================================

/** CLI argument prefix for specifying the graph file path */
const GRAPH_PATH_ARG_PREFIX = '--graph=';

/** CLI argument prefix for specifying the node ID */
const NODE_ID_ARG_PREFIX = '--id=';

/** CLI argument prefix for specifying the input JSON file */
const FILE_ARG_PREFIX = '--file=';

/** CLI argument prefix for specifying the source Markdown document path */
const SOURCE_ARG_PREFIX = '--source=';

/** CLI argument prefix for the main language a new graph root declares */
const MAIN_LANGUAGE_ARG_PREFIX = '--main-language=';

/** Error code for a first write that would create a graph with no main language */
const MISSING_MAIN_LANGUAGE = 'MISSING_MAIN_LANGUAGE';

/** Array of allowed subcommand names */
const ALLOWED_SUBCOMMANDS = [
  'create-nodes',
  'list-nodes',
  'get-node',
  'update-node',
  'delete-node',
  'create-edges',
  'delete-edges',
  'update-edge',
];

/** Absolute path to the directory containing schema files */
const SCHEMAS_DIR = path.resolve(__dirname, 'schema');

/** Schema filename: node */
const NODE_SCHEMA_FILE = 'node.schema.json';

/** Schema filename: edge */
const EDGE_SCHEMA_FILE = 'edge.schema.json';

/** Schema filename: full graph */
const GRAPH_SCHEMA_FILE = 'graph.schema.json';

/**
 * Creates an empty graph root.
 *
 * `mainLanguage` is not optional: graph.schema.json requires it, and a graph
 * without it cannot pass the validation every write performs. The caller owns
 * the value because only the source RFC states which language the project uses.
 *
 * @param {string} sourceFile — Source Markdown path recorded on the root
 * @param {string} mainLanguage — Primary implementation language (e.g. rust)
 * @returns {Object} Empty graph root carrying both required root facts
 */
// [::TICKET::] PX-333 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-333 --for-spec --no-implementation-order`.
function createEmptyGraph(sourceFile, mainLanguage) {
  return {
    sourceFile: toHomeRelative(sourceFile || ''),
    mainLanguage,
    nodes: [],
    edges: [],
  };
}

// ============================================================
// Command-line argument parsing
// ============================================================

/**
 * Parses command line arguments
 *
 * @returns {{ graphPath: string, subcommand: string, nodeId: string|null, filePath: string|null, sourcePath: string|null, mainLanguage: string|null }}
 * @throws {Error} If arguments are invalid
 */
// [::TICKET::] PX-67, PX-68, PX-69, PX-70, PX-71, PX-333 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-67|PX-68|PX-69|PX-70|PX-71|PX-333) --for-spec --no-implementation-order`.
function parseArguments() {
  const args = process.argv.slice(2);

  // --help option
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    printUsage();
    process.exit(0);
  }

  // Minimum arguments: --graph=<path> subcommand
  if (args.length < 2) {
    throw new Error(
      'Insufficient arguments.\n' +
      '  Usage: crud.js --graph=<path> <subcommand> [options]'
    );
  }

  // Parse --graph=<path>
  const graphFlag = args[0];
  if (!graphFlag.startsWith(GRAPH_PATH_ARG_PREFIX)) {
    throw new Error(
      'The first argument must be --graph=<path>.\n' +
      `  Actual value: ${graphFlag}`
    );
  }
  const graphPath = graphFlag.slice(GRAPH_PATH_ARG_PREFIX.length);
  if (!graphPath) {
    throw new Error('--graph=<path> <path> is empty.');
  }

  const subcommand = args[1];

  // Validate subcommand
  if (!ALLOWED_SUBCOMMANDS.includes(subcommand)) {
    throw new Error(
      `Unknown subcommand: ${subcommand}`
    );
  }

  // Parse subcommand-specific additional arguments
  let nodeId = null;
  let filePath = null;
  let sourcePath = null;
  let mainLanguage = null;

  for (let i = 2; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith(NODE_ID_ARG_PREFIX)) {
      nodeId = arg.slice(NODE_ID_ARG_PREFIX.length);
      if (!nodeId) {
        throw new Error('--id=<nodeId> <nodeId> is empty.');
      }
    } else if (arg.startsWith(FILE_ARG_PREFIX)) {
      filePath = arg.slice(FILE_ARG_PREFIX.length);
      if (!filePath) {
        throw new Error('--file=<path> <path> is empty.');
      }
    } else if (arg.startsWith(SOURCE_ARG_PREFIX)) {
      sourcePath = arg.slice(SOURCE_ARG_PREFIX.length);
      if (!sourcePath) {
        throw new Error('--source=<path> <path> is empty.');
      }
    } else if (arg.startsWith(MAIN_LANGUAGE_ARG_PREFIX)) {
      mainLanguage = arg.slice(MAIN_LANGUAGE_ARG_PREFIX.length);
      if (!mainLanguage) {
        throw new Error('--main-language=<language> <language> is empty.');
      }
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  // Required argument check per subcommand
  const subcommandsRequiringFile = ['create-nodes', 'create-edges', 'update-node', 'delete-edges', 'update-edge'];
  const subcommandsRequiringId = ['get-node', 'update-node', 'delete-node'];

  if (subcommandsRequiringFile.includes(subcommand) && !filePath) {
    throw new Error(
      `Subcommand "${subcommand}" requires --file=<path>.`
    );
  }
  if (subcommandsRequiringId.includes(subcommand) && !nodeId) {
    throw new Error(
      `Subcommand "${subcommand}" requires --id=<nodeId>.`
    );
  }

  return { graphPath, subcommand, nodeId, filePath, sourcePath, mainLanguage };
}

// ============================================================
// Graph file I/O
// ============================================================

/**
 * Reads the graph file. Generates an empty graph if the file does not exist.
 *
 * When creating for the first time (graph absent), sourcePath and mainLanguage
 * are required: graph.schema.json requires mainLanguage, and there is no earlier
 * file to read it from. Supplying mainLanguage for an existing graph is ignored,
 * so the root fact is decided once, at creation.
 *
 * @param {string} graphPath — Path to the graph file
 * @param {string|null} sourcePath — Path to the source Markdown document (required for first creation)
 * @param {string|null} mainLanguage — Primary implementation language (required for first creation)
 * @returns {Object} Graph data
 * @throws {Error} On file read error, or when a first creation lacks sourcePath or mainLanguage
 */
// [::TICKET::] PX-333 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-333 --for-spec --no-implementation-order`.
function readGraph(graphPath, sourcePath, mainLanguage = null) {
  if (!fs.existsSync(graphPath)) {
    if (!sourcePath) {
      throw new Error(
        '--source not specified. Specify --source=</path/to/RFC-???.md> for the source Markdown document path.'
      );
    }
    if (!mainLanguage) {
      const error = new Error(
        'Creating a graph requires --main-language=<rust|go|typescript>.'
      );
      error.code = MISSING_MAIN_LANGUAGE;
      throw error;
    }
    return createEmptyGraph(sourcePath, mainLanguage);
  }

  const content = fs.readFileSync(graphPath, 'utf-8');
  const graph = JSON.parse(content);
  // Normalize sourceFile on every read to ensure it stays ~/-relative
  // (handles pre-fix files with relative or stale absolute paths)
  graph.sourceFile = toHomeRelative(graph.sourceFile || '');
  return graph;
}

/**
 * Writes a file atomically using temp file + rename
 *
 * Even if the process crashes mid-write, the .tmp file may remain
 * but the original file is never corrupted because rename is an OS-level atomic operation.
 *
 * @param {string} targetPath — Target file path
 * @param {string} data — Data to write (UTF-8 string)
 */
function atomicWrite(targetPath, data) {
  const tmpPath = targetPath + '.tmp.' + process.pid;
  fs.writeFileSync(tmpPath, data, 'utf8');
  fs.renameSync(tmpPath, targetPath);
}

// ============================================================
// Schema validation
// ============================================================

/**
 * Validates data against the specified schema. Throws on violation.
 *
 * @param {Object} data — Data to validate
 * @param {string} schemaFileName — Schema file name
 * @param {string} description — Data description for error messages
 * @throws {Error} On schema validation failure
 */
function validateWithSchema(data, schemaFileName, description) {
  const result = validateAgainstSchema(data, schemaFileName, SCHEMAS_DIR);
  if (!result.valid) {
    const errorDetails = result.errors.join('\n  - ');
    throw new Error(
      `${description} failed schema validation.` +
      `\n  Schema: ${schemaFileName}` +
      `\n  Details:\n  - ${errorDetails}`
    );
  }
}

// ============================================================
// Subcommand implementations
// ============================================================

/**
 * create-nodes: Batch adds nodes
 *
 * Only adds nodes if all pass schema validation and no ID duplicates with existing nodes.
 * If even one violation is found, exits with error without any changes.
 * headingRefs refId values are auto-assigned (sequentially from max existing +1 in graph).
 * Any refId written in the node JSON is ignored and mechanically overwritten.
 *
 * @param {Object} graph — Graph data
 * @param {Object[]} nodesData — Array of nodes to add
 * @throws {Error} On validation failure
 */
// [::TICKET::] PX-333 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-333 --for-spec --no-implementation-order`.
function executeCreateNodes(graph, nodesData) {
  // Step 1: Schema validate all nodes
  // Temporarily set headingRefs refId to a dummy value for validation to pass
  for (const node of nodesData) {
    if (Array.isArray(node.headingRefs) && node.headingRefs.length > 0) {
      for (const range of node.headingRefs) {
        if (!range.refId || !/^REF\d{3,}$/.test(range.refId)) {
          range.refId = 'REF000';
        }
      }
    }
    validateWithSchema(node, NODE_SCHEMA_FILE, `Node ${node.id || '(unknown ID)'}`);
  }

  // Step 2: Check ID duplicates with existing nodes
  const existingIds = new Set(graph.nodes.map((n) => n.id));
  for (const node of nodesData) {
    if (existingIds.has(node.id)) {
      throw new Error(
        `Node ID ${node.id} already exists.` +
        `\n  Existing node count: ${graph.nodes.length}` +
        `\n  Duplicate ID: ${node.id}`
      );
    }
    existingIds.add(node.id);
  }

  // Step 3: Auto-increment refId
  // Scan all headingRefs across existing graph + new nodes for max refId number
  let maxRefNumber = 0;
  const allNodes = [...graph.nodes, ...nodesData];
  for (const node of allNodes) {
    if (!Array.isArray(node.headingRefs)) continue;
    for (const range of node.headingRefs) {
      if (range.refId) {
        const match = range.refId.match(/^REF(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxRefNumber) maxRefNumber = num;
        }
      }
    }
  }

  // Assign refId to new node headingRefs sequentially from max+1
  let nextRefNumber = maxRefNumber + 1;
  for (const node of nodesData) {
    if (!Array.isArray(node.headingRefs)) continue;
    for (const range of node.headingRefs) {
      range.refId = 'REF' + String(nextRefNumber).padStart(3, '0');
      nextRefNumber++;
    }
  }

  // Step 4: Execute addition
  graph.nodes.push(...nodesData);
  process.stdout.write(JSON.stringify({ ok: true, created: nodesData.length, refStart: maxRefNumber + 1, refEnd: nextRefNumber - 1 }, null, 2) + '\n');
}

/**
 * list-nodes: Output all nodes as JSON
 *
 * @param {Object} graph — Graph data
 */
// [::TICKET::] PX-333 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-333 --for-spec --no-implementation-order`.
function executeListNodeIds(graph) {
  process.stdout.write(JSON.stringify(graph.nodes, null, 2) + '\n');
}

/**
 * get-node: Get a node by its ID
 *
 * @param {Object} graph — Graph data
 * @param {string} nodeId — ID of the node to get
 * @throws {Error} If node not found
 */
// [::TICKET::] PX-333 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-333 --for-spec --no-implementation-order`.
function executeGetNode(graph, nodeId) {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) {
    throw new Error(
      `Node ${nodeId} not found.` +
      `\n  Nodes in graph: ${graph.nodes.map((n) => n.id).join(', ') || '(none)'}`
    );
  }
  process.stdout.write(JSON.stringify(node, null, 2) + '\n');
}

/**
 * update-node: Update a node by its ID
 *
 * Overwrites fields with patch data. headingRefs is replaced as a whole array.
 * Verifies the complete updated node passes schema validation.
 *
 * @param {Object} graph — Graph data
 * @param {string} nodeId — ID of the node to update
 * @param {Object} patchData — Update content
 * @throws {Error} On validation failure
 */
// [::TICKET::] PX-333 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-333 --for-spec --no-implementation-order`.
function executeUpdateNode(graph, nodeId, patchData) {
  const nodeIndex = graph.nodes.findIndex((n) => n.id === nodeId);
  if (nodeIndex === -1) {
    throw new Error(
      `Node ${nodeId} not found.` +
      `\n  Nodes in graph: ${graph.nodes.map((n) => n.id).join(', ') || '(none)'}`
    );
  }

  // Build the updated node
  const updatedNode = { ...graph.nodes[nodeIndex], ...patchData };

  // Schema Validation
  validateWithSchema(updatedNode, NODE_SCHEMA_FILE, `Updated node ${nodeId}`);

  // Execute update
  graph.nodes[nodeIndex] = updatedNode;
  process.stdout.write(JSON.stringify({ ok: true, id: nodeId }, null, 2) + '\n');
}

/**
 * delete-node: Delete a node by its ID
 *
 * @param {Object} graph — Graph data
 * @param {string} nodeId — ID of the node to delete
 * @throws {Error} If node not found
 */
// [::TICKET::] PX-333 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-333 --for-spec --no-implementation-order`.
function executeDeleteNode(graph, nodeId) {
  const nodeIndex = graph.nodes.findIndex((n) => n.id === nodeId);
  if (nodeIndex === -1) {
    throw new Error(
      `Node ${nodeId} not found.` +
      `\n  Nodes in graph: ${graph.nodes.map((n) => n.id).join(', ') || '(none)'}`
    );
  }

  // Execute deletion
  graph.nodes.splice(nodeIndex, 1);
  process.stdout.write(JSON.stringify({ ok: true, removed: nodeId }, null, 2) + '\n');
}

/**
 * create-edges: Batch add edges
 *
 * Only adds if all edges pass schema validation and from/to reference existing nodes.
 * Exits with error without making any changes if even one violation is found.
 *
 * @param {Object} graph — Graph data
 * @param {Object[]} edgesData — Array of edges to add
 * @throws {Error} On validation failure
 */
// [::TICKET::] PX-333 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-333 --for-spec --no-implementation-order`.
function executeCreateEdges(graph, edgesData) {
  // Step 1: Schema validation for all edges
  for (const edge of edgesData) {
    validateWithSchema(edge, EDGE_SCHEMA_FILE, `Edge ${edge.from}→${edge.to}`);
  }

  // Step 2: Verify from/to node existence
  const existingIds = new Set(graph.nodes.map((n) => n.id));
  for (const edge of edgesData) {
    if (!existingIds.has(edge.from)) {
      throw new Error(
        `Edge source node ${edge.from} not found in graph.` +
        `\n  Existing nodes: ${graph.nodes.map((n) => n.id).join(', ') || '(none)'}`
      );
    }
    if (!existingIds.has(edge.to)) {
      throw new Error(
        `Edge target node ${edge.to} not found in graph.` +
        `\n  Existing nodes: ${graph.nodes.map((n) => n.id).join(', ') || '(none)'}`
      );
    }
  }

  // Step 3: Execute addition
  graph.edges.push(...edgesData);
  process.stdout.write(JSON.stringify({ ok: true, created: edgesData.length }, null, 2) + '\n');
}

/**
 * update-edge: Update a single edge by from+to+type
 *
 * Finds the edge by from+to+type composite key and updates its contracts field.
 * The patch must contain from, to, type for edge identification, and may contain
 * a contracts array to replace the existing one.
 * Validates the complete updated edge against the edge schema.
 *
 * @param {Object} graph — Graph data
 * @param {Object} patchData — Contains from, to, type, and optionally contracts
 * @throws {Error} If edge not found or schema validation fails
 */
// [::TICKET::] PX-67, PX-68, PX-69, PX-70, PX-71, PX-333 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-67|PX-68|PX-69|PX-70|PX-71|PX-333) --for-spec --no-implementation-order`.
function executeUpdateEdge(graph, patchData) {
  const index = graph.edges.findIndex(
    (e) => e.from === patchData.from && e.to === patchData.to && e.type === patchData.type
  );
  if (index === -1) {
    throw new Error(
      'Edge ' + patchData.from + '→' + patchData.to + ' (' + patchData.type + ') not found.' +
      '\n  Edges in graph: ' + graph.edges.length
    );
  }
  // Build updated edge: keep existing fields, override with patch
  const updatedEdge = { ...graph.edges[index], ...patchData };
  // Schema validation
  validateWithSchema(updatedEdge, EDGE_SCHEMA_FILE, 'Updated edge ' + patchData.from + '→' + patchData.to);
  // Execute update
  graph.edges[index] = updatedEdge;
  process.stdout.write(JSON.stringify({ ok: true, edge: patchData.from + '→' + patchData.to + '(' + patchData.type + ')' }, null, 2) + '\n');
}

/**
 * delete-edges: Batch delete edges
 *
 * Identifies edges by from + to + type combination and removes matching edges.
 * Does not error if specified edges do not exist (idempotent).
 * Does not verify at least one edge remains after deletion (orphan nodes are verify.js responsibility).
 *
 * @param {Object} graph — Graph data
 * @param {Object[]} edgesData — Edge specifications to delete (containing from, to, type)
 */
// [::TICKET::] PX-333 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-333 --for-spec --no-implementation-order`.
function executeDeleteEdges(graph, edgesData) {
  let removedCount = 0;
  for (const target of edgesData) {
    const index = graph.edges.findIndex(
      (e) => e.from === target.from && e.to === target.to && e.type === target.type
    );
    if (index !== -1) {
      graph.edges.splice(index, 1);
      removedCount++;
    }
  }
  process.stdout.write(JSON.stringify({ ok: true, removed: removedCount }, null, 2) + '\n');
}

// ============================================================
// Utilities
// ============================================================

/**
 * Output error info in 3-section template to stderr and exit the process
 *
 * @param {string} message — What happened
 * @param {string} reason — Why it happened
 * @param {string} action — Next action to take
 */
// [::TICKET::] PX-333 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-333 --for-spec --no-implementation-order`.
function exitWithError(message, reason, action) {
  console.error('[ERROR] ' + message);
  console.error('Cause: ' + reason);
  console.error('Action: ' + action);
  process.exit(1);
}

/**
 * Displays usage instructions
 */
// [::TICKET::] PX-67, PX-68, PX-69, PX-70, PX-71, PX-333 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-67|PX-68|PX-69|PX-70|PX-71|PX-333) --for-spec --no-implementation-order`.
function printUsage() {
  process.stdout.write(`
crud.js — Graph file CRUD operations

Usage:
  node crud.js --graph=<path> create-nodes --file=<nodes.json>
    Batch add nodes defined in nodes.json

  node crud.js --graph=<path> list-nodes
    Output all nodes as JSON

  node crud.js --graph=<path> get-node --id=<nodeId>
    Get a node by its ID

  node crud.js --graph=<path> update-node --id=<nodeId> --file=<patch.json>
    Update a node by its ID (overwrite with patch.json fields)

  node crud.js --graph=<path> delete-node --id=<nodeId>
    Delete a node by its ID

  node crud.js --graph=<path> create-edges --file=<edges.json>
    Batch add edges defined in edges.json (with from/to node existence check)

  node crud.js --graph=<path> update-edge --file=<patch.json>
    Update a single edge identified by from+to+type (update contracts field)

First creation (graph file absent):
  --source=<path>             source Markdown path recorded in the root
  --main-language=<language>  primary implementation language
                              (rust | go | typescript)

All write operations execute atomic writes after passing schema validation.
`);
}

// ============================================================
// Main Entry Point
// ============================================================

/**
 * Main processing: parse arguments → dispatch subcommand → write
 *
 * All errors are caught in this function and output to stderr in 3-section template.
 */
// [::TICKET::] PX-67, PX-68, PX-69, PX-70, PX-71, PX-333 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-67|PX-68|PX-69|PX-70|PX-71|PX-333) --for-spec --no-implementation-order`.
function main() {
  let parsed;
  try {
    parsed = parseArguments();
  } catch (parseError) {
    exitWithError(
      'Invalid command-line arguments.',
      parseError.message,
      'Check usage with --help.'
    );
  }

  const { graphPath, subcommand, nodeId, filePath, sourcePath, mainLanguage } = parsed;

  try {
    // Subcommands requiring file input: read input JSON
    let inputData = null;
    if (filePath) {
      const content = fs.readFileSync(filePath, 'utf-8');
      inputData = JSON.parse(content);
    }

    // Read-only subcommands (no graph file modification)
    const readOnlySubcommands = ['list-nodes', 'get-node'];

    if (readOnlySubcommands.includes(subcommand)) {
      const graph = readGraph(graphPath, sourcePath, mainLanguage);
      switch (subcommand) {
        case 'list-nodes':
          executeListNodeIds(graph);
          break;
        case 'get-node':
          executeGetNode(graph, nodeId);
          break;
      }
      return;
    }

    // Write subcommands (graph file modification)
    const graph = readGraph(graphPath, sourcePath, mainLanguage);

    // Schema validation of entire graph (verify existing data integrity)
    validateWithSchema(graph, GRAPH_SCHEMA_FILE, 'Entire graph data');

    switch (subcommand) {
      case 'create-nodes':
        executeCreateNodes(graph, inputData);
        break;
      case 'update-node':
        executeUpdateNode(graph, nodeId, inputData);
        break;
      case 'delete-node':
        executeDeleteNode(graph, nodeId);
        break;
      case 'create-edges':
        executeCreateEdges(graph, inputData);
        break;
      case 'update-edge':
        executeUpdateEdge(graph, inputData);
        break;
      case 'delete-edges':
        executeDeleteEdges(graph, inputData);
        break;
    }

    // Schema validation of entire graph after modification
    validateWithSchema(graph, GRAPH_SCHEMA_FILE, 'Entire graph data after update');

    // Atomic write
    atomicWrite(graphPath, JSON.stringify(graph, null, 2));

    // Delete consumed input file (leave no garbage after use)
    if (filePath) {
      try { fs.unlinkSync(filePath); } catch { /* Deletion failure does not affect the write operation itself */ }
    }
  } catch (operationError) {
    const isMissingMainLanguage = operationError.code === MISSING_MAIN_LANGUAGE;
    exitWithError(
      isMissingMainLanguage
        ? 'MISSING_MAIN_LANGUAGE: a new graph requires a main language.'
        : `Error during execution of ${subcommand}.`,
      operationError.message,
      isMissingMainLanguage
        ? 'Re-run with --main-language=<rust|go|typescript>.'
        : 'Check input data and re-run.'
    );
  }
}

if (require.main === module) {
  main();
}

// Test exports
module.exports = {
  parseArguments,
  readGraph,
  validateWithSchema,
  executeCreateNodes,
  executeListNodeIds,
  executeGetNode,
  executeUpdateNode,
  executeDeleteNode,
  executeCreateEdges,
  executeUpdateEdge,
  executeDeleteEdges,
  atomicWrite,
  exitWithError,
  GRAPH_PATH_ARG_PREFIX,
  NODE_ID_ARG_PREFIX,
  FILE_ARG_PREFIX,
  ALLOWED_SUBCOMMANDS,
};
