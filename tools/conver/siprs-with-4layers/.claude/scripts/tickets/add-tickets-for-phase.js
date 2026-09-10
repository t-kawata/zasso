#!/usr/bin/env node

/**
 * add-tickets-for-phase.js — Phase-level ticket addition + nodeIds coverage verification
 *
 * Used in the split-to-tickets pipeline Step 5-2.
 * Calls bulkAddTickets() to add tickets, then verifies that all nodeIds of the phase
 * match the union of the added tickets[].nodeIds.
 *
 * From the Dirs-Tree.json received as the second argument, file paths are mechanically
 * resolved via each ticket's nodeIds, automatically setting default_files.
 * This eliminates the need for AI to manually write file paths.
 *
 * If verification fails, no write is performed (rollback) and the process exits with code 1.
 *
 * Usage:
 *   echo '<tickets-array-json>' | node add-tickets-for-phase.js \
 *     <path to Tickets.json> \
 *     <path to Dirs-Tree.json> \
 *     <P{id}>
 */

const fs = require("fs");
const path = require("path");
const { bulkAddTickets } = require("./bulk-add-tickets.js");
const { buildNodeToDirMap } = require("../rfc-graph/validate-phasify.js");

// ============================================================
// Constants
// ============================================================

/** Normal exit code */
const EXIT_SUCCESS = 0;

/** Abnormal exit code */
const EXIT_FAILURE = 1;

// ============================================================
// Auto-resolve default_files
// ============================================================

/**
 * Automatically set default_files for each ticket using the Dirs-Tree resolved map via nodeIds.
 *
 * Duplicate file paths (different nodeIds pointing to the same file) are removed and sorted.
 * Tickets with empty nodeIds or no match in nodeToDirMap will not have default_files set.
 *
 * @param {Object[]} tickets — array of ticket data (each must have nodeIds)
 * @param {Object} nodeToDirMap — return value of buildNodeToDirMap() ({ nodeId: filePath, ... })
 */
function resolveDefaultFiles(tickets, nodeToDirMap) {
  for (const ticket of tickets) {
    const paths = new Set();
    if (Array.isArray(ticket.nodeIds)) {
      for (const nodeId of ticket.nodeIds) {
        const resolvedPath = nodeToDirMap[nodeId];
        if (resolvedPath) {
          paths.add(resolvedPath);
        }
      }
    }
    if (paths.size > 0) {
      ticket.default_files = Array.from(paths).sort();
    }
  }
}

// ============================================================
// Auto-resolve referenceSection (mechanically generated from § markers in GRAPH.json)
// ============================================================

/** Regex for § section markers (e.g., §1, §1a, §2.1, §27a) */
const SECTION_PATTERN = /§[0-9]+(?:\.[0-9]+)?[a-z]?/;

/**
 * Extract § markers from GRAPH.json node titles via ticket nodeIds and mechanically generate referenceSection.
 *
 * Output example: "RFC-ROOT.md (§1, §1a, §2, §4.1)"
 * Returns an empty string if no § markers are found.
 *
 * @param {string[]} nodeIds — array of node IDs belonging to the ticket
 * @param {Object[]} graphNodes — nodes array from GRAPH.json (each has id and title)
 * @param {string} sourceFile — sourceFile from GRAPH.json (RFC file path, extension removed)
 * @returns {string} generated referenceSection
 */
function resolveReferenceSection(nodeIds, graphNodes, sourceFile) {
  const sections = new Set();
  for (const nodeId of (nodeIds || [])) {
    const node = graphNodes.find(function(n) { return n.id === nodeId; });
    if (!node) continue;
    const match = node.title.match(SECTION_PATTERN);
    if (match) sections.add(match[0]);
  }
  if (sections.size === 0) return '';
  const sorted = Array.from(sections).sort(function(a, b) {
    // Compare by numeric part: §1a → 1, §2.1 → 2.1, §10 → 10
    const anum = parseFloat(a.replace(/[^0-9.]/g, '')) || 0;
    const bnum = parseFloat(b.replace(/[^0-9.]/g, '')) || 0;
    if (anum !== bnum) return anum - bnum;
    // Compare same-numeric-value suffixes: §1 < §1a
    const asuf = a.match(/[a-z]$/) ? a.slice(-1) : '';
    const bsuf = b.match(/[a-z]$/) ? b.slice(-1) : '';
    return asuf.localeCompare(bsuf);
  });
  const basename = sourceFile.replace(/\.md$/, '');
  return basename + ' (' + sorted.join(', ') + ')';
}

