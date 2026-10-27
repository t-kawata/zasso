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
const { buildNodeToFileMap } = require("../rfc-graph/validate-phasify.js");
const { isUnitId, writeUnitIdsToTicket } = require("../rfc-graph/lib/unit-ids.mjs");
const { ticketIdentity } = require("./lib/ticket-identity.js");
const {
  artifactStepsForSequences,
  declaredSequenceIds,
} = require("../sequences-slice/lib/distribution-map.mjs");
const {
  deriveDirsTreePathFromTickets,
  deriveGraphPathFromTickets,
  findAllocateManifest,
  findSingleSiblingPath,
} = require("../lib/package-artifacts");
const { writeLine } = require("../lib/cli-output");

// ============================================================
// Constants
// ============================================================

/** Normal exit code */
const EXIT_SUCCESS = 0;

/** Abnormal exit code */
const EXIT_FAILURE = 1;

/** The graph node id shape. Distribution unit ids share nodeIds with graph nodes, so a
 * cross-phase check must filter to the graph-node shape before comparing. */
const GRAPH_NODE_ID_PATTERN = /^N[0-9]{4}$/;

/** The RFC basename a split-derived ticket references when it carries no specPath. */
const DEFAULT_SPEC_BASENAME = 'RFC.md';

// ============================================================
// Auto-resolve default_files
// ============================================================

/**
 * Automatically set default_files for each ticket using the Dirs-Tree resolved map via nodeIds.
 *
 * Duplicate file paths (different nodeIds pointing to the same file) are removed and sorted.
 * Tickets with empty nodeIds or no match in nodeToFileMap will not have default_files set.
 *
 * @param {Object[]} tickets — array of ticket data (each must have nodeIds)
 * @param {Object} nodeToFileMap — return value of buildNodeToFileMap() ({ nodeId: filePath, ... })
 */
