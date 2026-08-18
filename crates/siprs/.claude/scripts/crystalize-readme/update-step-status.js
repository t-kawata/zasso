#!/usr/bin/env node

/**
 * update-step-status.js — CRYSTALIZE-Status.json management (Steps 0-4 + grill)
 *
 * CLI: update-step-status.js --graph=<path>|--status=<path> <subcommand>
 *      propose-heading / confirm-heading read their JSON from stdin.
 *
 * Subcommands:
 *   start-step <N>    Start Step N (running, currentStep=N)
 *   end-step <N>      Finish Step N normally (done, currentStep=N+1)
 *                    — Step 1 requires the TOC grill to be complete
 *   fail-step <N>     Fail Step N abnormally (error, currentStep unchanged)
 *   reset-to-step <N> Reset to Step N (set N+1..4 back to pending)
 *   propose-heading   Record a proposed heading from stdin proposal JSON (UPSERT)
 *   confirm-heading   Confirm a proposed heading from stdin {id, confirmedContent}
 *   delete-heading    Remove a heading and all its descendants from stdin {id}
 *   reset-toc          Clear the per-heading TOC grill state
 *   approve-toc       Set tocApproved only when every node is confirmed
 *   resolve-section    Mark a section complete in grill.sections from stdin {id, heading}
 *   mark-residue       Mark a section as residue in grill.sections from stdin {id, heading}
 *   reset-sections     Clear grill.sections and examplesApproved (Step 2 restart)
 *   status            Output the current state as formatted JSON
 *   cleanup           Delete known temporary files (idempotent)
 *   backup            Create a .bak of the status file (idempotent)
 *
 * The grill records a durable toc.nodes tree ({id, heading, level,
 * confirmedContent, status}) where level and parent are derived from the
 * hierarchical-path id (never stored). All writes are atomic.
 */

const fs = require('fs');
const path = require('path');
const { fromHomeRelative } = require('../lib/path-utils');
const { readGraphFile } = require('./validate-graph-arg.js');
const { parentIdOf } = require('./validate-toc-proposal.js');

/** CLI flag: explicit status file path */
const FLAG_STATUS = '--status=';

/** CLI flag: graph path from which the status path is derived */
const FLAG_GRAPH = '--graph=';

/** Fixed status filename inside rfcDir */
const CRYSTALIZE_STATUS_FILENAME = 'CRYSTALIZE-Status.json';

/** Minimum step number (Step 0: argument validation and path derivation) */
const MIN_STEP = 0;

/** Maximum step number (crystalize-readme has Steps 0-3; Step 4 output validation was removed) */
const MAX_STEP = 3;

/** Subcommands that take a step number */
const STEP_SUBCOMMANDS = ['start-step', 'end-step', 'fail-step', 'reset-to-step'];

/** Subcommands that read their input JSON from stdin */
const STDIN_SUBCOMMANDS = ['propose-heading', 'confirm-heading', 'delete-heading', 'resolve-section', 'mark-residue'];

/** Subcommands that take no extra argument */
const NO_ARG_SUBCOMMANDS = ['approve-toc', 'status', 'cleanup', 'backup', 'reset-toc', 'reset-sections'];

/** Allowed subcommand names */
const ALLOWED_SUBCOMMANDS = [
  ...STEP_SUBCOMMANDS,
  ...STDIN_SUBCOMMANDS,
  ...NO_ARG_SUBCOMMANDS,
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
// [::TICKET::] PX-152, PX-153, PX-154 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-152|PX-153|PX-154) --for-spec --no-implementation-order`.
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
  if (STEP_SUBCOMMANDS.includes(subcommand)) {
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
// [::TICKET::] PX-152, PX-153, PX-154, PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-152|PX-153|PX-154|PX-156) --for-spec --no-implementation-order`.
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
    grill: { tocApproved: false, examplesApproved: false, toc: { nodes: [] }, sections: [] },
  };
}

/**
 * Read the status file, returning a default when it does not exist.
 *
 * @param {string} statusPath — Status file path
 * @param {string} graphPath — Graph file path (used for the default)
 * @returns {Object} Status data
 */
