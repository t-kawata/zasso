#!/usr/bin/env node

/**
 * derive-output-paths.js — Preflight: derive output paths and verify the sourceFile (C001)
 *
 * Serves as the /crystalize-readme Preflight. Reads the graph JSON, checks that the
 * graph's sourceFile RFC document exists on disk, and derives the output paths in
 * one invocation.
 *
 * CLI:
 *   derive-output-paths.js --graph=<path>                → prints {sourceFile, rfcDir, examplesDir, residuesDir, readmePath}
 *   derive-output-paths.js --graph=<path> --field=sourceFile → prints the expanded sourceFile
 *
 * Exit-code contract:
 *   success → 0, prints the derived paths plus sourceFile (or the expanded sourceFile)
 *   any Preflight failure (missing/invalid graph, missing sourceFile) → 1
 *
 * The actual RESIDUE filename (RESIDUE-<timestamp>.md) is generated separately by
 * generate-residue-filename.js at Step 4, so it is NOT derived here.
 *
 * Home-relative (~/...) sourceFile is expanded via fromHomeRelative() BEFORE
 * path.dirname so rfcDir never resolves to a literal "~" directory.
 */

const fs = require('fs');
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
 * Derive the output paths from a schema-validated graph.
 *
 * @param {Object} graph — Schema-validated graph
 * @returns {{ rfcDir, examplesDir, residuesDir, readmePath }}
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
  };
}

/**
 * Assert that the graph's sourceFile RFC document exists on disk.
 *
 * This is the Preflight gate: the pipeline cannot proceed unless the RFC design
 * document the graph was built from is actually present at the derived location.
 * The resolved path is returned so the caller (Step 0) can read the document.
 *
 * @param {Object} graph — Schema-validated graph
 * @returns {string} The resolved absolute sourceFile path
 * @throws {Error} If sourceFile is missing, not a non-empty string, or absent on disk
 */
// [::TICKET::] PX-153 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-153 --for-spec --no-implementation-order`.
function assertSourceFileExists(graph) {
  const sourceFile = graph && graph.sourceFile;
  if (typeof sourceFile !== 'string' || sourceFile.trim() === '') {
    throw new Error('graph.sourceFile must be a non-empty string.');
  }
  const resolved = path.resolve(fromHomeRelative(sourceFile));
  if (!fs.existsSync(resolved)) {
    throw new Error(`sourceFile not found: ${resolved}`);
  }
  return resolved;
}

/**
 * main — CLI entry point (Preflight).
 */
// [::TICKET::] PX-152, PX-153 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-152|PX-153) --for-spec --no-implementation-order`.
function main() {
  try {
    const { graphPath, field } = parseArguments();
    const graph = readGraphFile(graphPath);
    const expandedSourceFile = assertSourceFileExists(graph);

    if (field === SOURCE_FILE_FIELD) {
      process.stdout.write(expandedSourceFile + '\n');
      process.exit(0);
    }

    const paths = deriveOutputPaths(graph);
    process.stdout.write(JSON.stringify({ sourceFile: expandedSourceFile, ...paths }) + '\n');
    process.exit(0);
  } catch (error) {
    console.error('[ERROR] Preflight failed.');
    console.error(`Cause: ${error.message}`);
    process.exit(1);
  }
}

// Call main only when executed as CLI
if (require.main === module) {
  main();
}

module.exports = {
  parseArguments,
  deriveOutputPaths,
  assertSourceFileExists,
  main,
  GRAPH_PATH_ARG_PREFIX,
  FIELD_ARG_PREFIX,
  SOURCE_FILE_FIELD,
  EXAMPLES_DIR_NAME,
  RESIDUES_DIR_NAME,
  README_FILENAME,
};
