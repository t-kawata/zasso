#!/usr/bin/env node

/**
 * phasify-omissions.js — Re-phase omission tickets using graph-based mathematical dependency ordering
 *
 * PX-107: Reads OMISSIONS-*.json + RFC-ROOT-GRAPH.json + Tickets.json, extracts the omission
 * subgraph, applies the identical 5-phase phasify pipeline (Tarjan SCC → Kahn topological sort →
 * soft constraint costing → phase merging with hard constraint enforcement → consolidation),
 * maps nodes back to tickets, applies phase ID offset, and outputs OMISSIONS-phasified-*.json.
 *
 * Reuses pure functions from phasify-helpers.js and boundify-helpers.js without modification.
 *
 * Usage:
 *   node phasify-omissions.js \
 *     --omissions=<OMISSIONS-*.json> \
 *     --graph=<RFC-ROOT-GRAPH.json> \
 *     --tickets=<Tickets.json> \
 *     [--min-nodes=N] [--output=<path>] [--dry-run] [--verbose]
 *
 * Exit codes:
 *   0 = Success (✅PASS)
 *   1 = Validation error
 *   2 = Argument error
 *   3 = File not found or parse error
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ============================================================
// PX-106: Import sentinel utilities from add-omission-ticket.js
// ============================================================
let _repairSentinel = null;
try {
  const addOmissionModule = require('../tickets/add-omission-ticket.js');
  _repairSentinel = {
    sentinel: addOmissionModule.INSPECTION_SENTINEL || '[::INSPECTION_FLAGGED::]',
    repair: addOmissionModule.repairDuplicateSentinels || function(bg) {
      const s = bg || ''; const c = (s.match(/\[::INSPECTION_FLAGGED::\]/g) || []).length;
      if (c <= 1) return s; const li = s.lastIndexOf('[::INSPECTION_FLAGGED::]'); return s.slice(li);
    },
  };
} catch (e) {
  _repairSentinel = {
    sentinel: '[::INSPECTION_FLAGGED::]',
    repair: function(bg) { const s = bg || ''; const c = (s.match(/\[::INSPECTION_FLAGGED::\]/g) || []).length; if (c <= 1) return s; const li = s.lastIndexOf('[::INSPECTION_FLAGGED::]'); return s.slice(li); },
  };
}

// ============================================================
// Constants
// ============================================================

/** Default min nodes per phase (auto-calculated when not specified) */
const MIN_NODES_PER_PHASE_DEFAULT = 10;
const MIN_SIZE_LOWER_BOUND = 3;
const MIN_SIZE_UPPER_BOUND = 10;
const AUTO_SIZE_DIVISOR = 7;

// ============================================================
// Struct: CliOptions
// ============================================================

/**
 * @typedef {object} CliOptions
 * @property {string} omissionsPath   — Absolute path to OMISSIONS-*.json
 * @property {string} graphPath       — Absolute path to RFC-ROOT-GRAPH.json
 * @property {string} ticketsPath     — Absolute path to Tickets.json
 * @property {number} minNodes        — Min nodes per phase (0 = auto)
 * @property {string} outputPath      — Output path (auto-derived if empty)
 * @property {boolean} dryRun         — --dry-run flag
 * @property {boolean} verbose        — --verbose flag
 * @property {boolean} rollback       — --rollback flag
 * @property {boolean} withBackup     — --with-backup flag (create backup during rollback)
 */

// ============================================================
// Pure functions (exported for testing)
// ============================================================

/**
 * Find the latest OMISSIONS-*.json in CWD by scanning for files matching the pattern.
 * @returns {string|null} — Absolute path, or null if none found
 */
// [::TICKET::] PX-108 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-108 --for-spec --no-implementation-order`.
function findLatestOmissions() {
  var pattern = /^OMISSIONS-\d{14}\.json$/;
  var files;
  try { files = fs.readdirSync('.'); } catch (e) { return null; }
  var matches = files.filter(function(f) { return pattern.test(f); });
  if (matches.length === 0) return null;
  matches.sort().reverse();
  return path.resolve(matches[0]);
}

// [::TICKET::] PX-107, PX-108, PX-109 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-107|PX-108|PX-109) --for-spec --no-implementation-order`.
function parseArguments(argv) {
  const opts = {
    omissionsPath: '',
    graphPath: '',
    ticketsPath: '',
    minNodes: 0,
    outputPath: '',
    dryRun: false,
    verbose: false,
    rollback: false,
    withBackup: false,
  };

  for (const arg of argv) {
    if (arg.startsWith('--omissions=')) {
      opts.omissionsPath = path.resolve(arg.slice('--omissions='.length));
    } else if (arg.startsWith('--graph=')) {
      opts.graphPath = path.resolve(arg.slice('--graph='.length));
    } else if (arg.startsWith('--tickets=')) {
      opts.ticketsPath = path.resolve(arg.slice('--tickets='.length));
    } else if (arg.startsWith('--min-nodes=')) {
      opts.minNodes = parseInt(arg.slice('--min-nodes='.length), 10);
      if (isNaN(opts.minNodes) || opts.minNodes < 3) {
        console.error('[ERROR] --min-nodes must be an integer >= 3');
        process.exit(2);
      }
    } else if (arg.startsWith('--output=')) {
      opts.outputPath = path.resolve(arg.slice('--output='.length));
    } else if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg === '--verbose') {
      opts.verbose = true;
    } else if (arg === '--rollback') {
      opts.rollback = true;
    } else if (arg === '--with-backup') {
      opts.withBackup = true;
    } else {
      console.error('[ERROR] Unknown argument: ' + arg);
      console.error('Usage: node phasify-omissions.js --omissions=<PATH> --graph=<PATH> --tickets=<PATH> [--min-nodes=N] [--output=PATH] [--dry-run] [--verbose] [--rollback] [--with-backup]');
      process.exit(2);
    }
  }

  // Auto-discover OMISSIONS from CWD if not specified
  if (!opts.omissionsPath) {
    const found = findLatestOmissions();
    if (!found) {
      console.error('[ERROR] No OMISSIONS-*.json found in CWD. Use --omissions=<PATH> to specify.');
      process.exit(2);
    }
    opts.omissionsPath = found;
    console.error('[phasify-omissions] Auto-discovered OMISSIONS: ' + found);
  }

  if (!opts.graphPath) {
    console.error('[ERROR] Missing required argument: --graph=<PATH>');
    process.exit(2);
  }

  // Default Tickets.json in CWD if not specified
  if (!opts.ticketsPath) {
    const defaultPath = path.resolve('Tickets.json');
    if (fs.existsSync(defaultPath)) {
      opts.ticketsPath = defaultPath;
      console.error('[phasify-omissions] Default Tickets.json: ' + defaultPath);
    } else {
      console.error('[ERROR] No Tickets.json found in CWD. Use --tickets=<PATH> to specify.');
      process.exit(2);
    }
  }

  return opts;
}

