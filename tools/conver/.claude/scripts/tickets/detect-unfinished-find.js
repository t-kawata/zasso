#!/usr/bin/env node
'use strict';

/**
 * detect-unfinished-find.js — mechanical detection of an interrupted
 * /find-omissions run.
 *
 * A find run leaves three kinds of evidence. None of them survives a completed
 * run: the inspection queue and the omission scratch file are removed at Step 8,
 * Step 9 rewrites every inspected ticket from `remanded` to `R<round>`, and the
 * boundary record is closed at COMPLETE. Any one of them still present therefore
 * proves the previous run did not finish.
 *
 * Evidence classes:
 *   remanded — a `remanded` ticket outside the PX phase
 *   boundary — .conver-boundary.json find.status === IN_PROGRESS
 *   queue    — a _tmp-check-target-tickets-cmds-<ts>.json file
 *   omissions— a _tmp-omissions-<ts>.json file
 *
 * Exit codes:
 *   0  clean
 *   10 unfinished (resume mode)
 *   20 malformed or missing input (fail closed; never treated as unfinished)
 *
 * The detector never edits tickets or the boundary record. `--reset` removes
 * only the transient `_tmp-*` files it named, so the resumed run rebuilds its
 * queue from the current Tickets.json.
 *
 * [::TICKET::] P27-1 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=P27-1 --for-spec --no-implementation-order`.
 */

const fs = require('node:fs');
const path = require('node:path');

const EXIT_CLEAN = 0;
const EXIT_UNFINISHED = 10;
const EXIT_ERROR = 20;

const TMP_OMISSIONS_PATTERN = /^_tmp-omissions-\d{14}\.json$/;
const TMP_CMDS_PATTERN = /^_tmp-check-target-tickets-cmds-\d{14}\.json$/;
const BOUNDARY_FIND_IN_PROGRESS = 'IN_PROGRESS';
const PX_PHASE_ID = -1;

/** Build the canonical key for a ticket, matching ticket-status conventions. */
// [::TICKET::] P27-1 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=P27-1 --for-spec --no-implementation-order`.
function ticketKeyOf(ticket, phaseId) {
  return (phaseId === PX_PHASE_ID ? 'PX' : `P${phaseId}`) + `-${ticket.id}`;
}

/** Collect remanded tickets outside the PX phase. */
// [::TICKET::] P27-1 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=P27-1 --for-spec --no-implementation-order`.
function collectRemanded(ticketsData) {
  const tickets = [];
  for (const phase of ticketsData.phases ?? []) {
    const phaseId = phase.id;
    if (phaseId === PX_PHASE_ID) continue;
    for (const ticket of phase.tickets ?? []) {
      if (ticket.status !== 'remanded') continue;
      const effectivePhaseId = ticket.phaseId !== undefined ? ticket.phaseId : phaseId;
      if (effectivePhaseId === PX_PHASE_ID) continue;
      tickets.push({
        key: ticketKeyOf(ticket, effectivePhaseId),
        title: ticket.title ?? '',
      });
    }
  }
  return tickets;
}

