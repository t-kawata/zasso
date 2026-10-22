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

const { checkUnitCoverage } = require("../sequences-slice/lib/unit-provenance.mjs");
const { collectLedgerUnitIds, collectViewUnitIds } = require("../rfc-graph/lib/unit-ids.mjs");

/** Read `--name=value` or `--name value`, returning null when absent. */
// [::TICKET::] PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-306 --for-spec --no-implementation-order`.
function argumentFor(argv, name) {
  const inline = argv.find((entry) => entry.startsWith("--" + name + "="));
  if (inline !== undefined) return inline.slice(("--" + name + "=").length);
  const index = argv.indexOf("--" + name);
  return index === -1 ? null : argv[index + 1] || null;
}

/** The unit material the CLI supplied, or empty material when it supplied none. */
// [::TICKET::] PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-306 --for-spec --no-implementation-order`.
function readUnitMaterial(argv) {
  const graphPath = argumentFor(argv, "graph");
  const viewPath = argumentFor(argv, "view");
  const ledgerPath = argumentFor(argv, "ledger");
  const material = {};
  if (graphPath !== null) material.graph = JSON.parse(fs.readFileSync(path.resolve(graphPath), "utf8"));
  if (viewPath !== null) {
    const document = JSON.parse(fs.readFileSync(path.resolve(viewPath), "utf8"));
    material.viewUnitIds = collectViewUnitIds(Array.isArray(document) ? document : document.packages || [document]);
  }
  if (ledgerPath !== null) {
    const text = fs.readFileSync(path.resolve(ledgerPath), "utf8");
    if (ledgerPath.endsWith(".md")) {
      const { readLedgerRows } = require("../sequences-slice/lib/distribution-ledger.mjs");
      material.ledgerUnitIds = collectLedgerUnitIds(readLedgerRows(text) || []);
    } else {
      const document = JSON.parse(text);
      const rows = Array.isArray(document) ? document : document.rows || document.ledger || [];
      material.ledgerUnitIds = collectLedgerUnitIds(rows);
    }
  }
  return material;
}

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
// [::TICKET::] PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-306 --for-spec --no-implementation-order`.
function verifyAllTicketCoverage(ticketsData, material) {
  const phases = ticketsData.phases || [];
  const phaseResults = [];
  let totalTickets = 0;

  for (const phase of phases) {
    const result = checkPhase(phase);
    phaseResults.push(result);
    totalTickets += result.ticketCount;
  }

  const failedPhases = phaseResults.filter(function (r) { return !r.valid; });
  const unitFindings = checkUnitCoverage({
    viewUnitIds: material && material.viewUnitIds ? material.viewUnitIds : [],
    ledgerUnitIds: material && material.ledgerUnitIds ? material.ledgerUnitIds : [],
    graph: material && material.graph ? material.graph : { nodes: [] },
    tickets: ticketsData,
  });
  const valid = failedPhases.length === 0 && unitFindings.length === 0;

  return {
    valid: valid,
    phaseResults: phaseResults,
    totalPhases: phases.length,
    totalTickets: totalTickets,
    failedPhases: failedPhases,
    unitFindings: unitFindings,
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
// [::TICKET::] PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-306 --for-spec --no-implementation-order`.
function formatReport(report) {
  const lines = [];

  if (report.valid) {
    lines.push("✅ PASS — All phases ticket coverage verified.");
  } else {
    lines.push("❌ FAIL — Some phases have incomplete ticket coverage.");
  }
  lines.push("");

  lines.push("Total " + report.totalPhases + " phases / " + report.totalTickets + " tickets");
  for (const finding of report.unitFindings || []) {
    lines.push("- " + finding.code + " " + finding.unitId + " (" + finding.layer + "): " + finding.message);
  }
  lines.push("");

  for (const phaseResult of report.phaseResults) {
    const statusIcon = phaseResult.valid ? "✅" : "❌";
    const missingInfo =
      phaseResult.missingNodeIds.length > 0
        ? " / Missing nodes: [" + phaseResult.missingNodeIds.join(", ") + "]"
        : "";
    const extraInfo =
      phaseResult.extraNodeIds.length > 0
        ? " / Extra nodes: [" + phaseResult.extraNodeIds.join(", ") + "]"
        : "";
    lines.push(
      statusIcon +
        " " +
        phaseResult.phaseLabel +
        ": " +
        phaseResult.ticketCount +
        " tickets" +
        missingInfo +
        extraInfo
    );
  }

  return lines.join("\n");
}

// ============================================================
// Main Entry Point
// ============================================================

// [::TICKET::] PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-306 --for-spec --no-implementation-order`.
function main() {
  const ticketsJsonPath = process.argv[2];

  if (!ticketsJsonPath) {
    console.error(
      "Usage: node verify-all-ticket-coverage.js <path to Tickets.json>"
    );
    process.exit(EXIT_FAILURE);
  }

  let ticketsData;
  try {
    ticketsData = JSON.parse(
      fs.readFileSync(path.resolve(ticketsJsonPath), "utf8")
    );
  } catch (err) {
    console.error("Tickets.json read failed: " + err.message);
    process.exit(EXIT_FAILURE);
  }

  const report = verifyAllTicketCoverage(ticketsData, readUnitMaterial(process.argv.slice(2)));
  const output = formatReport(report);

  // Output human-readable report to stdout
  console.log(output);

  if (!report.valid) {
    // Output failed phase details to stderr
    console.error("---");
    for (const failed of report.failedPhases) {
      if (!failed.hasTickets) {
        console.error("Phase " + failed.phaseLabel + ": no tickets.");
      }
      if (failed.missingNodeIds.length > 0) {
        console.error(
          "Phase " +
            failed.phaseLabel +
            " missing nodes: [" +
            failed.missingNodeIds.join(", ") +
            "]"
        );
      }
    }
    for (const finding of report.unitFindings || []) {
      console.error(finding.code + ": " + finding.message);
    }
    process.exit(EXIT_FAILURE);
  }
}

if (require.main === module) main();
module.exports = { checkPhase, verifyAllTicketCoverage, formatReport };
