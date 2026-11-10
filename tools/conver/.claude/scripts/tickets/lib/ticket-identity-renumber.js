'use strict';

/**
 * ticket-identity-renumber — one implementation of dense ticket identity.
 *
 * Condensation and phase consolidation both move ticket keys. Every producer must
 * rewrite every reference with the same rules, or a key written against one numbering
 * silently points at another ticket after the move. This module owns that rule:
 *
 *   - a live phase is renumbered 1..N in implementation-array order;
 *   - every live field is rewritten in one pass, so a permutation cannot chain;
 *   - history keeps its old keys and gains the generation they belong to;
 *   - the document carries the alias table that resolves those historical keys.
 *
 * The remap is deliberately single-pass. The previous sequential implementation turned
 * `{P0-1 -> P0-2, P0-2 -> P0-3}` on `P0-1, P0-2` into `P0-3, P0-3`, which is why a
 * dense renumber cannot reuse it.
 */

const PX_PHASE_ID = -1;
const DEFAULT_EXCLUDED_PHASES = Object.freeze([PX_PHASE_ID]);
const KEY_TOKEN_PATTERN = /(^|[^A-Za-z0-9-])((?:PX|P-?\d+)-(\d+))(?![A-Za-z0-9-])/g;
const HISTORICAL_FIELDS = Object.freeze(['changes', 'condensedFrom']);
/** Obligation fields with their own remap rule; the generic string walk must not touch them. */
const IMPLEMENTER_REFERENCE_FIELDS = Object.freeze(['implementerTicketKey']);
const IDENTITY_FIELD = 'identity';
const GENERATION_FIELD = 'generation';
const ALIASES_FIELD = 'aliases';
const EXCLUDED_PHASES_FIELD = 'excludedPhases';
const DENSE_FIRST_ID = 1;

/** The public key of a ticket. */
// [::TICKET::] PX-402 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-402 --for-spec --no-implementation-order`.
function ticketKeyOf(ticket) {
  return ticket?.phaseId === PX_PHASE_ID
    ? `PX-${ticket.id}`
    : `P${ticket.phaseId}-${ticket.id}`;
}

/** The numeric id encoded in a public key, or null. */
// [::TICKET::] PX-402 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-402 --for-spec --no-implementation-order`.
function numericIdOfKey(key) {
  const match = /-(\d+)$/.exec(String(key));
  return match === null ? null : parseInt(match[1], 10);
}

/** The absorbed entries a ticket carries, with their numeric id when present. */
// [::TICKET::] PX-402 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-402 --for-spec --no-implementation-order`.
function collectAbsorbedEntries(ticket) {
  const entries = ticket?.condensedFrom?.tickets;
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => ({
      key: typeof entry?.key === 'string' ? entry.key : null,
      id: typeof entry?.id === 'number' ? entry.id : numericIdOfKey(entry?.key),
    }))
    .filter((entry) => entry.key !== null || entry.id !== null);
}

/** The excluded phase set for a document. */
// [::TICKET::] PX-402 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-402 --for-spec --no-implementation-order`.
function excludedPhasesOf(document, options = {}) {
  return new Set(options.excludedPhases ?? document?.identity?.[EXCLUDED_PHASES_FIELD] ?? DEFAULT_EXCLUDED_PHASES);
}

