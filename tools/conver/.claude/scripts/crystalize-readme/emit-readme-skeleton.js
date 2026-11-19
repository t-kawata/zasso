#!/usr/bin/env node

/**
 * emit-readme-skeleton.js — Emit the README.md skeleton at the end of Step 1 (PX-156)
 *
 * CLI: emit-readme-skeleton.js --graph=<path>   (or --status=<path>)
 *
 * The skeleton contains the confirmed heading group (from CRYSTALIZE-Status.json
 * grill.toc.nodes) plus the mandatory trailing examples section. Each usage
 * heading is followed by a <::TEMPLATE-README::> marker line; the examples
 * heading by <::TEMPLATE-EXAMPLES::>.
 *
 * The output path is derived internally: rfcDir = dirname(sourceFile),
 * readmePath = <rfcDir>/README.md. There is no --readme flag.
 *
 * Runs in BOTH fresh and refine modes. Refine mode re-emits the skeleton from the
 * confirmed heading group, overwriting the previous README.md, so that Step 2
 * re-analyzes every section from scratch.
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
const { assertReadmeLanguage } = require('./validate-readme-language.js');

/** CLI flag: explicit status file path */
const FLAG_STATUS = '--status=';

/** CLI flag: graph path from which the status path is derived */
const FLAG_GRAPH = '--graph=';

/** CLI flag: refine plan JSON */
const FLAG_PLAN = '--plan=';

/** CLI flag: reject non-English letters in the emitted README */
const FLAG_ENGLISH_ONLY = '--english-only';

/** CLI flag: package root when it differs from rfcDir */
const FLAG_PACKAGE_ROOT = '--package-root=';

/** Fixed status filename inside rfcDir */
const CRYSTALIZE_STATUS_FILENAME = 'CRYSTALIZE-Status.json';

/** Fixed README filename inside the package root or rfcDir */
const README_FILENAME = 'README.md';

/** One-time human README copy written before the first skeleton overwrite */
const BACKUP_FILENAME = 'README.pre-crystalize.md';

/** Any crystalize marker proves the README is generated, not human-owned. */
const CRYSTALIZE_MARKER_PATTERN = /<::(?:TEMPLATE-README|README-RESIDUE|TEMPLATE-EXAMPLES|EXAMPLES-RESIDUE)::>/;

/** A preserved body must be body-only; a heading would duplicate the heading line. */
const HEADING_LINE_PATTERN = /^#+\s+\S/m;

/**
 * Parse command line arguments.
 *
 * @param {string[]} [args] — Test argument array (defaults to process.argv when omitted)
 * @returns {{ statusPath: string|null, graphPath: string|null }}
 * @throws {Error} If the argument syntax is invalid
 */
