#!/usr/bin/env node

/**
 * check-readme-writable.js — Decide branch (a) README vs (b) RESIDUE (Step 3, C002)
 *
 * CLI: check-readme-writable.js --graph=<path> [--examples-spec=<path>]
 *
 * Prints {"branch":"README"|"RESIDUE","reasons":[...]}. Exit 0 for README,
 * exit 1 for RESIDUE.
 *
 * The 4 branch conditions are evaluated independently:
 *   1. graphVerificationFailed — rfc-graph/verify.js reports uncoveredHeadings,
 *      isolatedNodes, or unresolvableRefs
 *   2. unresolvedOmissions     — an omissions JSON exists under rfcDir/omissions/
 *   3. missingExamples         — examplesDir missing/empty, or an examples spec
 *      has unresolvable sample references
 *   4. grillInconsistent       — CRYSTALIZE-Status.json lacks tocApproved and
 *      examplesApproved
 *
 * The decision is deterministic: no Date.now()/Math.random() inside.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { readGraphFile } = require('./validate-graph-arg.js');
const { deriveOutputPaths } = require('./derive-output-paths.js');
const { parseSpec, validateExamplesSpec } = require('./validate-examples-spec.js');
const { fromHomeRelative } = require('../lib/path-utils');

/** CLI argument prefix specifying the graph file path */
const GRAPH_PATH_ARG_PREFIX = '--graph=';

/** CLI argument prefix specifying an optional examples spec file */
const EXAMPLES_SPEC_ARG_PREFIX = '--examples-spec=';

/** Fixed name of the grill status file inside rfcDir */
const CRYSTALIZE_STATUS_FILENAME = 'CRYSTALIZE-Status.json';

/** Omissions JSON filename pattern inside rfcDir/omissions/ */
const OMISSIONS_FILE_RE = /^OMISSIONS-.*\.json$/;

/** Absolute path to the rfc-graph verify.js script */
const VERIFY_SCRIPT = path.resolve(__dirname, '../rfc-graph/verify.js');

/** Reason key: graph verification failed */
const REASON_GRAPH_VERIFICATION = 'graphVerificationFailed';

/** Reason key: unresolved omissions inventory exists */
const REASON_OMISSIONS = 'unresolvedOmissions';

/** Reason key: examples directory or sample references are missing */
const REASON_EXAMPLES = 'missingExamples';

/** Reason key: grill approvals are missing or inconsistent */
const REASON_GRILL = 'grillInconsistent';