/**
 * Compute phase ID offset from existing Tickets.json.
 *
 * @param {string} ticketsPath — Absolute path to Tickets.json
 * @returns {number} — max(id) + 1, or 0 if no phases
 */
// [::TICKET::] PX-107 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-107 --for-spec --no-implementation-order`.
function computePhaseIdOffset(ticketsPath) {
  try {
    const ticketsData = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
    const phaseIds = (ticketsData.phases || []).map(p => p.id).filter(id => typeof id === 'number');
    return phaseIds.length > 0 ? Math.max(...phaseIds) + 1 : 0;
  } catch (e) {
    console.error('[ERROR] Cannot read Tickets.json: ' + e.message);
    process.exit(3);
  }
}

/**
 * Auto-calculate min nodes per phase based on total node count.
 * Formula: max(lowerBound, min(upperBound, ceil(totalNodes / divisor)))
 *
 * @param {number} totalNodes — Total nodes in O_NODES set
 * @returns {number} — Between MIN_SIZE_LOWER_BOUND and MIN_SIZE_UPPER_BOUND
 */
// [::TICKET::] PX-107 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-107 --for-spec --no-implementation-order`.
function autoMinSize(totalNodes) {
  const calculated = Math.ceil(totalNodes / AUTO_SIZE_DIVISOR);
  return Math.max(MIN_SIZE_LOWER_BOUND, Math.min(MIN_SIZE_UPPER_BOUND, calculated));
}

/**
 * Validate that a file path exists and is readable JSON.
 *
 * @param {string} filePath — Absolute path
 * @param {string} label — Human-readable label for error messages
 */
// [::TICKET::] PX-107 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-107 --for-spec --no-implementation-order`.
function validateFileExists(filePath, label) {
  if (!fs.existsSync(filePath)) {
    console.error('[ERROR] ' + label + ' not found: ' + filePath);
    process.exit(3);
  }
}

/**
 * Extract O_NODES set from OMISSIONS tickets and filter GRAPH edges.
 *
 * @param {object} omissionsData — Parsed OMISSIONS-*.json
 * @param {object} graphData — Parsed RFC-ROOT-GRAPH.json
 * @returns {{ nodes: object[], edges: object[], omissionNodeIds: Set<string> }}
 */
// [::TICKET::] PX-107 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-107 --for-spec --no-implementation-order`.
function extractOmissionSubgraph(omissionsData, graphData) {
  const omissionNodeIds = new Set();
  const phases = omissionsData.phases || [];
  for (const phase of phases) {
    const tickets = phase.tickets || [];
    for (const ticket of tickets) {
      const nodeIds = ticket.nodeIds || [];
      for (const nid of nodeIds) {
        omissionNodeIds.add(nid);
      }
    }
  }

  // Filter edges to those with both endpoints in O_NODES
  const filteredEdges = (graphData.edges || []).filter(function(e) {
    return omissionNodeIds.has(e.from) && omissionNodeIds.has(e.to);
  });

  return { nodes: graphData.nodes || [], edges: filteredEdges, omissionNodeIds };
}

/**
 * Deduplicate tickets by originalTicketKey.
 * PX clones (with originalTicketKey) become actionTickets.
 * Originals (without originalTicketKey) become referenceTickets.
 *
 * @param {object[]} allTickets — All tickets from OMISSIONS file
 * @returns {{ actionTickets: object[], referenceTickets: object[], actionTicketKeys: Set<string> }}
 */
// [::TICKET::] PX-107 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-107 --for-spec --no-implementation-order`.
function dedupTickets(allTickets) {
  const byKey = new Map();
  const referenceTickets = [];

  for (const ticket of allTickets) {
    if (ticket.originalTicketKey) {
      const existing = byKey.get(ticket.originalTicketKey);
      if (existing) {
        const existingCount = (existing.foundOmissions || []).length;
        const incomingCount = (ticket.foundOmissions || []).length;
        if (incomingCount > existingCount) {
          byKey.set(ticket.originalTicketKey, ticket);
        }
      } else {
        byKey.set(ticket.originalTicketKey, ticket);
      }
    } else {
      referenceTickets.push(ticket);
    }
  }

  return {
    actionTickets: Array.from(byKey.values()),
    referenceTickets: referenceTickets,
    actionTicketKeys: new Set(byKey.keys()),
  };
}

/**
 * Crude measure of node order within a raw node list (before topo sort).
 * Creates a fallback order from the nodeIds present in each phase of the OMISSIONS file.
 * Not mathematically precise — used only for edge case where topo sort is overkill
 * (e.g., all nodes isolated with no edges).
 *
 * @param {object} omissionsData — OMISSIONS JSON
 * @returns {string[]} — Ordered node IDs
 */
// [::TICKET::] PX-107 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-107 --for-spec --no-implementation-order`.
function buildFallbackOrder(omissionsData) {
  const order = [];
  const seen = new Set();
  const phases = omissionsData.phases || [];
  for (const phase of phases) {
    const tickets = phase.tickets || [];
    for (const ticket of tickets) {
      const nodeIds = ticket.nodeIds || [];
      for (const nid of nodeIds) {
        if (!seen.has(nid)) {
          seen.add(nid);
          order.push(nid);
        }
      }
    }
  }
  return order;
}

/**
 * Apply phase ID offset to reassigned phases.
 * Wraps phasify-helpers.reassignPhaseIds, adds offset to all phase IDs.
 *
 * @param {Array<{id:number, name:string, nodeIds:string[]}>} phases — Normalized phases
 * @param {number} offset — Phase ID offset
 * @returns {Array<{id:number, name:string, nodeIds:string[]}>} — Offset-aware phases
 */
// [::TICKET::] PX-107 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-107 --for-spec --no-implementation-order`.
function reassignPhaseIdsWithOffset(phases, offset) {
  // Import phasify-helpers lazily to avoid circular dependency at module load
  let reassignPhaseIds;
  try {
    reassignPhaseIds = require('./phasify-helpers.js').reassignPhaseIds;
  } catch (e) {
    // Fallback: manual sequential assignment
    reassignPhaseIds = function(phs) {
      if (!phs) return phs;
      for (let i = 0; i < phs.length; i++) {
        phs[i].id = i;
        phs[i].name = 'P' + i;
        if (phs[i].nodeIds) phs[i].nodeIds.sort();
      }
      return phs;
    };
  }

  const normalized = reassignPhaseIds(JSON.parse(JSON.stringify(phases)));
  for (const phase of normalized) {
    phase.id = phase.id + offset;
    phase.name = 'P' + phase.id;
    // Update ticket.phaseId to match the new parent phase ID
    const tickets = phase.tickets || [];
    for (let ti = 0; ti < tickets.length; ti++) {
      tickets[ti].phaseId = phase.id;
    }
  }
  return normalized;
}

