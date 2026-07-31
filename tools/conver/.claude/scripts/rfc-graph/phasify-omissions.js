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
      const text = bg || ''; const count = (text.match(/\[::INSPECTION_FLAGGED::\]/g) || []).length;
      if (count <= 1) return text; const lastIndex = text.lastIndexOf('[::INSPECTION_FLAGGED::]'); return text.slice(lastIndex);
    },
  };
} catch (e) {
  _repairSentinel = {
    sentinel: '[::INSPECTION_FLAGGED::]',
    repair: function(bg) { const text = bg || ''; const count = (text.match(/\[::INSPECTION_FLAGGED::\]/g) || []).length; if (count <= 1) return text; const lastIndex = text.lastIndexOf('[::INSPECTION_FLAGGED::]'); return text.slice(lastIndex); },
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

// [::TICKET::] PX-107, PX-108, PX-109, PX-115 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-107|PX-108|PX-109|PX-115) --for-spec --no-implementation-order`.
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

  // Rollback mode is self-contained: it restores Tickets.json from a snapshot and
  // does not need OMISSIONS or GRAPH inputs.
  if (opts.rollback) {
    return opts;
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

  // PX-113: Re-number ticket IDs sequentially within each phase.
  // Original t.id is only unique within its source phase; after reallocation
  // multiple tickets from different source phases may share the same id.
  // Sequential re-numbering guarantees uniqueness in the target phase.
  for (const phase of phases) {
    const tickets = phaseTickets[phase.id] || [];
    for (let ti = 0; ti < tickets.length; ti++) {
      tickets[ti].id = ti + 1;
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
 * Reassign ticket id and phaseId after phase consolidation.
 * id: sequential within phaseId (1-based integer, per tickets-schema.json).
 * Mirrors consolidate-phase-tickets.js renumberTicketIds — the re-index IDs
 * substep (5-3-5) of split-to-tickets.md Step 5-3. Without this, tickets merged
 * from multiple source phases would collide on id (all 1).
 *
 * @param {Array<{id:number, nodeIds:string[], tickets:object[]}>} phases — Phases with tickets
 * @returns {Array} — New phases with tickets renumbered (immutable)
 */
// [::TICKET::] PX-115: re-index IDs after consolidation. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-115 --for-spec --no-implementation-order`.
// [::TICKET::] PX-115 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-115 --for-spec --no-implementation-order`.
function renumberTicketIdsInPhases(phases) {
  if (!Array.isArray(phases)) return [];

  return phases.map(function(phase) {
    var newTickets = (phase.tickets || []).map(function(ticket, index) {
      return Object.assign({}, ticket, { id: index + 1, phaseId: phase.id });
    });
    return Object.assign({}, phase, { tickets: newTickets });
  });
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
// [::TICKET::] PX-107, PX-108, PX-113 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-107|PX-108|PX-113) --for-spec --no-implementation-order`.
function buildOutput(phases, referenceTickets, metadata) {
  // PX-113: Deep clone preserves ALL fields — no whitelist, no field loss
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
          var out = JSON.parse(JSON.stringify(t));
          out.status = 'todo';
          return out;
        }),
      };
    }),
    referenceTickets: referenceTickets.map(function(t) {
      var out = JSON.parse(JSON.stringify(t));
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
// PX-111: Pre-merge snapshot + auto-review
// ============================================================

/**
 * Return true when a ticket status is a round-aware marker such as 'R1' or 'R10'.
 * Existing markers must be preserved so the round in which a ticket was marked
 * remains observable after later phasify-omissions runs.
 *
 * @param {string} status — Ticket status value
 * @returns {boolean} — True when status already carries a round marker
 */
function isRoundMarked(status) {
  return typeof status === 'string' && /^R[1-9]\d*$/.test(status);
}

/**
 * Mark pre-offset tickets that do not yet carry a round marker with the
 * round-aware status 'R' + round, preserving tickets already marked R<round> so
 * the round in which each ticket was processed is retained. New omission tickets
 * (phase.id >= offset) remain 'todo'. Pure function — deep-clones input, no side effects.
 *
 * @param {object} mergedData — Merged Tickets.json with phases[{id, tickets}]
 * @param {number} offset — Phase ID offset; phases with id < offset are pre-merge
 * @param {number} round — Current round number (>= 1); unmarked pre-merge tickets get 'R' + round
 * @returns {object} — Deep-cloned Tickets.json with pre-offset tickets round-aware
 */
// [::TICKET::] PX-111: pre-merge snapshot + auto-review. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-111 --for-spec --no-implementation-order`.
// [::TICKET::] PX-111 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-111 --for-spec --no-implementation-order`.
// [::TICKET::] PX-114 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-114 --for-spec --no-implementation-order`.
function markPreMergeTicketsReviewed(mergedData, offset, round) {
  if (!mergedData || typeof mergedData !== 'object') {
    throw new Error('mergedData must be a non-null object');
  }
  if (typeof offset !== 'number') {
    throw new Error('offset must be a number');
  }
  if (typeof round !== 'number' || round < 1) {
    throw new Error('round must be a number >= 1');
  }

  var result = JSON.parse(JSON.stringify(mergedData));

  for (var pi = 0; pi < result.phases.length; pi++) {
    var phase = result.phases[pi];
    if (phase.id >= offset) continue; // skip new omission phases

    var tickets = phase.tickets || [];
    for (var ti = 0; ti < tickets.length; ti++) {
      if (!isRoundMarked(tickets[ti].status)) {
        tickets[ti].status = 'R' + round;
      }
    }
  }

  return result;
}

/**
 * Advance the round counter by 1 in Tickets.json data.
 * Pure function — deep-clones input, no side effects.
 * A missing round field defaults to 1, then increments to 2.
 *
 * @param {object} ticketsData — Parsed Tickets.json
 * @returns {object} — Deep-cloned Tickets.json with round incremented (default 1 -> 2)
 */
// [::TICKET::] PX-114 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-114 --for-spec --no-implementation-order`.
function incrementRound(ticketsData) {
  if (!ticketsData || typeof ticketsData !== 'object') {
    throw new Error('ticketsData must be a non-null object');
  }
  var result = JSON.parse(JSON.stringify(ticketsData));
  var current = typeof result.round === 'number' && result.round >= 1 ? result.round : 1;
  result.round = current + 1;
  return result;
}

/**
 * Create a timestamped snapshot of Tickets.json.
 * Best-effort — never throws. Caller must handle failure gracefully.
 *
 * @param {string} sourcePath — Absolute path to Tickets.json
 * @param {string} ts — Timestamp string (YYYYMMDDhhmmss)
 * @returns {{ success: boolean, snapshotPath?: string }}
 */
// [::TICKET::] PX-111: pre-merge snapshot + auto-review. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-111 --for-spec --no-implementation-order`.
// [::TICKET::] PX-111 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-111 --for-spec --no-implementation-order`.
function createSnapshot(sourcePath, ts) {
  try {
    if (!fs.existsSync(sourcePath)) return { success: false };
    var snapshotPath = path.join(path.dirname(sourcePath), 'Tickets-' + ts + '.json');
    fs.copyFileSync(sourcePath, snapshotPath);
    return { success: true, snapshotPath: snapshotPath };
  } catch (e) {
    return { success: false };
  }
}

// ============================================================
// PX-112: Move artifacts to omissions/ and tickets/ dirs
// ============================================================

// [::TICKET::] PX-112: move artifacts. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-112 --for-spec --no-implementation-order`.
// [::TICKET::] PX-112 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-112 --for-spec --no-implementation-order`.
function moveArtifacts(opts, phasifiedPath, snapshotPath, ts) {
  try {
    var baseDir = path.dirname(opts.ticketsPath);

    // 1. Move OMISSIONS-phasified-*.json to omissions/
    if (phasifiedPath) {
      fs.mkdirSync(path.join(baseDir, 'omissions'), { recursive: true });
      if (fs.existsSync(phasifiedPath)) {
        var dstPhasified = path.join(baseDir, 'omissions', path.basename(phasifiedPath));
        fs.renameSync(phasifiedPath, dstPhasified);
        console.log('Moved to omissions/: ' + path.basename(phasifiedPath));
      }
    }

    // 2. Move Tickets-*.json (snapshot) to tickets/
    if (snapshotPath) {
      fs.mkdirSync(path.join(baseDir, 'tickets'), { recursive: true });
      if (fs.existsSync(snapshotPath)) {
        var dstSnapshot = path.join(baseDir, 'tickets', path.basename(snapshotPath));
        fs.renameSync(snapshotPath, dstSnapshot);
        console.log('Moved to tickets/: ' + path.basename(snapshotPath));
      }
    }

    // 3. Delete tmp-Tickets-*.json (rollback backup, no longer needed)
    if (ts) {
      var backupPath = path.join(baseDir, 'tmp-Tickets-' + String(ts) + '.json');
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath);
      }
    }

    // 4. Move OMISSIONS-*.json (raw inspection archive) to omissions/
    if (opts && opts.omissionsPath) {
      var omBasename = path.basename(opts.omissionsPath);
      if (/^OMISSIONS-\d{14}\.json$/.test(omBasename) && fs.existsSync(opts.omissionsPath)) {
        var dstOm = path.join(baseDir, 'omissions', omBasename);
        fs.renameSync(opts.omissionsPath, dstOm);
        console.log('Moved to omissions/: ' + omBasename);
      }
    }
  } catch (e) {
    console.warn('[WARN] Artifact move failed (best-effort): ' + e.message);
  }
}

// ============================================================
// PX-109: Rollback function
// ============================================================

/**
 * Resolve the snapshot to restore for a phasify-omissions merge rollback.
 * Priority: metadata.phasifyMerge.snapshotPath, then timestamp-derived
 * tickets/Tickets-<ts>.json, then — for legacy pre-PX-115 merge metadata that
 * carries neither field — the tickets/ archive when it holds exactly one snapshot
 * (unambiguous). The current Tickets.json's phasifyMerge metadata acts as the
 * "HEAD" pointer of an undo stack: each rollback restores the merge's own pre-merge
 * snapshot, and the restored state carries the previous merge's metadata so repeated
 * rollbacks unwind one merge per invocation. Multiple snapshots with no pointer are
 * ambiguous and are never auto-picked (that would break multi-rollback unwinding).
 *
 * @param {object} ticketsData — Parsed Tickets.json with metadata.phasifyMerge
 * @param {string} ticketsDir — Directory containing Tickets.json
 * @returns {string} — Absolute path of the snapshot to restore
 * @throws {Error} If metadata.phasifyMerge is missing or has no resolvable pointer
 */
// [::TICKET::] PX-115: snapshot-based rollback. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-115 --for-spec --no-implementation-order`.
// [::TICKET::] PX-115 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-115 --for-spec --no-implementation-order`.
function resolveSnapshotPath(ticketsData, ticketsDir) {
  var mergeInfo = ticketsData.metadata && ticketsData.metadata.phasifyMerge;
  if (!mergeInfo) {
    throw new Error('No phasifyMerge metadata found. Nothing to roll back.');
  }
  if (mergeInfo.snapshotPath) {
    return path.resolve(ticketsDir, mergeInfo.snapshotPath);
  }
  if (mergeInfo.timestamp) {
    return path.resolve(ticketsDir, 'tickets', 'Tickets-' + mergeInfo.timestamp + '.json');
  }
  // Legacy merge metadata (pre-PX-115) carries only offset/mergedPhaseIds.
  var ticketsDirPath = path.join(ticketsDir, 'tickets');
  if (fs.existsSync(ticketsDirPath)) {
    var snapshots = fs.readdirSync(ticketsDirPath).filter(function(f) {
      return /^Tickets-\d{14}\.json$/.test(f);
    });
    if (snapshots.length === 1) {
      return path.resolve(ticketsDirPath, snapshots[0]);
    }
    if (snapshots.length > 1) {
      throw new Error('Ambiguous legacy merge: multiple snapshots in tickets/ (' + snapshots.join(', ') + '). Add snapshotPath/timestamp to phasifyMerge metadata to disambiguate.');
    }
  }
  throw new Error('No phasifyMerge snapshotPath or timestamp. Nothing to roll back.');
}

/**
 * Roll back a phasify-omissions merge by restoring the pre-merge snapshot.
 * Overwrites Tickets.json with the snapshot content via atomicWrite — a full state
 * restore (round, statuses, phases all revert to the pre-merge state). When the
 * primary snapshotPath is missing, falls back to the timestamp-derived snapshot;
 * if neither exists, aborts with a listing of available tickets/ snapshots rather
 * than blindly picking the newest one (which would break multi-rollback unwinding).
 *
 * @param {string} ticketsPath — Absolute path to Tickets.json
 * @param {boolean} withBackup — Back up the current Tickets.json before restoring
 * @returns {{ success: boolean, snapshotPath: string }}
 * @throws {Error} When no resolvable snapshot exists or the restore fails
 */
// [::TICKET::] PX-115: snapshot-based rollback. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-115 --for-spec --no-implementation-order`.
// [::TICKET::] PX-115 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-115 --for-spec --no-implementation-order`.
function rollbackFromSnapshot(ticketsPath, withBackup) {
  var ticketsDir = path.dirname(ticketsPath);
  var ticketsData;
  try {
    ticketsData = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  } catch (e) {
    throw new Error('Cannot read Tickets.json: ' + e.message);
  }

  var snapshotPath = resolveSnapshotPath(ticketsData, ticketsDir);
  if (!fs.existsSync(snapshotPath)) {
    // Fallback: timestamp-derived snapshot when snapshotPath points to a missing file
    var mergeInfo = ticketsData.metadata && ticketsData.metadata.phasifyMerge;
    var tsCandidate = mergeInfo && mergeInfo.timestamp
      ? path.resolve(ticketsDir, 'tickets', 'Tickets-' + mergeInfo.timestamp + '.json')
      : null;
    if (tsCandidate && tsCandidate !== snapshotPath && fs.existsSync(tsCandidate)) {
      snapshotPath = tsCandidate;
    } else {
      var ticketsListing = '(none)';
      var ticketsDirPath = path.join(ticketsDir, 'tickets');
      if (fs.existsSync(ticketsDirPath)) {
        var snapshots = fs.readdirSync(ticketsDirPath).filter(function(f) {
          return /^Tickets-\d{14}\.json$/.test(f);
        });
        ticketsListing = snapshots.length > 0 ? snapshots.join(', ') : '(none)';
      }
      throw new Error('Snapshot not found: ' + snapshotPath + '. Available tickets/: ' + ticketsListing);
    }
  }

  if (withBackup) {
    var tsMatch = snapshotPath.match(/Tickets-(\d{14})\.json$/);
    var ts = tsMatch ? tsMatch[1] : new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    backupTickets(ticketsPath, path.join(ticketsDir, 'tmp-Tickets-' + ts + '.json'));
  }

  atomicWrite(ticketsPath, fs.readFileSync(snapshotPath, 'utf8'));
  return { success: true, snapshotPath: snapshotPath };
}

// ============================================================
// Main orchestrator
// ============================================================

/**
 * Run the full phasify-omissions pipeline.
 *
 * @param {CliOptions} opts
 */
// [::TICKET::] PX-107, PX-108, PX-109, PX-110, PX-111, PX-112, PX-113, PX-114, PX-115 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-107|PX-108|PX-109|PX-110|PX-111|PX-112|PX-113|PX-114|PX-115) --for-spec --no-implementation-order`.
function runPhasifyOmissions(opts) {
  // ============================================================
  // Rollback mode (PX-109)
  // ============================================================
  if (opts.rollback) {
    if (opts.verbose) console.log('[VERBOSE] Rollback mode (snapshot restore)...');

    var snapshotPath;
    try {
      snapshotPath = resolveSnapshotPath(
        JSON.parse(fs.readFileSync(opts.ticketsPath, 'utf8')),
        path.dirname(opts.ticketsPath)
      );
    } catch (e) {
      console.error('[ERROR] ' + e.message);
      process.exit(1);
    }

    if (opts.dryRun) {
      console.log('');
      console.log('=== Rollback Preview (--dry-run) ===');
      console.log('Snapshot to restore: ' + snapshotPath);
      console.log('No files written.');
      return;
    }

    var rollbackResult;
    try {
      rollbackResult = rollbackFromSnapshot(opts.ticketsPath, !!opts.withBackup);
    } catch (e) {
      console.error('[ERROR] Rollback failed: ' + e.message);
      process.exit(1);
    }

    console.log('');
    console.log('Rollback complete. Restored snapshot: ' + rollbackResult.snapshotPath);
    if (opts.withBackup) {
      var rollbackTsMatch = rollbackResult.snapshotPath.match(/Tickets-(\d{14})\.json$/);
      if (rollbackTsMatch) console.log('Backup: tmp-Tickets-' + rollbackTsMatch[1] + '.json');
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

  // PX-113: No dedupTickets separation — all tickets processed uniformly
  // reference tickets must not be excluded from phase reallocation
  const actionTickets = allTickets;
  const referenceTickets = [];
  const actionTicketKeys = new Set();
  if (opts.verbose) {
    console.log('[VERBOSE] All tickets: ' + actionTickets.length);
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
  if (opts.verbose) console.log('[VERBOSE] Phases before consolidation: ' + phasedTickets.length);
  // PX-115: Restore Step 5-3 consolidation (PX-113 disabled it). Phases with fewer
  // than 3 tickets are merged backward into the following phase, then ticket IDs
  // are re-indexed 1..N within each phase (re-index IDs substep 5-3-5).
  var consolidatedPhases = renumberTicketIdsInPhases(
    consolidatePhasesByTicketCount(phasedTickets, hardEdges)
  );
  if (opts.verbose) {
    console.log('[VERBOSE] Phases (consolidated): ' + consolidatedPhases.length);
  }

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
      console.log('  node .claude/scripts/tickets/rename-phases.js --phase=' + cp.id + ' --name="Omissions: <meaningful name for phase ' + cp.id + '>"');
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

  // Step P: Snapshot + auto-review (PX-111)
  var snapshotResult = createSnapshot(opts.ticketsPath, ts);
  var snapshotPath = snapshotResult.success ? snapshotResult.snapshotPath : null;
  if (snapshotResult.success) {
    console.log('Snapshot: Tickets-' + ts + '.json');
  } else {
    console.warn('[WARN] Snapshot creation failed (best-effort, continuing).');
  }

  // PX-114: record the current round, mark pre-merge tickets with 'R' + round,
  // then advance the round counter so the next cycle starts at round + 1.
  var currentRound = typeof mergedResult.data.round === 'number' && mergedResult.data.round >= 1
    ? mergedResult.data.round
    : 1;
  mergedResult.data = markPreMergeTicketsReviewed(mergedResult.data, offset, currentRound);
  var reviewedCount = 0;
  for (var rpi = 0; rpi < mergedResult.data.phases.length; rpi++) {
    if (mergedResult.data.phases[rpi].id < offset) {
      var rpt = mergedResult.data.phases[rpi].tickets || [];
      for (var rti = 0; rti < rpt.length; rti++) {
        if (isRoundMarked(rpt[rti].status)) reviewedCount++;
      }
    }
  }
  console.log('Round-aware status present on ' + reviewedCount + ' pre-merge tickets (current round R' + currentRound + ').');
  mergedResult.data = incrementRound(mergedResult.data);

  // Inject merge metadata (PX-109: enables --rollback; PX-115: snapshotPath + timestamp)
  mergedResult.data.metadata = mergedResult.data.metadata || {};
  mergedResult.data.metadata.phasifyMerge = {
    offset: offset,
    mergedPhaseIds: output.phases.map(function(p) { return p.id; }),
    mergedAt: new Date().toISOString().split('T')[0],
    timestamp: ts,
    snapshotPath: 'tickets/Tickets-' + ts + '.json'
  };

  // Step P: Atomic write merged Tickets.json
  try {
    atomicWrite(opts.ticketsPath, JSON.stringify(mergedResult.data, null, 2) + '\n');
  } catch (e) {
    console.error('[ERROR] Cannot write Tickets.json: ' + e.message);
    console.error('Backup preserved: ' + backupPath);
    process.exit(3);
  }

  // Step Q: Move artifacts to subdirectories (PX-112)
  moveArtifacts(opts, phasifiedOutputPath, snapshotPath, ts);

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
  renumberTicketIdsInPhases,
  repairInspectionPrefixes,
  validatePhasedOmissions,
  buildOutput,
  // PX-108: auto-merge pipeline
  backupTickets,
  mergePhasifyToTickets,
  // PX-109/PX-115: snapshot-based rollback
  resolveSnapshotPath,
  rollbackFromSnapshot,
  // PX-111: snapshot + auto-review
  markPreMergeTicketsReviewed,
  createSnapshot,
  // PX-114: round-aware status + round counter
  incrementRound,
  // PX-112: move artifacts
  moveArtifacts,
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
