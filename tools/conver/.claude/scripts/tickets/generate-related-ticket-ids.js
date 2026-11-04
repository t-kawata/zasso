#!/usr/bin/env node

/**
 * generate-related-ticket-ids.js — Automatic generation of relatedTicketIds
 *
 * Generates mechanically and fully correct relatedTicketIds (prose strings)
 * from the cartesian product of GRAPH.json edges and each ticket's nodeIds in Tickets.json.
 *
 * Usage (CLI, reads from GRAPH.json):
 *   node generate-related-ticket-ids.js <GRAPH.json> <Tickets.json>
 *
 * Usage (import as module):
 *   const { generateRelatedTicketIds } = require('./generate-related-ticket-ids.js');
 *   const relatedMap = generateRelatedTicketIds(tickets, graphEdges);
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { resolveStoredPath } = require('../lib/path-utils.js');
const { ticketIdentityOf } = require('./lib/ticket-identity.js');

// ============================================================
// Edge type direction label map
// ============================================================

/**
 * Per edge type, the label for the direction from own ticket to other ticket.
 * The reverse direction is fixed as "Dependency source (dependent)".
 */
const DIRECTION_LABELS = {
  depends_on: 'Dependency',
  implements: 'Implementation target',
  constrains: 'Constraint target',
  precedes: 'Predecessor',
  triggers: 'Trigger target',
  refines: 'Refinement target',
  references: 'Reference target',
  extends: 'Extension target',
  conflicts_with: 'Conflict target',
  supersedes: 'Replacement target',
  validates: 'Validation target',
  part_of: 'Part (parent)',
};

// ============================================================
// Pure functions
// ============================================================

/**
 * Generates relatedTicketIds from GRAPH.json edges and the tickets array.
 *
 * Output prose format (example):
 *   [depends_on] P1-2 (Dependency: Error type CryptoError definition), [refines] P2-1 (Dependency source (dependent): Session management)
 *
 * @param {Object[]} tickets — Array of all tickets (each requires id, nodeIds, title)
 * @param {Object[]} graphEdges — GRAPH.json edges array (each requires from, to, type)
 * @returns {Map<string, string>} Map from ticketId to prose string
 */
// [::TICKET::] PX-356 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-356 --for-spec --no-implementation-order`.
function generateRelatedTicketIds(tickets, graphEdges) {
  const result = new Map();

  if (!Array.isArray(tickets) || tickets.length === 0) {
    return result;
  }
  if (!Array.isArray(graphEdges) || graphEdges.length === 0) {
    return result;
  }

  // Reverse map from nodeId to { id, phaseId } (to distinguish same numeric IDs across different phases)
  const nodeToTicket = {};
  for (const ticket of tickets) {
    if (!Array.isArray(ticket.nodeIds)) continue;
    for (const nodeId of ticket.nodeIds) {
      nodeToTicket[nodeId] = { id: ticket.id, phaseId: ticket.phaseId };
    }
  }

  // Composite key "phaseId:id" to ticket map (to uniquely identify all tickets)
  const ticketMap = {};
  for (const ticket of tickets) {
    const key = ticket.phaseId + ':' + ticket.id;
    ticketMap[key] = ticket;
  }

  // For each ticket, scan edges entering/leaving its nodeIds
  for (const ticket of tickets) {
    const ticketKey = ticket.phaseId + ':' + ticket.id;
    const ticketNodeSet = new Set(ticket.nodeIds || []);
    const relations = [];

    for (const edge of graphEdges) {
      if (!edge.from || !edge.to || !edge.type) continue;

      const isFrom = ticketNodeSet.has(edge.from);
      const isTo = ticketNodeSet.has(edge.to);

      if (!isFrom && !isTo) continue;

      // Identify the ticket to which the counterpart node belongs
      const targetNodeId = isFrom ? edge.to : edge.from;
      const targetInfo = nodeToTicket[targetNodeId];
      if (!targetInfo) continue;

      // Self-reference guard: skip edges with the same (phaseId, ticketId)
      if (targetInfo.phaseId === ticket.phaseId && targetInfo.id === ticket.id) continue;

      // Determine direction label
      const direction = isFrom
        ? (DIRECTION_LABELS[edge.type] || edge.type)
        : 'Dependency source (dependent)';

      // Display ticket ID: uniquely identifiable as "P{phaseId}-{ticketId}"
      const displayId = ticketIdentityOf(targetInfo.phaseId, targetInfo.id);
      const targetKey = targetInfo.phaseId + ':' + targetInfo.id;
      const targetTitle = (ticketMap[targetKey] || {}).title || '';

      relations.push(
        '[' + edge.type + '] ' + displayId +
        ' (' + direction + ': ' + targetTitle + ')'
      );
    }

    if (relations.length > 0) {
      result.set(ticketKey, relations.join(', '));
    }
  }

  return result;
}

// ============================================================
// GRAPH.json loading helper
// ============================================================

/** The graph suffix beside a source document. */
const GRAPH_SUFFIX = '-GRAPH.json';

