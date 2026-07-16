#!/usr/bin/env node

/**
 * show-phase-nodes.js — Markdown output of phase node details
 *
 * Used in split-to-tickets pipeline Step 5-1.
 * Retrieves details (ID, title, kind, summary, implementation file path) of all nodes
 * assigned to the specified phase by calling query.js --dirs-tree as a subprocess,
 * and outputs them in readable Markdown format to stdout.
 * Includes annotation that each node is defined as a safe I/O boundary by graphify-rfc.
 *
 * Read-only with zero side effects.
 *
 * Usage:
 *   node show-phase-nodes.js \
 *     --tickets=<Path to Tickets.json> \
 *     --graph=<Path to GRAPH.json> \
 *     --dirs-tree=<Path to Dirs-Tree.json> \
 *     --phase=<P{id}>
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

// ============================================================
// Constant definitions
// ============================================================

/** CLI argument specifying the Tickets.json path */
const TICKETS_PATH_ARG_PREFIX = "--tickets=";

/** CLI argument specifying the GRAPH.json path */
const GRAPH_PATH_ARG_PREFIX = "--graph=";

/** CLI argument specifying the Dirs-Tree.json path */
const DIRS_TREE_ARG_PREFIX = "--dirs-tree=";

/** CLI argument specifying the target phase */
const PHASE_ARG_PREFIX = "--phase=";

/** Path to query.js (within same directory) */
const QUERY_JS_RELATIVE_PATH = "./query.js";

/** Success exit code */
const EXIT_SUCCESS = 0;

/** Failure exit code */
const EXIT_FAILURE = 1;

// ============================================================
// CLI argument parsing
// ============================================================

/**
 * Parses CLI arguments and retrieves each path.
 *
 * @param {string[]} args — process.argv.slice(2)
 * @returns {{ ticketsPath: string, graphPath: string, dirsTreePath: string, phaseArg: string }}
 */
function parseCliArguments(args) {
  let ticketsPath = null;
  let graphPath = null;
  let dirsTreePath = null;
  let phaseArg = null;

  for (const arg of args) {
    if (arg.startsWith(TICKETS_PATH_ARG_PREFIX)) {
      ticketsPath = arg.slice(TICKETS_PATH_ARG_PREFIX.length);
    } else if (arg.startsWith(GRAPH_PATH_ARG_PREFIX)) {
      graphPath = arg.slice(GRAPH_PATH_ARG_PREFIX.length);
    } else if (arg.startsWith(DIRS_TREE_ARG_PREFIX)) {
      dirsTreePath = arg.slice(DIRS_TREE_ARG_PREFIX.length);
    } else if (arg.startsWith(PHASE_ARG_PREFIX)) {
      phaseArg = arg.slice(PHASE_ARG_PREFIX.length);
    }
  }

  return { ticketsPath, graphPath, dirsTreePath, phaseArg };
}

// ============================================================
// Phase resolution
// ============================================================

/**
 * Resolves a phase object from a phase specifier ("PX", "P{n}").
 *
 * @param {Object[]} phases — Phases array from Tickets.json
 * @param {string} phaseArg — Phase specifier
 * @returns {{ phase: Object|null, error: string|null }}
 */
function resolvePhase(phases, phaseArg) {
  if (phaseArg === "PX") {
    const phase = phases.find(function (p) { return p.id === -1; });
    return { phase: phase || null, error: phase ? null : 'Phase "PX" not found in Tickets.json' };
  }
  const matchResult = phaseArg.match(/^P(-?\d+)$/);
  if (matchResult) {
    const phaseId = parseInt(matchResult[1], 10);
    const phase = phases.find(function (p) { return p.id === phaseId; });
    return { phase: phase || null, error: phase ? null : 'Phase "' + phaseArg + '" not found in Tickets.json' };
  }
  return { phase: null, error: "Invalid phase format: " + phaseArg + '. Use "PX" or "P{n}"' };
}

// ============================================================
// query.js subprocess execution
// ============================================================

/**
 * Executes query.js as a subprocess and retrieves node detail Markdown.
 *
 * @param {string} queryJsDir — Directory containing query.js
 * @param {string} graphPath — Path to GRAPH.json
 * @param {string} sourcePath — Path to source file
 * @param {string} dirsTreePath — Path to Dirs-Tree.json
 * @param {string} nodeId — Node ID (e.g. "N0001")
 * @returns {{ markdown: string, error: string|null }}
 */
function runQueryJs(queryJsDir, graphPath, sourcePath, dirsTreePath, nodeId) {
  try {
    const queryJsPath = path.resolve(queryJsDir, QUERY_JS_RELATIVE_PATH);
    const output = execFileSync(
      process.execPath,
      [
        queryJsPath,
        "--graph=" + graphPath,
        "--source=" + sourcePath,
        "--dirs-tree=" + dirsTreePath,
        "--id=" + nodeId,
        "--hops=2",
      ],
      {
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
      }
    );
    return { markdown: output, error: null };
  } catch (err) {
    const errorMessage = err.stderr
      ? err.stderr.toString().trim()
      : "query.js execution failed for node " + nodeId + ": " + err.message;
    return { markdown: null, error: errorMessage };
  }
}

// ============================================================
// Markdown output generation
// ============================================================