/** Read the boundary record; a missing file is the same as no record. */
// [::TICKET::] P27-1 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=P27-1 --for-spec --no-implementation-order`.
function readBoundary(boundaryPath) {
  if (!fs.existsSync(boundaryPath)) return null;
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(boundaryPath, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot parse ${boundaryPath}: ${error.message}`);
  }
  return parsed;
}

/** Read Tickets.json or fail closed with a named error. */
// [::TICKET::] P27-1 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=P27-1 --for-spec --no-implementation-order`.
function readTickets(ticketsPath) {
  if (!fs.existsSync(ticketsPath)) {
    throw new Error(`Tickets.json not found: ${ticketsPath}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot parse ${ticketsPath}: ${error.message}`);
  }
  if (!Array.isArray(parsed.phases)) {
    throw new Error(`Tickets.json has no phases array: ${ticketsPath}`);
  }
  return parsed;
}

/** List transient find files in the package directory. */
// [::TICKET::] P27-1 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=P27-1 --for-spec --no-implementation-order`.
function listTransientFiles(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const queue = [];
  const omissions = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (TMP_CMDS_PATTERN.test(entry.name)) queue.push(entry.name);
    if (TMP_OMISSIONS_PATTERN.test(entry.name)) omissions.push(entry.name);
  }
  return { queue: queue.sort(), omissions: omissions.sort() };
}

/** Count queue entries that have not been inspected yet. */
// [::TICKET::] P27-1 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=P27-1 --for-spec --no-implementation-order`.
function countPendingEntries(directory, fileName) {
  try {
    const entries = JSON.parse(fs.readFileSync(path.join(directory, fileName), 'utf8'));
    if (!Array.isArray(entries)) return 0;
    return entries.filter((entry) => entry && entry.done === false).length;
  } catch {
    // A corrupt queue is still evidence that a run stopped before cleanup.
    return 0;
  }
}

/**
 * Inspect one package and return the verdict plus every evidence class found.
 * Pure with respect to package state: it only reads.
 */
// [::TICKET::] P27-1 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=P27-1 --for-spec --no-implementation-order`.
function detectUnfinishedFind(options = {}) {
  const directory = path.resolve(options.cwd ?? '.');
  const ticketsPath = path.resolve(directory, options.tickets ?? 'Tickets.json');
  const boundaryPath = path.resolve(directory, options.boundary ?? '.conver-boundary.json');

  const ticketsData = readTickets(ticketsPath);
  const boundary = readBoundary(boundaryPath);
  const transient = listTransientFiles(directory);

  const evidence = [];

  const remanded = collectRemanded(ticketsData);
  if (remanded.length > 0) {
    evidence.push({ kind: 'remanded', tickets: remanded });
  }

  if (boundary && boundary.find && boundary.find.status === BOUNDARY_FIND_IN_PROGRESS) {
    evidence.push({
      kind: 'boundary',
      file: path.basename(boundaryPath),
      status: boundary.find.status,
    });
  }

  if (transient.queue.length > 0) {
    evidence.push({
      kind: 'queue',
      files: transient.queue,
      pendingEntries: transient.queue.reduce(
        (total, fileName) => total + countPendingEntries(directory, fileName),
        0,
      ),
    });
  }

  if (transient.omissions.length > 0) {
    evidence.push({ kind: 'omissions', files: transient.omissions });
  }

  return {
    unfinished: evidence.length > 0,
    cwd: directory,
    evidence,
  };
}

/** Remove only the transient files named by an unfinished verdict. */
// [::TICKET::] P27-1 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=P27-1 --for-spec --no-implementation-order`.
function resetTransient(directory, report) {
  const removed = [];
  for (const entry of report.evidence) {
    if (entry.kind !== 'queue' && entry.kind !== 'omissions') continue;
    for (const fileName of entry.files) {
      const target = path.resolve(directory, fileName);
      if (!fs.existsSync(target)) continue;
      fs.unlinkSync(target);
      removed.push(fileName);
    }
  }
  return removed;
}

/** Render the verdict for a human reader (default output). */
// [::TICKET::] P27-1 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=P27-1 --for-spec --no-implementation-order`.
function formatMarkdown(report) {
  const lines = [];
  if (!report.unfinished) {
    lines.push('FIND STATE: CLEAN');
    lines.push('No unfinished /find-omissions evidence in this package.');
    return lines.join('\n');
  }

  lines.push('FIND STATE: UNFINISHED');
  lines.push('A previous /find-omissions run stopped before Step 9 completed.');
  for (const entry of report.evidence) {
    if (entry.kind === 'remanded') {
      lines.push(
        `- remanded tickets: ${entry.tickets
          .map((ticket) => `${ticket.key}${ticket.title ? ` (${ticket.title})` : ''}`)
          .join(', ')}`,
      );
    }
    if (entry.kind === 'boundary') {
      lines.push(`- boundary record ${entry.file}: find ${entry.status}`);
    }
    if (entry.kind === 'queue') {
      lines.push(
        `- inspection queue: ${entry.files.join(', ')} (${entry.pendingEntries} pending)`,
      );
    }
    if (entry.kind === 'omissions') {
      lines.push(`- omission scratch: ${entry.files.join(', ')}`);
    }
  }
  lines.push('');
  lines.push('RESUME MODE (mandatory):');
  lines.push('1. Run this detector with --reset to remove the transient files it named.');
  lines.push('2. Re-run the inspection loop from Step 2 through Step 9.');
  lines.push('3. Do not ask the human; decide everything and complete.');
  return lines.join('\n');
}

/** Parse CLI arguments. */
// [::TICKET::] P27-1 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=P27-1 --for-spec --no-implementation-order`.
function parseArgs(argv) {
  const options = {
    cwd: '.',
    tickets: 'Tickets.json',
    boundary: '.conver-boundary.json',
    format: 'markdown',
    reset: false,
  };
  for (const argument of argv) {
    if (argument === '--reset') {
      options.reset = true;
      continue;
    }
    const match = argument.match(/^--(cwd|tickets|boundary|format)=(.*)$/);
    if (!match) continue;
    options[match[1]] = match[2];
  }
  if (options.format !== 'markdown' && options.format !== 'json') {
    throw new Error(`Unsupported --format: ${options.format}`);
  }
  return options;
}

/** CLI entry point. */
// [::TICKET::] P27-1 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=P27-1 --for-spec --no-implementation-order`.
function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[detect-unfinished-find] ${error.message}`);
    process.exit(EXIT_ERROR);
  }

  let report;
  try {
    report = detectUnfinishedFind(options);
  } catch (error) {
    console.error(`[detect-unfinished-find] ${error.message}`);
    process.exit(EXIT_ERROR);
  }

  if (options.reset) {
    report.reset = { removed: report.unfinished ? resetTransient(report.cwd, report) : [] };
  }

  if (options.format === 'json') {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    process.stdout.write(formatMarkdown(report) + '\n');
    if (report.reset) {
      process.stdout.write(
        report.reset.removed.length === 0
          ? 'RESET: nothing to remove.\n'
          : `RESET: removed ${report.reset.removed.join(', ')}\n`,
      );
    }
  }

  process.exit(report.unfinished ? EXIT_UNFINISHED : EXIT_CLEAN);
}

if (require.main === module) main();

module.exports = {
  EXIT_CLEAN,
  EXIT_UNFINISHED,
  EXIT_ERROR,
  detectUnfinishedFind,
  resetTransient,
  formatMarkdown,
  parseArgs,
  ticketKeyOf,
};
