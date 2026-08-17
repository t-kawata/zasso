#!/usr/bin/env node

/**
 * validate-graph-arg.js — Validate a graph JSON argument (Step 0, deterministic)
 *
 * CLI: validate-graph-arg.js --graph=<path>
 *
 * Exit-code contract:
 *   argument syntax errors (missing/empty --graph, excess args) -> exit 2
 *   input data errors (file not found, malformed JSON, schema violation) -> exit 1
 *
 * On success prints {"ok":true,"graph":{...}} to stdout.
 */

const fs = require('fs');
const path = require('path');
const { validateAgainstSchema } = require('../rfc-graph/schema/validate.js');

/** CLI argument prefix specifying the graph file path */
const GRAPH_PATH_ARG_PREFIX = '--graph=';

/** Successful exit code */
const EXIT_SUCCESS = 0;

/** Input data error exit code (file / JSON / schema) */
const EXIT_DATA_ERROR = 1;

/** Argument syntax error exit code */
const EXIT_ARG_ERROR = 2;

/** Graph schema file name inside the rfc-graph schema directory */
const GRAPH_SCHEMA_FILENAME = 'graph.schema.json';

/** Absolute path to the rfc-graph schema directory */
const SCHEMA_DIR = path.resolve(__dirname, '../rfc-graph/schema');

/**
 * Parse command line arguments.
 *
 * @param {string[]} [args] — Test argument array (defaults to process.argv when omitted)
 * @returns {{ graphPath: string }}
 * @throws {Error} If the argument syntax is invalid
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function parseArguments(args) {
  const argv = args || process.argv.slice(2);
  if (argv.length !== 1) {
    throw new Error(`Exactly one --graph=<path> argument is required. Received ${argv.length}.`);
  }
  const flag = argv[0];
  if (!flag.startsWith(GRAPH_PATH_ARG_PREFIX)) {
    throw new Error(`First argument must be ${GRAPH_PATH_ARG_PREFIX}<path>.`);
  }
  const graphPath = flag.slice(GRAPH_PATH_ARG_PREFIX.length);
  if (!graphPath) {
    throw new Error('--graph=<path> value is empty.');
  }
  return { graphPath };
}

/**
 * Resolve a possibly relative graph path against the current working directory.
 *
 * @param {string} arg — Graph path argument
 * @returns {string} Absolute graph path
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function resolveGraphPath(arg) {
  return path.resolve(process.cwd(), arg);
}

/**
 * Read and structurally validate a graph JSON file.
 *
 * @param {string} graphPath — Path to the graph file
 * @returns {Object} Parsed graph data
 * @throws {Error} If the file is missing, unparseable, or structurally invalid
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function readGraphFile(graphPath) {
  const resolved = resolveGraphPath(graphPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Graph file not found: ${resolved}`);
  }

  let raw;
  try {
    raw = fs.readFileSync(resolved, 'utf8');
  } catch (readError) {
    throw new Error(`Failed to read graph file: ${readError.message}`);
  }

  let graph;
  try {
    graph = JSON.parse(raw);
  } catch (parseError) {
    throw new Error(`Failed to parse graph JSON: ${parseError.message}`);
  }

  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    throw new Error('Graph structure is invalid: nodes and edges are required.');
  }

  return graph;
}

/**
 * Validate a graph object against graph.schema.json.
 *
 * @param {Object} graph — Graph data to validate
 * @returns {{ valid: boolean, errors?: string[] }} Validation result
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function validateGraphSchema(graph) {
  return validateAgainstSchema(graph, GRAPH_SCHEMA_FILENAME, SCHEMA_DIR);
}

/**
 * Compose path resolution, file reading, and schema validation.
 *
 * @param {string} graphPath — Path to the graph file
 * @returns {{ ok: true, graph: Object }}
 * @throws {Error} On any validation failure
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function validateGraphArgument(graphPath) {
  const graph = readGraphFile(graphPath);
  const result = validateGraphSchema(graph);
  if (!result.valid) {
    throw new Error(`Graph schema violation:\n${result.errors.join('\n')}`);
  }
  return { ok: true, graph };
}

/**
 * main — CLI entry point.
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function main() {
  let graphPath;
  try {
    graphPath = parseArguments().graphPath;
  } catch (parseError) {
    console.error('[ERROR] Argument parse failed.');
    console.error(`Cause: ${parseError.message}`);
    console.error('Action: Re-run with --graph=<path>.');
    process.exit(EXIT_ARG_ERROR);
  }

  try {
    const result = validateGraphArgument(graphPath);
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exit(EXIT_SUCCESS);
  } catch (dataError) {
    console.error('[ERROR] Graph validation failed.');
    console.error(`Cause: ${dataError.message}`);
    console.error('Action: Provide a valid graph JSON file that satisfies graph.schema.json.');
    process.exit(EXIT_DATA_ERROR);
  }
}

// Call main only when executed as CLI
if (require.main === module) {
  main();
}

module.exports = {
  parseArguments,
  resolveGraphPath,
  readGraphFile,
  validateGraphSchema,
  validateGraphArgument,
  main,
  GRAPH_PATH_ARG_PREFIX,
  EXIT_SUCCESS,
  EXIT_DATA_ERROR,
  EXIT_ARG_ERROR,
};