// [::TICKET::] PX-156, PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-156|PX-451|PX-452) --for-spec --no-implementation-order`.
function parseArguments(args) {
  const argv = args || process.argv.slice(2);
  let statusPath = null;
  let graphPath = null;
  let planPath = null;
  let packageRoot = null;
  let englishOnly = false;
  for (const arg of argv) {
    if (arg.startsWith(FLAG_STATUS)) {
      statusPath = arg.slice(FLAG_STATUS.length);
    } else if (arg.startsWith(FLAG_GRAPH)) {
      graphPath = arg.slice(FLAG_GRAPH.length);
    } else if (arg.startsWith(FLAG_PLAN)) {
      planPath = arg.slice(FLAG_PLAN.length);
    } else if (arg.startsWith(FLAG_PACKAGE_ROOT)) {
      packageRoot = arg.slice(FLAG_PACKAGE_ROOT.length);
    } else if (arg === FLAG_ENGLISH_ONLY) {
      englishOnly = true;
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
  return { statusPath, graphPath, planPath, packageRoot, englishOnly };
}

/**
 * Resolve the status file path: explicit --status or derived from --graph.
 *
 * @param {{ statusPath: string|null, graphPath: string|null }} parsed — Parsed arguments
 * @returns {string} Absolute status file path
 */
// [::TICKET::] PX-156 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-156 --for-spec --no-implementation-order`.
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
// [::TICKET::] PX-156 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-156 --for-spec --no-implementation-order`.
function readStatus(statusPath) {
  return JSON.parse(fs.readFileSync(statusPath, 'utf8'));
}

/**
 * Derive the README output path: packageRoot when supplied, else rfcDir.
 *
 * @param {Object} status — CRYSTALIZE-Status.json content
 * @param {{packageRoot?: string|null}} [options]
 * @returns {string} Absolute README path
 */
// [::TICKET::] PX-156, PX-452, PX-451 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-156|PX-452|PX-451) --for-spec --no-implementation-order`.
function deriveReadmePath(status, options = {}) {
  const base = options.packageRoot || path.dirname(status.sourceFile);
  return path.join(base, README_FILENAME);
}

/**
 * Copy a human README to README.pre-crystalize.md exactly once.
 *
 * A README carrying a crystalize marker is generated, not human-owned. An
 * existing backup is never overwritten, and COPYFILE_EXCL makes that guarantee
 * hold under a race as well.
 *
 * @param {string} readmePath — target README path
 * @returns {{backedUp: boolean, reason?: string, backupPath?: string}}
 */
// [::TICKET::] PX-452, PX-451 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-452|PX-451) --for-spec --no-implementation-order`.
function backupHumanReadme(readmePath) {
  if (!fs.existsSync(readmePath)) return { backedUp: false, reason: 'no-readme' };
  const backupPath = path.join(path.dirname(readmePath), BACKUP_FILENAME);
  if (fs.existsSync(backupPath)) return { backedUp: false, reason: 'backup-exists', backupPath };
  const text = fs.readFileSync(readmePath, 'utf8');
  if (CRYSTALIZE_MARKER_PATTERN.test(text)) return { backedUp: false, reason: 'marked-readme' };
  try {
    fs.copyFileSync(readmePath, backupPath, fs.constants.COPYFILE_EXCL);
  } catch (error) {
    if (error.code === 'EEXIST') return { backedUp: false, reason: 'backup-exists', backupPath };
    throw error;
  }
  return { backedUp: true, backupPath };
}

/**
 * Emit the README.md skeleton from a status object.
 *
 * @param {Object} status — CRYSTALIZE-Status.json content
 * @returns {string} README skeleton with per-section work-unit markers
 */
// [::TICKET::] PX-156, PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-156|PX-451|PX-452) --for-spec --no-implementation-order`.
function emitSkeleton(status, options = {}) {
  const title = path.basename(status.sourceFile, '.md');
  const lines = [
    `# ${title}`,
    '',
    `> Source RFC: ${status.sourceFile}`,
    `> Generated graph: ${status.graphFile}`,
    '',
  ];

  const planNodes = options.plan && Array.isArray(options.plan.nodes) ? options.plan.nodes : null;
  const nodes = planNodes || (status.grill && status.grill.toc && status.grill.toc.nodes) || [];
  for (const node of nodes) {
    lines.push(`${'#'.repeat(node.level || String(node.id).split('-').length)} ${node.heading}`, '');
    if (node.action === 'preserve' && typeof node.body === 'string') {
      if (HEADING_LINE_PATTERN.test(node.body)) {
        throw new Error(`preserved body must not include a heading: ${node.id}`);
      }
      lines.push(node.body, '');
    } else {
      lines.push(MARKER_TEMPLATE_README, '');
    }
  }

  const examples = options.plan && options.plan.examples;
  lines.push(`# ${TRAILING_SECTION_TITLE}`, '');
  if (examples && examples.action === 'preserve' && typeof examples.body === 'string') {
    if (HEADING_LINE_PATTERN.test(examples.body)) {
      throw new Error('preserved examples body must not include a heading');
    }
    lines.push(examples.body, '');
  } else {
    lines.push(MARKER_TEMPLATE_EXAMPLES, '');
  }
  return lines.join('\n');
}

/**
 * Write the skeleton to the internally-derived README path, atomically.
 *
 * BOTH modes emit the skeleton. In refine mode the previous README.md is
 * overwritten: the confirmed heading group replaces the old headings and every
 * section is re-marked TEMPLATE, so Step 2 re-analyzes all sections from scratch.
 *
 * @param {Object} status — CRYSTALIZE-Status.json content
 * @returns {string} The skeleton text written
 */
// [::TICKET::] PX-156, PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-156|PX-451|PX-452) --for-spec --no-implementation-order`.
function emitSkeletonToFile(status, options = {}) {
  const readmePath = deriveReadmePath(status, options);
  const text = emitSkeleton(status, options);
  if (options.englishOnly) assertReadmeLanguage(text);
  backupHumanReadme(readmePath);
  const tmpPath = `${readmePath}.tmp.${process.pid}`;
  fs.writeFileSync(tmpPath, text, 'utf8');
  fs.renameSync(tmpPath, readmePath);
  return text;
}

/**
 * main — CLI entry point.
 */
// [::TICKET::] PX-156, PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-156|PX-451|PX-452) --for-spec --no-implementation-order`.
function main() {
  const parsed = parseArguments();
  const statusPath = resolveStatusPath(parsed);
  const status = readStatus(statusPath);
  const plan = parsed.planPath ? JSON.parse(fs.readFileSync(parsed.planPath, 'utf8')) : null;
  const options = {
    plan,
    englishOnly: parsed.englishOnly,
    packageRoot: parsed.packageRoot,
  };
  const text = emitSkeletonToFile(status, options);
  process.stdout.write(`Skeleton written to ${deriveReadmePath(status, options)}\n`);
  process.stdout.write(text + '\n');
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArguments,
  resolveStatusPath,
  readStatus,
  deriveReadmePath,
  backupHumanReadme,
  emitSkeleton,
  emitSkeletonToFile,
  main,
  FLAG_STATUS,
  FLAG_GRAPH,
  FLAG_PACKAGE_ROOT,
  BACKUP_FILENAME,
  README_FILENAME,
};
