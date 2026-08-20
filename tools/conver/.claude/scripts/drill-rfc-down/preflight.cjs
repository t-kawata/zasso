#!/usr/bin/env node

/**
 * preflight.js — /drill-rfc-down Step 0: Preflight path validation
 *
 * Reads the material-path arguments and the current directory's Tickets.json,
 * resolves the three pipeline artifacts (RFC / GRAPH / Dirs-Tree) from
 * metadata.resolvedPaths (priority) with a metadata.source fallback, and checks
 * that every input (materials + pipeline artifacts + README.md) exists on disk.
 *
 * Exit-code contract:
 *   success → 0, prints the Markdown report on stdout (proceed to Step 1)
 *   any failure (missing/invalid Tickets.json, unresolvable pipeline paths,
 *   missing files, empty material directory, unknown flag) → 1, prints an
 *   error and abort instruction on stderr
 *
 * CLI:
 *   preflight.js [<material-file-or-dir> ...] [--tickets=<path>]
 *
 * Design context: tools/conver/README.md — 進化ループ / /drill-rfc-down (Step 0).
 */

const fs = require('fs');
const path = require('path');
const { fromHomeRelative } = require('../lib/path-utils');

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

const TICKETS_ARG_PREFIX = '--tickets=';
const TICKETS_FILENAME = 'Tickets.json';
const README_FILENAME = 'README.md';
const SESSION_DIR_NAME = 'drills';
const DRILL_DIR = '.claude/scripts/drill-rfc-down';
const VARIABLES_HEADER = '[VARIABLES]';
const VARIABLES_FOOTER = '[END VARIABLES]';

const ARTIFACT_LABELS = {
  rfc: 'RFC',
  graph: 'GRAPH',
  dirsTree: 'Dirs-Tree',
  readme: 'README.md',
};

/**
 * Parse command line arguments.
 *
 * @param {string[]} [args] — Test argument array (defaults to process.argv when omitted)
 * @returns {{ ticketsPath: string, materialArgs: string[] }}
 * @throws {Error} If an unknown flag (starting with `-`) is present
 */
function parseArguments(args) {
  const argv = args || process.argv.slice(2);
  let ticketsPath = '';
  const materialArgs = [];
  for (const arg of argv) {
    if (arg.startsWith(TICKETS_ARG_PREFIX)) {
      ticketsPath = arg.slice(TICKETS_ARG_PREFIX.length);
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown argument: ${arg}`);
    } else {
      materialArgs.push(arg);
    }
  }
  const resolvedTicketsPath = ticketsPath
    ? path.resolve(ticketsPath)
    : path.resolve(TICKETS_FILENAME);
  return { ticketsPath: resolvedTicketsPath, materialArgs };
}

/**
 * Recursively collect regular files under a directory.
 *
 * @param {string} dir — Absolute directory path
 * @returns {string[]} Absolute paths of regular files
 */
function collectFilesRecursive(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFilesRecursive(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Resolve material arguments into absolute file paths.
 *
 * A file argument is taken as-is; a directory argument is walked recursively and
 * every regular file under it is collected. An empty directory or a non-existent
 * path is an error.
 *
 * @param {string[]} materialArgs — Raw material arguments
 * @param {string} cwd — Working directory to resolve relative paths against
 * @returns {{ materialPaths: string[], materialSummary: Array<{ path: string, type: string, fileCount: number }> }}
 * @throws {Error} If a path is missing or a directory contains no files
 */
function collectMaterialPaths(materialArgs, cwd) {
  const materialPaths = [];
  const materialSummary = [];
  for (const arg of materialArgs) {
    const resolved = path.resolve(cwd, fromHomeRelative(arg));
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      const files = collectFilesRecursive(resolved);
      if (files.length === 0) {
        throw new Error(`Empty material directory: ${resolved}`);
      }
      materialPaths.push(...files);
      materialSummary.push({ path: resolved, type: 'directory', fileCount: files.length });
    } else if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      materialPaths.push(resolved);
      materialSummary.push({ path: resolved, type: 'file', fileCount: 1 });
    } else {
      throw new Error(`Material path not found: ${resolved}`);
    }
  }
  return { materialPaths, materialSummary };
}

/**
 * Read and parse Tickets.json.
 *
 * @param {string} ticketsPath — Absolute path to Tickets.json
 * @returns {Object} Parsed tickets object
 * @throws {Error} If the file is missing or not valid JSON
 */
function readTickets(ticketsPath) {
  if (!fs.existsSync(ticketsPath)) {
    throw new Error(`Tickets.json not found: ${ticketsPath}`);
  }
  const raw = fs.readFileSync(ticketsPath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Tickets.json is not valid JSON: ${ticketsPath} (${error.message})`);
  }
}

