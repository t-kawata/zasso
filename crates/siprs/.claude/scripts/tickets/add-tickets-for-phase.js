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
 *     <P{id}>
 *
 * The Dirs-Tree and GRAPH are derived from the Tickets directory. The legacy
 * four-positional form remains accepted for callers outside the pipeline.
 */

const fs = require("fs");
const path = require("path");
const { bulkAddTickets } = require("./bulk-add-tickets.js");
const { buildNodeToDirMap } = require("../rfc-graph/validate-phasify.js");
const { isUnitId } = require("../rfc-graph/lib/unit-ids.mjs");
const {
  deriveDirsTreePathFromTickets,
  deriveGraphPathFromTickets,
} = require("../lib/package-artifacts");

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

/**
 * Verify that the unit ids a graph carries reach the tickets of this phase.
 *
 * Phase nodeIds are graph node ids, not unit ids, so this is a separate comparison: the
 * union of `nodeIds` filtered to unit ids must equal the graph's unit set. A graph unit
 * no ticket names is an omission; a ticket unit the graph does not carry is an invention.
 *
 * @param {Object} phase — phase object with tickets
 * @param {Object|null} graph — parsed GRAPH.json
 * @returns {{valid: boolean, missingUnitIds: string[], inventedUnitIds: string[]}}
 */
// [::TICKET::] PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-306 --for-spec --no-implementation-order`.
function verifyTicketUnits(phase, graph) {
  const graphUnitIds = new Set(
    (graph && Array.isArray(graph.nodes) ? graph.nodes : [])
      .flatMap((node) => (Array.isArray(node.unitIds) ? node.unitIds : []))
      .filter(isUnitId),
  );
  const ticketUnitIds = new Set(
    (phase.tickets || [])
      .flatMap((ticket) => (Array.isArray(ticket.nodeIds) ? ticket.nodeIds : []))
      .filter(isUnitId),
  );
  const missingUnitIds = [...graphUnitIds].filter((unitId) => !ticketUnitIds.has(unitId));
  const inventedUnitIds = [...ticketUnitIds].filter((unitId) => !graphUnitIds.has(unitId));
  return {
    valid: missingUnitIds.length === 0 && inventedUnitIds.length === 0,
    missingUnitIds,
    inventedUnitIds,
  };
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
  let dirsTreePath = null;
  let phaseArg = null;
  let graphPath = null;

  // `<Tickets.json> <P{id}>` is the pipeline form: both artifacts are beside Tickets.json.
  if (ticketsJsonPath && /^P[0-9]+$/.test(argv[3] || "")) {
    phaseArg = argv[3];
    dirsTreePath = deriveDirsTreePathFromTickets(ticketsJsonPath);
    graphPath = deriveGraphPathFromTickets(ticketsJsonPath);
    if (!dirsTreePath || !graphPath) {
      return {
        ticketsJsonPath: null,
        dirsTreePath: null,
        phaseArg: null,
        graphPath: null,
        error:
          "Cannot derive Dirs-Tree.json and GRAPH.json beside " + ticketsJsonPath +
          ". Keep exactly one of each beside Tickets.json, or pass the legacy positional form.",
      };
    }
  } else {
    // Legacy form: <Tickets.json> <Dirs-Tree.json> <P{id}> [GRAPH.json]
    dirsTreePath = argv[3] || null;
    phaseArg = argv[4] || null;
    graphPath = argv[5] || null;
    if (ticketsJsonPath && dirsTreePath && !graphPath) {
      graphPath = deriveGraphPathFromTickets(ticketsJsonPath);
    }
  }

  if (!ticketsJsonPath || !dirsTreePath || !phaseArg) {
    return {
      ticketsJsonPath: null,
      dirsTreePath: null,
      phaseArg: null,
      graphPath: null,
      error:
        "Usage: echo '<tickets-array-json>' | node add-tickets-for-phase.js <Tickets.json> <P{id}> [Dirs-Tree.json P{id} [GRAPH.json]]",
    };
  }

  return { ticketsJsonPath, dirsTreePath, phaseArg, graphPath, error: null };
}

