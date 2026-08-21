#!/usr/bin/env node
/**
 * split-step.js --tickets=<path> [--dirs-tree-delta=<path>] [--stage|--approve|--reject]
 *
 * /drill-rfc-down Step 4 split step driver (PX-162, PX-165).
 *
 * The AI is the engineering expert who designs the Tickets evolution; this
 * driver only stages, validates, and promotes — it never applies an analyzer
 * plan.
 *
 *   --stage   copies the real Tickets.json to <tickets>.staging.json and shows
 *             the analyzer candidates (written to <tickets>.candidates.json) as
 *             an information aid. The real Tickets.json is left untouched. The
 *             AI then designs the evolution by editing the STAGING copy via
 *             add-ticket.js / update-ticket.js.
 *   --approve validates the STAGING Tickets.json with validate-tickets, derives
 *             tickets-delta.json (newTickets/editedTickets/existingStatuses) by
 *             diffing the real Tickets.json against the staged copy, and
 *             promotes the staging copy to the real Tickets.json. The analyzer
 *             is NOT re-run — the staged Tickets.json, which the AI crafted via
 *             add-ticket.js / update-ticket.js, is the plan.
 *   --reject  discards the staging copy; the real Tickets.json stays
 *             byte-identical (perfect-before-write gate).
 *
 * Existing ticket statuses are never silently overwritten; destructive changes
 * (ticket deletion) are forbidden by default.
 *
 * Design context: tools/conver/README.md — 進化ループ / /drill-rfc-down (Step 4).
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'url';
import { buildAdvisoryReport } from './advisory-report.js';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ANALYZER = path.join(SCRIPT_DIR, 'split-delta-analyzer.js');
const { validateTickets } = require(path.resolve(SCRIPT_DIR, '../lib/validate-tickets.js'));

/** Spawn a node script and return the result. */
// [::TICKET::] PX-162, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-162|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function runNode(script, args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
}

/** The staging copy path the AI designs with add-ticket/update-ticket before --approve. */
// [::TICKET::] PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function stagingPathOf(ticketsPath) {
  return `${ticketsPath}.staging.json`;
}

/** The candidates file path written by --stage for the AI to consult. */
// [::TICKET::] PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function candidatesPathOf(ticketsPath) {
  return `${ticketsPath}.candidates.json`;
}

/** The pipeline handoff path written by --approve (Step 5 verify consumes it). */
// [::TICKET::] PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function deltaPathOf(ticketsPath) {
  return `${ticketsPath}.delta.json`;
}

/** A stable identity for a ticket across phases (used by the delta derivation). */
// [::TICKET::] PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function ticketKeyOf(ticket) {
  return `${ticket.phaseId}-${ticket.id}`;
}

/** Collect every ticket (phaseId + ticket) from a Tickets.json. */
// [::TICKET::] PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function collectTickets(tickets) {
  const acc = [];
  for (const phase of tickets.phases || []) {
    for (const ticket of phase.tickets || []) {
      acc.push({ phaseId: phase.id, ticket });
    }
  }
  return acc;
}

/** Surface existing ticket statuses (pre-promote) so preservation is recorded. */
// [::TICKET::] PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function surfaceExistingStatuses(tickets) {
  return collectTickets(tickets).map(({ ticket }) => ({ id: ticket.id, status: ticket.status || 'todo' }));
}

/**
 * Derive the Tickets evolution delta by diffing the real Tickets.json (before
 * promote) against the staged Tickets.json (the AI-crafted design). The result
 * is deterministic: it records exactly what the AI designed via add-ticket /
 * update-ticket, never the analyzer output.
 */