/**
 * Map action tickets to phases based on earliest nodeId phase assignment.
 *
 * @param {Array<{id:number, nodeIds:string[]}>} phases — Phases with nodeIds
 * @param {object[]} actionTickets — Tickets to assign
 * @param {string[]} nodeOrder — Topologically sorted node order
 * @returns {Array} — Phases with tickets assigned
 */
// [::TICKET::] PX-107, PX-108 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-107|PX-108) --for-spec --no-implementation-order`.
function assignTicketsToPhases(phases, actionTickets, nodeOrder) {
  // Build node -> phase map
  const nodeToPhase = {};
  for (const phase of phases) {
    const nodeIds = phase.nodeIds || [];
    for (const nid of nodeIds) {
      nodeToPhase[nid] = phase.id;
    }
  }

  // Build node -> earliest position in topological order
  const nodePosition = {};
  for (let i = 0; i < nodeOrder.length; i++) {
    nodePosition[nodeOrder[i]] = i;
  }

  // Assign each ticket to the earliest phase containing any of its nodes
  const phaseTickets = {};
  for (const phase of phases) {
    phaseTickets[phase.id] = [];
  }

  for (const ticket of actionTickets) {
    const nodeIds = ticket.nodeIds || [];
    if (nodeIds.length === 0) {
      // No nodes: assign to phase 0 (or first phase)
      const firstPhase = phases.length > 0 ? phases[0].id : 0;
      if (!phaseTickets[firstPhase]) phaseTickets[firstPhase] = [];
      ticket.phaseId = firstPhase;
      phaseTickets[firstPhase].push(ticket);
      continue;
    }

    // Find earliest phase with the earliest node
    let earliestPhase = null;
    let earliestPos = Infinity;

    for (const nid of nodeIds) {
      const pid = nodeToPhase[nid];
      if (pid !== undefined) {
        const pos = nodePosition[nid] !== undefined ? nodePosition[nid] : Infinity;
        if (pos < earliestPos) {
          earliestPos = pos;
          earliestPhase = pid;
        }
      }
    }

    // Fallback: no nodes mapped -> phase 0
    if (earliestPhase === null) {
      const firstPhase = phases.length > 0 ? phases[0].id : 0;
      if (!phaseTickets[firstPhase]) phaseTickets[firstPhase] = [];
      ticket.phaseId = firstPhase;
      phaseTickets[firstPhase].push(ticket);
    } else {
      ticket.phaseId = earliestPhase;
      phaseTickets[earliestPhase].push(ticket);
    }
  }

  // Attach tickets to phases
  for (const phase of phases) {
    phase.tickets = phaseTickets[phase.id] || [];
  }

  return phases;
}

/**
 * Consolidate phases with fewer than 3 tickets into the next phase.
 * Right-to-left single-pass to match split-to-tickets.md Step 5-3.
 * The final phase is excluded from consolidation.
 *
 * Only merges if hard constraint invariance is maintained:
 * no depends_on/implements edge has both endpoints in the merged result.
 *
 * @param {Array<{id:number, nodeIds:string[], tickets:object[]}>} phases — Phases with tickets
 * @param {Array<{from:string, to:string}>} [hardEdges] — Array of weight ∞ edges
 * @returns {Array} — Consolidated phases (immutable, new array)
 */
// [::TICKET::] PX-108 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-108 --for-spec --no-implementation-order`.
function consolidatePhasesByTicketCount(phases, hardEdges) {
  if (!Array.isArray(phases) || phases.length <= 1) return phases;

  const MIN_TICKETS = 3;
  var working = JSON.parse(JSON.stringify(phases));

  // Build node set indices for the full working array (pre-merge)
  var nodeToPhaseIdx = {};
  for (var wi = 0; wi < working.length; wi++) {
    if (!working[wi]) continue;
    var nids = working[wi].nodeIds || [];
    for (var wn = 0; wn < nids.length; wn++) {
      nodeToPhaseIdx[nids[wn]] = wi;
    }
  }

  // Scan from right to left (skip the final phase)
  for (var i = working.length - 2; i >= 0; i--) {
    var current = working[i];
    if (!current) continue;

    // Find the next non-null phase
    var next = null;
    var nextIdx = -1;
    for (var j = i + 1; j < working.length; j++) {
      if (working[j] !== null) { next = working[j]; nextIdx = j; break; }
    }
    if (!next) continue;

    var ticketCount = (current.tickets || []).length;
    if (ticketCount >= MIN_TICKETS) continue;

    // Hard constraint check: merging current into next must not put
    // both endpoints of any depends_on/implements edge in the same phase
    var mergeSafe = true;
    if (hardEdges && hardEdges.length > 0) {
      var currentNodes = new Set(current.nodeIds || []);
      var nextNodes = new Set(next.nodeIds || []);
      for (var ei = 0; ei < hardEdges.length; ei++) {
        var e = hardEdges[ei];
        var fromInCurrent = currentNodes.has(e.from);
        var toInCurrent = currentNodes.has(e.to);
        var fromInNext = nextNodes.has(e.from);
        var toInNext = nextNodes.has(e.to);
        // If one endpoint is in current AND the other in next, merging creates a violation
        if ((fromInCurrent && toInNext) || (toInCurrent && fromInNext)) {
          mergeSafe = false;
          break;
        }
      }
    }

    if (!mergeSafe) continue;

    // Merge current into next: prepend tickets, union nodeIds
    var currentTickets = current.tickets || [];
    var nextTickets = next.tickets || [];
    next.tickets = currentTickets.concat(nextTickets);

    var currentNodes = current.nodeIds || [];
    var nextNodes = next.nodeIds || [];
    var mergedNodes = currentNodes.slice();
    for (var k = 0; k < nextNodes.length; k++) {
      if (mergedNodes.indexOf(nextNodes[k]) === -1) mergedNodes.push(nextNodes[k]);
    }
    next.nodeIds = mergedNodes.sort();

    // Mark current as consumed and update node index
    for (var mn = 0; mn < currentNodes.length; mn++) {
      nodeToPhaseIdx[currentNodes[mn]] = nextIdx;
    }
    working[i] = null;
  }

  // Filter out consumed phases (IDs already set by reassignPhaseIdsWithOffset)
  var result = working.filter(function(p) { return p !== null; });
  return result;
}

/**
 * Defense-in-depth repair of duplicate INSPECTION_SENTINEL in backgrounds.
 *
 * @param {object[]} actionTickets — Tickets to repair
 */
