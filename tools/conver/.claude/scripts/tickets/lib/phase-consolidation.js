'use strict';

/**
 * phase-consolidation — keep every surviving phase at or above the ticket floor.
 *
 * Condensation is a per-phase decision, so it can shrink a phase below three
 * tickets after the split's Step 5-3 consolidation has already run. The floor is
 * therefore a property of the condensed document, not of the split alone.
 *
 * This module owns the phase-boundary decision:
 *   - a phase below the floor merges into the following phase (tickets are
 *     prepended, preserving implementation order);
 *   - the last phase merges backward because it has no following target;
 *   - a sole phase is exempt: it has no merge target.
 *
 * The merge moves whole tickets. It never splits one, never rewrites authored
 * fields, and leaves an excluded phase (PX) byte-identical. Every moved key is
 * recorded in `keyMap` so the caller can remap live references and identity.
 */

const {
  DEFAULT_EXCLUDED_PHASES,
  ticketKeyOf,
  collectAbsorbedEntries,
} = require('./ticket-identity-renumber.js');

/** Minimum tickets a phase must hold unless it is the sole phase. */
const MIN_TICKETS_PER_PHASE = 3;

/** The ticket count of a phase. */
function ticketCount(phase) {
  return Array.isArray(phase?.tickets) ? phase.tickets.length : 0;
}

/** Preserve order while removing duplicates. */
function unionValues(left, right) {
  const values = [];
  for (const value of [...(left ?? []), ...(right ?? [])]) {
    if (!values.includes(value)) values.push(value);
  }
  return values;
}

/** Join a merged phase's name and summary without losing either side. */
function mergeProse(target, source) {
  target.name = `${target.name} → ${source.name}`;
  target.summary = target.summary
    ? `${target.summary}\n---\n${source.summary ?? ''}`
    : source.summary;
}

/** Move every ticket of `source` to the front of `target`, preserving order. */
function prependPhase(target, source) {
  target.tickets = [...source.tickets, ...target.tickets];
  target.nodeIds = unionValues(source.nodeIds, target.nodeIds);
  mergeProse(target, source);
}

/** Move every ticket of `source` to the end of `target`, preserving order. */
function appendPhase(target, source) {
  target.tickets = [...target.tickets, ...source.tickets];
  target.nodeIds = unionValues(target.nodeIds, source.nodeIds);
  mergeProse(target, source);
}

/** A deep clone of a phase; excluded phases are never passed here. */
function clonePhase(phase) {
  return JSON.parse(JSON.stringify(phase));
}

/** The next non-null phase after `index`. */
function nextPhase(phases, index) {
  for (let cursor = index + 1; cursor < phases.length; cursor += 1) {
    if (phases[cursor] !== null) return cursor;
  }
  return -1;
}

/**
 * Merge the non-excluded phases until every survivor meets the floor.
 *
 * Mirrors the split's consolidation pass, but operates on the already-condensed
 * ticket arrays. Returns clones; the input is not mutated.
 *
 * @param {Array<object>} phases
 * @param {{ minTicketsPerPhase?: number, excludedPhases?: number[] }} [options]
 * @returns {{ phases, keyMap, changed, mergedCount, beforeCounts, afterCounts }}
 */
// [::TICKET::] PX-415, PX-416, PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416|PX-407) --for-spec --no-implementation-order`.
function mergeSmallPhases(phases, options = {}) {
  const minimum = options.minTicketsPerPhase ?? MIN_TICKETS_PER_PHASE;
  const excluded = new Set(options.excludedPhases ?? DEFAULT_EXCLUDED_PHASES);
  const mergeStatusPolicy = options.mergeStatusPolicy ?? 'todo';
  const original = Array.isArray(phases) ? phases : [];
  const beforeCounts = original.filter(Boolean).map((phase) => ticketCount(phase));
  const working = tagWorkingPhases(original, excluded);
  const barriers = new Set(
    mergeStatusPolicy === 'todo'
      ? working.filter((phase) => (phase?.tickets ?? []).some((ticket) => ticket.status !== 'todo')).map((phase) => phase.id)
      : [],
  );
  const mergedCount = mergePhaseOrder(working, minimum, barriers);
  const survivors = working.filter((phase) => phase !== null);
  const { keyMap, changed } = assignDenseKeys(original, excluded, survivors);
  const result = rebuildPhaseOrder(original, excluded, survivors);

  return {
    phases: result,
    keyMap,
    changed: changed || mergedCount > 0,
    mergedCount,
    beforeCounts,
    afterCounts: result.map((phase) => ticketCount(phase)),
  };
}