/**
 * Parse command line arguments.
 *
 * @param {string[]} [args] — Test argument array (defaults to process.argv when omitted)
 * @returns {{ graphPath: string, examplesSpecPath: string|undefined }}
 * @throws {Error} If the argument syntax is invalid
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function parseArguments(args) {
  const argv = args || process.argv.slice(2);
  let graphPath;
  let examplesSpecPath;
  for (const arg of argv) {
    if (arg.startsWith(GRAPH_PATH_ARG_PREFIX)) {
      graphPath = arg.slice(GRAPH_PATH_ARG_PREFIX.length);
    } else if (arg.startsWith(EXAMPLES_SPEC_ARG_PREFIX)) {
      examplesSpecPath = arg.slice(EXAMPLES_SPEC_ARG_PREFIX.length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!graphPath) {
    throw new Error('--graph=<path> is required.');
  }
  return { graphPath, examplesSpecPath };
}

/**
 * Pure decision: map the 4 booleans to a branch and a reason list.
 *
 * @param {{ graphVerificationOk: boolean, hasUnresolvedOmissions: boolean, hasExamples: boolean, grillApproved: boolean }} conditions
 * @returns {{ branch: 'README'|'RESIDUE', reasons: string[] }}
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function evaluateWritableConditions(conditions) {
  const reasons = [];
  if (!conditions.graphVerificationOk) reasons.push(REASON_GRAPH_VERIFICATION);
  if (conditions.hasUnresolvedOmissions) reasons.push(REASON_OMISSIONS);
  if (!conditions.hasExamples) reasons.push(REASON_EXAMPLES);
  if (!conditions.grillApproved) reasons.push(REASON_GRILL);
  return { branch: reasons.length === 0 ? 'README' : 'RESIDUE', reasons };
}

/**
 * Condition 1: spawn rfc-graph/verify.js and parse its JSON verdict.
 *
 * @param {string} graphPath — Graph file path
 * @param {string} sourceFile — Expanded source file path
 * @returns {boolean} true when verification passes
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function verifyGraph(graphPath, sourceFile) {
  const result = spawnSync('node', [VERIFY_SCRIPT, `--graph=${graphPath}`, `--source=${sourceFile}`], {
    encoding: 'utf8',
  });
  if (result.error) return false;
  try {
    return JSON.parse(result.stdout).ok === true;
  } catch {
    return false;
  }
}

/**
 * Condition 2: an unresolved omissions JSON exists under rfcDir/omissions/.
 *
 * @param {string} rfcDir — Directory of the RFC document
 * @returns {boolean} true when unresolved omissions exist
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function hasUnresolvedOmissions(rfcDir) {
  const omissionsDir = path.join(rfcDir, 'omissions');
  if (!fs.existsSync(omissionsDir)) return false;
  return fs.readdirSync(omissionsDir).some((file) => OMISSIONS_FILE_RE.test(file));
}

/**
 * Condition 3: examplesDir exists, is non-empty, and any provided examples
 * spec has all sample references resolved.
 *
 * @param {string} examplesDir — Absolute examples directory
 * @param {string} [examplesSpecPath] — Optional examples spec file
 * @returns {boolean} true when examples are present
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function hasExamples(examplesDir, examplesSpecPath) {
  if (!fs.existsSync(examplesDir)) return false;
  const entries = fs.readdirSync(examplesDir);
  if (entries.length === 0) return false;
  if (examplesSpecPath && fs.existsSync(examplesSpecPath)) {
    try {
      return validateExamplesSpec(parseSpec(examplesSpecPath), examplesDir).ok;
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Condition 4: CRYSTALIZE-Status.json records both grill approvals.
 *
 * @param {string} rfcDir — Directory of the RFC document
 * @returns {boolean} true when both approvals are recorded
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function readGrillStatus(rfcDir) {
  const statusPath = path.join(rfcDir, CRYSTALIZE_STATUS_FILENAME);
  if (!fs.existsSync(statusPath)) return false;
  try {
    const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    return (
      status.grill &&
      status.grill.tocApproved === true &&
      status.grill.examplesApproved === true
    );
  } catch {
    return false;
  }
}

/**
 * Collect the 4 condition booleans from real dependencies.
 *
 * @param {string} graphPath — Graph file path
 * @param {string} [examplesSpecPath] — Optional examples spec file
 * @returns {{ graphVerificationOk: boolean, hasUnresolvedOmissions: boolean, hasExamples: boolean, grillApproved: boolean }}
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function collectConditions(graphPath, examplesSpecPath) {
  const graph = readGraphFile(graphPath);
  const paths = deriveOutputPaths(graph);
  const expandedSource = path.resolve(fromHomeRelative(graph.sourceFile));
  return {
    graphVerificationOk: verifyGraph(graphPath, expandedSource),
    hasUnresolvedOmissions: hasUnresolvedOmissions(paths.rfcDir),
    hasExamples: hasExamples(paths.examplesDir, examplesSpecPath),
    grillApproved: readGrillStatus(paths.rfcDir),
  };
}

/**
 * Compose the branch decision for a graph path.
 *
 * @param {string} graphPath — Graph file path
 * @param {string} [examplesSpecPath] — Optional examples spec file
 * @returns {{ branch: 'README'|'RESIDUE', reasons: string[], conditions: object }}
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function checkReadmeWritable(graphPath, examplesSpecPath) {
  const conditions = collectConditions(graphPath, examplesSpecPath);
  return { ...evaluateWritableConditions(conditions), conditions };
}

/**
 * main — CLI entry point.
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function main() {
  let graphPath;
  let examplesSpecPath;
  try {
    ({ graphPath, examplesSpecPath } = parseArguments());
  } catch (parseError) {
    console.error(`[ERROR] ${parseError.message}`);
    process.exit(2);
  }

  try {
    const decision = checkReadmeWritable(graphPath, examplesSpecPath);
    process.stdout.write(JSON.stringify({ branch: decision.branch, reasons: decision.reasons }) + '\n');
    process.exit(decision.branch === 'README' ? 0 : 1);
  } catch (dataError) {
    console.error(`[ERROR] ${dataError.message}`);
    process.exit(1);
  }
}

// Call main only when executed as CLI
if (require.main === module) {
  main();
}

module.exports = {
  parseArguments,
  evaluateWritableConditions,
  verifyGraph,
  hasUnresolvedOmissions,
  hasExamples,
  readGrillStatus,
  collectConditions,
  checkReadmeWritable,
  main,
  GRAPH_PATH_ARG_PREFIX,
  EXAMPLES_SPEC_ARG_PREFIX,
  CRYSTALIZE_STATUS_FILENAME,
  OMISSIONS_FILE_RE,
  REASON_GRAPH_VERIFICATION,
  REASON_OMISSIONS,
  REASON_EXAMPLES,
  REASON_GRILL,
};
