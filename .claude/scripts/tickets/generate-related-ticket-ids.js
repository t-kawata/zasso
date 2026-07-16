#!/usr/bin/env node

/**
 * generate-related-ticket-ids.js — relatedTicketIds 機械生成
 *
 * GRAPH.json の edges と Tickets.json の各チケットの nodeIds の直積から、
 * 機械的かつ完全に correct な relatedTicketIds（prose 文字列）を生成する。
 *
 * Usage (CLI, GRAPH.json から読み込み):
 *   node generate-related-ticket-ids.js <GRAPH.json> <Tickets.json>
 *
 * Usage (モジュールとして require):
 *   const { generateRelatedTicketIds } = require('./generate-related-ticket-ids.js');
 *   const relatedMap = generateRelatedTicketIds(tickets, graphEdges);
 */

'use strict';

// ============================================================
// エッジ種別の方向ラベルマップ
// ============================================================

/**
 * エッジ種別ごとに、自チケット→他チケット方向のラベル。
 * 被依存方向は "被依存元（依存元）" で固定。
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
// 純粋関数
// ============================================================

/**
 * GRAPH.json の edges とチケット配列から relatedTicketIds を生成する。
 *
 * 出力 prose フォーマット（例）:
 *   [depends_on] P1-2 (依存先: エラー型 CryptoError の定義), [refines] P2-1 (被依存元（依存元）: Session管理)
 *
 * @param {Object[]} tickets — 全チケットの配列（各要素に id, nodeIds, title 必須）
 * @param {Object[]} graphEdges — GRAPH.json の edges 配列（各要素に from, to, type 必須）
 * @returns {Map<string, string>} ticketId → prose 文字列のマップ
 */
function generateRelatedTicketIds(tickets, graphEdges) {
  const result = new Map();

  if (!Array.isArray(tickets) || tickets.length === 0) {
    return result;
  }
  if (!Array.isArray(graphEdges) || graphEdges.length === 0) {
    return result;
  }

  // nodeId → { id, phaseId } の逆引きマップ（同一数値IDを異なるフェーズで区別）
  const nodeToTicket = {};
  for (const ticket of tickets) {
    if (!Array.isArray(ticket.nodeIds)) continue;
    for (const nodeId of ticket.nodeIds) {
      nodeToTicket[nodeId] = { id: ticket.id, phaseId: ticket.phaseId };
    }
  }

  // 複合キー "phaseId:id" → ticket のマップ（全チケットを一意に識別）
  const ticketMap = {};
  for (const ticket of tickets) {
    const key = ticket.phaseId + ':' + ticket.id;
    ticketMap[key] = ticket;
  }

  // 各チケットについて、その nodeIds から出入りするエッジを走査
  for (const ticket of tickets) {
    const ticketKey = ticket.phaseId + ':' + ticket.id;
    const ticketNodeSet = new Set(ticket.nodeIds || []);
    const relations = [];

    for (const edge of graphEdges) {
      if (!edge.from || !edge.to || !edge.type) continue;

      const isFrom = ticketNodeSet.has(edge.from);
      const isTo = ticketNodeSet.has(edge.to);

      if (!isFrom && !isTo) continue;

      // 相手ノードが属するチケットを特定
      const targetNodeId = isFrom ? edge.to : edge.from;
      const targetInfo = nodeToTicket[targetNodeId];
      if (!targetInfo) continue;

      // 自己参照ガード: 同一 (phaseId, ticketId) のエッジはスキップ
      if (targetInfo.phaseId === ticket.phaseId && targetInfo.id === ticket.id) continue;

      // 方向ラベルの決定
      const direction = isFrom
        ? (DIRECTION_LABELS[edge.type] || edge.type)
        : '被依存元（依存元）';

      // 表示用チケットID: "P{phaseId}-{ticketId}" で一意に特定可能
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
// GRAPH.json 読み込み補助関数
// ============================================================

/**
 * Tickets.json の metadata.source から GRAPH.json のパスを逆算して読み込む。
 *
 * @param {string} ticketsPath — Tickets.json の絶対パス
 * @param {string} projectRoot — プロジェクトルートの絶対パス（省略時は ticketsPath の2階層上を仮定）
 * @returns {{ edges: Object[] }|null} GRAPH.json の edges 配列、またはファイルがなければ null
 */
function loadGraphEdgesFromTickets(ticketsPath, projectRoot) {
  const path = require('path');
  const fs = require('fs');

  let root = projectRoot;
  if (!root) {
    // Tickets.json が tools/conver/Tickets.json の場合、
    // プロジェクトルートは tools/conver の2階層上
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

  // metadata.source はプロジェクトルートからの相対パス
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
// CLI エントリポイント
// ============================================================

/**
 * CLI として呼び出された場合のメイン処理。
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
    console.error('[ERROR] Failed to read GRAPH.json: ' + e.message);
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
    console.error('[ERROR] Failed to read Tickets.json: ' + e.message);
    process.exit(1);
  }

  const relatedMap = generateRelatedTicketIds(tickets, graphEdges);

  // 結果を JSON として出力（キーが ticketId、値が prose 文字列）
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