/** Clone the non-excluded phases and stamp each ticket's pre-merge key. */
function tagWorkingPhases(original, excluded) {
  const working = [];
  for (const phase of original) {
    if (!phase || excluded.has(phase.id)) continue;
    const clone = clonePhase(phase);
    // The source key must be stamped before the merge: a moved ticket's owning
    // phase id is the one it came from, not the survivor's id.
    for (const ticket of clone.tickets ?? []) {
      ticket.__sourceKey = ticketKeyOf({ ...ticket, phaseId: phase.id });
    }
    working.push(clone);
  }
  return working;
}

/** Merge the last phase backward, then scan right-to-left. Returns the count moved. */
// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function mergePhaseOrder(working, minimum, barriers = new Set()) {
  let mergedCount = 0;

  // The last phase has no following target: a small last phase moves backward.
  if (
    working.length > 1
    && ticketCount(working[working.length - 1]) < minimum
    && !barriers.has(working[working.length - 1]?.id)
    && !barriers.has(working[working.length - 2]?.id)
  ) {
    const last = working.pop();
    appendPhase(working[working.length - 1], last);
    mergedCount += 1;
  }

  // Right-to-left: every phase to the right is already final, so a small phase
  // can move into it without revisiting the phases already passed.
  for (let index = working.length - 2; index >= 0; index -= 1) {
    if (working[index] === null) continue;
    if (barriers.has(working[index]?.id)) continue;
    const targetIndex = nextPhase(working, index);
    if (targetIndex === -1) continue;
    if (barriers.has(working[targetIndex]?.id)) continue;
    if (ticketCount(working[index]) >= minimum) continue;
    prependPhase(working[targetIndex], working[index]);
    working[index] = null;
    mergedCount += 1;
  }

  return mergedCount;
}

/**
 * Give every surviving phase and ticket a dense id and return the key map.
 *
 * Excluded-phase keys map to themselves so a caller's lookup stays total.
 */
// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function assignDenseKeys(original, excluded, survivors) {
  const keyMap = new Map();
  for (const phase of original) {
    if (!phase || !excluded.has(phase.id)) continue;
    for (const ticket of phase.tickets ?? []) {
      const key = ticketKeyOf({ ...ticket, phaseId: phase.id });
      keyMap.set(key, key);
    }
  }

  // A historical key may have been reused as a live key by an earlier dense
  // renumber (P0-2 absorbed in one generation, P0-2 live in the next). The
  // alias table already resolves that history; the live key owns the current
  // map, so the absorbed entry must not overwrite it.
  const liveSourceKeys = new Set(
    survivors.flatMap((phase) => (phase.tickets ?? []).map((ticket) => ticket.__sourceKey)),
  );

  let changed = false;
  survivors.forEach((phase, phaseIndex) => {
    const oldPhaseId = phase.id;
    if (oldPhaseId !== phaseIndex) changed = true;
    phase.id = phaseIndex;
    phase.tickets = (phase.tickets ?? []).map((ticket, ticketIndex) => {
      const newId = ticketIndex + 1;
      const newKey = ticketKeyOf({ phaseId: phase.id, id: newId });
      const sourceKey = typeof ticket.__sourceKey === 'string'
        ? ticket.__sourceKey
        : ticketKeyOf({ phaseId: oldPhaseId, id: ticket.id });
      if (ticket.id !== newId || (ticket.phaseId !== undefined && ticket.phaseId !== phase.id)) changed = true;
      registerKey(keyMap, sourceKey, newKey);
      for (const entry of collectAbsorbedEntries(ticket)) {
        const absorbedKey = entry.key !== null
          ? entry.key
          : ticketKeyOf({ phaseId: oldPhaseId, id: entry.id });
        if (liveSourceKeys.has(absorbedKey)) continue;
        registerKey(keyMap, absorbedKey, newKey);
      }
      const { __sourceKey, ...rest } = ticket;
      return { ...rest, id: newId, phaseId: phase.id };
    });
  });

  return { keyMap, changed };
}

