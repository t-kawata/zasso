#!/usr/bin/env node

/**
 * update-step-status.js — CRYSTALIZE-Status.json management (Steps 0-4 + grill)
 *
 * CLI: update-step-status.js --graph=<path>|--status=<path> <subcommand> [N]
 *
 * Subcommands:
 *   start-step <N>    Start Step N (running, currentStep=N)
 *   end-step <N>      Finish Step N normally (done, currentStep=N+1)
 *   fail-step <N>     Fail Step N abnormally (error, currentStep unchanged)
 *   reset-to-step <N> Reset to Step N (set N+1..4 back to pending)
 *   approve-toc       Record the Step 1 TOC grill approval
 *   approve-examples  Record the Step 2 examples grill approval
 *   status            Output the current state as formatted JSON
 *   cleanup           Delete known temporary files (idempotent)
 *   backup            Create a .bak of the status file (idempotent)
 *
 * All writes are atomic (temp file + rename).
 */

const fs = require('fs');
const path = require('path');
const { fromHomeRelative } = require('../lib/path-utils');
const { readGraphFile } = require('./validate-graph-arg.js');

/** CLI flag: explicit status file path */
const FLAG_STATUS = '--status=';

/** CLI flag: graph path from which the status path is derived */
const FLAG_GRAPH = '--graph=';

/** Fixed status filename inside rfcDir */
const CRYSTALIZE_STATUS_FILENAME = 'CRYSTALIZE-Status.json';

/** Minimum step number (Step 0: argument validation and path derivation) */
const MIN_STEP = 0;

/** Maximum step number (crystalize-readme has Steps 0-4) */
const MAX_STEP = 4;

/** Allowed subcommand names */
const ALLOWED_SUBCOMMANDS = [
  'start-step',
  'end-step',
  'fail-step',
  'reset-to-step',
  'approve-toc',
  'approve-examples',
  'status',
  'cleanup',
  'backup',
];

/** Step status: not started */
const STATUS_PENDING = 'pending';

/** Step status: in progress */
const STATUS_RUNNING = 'running';

/** Step status: completed */
const STATUS_DONE = 'done';

/** Step status: abnormally terminated */
const STATUS_ERROR = 'error';

/**
 * Parse command line arguments.
 *
 * @param {string[]} [args] — Test argument array (defaults to process.argv when omitted)
 * @returns {{ statusPath: string|null, graphPath: string|null, subcommand: string, stepNumber: number|null }}
 * @throws {Error} If the argument syntax is invalid
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function parseArguments(args) {
  const argv = args || process.argv.slice(2);

  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) {
    printUsage();
    process.exit(0);
  }

  if (argv.length < 2) {
    throw new Error('Usage: update-step-status.js --graph=<path>|--status=<path> <subcommand> [N]');
  }

  const flag = argv[0];
  let statusPath = null;
  let graphPath = null;
  if (flag.startsWith(FLAG_STATUS)) {
    statusPath = flag.slice(FLAG_STATUS.length);
    if (!statusPath) throw new Error('--status path is empty.');
  } else if (flag.startsWith(FLAG_GRAPH)) {
    graphPath = flag.slice(FLAG_GRAPH.length);
    if (!graphPath) throw new Error('--graph path is empty.');
  } else {
    throw new Error('First argument must be --graph=<path> or --status=<path>.');
  }

  const subcommand = argv[1];
  if (!ALLOWED_SUBCOMMANDS.includes(subcommand)) {
    throw new Error(`Unknown subcommand: ${subcommand}`);
  }

  let stepNumber = null;
  if (!['status', 'approve-toc', 'approve-examples', 'cleanup', 'backup'].includes(subcommand)) {
    if (argv.length < 3) {
      throw new Error(`Subcommand "${subcommand}" requires a step number.`);
    }
    stepNumber = parseInt(argv[2], 10);
    if (isNaN(stepNumber)) {
      throw new Error(`Step number is not a number: ${argv[2]}`);
    }
  }

  return { statusPath, graphPath, subcommand, stepNumber };
}

/**
 * Resolve the status file path: explicit --status or derived from --graph.
 *
 * @param {{ statusPath: string|null, graphPath: string|null }} parsed — Parsed arguments
 * @returns {string} Absolute status file path
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function resolveStatusPath(parsed) {
  if (parsed.statusPath) return parsed.statusPath;
  const graph = readGraphFile(parsed.graphPath);
  const expandedSource = path.resolve(fromHomeRelative(graph.sourceFile));
  return path.join(path.dirname(expandedSource), CRYSTALIZE_STATUS_FILENAME);
}

/**
 * Build a default status from the graph when no status file exists.
 *
 * @param {string} graphPath — Graph file path
 * @returns {Object} Default status data
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function createDefaultStatus(graphPath) {
  const graph = readGraphFile(graphPath);
  const sourceFile = path.resolve(fromHomeRelative(graph.sourceFile));
  const steps = {};
  for (let i = MIN_STEP; i <= MAX_STEP; i++) {
    steps[String(i)] = STATUS_PENDING;
  }
  return {
    sourceFile,
    graphFile: path.resolve(graphPath),
    currentStep: MIN_STEP,
    steps,
    grill: { tocApproved: false, examplesApproved: false },
  };
}

/**
 * Read the status file, returning a default when it does not exist.
 *
 * @param {string} statusPath — Status file path
 * @param {string} graphPath — Graph file path (used for the default)
 * @returns {Object} Status data
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function readStatus(statusPath, graphPath) {
  if (!fs.existsSync(statusPath)) {
    return createDefaultStatus(graphPath);
  }

  const raw = fs.readFileSync(statusPath, 'utf8');
  const data = JSON.parse(raw);

  if (!data.sourceFile || !data.graphFile || typeof data.currentStep !== 'number' || !data.steps) {
    throw new Error(`${statusPath} has invalid format. sourceFile / graphFile / currentStep / steps are required.`);
  }
  if (!data.grill) {
    data.grill = { tocApproved: false, examplesApproved: false };
  }
  return data;
}

/**
 * Validate a step number is an integer in [MIN_STEP, MAX_STEP].
 *
 * @param {number} n — Step number
 * @returns {boolean} true when valid
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function validateStepNumber(n) {
  return Number.isInteger(n) && n >= MIN_STEP && n <= MAX_STEP;
}

/** start-step <N>: mark a step running and advance currentStep. */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function executeStartStep(status, n) {
  status.steps[String(n)] = STATUS_RUNNING;
  status.currentStep = n;
  process.stdout.write(`Step ${n} started. Status: ${STATUS_RUNNING}.\n`);
}