// [::TICKET::] PX-319 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-319 --for-spec --no-implementation-order`.
function resolveDefaultFiles(tickets, nodeToFileMap) {
  for (const ticket of tickets) {
    const paths = new Set();
    if (Array.isArray(ticket.nodeIds)) {
      for (const nodeId of ticket.nodeIds) {
        const resolvedPath = nodeToFileMap[nodeId];
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
// [::TICKET::] PX-321 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-321 --for-spec --no-implementation-order`.
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

  // Extra nodeIds (in tickets but not in phase). Unit ids legitimately share the array
  // with graph nodes, so only the graph-node shape is a cross-phase violation.
  const extraNodeIds = [];
  for (const nodeId of coveredNodeIds) {
    if (GRAPH_NODE_ID_PATTERN.test(nodeId) && !phaseNodeIds.has(nodeId)) {
      extraNodeIds.push(nodeId);
    }
  }

  const valid = missingNodeIds.length === 0 && extraNodeIds.length === 0;

  return { valid, missingNodeIds, extraNodeIds, ticketsWithoutNodeIds };
}

/**
 * The unit ids a phase's own graph nodes carry.
 *
 * A phase owns its nodes, not the whole package. Comparing one phase with the whole graph
 * reports every unit implemented in a later phase as missing, so this predicate is the
 * phase-local half of the coverage check. The package-global half is `checkUnitCoverage`
 * and `verifyChain`, which read the whole Tickets aggregate.
 *
 * @param {{ nodeIds?: string[] }} phase
 * @param {{ nodes?: Array<object> }|null} graph
 * @returns {Set<string>}
 */
// [::TICKET::] PX-315 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-315) --for-spec --no-implementation-order`.
function graphUnitsOfPhase(phase, graph) {
  const phaseNodeIds = new Set(Array.isArray(phase?.nodeIds) ? phase.nodeIds : []);
  const units = new Set();
  for (const node of graph?.nodes ?? []) {
    if (!phaseNodeIds.has(node.id)) continue;
    for (const unitId of Array.isArray(node.unitIds) ? node.unitIds : []) {
      if (isUnitId(unitId)) units.add(unitId);
    }
  }
  return units;
}

/**
 * The role each operation unit plays in this phase's distribution records.
 *
 * A consumer owner is a legitimate owner that does not implement the operation in this
 * package; its implementer lives in another package. A missing role is treated as an
 * implementer so a malformed record fails closed instead of silently dropping the
 * obligation.
 *
 * @param {{ tickets?: Array<object> }} phase
 * @returns {Map<string, string|null>}
 */
// [::TICKET::] PX-321 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-321 --for-spec --no-implementation-order`.
function operationRolesOf(phase) {
  const roles = new Map();
  for (const ticket of phase?.tickets ?? []) {
    for (const unit of ticket?.distribution?.units ?? []) {
      if (unit?.kind !== 'operation') continue;
      roles.set(unit.unitId, unit.role ?? null);
    }
  }
  return roles;
}

/**
 * Verify that the unit ids a phase's nodes carry reach that phase's tickets.
 *
 * The phase-local comparison is deliberately not the whole package: P0 must prove its own
 * nodes' units and the package-global pass proves the rest.
 *
 * @param {Object} phase — phase object with tickets
 * @param {Object|null} graph — parsed GRAPH.json
 * @returns {{valid: boolean, missingUnitIds: string[], inventedUnitIds: string[]}}
 */
// [::TICKET::] PX-306, PX-315 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-306|PX-315) --for-spec --no-implementation-order`.
function verifyTicketUnits(phase, graph) {
  const graphUnitIds = graphUnitsOfPhase(phase, graph);
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

/**
 * Append the units every ticket's nodes carry to that ticket's nodeIds.
 *
 * The graph already knows the mapping; asking the author to copy it is the one step where
 * a unit can silently disappear. `writeUnitIdsToTicket` keeps the existing ids and skips a
 * unit already present, so a second run appends nothing.
 *
 * @param {Array<object>} tickets
 * @param {{ nodes?: Array<object> }} graph
 * @returns {Promise<Array<object>>} new tickets; the input is not mutated
 */
// [::TICKET::] PX-308 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-308 --for-spec --no-implementation-order`.
async function appendNodeUnitIds(tickets, graph) {
  const nodeById = new Map((graph?.nodes ?? []).map((node) => [node.id, node]));
  return (tickets ?? []).map((ticket) => {
    const unitIds = (Array.isArray(ticket.nodeIds) ? ticket.nodeIds : [])
      .flatMap((nodeId) => nodeById.get(nodeId)?.unitIds ?? []);
    return writeUnitIdsToTicket(ticket, unitIds);
  });
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

/** Read a JSON file, or null when it is absent or unreadable. */
// [::TICKET::] PX-306, PX-307, PX-308, PX-314, PX-319, PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-306|PX-307|PX-308|PX-314|PX-319|PX-323) --for-spec --no-implementation-order`.
function readJsonOrNull(filePath) {
  if (filePath === null || filePath === undefined || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/** Every ticket in a Tickets.json document, in phase order.
 *
 * The original ticket objects are returned, not copies: the caller attaches the
 * prerequisite field to them and the document is written afterwards.
 */
// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
function allTicketsOf(document) {
  return (document?.phases ?? []).flatMap((phase) => (phase?.tickets ?? []).map((ticket) => {
    if (ticket.phaseId === undefined) ticket.phaseId = phase.id;
    return ticket;
  }));
}

/** The ticket that implements one operation in this package, or undefined. */
// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
function implementingTicketFor(tickets, operationId) {
  const unitId = `op-${operationId}`;
  return tickets.find((ticket) => (ticket?.distribution?.units ?? []).some((unit) => unit?.unitId === unitId
    && unit?.kind === 'operation'
    && unit?.obligation?.mode === 'implement'));
}

/**
 * Build the operation → package (and local ticket) index the prerequisite derivation reads.
 *
 * The implementer role is the authority. A foreign view that lists a consumer operation
 * must not overwrite the local implementer; the claim table resolves all packages at once.
 * A foreign package that is already split contributes its ticket roles; an unsplit package
 * falls back to its view candidate, and an undecided candidate stays undecided so the gate
 * can fail closed instead of guessing.
 */
// [::TICKET::] PX-323, PX-325 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-325 --for-spec --no-implementation-order`.
// [::TICKET::] PX-325 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-325 --for-spec --no-implementation-order`.
function buildOperationOwners({ view, workspaceRoot, tickets, rolesByPackage = {} }) {
  const {
    addOperationClaim,
    resolveOperationClaims,
    rolesFromTickets,
    rolesFromView,
    ticketKeyOf,
  } = require("../sequences-slice/lib/implementation-order.mjs");
  const claims = new Map();
  // The ledger is authoritative over the view candidate. The ticket unit is the most
  // concrete record of what split will implement, so it is applied last.
  const localRoles = rolesFromView(view, new Map());
  for (const [unitId, role] of rolesByPackage[view?.packageId] ?? []) localRoles.set(unitId, role);
  rolesFromTickets(tickets, localRoles);

  const localImplementer = (operationId) => {
    const ticket = implementingTicketFor(tickets, operationId);
    return ticket === undefined ? undefined : ticketKeyOf(ticket);
  };
  const record = (unit, packageId, packageRoles) => {
    const operationId = unit?.operationId ?? (typeof unit?.unitId === 'string' && unit.unitId.startsWith('op-') ? unit.unitId.slice(3) : null);
    if (operationId === null) return;
    const role = packageRoles.get(unit.unitId) ?? unit.roleCandidate ?? null;
    const ticketKey = packageId === view?.packageId && role === 'implementer' ? localImplementer(operationId) : undefined;
    addOperationClaim(claims, { operationId, packageId, role, ticketKey });
  };

  for (const unit of view?.ownedOperationUnits ?? []) record(unit, view.packageId, localRoles);
  for (const unit of view?.obligationUnits ?? []) record(unit, view.packageId, localRoles);

  if (workspaceRoot !== null) {
    const treeManifest = readJsonOrNull(path.join(workspaceRoot, 'WORKSPACIFY-TREE-MANIFEST.json'));
    for (const pkg of treeManifest?.workspace?.packages ?? []) {
      if (pkg?.id === view?.packageId || typeof pkg?.path !== 'string') continue;
      const foreignView = readJsonOrNull(path.join(workspaceRoot, pkg.path, 'SEQUENCES.json'));
      if (foreignView === null) continue;
      const foreignTickets = allTicketsOf(readJsonOrNull(path.join(workspaceRoot, pkg.path, 'Tickets.json')));
      const foreignRoles = rolesFromView(foreignView, new Map());
      for (const [unitId, role] of rolesByPackage[pkg.id] ?? []) foreignRoles.set(unitId, role);
      rolesFromTickets(foreignTickets, foreignRoles);
      for (const unit of foreignView.ownedOperationUnits ?? []) record(unit, pkg.id, foreignRoles);
      for (const unit of foreignView.obligationUnits ?? []) record(unit, pkg.id, foreignRoles);
    }
  }
  return resolveOperationClaims(claims).owners;
}

/**
 * Attach the implementation prerequisites to the populated tickets.
 *
 * The field is attached only when the distribution data exists; a package without a view,
 * graph or root artifact keeps the old ticket shape.
 */
// [::TICKET::] PX-323, PX-325 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-323|PX-325) --for-spec --no-implementation-order`.
async function attachPrerequisites({ ticketsDocument, graphData, view, packageDirectory }) {
  if (view === null || graphData === null) return;
  const { ticketPrerequisites, ticketKeyOf } = require("../sequences-slice/lib/implementation-order.mjs");
  const allocatePath = findAllocateManifest(packageDirectory);
  const workspaceRoot = allocatePath === null ? null : path.dirname(allocatePath);
  const artifact = workspaceRoot === null ? null : readJsonOrNull(findSingleSiblingPath(workspaceRoot, '-sequences.json'));
  const registry = allocatePath === null ? [] : (readJsonOrNull(allocatePath)?.contract_registry ?? []);
  const treeManifest = workspaceRoot === null ? null : readJsonOrNull(path.join(workspaceRoot, 'WORKSPACIFY-TREE-MANIFEST.json'));
  const tickets = allTicketsOf(ticketsDocument);
  const operationOwners = buildOperationOwners({ view, workspaceRoot, tickets });
  const { prerequisites, findings } = ticketPrerequisites({
    tickets,
    graph: graphData,
    artifact,
    operationOwners,
    registry,
    packageId: view.packageId,
    treeManifest,
  });
  if (findings.length > 0) {
    throw new Error(findings.map((entry) => `${entry.code}: ${entry.subject ?? ''} ${entry.message}`).join('\n'));
  }
  for (const ticket of tickets) {
    const entries = prerequisites.get(ticketKeyOf(ticket)) ?? [];
    if (entries.length > 0) ticket.prerequisites = entries;
    else delete ticket.prerequisites;
  }
}

// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
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
  const nodeToFileMap = buildNodeToFileMap(dirsTreeData);
  resolveDefaultFiles(ticketsInput, nodeToFileMap);

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

  // 3c. Append the units each ticket's nodes carry. The check below compares the graph's
  // unit set with the tickets' unit set; the ids must be present before the tickets are
  // copied into the document.
  if (graphData !== null) {
    const withUnits = await appendNodeUnitIds(ticketsInput, graphData);
    ticketsInput.splice(0, ticketsInput.length, ...withUnits);
  }

  // 4. Read Tickets.json and resolve the phase
  const resolvedPath = path.resolve(ticketsJsonPath);
  let ticketsDocument;
  try {
    ticketsDocument = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  } catch (err) {
    console.error("Tickets.json read failed: " + err.message);
    process.exit(EXIT_FAILURE);
  }

  // Phase resolution (same logic as add-ticket.js)
  let phase = null;
  if (phaseArg === "PX") {
    phase = ticketsDocument.phases.find(function (p) { return p.id === -1; });
  } else {
    const matchResult = phaseArg.match(/^P(-?\d+)$/);
    if (matchResult) {
      const phaseId = parseInt(matchResult[1], 10);
      phase = ticketsDocument.phases.find(function (p) { return p.id === phaseId; });
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

  const addResult = bulkAddTickets(ticketsDocument, batch);
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
    await attachPrerequisites({ ticketsDocument, graphData, view, packageDirectory });
    writeTicketDistributionAggregate(ticketsDocument);
  }

  // 7. Validation passed — write to file
  writeJsonAtomically(resolvedPath, ticketsDocument);

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
  writeLine(JSON.stringify(output, null, 2));
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
 * reference. Exactly one ticket implements an operation even when several tickets own a
 * node carrying it, so the implementer is chosen by the lowest ticket id and the rest
 * reference it. A sequence step belongs to the ticket owning its operation, so the split
 * is derived from the artifact and never authored a second time.
 *
 * @param {string} unitId
 * @param {string} kind
 * @param {object} record
 * @param {number} ticketId
 * @param {Map<string, number>} ownerTicketByUnit
 * @param {Map<string, number>} implementingTicketByUnit
 * @param {object|null} mapEntry
 * @returns {object}
 */
// [::TICKET::] PX-307, PX-308, PX-322 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-307|PX-308|PX-322) --for-spec --no-implementation-order`.
function obligationOf(unitId, kind, record, ticketId, ownerTicketByUnit, implementingTicketByUnit, mapEntry, packageId) {
  if (kind === 'operation') {
    const role = mapEntry?.role ?? (record.roleCandidate === 'implementer' ? 'implementer' : 'consumer');
    const providers = (Array.isArray(record.ownerPackageIds) ? record.ownerPackageIds : [])
      .filter((ownerPackageId) => ownerPackageId !== packageId);
    if (role === 'consumer') return { mode: 'reference', providers, implementerTicketId: null, boundaryContracts: [] };
    if (implementingTicketByUnit.get(unitId) !== ticketId) {
      return { mode: 'reference', providers, implementerTicketId: implementingTicketByUnit.get(unitId) ?? null, boundaryContracts: [] };
    }
    return { mode: 'implement', ...(record.obligation ?? {}) };
  }
  if (kind === 'sequence' || kind === 'cross-boundary-sequence') {
    const ownedSteps = (record.steps ?? []).filter((step) => ownerTicketByUnit.get(`op-${step.operationId}`) === ticketId);
    if (ownedSteps.length > 0) return { mode: 'steps', outcome: record.outcome ?? null, steps: ownedSteps };
    return { mode: 'flow', outcome: record.outcome ?? null };
  }
  return {
    mode: 'obligation',
    relation: record.relation ?? null,
    subject: record.subject ?? null,
    direction: record.direction ?? null,
    counterpart: record.counterpart ?? null,
    ...(record.coverage !== undefined && record.coverage !== null ? { coverage: record.coverage } : {}),
  };
}

/**
 * Whether a ticket unit is a declared step-bearing sequence unit.
 *
 * `populateTicketDistribution` records a sequence unit on every ticket that implements
 * one of its steps, even when the sequence node sits in another phase. The unit is not
 * invented: its steps are declared by the view, and the package-global unit set equality
 * is still checked by verifyChain. A unit whose steps are not declared is still invented.
 *
 * @param {object} unit
 * @param {Map<string, object>} viewUnits
 * @returns {boolean}
 */
// [::TICKET::] PX-322 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-322 --for-spec --no-implementation-order`.
function isDeclaredStepBearingUnit(unit, viewUnits) {
  const unitId = String(unit?.unitId ?? '');
  const isSequence = unit?.kind === 'sequence'
    || unit?.kind === 'cross-boundary-sequence'
    || unitId.startsWith('seq-')
    || unitId.startsWith('xdir-');
  if (!isSequence) return false;
  const steps = unit?.obligation?.steps;
  if (!Array.isArray(steps) || steps.length === 0) return false;
  const declared = new Set((viewUnits.get(unitId)?.steps ?? []).map((step) => step.stepId));
  return steps.every((step) => declared.has(step.stepId));
}

/**
 * The specification references a ticket can follow back to.
 *
 * A sequence step carries its own line. An operation has no step of its own, so its lines
 * come from the view's obligation; a unit with neither still receives the unit id, so the
 * gate can distinguish "no reference recorded" from "the reference was dropped".
 *
 * @param {Array<number>} specLines
 * @param {string} quote
 * @param {string} specPath
 * @returns {Array<{ path: string, line: number, quote: string }>}
 */
// [::TICKET::] PX-308 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-308 --for-spec --no-implementation-order`.
function specRefsFromSpecLines(specLines, quote, specPath) {
  return (Array.isArray(specLines) ? specLines : [])
    .filter((line) => Number.isInteger(line) && line > 0)
    .map((line) => ({ path: specPath, line, quote }));
}

/** The design source a split-derived ticket references when it carries no specPath. */
// [::TICKET::] PX-321 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-321 --for-spec --no-implementation-order`.
function defaultSpecPathFor(graph) {
  const sourceFile = graph?.sourceFile;
  return typeof sourceFile === 'string' && sourceFile.trim().length > 0
    ? path.basename(sourceFile)
    : DEFAULT_SPEC_BASENAME;
}

/**
 * The specification references for one unit.
 *
 * @param {string} unitId
 * @param {string} kind
 * @param {object} record — the view's unit record
 * @param {object} obligation
 * @param {object} ticket
 * @param {string} defaultSpecPath — used when the ticket carries no specPath
 * @returns {Array<{ path: string, line: number, quote: string }>}
 */
// [::TICKET::] PX-307, PX-308, PX-321 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-307|PX-308|PX-321) --for-spec --no-implementation-order`.
function specRefsForUnit(unitId, kind, record, obligation, ticket, defaultSpecPath = DEFAULT_SPEC_BASENAME) {
  const specPath = ticket.specPath ?? defaultSpecPath;
  const refs = [];
  for (const step of obligation.steps ?? []) {
    if (typeof step.line === 'number' && step.line > 0) refs.push({ path: specPath, line: step.line, quote: step.quote ?? '' });
  }
  if (refs.length === 0 && kind === 'operation') {
    const specLines = record?.obligation?.specLines ?? obligation?.specLines ?? [];
    refs.push(...specRefsFromSpecLines(specLines, unitId, specPath));
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
// [::TICKET::] PX-307, PX-308, PX-311, PX-321, PX-322, PX-325 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-307|PX-308|PX-311|PX-321|PX-322|PX-325) --for-spec --no-implementation-order`.
async function populateTicketDistribution(phase, graph, dirsTree, view, map = null) {
  const { viewDigest, kindOfUnit } = await import('../sequences-slice/lib/distribution-map.mjs');

  const nodeById = new Map((graph?.nodes ?? []).map((node) => [node.id, node]));
  const defaultSpecPath = defaultSpecPathFor(graph);
  const viewUnits = viewUnitMap(view);
  const mapUnits = new Map((map?.units ?? []).map((unit) => [unit.unitId, unit]));
  // A unit can be carried by several nodes. Ownership decides where a sequence step is
  // recorded; the lowest owning ticket id is the single implementer of an operation.
  const ownerTicketByUnit = new Map();
  const implementingTicketByUnit = new Map();
  for (const ticket of phase?.tickets ?? []) {
    for (const nodeId of Array.isArray(ticket.nodeIds) ? ticket.nodeIds : []) {
      for (const unitId of nodeById.get(nodeId)?.unitIds ?? []) {
        if (!ownerTicketByUnit.has(unitId) || ticket.id < ownerTicketByUnit.get(unitId)) {
          ownerTicketByUnit.set(unitId, ticket.id);
          implementingTicketByUnit.set(unitId, ticket.id);
        }
      }
    }
  }

  const ticketKeyOfId = (id) => (phase?.id === -1 ? `PX-${id}` : `P${phase?.id}-${id}`);
  const tickets = (phase?.tickets ?? []).map((ticket) => {
    const records = new Map();
    const addRecord = (unitId) => {
      if (records.has(unitId)) return;
      const kind = kindOfUnit(unitId);
      const record = viewUnits.get(unitId);
      if (record === undefined) return;
      const mapEntry = mapUnits.get(unitId) ?? null;
      const baseObligation = obligationOf(unitId, kind, record, ticket.id, ownerTicketByUnit, implementingTicketByUnit, mapEntry, view.packageId);
      // The numeric id is phase-local; the full key is the durable reference a later
      // consolidation can remap without guessing which phase the number belonged to.
      const obligation = baseObligation.mode === 'reference'
        && baseObligation.implementerTicketId !== null
        && baseObligation.implementerTicketId !== undefined
        ? { ...baseObligation, implementerTicketKey: ticketKeyOfId(baseObligation.implementerTicketId) }
        : baseObligation;
      records.set(unitId, {
        unitId,
        kind,
        role: mapEntry?.role ?? (record.roleCandidate ?? null),
        surface: mapEntry?.surface ?? null,
        placement: placementOf(unitId, ticket, nodeById, dirsTree),
        obligation,
        obligationDigest: digestUnitObligation(obligation),
        specRefs: specRefsForUnit(unitId, kind, record, obligation, ticket, defaultSpecPath),
      });
    };

    for (const nodeId of Array.isArray(ticket.nodeIds) ? ticket.nodeIds : []) {
      for (const unitId of nodeById.get(nodeId)?.unitIds ?? []) addRecord(unitId);
    }
    for (const unitId of viewUnits.keys()) {
      const kind = kindOfUnit(unitId);
      if (kind !== 'sequence' && kind !== 'cross-boundary-sequence') continue;
      const record = viewUnits.get(unitId);
      const ownedSteps = (record.steps ?? []).filter((step) => ownerTicketByUnit.get(`op-${step.operationId}`) === ticket.id);
      if (ownedSteps.length === 0) continue;
      addRecord(unitId);
      const existing = records.get(unitId);
      if (existing !== undefined && existing.obligation.mode === 'flow') {
        existing.obligation = { mode: 'steps', outcome: record.outcome ?? null, steps: ownedSteps };
        existing.obligationDigest = digestUnitObligation(existing.obligation);
        existing.specRefs = specRefsForUnit(unitId, kind, record, existing.obligation, ticket, defaultSpecPath);
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
        digest: digestTicketDistribution({ sourceMapDigest, sourceViewDigest, units }),
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
// [::TICKET::] PX-307, PX-308, PX-315, PX-321, PX-322 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-307|PX-308|PX-315|PX-321|PX-322) --for-spec --no-implementation-order`.
function verifyTicketDistribution(phase, view, graph, dirsTree) {
  const findings = [];
  const nodeById = new Map((graph?.nodes ?? []).map((node) => [node.id, node]));
  const viewUnits = viewUnitMap(view);
  // The phase owns its nodes. The package-global unit set is checked once by
  // checkUnitCoverage and verifyChain, never by every phase.
  const graphUnits = graphUnitsOfPhase(phase, graph);

  const implementersByUnit = new Map();
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
    for (const unit of ticket?.distribution?.units ?? []) {
      if (!graphUnits.has(unit.unitId) && !isDeclaredStepBearingUnit(unit, viewUnits)) {
        findings.push({ code: 'INVENTED_UNIT', unitId: unit.unitId, layer: 'ticket', message: `ticket ${ticket.id} carries ${unit.unitId}, which is not carried by the phase graph` });
      }
      if (unit?.obligation?.mode === 'implement') {
        const ticketIds = implementersByUnit.get(unit.unitId) ?? [];
        ticketIds.push(ticket.id);
        implementersByUnit.set(unit.unitId, ticketIds);
      }
      const refs = Array.isArray(unit.specRefs) ? unit.specRefs : [];
      if (refs.some((ref) => typeof ref.path !== 'string' || ref.path.length === 0)) {
        findings.push({ code: 'SPEC_REF_MISSING', unitId: unit.unitId, layer: 'ticket', message: `unit ${unit.unitId} has a specification reference with no path` });
      }
      if (unit?.kind !== 'operation') continue;
      const specLines = viewUnits.get(unit.unitId)?.obligation?.specLines ?? [];
      const hasPositiveSpecLine = (Array.isArray(specLines) ? specLines : [])
        .some((line) => Number.isInteger(line) && line > 0);
      if (hasPositiveSpecLine && refs.every((ref) => !(ref.line > 0))) {
        findings.push({ code: 'SPEC_REF_MISSING', unitId: unit.unitId, layer: 'ticket', message: `unit ${unit.unitId} has spec lines and every ticket reference is line 0` });
      }
    }
  }

  for (const [unitId, ticketIds] of implementersByUnit) {
    if (ticketIds.length > 1) {
      findings.push({ code: 'DUPLICATE_UNIT_AT_TICKET', unitId, layer: 'ticket', message: `unit ${unitId} is implemented by tickets ${ticketIds.join(', ')}; keep one implementer and mark the rest reference` });
    }
  }

  for (const unitId of graphUnits) {
    if (!ticketUnits.has(unitId)) {
      findings.push({ code: 'MISSING_UNIT_AT_LAYER', unitId, layer: 'ticket', message: `graph unit ${unitId} reaches no ticket` });
    }
  }
  return findings;
}

/**
 * The sequence steps every ticket must carry, and the order they reconstruct in.
 *
 * A unit-set check proves the sequence unit reached a ticket; it does not prove its steps
 * did. This compares the view's declared steps with the union of the tickets' obligations.
 * Steps whose operation the package does not carry belong to another package and are not
 * required here.
 *
 * @param {object} phase
 * @param {object} view
 * @param {{ nodes?: Array<object> }} graph
 * @returns {Array<{ code: string, stepId?: string, unitId: string, layer: string, message: string }>}
 */
// [::TICKET::] PX-308, PX-312, PX-313, PX-314, PX-315, PX-318, PX-319, PX-321 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-308|PX-312|PX-313|PX-314|PX-315|PX-318|PX-319|PX-321) --for-spec --no-implementation-order`.
function verifySequenceSteps(phase, view, graph, artifact = null) {
  const findings = [];
  // A step whose operation this phase does not carry belongs to another phase or package.
  // The phase-local check must not report it as missing; the owning phase and verifyChain
  // prove it reaches a ticket.
  const graphUnits = graphUnitsOfPhase(phase, graph);
  const operationRoles = operationRolesOf(phase);
  const declaredByUnit = new Map();
  const sequenceIdByUnit = new Map();
  for (const field of ['ownedSequenceUnits', 'crossBoundarySequenceUnits']) {
    for (const unit of Array.isArray(view?.[field]) ? view[field] : []) {
      if (typeof unit?.unitId !== 'string') continue;
      declaredByUnit.set(unit.unitId, [...(unit.steps ?? [])].sort((left, right) => (left.order ?? 0) - (right.order ?? 0)));
      if (typeof unit.sequenceId === 'string') sequenceIdByUnit.set(unit.unitId, unit.sequenceId);
    }
  }

  // An obligationUnits row names a sequence but carries no steps. It is not a
  // step-bearing distribution, so every artifact step whose sequence has no
  // owned/cross-boundary record must be reported rather than silently skipped.
  const obligationSequenceUnits = new Map();
  for (const unit of Array.isArray(view?.obligationUnits) ? view.obligationUnits : []) {
    const unitId = String(unit?.unitId ?? '');
    const isSequence = unit?.kind === 'sequence'
      || unit?.kind === 'cross-boundary-sequence'
      || unitId.startsWith('seq-')
      || unitId.startsWith('xdir-');
    if (!isSequence) continue;
    const sequenceId = typeof unit.subject === 'string' ? unit.subject : unitId.replace(/^(seq|xdir)-/, '');
    obligationSequenceUnits.set(sequenceId, unit.unitId);
  }
  if (artifact !== null) {
    for (const [sequenceId, steps] of artifactStepsForSequences(artifact, declaredSequenceIds(view))) {
      for (const step of steps) {
        const carried = [...declaredByUnit.values()]
          .some((declaredSteps) => declaredSteps.some((entry) => entry.stepId === step.id));
        if (carried) continue;
        findings.push({
          code: 'SEQUENCE_STEPS_UNDISTRIBUTED',
          stepId: step.id,
          unitId: obligationSequenceUnits.get(sequenceId) ?? `seq-${sequenceId}`,
          layer: 'ticket',
          message: `sequence ${sequenceId} step ${step.id} has no step-bearing view record`,
        });
      }
    }
  }

  // The artifact is the denominator in both directions. The block above proves every
  // artifact step reached the view; this block proves the view added nothing.
  if (artifact !== null && Array.isArray(artifact.sequences)) {
    const artifactSequenceIds = new Set(
      (artifact.sequences ?? []).map((sequence) => sequence?.id).filter((id) => typeof id === 'string'),
    );
    const artifactStepIds = new Map();
    for (const step of Array.isArray(artifact.steps) ? artifact.steps : []) {
      if (!artifactSequenceIds.has(step?.sequence) || typeof step?.id !== 'string') continue;
      const ids = artifactStepIds.get(step.sequence) ?? new Set();
      ids.add(step.id);
      artifactStepIds.set(step.sequence, ids);
    }
    const viewSequenceUnits = new Map();
    for (const [unitId, sequenceId] of sequenceIdByUnit) {
      if (!viewSequenceUnits.has(sequenceId)) viewSequenceUnits.set(sequenceId, unitId);
    }
    for (const [sequenceId, unitId] of obligationSequenceUnits) {
      if (!viewSequenceUnits.has(sequenceId)) viewSequenceUnits.set(sequenceId, unitId);
    }
    for (const [sequenceId, unitId] of viewSequenceUnits) {
      if (artifactSequenceIds.has(sequenceId)) continue;
      findings.push({ code: 'INVENTED_SEQUENCE', stepId: null, unitId, layer: 'ticket', message: `sequence ${sequenceId} is declared by the view and absent from the artifact` });
    }
    for (const [unitId, steps] of declaredByUnit) {
      const sequenceId = sequenceIdByUnit.get(unitId);
      if (!artifactSequenceIds.has(sequenceId)) continue;
      const expected = artifactStepIds.get(sequenceId) ?? new Set();
      for (const step of steps) {
        if (expected.has(step.stepId)) continue;
        findings.push({ code: 'INVENTED_SEQUENCE_STEP', stepId: step.stepId, unitId, layer: 'ticket', message: `sequence ${sequenceId} step ${step.stepId} is declared by the view and absent from the artifact` });
      }
    }
  }

  const observed = new Map();
  const implementedOperations = new Set();
  for (const ticket of phase?.tickets ?? []) {
    for (const unit of ticket?.distribution?.units ?? []) {
      if (unit?.obligation?.mode === 'implement') implementedOperations.add(unit.unitId);
      for (const step of unit?.obligation?.steps ?? []) {
        const entry = observed.get(step.stepId) ?? { ticketIds: new Set(), steps: [], occurrences: 0, unitId: unit.unitId };
        entry.ticketIds.add(ticket.id);
        entry.steps.push(step);
        entry.occurrences += 1;
        observed.set(step.stepId, entry);
      }
    }
  }

  const declaredStepIds = new Set();
  for (const [unitId, steps] of declaredByUnit) {
    for (const step of steps) declaredStepIds.add(step.stepId);
    for (const step of steps) {
      const hit = observed.get(step.stepId);
      const operationUnitId = `op-${step.operationId}`;
      // A consumer owner does not implement the step here; the implementation is owed by
      // the other package. Missing and unowned steps are therefore not local failures.
      const requiresImplementer = operationRoles.get(operationUnitId) !== 'consumer';
      const isPackageStep = requiresImplementer && graphUnits.has(operationUnitId);
      if (hit === undefined) {
        if (isPackageStep) {
          findings.push({ code: 'MISSING_SEQUENCE_STEP', stepId: step.stepId, unitId, layer: 'ticket', message: `sequence ${unitId} step ${step.stepId} reaches no ticket` });
        }
        continue;
      }
      if (hit.ticketIds.size > 1 || hit.occurrences > 1) {
        findings.push({ code: 'DUPLICATE_SEQUENCE_STEP', stepId: step.stepId, unitId, layer: 'ticket', message: `sequence ${unitId} step ${step.stepId} appears ${hit.occurrences} time(s) in tickets ${[...hit.ticketIds].join(', ')}` });
      }
      if (isPackageStep && !implementedOperations.has(operationUnitId)) {
        findings.push({ code: 'SEQUENCE_STEP_WITHOUT_IMPLEMENTER', stepId: step.stepId, unitId, layer: 'ticket', message: `step ${step.stepId} owes operation ${operationUnitId} and no ticket implements it` });
      }
    }

    const observedOrder = steps
      .filter((step) => observed.has(step.stepId))
      .map((step) => ({ stepId: step.stepId, order: observed.get(step.stepId).steps[0]?.order ?? 0 }))
      .sort((left, right) => left.order - right.order)
      .map((entry) => entry.stepId);
    const declaredOrder = steps.filter((step) => observed.has(step.stepId)).map((step) => step.stepId);
    if (observedOrder.join(',') !== declaredOrder.join(',')) {
      findings.push({ code: 'SEQUENCE_ORDER_MISMATCH', unitId, layer: 'ticket', message: `sequence ${unitId} reconstructs as ${observedOrder.join(' -> ')} and is declared as ${declaredOrder.join(' -> ')}` });
    }
  }

  for (const [stepId, hit] of observed) {
    if (!declaredStepIds.has(stepId)) {
      findings.push({ code: 'UNASSIGNED_SEQUENCE_STEP', stepId, unitId: hit.unitId, layer: 'ticket', message: `ticket step ${stepId} is not declared by any view sequence` });
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
// [::TICKET::] PX-307, PX-315 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-307|PX-315) --for-spec --no-implementation-order`.
function writeTicketDistributionAggregate(ticketsData) {
  const ticketDigests = {};
  let sourceMapDigest = null;
  let sourceViewDigest = null;
  for (const phase of ticketsData?.phases ?? []) {
    for (const ticket of phase?.tickets ?? []) {
      if (ticket?.distribution === undefined) continue;
      // Ticket ids are numbered inside a phase, so P0-1 and P1-1 are different tickets.
      // The public key is the only identity the aggregate may use.
      ticketDigests[ticketIdentity(ticket)] = ticket.distribution.digest;
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

/**
 * The digest a ticket's distribution record must carry.
 *
 * The writer and the verifier call this one function, so a change to the digested shape
 * cannot leave the two stages disagreeing about what a valid record is.
 */
// [::TICKET::] PX-311 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-311 --for-spec --no-implementation-order`.
function digestTicketDistribution(distribution) {
  const { digestValue } = require('../sequences-slice/lib/digest.mjs');
  return digestValue({
    sourceMapDigest: distribution?.sourceMapDigest ?? null,
    sourceViewDigest: distribution?.sourceViewDigest ?? null,
    units: Array.isArray(distribution?.units) ? distribution.units : [],
  });
}

/** The digest a unit's obligation must carry. */
// [::TICKET::] PX-311 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-311 --for-spec --no-implementation-order`.
function digestUnitObligation(obligation) {
  const { digestValue } = require('../sequences-slice/lib/digest.mjs');
  return digestValue(obligation ?? null);
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
  graphUnitsOfPhase,
  verifyTicketUnits,
  appendNodeUnitIds,
  resolveDefaultFiles,
  resolveReferenceSection,
  parseCliArguments,
  populateTicketDistribution,
  reconstructSequenceOrder,
  verifyTicketDistribution,
  verifySequenceSteps,
  attachPrerequisites,
  buildOperationOwners,
  writeTicketDistributionAggregate,
  digestTicketDistribution,
  digestUnitObligation,
  writeJsonAtomically,
};