/**
 * Resolve the three pipeline artifact paths from Tickets.json metadata.
 *
 * Priority order:
 *   1. metadata.resolvedPaths (all three non-empty) — resolved as-is, no
 *      existence gate, so the Preflight can report which files are missing
 *   2. metadata.source (.md → derive -GRAPH/-Dirs-Tree; .json → invert -GRAPH)
 *   3. none — empty paths with a descriptive pathSource
 *
 * @param {Object} tickets — Parsed Tickets.json
 * @param {string} ticketsDir — Directory containing Tickets.json (base for relative paths)
 * @returns {{ rfcPath: string, graphPath: string, dirsTreePath: string, pathSource: string, sourcePath?: string }}
 */
function resolvePipelinePaths(tickets, ticketsDir) {
  const metadata = (tickets && tickets.metadata) || {};
  const resolvedPaths = metadata.resolvedPaths || null;
  const rawSource = metadata.source || '';

  if (resolvedPaths && resolvedPaths.rfcPath && resolvedPaths.graphPath && resolvedPaths.dirsTreePath) {
    return {
      rfcPath: path.resolve(ticketsDir, fromHomeRelative(resolvedPaths.rfcPath)),
      graphPath: path.resolve(ticketsDir, fromHomeRelative(resolvedPaths.graphPath)),
      dirsTreePath: path.resolve(ticketsDir, fromHomeRelative(resolvedPaths.dirsTreePath)),
      pathSource: 'resolvedPaths',
    };
  }

  if (!rawSource) {
    return { rfcPath: '', graphPath: '', dirsTreePath: '', pathSource: 'none' };
  }

  const resolvedSource = path.resolve(ticketsDir, fromHomeRelative(rawSource));
  if (!fs.existsSync(resolvedSource)) {
    return { rfcPath: '', graphPath: '', dirsTreePath: '', pathSource: 'not_found', sourcePath: resolvedSource };
  }

  const ext = path.extname(resolvedSource).toLowerCase();
  const dir = path.dirname(resolvedSource);

  if (ext === '.md') {
    const basename = path.basename(resolvedSource, '.md');
    return {
      rfcPath: resolvedSource,
      graphPath: path.join(dir, `${basename}-GRAPH.json`),
      dirsTreePath: path.join(dir, `${basename}-Dirs-Tree.json`),
      pathSource: 'metadata.source.md',
    };
  }

  if (ext === '.json') {
    const basename = path.basename(resolvedSource, '.json');
    const rfcBasename = basename.endsWith('-GRAPH') ? basename.slice(0, -6) : basename;
    return {
      rfcPath: path.join(dir, `${rfcBasename}.md`),
      graphPath: resolvedSource,
      dirsTreePath: path.join(dir, `${rfcBasename}-Dirs-Tree.json`),
      pathSource: 'metadata.source.json',
    };
  }

  return { rfcPath: '', graphPath: '', dirsTreePath: '', pathSource: 'unknown', sourcePath: resolvedSource };
}

/**
 * Split labeled paths into present and missing buckets.
 *
 * @param {Object} labeledPaths — Map of key → absolute path
 * @returns {{ present: Object, missing: Object }} Both keyed like the input
 */
function verifyExistence(labeledPaths) {
  const present = {};
  const missing = {};
  for (const [key, filePath] of Object.entries(labeledPaths)) {
    if (fs.existsSync(filePath)) {
      present[key] = filePath;
    } else {
      missing[key] = filePath;
    }
  }
  return { present, missing };
}

/**
 * Build the human-readable explanation for an unresolvable pipeline.
 *
 * @param {string} pathSource — The pathSource returned by resolvePipelinePaths
 * @param {string} sourcePath — The resolved metadata.source path (when relevant)
 * @returns {string} Error message
 */
function formatResolutionErrorMessage(pathSource, sourcePath) {
  switch (pathSource) {
    case 'none':
      return 'Cannot resolve pipeline paths: Tickets.json has neither metadata.resolvedPaths nor metadata.source.';
    case 'not_found':
      return `Cannot resolve pipeline paths: metadata.source file not found: ${sourcePath}`;
    case 'unknown':
      return `Cannot resolve pipeline paths: metadata.source has unknown format (neither .md nor .json): ${sourcePath}`;
    default:
      return 'Cannot resolve pipeline paths.';
  }
}

/**
 * Format the machine-bindable [VARIABLES] block for Step 1.
 *
 * Emits 8 VAR=value lines so the AI binds them verbatim without interpreting
 * the Markdown report. Wrapped in [VARIABLES] / [END VARIABLES] markers.
 *
 * @param {Object} vars — rfcPath, rfcDir, graphPath, dirsTreePath, readmePath, ticketsPath, sessionDir, drillDir
 * @returns {string} [VARIABLES] block
 */
function formatVariablesBlock(vars) {
  const { rfcPath, rfcDir, graphPath, dirsTreePath, readmePath, ticketsPath, sessionDir, drillDir } = vars;
  return [
    VARIABLES_HEADER,
    `RFC_PATH=${rfcPath}`,
    `RFC_DIR=${rfcDir}`,
    `GRAPH_PATH=${graphPath}`,
    `DIRS_TREE_PATH=${dirsTreePath}`,
    `README_PATH=${readmePath}`,
    `TICKETS_PATH=${ticketsPath}`,
    `SESSION_DIR=${sessionDir}`,
    `DRILL_DIR=${drillDir}`,
    VARIABLES_FOOTER,
  ].join('\n');
}