// ============================================================
// nodeIds coverage verification
// ============================================================

/**
 * Verify that all nodeIds of a phase match the union of tickets[].nodeIds.
 *
 * @param {Object} phase — phase object (with nodeIds and tickets)
 * @returns {{
 *   valid: boolean,
 *   missingNodeIds: string[],
 *   extraNodeIds: string[],
 *   ticketsWithoutNodeIds: number
 * }}
 */
function verifyNodeCoverage(phase) {
  const phaseNodeIds = new Set(phase.nodeIds || []);
  const coveredNodeIds = new Set();
  let ticketsWithoutNodeIds = 0;

  for (const ticket of (phase.tickets || [])) {
    if (Array.isArray(ticket.nodeIds) && ticket.nodeIds.length > 0) {
      for (const nodeId of ticket.nodeIds) {
        coveredNodeIds.add(nodeId);
      }
    } else {
      ticketsWithoutNodeIds++;
    }
  }

  // Missing nodeIds (in phase but not in any ticket)
  const missingNodeIds = [];
  for (const nodeId of phaseNodeIds) {
    if (!coveredNodeIds.has(nodeId)) {
      missingNodeIds.push(nodeId);
    }
  }

  // Extra nodeIds (in tickets but not in phase)
  const extraNodeIds = [];
  for (const nodeId of coveredNodeIds) {
    if (!phaseNodeIds.has(nodeId)) {
      extraNodeIds.push(nodeId);
    }
  }

  const valid = missingNodeIds.length === 0;

  return { valid, missingNodeIds, extraNodeIds, ticketsWithoutNodeIds };
}

// ============================================================
// Main processing
// ============================================================

/**
 * Parse CLI arguments to obtain each path and phase specifier.
 *
 * @param {string[]} argv — process.argv (typically pass process.argv directly)
 * @returns {{ ticketsJsonPath: string|null, dirsTreePath: string|null, phaseArg: string|null, error: string|null }}
 */
function parseCliArguments(argv) {
  const ticketsJsonPath = argv[2] || null;
  const dirsTreePath = argv[3] || null;
  const phaseArg = argv[4] || null;
  const graphPath = argv[5] || null;

  if (!ticketsJsonPath || !dirsTreePath || !phaseArg) {
    return {
      ticketsJsonPath: null,
      dirsTreePath: null,
      phaseArg: null,
      graphPath: null,
      error:
        "Usage: echo '<tickets-array-json>' | node add-tickets-for-phase.js <Tickets.json> <Dirs-Tree.json> <P{id}> [GRAPH.json]",
    };
  }

  return { ticketsJsonPath, dirsTreePath, phaseArg, graphPath, error: null };
}

