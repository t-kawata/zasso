#!/usr/bin/env node
// [::TICKET::] PX-2: generic-ticket-creation — the unified ticket-creation core.

/**
 * generic-ticket-creation.js — PX-2 unified core.
 *
 * The single shared creation path for every conver ticket-adding flow. Given a list
 * of seeds (each carrying a `type` discriminator), it creates all tickets in memory,
 * validates every seed, and returns the merged data for a single atomic commit — or
 * aborts with zero writes when any seed fails (C002). It reuses the PX-1 machinery:
 *   resolving      -> createResolvingTicket (with on-disk marker verification C003/C009)
 *   deferral       -> createTicketFromSource + setStubDeferredTo
 *   crimeDeferral  -> createTicketFromSource + setCrimeDeferredTo
 *   bulk           -> bulkAddTickets
 *
 * Contracts (PX-2):
 *   C001 all four seed shapes are expressible; flow scripts delegate with parity
 *   C002 atomicity — any failure aborts with zero committed state
 *   C003 PX-1 safety preserved (duplicate file:line rejection, on-disk verification)
 *   C004 command docs reference the core (documented in the command .md files)
 */

const path = require("path");
const { createResolvingTicket } = require("../tickets/create-resolving-ticket.js");
const { createTicketFromSource } = require("./create-ticket-from-source.js");
const { bulkAddTickets } = require("../tickets/bulk-add-tickets.js");
const { checkOnDiskMarker } = require("../tickets/batch-create-resolving-tickets.js");

/**
 * Set a targetStub's deferredTo to a new ticket key.
 * @param {object} ticketsData — Parsed Tickets.json (mutated in place)
 * @param {string} stubId
 * @param {string} newKey
 * @returns {boolean} — true when the stub was found and updated
 */
// [::TICKET::] PX-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-2 --for-spec --no-implementation-order`.
function setStubDeferredTo(ticketsData, stubId, newKey) {
  for (const phase of ticketsData.phases) {
    for (const ticket of phase.tickets || []) {
      const stub = (ticket.targetStubs || []).find((s) => s.id === stubId);
      if (stub) {
        stub.deferredTo = newKey;
        return true;
      }
    }
  }
  return false;
}

/**
 * Set a targetCrime's deferredTo to a new ticket key.
 * @param {object} ticketsData — Parsed Tickets.json (mutated in place)
 * @param {string} crimeId
 * @param {string} newKey
 * @returns {boolean} — true when the crime was found and updated
 */
// [::TICKET::] PX-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-2 --for-spec --no-implementation-order`.
function setCrimeDeferredTo(ticketsData, crimeId, newKey) {
  for (const phase of ticketsData.phases) {
    for (const ticket of phase.tickets || []) {
      const crime = (ticket.targetCrimes || []).find((c) => c.id === crimeId);
      if (crime) {
        crime.deferredTo = newKey;
        return true;
      }
    }
  }
  return false;
}

/**
 * Dispatch a single seed to its creation path.
 * @param {object} data — Working copy of Tickets.json (mutated only for bulk)
 * @param {object} seed — {type, sourceKey?, seed?, stubId?, crimeId?, phaseId?, tickets?, stubs?}
 * @param {string|null} sourceRoot — Repo root for resolving-seed file paths
 * @returns {{success: true, data: object, created: Array}|{success: false, error: string}}
 */