/** The dense map of a document: old live key and absorbed key -> current key. */
// [::TICKET::] PX-402 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-402 --for-spec --no-implementation-order`.
function buildDenseRenumberMap(phases, options = {}) {
  const excluded = new Set(options.excludedPhases ?? DEFAULT_EXCLUDED_PHASES);
  const keyMap = new Map();
  const idMap = new Map();
  const phasePlans = [];
  let changed = false;

  for (const phase of phases ?? []) {
    if (!phase || excluded.has(phase.id)) continue;
    const tickets = Array.isArray(phase.tickets) ? phase.tickets : [];
    const liveKeys = new Set();
    const ticketPlans = [];

    tickets.forEach((ticket, index) => {
      const newId = index + 1;
      const oldKey = ticketKeyOf({ ...ticket, phaseId: phase.id });
      const newKey = ticketKeyOf({ phaseId: phase.id, id: newId });
      if (liveKeys.has(oldKey)) {
        throw Object.assign(new Error(`duplicate live ticket key ${oldKey}`), { code: 'IDENTITY_DUPLICATE_KEY' });
      }
      liveKeys.add(oldKey);
      if (ticket.id !== newId) changed = true;
      keyMap.set(oldKey, newKey);
      idMap.set(oldKey, newId);

      for (const entry of collectAbsorbedEntries(ticket)) {
        const absorbedKey = entry.key !== null
          ? entry.key
          : ticketKeyOf({ phaseId: phase.id, id: entry.id });
        const owner = keyMap.get(absorbedKey);
        if (owner !== undefined && owner !== newKey) {
          throw Object.assign(new Error(`ticket key ${absorbedKey} is owned by ${owner} and ${newKey}`), { code: 'IDENTITY_DUPLICATE_KEY' });
        }
        keyMap.set(absorbedKey, newKey);
        idMap.set(absorbedKey, newId);
      }

      ticketPlans.push({ oldId: ticket.id, newId, oldKey, newKey });
    });

    phasePlans.push({ phaseId: phase.id, tickets: ticketPlans });
  }

  return { keyMap, idMap, changed, phases: phasePlans };
}

/**
 * Rewrite every key token in a live value once.
 *
 * Objects named in HISTORICAL_FIELDS and the identity object are copied unchanged;
 * callers that need to inspect history must do so explicitly.
 *
 * @param {*} value
 * @param {Map<string, string>} keyMap
 * @param {string} path
 * @param {Array<object>} findings
 * @param {{ rewritten?: number }} [stats]
 * @returns {*}
 */
// [::TICKET::] PX-402 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-402 --for-spec --no-implementation-order`.
function remapLiveReferences(value, keyMap, path = '$', findings = [], stats = null) {
  if (typeof value === 'string') {
    return value.replace(KEY_TOKEN_PATTERN, (match, prefix, key) => {
      const mapped = keyMap.get(key);
      if (mapped === undefined) {
        findings.push({ code: 'IDENTITY_HISTORY_UNRESOLVED', path, key });
        return match;
      }
      if (mapped !== key && stats !== null && stats !== undefined) {
        stats.rewritten = (stats.rewritten ?? 0) + 1;
      }
      return prefix + mapped;
    });
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => remapLiveReferences(entry, keyMap, `${path}[${index}]`, findings, stats));
  }
  if (value !== null && typeof value === 'object') {
    const remapped = {};
    for (const [field, entry] of Object.entries(value)) {
      if (HISTORICAL_FIELDS.includes(field) || IMPLEMENTER_REFERENCE_FIELDS.includes(field) || field === IDENTITY_FIELD) {
        remapped[field] = entry;
        continue;
      }
      remapped[field] = remapLiveReferences(entry, keyMap, `${path}.${field}`, findings, stats);
    }
    return remapped;
  }
  return value;
}

/** Stamp the pre-renumber generation on every historical object that lacks one. */
// [::TICKET::] PX-402 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-402 --for-spec --no-implementation-order`.
function stampHistoricalGeneration(document, generation) {
  let stamped = 0;
  for (const phase of document?.phases ?? []) {
    for (const ticket of phase?.tickets ?? []) {
      if (Array.isArray(ticket?.changes)) {
        for (const entry of ticket.changes) {
          if (entry && typeof entry === 'object' && entry[GENERATION_FIELD] === undefined) {
            entry[GENERATION_FIELD] = generation;
            stamped += 1;
          }
        }
      }
      const condensed = ticket?.condensedFrom;
      if (condensed && typeof condensed === 'object') {
        if (condensed[GENERATION_FIELD] === undefined) {
          condensed[GENERATION_FIELD] = generation;
          stamped += 1;
        }
        for (const entry of condensed.tickets ?? []) {
          if (entry && typeof entry === 'object' && entry[GENERATION_FIELD] === undefined) {
            entry[GENERATION_FIELD] = generation;
            stamped += 1;
          }
        }
      }
    }
  }
  return stamped;
}

