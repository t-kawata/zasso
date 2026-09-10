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
 * Generates split-candidates.json (the candidates the AI designs from) and
 * NEVER writes to Tickets.json — the write happens only after the AI
 * engineering-expert approves the staged plan. The AI's design is recorded in
 * tickets-delta.json by split-step.js --approve (the Step 5 handoff).
 *
 * Exit codes: 0 = success, 1 = failure (missing args, malformed dirs-tree-delta).
 *
 * Design context: tools/conver/README.md — 進化ループ / /drill-rfc-down (Step 4).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { emptyAdvisory } from './advisory-report.js';

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

/**
 * Validate the generated candidates structure and return English error messages.
 * Returns an empty array when valid. editedTickets.id may be null for an
 * unmapped modified node (the AI decides which ticket to fold it into), so only
 * nodeId is required for edited tickets.
 */
// [::TICKET::] PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function validateCandidates(candidates) {
  const errors = [];
  const requireFields = (items, pathPrefix, required) => {
    for (const item of items || []) {
      for (const field of required) {
        if (!item[field] || (Array.isArray(item[field]) && item[field].length === 0)) {
          errors.push(`${pathPrefix} item is missing required field "${field}"`);
        }
      }
    }
  };
  requireFields(candidates.newTickets, 'newTickets', ['title', 'nodeIds', 'status', 'phaseId']);
  requireFields(candidates.editedTickets, 'editedTickets', ['nodeId']);
  requireFields(candidates.phaseAssignments, 'phaseAssignments', ['title', 'phaseId']);
  requireFields(candidates.existingStatuses, 'existingStatuses', ['id', 'status']);
  return errors;
}

/** A danger finding: editing a ticket whose existing status is not 'todo' risks silent overwrite. */
// [::TICKET::] PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-168|PX-169) --for-spec --no-implementation-order`.
function flagStatusOverwriteRisks(editedTickets, tickets) {
  const byId = new Map((tickets.phases || []).flatMap((p) => (p.tickets || []).map((t) => [t.id, t])));
  const findings = [];
  for (const editedTicket of editedTickets || []) {
    if (editedTicket.id === null) continue;
    const existing = byId.get(editedTicket.id);
    const status = existing?.status || 'todo';
    if (status !== 'todo') {
      findings.push({ message: `editing ticket ${editedTicket.id} whose status is "${status}"; preserve it and never silently overwrite` });
    }
  }
  return findings;
}

/** An omission finding: a modified node maps to no existing ticket. */
// [::TICKET::] PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-168|PX-169) --for-spec --no-implementation-order`.
function flagUnmappedModifiedFiles(editedTickets) {
  return (editedTickets || [])
    .filter((editedTicket) => editedTicket.id === null)
    .map((editedTicket) => ({ message: `modified node ${editedTicket.nodeId} maps to no existing ticket; decide whether to create or merge` }));
}

/** A contradiction finding: a new file's node is already covered by an existing ticket (duplicate). */
// [::TICKET::] PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-168|PX-169) --for-spec --no-implementation-order`.
function flagDuplicateNodeTickets(newFiles, tickets) {
  const covered = new Set((tickets.phases || []).flatMap((p) => (p.tickets || []).flatMap((t) => t.nodeIds || [])));
  return (newFiles || [])
    .filter((fileCandidate) => covered.has(fileCandidate.nodeId))
    .map((fileCandidate) => ({ message: `new file for node ${fileCandidate.nodeId} duplicates an existing ticket; prefer an edit over a new ticket` }));
}

/** A deficiency finding: a new ticket candidate lacks scope or test plan. */
// [::TICKET::] PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-168|PX-169) --for-spec --no-implementation-order`.
function flagScopeDeficiencies(newTickets) {
  return (newTickets || [])
    .filter((ticketCandidate) => !ticketCandidate.scope || !ticketCandidate.testUnit)
    .map((ticketCandidate) => ({ message: `new ticket "${ticketCandidate.title}" has no scope or test plan yet; define them via update-ticket on staging before approve` }));
}

/**
 * Mechanically inspect the candidates on the four axes (danger / omission /
 * contradiction / deficiency) as an advisory for the AI. Advisory-only: the
 * findings never block promote.
 */
// [::TICKET::] PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-168|PX-169) --for-spec --no-implementation-order`.
function inspectCandidates(dirsTreeDelta, candidates, tickets) {
  const advisory = emptyAdvisory();
  advisory.danger = flagStatusOverwriteRisks(candidates.editedTickets, tickets);
  advisory.omission = flagUnmappedModifiedFiles(candidates.editedTickets);
  advisory.contradiction = flagDuplicateNodeTickets(dirsTreeDelta.newFiles, tickets);
  advisory.deficiency = flagScopeDeficiencies(candidates.newTickets);
  return advisory;
}

// [::TICKET::] PX-162, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-162|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
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

  // The candidates are fully deterministic (no timestamp) so repeated analysis
  // of identical inputs yields byte-identical output. The output is INFORMATION
  // for the AI; it is never applied directly.
  const candidates = {
    sourceFile: dirsTreeDelta.sourceFile || '',
    ...analyzeTicketsDelta(dirsTreeDelta, tickets),
  };
  // Mechanically inspect the candidates on the four axes (danger / omission /
  // contradiction / deficiency) as an advisory for the AI. Advisory-only.
  candidates.advisory = inspectCandidates(dirsTreeDelta, candidates, tickets);
  // Guarantee the output is always valid JSON with the expected shape; on
  // failure emit a natural-language English Error/Cause/Action and exit 1.
  const validationErrors = validateCandidates(candidates);
  if (validationErrors.length > 0) {
    console.error('[ERROR] split-delta-analyzer: generated candidates failed schema validation');
    console.error('Cause: ' + validationErrors.join('; '));
    console.error('Action: fix the candidate generation so every candidate carries its required fields, then re-run.');
    process.exit(1);
  }
  fs.writeFileSync(outPath, JSON.stringify(candidates, null, 2) + '\n', 'utf8');
  process.stdout.write(JSON.stringify({ ok: true, ...candidates }) + '\n');
}

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main();
}

export { nextPhaseId, proposeNewTicketCandidates, proposeEditCandidates, surfaceExistingStatuses, analyzeTicketsDelta, validateCandidates, flagStatusOverwriteRisks, flagUnmappedModifiedFiles, flagDuplicateNodeTickets, flagScopeDeficiencies, inspectCandidates, main };
