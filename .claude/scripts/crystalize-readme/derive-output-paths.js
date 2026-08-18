#!/usr/bin/env node

/**
 * derive-output-paths.js — Preflight: derive output paths and detect run mode (C001)
 *
 * Serves as the /crystalize-readme Preflight. Reads the graph JSON, checks that the
 * graph's sourceFile RFC document exists on disk, detects whether a previous run
 * left artifacts (README.md / CRYSTALIZE-Status.json) to decide fresh vs refine,
 * and prints a friendly English Markdown report.
 *
 * CLI:
 *   derive-output-paths.js --graph=<path>                → prints a Markdown report
 *   derive-output-paths.js --graph=<path> --field=sourceFile → prints the expanded sourceFile
 *
 * Exit-code contract:
 *   success → 0, prints the Markdown report (or the expanded sourceFile)
 *   any Preflight failure (missing/invalid graph, missing sourceFile) → 1
 *
 * RESIDUE file output is abolished (PX-156); residue lives only as in-README
 * markers, so no residues directory is derived here.
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

/** README filename inside rfcDir */
const README_FILENAME = 'README.md';

/** Status filename inside rfcDir (managed by update-step-status.js) */
const CRYSTALIZE_STATUS_FILENAME = 'CRYSTALIZE-Status.json';

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
 * @returns {{ rfcDir, examplesDir, readmePath }}
 * @throws {Error} If sourceFile is missing or not a non-empty string
 */
// [::TICKET::] PX-152, PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-152|PX-156) --for-spec --no-implementation-order`.
function deriveOutputPaths(graph) {
  const sourceFile = graph && graph.sourceFile;
  if (typeof sourceFile !== 'string' || sourceFile.trim() === '') {
    throw new Error('graph.sourceFile must be a non-empty string.');
  }

  const expanded = fromHomeRelative(sourceFile);
  const rfcDir = path.dirname(path.resolve(expanded));
  const examplesDir = path.join(rfcDir, EXAMPLES_DIR_NAME);

  return {
    rfcDir,
    examplesDir,
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
 * Detect the run mode from the presence of previous artifacts.
 *
 * A previous /crystalize-readme run leaves README.md and/or CRYSTALIZE-Status.json
 * in rfcDir; either one being present means this execution refines/updates the
 * existing artifacts. Neither present means a fresh start.
 *
 * @param {{ readmeExists: boolean, statusExists: boolean }} flags — Artifact existence
 * @returns {'fresh'|'refine'} Run mode
 */
// [::TICKET::] PX-155 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-155 --for-spec --no-implementation-order`.
function detectMode({ readmeExists, statusExists }) {
  return readmeExists || statusExists ? 'refine' : 'fresh';
}

/**
 * Format the Preflight report as friendly English Markdown.
 *
 * @param {Object} paths — Derived paths including sourceFile
 * @param {'fresh'|'refine'} mode — Run mode
 * @param {{ readmeExists: boolean, statusExists: boolean }} flags — Artifact existence
 * @returns {string} Markdown report
 */
// [::TICKET::] PX-155 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-155 --for-spec --no-implementation-order`.
function formatPreflightMarkdown(paths, mode, flags) {
  const modeLine = mode === 'fresh'
    ? '**Mode: fresh** — No previous run was detected (no README.md or CRYSTALIZE-Status.json). This execution will start from scratch.'
    : '**Mode: refine** — A previous /crystalize-readme run was detected (README.md and/or CRYSTALIZE-Status.json exists). This execution will refine and update the existing artifacts.';

  const pathRows = [
    ['sourceFile', paths.sourceFile],
    ['rfcDir', paths.rfcDir],
    ['examplesDir', paths.examplesDir],
    ['readmePath', paths.readmePath],
  ].map(([key, value]) => `| ${key} | ${value} |`).join('\n');

  const existenceFlags = [
    '- sourceFile exists: yes',
    `- README.md exists: ${flags.readmeExists ? 'yes' : 'no'}`,
    `- CRYSTALIZE-Status.json exists: ${flags.statusExists ? 'yes' : 'no'}`,
  ].join('\n');

  return [
    '## crystalize-readme Preflight',
    '',
    modeLine,
    '',
    '| Path | Value |',
    '|------|-------|',
    pathRows,
    '',
    existenceFlags,
    '',
  ].join('\n');
}

/**
 * main — CLI entry point (Preflight).
 */
// [::TICKET::] PX-152, PX-153, PX-155 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-152|PX-153|PX-155) --for-spec --no-implementation-order`.
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
    const readmeExists = fs.existsSync(paths.readmePath);
    const statusExists = fs.existsSync(path.join(paths.rfcDir, CRYSTALIZE_STATUS_FILENAME));
    const mode = detectMode({ readmeExists, statusExists });
    process.stdout.write(formatPreflightMarkdown({ sourceFile: expandedSourceFile, ...paths }, mode, { readmeExists, statusExists }) + '\n');
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
  detectMode,
  formatPreflightMarkdown,
  main,
  GRAPH_PATH_ARG_PREFIX,
  FIELD_ARG_PREFIX,
  SOURCE_FILE_FIELD,
  EXAMPLES_DIR_NAME,
  README_FILENAME,
  CRYSTALIZE_STATUS_FILENAME,
};
