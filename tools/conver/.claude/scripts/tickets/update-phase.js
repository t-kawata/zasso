#!/usr/bin/env node
/**
 * update-phase.js — Safe phase ownership edits for evolve mode.
 *
 * /split-to-tickets evolve mode must add nodes to a phase without renumbering any
 * existing phase or ticket. The fresh path rebuilds the phase array in
 * phasify-graph-and-dirs-files-tree.js, so it has no need for this writer. This
 * module is the only sanctioned way to mutate phase ownership in place.
 *
 * Both functions are pure: they deep-clone the document and return a new one. The
 * caller decides whether to promote the result.
 */

'use strict';

/** A defensive copy so a caller cannot observe a partial mutation. */
// [::TICKET::] PX-373 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-373 --for-spec --no-implementation-order`.
function cloneDocument(ticketsDocument) {
  return JSON.parse(JSON.stringify(ticketsDocument));
}

/**
 * Append graph node ids to one phase's nodeIds.
 *
 * An id already present is reported as a duplicate and is not appended again, so a
 * repeated evolve run cannot grow the array. The phase id and every ticket id stay
 * exactly as they were.
 *
 * @param {object} ticketsDocument — parsed Tickets.json
 * @param {number} phaseId — the phase to edit
 * @param {string[]} nodeIds — graph node ids to append
 * @returns {{ ok: boolean, document: object, added: string[], duplicates: string[], code?: string }}
 */
// [::TICKET::] PX-373 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-373 --for-spec --no-implementation-order`.
function addPhaseNodeIds(ticketsDocument, phaseId, nodeIds) {
  const document = cloneDocument(ticketsDocument);
  const phase = (document.phases || []).find((entry) => entry.id === phaseId);
  if (phase === undefined) {
    return { ok: false, code: 'PHASE_NOT_FOUND', document: ticketsDocument, added: [], duplicates: [] };
  }

  phase.nodeIds = Array.isArray(phase.nodeIds) ? phase.nodeIds : [];
  const present = new Set(phase.nodeIds);
  const added = [];
  const duplicates = [];

  for (const nodeId of nodeIds || []) {
    if (present.has(nodeId)) {
      duplicates.push(nodeId);
      continue;
    }
    phase.nodeIds.push(nodeId);
    present.add(nodeId);
    added.push(nodeId);
  }

  return { ok: true, document, added, duplicates };
}

/**
 * Insert a phase at an array position.
 *
 * The phase array order is the implementation order (implementation-order.mjs uses
 * the flat ticket index), so inserting at an index is how evolve mode places new
 * work without renumbering an existing phase. A non-contiguous id is accepted and
 * preserved.
 *
 * @param {object} ticketsDocument — parsed Tickets.json
 * @param {object} phase — the phase record to insert
 * @param {number} index — target position in the phase array
 * @returns {{ ok: boolean, document: object, index: number, code?: string }}
 */
// [::TICKET::] PX-373 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-373 --for-spec --no-implementation-order`.
function insertPhaseAt(ticketsDocument, phase, index) {
  const document = cloneDocument(ticketsDocument);
  const phases = Array.isArray(document.phases) ? document.phases : [];

  if (phases.some((entry) => entry.id === phase?.id)) {
    return { ok: false, code: 'DUPLICATE_PHASE_ID', document: ticketsDocument, index: -1 };
  }

  const requested = Number.isInteger(index) ? index : phases.length;
  const position = Math.max(0, Math.min(requested, phases.length));
  phases.splice(position, 0, JSON.parse(JSON.stringify(phase)));
  document.phases = phases;

  return { ok: true, document, index: position };
}

module.exports = {
  addPhaseNodeIds,
  insertPhaseAt,
};