// [::TICKET::] PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function deriveTicketsDelta(beforeTickets, stagedTickets) {
  const beforeMap = new Map(collectTickets(beforeTickets).map(({ ticket }) => [ticketKeyOf(ticket), ticket]));
  const newTickets = [];
  const editedTickets = [];
  for (const { ticket } of collectTickets(stagedTickets)) {
    const before = beforeMap.get(ticketKeyOf(ticket));
    if (!before) {
      newTickets.push({
        id: ticket.id,
        title: ticket.title,
        nodeIds: ticket.nodeIds || [],
        status: ticket.status || 'todo',
        phaseId: ticket.phaseId,
      });
    } else if (JSON.stringify(before) !== JSON.stringify(ticket)) {
      editedTickets.push({
        id: ticket.id,
        nodeId: (ticket.nodeIds || [])[0] || null,
        path: null,
        changes: { title: ticket.title, status: ticket.status },
      });
    }
  }
  return {
    sourceFile: beforeTickets.metadata?.source || '',
    newTickets,
    editedTickets,
    existingStatuses: surfaceExistingStatuses(beforeTickets),
  };
}

/** Format the candidate report from a candidates object (AI judgment aid). */
// [::TICKET::] PX-162, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-162|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function formatTicketsDeltaReport(candidates) {
  const lines = ['## /drill-rfc-down Step 4 Split Stage', ''];
  lines.push('### New ticket candidates (analyzer information, not the plan)');
  for (const newTicket of candidates.newTickets || []) {
    lines.push(`- ${newTicket.title} (status: ${newTicket.status}, phase: ${newTicket.phaseId})`);
  }
  if (!candidates.newTickets || candidates.newTickets.length === 0) lines.push('- none');
  lines.push('');
  lines.push('### Edited ticket candidates');
  for (const editedTicket of candidates.editedTickets || []) {
    lines.push(`- ticket ${editedTicket.id} (${editedTicket.path || 'unmapped'}) -> ${JSON.stringify(editedTicket.changes)}`);
  }
  if (!candidates.editedTickets || candidates.editedTickets.length === 0) lines.push('- none');
  lines.push('');
  lines.push('### Existing statuses to preserve');
  for (const status of candidates.existingStatuses || []) {
    lines.push(`- ticket ${status.id}: ${status.status}`);
  }
  if (!candidates.existingStatuses || candidates.existingStatuses.length === 0) lines.push('- none');
  lines.push('');
  // The four-axis advisory (danger/omission/contradiction/deficiency) is a
  // mechanical inspection aid; it never blocks promote.
  if (candidates.advisory) {
    lines.push(buildAdvisoryReport(candidates.advisory));
  }
  lines.push('Design the evolution with add-ticket.js / update-ticket.js on the staging Tickets.json, then run --approve.');
  return lines.join('\n');
}

/** Emit an English Error/Cause/Action message and exit with status 1. */
// [::TICKET::] PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function failWithEnglishError(error, cause, action) {
  console.error(`[ERROR] split-step: ${error}`);
  console.error(`Cause: ${cause}`);
  console.error(`Action: ${action}`);
  process.exit(1);
}

/** Copy the real Tickets.json to the staging path so the AI can design. */
// [::TICKET::] PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function createStagingCopy(ticketsPath) {
  fs.copyFileSync(ticketsPath, stagingPathOf(ticketsPath));
}

/** Run the analyzer to write the candidates file and return the parsed candidates. */
// [::TICKET::] PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function produceCandidates(ticketsPath, dtdPath) {
  const outPath = candidatesPathOf(ticketsPath);
  const analyzerResult = runNode(ANALYZER, [`--dirs-tree-delta=${dtdPath}`, `--tickets=${ticketsPath}`, `--out=${outPath}`]);
  if (analyzerResult.status !== 0) {
    process.stderr.write(analyzerResult.stderr || analyzerResult.stdout);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(outPath, 'utf8'));
}

/** Validate the staging Tickets.json with validate-tickets. */
// [::TICKET::] PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function verifyStagingTickets(ticketsPath) {
  const staged = JSON.parse(fs.readFileSync(stagingPathOf(ticketsPath), 'utf8'));
  const validation = validateTickets(staged);
  if (!validation.valid) {
    failWithEnglishError(
      'the staged Tickets.json failed validate-tickets and was NOT promoted.',
      `validate-tickets reported: ${JSON.stringify(validation.errors)}`,
      'design the evolution on the staging Tickets.json with add-ticket.js / update-ticket.js so every ticket is consistent, then re-run --approve.'
    );
  }
}