/** Record one old-key owner; a key may not point at two different survivors. */
function registerKey(keyMap, oldKey, newKey) {
  if (keyMap.has(oldKey) && keyMap.get(oldKey) !== newKey) {
    throw Object.assign(
      new Error(`ticket key ${oldKey} is owned by ${keyMap.get(oldKey)} and ${newKey}`),
      { code: 'IDENTITY_DUPLICATE_KEY' },
    );
  }
  keyMap.set(oldKey, newKey);
}

/** Rebuild the document order, keeping an excluded phase in its original slot. */
function rebuildPhaseOrder(original, excluded, survivors) {
  const result = [];
  let survivorIndex = 0;
  for (const phase of original) {
    if (!phase) continue;
    if (excluded.has(phase.id)) {
      result.push(phase);
    } else if (survivorIndex < survivors.length) {
      result.push(survivors[survivorIndex]);
      survivorIndex += 1;
    }
  }
  while (survivorIndex < survivors.length) {
    result.push(survivors[survivorIndex]);
    survivorIndex += 1;
  }
  return result;
}

/**
 * Preview the phase merge for a plan without touching ticket objects.
 *
 * @param {Array<object>} phases — phases carrying `id`
 * @param {number[]} counts — the planned ticket count of each phase, same order
 */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function planPhaseMerges(phases, counts, options = {}) {
  const synthetic = (Array.isArray(phases) ? phases : []).map((phase, index) => ({
    id: phase.id,
    name: phase.name ?? `P${phase.id}`,
    summary: phase.summary ?? '',
    nodeIds: phase.nodeIds ?? [],
    tickets: Array.from({ length: counts[index] ?? 0 }, (_, ticketIndex) => ({
      id: ticketIndex + 1,
      phaseId: phase.id,
      title: '',
      status: 'todo',
    })),
  }));
  const result = mergeSmallPhases(synthetic, options);
  return {
    changed: result.changed,
    mergedCount: result.mergedCount,
    beforeCounts: result.beforeCounts,
    afterCounts: result.afterCounts,
  };
}

/**
 * Report every non-excluded phase below the floor while another phase remains.
 *
 * A sole phase is exempt because it has no merge target. A small final phase is
 * not exempt while an earlier phase exists: it merges backward.
 */
// [::TICKET::] PX-415, PX-416, PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416|PX-407) --for-spec --no-implementation-order`.
function collectPhaseFloorFindings(document, options = {}) {
  const minimum = options.minTicketsPerPhase ?? MIN_TICKETS_PER_PHASE;
  const excluded = new Set(options.excludedPhases ?? DEFAULT_EXCLUDED_PHASES);
  const mergeStatusPolicy = options.mergeStatusPolicy ?? 'todo';
  const phases = (document?.phases ?? []).filter((phase) => phase && !excluded.has(phase.id));
  if (phases.length <= 1) return [];
  return phases
    .filter((phase) => {
      if (mergeStatusPolicy === 'todo' && (phase.tickets ?? []).some((ticket) => ticket.status !== 'todo')) return false;
      return ticketCount(phase) < minimum;
    })
    .map((phase) => ({
      code: 'PHASE_BELOW_MIN_TICKETS',
      phaseId: phase.id,
      tickets: ticketCount(phase),
      minimum,
      message: `P${phase.id} has ${ticketCount(phase)} ticket(s); phases below ${minimum} must merge`,
    }));
}

module.exports = {
  MIN_TICKETS_PER_PHASE,
  mergeSmallPhases,
  planPhaseMerges,
  collectPhaseFloorFindings,
};