/**
 * Format the successful Preflight report as Markdown.
 *
 * @param {Object} params — materialSummary, pipeline paths, pathSource, present, variablesBlock (optional)
 * @returns {string} Markdown report
 */
function formatPreflightMarkdown({ materialSummary, pipeline, pathSource, present, variablesBlock }) {
  const { rfcPath, graphPath, dirsTreePath, readmePath } = pipeline;
  const materialSection = materialSummary.length === 0
    ? '### Input materials\n\nNone.'
    : '### Input materials\n\n| # | Material path | Type | Files |\n|---|---------------|------|-------|\n'
      + materialSummary
        .map((m, i) => `| ${i + 1} | ${m.path} | ${m.type} | ${m.fileCount} |`)
        .join('\n');

  const pipelineRows = [
    ['RFC', 'rfc', rfcPath],
    ['GRAPH', 'graph', graphPath],
    ['Dirs-Tree', 'dirsTree', dirsTreePath],
    ['README.md', 'readme', readmePath],
  ]
    .map(([label, key, artifactPath]) => `| ${label} | ${artifactPath} | ${present[key] ? '✅' : '❌'} |`)
    .join('\n');

  const lines = [
    '## /drill-rfc-down Preflight',
    '',
    '✅ All required files exist. Proceed to **Step 1: grill**.',
    '',
    materialSection,
    '',
    '### Pipeline artifacts',
    '',
    '| Artifact | Path | Status |',
    '|----------|------|--------|',
    pipelineRows,
    '',
    `Path source: ${pathSource}`,
    '',
    '**Next**: Read all materials and the RESIDUE in README.md, then proceed to **Step 1: grill**.',
  ];
  if (variablesBlock) {
    lines.push('', '### Variables for Step 1', '', variablesBlock);
  }
  return lines.join('\n');
}

/**
 * Format the abort message listing the missing artifacts.
 *
 * @param {Object} missing — Labeled paths that do not exist
 * @returns {string} Error message with abort instruction
 */
function formatAbortMessage(missing) {
  const lines = Object.entries(missing)
    .map(([key, filePath]) => `- ${ARTIFACT_LABELS[key] || key}: ${filePath}`);
  return [
    '[ERROR] /drill-rfc-down Preflight failed.',
    '',
    'Missing files:',
    ...lines,
    '',
    'Abort: fix the missing files and re-run `/drill-rfc-down`.',
  ].join('\n');
}

/**
 * main — CLI entry point (Step 0 Preflight).
 */
function main() {
  try {
    const { ticketsPath, materialArgs } = parseArguments();
    const tickets = readTickets(ticketsPath);
    const ticketsDir = path.dirname(ticketsPath);
    const { rfcPath, graphPath, dirsTreePath, pathSource, sourcePath } = resolvePipelinePaths(tickets, ticketsDir);
    if (!rfcPath || !graphPath || !dirsTreePath) {
      throw new Error(formatResolutionErrorMessage(pathSource, sourcePath || ''));
    }
    const materialResult = collectMaterialPaths(materialArgs, process.cwd());
    const readmePath = path.resolve(README_FILENAME);
    const { present, missing } = verifyExistence({
      rfc: rfcPath,
      graph: graphPath,
      dirsTree: dirsTreePath,
      readme: readmePath,
    });
    if (Object.keys(missing).length > 0) {
      process.stderr.write(`${formatAbortMessage(missing)}\n`);
      process.exit(EXIT_FAILURE);
    }
    const rfcDir = path.dirname(rfcPath);
    const variablesBlock = formatVariablesBlock({
      rfcPath,
      rfcDir,
      graphPath,
      dirsTreePath,
      readmePath,
      ticketsPath,
      sessionDir: path.join(rfcDir, SESSION_DIR_NAME),
      drillDir: DRILL_DIR,
    });
    process.stdout.write(`${formatPreflightMarkdown({
      ...materialResult,
      pipeline: { rfcPath, graphPath, dirsTreePath, readmePath },
      pathSource,
      present,
      variablesBlock,
    })}\n`);
    process.exit(EXIT_SUCCESS);
  } catch (error) {
    process.stderr.write(`[ERROR] /drill-rfc-down Preflight failed.\n\nCause: ${error.message}\n`);
    process.exit(EXIT_FAILURE);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArguments,
  collectMaterialPaths,
  collectFilesRecursive,
  readTickets,
  resolvePipelinePaths,
  verifyExistence,
  formatResolutionErrorMessage,
  formatPreflightMarkdown,
  formatAbortMessage,
  formatVariablesBlock,
  main,
  TICKETS_ARG_PREFIX,
  TICKETS_FILENAME,
  README_FILENAME,
  SESSION_DIR_NAME,
  DRILL_DIR,
  VARIABLES_HEADER,
  VARIABLES_FOOTER,
  ARTIFACT_LABELS,
  EXIT_SUCCESS,
  EXIT_FAILURE,
};