/** The source document suffix. */
const DOC_SUFFIX = '.md';

/** The legacy project-root guess: two directories above Tickets.json. */
const LEGACY_PROJECT_ROOT_DEPTH = 2;

/**
 * The graph paths a Tickets.json may name, most specific first.
 *
 * A split package writes Tickets.json beside RFC.md and RFC-GRAPH.json, and metadata may
 * store the paths home-relative. Treating `~/...` as relative to a guessed project root
 * produces a path that names no file, which silently leaves relatedTicketIds empty.
 *
 * @param {string} ticketsPath
 * @param {object} metadata
 * @param {string|undefined} projectRoot
 * @returns {string[]}
 */
// [::TICKET::] PX-356 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-356 --for-spec --no-implementation-order`.
function candidateGraphPaths(ticketsPath, metadata, projectRoot) {
  const packageDirectory = path.dirname(path.resolve(ticketsPath));
  const legacyRoot = projectRoot ?? path.resolve(
    packageDirectory,
    ...Array(LEGACY_PROJECT_ROOT_DEPTH).fill('..'),
  );
  const candidates = [];
  const addCandidate = (candidate) => {
    if (typeof candidate === 'string' && candidate.length > 0 && !candidates.includes(candidate)) {
      candidates.push(candidate);
    }
  };

  const resolvedGraphPath = metadata?.resolvedPaths?.graphPath;
  if (typeof resolvedGraphPath === 'string' && resolvedGraphPath.length > 0) {
    addCandidate(resolveStoredPath(resolvedGraphPath, packageDirectory));
  }

  const sourcePath = metadata?.source;
  if (typeof sourcePath === 'string' && sourcePath.length > 0) {
    const sourceBases = [resolveStoredPath(sourcePath, packageDirectory)];
    // A stored `~/...` path is home-relative, never relative to a guessed project root;
    // adding the legacy candidate for it would create a literal `~` directory path.
    const isHomeRelative = sourcePath === '~' || sourcePath.startsWith('~/');
    if (!isHomeRelative) sourceBases.push(path.resolve(legacyRoot, sourcePath));
    for (const sourceBase of sourceBases) {
      addCandidate(sourceBase.replace(/\.md$/, GRAPH_SUFFIX));
      addCandidate(path.join(path.dirname(sourceBase), path.basename(sourceBase, DOC_SUFFIX) + GRAPH_SUFFIX));
    }
  }

  addCandidate(path.join(packageDirectory, 'RFC' + GRAPH_SUFFIX));
  return candidates;
}

/**
 * Reads GRAPH.json from the paths Tickets.json names.
 *
 * @param {string} ticketsPath — absolute path to Tickets.json
 * @param {string} projectRoot — legacy project root override
 * @returns {{ edges: Object[] }|null} GRAPH.json edges array, or null
 */
// [::TICKET::] PX-356 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-356 --for-spec --no-implementation-order`.
function loadGraphEdgesFromTickets(ticketsPath, projectRoot) {
  let ticketsData;
  try {
    ticketsData = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  } catch (_) {
    return null;
  }

  const graphPath = candidateGraphPaths(ticketsPath, ticketsData.metadata ?? {}, projectRoot)
    .find((candidate) => fs.existsSync(candidate));
  if (graphPath === undefined) return null;

  try {
    const graphData = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
    return graphData.edges || null;
  } catch (error) {
    // An existing but malformed graph is a defect, not a reason to try another candidate.
    console.error('[WARN] GRAPH.json read failed: ' + graphPath + ' (' + error.message + ')');
    return null;
  }
}

// ============================================================
// CLI entry point
// ============================================================

/**
 * Main entry when called as CLI.
 * Usage: node generate-related-ticket-ids.js <GRAPH.json> <Tickets.json>
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: node generate-related-ticket-ids.js <GRAPH.json> <Tickets.json>');
    process.exit(1);
  }

  const graphPath = require('path').resolve(args[0]);
  const ticketsPath = require('path').resolve(args[1]);

  let graphEdges, tickets;

  try {
    graphEdges = JSON.parse(require('fs').readFileSync(graphPath, 'utf8')).edges || [];
  } catch (e) {
    console.error('[ERROR] GRAPH.json load failed: ' + e.message);
    process.exit(1);
  }

  try {
    const ticketsData = JSON.parse(require('fs').readFileSync(ticketsPath, 'utf8'));
    tickets = [];
    for (const phase of (ticketsData.phases || [])) {
      for (const ticket of (phase.tickets || [])) {
        tickets.push(ticket);
      }
    }
  } catch (e) {
    console.error('[ERROR] Tickets.json load failed: ' + e.message);
    process.exit(1);
  }

  const relatedMap = generateRelatedTicketIds(tickets, graphEdges);

  // Output result as JSON (keys are ticketId, values are prose strings)
  const output = {};
  for (const [ticketId, prose] of relatedMap) {
    output[ticketId] = prose;
  }
  console.log(JSON.stringify(output, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = { generateRelatedTicketIds, loadGraphEdgesFromTickets, DIRECTION_LABELS };
