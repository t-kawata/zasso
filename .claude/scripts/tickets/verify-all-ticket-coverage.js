#!/usr/bin/env node

/**
 * verify-all-ticket-coverage.js — 全フェーズのチケット化完全性を最終検証
 *
 * split-to-tickets パイプラインの Step 5 終了時に実行する。
 * 全フェーズについて以下を検証する：
 *   1. 全フェーズに tickets 配列が存在し、空でない
 *   2. 全フェーズの nodeIds が tickets[].nodeIds の和集合に過不足なく含まれる
 *   3. tickets[].nodeIds にフェーズ外のノードIDが混入していない（警告）
 *
 * Usage:
 *   node verify-all-ticket-coverage.js <Tickets.json のパス>
 */

const fs = require("fs");
const path = require("path");

// ============================================================
// 定数定義
// ============================================================

/** 正常終了コード */
const EXIT_SUCCESS = 0;

/** 異常終了コード */
const EXIT_FAILURE = 1;

// ============================================================
// 検証ロジック
// ============================================================

/**
 * 単一フェーズのチケット化完全性を検証する。
 *
 * @param {Object} phase — フェーズオブジェクト
 * @returns {{
 *   phaseId: number,
 *   phaseLabel: string,
 *   valid: boolean,
 *   hasTickets: boolean,
 *   missingNodeIds: string[],
 *   extraNodeIds: string[],
 *   ticketCount: number
 * }}
 */
function checkPhase(phase) {
  const phaseLabel = phase.id === -1 ? "PX" : "P" + phase.id;
  const phaseNodeIds = new Set(phase.nodeIds || []);
  const tickets = phase.tickets || [];

  // チケットの有無
  const hasTickets = tickets.length > 0;

  // tickets[].nodeIds の和集合を収集
  const coveredNodeIds = new Set();
  for (const ticket of tickets) {
    if (Array.isArray(ticket.nodeIds)) {
      for (const nodeId of ticket.nodeIds) {
        coveredNodeIds.add(nodeId);
      }
    }
  }

  // 不足ノード（フェーズにあってチケットにない）
  const missingNodeIds = [];
  for (const nodeId of phaseNodeIds) {
    if (!coveredNodeIds.has(nodeId)) {
      missingNodeIds.push(nodeId);
    }
  }

  // 余剰ノード（チケットにあってフェーズにない）
  const extraNodeIds = [];
  for (const nodeId of coveredNodeIds) {
    if (!phaseNodeIds.has(nodeId)) {
      extraNodeIds.push(nodeId);
    }
  }

  const valid = hasTickets && missingNodeIds.length === 0;

  return {
    phaseId: phase.id,
    phaseLabel: phaseLabel,
    valid: valid,
    hasTickets: hasTickets,
    missingNodeIds: missingNodeIds,
    extraNodeIds: extraNodeIds,
    ticketCount: tickets.length,
  };
}

/**
 * 全フェーズのチケット化完全性を検証する。
 *
 * @param {Object} ticketsData — パース済みTickets.json
 * @returns {{
 *   valid: boolean,
 *   phaseResults: Array,
 *   totalPhases: number,
 *   totalTickets: number,
 *   failedPhases: Array
 * }}
 */
function verifyAllTicketCoverage(ticketsData) {
  const phases = ticketsData.phases || [];
  const phaseResults = [];
  let totalTickets = 0;

  for (const phase of phases) {
    const result = checkPhase(phase);
    phaseResults.push(result);
    totalTickets += result.ticketCount;
  }

  const failedPhases = phaseResults.filter(function (r) { return !r.valid; });
  const valid = failedPhases.length === 0;

  return {
    valid: valid,
    phaseResults: phaseResults,
    totalPhases: phases.length,
    totalTickets: totalTickets,
    failedPhases: failedPhases,
  };
}

// ============================================================
// レポート出力
// ============================================================

/**
 * 検証結果を人間が読める形式で出力する。
 *
 * @param {Object} report — verifyAllTicketCoverage の戻り値
 */
function formatReport(report) {
  const lines = [];

  if (report.valid) {
    lines.push("✅ PASS — 全フェーズのチケット化完全性を確認しました。");
  } else {
    lines.push("❌ FAIL — チケット化が不完全なフェーズがあります。");
  }
  lines.push("");

  lines.push("全 " + report.totalPhases + " フェーズ / 全 " + report.totalTickets + " チケット");
  lines.push("");

  for (const phaseResult of report.phaseResults) {
    const statusIcon = phaseResult.valid ? "✅" : "❌";
    const missingInfo =
      phaseResult.missingNodeIds.length > 0
        ? " / 不足ノード: [" + phaseResult.missingNodeIds.join(", ") + "]"
        : "";
    const extraInfo =
      phaseResult.extraNodeIds.length > 0
        ? " / 余剰ノード: [" + phaseResult.extraNodeIds.join(", ") + "]"
        : "";
    lines.push(
      statusIcon +
        " " +
        phaseResult.phaseLabel +
        ": " +
        phaseResult.ticketCount +
        " チケット" +
        missingInfo +
        extraInfo
    );
  }

  return lines.join("\n");
}

// ============================================================
// メイン処理
// ============================================================

function main() {
  const ticketsJsonPath = process.argv[2];

  if (!ticketsJsonPath) {
    console.error(
      "Usage: node verify-all-ticket-coverage.js <Tickets.json のパス>"
    );
    process.exit(EXIT_FAILURE);
  }

  let ticketsData;
  try {
    ticketsData = JSON.parse(
      fs.readFileSync(path.resolve(ticketsJsonPath), "utf8")
    );
  } catch (err) {
    console.error("Failed to read Tickets.json: " + err.message);
    process.exit(EXIT_FAILURE);
  }

  const report = verifyAllTicketCoverage(ticketsData);
  const output = formatReport(report);

  // stdout に人間が読めるレポートを出力
  console.log(output);

  if (!report.valid) {
    // 失敗フェーズの詳細を stderr に出力
    console.error("---");
    for (const failed of report.failedPhases) {
      if (!failed.hasTickets) {
        console.error("Phase " + failed.phaseLabel + ": No tickets found.");
      }
      if (failed.missingNodeIds.length > 0) {
        console.error(
          "フェーズ " +
            failed.phaseLabel +
            " の不足ノード: [" +
            failed.missingNodeIds.join(", ") +
            "]"
        );
      }
    }
    process.exit(EXIT_FAILURE);
  }
}

if (require.main === module) main();
module.exports = { checkPhase, verifyAllTicketCoverage, formatReport };
