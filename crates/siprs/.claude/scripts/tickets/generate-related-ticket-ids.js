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

// ============================================================
// Edge type direction label map
// ============================================================

/**
 * Per edge type, the label for the direction from own ticket to other ticket.
 * The reverse direction is fixed as "被依存元（依存元）".
 */
const DIRECTION_LABELS = {
  depends_on: '依存先',
  implements: '実装先',
  constrains: '制約先',
  precedes: '先行',
  triggers: 'トリガー先',
  refines: '詳細化先',
  references: '参照先',
  extends: '拡張先',
  conflicts_with: '競合先',
  supersedes: '差替え先',
  validates: '検証先',
  part_of: '部分（親）',
};

// ============================================================
// Pure functions
// ============================================================

/**
 * Generates relatedTicketIds from GRAPH.json edges and the tickets array.
 *
 * Output prose format (example):
 *   [depends_on] P1-2 (依存先: エラー型 CryptoError の定義), [refines] P2-1 (被依存元（依存元）: Session管理)
 *
 * @param {Object[]} tickets — Array of all tickets (each requires id, nodeIds, title)
 * @param {Object[]} graphEdges — GRAPH.json edges array (each requires from, to, type)
 * @returns {Map<string, string>} Map from ticketId to prose string
 */
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
        : '被依存元（依存元）';

      // Display ticket ID: uniquely identifiable as "P{phaseId}-{ticketId}"
      const displayId = 'P' + targetInfo.phaseId + '-' + targetInfo.id;
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

/**
 * Reads GRAPH.json by computing its path from Tickets.json's metadata.source.
 *
 * @param {string} ticketsPath — Absolute path to Tickets.json
 * @param {string} projectRoot — Absolute path to project root (defaults to 2 levels above ticketsPath)
 * @returns {{ edges: Object[] }|null} GRAPH.json edges array, or null if file does not exist
 */
function loadGraphEdgesFromTickets(ticketsPath, projectRoot) {
  const path = require('path');
  const fs = require('fs');

  let root = projectRoot;
  if (!root) {
    // When Tickets.json is at tools/conver/Tickets.json,
    // the project root is 2 levels above tools/conver
    root = path.resolve(path.dirname(ticketsPath), '..', '..');
  }

  let sourcePath;
  try {
    const ticketsData = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
    sourcePath = ticketsData.metadata && ticketsData.metadata.source;
  } catch (_) {
    return null;
  }

  if (!sourcePath) return null;

  // metadata.source is a relative path from the project root
  const graphPath = path.resolve(root, sourcePath.replace(/\.md$/, '-GRAPH.json'));

  if (!fs.existsSync(graphPath)) return null;

  try {
    const graphData = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
    return graphData.edges || null;
  } catch (_) {
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
    console.error('[ERROR] GRAPH.json の読み込みに失敗: ' + e.message);
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
    console.error('[ERROR] Tickets.json の読み込みに失敗: ' + e.message);
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
