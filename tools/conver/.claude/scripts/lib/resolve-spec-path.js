#!/usr/bin/env node

/**
 * resolve-spec-path.js — チケットキーから spec ファイルパスを解決する共通モジュール
 *
 * 新しい命名規則: {ticketsDir}/specs/{ticketKey}.md
 * ticketsDir は Tickets.json のディレクトリ、ticketKey は "P0-1" 形式。
 * referenceSection に依存しない確定的なパス計算に統一された。
 *
 * dump-ticket-graph-commands.js と dump-node-context-to-spec.js の両方から使用される。
 */

const path = require('path');

/**
 * チケットキーから phaseId と ticketId をパースする
 *
 * @param {string} ticketKey — "P{phaseId}-{ticketId}" または "PX-{ticketId}" 形式
 * @returns {{ phaseId: number, ticketId: number } | null} — パース結果、不正な形式なら null
 */
function parseTicketKey(ticketKey) {
  // PX-{id} 形式 (独立フェーズ、phaseId = -1)
  const pxMatch = ticketKey.match(/^PX-(\d+)$/);
  if (pxMatch) {
    return { phaseId: -1, ticketId: parseInt(pxMatch[1], 10) };
  }

  // P{phaseId}-{ticketId} 形式
  const pMatch = ticketKey.match(/^P(-?\d+)-(\d+)$/);
  if (pMatch) {
    return { phaseId: parseInt(pMatch[1], 10), ticketId: parseInt(pMatch[2], 10) };
  }

  return null;
}

/**
 * 新しい命名規則で spec ファイルパスを解決する。
 *
 * パスは常に {ticketsDir}/specs/{ticketKey}.md であり、referenceSection 等の
 * フィールドに依存しない。ファイルが実在しない場合でもパスを返す。
 *
 * @param {string} ticketKey — "P{phaseId}-{ticketId}" または "PX-{ticketId}" 形式
 * @param {string} ticketsJsonPath — Tickets.json へのパス
 * @returns {string|null} spec ファイルの絶対パス（ticketKey が不正な場合は null）
 */
function resolveSpecPath(ticketKey, ticketsJsonPath) {
  // ticketKey の形式チェック
  const parsed = parseTicketKey(ticketKey);
  if (!parsed) {
    return null;
  }

  // ticketsJsonPath からディレクトリを取得し、新しい命名規則でパスを計算
  const resolvedTicketsPath = path.resolve(ticketsJsonPath);
  const ticketsDir = path.dirname(resolvedTicketsPath);
  const specPath = path.resolve(ticketsDir, 'specs', ticketKey + '.md');

  return specPath;
}

module.exports = { resolveSpecPath, parseTicketKey };