/** The alias table after a renumber, composed with every earlier generation. */
// [::TICKET::] PX-402 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-402 --for-spec --no-implementation-order`.
function buildAliasTable(document, keyMap, generation, extraAliases = new Map()) {
  const aliases = { ...(document?.identity?.[ALIASES_FIELD] ?? {}) };
  for (const [aliasKey, target] of Object.entries(aliases)) {
    const remapped = keyMap.get(target);
    if (remapped !== undefined) aliases[aliasKey] = remapped;
  }
  for (const [oldKey, newKey] of keyMap) {
    aliases[`${oldKey}@g${generation}`] = newKey;
  }
  for (const [oldKey, target] of extraAliases) {
    const newKey = keyMap.get(target) ?? target;
    aliases[`${oldKey}@g${generation}`] = newKey;
  }
  return aliases;
}

/**
 * Rewrite only the live phases.
 *
 * An excluded phase is byte-identical by contract, so its tickets are never walked.
 * Walking them would report every PX key as an unresolved live reference even though
 * the phase is deliberately outside the numbering.
 */
// [::TICKET::] PX-402 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-402 --for-spec --no-implementation-order`.
function remapPhases(phases, keyMap, excluded, findings, stats) {
  return (phases ?? []).map((phase, index) => {
    if (excluded.has(phase.id)) return phase;
    return {
      ...phase,
      tickets: remapLiveReferences(phase.tickets ?? [], keyMap, `$.phases[${index}].tickets`, findings, stats),
    };
  });
}

/** Rewrite the numeric implementer id from the old numeric id, not the already-rewritten string. */
// [::TICKET::] PX-402 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-402 --for-spec --no-implementation-order`.
function remapImplementerIds(phases, keyMap) {
  let changed = 0;
  for (const phase of phases ?? []) {
    for (const ticket of phase?.tickets ?? []) {
      for (const unit of ticket?.distribution?.units ?? []) {
        const obligation = unit?.obligation;
        if (obligation === null || typeof obligation !== 'object') continue;

        // The string key is the durable identity. The numeric id is phase-local and can
        // disagree with it; treating the number as authoritative rewrote a P0-3 reference
        // to P1-3 merely because the owning ticket lived in phase 1.
        if (typeof obligation.implementerTicketKey === 'string') {
          const oldKey = obligation.implementerTicketKey;
          const newKey = keyMap.get(oldKey);
          if (newKey !== undefined) {
            if (newKey !== oldKey) changed += 1;
            obligation.implementerTicketKey = newKey;
            const newId = numericIdOfKey(newKey);
            if (newId !== null && obligation.implementerTicketId !== newId) {
              obligation.implementerTicketId = newId;
              changed += 1;
            }
            continue;
          }
          const currentId = numericIdOfKey(oldKey);
          if (currentId !== null && obligation.implementerTicketId !== currentId) {
            obligation.implementerTicketId = currentId;
            changed += 1;
          }
          continue;
        }

        if (typeof obligation.implementerTicketId === 'number') {
          const sourcePhaseId = typeof ticket.__sourcePhaseId === 'number'
            ? ticket.__sourcePhaseId
            : ticket.phaseId;
          const sourceKey = ticketKeyOf({ phaseId: sourcePhaseId, id: obligation.implementerTicketId });
          let newKey = keyMap.get(sourceKey);
          if (newKey === undefined) {
            const candidate = [...keyMap.keys()].find((key) => numericIdOfKey(key) === obligation.implementerTicketId);
            if (candidate !== undefined) newKey = keyMap.get(candidate);
          }
          if (newKey !== undefined) {
            obligation.implementerTicketKey = newKey;
            const newId = numericIdOfKey(newKey);
            if (newId !== null) obligation.implementerTicketId = newId;
            changed += 1;
          }
        }
      }
    }
  }
  return changed;
}

/**
 * Collapse prerequisite entries that the renumber made identical.
 *
 * Two old keys can name the same survivor, so a ticket that carried both would now carry
 * the same prerequisite twice. The implementation-order gate compares canonical sets.
 */