// [::TICKET::] PX-306, PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-306|PX-307) --for-spec --no-implementation-order`.
async function main() {
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
  let graphData = null;
  if (graphPath) {
    try {
      const resolvedGraphPath = path.resolve(graphPath);
      if (fs.existsSync(resolvedGraphPath)) {
        graphData = JSON.parse(fs.readFileSync(resolvedGraphPath, 'utf8'));
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

  // 6b. Unit-id coverage: every graph unit must reach a ticket, and no ticket may invent one.
  if (graphData !== null) {
    const unitResult = verifyTicketUnits(phase, graphData);
    if (!unitResult.valid) {
      if (unitResult.missingUnitIds.length > 0) {
        console.error("MISSING_UNIT_AT_LAYER: [" + unitResult.missingUnitIds.join(", ") + "]");
      }
      if (unitResult.inventedUnitIds.length > 0) {
        console.error("INVENTED_UNIT: [" + unitResult.inventedUnitIds.join(", ") + "]");
      }
      process.exit(EXIT_FAILURE);
    }
  }

  // 6c. Distribution records: every ticket carries the units of the nodes it owns and the
  // obligations derived from the view. The view is optional; a package that predates it
  // keeps the old ticket shape (additivity).
  const packageDirectory = path.dirname(path.resolve(dirsTreePath));
  const viewPath = path.join(packageDirectory, "SEQUENCES.json");
  let view = null;
  if (fs.existsSync(viewPath)) {
    try {
      view = JSON.parse(fs.readFileSync(viewPath, "utf8"));
    } catch (err) {
      console.error("SEQUENCES.json read failed: " + err.message);
      process.exit(EXIT_FAILURE);
    }
  }
  if (view !== null && graphData !== null) {
    const rfcName = graphData.sourceFile ? path.basename(graphData.sourceFile) : "RFC.md";
    const rfcPath = path.join(packageDirectory, rfcName);
    let map = null;
    if (fs.existsSync(rfcPath)) {
      const { readDistributionMap } = await import("../rfc-graph/lib/unit-ids.mjs");
      map = readDistributionMap(fs.readFileSync(rfcPath, "utf8"));
    }
    const populated = await populateTicketDistribution(phase, graphData, dirsTreeData, view, map);
    phase.tickets = populated.tickets;
    const distributionFindings = verifyTicketDistribution(phase, view, graphData, dirsTreeData);
    if (distributionFindings.length > 0) {
      for (const finding of distributionFindings) {
        console.error(finding.code + ": [" + finding.unitId + "] " + finding.message);
      }
      process.exit(EXIT_FAILURE);
    }
    writeTicketDistributionAggregate(data);
  }

  // 7. Validation passed — write to file
  writeJsonAtomically(resolvedPath, data);

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

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(EXIT_FAILURE);
  });
}
/**
 * The view's four unit arrays, keyed by unit id.
 *
 * @param {object} view
 * @returns {Map<string, object>}
 */
// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
function viewUnitMap(view) {
  const units = new Map();
  for (const field of ['ownedOperationUnits', 'ownedSequenceUnits', 'crossBoundarySequenceUnits', 'obligationUnits']) {
    for (const unit of Array.isArray(view?.[field]) ? view[field] : []) {
      if (typeof unit?.unitId === 'string' && unit.unitId.length > 0) units.set(unit.unitId, unit);
    }
  }
  return units;
}

/**
 * The placement a ticket can claim for a unit: the node ids it owns and the paths the
 * Dirs-Tree index resolved.
 *
 * @param {string} unitId
 * @param {object} ticket
 * @param {Map<string, object>} nodeById
 * @param {object} dirsTree
 * @returns {{ nodeIds: string[], paths: string[] }}
 */
// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
function placementOf(unitId, ticket, nodeById, dirsTree) {
  const ownedNodeIds = (Array.isArray(ticket.nodeIds) ? ticket.nodeIds : [])
    .filter((nodeId) => (nodeById.get(nodeId)?.unitIds ?? []).includes(unitId));
  const indexed = dirsTree?.distribution?.units?.[unitId];
  return {
    nodeIds: ownedNodeIds.length > 0 ? ownedNodeIds : [...(indexed?.nodeIds ?? [])],
    paths: [...(indexed?.paths ?? [])],
  };
}

/**
 * The obligation a ticket owes for one unit.
 *
 * An operation implementer receives the implementation payload; a consumer receives a
 * reference. A sequence step belongs to the ticket implementing its operation, so the
 * split is derived from the artifact and never authored a second time.
 *
 * @param {string} unitId
 * @param {string} kind
 * @param {object} record
 * @param {number} ticketId
 * @param {Map<string, number>} ticketByUnit
 * @param {object|null} mapEntry
 * @returns {object}
 */
// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
function obligationOf(unitId, kind, record, ticketId, ticketByUnit, mapEntry) {
  if (kind === 'operation') {
    const role = mapEntry?.role ?? (record.roleCandidate === 'implementer' ? 'implementer' : 'consumer');
    if (role === 'consumer') return { mode: 'reference', boundaryContracts: [] };
    return { mode: 'implement', ...(record.obligation ?? {}) };
  }
  if (kind === 'sequence' || kind === 'cross-boundary-sequence') {
    const ownedSteps = (record.steps ?? []).filter((step) => ticketByUnit.get(`op-${step.operationId}`) === ticketId);
    if (ownedSteps.length > 0) return { mode: 'steps', outcome: record.outcome ?? null, steps: ownedSteps };
    return { mode: 'flow', outcome: record.outcome ?? null };
  }
  return {
    mode: 'obligation',
    relation: record.relation ?? null,
    subject: record.subject ?? null,
    direction: record.direction ?? null,
    counterpart: record.counterpart ?? null,
  };
}

/**
 * The specification references a ticket can follow back to.
 *
 * A unit with no line of its own still receives the unit id as a reference, so the gate
 * can distinguish "no reference recorded" from "the reference was dropped".
 *
 * @param {string} unitId
 * @param {object} obligation
 * @param {object} ticket
 * @returns {Array<{ path: string, line: number, quote: string }>}
 */
// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
function specRefsOf(unitId, obligation, ticket) {
  const specPath = ticket.specPath ?? '';
  const refs = [];
  for (const step of obligation.steps ?? []) {
    if (typeof step.line === 'number' && step.line > 0) refs.push({ path: specPath, line: step.line, quote: step.quote ?? '' });
  }
  if (refs.length === 0) refs.push({ path: specPath, line: 0, quote: unitId });
  return refs;
}

/**
 * Populate every ticket with the units it owns and the obligations it owes.
 *
 * Returns a new phase; the input is not mutated. The digest of each ticket covers its
 * own records, so a stale ticket is localisable rather than hidden behind one file-level
 * scalar.
 *
 * @param {object} phase
 * @param {{ nodes?: Array<object>, distributionDigest?: string }} graph
 * @param {object} dirsTree
 * @param {object} view
 * @param {object|null} map
 * @returns {Promise<object>}
 */
// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
async function populateTicketDistribution(phase, graph, dirsTree, view, map = null) {
  const { digestValue } = await import('../sequences-slice/lib/digest.mjs');
  const { viewDigest, kindOfUnit } = await import('../sequences-slice/lib/distribution-map.mjs');

  const nodeById = new Map((graph?.nodes ?? []).map((node) => [node.id, node]));
  const viewUnits = viewUnitMap(view);
  const mapUnits = new Map((map?.units ?? []).map((unit) => [unit.unitId, unit]));
  const ticketByUnit = new Map();
  for (const ticket of phase?.tickets ?? []) {
    for (const nodeId of Array.isArray(ticket.nodeIds) ? ticket.nodeIds : []) {
      for (const unitId of nodeById.get(nodeId)?.unitIds ?? []) {
        if (!ticketByUnit.has(unitId)) ticketByUnit.set(unitId, ticket.id);
      }
    }
  }

  const tickets = (phase?.tickets ?? []).map((ticket) => {
    const records = new Map();
    const addRecord = (unitId) => {
      if (records.has(unitId)) return;
      const kind = kindOfUnit(unitId);
      const record = viewUnits.get(unitId);
      if (record === undefined) return;
      const mapEntry = mapUnits.get(unitId) ?? null;
      const obligation = obligationOf(unitId, kind, record, ticket.id, ticketByUnit, mapEntry);
      records.set(unitId, {
        unitId,
        kind,
        role: mapEntry?.role ?? (record.roleCandidate ?? null),
        surface: mapEntry?.surface ?? null,
        placement: placementOf(unitId, ticket, nodeById, dirsTree),
        obligation,
        obligationDigest: digestValue(obligation),
        specRefs: specRefsOf(unitId, obligation, ticket),
      });
    };

    for (const nodeId of Array.isArray(ticket.nodeIds) ? ticket.nodeIds : []) {
      for (const unitId of nodeById.get(nodeId)?.unitIds ?? []) addRecord(unitId);
    }
    for (const unitId of viewUnits.keys()) {
      const kind = kindOfUnit(unitId);
      if (kind !== 'sequence' && kind !== 'cross-boundary-sequence') continue;
      const record = viewUnits.get(unitId);
      const ownedSteps = (record.steps ?? []).filter((step) => ticketByUnit.get(`op-${step.operationId}`) === ticket.id);
      if (ownedSteps.length === 0) continue;
      addRecord(unitId);
      const existing = records.get(unitId);
      if (existing !== undefined && existing.obligation.mode === 'flow') {
        existing.obligation = { mode: 'steps', outcome: record.outcome ?? null, steps: ownedSteps };
        existing.obligationDigest = digestValue(existing.obligation);
      }
    }

    const units = [...records.values()].sort((left, right) => left.unitId.localeCompare(right.unitId));
    const sourceMapDigest = graph?.distributionDigest ?? dirsTree?.distribution?.digest ?? null;
    const sourceViewDigest = viewDigest(view);
    return {
      ...ticket,
      distribution: {
        sourceMapDigest,
        sourceViewDigest,
        units,
        digest: digestValue({ sourceMapDigest, sourceViewDigest, units }),
      },
    };
  });

  return { ...phase, tickets };
}

/**
 * The ordered steps each sequence reconstructs across the tickets that own them.
 *
 * @param {Array<object>} tickets
 * @returns {Record<string, string[]>}
 */
// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
function reconstructSequenceOrder(tickets) {
  const stepsByUnit = new Map();
  for (const ticket of tickets ?? []) {
    for (const unit of ticket?.distribution?.units ?? []) {
      if (!Array.isArray(unit?.obligation?.steps)) continue;
      const steps = stepsByUnit.get(unit.unitId) ?? [];
      steps.push(...unit.obligation.steps);
      stepsByUnit.set(unit.unitId, steps);
    }
  }
  const order = {};
  for (const [unitId, steps] of stepsByUnit) {
    const dedup = new Map();
    for (const step of steps) dedup.set(step.stepId, step);
    order[unitId] = [...dedup.values()]
      .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
      .map((step) => step.stepId);
  }
  return order;
}

/**
 * The per-ticket coverage findings: every owning ticket carries its node's units, and no
 * ticket carries a unit the graph does not.
 *
 * @param {object} phase
 * @param {object} view
 * @param {{ nodes?: Array<object> }} graph
 * @param {object} dirsTree
 * @returns {Array<{ code: string, unitId: string, layer: string, message: string }>}
 */
// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
function verifyTicketDistribution(phase, view, graph, dirsTree) {
  const findings = [];
  const nodeById = new Map((graph?.nodes ?? []).map((node) => [node.id, node]));
  const graphUnits = new Set();
  for (const node of graph?.nodes ?? []) {
    for (const unitId of node.unitIds ?? []) graphUnits.add(unitId);
  }

  const ticketUnits = new Set();
  for (const ticket of phase?.tickets ?? []) {
    const units = new Set((ticket?.distribution?.units ?? []).map((unit) => unit.unitId));
    for (const unitId of units) ticketUnits.add(unitId);
    for (const nodeId of Array.isArray(ticket.nodeIds) ? ticket.nodeIds : []) {
      for (const unitId of nodeById.get(nodeId)?.unitIds ?? []) {
        if (!units.has(unitId)) {
          findings.push({ code: 'MISSING_UNIT_AT_LAYER', unitId, layer: 'ticket', message: `ticket ${ticket.id} owns a node carrying ${unitId} and omits it` });
        }
      }
    }
  }

  for (const unitId of graphUnits) {
    if (!ticketUnits.has(unitId)) {
      findings.push({ code: 'MISSING_UNIT_AT_LAYER', unitId, layer: 'ticket', message: `graph unit ${unitId} reaches no ticket` });
    }
  }
  for (const unitId of ticketUnits) {
    if (!graphUnits.has(unitId)) {
      findings.push({ code: 'INVENTED_UNIT', unitId, layer: 'ticket', message: `ticket unit ${unitId} is not carried by the graph` });
    }
  }
  return findings;
}

/**
 * The Tickets aggregate: one digest per ticket, then one digest over the sorted map.
 *
 * @param {object} ticketsData
 * @returns {object}
 */
// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
function writeTicketDistributionAggregate(ticketsData) {
  const ticketDigests = {};
  let sourceMapDigest = null;
  let sourceViewDigest = null;
  for (const phase of ticketsData?.phases ?? []) {
    for (const ticket of phase?.tickets ?? []) {
      if (ticket?.distribution === undefined) continue;
      ticketDigests[String(ticket.id)] = ticket.distribution.digest;
      sourceMapDigest = sourceMapDigest ?? ticket.distribution.sourceMapDigest;
      sourceViewDigest = sourceViewDigest ?? ticket.distribution.sourceViewDigest;
    }
  }
  const sorted = Object.fromEntries(Object.keys(ticketDigests).sort().map((key) => [key, ticketDigests[key]]));
  const { digestValue } = require('../sequences-slice/lib/digest.mjs');
  ticketsData.distribution = {
    sourceMapDigest,
    sourceViewDigest,
    ticketDigests: sorted,
    digest: digestValue({ ticketDigests: sorted }),
  };
  return ticketsData;
}

/** Write a JSON document by staging it beside its target and renaming it into place. */
// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
function writeJsonAtomically(filePath, data) {
  const staged = `${filePath}.partial.${process.pid}`;
  fs.writeFileSync(staged, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(staged, filePath);
}

module.exports = {
  verifyNodeCoverage,
  verifyTicketUnits,
  resolveDefaultFiles,
  resolveReferenceSection,
  parseCliArguments,
  populateTicketDistribution,
  reconstructSequenceOrder,
  verifyTicketDistribution,
  writeTicketDistributionAggregate,
  writeJsonAtomically,
};
