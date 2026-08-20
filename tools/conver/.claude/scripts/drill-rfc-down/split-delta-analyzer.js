#!/usr/bin/env node
/**
 * split-delta-analyzer.js --dirs-tree-delta=<path> --tickets=<path> --out=<path>
 *
 * /drill-rfc-down Step 4 split delta analyzer (PX-162).
 *
 * Reads Step 3 dirs-tree-delta.json and the existing Tickets.json, and
 * deterministically proposes the Tickets evolution candidates:
 *   - newTickets:     a new ticket (status todo) for each new file / new node
 *   - editedTickets:  the existing ticket mapped to each modified node
 *   - phaseAssignments: phase assignment for the new tickets
 *   - existingStatuses: surface existing ticket id + status so the AI can
 *                       preserve them (never silently overwrite)
 *
 * Generates tickets-delta.json (the lockstep handoff for Step 5 verify) and
 * NEVER writes to Tickets.json — the write happens only after the AI
 * engineering-expert approves the dry-run plan.
 *
 * Exit codes: 0 = success, 1 = failure (missing args, malformed dirs-tree-delta).
 *
 * Design context: tools/conver/README.md — 進化ループ / /drill-rfc-down (Step 4).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/** The next phase id after the highest existing phase id. */
// [::TICKET::] PX-162 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-162 --for-spec --no-implementation-order`.
function nextPhaseId(tickets) {
  const maxPhase = (tickets.phases || []).reduce((max, p) => Math.max(max, p.id), 0);
  return maxPhase + 1;
}

/** Propose a new ticket for each new file in the dirs-tree-delta. */
// [::TICKET::] PX-162 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-162 --for-spec --no-implementation-order`.
function proposeNewTicketCandidates(newFiles, phaseId) {
  return (newFiles || []).map((fileCandidate) => ({
    title: fileCandidate.title,
    nodeIds: [fileCandidate.nodeId],
    status: 'todo',
    phaseId,
  }));
}

/** Find the existing ticket mapped to each modified node and propose an edit. */
// [::TICKET::] PX-162 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-162 --for-spec --no-implementation-order`.
function proposeEditCandidates(modifiedFiles, tickets) {
  const allTickets = (tickets.phases || []).flatMap((p) => p.tickets || []);
  return (modifiedFiles || []).map((modifiedFile) => {
    const mapped = allTickets.find((t) => (t.nodeIds || []).includes(modifiedFile.nodeId));
    return {
      id: mapped ? mapped.id : null,
      nodeId: modifiedFile.nodeId,
      path: modifiedFile.path,
      changes: modifiedFile.changes,
    };
  });
}

/** Surface existing ticket statuses so the AI can preserve them. */
// [::TICKET::] PX-162 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-162 --for-spec --no-implementation-order`.
function surfaceExistingStatuses(tickets) {
  const allTickets = (tickets.phases || []).flatMap((p) => p.tickets || []);
  return allTickets.map((t) => ({ id: t.id, status: t.status || 'todo' }));
}

/**
 * Propose the Tickets evolution candidates deterministically.
 * Returns { newTickets, editedTickets, phaseAssignments, existingStatuses }.
 */
// [::TICKET::] PX-162 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-162 --for-spec --no-implementation-order`.
function analyzeTicketsDelta(dirsTreeDelta, tickets) {
  const phaseId = nextPhaseId(tickets);
  const newTickets = proposeNewTicketCandidates(dirsTreeDelta.newFiles, phaseId);
  return {
    newTickets,
    editedTickets: proposeEditCandidates(dirsTreeDelta.modifiedFiles, tickets),
    phaseAssignments: newTickets.map((t) => ({ title: t.title, phaseId: t.phaseId })),
    existingStatuses: surfaceExistingStatuses(tickets),
  };
}

// [::TICKET::] PX-162 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-162 --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  let dtdPath = '';
  let ticketsPath = '';
  let outPath = '';
  for (const arg of args) {
    if (arg.startsWith('--dirs-tree-delta=')) dtdPath = arg.slice('--dirs-tree-delta='.length);
    else if (arg.startsWith('--tickets=')) ticketsPath = arg.slice('--tickets='.length);
    else if (arg.startsWith('--out=')) outPath = arg.slice('--out='.length);
  }
  if (!dtdPath || !ticketsPath || !outPath) {
    console.error('Usage: split-delta-analyzer.js --dirs-tree-delta=<path> --tickets=<path> --out=<path>');
    process.exit(1);
  }

  let dirsTreeDelta;
  try {
    dirsTreeDelta = JSON.parse(fs.readFileSync(dtdPath, 'utf8'));
  } catch (e) {
    console.error(`[ERROR] split-delta-analyzer: invalid dirs-tree-delta.json: ${e.message}`);
    process.exit(1);
  }
  let tickets;
  try {
    tickets = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  } catch (e) {
    console.error(`[ERROR] split-delta-analyzer: invalid Tickets.json: ${e.message}`);
    process.exit(1);
  }

  // Fully deterministic output (no timestamp) so repeated analysis is identical.
  const ticketsDelta = {
    sourceFile: dirsTreeDelta.sourceFile || '',
    ...analyzeTicketsDelta(dirsTreeDelta, tickets),
  };
  fs.writeFileSync(outPath, JSON.stringify(ticketsDelta, null, 2) + '\n', 'utf8');
  process.stdout.write(JSON.stringify({ ok: true, ...ticketsDelta }) + '\n');
}

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main();
}

export { nextPhaseId, proposeNewTicketCandidates, proposeEditCandidates, surfaceExistingStatuses, analyzeTicketsDelta, main };