/** end-step <N>: mark a step done and advance currentStep to N+1. */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function executeEndStep(status, n) {
  status.steps[String(n)] = STATUS_DONE;
  status.currentStep = n + 1;
  process.stdout.write(`Step ${n} completed. Status: ${STATUS_DONE}.\n`);
}

/** fail-step <N>: mark a step error without moving currentStep. */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function executeFailStep(status, n) {
  status.steps[String(n)] = STATUS_ERROR;
  process.stdout.write(`Step ${n} terminated abnormally. Status: ${STATUS_ERROR}.\n`);
}

/** reset-to-step <N>: reset steps after N to pending. */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function executeResetToStep(status, n) {
  for (let i = n + 1; i <= MAX_STEP; i++) {
    status.steps[String(i)] = STATUS_PENDING;
  }
  status.currentStep = n;
  process.stdout.write(`Reset to Step ${n}.\n`);
}

/** approve-toc: record the Step 1 TOC grill approval. */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function executeApproveToc(status) {
  status.grill.tocApproved = true;
  process.stdout.write('TOC grill approved (tocApproved=true).\n');
}

/** approve-examples: record the Step 2 examples grill approval. */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function executeApproveExamples(status) {
  status.grill.examplesApproved = true;
  process.stdout.write('Examples grill approved (examplesApproved=true).\n');
}

/** status: output the current status as formatted JSON. */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function executeStatus(status) {
  process.stdout.write(JSON.stringify(status, null, 2) + '\n');
}

/** cleanup: remove known temporary/backup files (idempotent). */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function executeCleanup(status) {
  const removed = [];
  const candidates = [
    status.graphFile + '.bak',
    status.graphFile + '.tmp.*',
  ];
  for (const pattern of candidates) {
    if (pattern.includes('*')) {
      const dir = path.dirname(pattern);
      const prefix = path.basename(pattern).replace('*', '');
      if (fs.existsSync(dir)) {
        for (const file of fs.readdirSync(dir)) {
          if (file.startsWith(prefix)) {
            const full = path.join(dir, file);
            fs.unlinkSync(full);
            removed.push(full);
          }
        }
      }
    } else if (fs.existsSync(pattern)) {
      fs.unlinkSync(pattern);
      removed.push(pattern);
    }
  }
  process.stdout.write(removed.length > 0 ? `cleanup: ${removed.join(', ')} deleted.\n` : 'cleanup: No temporary files to delete.\n');
}

/** backup: create a .bak of the status file (idempotent). */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function executeBackup(status) {
  const statusPath = status.statusFilePath;
  if (!statusPath || !fs.existsSync(statusPath)) {
    throw new Error('Cannot back up: status file path is not tracked in the status data.');
  }
  const bakPath = statusPath + '.bak';
  if (fs.existsSync(bakPath)) fs.unlinkSync(bakPath);
  fs.copyFileSync(statusPath, bakPath);
  process.stdout.write(`backup: ${statusPath} → ${bakPath}\n`);
}