// [::TICKET::] PX-402 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-402 --for-spec --no-implementation-order`.
function deduplicatePrerequisites(phases) {
  for (const phase of phases ?? []) {
    for (const ticket of phase?.tickets ?? []) {
      if (!Array.isArray(ticket.prerequisites)) continue;
      const seen = new Set();
      ticket.prerequisites = ticket.prerequisites.filter((entry) => {
        if (entry === null || typeof entry !== 'object') return true;
        const key = JSON.stringify(entry, Object.keys(entry).sort());
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
  }
}

/** Assign 1..N inside every non-excluded phase, in implementation-array order. */
// [::TICKET::] PX-402 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-402 --for-spec --no-implementation-order`.
function assignDenseIds(phases, excluded) {
  for (const phase of phases ?? []) {
    if (excluded.has(phase.id)) continue;
    (phase.tickets ?? []).forEach((ticket, index) => {
      ticket.id = index + DENSE_FIRST_ID;
      ticket.phaseId = phase.id;
    });
  }
}

/** The map an archive provides from an old key to the current owner, through nodeIds. */
// [::TICKET::] PX-402 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-402 --for-spec --no-implementation-order`.
function buildArchiveAliasMap(archives, currentDocument) {
  const ownersByNodeId = new Map();
  for (const phase of currentDocument?.phases ?? []) {
    for (const ticket of phase?.tickets ?? []) {
      const key = ticketKeyOf({ ...ticket, phaseId: phase.id });
      for (const nodeId of ticket?.nodeIds ?? []) {
        if (!ownersByNodeId.has(nodeId)) ownersByNodeId.set(nodeId, new Set());
        ownersByNodeId.get(nodeId).add(key);
      }
    }
  }

  const aliasMap = new Map();
  const findings = [];
  for (const archive of archives ?? []) {
    for (const phase of archive?.phases ?? []) {
      for (const ticket of phase?.tickets ?? []) {
        const oldKey = ticketKeyOf({ ...ticket, phaseId: phase.id });
        for (const nodeId of ticket?.nodeIds ?? []) {
          const owners = ownersByNodeId.get(nodeId);
          if (owners === undefined || owners.size === 0) continue;
          if (owners.size > 1) {
            findings.push({ code: 'IDENTITY_ARCHIVE_AMBIGUOUS', key: oldKey, nodeId, owners: [...owners] });
            continue;
          }
          const [owner] = owners;
          const existing = aliasMap.get(oldKey);
          if (existing !== undefined && existing !== owner) {
            findings.push({ code: 'IDENTITY_ARCHIVE_AMBIGUOUS', key: oldKey, nodeId, owners: [existing, owner] });
            continue;
          }
          aliasMap.set(oldKey, owner);
        }
      }
    }
  }
  aliasMap.findings = findings;
  return aliasMap;
}

/** Every key token inside a value, with its JSON path. */
// [::TICKET::] PX-402 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-402 --for-spec --no-implementation-order`.
function collectKeyTokens(value, path = '$', tokens = [], skipHistorical = false) {
  if (typeof value === 'string') {
    const pattern = new RegExp(KEY_TOKEN_PATTERN.source, 'g');
    let match;
    while ((match = pattern.exec(value)) !== null) tokens.push({ key: match[2], path });
    return tokens;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectKeyTokens(entry, `${path}[${index}]`, tokens, skipHistorical));
    return tokens;
  }
  if (value !== null && typeof value === 'object') {
    for (const [field, entry] of Object.entries(value)) {
      if (skipHistorical && (HISTORICAL_FIELDS.includes(field) || field === IDENTITY_FIELD)) continue;
      collectKeyTokens(entry, `${path}.${field}`, tokens, skipHistorical);
    }
  }
  return tokens;
}

/** Check density, live resolution, historical resolution and alias validity. */
// [::TICKET::] PX-402 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-402 --for-spec --no-implementation-order`.
function validateIdentity(document, options = {}) {
  const requireDense = options.requireDense !== false;
  const excluded = excludedPhasesOf(document, options);
  const findings = [];
  const liveKeys = new Set();
  const aliases = document?.identity?.[ALIASES_FIELD] ?? {};
  const currentGeneration = document?.identity?.[GENERATION_FIELD] ?? 0;

  for (const phase of document?.phases ?? []) {
    const tickets = phase?.tickets ?? [];
    for (const ticket of tickets) {
      const key = ticketKeyOf({ ...ticket, phaseId: phase.id });
      if (liveKeys.has(key)) findings.push({ code: 'IDENTITY_DUPLICATE_KEY', path: `$.phases[${phase.id}].tickets`, key });
      liveKeys.add(key);
      if (ticket.phaseId !== phase.id) {
        findings.push({ code: 'IDENTITY_PHASE_MISMATCH', phaseId: phase.id, ticketId: ticket.id, key });
      }
    }
    if (excluded.has(phase.id) || !requireDense) continue;
    const ids = tickets.map((ticket) => ticket.id);
    const expected = tickets.map((ticket, index) => index + DENSE_FIRST_ID);
    if (ids.length !== expected.length || ids.some((id, index) => id !== expected[index])) {
      findings.push({ code: 'IDENTITY_NOT_DENSE', phaseId: phase.id, ids, expected });
    }
  }

  for (const phase of document?.phases ?? []) {
    for (const ticket of phase?.tickets ?? []) {
      const liveTokens = collectKeyTokens(ticket, `$.phases[${phase.id}].tickets[${ticket.id}]`, [], true);
      for (const token of liveTokens) {
        if (!liveKeys.has(token.key)) {
          findings.push({ code: 'IDENTITY_DANGLING_REFERENCE', path: token.path, key: token.key });
        }
      }
    }
  }

  for (const phase of document?.phases ?? []) {
    for (const ticket of phase?.tickets ?? []) {
      const historicalGeneration = ticket?.condensedFrom?.[GENERATION_FIELD] ?? currentGeneration;
      const historyTokens = [];
      if (Array.isArray(ticket?.changes)) {
        for (const entry of ticket.changes) {
          const generation = entry?.[GENERATION_FIELD] ?? historicalGeneration;
          for (const token of collectKeyTokens(entry, `$.phases[${phase.id}].tickets[${ticket.id}].changes`, [], false)) {
            historyTokens.push({ ...token, generation });
          }
        }
      }
      if (ticket?.condensedFrom !== undefined) {
        for (const token of collectKeyTokens(ticket.condensedFrom, `$.phases[${phase.id}].tickets[${ticket.id}].condensedFrom`, [], false)) {
          historyTokens.push({ ...token, generation: historicalGeneration });
        }
      }
      const legacyReferences = document?.identity?.legacyReferences ?? {};
      for (const token of historyTokens) {
        if (liveKeys.has(token.key) && token.generation === currentGeneration) continue;
        const alias = aliases[`${token.key}@g${token.generation}`];
        if (typeof alias === 'string' && liveKeys.has(alias)) continue;
        // A pre-existing key whose owner was lost in an earlier phase move is recorded
        // as a legacy label. The historical text stays as it was; the label is the
        // resolution a reader and the repair report use.
        if (typeof legacyReferences[`${token.key}@g${token.generation}`] === 'string') continue;
        findings.push({ code: 'IDENTITY_HISTORY_UNRESOLVED', path: token.path, key: token.key, generation: token.generation });
      }
    }
  }

  for (const [aliasKey, target] of Object.entries(aliases)) {
    if (typeof target !== 'string' || !liveKeys.has(target)) {
      findings.push({ code: 'IDENTITY_ALIAS_INVALID', alias: aliasKey, target });
    }
  }

  const ticketDigests = document?.distribution?.ticketDigests;
  if (ticketDigests !== null && typeof ticketDigests === 'object') {
    for (const key of Object.keys(ticketDigests)) {
      if (!liveKeys.has(key)) findings.push({ code: 'IDENTITY_DIGEST_KEY_NOT_LIVE', key });
    }
    for (const key of liveKeys) {
      const ticket = (document.phases ?? [])
        .flatMap((phase) => phase?.tickets ?? [])
        .find((entry) => ticketKeyOf(entry) === key);
      if (ticket?.distribution !== undefined && ticketDigests[key] === undefined) {
        findings.push({ code: 'IDENTITY_DIGEST_KEY_MISSING', key });
      }
    }
  }

  return { ok: findings.length === 0, findings };
}

/** Apply a pre-computed key map; used by phase consolidation. */
// [::TICKET::] PX-402 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-402 --for-spec --no-implementation-order`.
function remapDocumentWithKeyMap(document, keyMap, options = {}) {
  const generationBefore = options.generationBefore ?? document?.identity?.[GENERATION_FIELD] ?? 0;
  const excluded = excludedPhasesOf(document, options);
  const clone = JSON.parse(JSON.stringify(document));
  stampHistoricalGeneration(clone, generationBefore);
  const findings = [];
  const stats = { rewritten: 0 };
  clone.phases = remapPhases(clone.phases, keyMap, excluded, findings, stats);
  const implementerChanges = remapImplementerIds(clone.phases, keyMap);
  deduplicatePrerequisites(clone.phases);
  if (options.assignIds === true) assignDenseIds(clone.phases, excluded);
  const changed = stats.rewritten > 0 || implementerChanges > 0 || options.assignIds === true || options.idsMoved === true;
  const generation = changed ? generationBefore + 1 : generationBefore;
  clone.identity = {
    generation,
    aliases: buildAliasTable(document, keyMap, generationBefore),
    excludedPhases: [...excluded],
  };
  return { document: clone, keyMap, generationBefore, generation, changed, findings, stats };
}

/** Renumber a whole document and rewrite every live reference. */
// [::TICKET::] PX-402 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-402 --for-spec --no-implementation-order`.
function renumberDocument(document, options = {}) {
  const excluded = excludedPhasesOf(document, options);
  const generationBefore = document?.identity?.[GENERATION_FIELD] ?? 0;
  const plan = buildDenseRenumberMap(document?.phases ?? [], { excludedPhases: [...excluded] });
  const archiveAliasMap = options.archiveAliasMap instanceof Map ? options.archiveAliasMap : new Map();
  for (const [oldKey, target] of archiveAliasMap) {
    if (plan.keyMap.has(oldKey)) continue;
    plan.keyMap.set(oldKey, plan.keyMap.get(target) ?? target);
  }

  const clone = JSON.parse(JSON.stringify(document));
  stampHistoricalGeneration(clone, generationBefore);
  const findings = [];
  const stats = { rewritten: 0 };
  clone.phases = remapPhases(clone.phases, plan.keyMap, excluded, findings, stats);
  const implementerChanges = remapImplementerIds(clone.phases, plan.keyMap);
  deduplicatePrerequisites(clone.phases);

  if (findings.length > 0) {
    return { document: clone, keyMap: plan.keyMap, generationBefore, generation: generationBefore, changed: false, findings, stats };
  }

  // A merge creates history in this operation. Even when no live reference needed
  // rewriting, the new ledger needs the alias table that resolves its old keys.
  const hasHistory = (clone.phases ?? []).some((phase) => (phase.tickets ?? []).some(
    (ticket) => ticket.condensedFrom !== undefined
      || (Array.isArray(ticket.changes) && ticket.changes.length > 0),
  ));
  const historyNeedsIdentity = hasHistory && document.identity === undefined;
  const changed = plan.changed || stats.rewritten > 0 || implementerChanges > 0
    || historyNeedsIdentity || options.forceChanged === true;
  if (!changed) {
    return { document, keyMap: plan.keyMap, generationBefore, generation: generationBefore, changed: false, findings, stats };
  }

  assignDenseIds(clone.phases, excluded);
  const generation = (plan.changed || stats.rewritten > 0 || implementerChanges > 0 || options.forceChanged === true)
    ? generationBefore + 1
    : generationBefore;
  const legacyReferences = {
    ...(document?.identity?.legacyReferences ?? {}),
    ...(options.legacyReferences ?? {}),
  };
  clone.identity = {
    generation,
    aliases: buildAliasTable(document, plan.keyMap, generationBefore, archiveAliasMap),
    excludedPhases: [...excluded],
    ...(Object.keys(legacyReferences).length > 0 ? { legacyReferences } : {}),
  };
  return { document: clone, keyMap: plan.keyMap, generationBefore, generation, changed: true, findings, stats };
}

module.exports = {
  PX_PHASE_ID,
  DEFAULT_EXCLUDED_PHASES,
  KEY_TOKEN_PATTERN,
  HISTORICAL_FIELDS,
  DENSE_FIRST_ID,
  ticketKeyOf,
  numericIdOfKey,
  collectAbsorbedEntries,
  buildDenseRenumberMap,
  remapLiveReferences,
  stampHistoricalGeneration,
  buildAliasTable,
  remapImplementerIds,
  deduplicatePrerequisites,
  assignDenseIds,
  buildArchiveAliasMap,
  collectKeyTokens,
  validateIdentity,
  remapDocumentWithKeyMap,
  renumberDocument,
};