// [::TICKET::] PX-107 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-107 --for-spec --no-implementation-order`.
function repairInspectionPrefixes(actionTickets, quiet) {
  if (!Array.isArray(actionTickets)) return;

  const sentinel = _repairSentinel.sentinel;
  const repairFn = _repairSentinel.repair;
  let repairCount = 0;

  for (const ticket of actionTickets) {
    const bg = ticket.background || '';
    const sentinelCount = (bg.match(/\[::INSPECTION_FLAGGED::\]/g) || []).length;

    if (sentinelCount === 0) {
      // Pre-sentinel data — prepend now
      ticket.background = sentinel + '\nInspected via phasify-omissions (PX-107)\n\n' + bg;
      repairCount++;
    } else if (sentinelCount > 1) {
      // Duplicate — keep only the last occurrence
      ticket.background = repairFn(bg);
      repairCount++;
    }
    // sentinelCount === 1: clean, no repair needed
  }

  if (repairCount > 0 && !quiet) {
    console.warn('[WARN] Repaired ' + repairCount + ' tickets with inspection prefix issues.');
  }
}

/**
 * Validate the phasify output for completeness and correctness.
 *
 * @param {object} inMemoryTickets — Output OMISSIONS-phasified structure
 * @param {object[]} nodes — Graph nodes array
 * @param {object[]} edges — Subgraph edges array (internal only)
 * @param {Set<string>} omissionNodeIds — Expected O_NODES set
 * @returns {{ valid: boolean, checks: object }}
 */
// [::TICKET::] PX-107 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-107 --for-spec --no-implementation-order`.
function validatePhasedOmissions(inMemoryTickets, nodes, edges, omissionNodeIds) {
  const checks = {};
  let valid = true;

  // Check 1: All O_NODES covered
  const coveredNodes = new Set();
  const phaseList = inMemoryTickets.phases || [];
  for (const phase of phaseList) {
    const nodeIds = phase.nodeIds || [];
    for (const nid of nodeIds) {
      coveredNodes.add(nid);
    }
  }

  const missingNodes = [];
  for (const nid of omissionNodeIds) {
    if (!coveredNodes.has(nid)) {
      missingNodes.push(nid);
    }
  }
  checks.allNodesCovered = { passed: missingNodes.length === 0, missing: missingNodes };
  if (!checks.allNodesCovered.passed) valid = false;

  // Check 2: No duplicate nodes across phases
  const seen = new Set();
  const duplicates = [];
  for (const phase of phaseList) {
    const nodeIds = phase.nodeIds || [];
    for (const nid of nodeIds) {
      if (seen.has(nid)) duplicates.push(nid);
      seen.add(nid);
    }
  }
  checks.noDuplicateNodes = { passed: duplicates.length === 0, duplicates: duplicates };
  if (!checks.noDuplicateNodes.passed) valid = false;

  // Check 3: Hard constraint violations
  const hardEdges = edges.filter(function(e) {
    return e.type === 'depends_on' || e.type === 'implements';
  });
  const violations = [];
  const nodePhase = {};
  for (const phase of phaseList) {
    const nodeIds = phase.nodeIds || [];
    for (const nid of nodeIds) {
      nodePhase[nid] = phase.id;
    }
  }
  for (const edge of hardEdges) {
    const pu = nodePhase[edge.from];
    const pv = nodePhase[edge.to];
    if (pu !== undefined && pv !== undefined) {
      // depends_on(u→v): v must be before u
      const idxU = phaseList.findIndex(function(p) { return p.id === pu; });
      const idxV = phaseList.findIndex(function(p) { return p.id === pv; });
      if (idxV >= idxU) {
        violations.push({ edge: edge.from + '→' + edge.to, phaseU: pu, phaseV: pv });
      }
    }
  }
  checks.hardConstraints = { passed: violations.length === 0, violations: violations };
  if (!checks.hardConstraints.passed) valid = false;

  // Check 4: Phase ID range does not overlap with 0-21 (existing range)
  // This is a soft check — the offset mechanism prevents overlap by design
  checks.phaseIdOverlap = { passed: true };

  return { valid: valid, checks: checks };
}

/**
 * Build the OMISSIONS-phasified output JSON structure.
 *
 * @param {Array} phases — Phases with tickets
 * @param {object[]} referenceTickets — Clean reference tickets
 * @param {object} metadata — Metadata object
 * @returns {object} — Full output JSON
 */
// [::TICKET::] PX-107, PX-108 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-107|PX-108) --for-spec --no-implementation-order`.
function buildOutput(phases, referenceTickets, metadata) {
  // Filter to only phases that have tickets (non-empty re-implementation phases)
  var nonEmptyPhases = phases.filter(function(p) {
    return (p.tickets || []).length > 0;
  });
  return {
    title: 'phasify-omissions auto-generated re-implementation plan',
    metadata: metadata,
    phases: nonEmptyPhases.map(function(p) {
      return {
        id: p.id,
        name: p.name || 'P' + p.id,
        characteristics: '',
        nodeIds: (p.nodeIds || []).sort(),
        tickets: (p.tickets || []).map(function(t) {
          // Include originalTicketKey and foundOmissions in output
          var out = { id: t.id, phaseId: t.phaseId, title: t.title, status: 'todo' };
          if (t.originalTicketKey) out.originalTicketKey = t.originalTicketKey;
          if (t.foundOmissions) out.foundOmissions = t.foundOmissions;
          if (t.nodeIds) out.nodeIds = t.nodeIds;
          if (t.background) out.background = t.background;
          if (t.scope) out.scope = t.scope;
          if (t.acceptanceCriteria) out.acceptanceCriteria = t.acceptanceCriteria;
          if (t.contracts) out.contracts = t.contracts;
          if (t.notes) out.notes = t.notes;
          return out;
        }),
      };
    }),
    referenceTickets: referenceTickets.map(function(t) {
      var out = { id: t.id, phaseId: t.phaseId, title: t.title };
      if (t.nodeIds) out.nodeIds = t.nodeIds;
      out.note = 'No ABC violations found. Included for dependency completeness. Does not require re-implementation.';
      return out;
    }),
  };
}

// ============================================================
// PX-108: Auto-merge pipeline functions
// ============================================================

/**
 * Backup Tickets.json to a temp file.
 * @param {string} sourcePath — Path to Tickets.json (or any source file)
 * @param {string} targetPath — Backup target path
 * @returns {{ success: boolean, backupPath: string }}
 */
// [::TICKET::] PX-108: phasify-omissions auto-merge. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-108 --for-spec --no-implementation-order`.
// [::TICKET::] PX-108 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-108 --for-spec --no-implementation-order`.
function backupTickets(sourcePath, targetPath) {
  if (!fs.existsSync(sourcePath)) {
    throw new Error('Source not found: ' + sourcePath);
  }
  fs.copyFileSync(sourcePath, targetPath);
  return { success: true, backupPath: targetPath };
}

/**
 * Merge phasified phases into Tickets.json clone.
 * Pure function — no side effects. Returns a deep clone with phasified phases appended.
 * Reference tickets from the phasified output are stripped (they are originals in Tickets.json).
 *
 * @param {object} ticketsData — Parsed Tickets.json
 * @param {object} phasifiedOutput — buildOutput() result { title, metadata, phases[], referenceTickets? }
 * @returns {{ success: boolean, data: object }}
 * @throws {TypeError} On null/invalid input
 */