// [::TICKET::] PX-152, PX-153, PX-154, PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-152|PX-153|PX-154|PX-156) --for-spec --no-implementation-order`.
function readStatus(statusPath, graphPath) {
  if (!fs.existsSync(statusPath)) {
    return createDefaultStatus(graphPath);
  }

  const raw = fs.readFileSync(statusPath, 'utf8');
  const statusData = JSON.parse(raw);

  if (!statusData.sourceFile || !statusData.graphFile || typeof statusData.currentStep !== 'number' || !statusData.steps) {
    throw new Error(`${statusPath} has invalid format. sourceFile / graphFile / currentStep / steps are required.`);
  }
  if (!statusData.grill) {
    statusData.grill = { tocApproved: false, examplesApproved: false, toc: { nodes: [] }, sections: [] };
  }
  if (!Array.isArray(statusData.grill.sections)) {
    statusData.grill.sections = [];
  }
  if (!statusData.grill.toc || !Array.isArray(statusData.grill.toc.nodes)) {
    // Backward-compatible migration from the legacy id-only grill (PX-153):
    // proposedIds/confirmedIds carry only ids, so heading/content are unknown.
    const legacyProposed = Array.isArray(statusData.grill.proposedIds) ? statusData.grill.proposedIds : [];
    const legacyConfirmed = Array.isArray(statusData.grill.confirmedIds) ? statusData.grill.confirmedIds : [];
    statusData.grill.toc = {
      nodes: legacyProposed.map((id) => ({
        id,
        heading: '',
        level: (String(id).match(/-/g) || []).length + 1,
        confirmedContent: null,
        status: legacyConfirmed.includes(id) ? 'confirmed' : 'proposed',
      })),
    };
  }
  return statusData;
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

/**
 * Whether Step N may be ended: only Step 1 is gated on a complete TOC grill.
 *
 * @param {Object} status — Status data
 * @param {number} n — Step number
 * @returns {boolean} true when the step can be ended
 */
// [::TICKET::] PX-153 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-153 --for-spec --no-implementation-order`.
function canEndStep(status, n) {
  return n !== 1 || isTocComplete(status);
}

/** end-step <N>: mark a step done and advance currentStep to N+1. */
// [::TICKET::] PX-152, PX-153 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-152|PX-153) --for-spec --no-implementation-order`.
function executeEndStep(status, n) {
  if (!canEndStep(status, n)) {
    throw new Error('Step 1 cannot end while the TOC grill is incomplete (not every proposed heading id is confirmed).');
  }
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

/**
 * Whether the Step 1 TOC grill is complete: a non-empty tree whose every node
 * has been confirmed.
 *
 * @param {Object} status — Status data
 * @returns {boolean} true when every node is confirmed
 */
// [::TICKET::] PX-153, PX-154 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-153|PX-154) --for-spec --no-implementation-order`.
function isTocComplete(status) {
  const nodes = status.grill.toc.nodes;
  return nodes.length > 0 && nodes.every((node) => node.status === 'confirmed');
}

/**
 * propose-heading: record a proposed heading node from a proposal JSON
 * {id, heading, ...}. Level is derived from the hierarchical-path id; a child
 * may only be proposed after its parent node already exists in the tree.
 *
 * @param {Object} status — Status data
 * @param {Object} proposal — {id, heading}
 * @throws {Error} If id/heading are missing or the parent node is absent
 */
// [::TICKET::] PX-153, PX-154 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-153|PX-154) --for-spec --no-implementation-order`.
function executeProposeHeading(status, proposal) {
  const { id, heading } = proposal || {};
  if (typeof id !== 'string' || id.trim() === '') {
    throw new Error('proposal.id is required.');
  }
  if (typeof heading !== 'string' || heading.trim() === '') {
    throw new Error('proposal.heading is required.');
  }

  const nodes = status.grill.toc.nodes;
  const parent = parentIdOf(id);
  if (parent !== null && !nodes.some((node) => node.id === parent)) {
    throw new Error(`Parent "${parent}" of "${id}" is not in the TOC. Propose the parent first.`);
  }

  const level = (id.match(/-/g) || []).length + 1;
  const existing = nodes.find((node) => node.id === id);
  if (existing) {
    existing.heading = heading;
    existing.level = level;
  } else {
    nodes.push({ id, heading, level, confirmedContent: null, status: 'proposed' });
  }
  process.stdout.write(`Heading proposed: ${id}\n`);
}

/**
 * confirm-heading: confirm a proposed heading node from {id, confirmedContent}.
 *
 * @param {Object} status — Status data
 * @param {Object} confirmation — {id, confirmedContent}
 * @throws {Error} If the id was never proposed
 */
// [::TICKET::] PX-153, PX-154 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-153|PX-154) --for-spec --no-implementation-order`.
function executeConfirmHeading(status, confirmation) {
  const { id, confirmedContent } = confirmation || {};
  if (typeof id !== 'string' || id.trim() === '') {
    throw new Error('confirmation.id is required.');
  }
  if (typeof confirmedContent !== 'string' || confirmedContent.trim() === '') {
    throw new Error('confirmation.confirmedContent is required.');
  }

  const node = status.grill.toc.nodes.find((n) => n.id === id);
  if (!node) {
    throw new Error(`Heading id "${id}" is not proposed. Propose it first with propose-heading.`);
  }
  node.confirmedContent = confirmedContent;
  node.status = 'confirmed';
  process.stdout.write(`Heading confirmed: ${id}\n`);
}

/**
 * Whether one id is a descendant of another in the hierarchical-path scheme.
 * A descendant id always starts with "<parentId>-".
 *
 * @param {string} id — Candidate id
 * @param {string} parentId — Ancestor id
 * @returns {boolean} true when id is a child/grandchild of parentId
 */
// [::TICKET::] PX-155 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-155 --for-spec --no-implementation-order`.
function isDescendant(id, parentId) {
  return id.startsWith(parentId + '-');
}

/**
 * delete-heading: remove a heading node and all its descendants from the tree.
 *
 * @param {Object} status — Status data
 * @param {Object} request — {id}
 * @throws {Error} If the id is not in the tree
 */
// [::TICKET::] PX-155 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-155 --for-spec --no-implementation-order`.
function executeDeleteHeading(status, request) {
  const { id } = request || {};
  if (typeof id !== 'string' || id.trim() === '') {
    throw new Error('request.id is required.');
  }

  const nodes = status.grill.toc.nodes;
  if (!nodes.some((node) => node.id === id)) {
    throw new Error(`Heading id "${id}" was not found in the TOC. Nothing was deleted.`);
  }

  status.grill.toc.nodes = nodes.filter((node) => node.id !== id && !isDescendant(node.id, id));
  status.grill.tocApproved = isTocComplete(status);
  process.stdout.write(`Heading deleted: ${id}\n`);
}

/** reset-toc: clear the per-heading TOC grill state. */
// [::TICKET::] PX-153, PX-154 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-153|PX-154) --for-spec --no-implementation-order`.
function executeResetToc(status) {
  status.grill.toc.nodes = [];
  status.grill.tocApproved = false;
  process.stdout.write('TOC grill state reset.\n');
}

/**
 * reset-sections: clear the per-section state so Step 2 restarts with a full
 * re-analysis. Called right after the Step 1 skeleton is re-emitted (refine mode
 * included), because the re-emitted README marks every section TEMPLATE again.
 */
// [::TICKET::] PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-156 --for-spec --no-implementation-order`.
function executeResetSections(status) {
  status.grill.sections = [];
  status.grill.examplesApproved = false;
  process.stdout.write('Sections reset for a full re-analysis.\n');
}

/** approve-toc: derive tocApproved from the per-heading confirmation state. */
// [::TICKET::] PX-152, PX-153 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-152|PX-153) --for-spec --no-implementation-order`.
function executeApproveToc(status) {
  status.grill.tocApproved = isTocComplete(status);
  process.stdout.write(status.grill.tocApproved ? 'TOC grill approved (tocApproved=true).\n' : 'TOC grill incomplete (tocApproved=false).\n');
}

/**
 * resolve-section: mark a section as complete in grill.sections (UPSERT).
 *
 * @param {Object} status — Status data
 * @param {Object} request — {id, heading}
 * @throws {Error} If id or heading are missing
 */
// [::TICKET::] PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-156 --for-spec --no-implementation-order`.
function executeResolveSection(status, request) {
  const { id, heading } = request || {};
  if (typeof id !== 'string' || id.trim() === '') {
    throw new Error('request.id is required.');
  }
  if (typeof heading !== 'string' || heading.trim() === '') {
    throw new Error('request.heading is required.');
  }
  const sections = status.grill.sections;
  const existing = sections.find((s) => s.id === id);
  if (existing) {
    existing.heading = heading;
    existing.state = 'complete';
  } else {
    sections.push({ id, heading, state: 'complete' });
  }
  process.stdout.write(`Section resolved: ${id}\n`);
}

/**
 * mark-residue: mark a section as residue in grill.sections (UPSERT).
 *
 * @param {Object} status — Status data
 * @param {Object} request — {id, heading}
 * @throws {Error} If id or heading are missing
 */
// [::TICKET::] PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-156 --for-spec --no-implementation-order`.
function executeMarkResidue(status, request) {
  const { id, heading } = request || {};
  if (typeof id !== 'string' || id.trim() === '') {
    throw new Error('request.id is required.');
  }
  if (typeof heading !== 'string' || heading.trim() === '') {
    throw new Error('request.heading is required.');
  }
  const sections = status.grill.sections;
  const existing = sections.find((s) => s.id === id);
  if (existing) {
    existing.heading = heading;
    existing.state = 'residue';
  } else {
    sections.push({ id, heading, state: 'residue' });
  }
  process.stdout.write(`Section marked residue: ${id}\n`);
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
// [::TICKET::] PX-152, PX-153, PX-154, PX-155, PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-152|PX-153|PX-154|PX-155|PX-156) --for-spec --no-implementation-order`.
function printUsage() {
  process.stdout.write(`
update-step-status.js — CRYSTALIZE-Status.json management

Usage:
  node update-step-status.js --graph=<path>|--status=<path> <subcommand> [N]
  node update-step-status.js --help

Subcommands:
  start-step <N>    Start Step N (running, currentStep=N)
  end-step <N>      Finish Step N normally (done, currentStep=N+1)
                    Step 1 requires the TOC grill to be complete
  fail-step <N>     Fail Step N abnormally (error, currentStep unchanged)
  reset-to-step <N> Reset to Step N (set N+1..4 to pending)
  propose-heading   Record a proposed heading from stdin proposal JSON (UPSERT)
  confirm-heading   Confirm a proposed heading from stdin {id, confirmedContent}
  delete-heading    Remove a heading and all its descendants from stdin {id}
  reset-toc          Clear the per-heading TOC grill state
  approve-toc       Set tocApproved only when every node is confirmed
  resolve-section   Mark a section complete in grill.sections from stdin {id, heading}
  mark-residue      Mark a section as residue in grill.sections from stdin {id, heading}
  reset-sections    Clear grill.sections and examplesApproved (Step 2 restart)
  status            Output the current state as formatted JSON
  cleanup           Delete known temporary files (idempotent)
  backup            Create a .bak of the status file (idempotent)

propose-heading / confirm-heading / delete-heading read JSON from stdin, e.g.:
  echo '{"id":"H1","heading":"クイックスタート"}' | update-step-status.js --graph=<path> propose-heading
  echo '{"id":"H1","confirmedContent":"..."}' | update-step-status.js --graph=<path> confirm-heading
  echo '{"id":"H1-1"}' | update-step-status.js --graph=<path> delete-heading

Step numbers: ${MIN_STEP} to ${MAX_STEP}
`);
}

/**
 * main — parse arguments, dispatch subcommand, write atomically.
 */
// [::TICKET::] PX-152, PX-153, PX-154, PX-155, PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-152|PX-153|PX-154|PX-155|PX-156) --for-spec --no-implementation-order`.
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

  let inputJson = null;
  if (STDIN_SUBCOMMANDS.includes(parsed.subcommand)) {
    try {
      const raw = fs.readFileSync(0, 'utf8');
      inputJson = JSON.parse(raw);
      if (!inputJson || typeof inputJson !== 'object' || Array.isArray(inputJson)) {
        throw new Error('Input must be a JSON object.');
      }
    } catch (stdinError) {
      exitWithError(`Failed to read stdin JSON for ${parsed.subcommand}.`, stdinError.message, `Pipe a JSON object, e.g. echo '{"id":"H1","heading":"..."}' | update-step-status.js --graph=<path> ${parsed.subcommand}`);
    }
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
      case 'propose-heading':
        executeProposeHeading(status, inputJson);
        break;
      case 'confirm-heading':
        executeConfirmHeading(status, inputJson);
        break;
      case 'delete-heading':
        executeDeleteHeading(status, inputJson);
        break;
      case 'reset-toc':
        executeResetToc(status);
        break;
      case 'reset-sections':
        executeResetSections(status);
        break;
      case 'approve-toc':
        executeApproveToc(status);
        if (!status.grill.tocApproved) {
          exitWithError('TOC grill is not complete.', 'Not every proposed heading id is confirmed.', 'Confirm every proposed id via confirm-heading, then re-run approve-toc.');
        }
        break;
      case 'resolve-section':
        executeResolveSection(status, inputJson);
        break;
      case 'mark-residue':
        executeMarkResidue(status, inputJson);
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
  executeProposeHeading,
  executeConfirmHeading,
  executeDeleteHeading,
  isDescendant,
  executeResetToc,
  isTocComplete,
  canEndStep,
  executeApproveToc,
  executeResolveSection,
  executeMarkResidue,
  executeResetSections,
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
  STEP_SUBCOMMANDS,
  STDIN_SUBCOMMANDS,
  NO_ARG_SUBCOMMANDS,
  STATUS_PENDING,
  STATUS_RUNNING,
  STATUS_DONE,
  STATUS_ERROR,
};
