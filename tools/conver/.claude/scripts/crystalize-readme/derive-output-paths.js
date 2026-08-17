#!/usr/bin/env node

/**
 * derive-output-paths.js — Derive output paths from the graph sourceFile (Step 0, C001)
 *
 * CLI:
 *   derive-output-paths.js --graph=<path>                → prints {rfcDir, examplesDir, residuesDir, readmePath, residuePath}
 *   derive-output-paths.js --graph=<path> --field=sourceFile → prints the expanded sourceFile
 *
 * Home-relative (~/...) sourceFile is expanded via fromHomeRelative() BEFORE
 * path.dirname so rfcDir never resolves to a literal "~" directory.
 */

const path = require('path');
const { fromHomeRelative } = require('../lib/path-utils');
const { readGraphFile } = require('./validate-graph-arg.js');

/** CLI argument prefix specifying the graph file path */
const GRAPH_PATH_ARG_PREFIX = '--graph=';

/** CLI argument prefix for selecting a single derived field */
const FIELD_ARG_PREFIX = '--field=';

/** The only supported --field value */
const SOURCE_FILE_FIELD = 'sourceFile';

/** Name of the implementation-samples directory under rfcDir */
const EXAMPLES_DIR_NAME = 'examples';

/** Name of the residues directory under rfcDir */
const RESIDUES_DIR_NAME = 'residues';

/** README filename inside rfcDir */
const README_FILENAME = 'README.md';

/** RESIDUE filename prefix (timestamp is injected by generate-residue-filename.js) */
const RESIDUE_FILENAME_PREFIX = 'RESIDUE-';

/** RESIDUE filename template with the timestamp placeholder */
const RESIDUE_FILENAME_PLACEHOLDER = 'RESIDUE-<YYYYMMDDhhmmss>.md';

/**
 * Parse command line arguments.
 *
 * @param {string[]} [args] — Test argument array (defaults to process.argv when omitted)
 * @returns {{ graphPath: string, field: string|undefined }}
 * @throws {Error} If the argument syntax is invalid
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function parseArguments(args) {
  const argv = args || process.argv.slice(2);
  let graphPath = null;
  let field;
  for (const arg of argv) {
    if (arg.startsWith(GRAPH_PATH_ARG_PREFIX)) {
      graphPath = arg.slice(GRAPH_PATH_ARG_PREFIX.length);
    } else if (arg.startsWith(FIELD_ARG_PREFIX)) {
      field = arg.slice(FIELD_ARG_PREFIX.length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!graphPath) {
    throw new Error('--graph=<path> is required.');
  }
  if (field !== undefined && field !== SOURCE_FILE_FIELD) {
    throw new Error(`Unknown --field value: ${field}. Supported: ${SOURCE_FILE_FIELD}.`);
  }
  return { graphPath, field };
}

/**
 * Derive the 5 output paths from a schema-validated graph.
 *
 * @param {Object} graph — Schema-validated graph
 * @returns {{ rfcDir, examplesDir, residuesDir, readmePath, residuePath }}
 * @throws {Error} If sourceFile is missing or not a non-empty string
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function deriveOutputPaths(graph) {
  const sourceFile = graph && graph.sourceFile;
  if (typeof sourceFile !== 'string' || sourceFile.trim() === '') {
    throw new Error('graph.sourceFile must be a non-empty string.');
  }

  const expanded = fromHomeRelative(sourceFile);
  const rfcDir = path.dirname(path.resolve(expanded));
  const examplesDir = path.join(rfcDir, EXAMPLES_DIR_NAME);
  const residuesDir = path.join(rfcDir, RESIDUES_DIR_NAME);

  return {
    rfcDir,
    examplesDir,
    residuesDir,
    readmePath: path.join(rfcDir, README_FILENAME),
    residuePath: path.join(residuesDir, RESIDUE_FILENAME_PLACEHOLDER),
  };
}

/**
 * main — CLI entry point.
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function main() {
  const { graphPath, field } = parseArguments();
  const graph = readGraphFile(graphPath);

  if (field === SOURCE_FILE_FIELD) {
    const expanded = path.resolve(fromHomeRelative(graph.sourceFile));
    process.stdout.write(expanded + '\n');
    process.exit(0);
  }

  const paths = deriveOutputPaths(graph);
  process.stdout.write(JSON.stringify(paths) + '\n');
  process.exit(0);
}

// Call main only when executed as CLI
if (require.main === module) {
  main();
}

module.exports = {
  parseArguments,
  deriveOutputPaths,
  main,
  GRAPH_PATH_ARG_PREFIX,
  FIELD_ARG_PREFIX,
  SOURCE_FILE_FIELD,
  EXAMPLES_DIR_NAME,
  RESIDUES_DIR_NAME,
  README_FILENAME,
  RESIDUE_FILENAME_PREFIX,
  RESIDUE_FILENAME_PLACEHOLDER,
};