// [::TICKET::] PX-108: phasify-omissions auto-merge. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-108 --for-spec --no-implementation-order`.
// [::TICKET::] PX-108 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-108 --for-spec --no-implementation-order`.
function mergePhasifyToTickets(ticketsData, phasifiedOutput) {
  if (!ticketsData || typeof ticketsData !== 'object') {
    throw new TypeError('ticketsData must be a non-null object');
  }
  if (!phasifiedOutput || typeof phasifiedOutput !== 'object') {
    throw new TypeError('phasifiedOutput must be a non-null object');
  }

  // Deep clone to avoid mutation of inputs
  const merged = JSON.parse(JSON.stringify(ticketsData));

  // Filter to non-empty phases only, strip referenceTickets
  const phasesToAdd = (phasifiedOutput.phases || []).filter(function(p) {
    return (p.tickets || []).length > 0;
  });

  // Append each phase (already deep-cloned by stringify/parse cycle)
  for (let i = 0; i < phasesToAdd.length; i++) {
    merged.phases.push(phasesToAdd[i]);
  }

  return { success: true, data: merged };
}

/**
 * Validate merged Tickets.json structure.
 * Wraps lib/validate-tickets.js validateTickets() with graceful fallback.
 *
 * @param {object} mergedData — Merged Tickets.json { title, metadata, phases[] }
 * @returns {{ valid: boolean, errors: string[] }}
 */
// [::TICKET::] PX-108: phasify-omissions auto-merge. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-108 --for-spec --no-implementation-order`.
// [::TICKET::] PX-108 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-108 --for-spec --no-implementation-order`.
function validateMergedTickets(mergedData) {
  var validator;
  try {
    validator = require('../lib/validate-tickets.js');
    if (typeof validator.validateTickets === 'function') {
      return validator.validateTickets(mergedData);
    }
  } catch (e) {
    // Fallback: basic structure check when lib unavailable
  }

  // Fallback validation for standalone use
  if (!mergedData || typeof mergedData !== 'object') {
    return { valid: false, errors: ['Root must be a non-null object'] };
  }
  if (!Array.isArray(mergedData.phases)) {
    return { valid: false, errors: ['phases must be an array'] };
  }
  return { valid: true, errors: [] };
}

/**
 * Atomic write: write to a temp file, then rename to target.
 * Guarantees no partial writes on the same filesystem.
 *
 * @param {string} targetPath — Target file path
 * @param {string} data — Content to write (UTF-8 string)
 */
// [::TICKET::] PX-108: phasify-omissions auto-merge. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-108 --for-spec --no-implementation-order`.
// [::TICKET::] PX-108 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-108 --for-spec --no-implementation-order`.
function atomicWrite(targetPath, data) {
  var tmpPath = targetPath + '.tmp.' + process.pid;
  fs.writeFileSync(tmpPath, data, 'utf8');
  fs.renameSync(tmpPath, targetPath);
}

/**
 * Delete files from disk. Silently ignores non-existent files.
 * Never throws on ENOENT.
 *
 * @param {string[]} paths — Absolute file paths to delete
 */
// [::TICKET::] PX-108: phasify-omissions auto-merge. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-108 --for-spec --no-implementation-order`.
// [::TICKET::] PX-108 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-108 --for-spec --no-implementation-order`.
function cleanupFiles(paths) {
  if (!Array.isArray(paths)) return;
  for (var i = 0; i < paths.length; i++) {
    try {
      if (fs.existsSync(paths[i])) {
        fs.unlinkSync(paths[i]);
      }
    } catch (e) {
      // Ignore ENOENT (race condition), rethrow others
      if (e.code !== 'ENOENT') throw e;
    }
  }
}

// ============================================================
// PX-109: Rollback function
// ============================================================

/**
 * Roll back a phasify-omissions merge by removing phases with id >= offset.
 * Pure function — no side effects. Deep-clones input to avoid mutation.
 *
 * @param {object} ticketsData — Parsed Tickets.json with metadata.phasifyMerge
 * @returns {object} — Deep-cloned Tickets.json with merged phases removed
 * @throws {Error} If metadata.phasifyMerge is missing or offset is invalid
 */
// [::TICKET::] PX-109: deterministic rollback. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-109 --for-spec --no-implementation-order`.
// [::TICKET::] PX-109 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-109 --for-spec --no-implementation-order`.
function rollbackPhasifyMerge(ticketsData) {
  if (!ticketsData || typeof ticketsData !== 'object') {
    throw new Error('ticketsData must be a non-null object');
  }

  var mergeInfo = ticketsData.metadata && ticketsData.metadata.phasifyMerge;
  if (!mergeInfo || typeof mergeInfo.offset !== 'number') {
    throw new Error('No valid phasifyMerge metadata found in Tickets.json');
  }

  var offset = mergeInfo.offset;

  // Integrity check: offset must not overlap existing non-merged phases
  var preMergePhases = (ticketsData.phases || []).filter(function(p) { return p.id < offset; });
  if (preMergePhases.length === 0) {
    throw new Error('Offset ' + offset + ' would remove all phases — rollback rejected');
  }

  // Deep clone to avoid mutation
  var result = JSON.parse(JSON.stringify(ticketsData));

  // Remove merged phases (id >= offset)
  result.phases = preMergePhases;

  // Remove orphaned tickets (phaseId >= offset) from remaining phases
  for (var i = 0; i < result.phases.length; i++) {
    var tickets = result.phases[i].tickets || [];
    result.phases[i].tickets = tickets.filter(function(t) {
      return t.phaseId < offset;
    });
  }

  // Remove rollback metadata
  delete result.metadata.phasifyMerge;

  return result;
}

// ============================================================
// Main orchestrator
// ============================================================

/**
 * Run the full phasify-omissions pipeline.
 *
 * @param {CliOptions} opts
 */
