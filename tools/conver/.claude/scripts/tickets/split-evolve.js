#!/usr/bin/env node
/**
 * split-evolve.js — Evolve an existing Tickets.json without stopping or renumbering.
 *
 * The fresh /split-to-tickets path mechanically rebuilds every phase from the
 * graph. That is correct for a first split and destructive for a package that
 * already has authored tickets: phasify-graph-and-dirs-files-tree.js replaces the
 * phase array and consolidate-phase-tickets.js renumbers the keys. This module is
 * the evolve-mode alternative. It derives the graph delta, matches the existing
 * tickets to it, and applies an add/update/retire plan while preserving status,
 * round, metadata and every authored field.
 *
 * No conflict class produces a refusal. The caller receives a plan it can apply
 * or record. A total identity loss is reported as `identityLost` so the command
 * can archive the old file, run the fresh path and carry the statuses forward.
 *
 * Design context: tools/conver/specs/PX-373.md
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const { validateTickets } = require('../lib/validate-tickets');
const { buildNodeToFileMap } = require('../rfc-graph/validate-phasify.js');
const { providerConsumerEdge } = require('../rfc-graph/lib/edge-order.js');
const {
  appendNodeUnitIds,
  resolveDefaultFiles,
  populateTicketDistribution,
  priorImplementedUnits,
} = require('./add-tickets-for-phase.js');
const { addPhaseNodeIds } = require('./update-phase.js');
const {
  prepareStaging,
  assertStagingBaseline,
  digestFile,
} = require('../drill-rfc-down/lib/staging-baseline.js');

/** A graph node id is the only nodeIds member that represents ownership. */
const GRAPH_NODE_ID_PATTERN = /^N[0-9]{4}$/;

/** Fields the evolve path may recompute. Everything else is authored. */
const DERIVED_TICKET_FIELDS = Object.freeze([
  'nodeIds',
  'default_files',
  'referenceSection',
  'distribution',
  'contracts',
  'formulaObligations',
  'prerequisites',
]);

/** Fields the evolve path must never write on an existing ticket. */
const AUTHORED_TICKET_FIELDS = Object.freeze([
  'title',
  'background',
  'scope',
  'notes',
  'acceptanceCriteria',
  'testUnit',
  'testIntegration',
  'testExceptions',
  'instrumentation',
  'investigation',
  'boyScoutPlan',
]);

/** Derived fields a retired ticket no longer owns. They are deleted, not emptied. */
const RETIRED_FIELDS = Object.freeze([
  'distribution',
  'contracts',
  'formulaObligations',
  'prerequisites',
]);

/** The token shape used by the identity ladder. */
const TOKEN_PATTERN = /[a-z0-9_]{3,}/g;

/** The minimum token overlap a title-only match needs. */
const MINIMUM_TITLE_SCORE = 1;

/** Path matches outrank title matches. Exact ids outrank both. */
const PATH_MATCH_SCORE = 100;
const ID_MATCH_SCORE = 1000;

/** The archive prefix written before an evolve promotion. */
const ARCHIVE_PREFIX = 'Tickets.pre-evolve-';

/** The staging suffix used by the compare-and-swap gate. */
const STAGING_SUFFIX = '.staging.json';

// [::TICKET::] PX-373 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-373 --for-spec --no-implementation-order`.
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// [::TICKET::] PX-373 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-373 --for-spec --no-implementation-order`.
function isGraphNodeId(nodeId) {
  return typeof nodeId === 'string' && GRAPH_NODE_ID_PATTERN.test(nodeId);
}

// [::TICKET::] PX-373 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-373 --for-spec --no-implementation-order`.
function tokenize(text) {
  return new Set((String(text ?? '').toLowerCase().match(TOKEN_PATTERN) ?? []));
}

// [::TICKET::] PX-373 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-373 --for-spec --no-implementation-order`.
function ticketKeyOf(phase, ticket) {
  return `${phase.id === -1 ? 'PX' : `P${phase.id}`}-${ticket.id}`;
}

/** Every ticket in phase-array order with its durable key. */
// [::TICKET::] PX-373 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-373 --for-spec --no-implementation-order`.
function collectTickets(ticketsDocument) {
  const collected = [];
  for (const phase of ticketsDocument?.phases ?? []) {
    for (const ticket of phase.tickets ?? []) {
      collected.push({ key: ticketKeyOf(phase, ticket), phase, ticket });
    }
  }
  return collected;
}

