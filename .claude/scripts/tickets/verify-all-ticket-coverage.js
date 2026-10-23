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
const { findSingleSiblingPath } = require("../lib/package-artifacts");

/** Read `--name=value` or `--name value`, returning null when absent. */
// [::TICKET::] PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-306 --for-spec --no-implementation-order`.
function argumentFor(argv, name) {
  const inline = argv.find((entry) => entry.startsWith("--" + name + "="));
  if (inline !== undefined) return inline.slice(("--" + name + "=").length);
  const index = argv.indexOf("--" + name);
  return index === -1 ? null : argv[index + 1] || null;
}

/**
 * The fixed paths of a package, derived from the Tickets.json that names it.
 *
 * `/split-to-tickets` runs at the package top. The graph, the Dirs-Tree, the RFC and the
 * view are named by convention and sit beside Tickets.json, so the command line does not
 * repeat them. The RFC name comes from the graph's own `sourceFile`, and falls back to the
 * single markdown file that carries a distribution ledger.
 *
 * @param {string} ticketsJsonPath
 * @returns {{ graphPath: string|null, dirsTreePath: string|null, viewPath: string|null, rfcPath: string|null }}
 */
function derivePackagePaths(ticketsJsonPath) {
  const directory = path.dirname(path.resolve(ticketsJsonPath));
  const graphPath = findSingleSiblingPath(directory, "-GRAPH.json");
  const dirsTreePath = findSingleSiblingPath(directory, "-Dirs-Tree.json");
  const viewPath = path.join(directory, "SEQUENCES.json");

  let rfcPath = null;
  if (graphPath !== null && fs.existsSync(graphPath)) {
    try {
      const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
      if (typeof graph.sourceFile === "string" && graph.sourceFile.length > 0) {
        rfcPath = path.join(directory, path.basename(graph.sourceFile));
      }
    } catch {
      // The graph reader below reports a malformed graph; the RFC fallback is still useful.
    }
  }
  if (rfcPath === null || !fs.existsSync(rfcPath)) {
    const candidates = fs.existsSync(directory)
      ? fs.readdirSync(directory).filter((name) => name.endsWith(".md") && name !== "CheckList.md" && name !== "README.md").sort()
      : [];
    const ledgerCandidate = candidates.find((name) => {
      const text = fs.readFileSync(path.join(directory, name), "utf8");
      return text.includes("Distribution ledger") || text.includes("json distribution-map");
    });
    rfcPath = ledgerCandidate !== undefined
      ? path.join(directory, ledgerCandidate)
      : (candidates.length === 1 ? path.join(directory, candidates[0]) : null);
  }

  return {
    graphPath,
    dirsTreePath,
    viewPath: fs.existsSync(viewPath) ? viewPath : null,
    rfcPath,
  };
}

