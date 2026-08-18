#!/usr/bin/env node

/**
 * emit-readme-skeleton.js — Emit the README.md skeleton at the end of Step 1 (PX-156)
 *
 * CLI: emit-readme-skeleton.js --status=<path> --readme=<path>
 *   or: emit-readme-skeleton.js --graph=<path> --readme=<path>
 *
 * The skeleton contains the confirmed heading group (from CRYSTALIZE-Status.json
 * grill.toc.nodes) plus the mandatory trailing examples section. Each usage
 * heading is followed by a <::TEMPLATE-README::> marker line; the examples
 * heading by <::TEMPLATE-EXAMPLES::>. Refine-mode safety: a README.md that still
 * contains unresolved <::TEMPLATE-*::> markers is never overwritten.
 */

const fs = require('fs');
const path = require('path');
const { fromHomeRelative } = require('../lib/path-utils');
const { readGraphFile } = require('./validate-graph-arg.js');
const {
  MARKER_TEMPLATE_README,
  MARKER_TEMPLATE_EXAMPLES,
  TRAILING_SECTION_TITLE,
} = require('./validate-marker-grammar.js');

/** CLI flag: explicit status file path */
const FLAG_STATUS = '--status=';

/** CLI flag: graph path from which the status path is derived */
const FLAG_GRAPH = '--graph=';

/** CLI flag: README output path */
const FLAG_README = '--readme=';

/** Fixed status filename inside rfcDir */
const CRYSTALIZE_STATUS_FILENAME = 'CRYSTALIZE-Status.json';

/**
 * Parse command line arguments.
 *
 * @param {string[]} [args] — Test argument array (defaults to process.argv when omitted)
 * @returns {{ statusPath: string|null, graphPath: string|null, readmePath: string }}
 * @throws {Error} If the argument syntax is invalid
 */
// [::TICKET::] PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-156 --for-spec --no-implementation-order`.
function parseArguments(args) {
  const argv = args || process.argv.slice(2);
  let statusPath = null;
  let graphPath = null;
  let readmePath = null;
  for (const arg of argv) {
    if (arg.startsWith(FLAG_STATUS)) {
      statusPath = arg.slice(FLAG_STATUS.length);
    } else if (arg.startsWith(FLAG_GRAPH)) {
      graphPath = arg.slice(FLAG_GRAPH.length);
    } else if (arg.startsWith(FLAG_README)) {
      readmePath = arg.slice(FLAG_README.length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (statusPath && graphPath) {
    throw new Error('Specify either --status or --graph, not both.');
  }
  if (!statusPath && !graphPath) {
    throw new Error('--status=<path> or --graph=<path> is required.');
  }
  if (!readmePath) {
    throw new Error('--readme=<path> is required.');
  }
  return { statusPath, graphPath, readmePath };
}

/**
 * Resolve the status file path: explicit --status or derived from --graph.
 *
 * @param {{ statusPath: string|null, graphPath: string|null }} parsed — Parsed arguments
 * @returns {string} Absolute status file path
 */
// [::TICKET::] PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-156 --for-spec --no-implementation-order`.
function resolveStatusPath(parsed) {
  if (parsed.statusPath) return parsed.statusPath;
  const graph = readGraphFile(parsed.graphPath);
  const expandedSource = path.resolve(fromHomeRelative(graph.sourceFile));
  return path.join(path.dirname(expandedSource), CRYSTALIZE_STATUS_FILENAME);
}

/**
 * Read the status file as JSON.
 *
 * @param {string} statusPath — Status file path
 * @returns {Object} Status data
 */
// [::TICKET::] PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-156 --for-spec --no-implementation-order`.
function readStatus(statusPath) {
  return JSON.parse(fs.readFileSync(statusPath, 'utf8'));
}

/**
 * Emit the README.md skeleton from a status object.
 *
 * @param {Object} status — CRYSTALIZE-Status.json content
 * @returns {string} README skeleton with per-section work-unit markers
 */
// [::TICKET::] PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-156 --for-spec --no-implementation-order`.
function emitSkeleton(status) {
  const title = path.basename(status.sourceFile, '.md');
  const lines = [
    `# ${title}`,
    '',
    `> 対象 RFC: ${status.sourceFile}`,
    `> 生成グラフ: ${status.graphFile}`,
    '',
  ];
  const nodes = (status.grill && status.grill.toc && status.grill.toc.nodes) || [];
  for (const node of nodes) {
    lines.push(`${'#'.repeat(node.level)} ${node.heading}`, '', MARKER_TEMPLATE_README, '');
  }
  lines.push(`## ${TRAILING_SECTION_TITLE}`, '', MARKER_TEMPLATE_EXAMPLES, '');
  return lines.join('\n');
}

/**
 * Write the skeleton to a file, refusing to overwrite a README that still has
 * unresolved <::TEMPLATE-*::> markers (refine-mode safety).
 *
 * @param {Object} status — CRYSTALIZE-Status.json content
 * @param {string} readmePath — README output path
 * @returns {string} The skeleton text written
 * @throws {Error} If the target file still contains unresolved TEMPLATE markers
 */
// [::TICKET::] PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-156 --for-spec --no-implementation-order`.
function emitSkeletonToFile(status, readmePath) {
  if (fs.existsSync(readmePath)) {
    const existing = fs.readFileSync(readmePath, 'utf8');
    if (existing.includes(MARKER_TEMPLATE_README) || existing.includes(MARKER_TEMPLATE_EXAMPLES)) {
      throw new Error(`Refusing to overwrite ${readmePath}: it still contains unresolved <::TEMPLATE-*::> markers.`);
    }
  }
  const text = emitSkeleton(status);
  const tmpPath = `${readmePath}.tmp.${process.pid}`;
  fs.writeFileSync(tmpPath, text, 'utf8');
  fs.renameSync(tmpPath, readmePath);
  return text;
}

/**
 * main — CLI entry point.
 */
// [::TICKET::] PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-156 --for-spec --no-implementation-order`.
function main() {
  const parsed = parseArguments();
  const statusPath = resolveStatusPath(parsed);
  const status = readStatus(statusPath);
  const text = emitSkeletonToFile(status, parsed.readmePath);
  process.stdout.write(`Skeleton written to ${parsed.readmePath}\n`);
  process.stdout.write(text + '\n');
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArguments,
  resolveStatusPath,
  readStatus,
  emitSkeleton,
  emitSkeletonToFile,
  main,
  FLAG_STATUS,
  FLAG_GRAPH,
  FLAG_README,
};
