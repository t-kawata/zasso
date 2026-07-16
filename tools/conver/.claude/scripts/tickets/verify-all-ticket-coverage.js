#!/usr/bin/env node

/**
 * verify-all-ticket-coverage.js — Final verification of ticket completeness across all phases
 *
 * Executed at the end of split-to-tickets pipeline Step 5.
 * Verifies for all phases:
 *   1. Every phase has a non-empty tickets array
 *   2. All phase nodeIds are covered by tickets[].nodeIds union (no omissions, no extras)
 *   3. No nodeIds from outside the phase appear in tickets[].nodeIds (warning)
 *
 * Usage:
 *   node verify-all-ticket-coverage.js <Tickets.json path>
 */

const fs = require("fs");
const path = require("path");

// ============================================================
// Constants
// ============================================================

/** Normal exit code */
const EXIT_SUCCESS = 0;

/** Error exit code */
const EXIT_FAILURE = 1;

// ============================================================
// Verification Logic
// ============================================================

/**
 * Verify ticket completeness for a single phase.
 *
 * @param {Object} phase — phase object
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

  // Check if tickets exist
  const hasTickets = tickets.length > 0;

  // Collect the union of tickets[].nodeIds
  const coveredNodeIds = new Set();
  for (const ticket of tickets) {
    if (Array.isArray(ticket.nodeIds)) {
      for (const nodeId of ticket.nodeIds) {
        coveredNodeIds.add(nodeId);
      }
    }
  }

  // Missing nodes (in phase but not in any ticket)
  const missingNodeIds = [];
  for (const nodeId of phaseNodeIds) {
    if (!coveredNodeIds.has(nodeId)) {
      missingNodeIds.push(nodeId);
    }
  }

  // Extra nodes (in tickets but not in phase)
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
 * Verify ticket completeness across all phases.
 *
 * @param {Object} ticketsData — parsed Tickets.json
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
// Report Output
// ============================================================

/**
 * Format verification results in human-readable form.
 *
 * @param {Object} report — return value of verifyAllTicketCoverage
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
// Main Entry Point
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
    console.error("Tickets.json の読み込みに失敗しました: " + err.message);
    process.exit(EXIT_FAILURE);
  }

  const report = verifyAllTicketCoverage(ticketsData);
  const output = formatReport(report);

  // Output human-readable report to stdout
  console.log(output);

  if (!report.valid) {
    // Output failed phase details to stderr
    console.error("---");
    for (const failed of report.failedPhases) {
      if (!failed.hasTickets) {
        console.error("フェーズ " + failed.phaseLabel + ": チケットがありません。");
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