// [::TICKET::] PX-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-2 --for-spec --no-implementation-order`.
function createOne(data, seed, sourceRoot) {
  switch (seed.type) {
    case "resolving": {
      const stub = (seed.stubs || [])[0];
      // C003/C009: verify the on-disk marker before creating when a file/line is given.
      if (stub && stub.file && stub.line) {
        const marker = checkOnDiskMarker(
          { file: stub.file, line: stub.line, content: stub.content, sourceKey: seed.sourceKey },
          sourceRoot || process.cwd(),
          data
        );
        if (marker.status === "skip") return { success: true, data, created: [] };
        if (marker.status === "refuse") return { success: false, error: marker.reason };
      }
      const res = createResolvingTicket({
        ticketsData: data,
        sourceKey: seed.sourceKey,
        seed: seed.seed,
        stubs: seed.stubs || [],
      });
      if (!res.success) return { success: false, error: res.error };
      return { success: true, data: res.data, created: [{ sourceKey: seed.sourceKey, newKey: res.key, ticket: res.ticket }] };
    }
    case "deferral": {
      const res = createTicketFromSource({ ticketsData: data, sourceKey: seed.sourceKey, seed: seed.seed });
      if (!res.success) return { success: false, error: res.error };
      if (seed.stubId && !setStubDeferredTo(res.data, seed.stubId, res.key)) {
        return { success: false, error: "targetStub not found: " + seed.stubId };
      }
      return { success: true, data: res.data, created: [{ sourceKey: seed.sourceKey, newKey: res.key, ticket: res.ticket }] };
    }
    case "crimeDeferral": {
      const res = createTicketFromSource({ ticketsData: data, sourceKey: seed.sourceKey, seed: seed.seed });
      if (!res.success) return { success: false, error: res.error };
      if (seed.crimeId && !setCrimeDeferredTo(res.data, seed.crimeId, res.key)) {
        return { success: false, error: "targetCrime not found: " + seed.crimeId };
      }
      return { success: true, data: res.data, created: [{ sourceKey: seed.sourceKey, newKey: res.key, ticket: res.ticket }] };
    }
    case "bulk": {
      const res = bulkAddTickets(data, [{ phaseId: seed.phaseId, tickets: seed.tickets }]);
      if (!res.success) return { success: false, error: res.error || "bulk add failed" };
      return { success: true, data, created: (res.tickets || []).map((tk) => ({ newKey: tk.ticketKey })) };
    }
    default:
      return { success: false, error: "unknown seed type: " + seed.type };
  }
}

/**
 * Create all tickets described by the seeds, atomically (in memory).
 * @param {object} params
 * @param {object} params.ticketsData — Parsed Tickets.json
 * @param {Array} params.seeds — Seeds [{type, ...}]
 * @param {string|null} [params.sourceRoot]
 * @param {boolean} [params.noWrite] — Dry-run: create in memory, report, write nothing
 * @returns {{success: true, data: object, created: Array, dryRun?: boolean}
 *          |{success: false, errors: Array, created: Array}}
 */
// [::TICKET::] PX-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-2 --for-spec --no-implementation-order`.
function createTickets({ ticketsData, seeds, sourceRoot, noWrite = false }) {
  const errors = [];
  if (!Array.isArray(seeds)) {
    return { success: false, errors: [{ error: "seeds must be an array" }], created: [] };
  }

  // C008: reject duplicate file:line across resolving seeds before any creation.
  const seen = new Set();
  for (const seed of seeds) {
    if (seed.type === "resolving") {
      const stub = (seed.stubs || [])[0];
      if (stub && stub.file && stub.line) {
        const dupKey = stub.file + ":" + stub.line;
        if (seen.has(dupKey)) errors.push({ error: "duplicate file:line seed: " + dupKey });
        seen.add(dupKey);
      }
    }
  }
  if (errors.length > 0) return { success: false, errors, created: [] };

  let data = JSON.parse(JSON.stringify(ticketsData));
  const created = [];
  for (const seed of seeds) {
    const res = createOne(data, seed, sourceRoot);
    if (!res.success) {
      errors.push({ error: res.error, type: seed.type, sourceKey: seed.sourceKey });
      continue;
    }
    data = res.data;
    for (const createdEntry of res.created) created.push({ type: seed.type, ...createdEntry });
  }

  // C002: a failed run must not expose partial state.
  if (errors.length > 0) return { success: false, errors, created };

  if (noWrite) return { success: true, data, created, dryRun: true };
  return { success: true, data, created };
}

module.exports = { createTickets, createOne, setStubDeferredTo, setCrimeDeferredTo };