/** Promote the staging copy to the real Tickets.json (the only promote path). */
// [::TICKET::] PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function promoteStagingToReal(ticketsPath) {
  fs.copyFileSync(stagingPathOf(ticketsPath), ticketsPath);
  fs.rmSync(stagingPathOf(ticketsPath), { force: true });
}

/** Discard the staging copy, leaving the real Tickets.json untouched. */
// [::TICKET::] PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function discardStaging(ticketsPath) {
  fs.rmSync(stagingPathOf(ticketsPath), { force: true });
}

/**
 * Remove the transient candidates file written by --stage. Once the design is
 * committed (--approve) or discarded (--reject), the candidates are stale and
 * regenerable; the delta (.delta.json) is the persistent record and is kept.
 */
// [::TICKET::] PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function removeCandidates(ticketsPath) {
  fs.rmSync(candidatesPathOf(ticketsPath), { force: true });
}

// [::TICKET::] PX-162, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-162|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  let ticketsPath = '';
  let dtdPath = '';
  let mode = '';
  for (const arg of args) {
    if (arg.startsWith('--tickets=')) ticketsPath = arg.slice('--tickets='.length);
    else if (arg.startsWith('--dirs-tree-delta=')) dtdPath = arg.slice('--dirs-tree-delta='.length);
    else if (arg === '--stage') mode = 'stage';
    else if (arg === '--approve') mode = 'approve';
    else if (arg === '--reject') mode = 'reject';
  }

  if (!ticketsPath || !mode) {
    console.error('Usage: split-step.js --tickets=<path> [--dirs-tree-delta=<path>] [--stage|--approve|--reject]');
    process.exit(1);
  }
  if (mode === 'stage' && !dtdPath) {
    failWithEnglishError(
      '--stage requires --dirs-tree-delta to produce the candidate report.',
      'no dirs-tree-delta path was provided, so the analyzer has nothing to analyze.',
      'run --stage with --dirs-tree-delta=<path> pointing at the Step 3 dirs-tree-delta.json.'
    );
  }

  if (mode === 'stage') {
    createStagingCopy(ticketsPath);
    const candidates = produceCandidates(ticketsPath, dtdPath);
    process.stdout.write(formatTicketsDeltaReport(candidates) + '\n');
    process.exit(0);
  }
  if (mode === 'reject') {
    discardStaging(ticketsPath);
    removeCandidates(ticketsPath);
    process.stdout.write('Plan rejected. Tickets.json left unchanged.\n');
    process.exit(0);
  }
  if (mode === 'approve') {
    if (!fs.existsSync(stagingPathOf(ticketsPath))) {
      failWithEnglishError(
        'cannot approve: no staging Tickets.json exists.',
        '--approve requires a staging copy created by --stage that the AI designed via add-ticket.js / update-ticket.js.',
        'run --stage first, design the evolution on the staging Tickets.json with add-ticket.js / update-ticket.js, then re-run --approve.'
      );
    }
    verifyStagingTickets(ticketsPath);
    const beforeTickets = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
    const stagedTickets = JSON.parse(fs.readFileSync(stagingPathOf(ticketsPath), 'utf8'));
    const delta = deriveTicketsDelta(beforeTickets, stagedTickets);
    fs.writeFileSync(deltaPathOf(ticketsPath), JSON.stringify(delta, null, 2) + '\n', 'utf8');
    promoteStagingToReal(ticketsPath);
    removeCandidates(ticketsPath);
    process.stdout.write('Staged Tickets.json verified and promoted; tickets-delta.json written for Step 5.\n');
    process.exit(0);
  }
}

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main();
}

export { formatTicketsDeltaReport, deriveTicketsDelta, stagingPathOf, candidatesPathOf, deltaPathOf, removeCandidates, main };
