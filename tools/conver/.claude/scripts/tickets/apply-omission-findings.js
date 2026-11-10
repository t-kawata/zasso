#!/usr/bin/env node
'use strict';

/**
 * PX-407 — apply scan findings to the omission ticket pipeline.
 *
 * Only a must-fix finding with a resolvable source ticket becomes a ticket. One
 * stable key creates at most one ticket. An unsourced observation enters the
 * improvement backlog; a design-surface finding enters the design-amendment
 * queue. Report-only mode writes nothing.
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { inferTicketKey, toOmissionTicket } = require('./omission-gap-scan.js');
const { FINDING_CLASS } = require('./lib/omission-convergence.js');
const { writeTemporaryThenRename } = require('./lib/atomic-write.js');

const INDEX_FILE_NAME = 'OMISSION-TICKET-INDEX.json';
const BACKLOG_FILE_NAME = 'OMISSION-IMPROVEMENT-BACKLOG.json';
const DESIGN_QUEUE_FILE_NAME = 'DESIGN-AMENDMENT-QUEUE.json';
const DESIGN_SURFACES = new Set(['graph-node', 'graph-edge', 'dirs-tree', 'sequence-step', 'boundary']);

/** Read a JSON file or a default. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/** Write a JSON file atomically enough for the loop. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function writeJson(filePath, value) {
  writeTemporaryThenRename(filePath, JSON.stringify(value, null, 2) + '\n');
}

/** The source ticket a finding names. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function sourceTicketOf(finding) {
  return finding.ticketKey ?? inferTicketKey(finding.assetId);
}

/** Create one omission ticket through the existing CLI. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function createOmissionTicket({ cwd, ticketsPath, ticket, omissionsFilePath }) {
  const cli = path.join(__dirname, 'add-omission-ticket.js');
  execFileSync(process.execPath, [cli, '--tmp-omissions=' + omissionsFilePath, '--tickets=' + ticketsPath], {
    cwd,
    input: JSON.stringify(ticket) + '\n',
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

/** A collision-free omissions file in the package root. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function resolveOmissionsFile(cwd) {
  return path.join(cwd, '_tmp-omissions-px407-' + process.pid + '.json');
}

/**
 * Apply a scan report.
 *
 * @returns {{createdTickets:number, ticketedKeys:string[], backlog:object[], designQueue:object[], state:object}}
 */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function applyFindings({ cwd, ticketsPath = null, report, state = null, reportOnly = false }) {
  const tickets = ticketsPath || path.join(cwd, 'Tickets.json');
  const indexPath = path.join(cwd, INDEX_FILE_NAME);
  const index = state ?? readJson(indexPath, { version: 1, tickets: {}, createdThisRound: 0 });
  index.tickets = index.tickets ?? {};

  if (reportOnly) {
    return { createdTickets: 0, ticketedKeys: Object.keys(index.tickets), backlog: [], designQueue: [], state: index };
  }

  const backlog = [];
  const designQueue = [];
  const ticketedKeys = [];
  let createdTickets = 0;
  const omissionsFilePath = resolveOmissionsFile(cwd);

  for (const finding of report?.findings ?? []) {
    if (finding.class !== FINDING_CLASS.MUST_FIX) {
      backlog.push({ stableKey: finding.stableKey, surface: finding.surface, assetId: finding.assetId, problem: finding.problem });
      continue;
    }
    if (index.tickets[finding.stableKey]) {
      ticketedKeys.push(finding.stableKey);
      continue;
    }
    const sourceTicket = sourceTicketOf(finding);
    if (!sourceTicket) {
      if (DESIGN_SURFACES.has(finding.surface)) designQueue.push({ stableKey: finding.stableKey, surface: finding.surface, assetId: finding.assetId, problem: finding.problem, route: 'design-amendment' });
      else backlog.push({ stableKey: finding.stableKey, surface: finding.surface, assetId: finding.assetId, problem: finding.problem });
      continue;
    }
    createOmissionTicket({ cwd, ticketsPath: tickets, ticket: toOmissionTicket({ ...finding, ticketKey: sourceTicket }), omissionsFilePath });
    index.tickets[finding.stableKey] = { sourceTicket, createdAt: new Date().toISOString() };
    ticketedKeys.push(finding.stableKey);
    createdTickets += 1;
  }

  index.createdThisRound = createdTickets;
  writeJson(indexPath, index);
  writeJson(path.join(cwd, BACKLOG_FILE_NAME), { version: 1, at: new Date().toISOString(), findings: backlog });
  writeJson(path.join(cwd, DESIGN_QUEUE_FILE_NAME), { version: 1, at: new Date().toISOString(), findings: designQueue });
  return { createdTickets, ticketedKeys, backlog, designQueue, state: index };
}

/** CLI entry point. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  const cwdArg = args.find((argument) => argument.startsWith('--cwd='));
  const reportArg = args.find((argument) => argument.startsWith('--report='));
  const cwd = path.resolve(cwdArg ? cwdArg.slice('--cwd='.length) : process.cwd());
  const reportPath = reportArg ? path.resolve(cwd, reportArg.slice('--report='.length)) : path.join(cwd, 'OMISSION-GAP-SCAN.json');
  const report = readJson(reportPath, null);
  if (report === null) {
    console.log(JSON.stringify({ ok: false, code: 'REPORT_MISSING', path: reportPath }));
    process.exit(1);
  }
  const result = applyFindings({ cwd, report, reportOnly: args.includes('--report-only') });
  console.log(JSON.stringify({ ok: true, createdTickets: result.createdTickets, backlog: result.backlog.length, designQueue: result.designQueue.length }));
}

if (require.main === module) main();
module.exports = { BACKLOG_FILE_NAME, DESIGN_QUEUE_FILE_NAME, INDEX_FILE_NAME, applyFindings, sourceTicketOf };