// [::TICKET::] PX-373 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-373 --for-spec --no-implementation-order`.
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// [::TICKET::] PX-373 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-373 --for-spec --no-implementation-order`.
function writeJsonAtomically(filePath, document) {
  const stagedPath = `${filePath}.partial.${process.pid}`;
  fs.writeFileSync(stagedPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  fs.renameSync(stagedPath, filePath);
}

// [::TICKET::] PX-373 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-373 --for-spec --no-implementation-order`.
function headingTexts(node) {
  return (node.headingRefs ?? []).flatMap((ref) => (Array.isArray(ref.texts) ? ref.texts : [])).join(' ');
}

/**
 * Score how strongly a ticket names a graph node.
 *
 * The ladder is deliberately ordered: an exact node id is certain, a Dirs-Tree
 * leaf file recorded as default_files is nearly certain, and title/heading token
 * overlap is the fallback for legacy tickets that carry no nodeIds at all.
 */
// [::TICKET::] PX-373 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-373 --for-spec --no-implementation-order`.
function scoreCandidate(ticket, node, nodeToFile) {
  if (!isGraphNodeId(node?.id)) return null;

  const exact = (ticket.nodeIds ?? []).includes(node.id);
  const mappedFile = nodeToFile[node.id];
  const pathMatch = typeof mappedFile === 'string'
    && (ticket.default_files ?? []).some((file) => file === mappedFile);
  const ticketTokens = tokenize(`${ticket.title ?? ''} ${ticket.background ?? ''}`);
  const nodeTokens = tokenize(`${node.title ?? ''} ${node.slug ?? ''} ${headingTexts(node)}`);
  let titleScore = 0;
  for (const token of ticketTokens) {
    if (nodeTokens.has(token)) titleScore += 1;
  }

  if (!exact && !pathMatch && titleScore < MINIMUM_TITLE_SCORE) return null;

  return {
    nodeId: node.id,
    rank: exact ? 'id' : (pathMatch ? 'path' : 'title'),
    score: exact ? ID_MATCH_SCORE : (pathMatch ? PATH_MATCH_SCORE + titleScore : titleScore),
  };
}

/**
 * Match every existing ticket to the graph nodes it names.
 *
 * @returns {Map<string, Array<{nodeId: string, rank: string, score: number}>>}
 */
// [::TICKET::] PX-373 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-373 --for-spec --no-implementation-order`.
function matchNodeIdentity(oldTickets, graph, dirsTree) {
  const nodeToFile = buildNodeToFileMap(dirsTree ?? { trees: {} });
  const nodes = graph?.nodes ?? [];
  const matches = new Map();

  for (const entry of oldTickets) {
    const candidates = nodes
      .map((node) => scoreCandidate(entry.ticket, node, nodeToFile))
      .filter((candidate) => candidate !== null)
      .sort((left, right) => right.score - left.score || left.nodeId.localeCompare(right.nodeId));

    const exact = candidates.filter((candidate) => candidate.rank === 'id');
    matches.set(entry.key, exact.length > 0 ? exact : candidates);
  }

  return matches;
}

/**
 * Derive the graph delta against the current ticket document.
 *
 * `conflictClass` is a label, never a refusal. The five classes are the five
 * ways the graph and the tickets can disagree; `identityLost` is the one case the
 * command handles by archiving and running the fresh path.
 */
// [::TICKET::] PX-373 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-373 --for-spec --no-implementation-order`.
function deriveTicketDelta({ ticketsDocument, graph, dirsTree, view }) {
  const nodes = (graph?.nodes ?? []).filter((node) => isGraphNodeId(node.id));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const nodeToFile = buildNodeToFileMap(dirsTree ?? { trees: {} });
  const entries = collectTickets(ticketsDocument);
  const matches = matchNodeIdentity(entries, graph, dirsTree);

  const coveredNodeIds = new Set();
  for (const entry of entries) {
    for (const nodeId of entry.ticket.nodeIds ?? []) {
      if (isGraphNodeId(nodeId)) coveredNodeIds.add(nodeId);
    }
  }

  const newNodes = nodes.filter((node) => !coveredNodeIds.has(node.id));
  const removedNodes = [...coveredNodeIds].filter((nodeId) => !nodeById.has(nodeId));

  const changedNodes = [];
  for (const entry of entries) {
    const ownedNodeIds = (entry.ticket.nodeIds ?? []).filter((nodeId) => nodeById.has(nodeId));
    if (ownedNodeIds.length === 0) continue;

    const expectedUnits = ownedNodeIds.flatMap((nodeId) => nodeById.get(nodeId)?.unitIds ?? []);
    const presentNodeIds = new Set(entry.ticket.nodeIds ?? []);
    const missingUnits = expectedUnits.filter((unitId) => !presentNodeIds.has(unitId));
    const mappedFiles = ownedNodeIds.map((nodeId) => nodeToFile[nodeId]).filter(Boolean).sort();
    const currentFiles = [...(entry.ticket.default_files ?? [])].sort();

    if (missingUnits.length > 0 || JSON.stringify(mappedFiles) !== JSON.stringify(currentFiles)) {
      changedNodes.push({
        owningTicketKey: entry.key,
        nodeIds: ownedNodeIds,
        missingUnits,
        mappedFiles,
        currentFiles,
      });
    }
  }

  const retiredTickets = entries
    .filter((entry) => {
      const ownedNodeIds = (entry.ticket.nodeIds ?? []).filter(isGraphNodeId);
      return ownedNodeIds.length > 0 && ownedNodeIds.every((nodeId) => !nodeById.has(nodeId));
    })
    .map((entry) => entry.key);

  const anyMatch = [...matches.values()].some((candidates) => candidates.length > 0);
  const identityLost = nodes.length > 0 && entries.length > 0 && !anyMatch;

  const conflictClass = identityLost
    ? 'total-loss'
    : (newNodes.length > 0 ? 'new-node'
      : (retiredTickets.length > 0 ? 'removed-node'
        : (changedNodes.length > 0 ? 'changed-node' : 'no-change')));

  return {
    newNodes,
    changedNodes,
    removedNodes,
    retiredTickets,
    conflictClass,
    identityLost,
    identityMatches: matches,
    nodeById,
    nodeToFile,
    view,
  };
}

/** A deterministic, schema-valid seed for a ticket the evolve path must add. */
// [::TICKET::] PX-373 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-373 --for-spec --no-implementation-order`.
function buildTicketForNode(node, nodeToFile) {
  const mappedFile = nodeToFile[node?.id];
  const ticket = {
    title: node?.title ?? node?.id ?? 'Evolved graph node',
    nodeIds: [node.id],
    status: 'todo',
    background: `Evolve-mode ticket for graph node ${node.id}. The node was added to the graph after the previous split, so this ticket is created without authored prose.`,
    scope: [],
    testUnit: [],
    testIntegration: [],
    testExceptions: [],
    acceptanceCriteria: [],
  };

  if (mappedFile) {
    ticket.default_files = [mappedFile];
  } else {
    ticket.unlistedFileReason = `graph node ${node.id} has no leaf file in the Dirs-Tree`;
  }

  return ticket;
}

/**
 * The array index the new phase must occupy.
 *
 * Implementation order is the flat ticket index in phase-array order. A new node
 * that consumes an existing node is placed after the phase owning that node; a node
 * with no edge is appended after the last existing phase. No id is renumbered.
 */
// [::TICKET::] PX-373 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-373 --for-spec --no-implementation-order`.
function computeInsertIndex(newNodes, ticketsDocument, graph) {
  const phases = ticketsDocument?.phases ?? [];
  if (phases.length === 0) return 0;

  const newNodeIds = new Set(newNodes.map((node) => node.id));
  const phaseIndexByNode = new Map();
  phases.forEach((phase, index) => {
    for (const nodeId of phase.nodeIds ?? []) phaseIndexByNode.set(nodeId, index);
  });

  let afterIndex = -1;
  let beforeIndex = phases.length;
  for (const edge of graph?.edges ?? []) {
    const ordered = providerConsumerEdge(edge);
    if (ordered === null) continue;
    if (newNodeIds.has(ordered.from) && phaseIndexByNode.has(ordered.to)) {
      beforeIndex = Math.min(beforeIndex, phaseIndexByNode.get(ordered.to));
    }
    if (newNodeIds.has(ordered.to) && phaseIndexByNode.has(ordered.from)) {
      afterIndex = Math.max(afterIndex, phaseIndexByNode.get(ordered.from));
    }
  }

  if (afterIndex >= 0) {
    const position = beforeIndex < phases.length ? Math.min(afterIndex + 1, beforeIndex) : afterIndex + 1;
    return Math.min(position, phases.length);
  }
  return beforeIndex < phases.length ? beforeIndex : phases.length;
}

// [::TICKET::] PX-373 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-373 --for-spec --no-implementation-order`.
function compareTicketKeys(left, right) {
  const phaseOf = (key) => (key.startsWith('PX-') ? -1 : Number(key.slice(1).split('-')[0]));
  const idOf = (key) => Number(key.split('-').pop());
  return phaseOf(left) - phaseOf(right) || idOf(left) - idOf(right);
}

/**
 * Build the add/update/retire plan from the delta.
 *
 * The plan never renumbers a phase or a ticket. It records exactly what will be
 * written so applyTicketEvolution can be a pure function.
 */
// [::TICKET::] PX-373 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-373 --for-spec --no-implementation-order`.
function planTicketPlacement(delta, ticketsDocument, graph) {
  const entries = collectTickets(ticketsDocument);
  const entryByKey = new Map(entries.map((entry) => [entry.key, entry]));
  const matches = delta.identityMatches ?? matchNodeIdentity(entries, graph, { trees: {} });

  const claims = new Map();
  for (const [ticketKey, candidates] of matches) {
    for (const candidate of candidates) {
      const claim = claims.get(candidate.nodeId) ?? [];
      claim.push(ticketKey);
      claims.set(candidate.nodeId, claim);
    }
  }

  const retirements = [];
  const retiredKeys = new Set();
  for (const [nodeId, claimants] of claims) {
    const survivor = [...new Set(claimants)].sort(compareTicketKeys)[0];
    for (const ticketKey of new Set(claimants)) {
      if (ticketKey === survivor || retiredKeys.has(ticketKey)) continue;
      retiredKeys.add(ticketKey);
      retirements.push({ ticketKey, reason: `merged-into-${survivor}`, nodeId });
    }
  }

  const ticketUpdates = [];
  const ticketAdditions = [];
  const claimedNodeIds = new Set();

  for (const [ticketKey, candidates] of matches) {
    if (retiredKeys.has(ticketKey)) continue;
    const entry = entryByKey.get(ticketKey);
    if (entry === undefined) continue;

    if (candidates.length === 0) {
      const ownsGraphNode = (entry.ticket.nodeIds ?? []).some(isGraphNodeId);
      if (ownsGraphNode) {
        retiredKeys.add(ticketKey);
        retirements.push({ ticketKey, reason: 'graph-node-removed' });
      }
      continue;
    }

    const [primary, ...splitOff] = candidates;
    claimedNodeIds.add(primary.nodeId);
    const derivedFields = { nodeIds: [primary.nodeId] };
    const mappedFile = delta.nodeToFile?.[primary.nodeId];
    if (mappedFile) derivedFields.default_files = [mappedFile];
    ticketUpdates.push({ ticketKey, derivedFields });

    for (const candidate of splitOff) {
      claimedNodeIds.add(candidate.nodeId);
      ticketAdditions.push({
        phaseId: null,
        ticket: buildTicketForNode(delta.nodeById?.get(candidate.nodeId), delta.nodeToFile ?? {}),
      });
    }
  }

  for (const node of delta.newNodes) {
    if (claimedNodeIds.has(node.id)) continue;
    ticketAdditions.push({
      phaseId: null,
      ticket: buildTicketForNode(node, delta.nodeToFile ?? {}),
    });
  }

  const phases = ticketsDocument?.phases ?? [];
  const newPhaseId = Math.max(-1, ...phases.map((phase) => phase.id)) + 1;
  const insertions = ticketAdditions.length === 0
    ? []
    : [{
      index: computeInsertIndex(delta.newNodes, ticketsDocument, graph),
      phase: {
        id: newPhaseId,
        name: `P${newPhaseId}: evolved ${new Date().toISOString().slice(0, 10)}`,
        nodeIds: ticketAdditions.map((addition) => addition.ticket.nodeIds[0]),
        tickets: [],
      },
    }];

  for (const addition of ticketAdditions) {
    addition.phaseId = newPhaseId;
  }

  return {
    phases: insertions.map((insertion) => insertion.phase),
    insertions,
    ticketUpdates,
    ticketAdditions,
    retirements,
    conflictClass: delta.conflictClass,
  };
}

/**
 * Retire a ticket while keeping its history.
 *
 * Derived fields are deleted rather than emptied: validate-tickets.js rejects an
 * empty contracts array when the field is present, and verify-chain treats an
 * empty distribution as an empty unit set. The previous values live in retiredFrom
 * so the record is not lost.
 */
// [::TICKET::] PX-373 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-373 --for-spec --no-implementation-order`.
function retireTicket(ticket, reason) {
  const retired = clone(ticket);
  retired.retiredFrom = {
    nodeIds: ticket.nodeIds ?? [],
    distribution: ticket.distribution,
    contracts: ticket.contracts,
    formulaObligations: ticket.formulaObligations,
    prerequisites: ticket.prerequisites,
  };
  retired.retiredReason = reason;
  retired.nodeIds = [];
  for (const field of RETIRED_FIELDS) delete retired[field];
  return retired;
}

// [::TICKET::] PX-373 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-373 --for-spec --no-implementation-order`.
function findTicketEntry(document, ticketKey) {
  return collectTickets(document).find((entry) => entry.key === ticketKey);
}

/** Recompute each phase's nodeIds from the tickets that actually own nodes. */
// [::TICKET::] PX-373 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-373 --for-spec --no-implementation-order`.
function reconcilePhaseNodeIds(document) {
  for (const phase of document.phases ?? []) {
    const ownedNodeIds = new Set();
    for (const ticket of phase.tickets ?? []) {
      for (const nodeId of ticket.nodeIds ?? []) {
        if (isGraphNodeId(nodeId)) ownedNodeIds.add(nodeId);
      }
    }
    phase.nodeIds = [...ownedNodeIds].sort();
  }
  return document;
}

/**
 * Apply a plan to a document. Pure: the input is never mutated.
 */
// [::TICKET::] PX-373 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-373 --for-spec --no-implementation-order`.
function applyTicketEvolution(ticketsDocument, plan) {
  const document = clone(ticketsDocument);

  for (const retirement of plan.retirements ?? []) {
    const entry = findTicketEntry(document, retirement.ticketKey);
    if (entry !== undefined) {
      Object.assign(entry.ticket, retireTicket(entry.ticket, retirement.reason));
    }
  }

  for (const update of plan.ticketUpdates ?? []) {
    const entry = findTicketEntry(document, update.ticketKey);
    if (entry === undefined) continue;
    for (const [field, value] of Object.entries(update.derivedFields ?? {})) {
      if (!DERIVED_TICKET_FIELDS.includes(field)) continue;
      entry.ticket[field] = clone(value);
    }
  }

  for (const insertion of [...(plan.insertions ?? [])].sort((left, right) => right.index - left.index)) {
    if (document.phases.some((phase) => phase.id === insertion.phase.id)) continue;
    const position = Math.max(0, Math.min(insertion.index, document.phases.length));
    document.phases.splice(position, 0, clone(insertion.phase));
  }

  for (const addition of plan.ticketAdditions ?? []) {
    const phase = (document.phases ?? []).find((entry) => entry.id === addition.phaseId);
    if (phase === undefined) continue;
    phase.tickets = Array.isArray(phase.tickets) ? phase.tickets : [];
    const nextId = Math.max(0, ...phase.tickets.map((ticket) => ticket.id)) + 1;
    phase.tickets.push({ ...clone(addition.ticket), id: nextId, phaseId: phase.id, status: 'todo' });
  }

  return reconcilePhaseNodeIds(document);
}

/** Archive the real Tickets.json before a promotion and return the archive path. */
// [::TICKET::] PX-373 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-373 --for-spec --no-implementation-order`.
function archiveTickets(ticketsPath) {
  const digest = createHash('sha256').update(fs.readFileSync(ticketsPath)).digest('hex').slice(0, 8);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archivePath = path.join(path.dirname(ticketsPath), `${ARCHIVE_PREFIX}${stamp}-${digest}.json`);
  fs.copyFileSync(ticketsPath, archivePath);
  return archivePath;
}

/**
 * Re-attach status and authored fields after a total-loss rebuild.
 *
 * The fresh document is authoritative for structure; the previous document is
 * authoritative for what the author wrote and how far the work got.
 */
// [::TICKET::] PX-373 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-373 --for-spec --no-implementation-order`.
function applyStatusCarry(previousDocument, freshDocument, graph, dirsTree) {
  const previousEntries = collectTickets(previousDocument);
  const matches = matchNodeIdentity(previousEntries, graph, dirsTree);
  const ticketKeyByNode = new Map();
  for (const [ticketKey, candidates] of matches) {
    if (candidates.length > 0) ticketKeyByNode.set(candidates[0].nodeId, ticketKey);
  }

  const document = clone(freshDocument);
  for (const phase of document.phases ?? []) {
    for (const ticket of phase.tickets ?? []) {
      const previousKey = (ticket.nodeIds ?? []).map((nodeId) => ticketKeyByNode.get(nodeId)).find(Boolean);
      if (previousKey === undefined) continue;
      const previous = previousEntries.find((entry) => entry.key === previousKey);
      if (previous === undefined) continue;

      for (const field of AUTHORED_TICKET_FIELDS) {
        if (previous.ticket[field] !== undefined) ticket[field] = clone(previous.ticket[field]);
      }
      ticket.status = previous.ticket.status;
      ticket.carriedFrom = previousKey;
    }
  }

  return document;
}

/** Attach script-owned fields (units, default_files, distribution) to an evolved document. */
// [::TICKET::] PX-373 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-373 --for-spec --no-implementation-order`.
async function projectScriptOwnedFields(document, graph, dirsTree, view, map = null) {
  const nodeToFileMap = buildNodeToFileMap(dirsTree ?? { trees: {} });
  const allTickets = (document.phases ?? []).flatMap((phase) => phase.tickets ?? []);

  const withUnits = await appendNodeUnitIds(allTickets, graph);
  let cursor = 0;
  for (const phase of document.phases ?? []) {
    phase.tickets = (phase.tickets ?? []).map(() => withUnits[cursor++]);
  }

  resolveDefaultFiles(withUnits, nodeToFileMap);
  reconcilePhaseNodeIds(document);

  if (view !== null && view !== undefined) {
    for (const phase of document.phases ?? []) {
      const populated = await populateTicketDistribution(
        phase,
        graph,
        dirsTree,
        view,
        map,
        priorImplementedUnits(document, phase),
      );
      phase.tickets = populated.tickets;
    }
  }

  return document;
}

/**
 * Run one evolve pass.
 *
 * Returns `{ mode: 'fresh' }` when Tickets.json is absent, `{ changed: false }`
 * when the graph and the tickets already agree, `{ mode: 'rebuild-status-carry' }`
 * when no identity matches at all, and a written report otherwise. No branch
 * refuses or stops.
 */
// [::TICKET::] PX-373 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-373 --for-spec --no-implementation-order`.
async function runEvolve({ ticketsPath, graphPath, dirsTreePath, viewPath = null, map = null }) {
  if (!fs.existsSync(ticketsPath)) {
    return { mode: 'fresh', changed: false };
  }

  const ticketsDocument = readJson(ticketsPath);
  const graph = readJson(graphPath);
  const dirsTree = readJson(dirsTreePath);
  const view = viewPath !== null && fs.existsSync(viewPath) ? readJson(viewPath) : null;

  const delta = deriveTicketDelta({ ticketsDocument, graph, dirsTree, view });
  if (delta.identityLost) {
    return { mode: 'rebuild-status-carry', changed: true, delta };
  }
  if (delta.conflictClass === 'no-change') {
    return { mode: 'evolve', changed: false, delta };
  }

  const plan = planTicketPlacement(delta, ticketsDocument, graph);
  let evolved = applyTicketEvolution(ticketsDocument, plan);
  evolved = await projectScriptOwnedFields(evolved, graph, dirsTree, view, map);

  const validation = validateTickets(evolved);
  if (!validation.valid) {
    return { mode: 'evolve', changed: false, delta, plan, error: validation.errors };
  }

  const stagingPath = `${ticketsPath}${STAGING_SUFFIX}`;
  prepareStaging(ticketsPath, stagingPath, { round: ticketsDocument.round ?? null });
  writeJsonAtomically(stagingPath, evolved);

  let baseline = assertStagingBaseline(stagingPath, ticketsPath);
  if (!baseline.ok) {
    prepareStaging(ticketsPath, stagingPath, { round: ticketsDocument.round ?? null });
    writeJsonAtomically(stagingPath, evolved);
    baseline = assertStagingBaseline(stagingPath, ticketsPath);
  }

  const archivePath = archiveTickets(ticketsPath);
  writeJsonAtomically(ticketsPath, evolved);
  fs.rmSync(stagingPath, { force: true });
  fs.rmSync(`${stagingPath}.baseline.json`, { force: true });

  return {
    mode: 'evolve',
    changed: true,
    delta,
    plan,
    archivePath,
    outputDigest: digestFile(ticketsPath),
    previousDigest: baseline.baseline?.digest ?? null,
    report: {
      added: plan.ticketAdditions.length,
      updated: plan.ticketUpdates.length,
      retired: plan.retirements.length,
      preserved: collectTickets(evolved).length - plan.ticketAdditions.length,
    },
  };
}

// [::TICKET::] PX-373 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-373 --for-spec --no-implementation-order`.
function parseArguments(argv) {
  const options = {};
  for (const argument of argv) {
    if (argument.startsWith('--tickets=')) options.ticketsPath = path.resolve(argument.slice('--tickets='.length));
    else if (argument.startsWith('--graph=')) options.graphPath = path.resolve(argument.slice('--graph='.length));
    else if (argument.startsWith('--dirs-tree=')) options.dirsTreePath = path.resolve(argument.slice('--dirs-tree='.length));
    else if (argument.startsWith('--view=')) options.viewPath = path.resolve(argument.slice('--view='.length));
    else if (argument.startsWith('--previous=')) options.previousPath = path.resolve(argument.slice('--previous='.length));
    else if (argument.startsWith('--fresh=')) options.freshPath = path.resolve(argument.slice('--fresh='.length));
    else if (argument === '--check') options.check = true;
    else if (argument === '--carry-status') options.carryStatus = true;
  }
  return options;
}

// [::TICKET::] PX-373 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-373 --for-spec --no-implementation-order`.
async function main() {
  const options = parseArguments(process.argv.slice(2));

  if (options.carryStatus) {
    if (!options.previousPath || !options.freshPath || !options.graphPath || !options.dirsTreePath) {
      console.error('[ERROR] --carry-status requires --previous=<path> --fresh=<path> --graph=<path> --dirs-tree=<path>');
      console.error('Cause: the previous document, the fresh document and the identity anchors are all required');
      console.error('Action: archive Tickets.json, run the fresh split, then re-run carry-status with the archive');
      process.exit(1);
    }
    const previous = readJson(options.previousPath);
    const fresh = readJson(options.freshPath);
    const carried = applyStatusCarry(previous, fresh, readJson(options.graphPath), readJson(options.dirsTreePath));
    writeJsonAtomically(options.freshPath, carried);
    console.log(JSON.stringify({ ok: true, mode: 'status-carry', path: options.freshPath }));
    return;
  }

  if (options.check) {
    const delta = deriveTicketDelta({
      ticketsDocument: readJson(options.ticketsPath),
      graph: readJson(options.graphPath),
      dirsTree: readJson(options.dirsTreePath),
      view: options.viewPath && fs.existsSync(options.viewPath) ? readJson(options.viewPath) : null,
    });
    console.log(JSON.stringify({
      ok: true,
      conflictClass: delta.conflictClass,
      identityLost: delta.identityLost,
      newNodes: delta.newNodes.map((node) => node.id),
      removedNodes: delta.removedNodes,
      retiredTickets: delta.retiredTickets,
    }));
    return;
  }

  const report = await runEvolve(options);
  if (Array.isArray(report.error) && report.error.length > 0) {
    console.log(JSON.stringify({ ok: false, ...report }));
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, ...report }));
}

const isMainModule = process.argv[1] !== undefined && path.resolve(process.argv[1]) === __filename;
if (isMainModule) {
  main().catch((error) => {
    console.error(`[ERROR] ${error.code ?? 'EVOLVE_FAILED'}`);
    console.error(`Cause: ${error.message}`);
    console.error('Action: inspect the delta with --check, fix the input artifact, and re-run');
    process.exit(1);
  });
}

module.exports = {
  GRAPH_NODE_ID_PATTERN,
  DERIVED_TICKET_FIELDS,
  AUTHORED_TICKET_FIELDS,
  RETIRED_FIELDS,
  collectTickets,
  matchNodeIdentity,
  deriveTicketDelta,
  planTicketPlacement,
  retireTicket,
  applyTicketEvolution,
  archiveTickets,
  applyStatusCarry,
  runEvolve,
  parseArguments,
};