/**
 * Write a file atomically using temp file + rename.
 *
 * @param {string} targetPath — Target file path
 * @param {string} data — UTF-8 content to write
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function atomicWrite(targetPath, data) {
  const tmpPath = `${targetPath}.tmp.${process.pid}`;
  fs.writeFileSync(tmpPath, data, 'utf8');
  fs.renameSync(tmpPath, targetPath);
}

/**
 * Output an error in the 3-part template and exit.
 *
 * @param {string} message — What happened
 * @param {string} reason — Why it happened
 * @param {string} action — Next action
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function exitWithError(message, reason, action) {
  console.error(`[ERROR] ${message}`);
  console.error(`Cause: ${reason}`);
  console.error(`Action: ${action}`);
  process.exit(1);
}

/**
 * Display usage instructions.
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function printUsage() {
  process.stdout.write(`
update-step-status.js — CRYSTALIZE-Status.json management

Usage:
  node update-step-status.js --graph=<path>|--status=<path> <subcommand> [N]
  node update-step-status.js --help

Subcommands:
  start-step <N>    Start Step N (running, currentStep=N)
  end-step <N>      Finish Step N normally (done, currentStep=N+1)
  fail-step <N>     Fail Step N abnormally (error, currentStep unchanged)
  reset-to-step <N> Reset to Step N (set N+1..4 to pending)
  approve-toc       Record the TOC grill approval
  approve-examples  Record the examples grill approval
  status            Output the current state as formatted JSON
  cleanup           Delete known temporary files (idempotent)
  backup            Create a .bak of the status file (idempotent)

Step numbers: ${MIN_STEP} to ${MAX_STEP}
`);
}

/**
 * main — parse arguments, dispatch subcommand, write atomically.
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function main() {
  let parsed;
  try {
    parsed = parseArguments();
  } catch (parseError) {
    exitWithError(`Argument parse failed: ${parseError.message}`, 'Command-line arguments are invalid.', 'Use --help to check usage, then re-run.');
  }

  let statusPath;
  try {
    statusPath = resolveStatusPath(parsed);
  } catch (resolveError) {
    exitWithError(`Failed to resolve status path: ${resolveError.message}`, `graph=${parsed.graphPath}`, 'Provide a valid --graph or --status path.');
  }

  let status;
  try {
    status = readStatus(statusPath, parsed.graphPath);
    status.statusFilePath = statusPath;
  } catch (readError) {
    exitWithError(`Failed to read status file: ${readError.message}`, `File path: ${statusPath}`, 'Verify the file exists and is valid JSON.');
  }

  try {
    switch (parsed.subcommand) {
      case 'start-step':
      case 'end-step':
      case 'fail-step':
      case 'reset-to-step': {
        if (!validateStepNumber(parsed.stepNumber)) {
          exitWithError(`Step number out of range: ${parsed.stepNumber}`, `Step must be an integer between ${MIN_STEP} and ${MAX_STEP}.`, `Specify an integer in the range ${MIN_STEP} to ${MAX_STEP}.`);
        }
        if (parsed.subcommand === 'start-step') executeStartStep(status, parsed.stepNumber);
        else if (parsed.subcommand === 'end-step') executeEndStep(status, parsed.stepNumber);
        else if (parsed.subcommand === 'fail-step') executeFailStep(status, parsed.stepNumber);
        else executeResetToStep(status, parsed.stepNumber);
        break;
      }
      case 'approve-toc':
        executeApproveToc(status);
        break;
      case 'approve-examples':
        executeApproveExamples(status);
        break;
      case 'status':
        executeStatus(status);
        process.exit(0);
      case 'cleanup':
        executeCleanup(status);
        process.exit(0);
      case 'backup':
        executeBackup(status);
        process.exit(0);
      default:
        exitWithError(`Unknown subcommand: ${parsed.subcommand}`, 'Subcommand is not in the allowed list.', 'Re-run with a valid subcommand.');
    }
  } catch (execError) {
    exitWithError(`Subcommand execution failed: ${execError.message}`, 'Subcommand arguments are invalid.', 'Check the error message and re-run.');
  }

  try {
    delete status.statusFilePath;
    atomicWrite(statusPath, JSON.stringify(status, null, 2));
  } catch (writeError) {
    exitWithError(`Failed to write status file: ${writeError.message}`, `File path: ${statusPath}`, 'Check disk space and write permissions.');
  }
}

// Call main only when executed as CLI
if (require.main === module) {
  main();
}

module.exports = {
  parseArguments,
  resolveStatusPath,
  createDefaultStatus,
  readStatus,
  validateStepNumber,
  executeStartStep,
  executeEndStep,
  executeFailStep,
  executeResetToStep,
  executeApproveToc,
  executeApproveExamples,
  executeStatus,
  executeCleanup,
  executeBackup,
  atomicWrite,
  main,
  FLAG_GRAPH,
  FLAG_STATUS,
  CRYSTALIZE_STATUS_FILENAME,
  MIN_STEP,
  MAX_STEP,
  ALLOWED_SUBCOMMANDS,
  STATUS_PENDING,
  STATUS_RUNNING,
  STATUS_DONE,
  STATUS_ERROR,
};