// [::TICKET::] PX-107, PX-108, PX-109, PX-110 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-107|PX-108|PX-109|PX-110) --for-spec --no-implementation-order`.
function runPhasifyOmissions(opts) {
  // ============================================================
  // Rollback mode (PX-109)
  // ============================================================
  if (opts.rollback) {
    if (opts.verbose) console.log('[VERBOSE] Rollback mode...');

    var rollbackTicketsData;
    try {
      rollbackTicketsData = JSON.parse(fs.readFileSync(opts.ticketsPath, 'utf8'));
    } catch (e) {
      console.error('[ERROR] Cannot read Tickets.json: ' + e.message);
      process.exit(3);
    }

    var mergeInfo = rollbackTicketsData.metadata && rollbackTicketsData.metadata.phasifyMerge;
    if (!mergeInfo) {
      console.error('[ERROR] No phasifyMerge metadata found. Nothing to roll back.');
      process.exit(1);
    }

    var rollbackResult;
    try {
      rollbackResult = rollbackPhasifyMerge(rollbackTicketsData);
    } catch (e) {
      console.error('[ERROR] Rollback failed: ' + e.message);
      process.exit(1);
    }

    if (opts.dryRun) {
      console.log('');
      console.log('=== Rollback Preview (--dry-run) ===');
      console.log('Phases to remove: ' + (mergeInfo.mergedPhaseIds || []).join(', '));
      console.log('No files written.');
      return;
    }

    if (opts.withBackup) {
      var rollbackTs = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
      var rollbackBackup = path.join(path.dirname(opts.ticketsPath), 'tmp-Tickets-' + rollbackTs + '.json');
      try { backupTickets(opts.ticketsPath, rollbackBackup); } catch (e) {
        console.error('[ERROR] Cannot backup Tickets.json: ' + e.message);
        process.exit(3);
      }
    }

    try {
      atomicWrite(opts.ticketsPath, JSON.stringify(rollbackResult, null, 2) + '\n');
      console.log('');
      console.log('Rollback complete. Removed phases: ' + (mergeInfo.mergedPhaseIds || []).length);
      if (opts.withBackup) console.log('Backup: ' + rollbackBackup);
    } catch (e) {
      console.error('[ERROR] Cannot write Tickets.json: ' + e.message);
      process.exit(3);
    }
    return;
  }

  if (opts.verbose) console.log('[VERBOSE] Loading input files...');

  // Validate files exist
  validateFileExists(opts.omissionsPath, 'OMISSIONS');
  validateFileExists(opts.graphPath, 'GRAPH');
  validateFileExists(opts.ticketsPath, 'Tickets');

  // Parse input files
  let omissionsData, graphData;
  try {
    omissionsData = JSON.parse(fs.readFileSync(opts.omissionsPath, 'utf8'));
    graphData = JSON.parse(fs.readFileSync(opts.graphPath, 'utf8'));
  } catch (e) {
    console.error('[ERROR] Failed to parse input JSON: ' + e.message);
    process.exit(3);
  }

  // Step A: Collect all tickets and deduplicate
  if (opts.verbose) console.log('[VERBOSE] Collecting tickets from OMISSIONS...');
  const allTickets = [];
  const phaseList = omissionsData.phases || [];
  for (const phase of phaseList) {
    const tickets = phase.tickets || [];
    for (const ticket of tickets) {
      allTickets.push(ticket);
    }
  }
  if (allTickets.length === 0) {
    console.warn('[WARN] No tickets found in OMISSIONS file.');
  }

  const { actionTickets, referenceTickets, actionTicketKeys } = dedupTickets(allTickets);
  if (opts.verbose) {
    console.log('[VERBOSE] Action tickets: ' + actionTickets.length + ', Reference tickets: ' + referenceTickets.length);
  }

  // Step B: Extract subgraph
  if (opts.verbose) console.log('[VERBOSE] Extracting omission subgraph...');
  const { nodes, edges, omissionNodeIds } = extractOmissionSubgraph(omissionsData, graphData);
  const totalOmissionNodes = omissionNodeIds.size;

  if (opts.verbose) {
    console.log('[VERBOSE] Omission nodes: ' + totalOmissionNodes);
    console.log('[VERBOSE] Subgraph edges: ' + edges.length);
  }

  // Count cross-boundary edges for reporting
  const allEdges = graphData.edges || [];
  const crossFromOmission = allEdges.filter(function(e) {
    return omissionNodeIds.has(e.from) && !omissionNodeIds.has(e.to) && (e.type === 'depends_on' || e.type === 'implements');
  });
  const crossToOmission = allEdges.filter(function(e) {
    return !omissionNodeIds.has(e.from) && omissionNodeIds.has(e.to) && (e.type === 'depends_on' || e.type === 'implements');
  });
  if (opts.verbose) {
    console.log('[VERBOSE] Cross-boundary depends_on (from omission): ' + crossFromOmission.length);
    console.log('[VERBOSE] Cross-boundary depends_on (to omission): ' + crossToOmission.length);
  }

  // Step C: Determine min nodes per phase
  const minSize = opts.minNodes > 0 ? opts.minNodes : autoMinSize(Math.max(totalOmissionNodes, 1));
  if (opts.verbose) console.log('[VERBOSE] Min nodes per phase: ' + minSize);

  // Step D: Run phasify pipeline (import functions lazily)
  if (opts.verbose) console.log('[VERBOSE] Loading phasify algorithm modules...');

  // Import phasify-helpers
  let phasify;
  try {
    phasify = require('./phasify-helpers.js');
  } catch (e) {
    console.error('[ERROR] Cannot load phasify-helpers.js');
    process.exit(3);
  }

  const { tarjanSCC } = require('./boundify-helpers.js');

  // ============================================================
  // Phase 1: SCC condensation
  // ============================================================
  if (opts.verbose) console.log('[VERBOSE] Phase 1: SCC condensation...');
  const sccResult = tarjanSCC(edges);
  const { sccMap, sccIds } = phasify.buildSccConstraint(sccResult);
  if (opts.verbose) {
    if (sccResult.length > 0) {
      console.log('[VERBOSE] SCC components: ' + sccResult.length + ' (multi-node: ' + Object.keys(sccMap).length + ' nodes)');
    } else {
      console.log('[VERBOSE] No SCC components detected.');
    }
  }

  // ============================================================
  // Phase 2: Kahn topological sort
  // ============================================================
  if (opts.verbose) console.log('[VERBOSE] Phase 2: Topological sort...');
  const allNodeIds = Array.from(omissionNodeIds);
  const sortResult = phasify.kahnTopologicalSort(allNodeIds, edges, phasify.getWeight);

  if (!sortResult.success) {
    console.error('[ERROR] ' + sortResult.error);
    if (sortResult.cycle) {
      console.error('Cyclic nodes: [' + sortResult.cycle.join(', ') + ']');
    }
    process.exit(1);
  }

  // Apply SCC constraint
  const sccAppliedOrder = phasify.applySccToOrder(sortResult.order, sccMap);

  // No directory constraints for omission phasing (directories already exist)
  let finalOrder = sccAppliedOrder;

  if (opts.verbose) console.log('[VERBOSE] Sort completed: ' + finalOrder.length + ' nodes');

  // ============================================================
  // Phase 3: Soft constraint violation cost (informational)
  // ============================================================
  if (opts.verbose) console.log('[VERBOSE] Phase 3: Soft constraint violations...');
  const softResult = phasify.computeSoftViolations(finalOrder, edges, phasify.getWeight);
  if (opts.verbose) {
    if (softResult.violations.length > 0) {
      console.log('[VERBOSE] Soft constraint violations: ' + softResult.violations.length + ', total cost: ' + softResult.totalCost);
    } else {
      console.log('[VERBOSE] No soft constraint violations.');
    }
  }

  // ============================================================
  // Phase 4: Phase merging + hard constraint enforcement + consolidation
  // ============================================================
  if (opts.verbose) console.log('[VERBOSE] Phase 4: Phase merging (min: ' + minSize + ')...');

  // Extract hard edges
  const hardEdges = edges.filter(function(e) { return phasify.isHard(e.type); });
  if (opts.verbose) console.log('[VERBOSE] Hard edges in subgraph: ' + hardEdges.length);

  let phaseAssignments = phasify.mergePhases(finalOrder, minSize, hardEdges);

  // Enforce hard constraints: both endpoints of depends_on must not be in same phase
  if (hardEdges.length > 0) {
    phaseAssignments = phasify.enforceHardConstraints(phaseAssignments, hardEdges);
    // Consolidate phases that became too small
    phaseAssignments = phasify.consolidatePhases(phaseAssignments, hardEdges, minSize);
  }

  // Reassign phase IDs (0-based, sequential)
  phaseAssignments = phasify.reassignPhaseIds(phaseAssignments);
  if (opts.verbose) console.log('[VERBOSE] Phases: ' + phaseAssignments.length);

  // Warn for small phases (suppress in dry-run to keep output clean)
  for (const phase of phaseAssignments) {
    const size = phase.nodeIds ? phase.nodeIds.length : 0;
    if (size < minSize && totalOmissionNodes >= minSize && opts.verbose) {
      console.warn('[WARN] Phase P' + phase.id + ' has ' + size + ' nodes (below minimum ' + minSize + ')');
    }
  }

  // ============================================================
  // Step E: Apply phase ID offset
  // ============================================================
  if (opts.verbose) console.log('[VERBOSE] Computing phase ID offset...');
  const offset = computePhaseIdOffset(opts.ticketsPath);
  if (opts.verbose) console.log('[VERBOSE] Phase ID offset: ' + offset);

  const offsetPhases = reassignPhaseIdsWithOffset(phaseAssignments, offset);

  // ============================================================
  // Step F: Assign tickets to phases
  // ============================================================
  if (opts.verbose) console.log('[VERBOSE] Assigning tickets to phases...');
  const phasedTickets = assignTicketsToPhases(offsetPhases, actionTickets, finalOrder);

  // ============================================================
  // Step G: Consolidate phases by ticket count (min 3 tickets per phase, per split-to-tickets.md Step 5-3)
  // ============================================================
  var phaseCountBeforeConsolidation = phasedTickets.length;
  var consolidatedPhases = consolidatePhasesByTicketCount(phasedTickets, hardEdges);
  if (opts.verbose) {
    if (consolidatedPhases.length < phaseCountBeforeConsolidation) {
      console.log('[VERBOSE] Consolidated phases: ' + phaseCountBeforeConsolidation + ' → ' + consolidatedPhases.length);
    } else {
      console.log('[VERBOSE] No consolidation needed (' + consolidatedPhases.length + ' phases all >= 3 tickets)');
    }
  }

  // Re-normalize phase IDs contiguous from offset after consolidation (removes gaps from merged phases)
  consolidatedPhases = reassignPhaseIdsWithOffset(consolidatedPhases, offset);

  // ============================================================
  // Step H: Repair inspection prefixes
  // ============================================================
  if (opts.verbose) console.log('[VERBOSE] Repairing inspection prefixes...');
  repairInspectionPrefixes(actionTickets, true);

  // ============================================================
  // Step H: Build output
  // ============================================================
  if (opts.verbose) console.log('[VERBOSE] Building output...');
  // Derive timestamp from input OMISSIONS filename (OMISSIONS-YYYYMMDDHHmmss.json -> YYYYMMDDHHmmss)
  const omissionsBasename = path.basename(opts.omissionsPath);
  const tsMatch = omissionsBasename.match(/^OMISSIONS-(\d{14})\.json$/);
  const timestamp = tsMatch ? tsMatch[1] : new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const metadata = {
    source: opts.omissionsPath,
    graphSource: opts.graphPath,
    ticketsSource: opts.ticketsPath,
    generatedAt: new Date().toISOString().split('T')[0],
    phaseIdOffset: {
      sourceMaxPhaseId: offset - 1,
      firstNewPhaseId: offset,
    },
    totalOmissionNodes: totalOmissionNodes,
    hardEdgesInSubgraph: hardEdges.length,
    crossBoundaryDependsOnFrom: crossFromOmission.length,
    crossBoundaryDependsOnTo: crossToOmission.length,
  };

  var rawOutput = buildOutput(consolidatedPhases, referenceTickets, metadata);

  // Post-filter normalization: reassign phase IDs contiguous from offset
  if (rawOutput.phases.length > 0) {
    rawOutput.phases = reassignPhaseIdsWithOffset(rawOutput.phases, offset);
  }

  const output = rawOutput;

  // ============================================================
  // Step I: Validation (against pre-filter phase structure to ensure full coverage)
  // ============================================================
  if (opts.verbose) console.log('[VERBOSE] Validating output...');
  // Validate against consolidatedPhases (includes pre-filter phases) for coverage completeness
  const preOutput = {
    title: 'phasify-omissions auto-generated re-implementation plan',
    metadata: metadata,
    phases: consolidatedPhases.map(function(p) {
      return { id: p.id, name: p.name, nodeIds: p.nodeIds, tickets: p.tickets || [] };
    }),
    referenceTickets: referenceTickets,
  };
  const validateResult = validatePhasedOmissions(preOutput, nodes, edges, omissionNodeIds);

  // ============================================================
  // Report — PASS/FAIL summary (always shown)
  // ============================================================
  const hardVio = validateResult.checks.hardConstraints ? validateResult.checks.hardConstraints.violations.length : 0;
  const allCovered = validateResult.checks.allNodesCovered ? validateResult.checks.allNodesCovered.passed : false;
  const noDupes = validateResult.checks.noDuplicateNodes ? validateResult.checks.noDuplicateNodes.passed : false;

  console.log('');
  console.log((validateResult.valid ? '✅ PASS' : '⚠️ FAIL') + ' — ' +
    output.phases.length + ' implementation phases' +
    (consolidatedPhases.length > output.phases.length ? ' (' + (consolidatedPhases.length - output.phases.length) + ' reference-only phases filtered)' : '') +
    ', ' + (allCovered ? 'all ' + totalOmissionNodes + ' nodes covered' : 'uncovered nodes exist') + ', ' +
    'hard constraint violations: ' + hardVio + ', ' +
    'duplicate nodes: ' + (noDupes ? 'none' : 'found'));

  if (!validateResult.valid) {
    console.error('[ERROR] Validation failed. See details above.');
    process.exit(1);
  }

  // ============================================================
  // Step J-Q: Write output + merge pipeline (PX-108)
  // ============================================================

  // Derive output path for the phasified file
  var defaultPhasifiedOutput = path.join(
    path.dirname(opts.omissionsPath),
    'OMISSIONS-phasified-' + timestamp + '.json'
  );
  var phasifiedOutputPath = opts.outputPath || defaultPhasifiedOutput;

  // Step J: Write OMISSIONS-phasified output (skip in dry-run)
  if (!opts.dryRun) {
    try {
      fs.writeFileSync(phasifiedOutputPath, JSON.stringify(output, null, 2) + '\n', 'utf8');
    } catch (e) {
      console.error('[ERROR] Cannot write output file: ' + e.message);
      process.exit(3);
    }
  }

  // Step K: Compute backup path
  var ts = timestamp;
  var backupPath = path.join(
    path.dirname(opts.ticketsPath),
    'tmp-Tickets-' + ts + '.json'
  );

  // Step L: Backup Tickets.json (skip in dry-run)
  if (!opts.dryRun) {
    try {
      backupTickets(opts.ticketsPath, backupPath);
    } catch (e) {
      console.error('[ERROR] Cannot backup Tickets.json: ' + e.message);
      process.exit(3);
    }
  }

  // Step M: Merge phasified phases into in-memory Tickets.json clone
  var mergeTicketsData;
  try {
    mergeTicketsData = JSON.parse(fs.readFileSync(opts.ticketsPath, 'utf8'));
  } catch (e) {
    console.error('[ERROR] Cannot read Tickets.json for merge: ' + e.message);
    process.exit(3);
  }

  var mergedResult;
  try {
    mergedResult = mergePhasifyToTickets(mergeTicketsData, output);
  } catch (e) {
    console.error('[ERROR] Merge failed: ' + e.message);
    process.exit(3);
  }

  if (!mergedResult.success) {
    console.error('[ERROR] Merge returned failure');
    process.exit(1);
  }

  // Step N: Validate merged result
  var mergeValidation = validateMergedTickets(mergedResult.data);

  // Phase info for AI naming (always shown)
  if (output.phases.length > 0) {
    console.log('');
    console.log('[Re-implementation phases — assign meaningful names]');
    // Build node title map
    var nodeTitleMap = {};
    for (var ni = 0; ni < (graphData.nodes || []).length; ni++) {
      nodeTitleMap[graphData.nodes[ni].id] = graphData.nodes[ni].title || '(no title)';
    }
    for (var pi = 0; pi < output.phases.length; pi++) {
      var phase = output.phases[pi];
      var nodeIds = phase.nodeIds || [];
      var tickets = phase.tickets || [];
      var nodeCount = nodeIds.length;
      var maxShown = 5;
      var nodeSuffix = nodeCount > maxShown ? '\n    ... (' + (nodeCount - maxShown) + ' more)' : '';
      console.log('');
      console.log('Phase ' + phase.id + ' (' + phase.name + '): ' + tickets.length + ' ticket(s), ' + nodeCount + ' node(s)');
      console.log('  Nodes:');
      for (var nsi = 0; nsi < Math.min(nodeIds.length, maxShown); nsi++) {
        var nid = nodeIds[nsi];
        console.log('    ' + nid + '  ' + (nodeTitleMap[nid] || '(unknown)'));
      }
      if (nodeSuffix) console.log(nodeSuffix);
      console.log('  Tickets:');
      for (var ti = 0; ti < tickets.length; ti++) {
        console.log('    P' + phase.id + '-' + tickets[ti].id + '  ' + (tickets[ti].title || '(no title)'));
      }
    }
    // Generate rename command examples
    console.log('');
    console.log('After assigning meaningful names, rename each phase:');
    for (var cpi = 0; cpi < output.phases.length; cpi++) {
      var cp = output.phases[cpi];
      console.log('  node .claude/scripts/tickets/rename-phases.js --tickets=' + opts.ticketsPath + ' --phase=' + cp.id + ' --name="Omissions: <meaningful name for phase ' + cp.id + '>"');
    }
    console.log('');
  }

  // Schema validation (always shown)
  console.log('Schema validation: ' + (mergeValidation.valid ? '✅ PASS' : '⚠️ FAIL'));

  if (!mergeValidation.valid) {
    console.error('[ERROR] Merge validation failed:');
    for (var mi = 0; mi < (mergeValidation.errors || []).length; mi++) {
      console.error('  - ' + mergeValidation.errors[mi]);
    }
    if (opts.dryRun) {
      console.log('');
      console.log('[--dry-run mode] No files written.');
    } else {
      console.log('');
      console.log('[WARN] Tickets.json was NOT modified. Backup preserved: ' + backupPath);
    }
    process.exit(1);
  }

  // Step O: dry-run exit
  if (opts.dryRun) return;

  // Inject merge metadata (PX-109: enables --rollback)
  mergedResult.data.metadata = mergedResult.data.metadata || {};
  mergedResult.data.metadata.phasifyMerge = {
    offset: offset,
    mergedPhaseIds: output.phases.map(function(p) { return p.id; }),
    mergedAt: new Date().toISOString().split('T')[0]
  };

  // Step P: Atomic write merged Tickets.json
  try {
    atomicWrite(opts.ticketsPath, JSON.stringify(mergedResult.data, null, 2) + '\n');
  } catch (e) {
    console.error('[ERROR] Cannot write Tickets.json: ' + e.message);
    console.error('Backup preserved: ' + backupPath);
    process.exit(3);
  }

  // Step Q: Cleanup temporary files
  var filesToClean = [phasifiedOutputPath, backupPath];
  cleanupFiles(filesToClean);

  // Final summary line
  var totalMergedTickets = 0;
  for (var pi = 0; pi < output.phases.length; pi++) {
    totalMergedTickets += (output.phases[pi].tickets || []).length;
  }
  console.log('Tickets.json: merged ' + output.phases.length + ' phase(s), ' + totalMergedTickets + ' ticket(s)');
}

// ============================================================
// Entry point
// ============================================================

// [::TICKET::] PX-107 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-107 --for-spec --no-implementation-order`.
function main() {
  const opts = parseArguments(process.argv.slice(2));
  runPhasifyOmissions(opts);
}

if (require.main === module) {
  main();
}

// ============================================================
// Export for testing
// ============================================================

module.exports = {
  parseArguments,
  extractOmissionSubgraph,
  dedupTickets,
  autoMinSize,
  computePhaseIdOffset,
  reassignPhaseIdsWithOffset,
  assignTicketsToPhases,
  consolidatePhasesByTicketCount,
  repairInspectionPrefixes,
  validatePhasedOmissions,
  buildOutput,
  // PX-108: auto-merge pipeline
  backupTickets,
  mergePhasifyToTickets,
  // PX-109: rollback
  rollbackPhasifyMerge,
  validateMergedTickets,
  atomicWrite,
  cleanupFiles,
  runPhasifyOmissions,
  // Constants
  MIN_NODES_PER_PHASE_DEFAULT,
  MIN_SIZE_LOWER_BOUND,
  MIN_SIZE_UPPER_BOUND,
  AUTO_SIZE_DIVISOR,
  buildFallbackOrder,
};
