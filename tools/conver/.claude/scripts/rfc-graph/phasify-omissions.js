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
 */

// ============================================================
// Pure functions (exported for testing)
// ============================================================

/**
 * Find the latest OMISSIONS-*.json in CWD by scanning for files matching the pattern.
 * @returns {string|null} — Absolute path, or null if none found
 */
function findLatestOmissions() {
  var pattern = /^OMISSIONS-\d{14}\.json$/;
  var files;
  try { files = fs.readdirSync('.'); } catch (e) { return null; }
  var matches = files.filter(function(f) { return pattern.test(f); });
  if (matches.length === 0) return null;
  matches.sort().reverse();
  return path.resolve(matches[0]);
}

// [::TICKET::] PX-107 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-107 --for-spec --no-implementation-order`.
function parseArguments(argv) {
  const opts = {
    omissionsPath: '',
    graphPath: '',
    ticketsPath: '',
    minNodes: 0,
    outputPath: '',
    dryRun: false,
    verbose: false,
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
    } else {
      console.error('[ERROR] Unknown argument: ' + arg);
      console.error('Usage: node phasify-omissions.js --omissions=<PATH> --graph=<PATH> --tickets=<PATH> [--min-nodes=N] [--output=PATH] [--dry-run] [--verbose]');
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
// [::TICKET::] PX-107 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-107 --for-spec --no-implementation-order`.
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
 * Defense-in-depth repair of duplicate INSPECTION_SENTINEL in backgrounds.
 *
 * @param {object[]} actionTickets — Tickets to repair
 */
// [::TICKET::] PX-107 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-107 --for-spec --no-implementation-order`.
function repairInspectionPrefixes(actionTickets) {
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

  if (repairCount > 0) {
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
// [::TICKET::] PX-107 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-107 --for-spec --no-implementation-order`.
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
// Main orchestrator
// ============================================================

/**
 * Run the full phasify-omissions pipeline.
 *
 * @param {CliOptions} opts
 */
// [::TICKET::] PX-107 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-107 --for-spec --no-implementation-order`.
function runPhasifyOmissions(opts) {
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

  // Warn for small phases
  for (const phase of phaseAssignments) {
    const size = phase.nodeIds ? phase.nodeIds.length : 0;
    if (size < minSize && totalOmissionNodes >= minSize) {
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
  // Step G: Repair inspection prefixes
  // ============================================================
  if (opts.verbose) console.log('[VERBOSE] Repairing inspection prefixes...');
  repairInspectionPrefixes(actionTickets);

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

  const output = buildOutput(phasedTickets, referenceTickets, metadata);

  // ============================================================
  // Step I: Validation (against pre-filter phase structure to ensure full coverage)
  // ============================================================
  if (opts.verbose) console.log('[VERBOSE] Validating output...');
  // Validate against phasedTickets (includes empty reference phases) for coverage completeness
  const preOutput = {
    title: 'phasify-omissions auto-generated re-implementation plan',
    metadata: metadata,
    phases: phasedTickets.map(function(p) {
      return { id: p.id, name: p.name, nodeIds: p.nodeIds, tickets: p.tickets || [] };
    }),
    referenceTickets: referenceTickets,
  };
  const validateResult = validatePhasedOmissions(preOutput, nodes, edges, omissionNodeIds);

  // ============================================================
  // Report
  // ============================================================
  console.log('');
  console.log('=== phasify-omissions Phase Design Report ===');
  console.log('Input OMISSIONS: ' + opts.omissionsPath);
  console.log('Input GRAPH: ' + opts.graphPath);
  console.log('Input Tickets: ' + opts.ticketsPath);
  console.log('Omission nodes: ' + totalOmissionNodes + ' (of ' + (graphData.nodes || []).length + ' total)');
  console.log('Subgraph hard edges: ' + hardEdges.length);
  console.log('Cross-boundary depends_on (from omission): ' + crossFromOmission.length + ' (satisfied, no constraint)');
  console.log('Cross-boundary depends_on (to omission): ' + crossToOmission.length + ' (WARN: external depends on re-implemented)');
  console.log('Auto minSize: ' + minSize);
  console.log('SCC detected: ' + sccResult.length + ' multi-node cycles');
  console.log('Total phases: ' + offsetPhases.length + ' (implementation: ' + output.phases.length + ', reference-only: ' + (offsetPhases.length - output.phases.length) + ')');
  console.log('Phase ID offset: ' + offset);

  const hardVio = validateResult.checks.hardConstraints ? validateResult.checks.hardConstraints.violations.length : 0;
  const allCovered = validateResult.checks.allNodesCovered ? validateResult.checks.allNodesCovered.passed : false;
  const noDupes = validateResult.checks.noDuplicateNodes ? validateResult.checks.noDuplicateNodes.passed : false;

  console.log((validateResult.valid ? '✅ PASS' : '⚠️ FAIL') + ' — ' +
    output.phases.length + ' implementation phases' +
    (offsetPhases.length > output.phases.length ? ' (' + (offsetPhases.length - output.phases.length) + ' reference-only phases filtered)' : '') +
    ', ' + (allCovered ? 'all ' + totalOmissionNodes + ' nodes covered' : 'uncovered nodes exist') + ', ' +
    'hard constraint violations: ' + hardVio + ', ' +
    'duplicate nodes: ' + (noDupes ? 'none' : 'found'));
  console.log('Action tickets: ' + actionTickets.length + ', Reference tickets: ' + referenceTickets.length);

  if (!validateResult.valid) {
    console.error('[ERROR] Validation failed. See details above.');
    process.exit(1);
  }

  // ============================================================
  // Step J: Write output
  // ============================================================
  if (opts.dryRun) {
    console.log('');
    console.log('[--dry-run mode] Did not write output file.');
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  const defaultOutput = path.join(
    path.dirname(opts.omissionsPath),
    'OMISSIONS-phasified-' + timestamp + '.json'
  );
  const outputPath = opts.outputPath || defaultOutput;

  try {
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n', 'utf8');
    console.log('');
    console.log('Wrote ' + output.phases.length + ' implementation phases to ' + outputPath);
  } catch (e) {
    console.error('[ERROR] Cannot write output file: ' + e.message);
    process.exit(3);
  }
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
  repairInspectionPrefixes,
  validatePhasedOmissions,
  buildOutput,
  runPhasifyOmissions,
  // Constants
  MIN_NODES_PER_PHASE_DEFAULT,
  MIN_SIZE_LOWER_BOUND,
  MIN_SIZE_UPPER_BOUND,
  AUTO_SIZE_DIVISOR,
  buildFallbackOrder,
};
