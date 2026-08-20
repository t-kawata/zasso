#!/usr/bin/env node
/**
 * split-step.js --tickets=<path> --dirs-tree-delta=<path> [--dry-run|--approve|--reject]
 *
 * /drill-rfc-down Step 4 split step driver (PX-162).
 *
 * Runs the split-delta-analyzer to produce tickets-delta.json, then:
 *   --dry-run  prints the candidate report and changes nothing
 *   --reject   leaves Tickets.json byte-identical (perfect-before-write gate)
 *   --approve  applies the plan (new tickets via add-ticket.js, edits via
 *              update-ticket.js) and validates with validate-tickets.js
 *
 * Existing ticket statuses are never silently overwritten; destructive changes
 * (ticket deletion) are forbidden by default.
 *
 * Design context: tools/conver/README.md — 進化ループ / /drill-rfc-down (Step 4).
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ANALYZER = path.join(SCRIPT_DIR, 'split-delta-analyzer.js');
const ADD_TICKET = path.resolve(SCRIPT_DIR, '../tickets/add-ticket.js');
const UPDATE_TICKET = path.resolve(SCRIPT_DIR, '../tickets/update-ticket.js');
const { validateTickets } = require('../lib/validate-tickets.js');

/** Spawn a node script with stdin input and return the result. */
// [::TICKET::] PX-162 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-162 --for-spec --no-implementation-order`.
function runNode(script, args, input) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', input });
}

/** Format the dry-run report from a tickets-delta object (AI judgment aid). */
// [::TICKET::] PX-162 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-162 --for-spec --no-implementation-order`.
function formatTicketsDeltaReport(ticketsDelta) {
  const lines = ['## /drill-rfc-down Step 4 Split Dry-run', ''];
  lines.push(`### New ticket candidates (${ticketsDelta.newTickets.length})`);
  if (ticketsDelta.newTickets.length === 0) {
    lines.push('- none');
  } else {
    for (const newTicket of ticketsDelta.newTickets) lines.push(`- ${newTicket.title} (status: ${newTicket.status}, phase: ${newTicket.phaseId})`);
  }
  lines.push('');
  lines.push(`### Edited ticket candidates (${ticketsDelta.editedTickets.length})`);
  if (ticketsDelta.editedTickets.length === 0) {
    lines.push('- none');
  } else {
    for (const editedTicket of ticketsDelta.editedTickets) lines.push(`- ticket ${editedTicket.id} (${editedTicket.path || 'unmapped'}) -> ${JSON.stringify(editedTicket.changes)}`);
  }
  lines.push('');
  lines.push(`### Existing statuses to preserve (${ticketsDelta.existingStatuses.length})`);
  for (const status of ticketsDelta.existingStatuses) lines.push(`- ticket ${status.id}: ${status.status}`);
  return lines.join('\n');
}

/**
 * Apply the approved plan: add new tickets and apply edits.
 * Returns true on success. Destructive changes are never applied.
 */
// [::TICKET::] PX-162 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-162 --for-spec --no-implementation-order`.
function applyPlan(ticketsPath, ticketsDelta) {
  try {
    for (const newTicket of ticketsDelta.newTickets || []) {
      const phaseArg = newTicket.phaseId === -1 ? 'PX' : `P${newTicket.phaseId}`;
      const input = JSON.stringify({ title: newTicket.title, nodeIds: newTicket.nodeIds || [] });
      const res = runNode(ADD_TICKET, [ticketsPath, phaseArg], input);
      if (res.status !== 0) { process.stderr.write(res.stderr || res.stdout); return false; }
    }
    for (const edit of ticketsDelta.editedTickets || []) {
      if (edit.id === null) continue;
      const ticketKey = `P${0}-${edit.id}`; // phase 0 tickets are the only existing in this pipeline context
      const res = runNode(UPDATE_TICKET, [ticketsPath, ticketKey], JSON.stringify(edit.changes || {}));
      if (res.status !== 0) { process.stderr.write(res.stderr || res.stdout); return false; }
    }
    return true;
  } catch (e) {
    process.stderr.write(`[ERROR] split-step: apply failed: ${e.message}\n`);
    return false;
  }
}

// [::TICKET::] PX-162 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-162 --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  let ticketsPath = '';
  let dtdPath = '';
  let mode = '';
  for (const arg of args) {
    if (arg.startsWith('--tickets=')) ticketsPath = arg.slice('--tickets='.length);
    else if (arg.startsWith('--dirs-tree-delta=')) dtdPath = arg.slice('--dirs-tree-delta='.length);
    else if (arg === '--dry-run') mode = 'dry-run';
    else if (arg === '--approve') mode = 'approve';
    else if (arg === '--reject') mode = 'reject';
  }
  if (!ticketsPath || !dtdPath || !mode) {
    console.error('Usage: split-step.js --tickets=<path> --dirs-tree-delta=<path> [--dry-run|--approve|--reject]');
    process.exit(1);
  }

  const outPath = path.join(os.tmpdir(), `tickets-delta-${process.pid}.json`);
  const analyzerResult = runNode(ANALYZER, [`--dirs-tree-delta=${dtdPath}`, `--tickets=${ticketsPath}`, `--out=${outPath}`]);
  if (analyzerResult.status !== 0) {
    process.stderr.write(analyzerResult.stderr || analyzerResult.stdout);
    process.exit(1);
  }
  const ticketsDelta = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  fs.rmSync(outPath, { force: true });

  if (mode === 'dry-run') {
    process.stdout.write(formatTicketsDeltaReport(ticketsDelta) + '\n');
    process.exit(0);
  }
  if (mode === 'reject') {
    process.stdout.write('Plan rejected. Tickets.json left unchanged.\n');
    process.exit(0);
  }
  if (mode === 'approve') {
    if (!applyPlan(ticketsPath, ticketsDelta)) process.exit(1);
    const updated = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
    const validation = validateTickets(updated);
    if (!validation.valid) {
      process.stderr.write(`[ERROR] split-step: validate-tickets failed after apply: ${JSON.stringify(validation.errors)}\n`);
      process.exit(1);
    }
    process.stdout.write(formatTicketsDeltaReport(ticketsDelta) + '\nApplied and validated.\n');
    process.exit(0);
  }
}

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main();
}

export { formatTicketsDeltaReport, applyPlan, main };
