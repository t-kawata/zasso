/**
 * resolve-spec-path.js — チケットキーから spec ファイルパスを解決する共通モジュール
 *
 * dump-ticket-graph-commands.js と dump-node-context-to-spec.js の両方から使用される。
 * Tickets.json の referenceSection フィールドを唯一の信頼できる情報源とする。
 */

const fs = require('fs');
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

  // どの形式にもマッチしない
  return null;
}

/**
 * Tickets.json を読み込み、該当チケットの referenceSection を取得する
 *
 * @param {string} ticketsJsonPath — Tickets.json のパス
 * @param {number} phaseId — フェーズID
 * @param {number} ticketId — チケットID
 * @returns {{ phaseName: string, ticketTitle: string, referenceSection: string|null } | null}
 *   該当チケットが見つからない場合は null
 */
function findTicketInTickets(ticketsJsonPath, phaseId, ticketId) {
  if (!fs.existsSync(ticketsJsonPath)) {
    return null;
  }

  let raw;
  try {
    raw = fs.readFileSync(ticketsJsonPath, 'utf8');
  } catch {
    return null;
  }

  let tickets;
  try {
    tickets = JSON.parse(raw);
  } catch {
    return null;
  }

  const phases = tickets.phases || [];
  for (const phase of phases) {
    if (phase.id !== phaseId && phase.phaseId !== phaseId) {
      continue;
    }
    const phaseTickets = phase.tickets || [];
    for (const ticket of phaseTickets) {
      if (ticket.id === ticketId) {
        return {
          phaseName: phase.name || '',
          ticketTitle: ticket.title || '',
          referenceSection: ticket.referenceSection || null,
        };
      }
    }
  }

  return null;
}

/**
 * チケットキーから spec ファイルパスを解決する
 *
 * Tickets.json の referenceSection フィールドを唯一の信頼できる情報源とする。
 * referenceSection がない場合や spec ファイルが実在しない場合は null を返す。
 * ファイル名の推測（ticketId-slug の組み立て等）は行わない。
 *
 * @param {string} ticketKey — "P{phaseId}-{ticketId}" または "PX-{ticketId}" 形式
 * @param {string} ticketsJsonPath — Tickets.json へのパス（絶対パス推奨）
 * @returns {string|null} spec ファイルの絶対パス（解決できない場合は null）
 */
function resolveSpecPath(ticketKey, ticketsJsonPath) {
  // ticketKey の形式チェック
  const parsed = parseTicketKey(ticketKey);
  if (!parsed) {
    return null;
  }

  // ticketsJsonPath を絶対パスに解決
  const resolvedTicketsPath = path.resolve(ticketsJsonPath);
  const ticketsDir = path.dirname(resolvedTicketsPath);

  // Tickets.json から referenceSection を取得
  const found = findTicketInTickets(resolvedTicketsPath, parsed.phaseId, parsed.ticketId);
  if (!found || !found.referenceSection) {
    // referenceSection がない場合は null（推測による誤追記を避ける）
    return null;
  }

  // referenceSection の値が絶対パスか相対パスかを判断し、絶対パスに解決
  const specPath = path.resolve(ticketsDir, found.referenceSection);

  // spec ファイルが実在する場合のみパスを返す
  if (fs.existsSync(specPath)) {
    return specPath;
  }

  return null;
}

module.exports = { resolveSpecPath, parseTicketKey, findTicketInTickets };