function main() {
  const parsed = parseCliArguments(process.argv);
  if (parsed.error) {
    console.error(parsed.error);
    process.exit(EXIT_FAILURE);
  }

  const { ticketsJsonPath, dirsTreePath, phaseArg, graphPath } = parsed;

  // 1. Read ticket array from stdin
  let ticketsInput;
  try {
    ticketsInput = JSON.parse(fs.readFileSync("/dev/stdin", "utf8"));
  } catch (err) {
    console.error("stdin JSON parse failed: " + err.message);
    process.exit(EXIT_FAILURE);
  }

  if (!Array.isArray(ticketsInput)) {
    console.error("stdin must be a JSON array.");
    process.exit(EXIT_FAILURE);
  }

  // 2. Validate nodeIds on each ticket
  const ticketsWithoutNodeIds = ticketsInput.filter(function (t) {
    return !Array.isArray(t.nodeIds) || t.nodeIds.length === 0;
  });
  if (ticketsWithoutNodeIds.length > 0) {
    console.error(
      "There are " +
        ticketsWithoutNodeIds.length +
        " ticket(s) without nodeIds. Specify nodeIds array for each ticket."
    );
    for (const t of ticketsWithoutNodeIds) {
      console.error("  - Title: " + (t.title || "(unset)"));
    }
    process.exit(EXIT_FAILURE);
  }

  // 3. Auto-resolve default_files from Dirs-Tree.json
  let dirsTreeData;
  try {
    dirsTreeData = JSON.parse(
      fs.readFileSync(path.resolve(dirsTreePath), "utf8")
    );
  } catch (err) {
    console.error(
      "Dirs-Tree.json read failed: " +
        dirsTreePath +
        " (" +
        err.message +
        ")"
    );
    process.exit(EXIT_FAILURE);
  }
  const nodeToDirMap = buildNodeToDirMap(dirsTreeData);
  resolveDefaultFiles(ticketsInput, nodeToDirMap);

  // 3b. Auto-generate referenceSection from GRAPH.json
  if (graphPath) {
    try {
      const resolvedGraphPath = path.resolve(graphPath);
      if (fs.existsSync(resolvedGraphPath)) {
        const graphData = JSON.parse(fs.readFileSync(resolvedGraphPath, 'utf8'));
        const graphNodes = graphData.nodes || [];
        const sourceFile = graphData.sourceFile || '';
        for (const ticket of ticketsInput) {
          const refSection = resolveReferenceSection(ticket.nodeIds, graphNodes, sourceFile);
          if (refSection) {
            ticket.referenceSection = refSection;
          }
        }
      } else {
        console.warn('[WARN] GRAPH.json not found: ' + resolvedGraphPath);
      }
    } catch (e) {
      console.warn('[WARN] GRAPH.json read failed: ' + e.message);
    }
  }

  // 4. Read Tickets.json and resolve the phase
  const resolvedPath = path.resolve(ticketsJsonPath);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  } catch (err) {
    console.error("Tickets.json read failed: " + err.message);
    process.exit(EXIT_FAILURE);
  }

  // Phase resolution (same logic as add-ticket.js)
  let phase = null;
  if (phaseArg === "PX") {
    phase = data.phases.find(function (p) { return p.id === -1; });
  } else {
    const matchResult = phaseArg.match(/^P(-?\d+)$/);
    if (matchResult) {
      const phaseId = parseInt(matchResult[1], 10);
      phase = data.phases.find(function (p) { return p.id === phaseId; });
    }
  }

  if (!phase) {
    console.error("Phase " + phaseArg + " not found.");
    process.exit(EXIT_FAILURE);
  }

  // Verify that the phase has nodeIds
  if (!Array.isArray(phase.nodeIds) || phase.nodeIds.length === 0) {
    console.error(
      "Phase " +
        phaseArg +
        " has no nodeIds (nodeIds is empty or undefined)."
    );
    process.exit(EXIT_FAILURE);
  }

  // 5. Execute bulkAddTickets (as a single batch)
  const batch = [
    {
      phaseId: phase.id,
      tickets: ticketsInput,
    },
  ];

  const addResult = bulkAddTickets(data, batch);
  if (!addResult.success) {
    console.error("Ticket add failed: " + JSON.stringify(addResult));
    process.exit(EXIT_FAILURE);
  }

  // 6. nodeIds coverage verification
  const coverageResult = verifyNodeCoverage(phase);

  if (!coverageResult.valid) {
    console.error("nodeIds coverage verification failed.");
    if (coverageResult.missingNodeIds.length > 0) {
      console.error(
        "Missing nodes: [" + coverageResult.missingNodeIds.join(", ") + "]"
      );
    }
    if (coverageResult.extraNodeIds.length > 0) {
      console.error(
        "Extra nodes (outside phase): [" + coverageResult.extraNodeIds.join(", ") + "]"
      );
    }
    process.exit(EXIT_FAILURE);
  }

  // 7. Validation passed — write to file
  fs.writeFileSync(resolvedPath, JSON.stringify(data, null, 2) + "\n", "utf8");

  // 8. Output results
  const output = {
    success: true,
    phaseKey: phaseArg,
    added: addResult.added,
    tickets: addResult.tickets,
    missingNodeIds: coverageResult.missingNodeIds,
    extraNodeIds: coverageResult.extraNodeIds,
    defaultFilesResolved: true,
  };
  console.log(JSON.stringify(output, null, 2));
}

if (require.main === module) main();
module.exports = { verifyNodeCoverage, resolveDefaultFiles, resolveReferenceSection, parseCliArguments };