/** The unit material the CLI supplied, or derived from the Tickets.json beside it. */
// [::TICKET::] PX-306, PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-306|PX-307) --for-spec --no-implementation-order`.
function readUnitMaterial(argv) {
  const ticketsJsonPath = argv.find((entry) => !entry.startsWith("--")) ?? null;
  const derived = ticketsJsonPath === null ? {} : derivePackagePaths(ticketsJsonPath);
  const graphPath = argumentFor(argv, "graph") ?? derived.graphPath ?? null;
  const viewPath = argumentFor(argv, "view") ?? derived.viewPath ?? null;
  const ledgerPath = argumentFor(argv, "ledger") ?? derived.rfcPath ?? null;
  const dirsTreePath = argumentFor(argv, "dirs-tree") ?? derived.dirsTreePath ?? null;
  const mapPath = argumentFor(argv, "map") ?? derived.rfcPath ?? null;
  const material = {};
  if (dirsTreePath !== null && fs.existsSync(path.resolve(dirsTreePath))) {
    material.dirs = JSON.parse(fs.readFileSync(path.resolve(dirsTreePath), "utf8"));
  }
  if (mapPath !== null && fs.existsSync(path.resolve(mapPath))) {
    const { readDistributionMap } = require("../rfc-graph/lib/unit-ids.mjs");
    material.map = readDistributionMap(fs.readFileSync(path.resolve(mapPath), "utf8"));
  }
  if (graphPath !== null) material.graph = JSON.parse(fs.readFileSync(path.resolve(graphPath), "utf8"));
  if (viewPath !== null && fs.existsSync(path.resolve(viewPath))) {
    const document = JSON.parse(fs.readFileSync(path.resolve(viewPath), "utf8"));
    material.view = Array.isArray(document) ? document[0] : (document.packages ? document.packages[0] : document);
    material.viewUnitIds = collectViewUnitIds(Array.isArray(document) ? document : document.packages || [document]);
  }
  if (ledgerPath !== null && fs.existsSync(path.resolve(ledgerPath))) {
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
// [::TICKET::] PX-306, PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-306|PX-307) --for-spec --no-implementation-order`.
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
  // The digest chain is checked only when every link was supplied. A caller that passes
  // none keeps the old verdict; a caller that passes a partial chain gets a missing-digest
  // finding rather than a vacuous pass.
  const digestFindings = [];
  // Derivation makes `dirs` present for every package, so the chain is tied to a view:
  // a package that predates the view keeps its old verdict (additivity).
  const chainRequested = (material?.map !== undefined && material?.map !== null)
    || (material?.view !== undefined && material?.dirs !== undefined);
  if (chainRequested) {
    const chain = verifyDigestChain({
      map: material?.map,
      graph: material?.graph,
      dirs: material?.dirs,
      tickets: ticketsData,
    });
    if (!chain.ok) {
      digestFindings.push({
        code: chain.code,
        unitId: chain.layer ?? "digest",
        layer: "ticket",
        message: chain.code + (chain.layer ? " at " + chain.layer : ""),
      });
    }
  }
  // Per-ticket obligations are checked when the caller supplied the view, the graph and the
  // Dirs-Tree. The split stage checks the same records before writing; this is the final gate.
  const distributionFindings = [];
  if (material?.view !== undefined && material?.graph !== undefined && material?.dirs !== undefined) {
    const { verifyTicketDistribution } = require("./add-tickets-for-phase.js");
    for (const phase of phases) {
      distributionFindings.push(...verifyTicketDistribution(phase, material.view, material.graph, material.dirs));
    }
  }
  const findings = [...unitFindings, ...digestFindings, ...distributionFindings];
  const valid = failedPhases.length === 0 && findings.length === 0;

  return {
    valid: valid,
    phaseResults: phaseResults,
    totalPhases: phases.length,
    totalTickets: totalTickets,
    failedPhases: failedPhases,
    unitFindings: findings,
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

/**
 * The digest chain every stage must agree on.
 *
 * A layer that copied a digest but dropped a unit would pass a unit-set check only if the
 * unit-set check were absent; here the placement is checked separately and this function
 * proves the layers were generated from the same map. The per-ticket aggregate is checked
 * too, so one stale ticket cannot hide behind a matching file-level value.
 *
 * @param {{ map?: object, graph?: object, dirs?: object, tickets?: object }} chain
 * @returns {{ ok: boolean, code?: string, layer?: string }}
 */
// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
function verifyDigestChain({ map, graph, dirs, tickets } = {}) {
  const { digestValue } = require("../sequences-slice/lib/digest.mjs");
  const mapDigest = map?.digest;
  const graphDigest = graph?.distributionDigest;
  const dirsDigest = dirs?.distribution?.digest;
  const distribution = tickets?.distribution;
  const ticketDigests = distribution?.ticketDigests;

  if (!mapDigest || !graphDigest || !dirsDigest || !distribution?.sourceMapDigest || !distribution?.digest) {
    return { ok: false, code: "MISSING_DISTRIBUTION_DIGEST" };
  }
  if (mapDigest !== graphDigest) return { ok: false, code: "DISTRIBUTION_DIGEST_MISMATCH", layer: "graph" };
  if (graphDigest !== dirsDigest) return { ok: false, code: "DISTRIBUTION_DIGEST_MISMATCH", layer: "dirs" };
  if (dirsDigest !== distribution.sourceMapDigest) return { ok: false, code: "DISTRIBUTION_DIGEST_MISMATCH", layer: "tickets" };

  const expected = digestValue({ ticketDigests: ticketDigests ?? {} });
  if (expected !== distribution.digest) return { ok: false, code: "DISTRIBUTION_DIGEST_MISMATCH", layer: "aggregate" };
  return { ok: true };
}

if (require.main === module) main();
module.exports = { checkPhase, verifyAllTicketCoverage, formatReport, verifyDigestChain, derivePackagePaths, readUnitMaterial };