/**
 * Generates Markdown combining phase info and all node details.
 *
 * @param {Object} phase — Phase object
 * @param {string[]} nodeIds — Array of node IDs
 * @param {Array} nodeMarkdowns — Array of Markdown strings per node (successful nodes only)
 * @param {string[]} nodeErrors — Array of descriptions for nodes with errors
 * @returns {string} Complete Markdown
 */
function formatOutput(phase, nodeIds, nodeMarkdowns, nodeErrors) {
  const lines = [];

  // Phase header
  const phaseLabel = phase.id === -1 ? "PX" : "P" + phase.id;
  lines.push("# Phase " + phaseLabel + ": " + phase.name);
  lines.push("");
  if (phase.summary) {
    lines.push(phase.summary);
    lines.push("");
  }

  // Node list section
  lines.push("---\n");
  lines.push("# Node List");
  lines.push("");
  lines.push("The following " + nodeIds.length + " nodes are assigned to this phase.");
  lines.push("Each node was designed as a safe I/O boundary by graphify-rfc.");
  lines.push("Node combinations also tend to form safe I/O boundaries.");
  lines.push("");
  lines.push("A ticket is a combination of nodes safely implementable in one go.");
  lines.push("Group one or more nodes into ticket units.");
  lines.push("All nodes must be ticketed without duplication or omission.");
  lines.push("");

  // Output details for each node
  for (let i = 0; i < nodeIds.length; i++) {
    lines.push("---\n");
    const nodeId = nodeIds[i];
    const nodeMarkdown = nodeMarkdowns[i];

    if (nodeMarkdown) {
      lines.push(nodeMarkdown);
    } else {
      lines.push("### " + nodeId + ": (node details unavailable due to error)");
      lines.push("");
      if (nodeErrors[i]) {
        lines.push("**Error**: " + nodeErrors[i]);
        lines.push("");
      }
    }
  }

  lines.push("---");

  return lines.join("\n");
}

// ============================================================
// Main processing
// ============================================================

function main() {
  // 1. Parse CLI arguments
  const args = process.argv.slice(2);
  const parsed = parseCliArguments(args);

  // Check for missing arguments
  const missingArgs = [];
  if (!parsed.ticketsPath) missingArgs.push("--tickets");
  if (!parsed.graphPath) missingArgs.push("--graph");
  if (!parsed.dirsTreePath) missingArgs.push("--dirs-tree");
  if (!parsed.phaseArg) missingArgs.push("--phase");

  if (missingArgs.length > 0) {
    console.error(
      "Required arguments missing: " + missingArgs.join(", ")
    );
    console.error(
      "Usage: node show-phase-nodes.js --tickets=<path> --graph=<path> --dirs-tree=<path> --phase=<P{id}>"
    );
    process.exit(EXIT_FAILURE);
  }

  // 2. Load Tickets.json and resolve phase
  let ticketsData;
  try {
    ticketsData = JSON.parse(
      fs.readFileSync(path.resolve(parsed.ticketsPath), "utf8")
    );
  } catch (err) {
    console.error("Tickets.json failed to load: " + err.message);
    process.exit(EXIT_FAILURE);
  }

  const { phase, error: phaseError } = resolvePhase(
    ticketsData.phases,
    parsed.phaseArg
  );
  if (!phase) {
    console.error(phaseError);
    process.exit(EXIT_FAILURE);
  }

  // 3. Get phase nodeIds
  const nodeIds = phase.nodeIds;
  if (!nodeIds || !Array.isArray(nodeIds) || nodeIds.length === 0) {
    console.error(
      "Phase " + parsed.phaseArg + " has no nodes assigned (nodeIds is empty)."
    );
    process.exit(EXIT_FAILURE);
  }

  // 4. Execute query.js for each node
  // Resolve relative paths based on directory containing query.js
  const queryJsDir = path.resolve(__dirname, "../rfc-graph");
  // Source file is inferred from GRAPH.json (use source field if present, otherwise same dir with .md extension)
  // Actually references the sourceFile field from GRAPH.json
  let sourcePath = parsed.graphPath.replace(/\.json$/i, ".md");
  try {
    const graphData = JSON.parse(fs.readFileSync(path.resolve(parsed.graphPath), "utf8"));
    if (graphData.sourceFile) {
      sourcePath = graphData.sourceFile;
    }
  } catch (err) {
    // If sourceFile cannot be read from GRAPH.json, use extension substitution as default
  }

  const nodeMarkdowns = [];
  const nodeErrors = [];

  for (const nodeId of nodeIds) {
    const result = runQueryJs(
      queryJsDir,
      parsed.graphPath,
      sourcePath,
      parsed.dirsTreePath,
      nodeId
    );
    if (result.error) {
      nodeMarkdowns.push(null);
      nodeErrors.push(result.error);
      console.error("Warning: " + result.error);
    } else {
      nodeMarkdowns.push(result.markdown);
      nodeErrors.push(null);
    }
  }

  // If any errors exist, treat the whole run as failure
  const hasErrors = nodeErrors.some(function (err) { return err !== null; });

  // 5. Generate Markdown and output to stdout
  const output = formatOutput(phase, nodeIds, nodeMarkdowns, nodeErrors);
  process.stdout.write(output + "\n");

  if (hasErrors) {
    console.error(
      "Some node details could not be retrieved. Check warnings above."
    );
    process.exit(EXIT_FAILURE);
  }
}

if (require.main === module) main();
module.exports = { parseCliArguments, resolvePhase, runQueryJs, formatOutput };
