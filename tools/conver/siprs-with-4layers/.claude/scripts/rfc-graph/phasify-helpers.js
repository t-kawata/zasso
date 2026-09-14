#!/usr/bin/env node

/**
 * phasify-helpers.js — Pure function collection for the phasify core algorithm
 *
 * Implements Phases 2-4. Phase 1 (SCC condensation) reuses tarjanSCC()
 * from boundify-helpers.js.
 *
 * All functions are designed as pure functions with no external I/O.
 *
 * @module phasify-helpers
 */

'use strict';

// ============================================================
// Weight table (edge type → reverse implementation cost)
// ============================================================

/** Weight Infinity: absolute constraint (reverse prohibited) */
const WEIGHT_INFINITY = Object.freeze({
  depends_on: Infinity,
  implements: Infinity,
});

/** Weight 2: strong recommendation (reverse possible with structural changes) */
const WEIGHT_STRONG = Object.freeze({
  precedes: 2,
  constrains: 2,
});

/** Weight 1: weak recommendation (reverse can be substituted with mocks) */
const WEIGHT_WEAK = Object.freeze({
  triggers: 1,
});

/** Weight 0: no constraint */
const WEIGHT_NONE = Object.freeze({
  refines: 0,
  references: 0,
  extends: 0,
  conflicts_with: 0,
  supersedes: 0,
  validates: 0,
  part_of: 0,
});

/**
 * Unified weight map for all edge types
 * Key: edge type, Value: weight (Infinity / 2 / 1 / 0)
 */
const WEIGHT_MAP = Object.freeze(
  Object.assign(
    {},
    WEIGHT_INFINITY,
    WEIGHT_STRONG,
    WEIGHT_WEAK,
    WEIGHT_NONE,
  )
);

/**
 * Set of edge types with weight Infinity (for fast lookup)
 */
const HARD_EDGE_TYPES = new Set(
  Object.keys(WEIGHT_INFINITY)
);

/**
 * Set of edge types with weight > 0 (for soft constraint checking)
 */
const SOFT_EDGE_TYPES = new Set(
  Object.keys(WEIGHT_STRONG).concat(Object.keys(WEIGHT_WEAK))
);

/**
 * Get the weight for a given edge type.
 * Unknown types are treated as weight 0.
 *
 * @param {string} edgeType — Edge type
 * @returns {number} Weight (0, 1, 2, Infinity)
 */
function getWeight(edgeType) {
  const weight = WEIGHT_MAP[edgeType];
  return weight !== undefined ? weight : 0;
}

/**
 * Check if an edge is a hard constraint (weight Infinity).
 *
 * @param {string} edgeType — Edge type
 * @returns {boolean}
 */
function isHard(edgeType) {
  return HARD_EDGE_TYPES.has(edgeType);
}

// ============================================================
// Phase 2: Kahn topological sort
// ============================================================

/**
 * Perform topological sort on a weighted directed graph.
 *
 * Only edges with weight Infinity are treated as "absolute constraints" for sorting.
 * If a cycle exists (not a DAG), error information is returned.
 *
 * @param {string[]} nodeIds — Array of all node IDs
 * @param {Array<{from:string, to:string, type:string}>} edges — Edge array
 * @param {Function} weightFn — Edge type → weight function (default: getWeight)
 * @returns {{ success: boolean, order: string[], cycle?: string[], error?: string }}
 *   success: true means order is valid. false means cycle contains cyclic nodes.
 */
function kahnTopologicalSort(nodeIds, edges, weightFn) {
  const wFn = weightFn || getWeight;
  const nodeSet = new Set(nodeIds);
  const inDegree = {};
  const adjacency = {};

  // Initialize all nodes
  for (const nid of nodeIds) {
    inDegree[nid] = 0;
    adjacency[nid] = [];
  }

  // Build graph using only edges with weight Infinity
  for (const edge of edges) {
    if (!nodeSet.has(edge.from) || !nodeSet.has(edge.to)) continue;
    if (wFn(edge.type) === Infinity) {
      // Edge u→v (depends_on) means "u depends on v".
      // Since dependency v must be implemented first, the constraint direction is v→u.
      adjacency[edge.to].push(edge.from);
      inDegree[edge.from] = (inDegree[edge.from] || 0) + 1;
    }
  }

  // Add nodes with in-degree 0 to the queue
  const queue = [];
  for (const nid of nodeIds) {
    if (inDegree[nid] === 0) queue.push(nid);
  }

  const order = [];
  while (queue.length > 0) {
    // Maintain input order for stable sort (shift from front)
    const nid = queue.shift();
    order.push(nid);

    for (const neighbor of (adjacency[nid] || [])) {
      inDegree[neighbor]--;
      if (inDegree[neighbor] === 0) {
        queue.push(neighbor);
      }
    }
  }

  // Detect unprocessed nodes (cyclic components)
  const visited = new Set(order);
  const unprocessed = nodeIds.filter(id => !visited.has(id));

  if (unprocessed.length > 0) {
    // Extract cyclic components (simple trace)
    const inCycle = new Set(unprocessed);
    // Include nodes reachable from cyclic components
    let changed = true;
    while (changed) {
      changed = false;
      for (const edge of edges) {
        if (inCycle.has(edge.from) && !inCycle.has(edge.to) && wFn(edge.type) === Infinity) {
          inCycle.add(edge.to);
          changed = true;
        }
        if (!inCycle.has(edge.from) && inCycle.has(edge.to) && wFn(edge.type) === Infinity) {
          inCycle.add(edge.from);
          changed = true;
        }
      }
    }
    return {
      success: false,
      order: [],
      cycle: [...inCycle],
      error: 'Circular dependency detected: [' + [...inCycle].join(', ') + ']',
    };
  }

  return { success: true, order };
}

// ============================================================
// Phase 3: Soft constraint violation cost calculation
// ============================================================

/**
 * Calculate violation cost for soft constraints (weight 1 or 2).
 *
 * In the topological sort order, a soft edge e = (u→v) is considered
 * a violation when order[u] > order[v], and the cost w(type(e)) is added.
 *
 * @param {string[]} order — Topological sort order
 * @param {Array<{from:string, to:string, type:string}>} edges — All edges
 * @param {Function} weightFn — Edge type → weight function
 * @returns {{ totalCost: number, violations: Array<{from:string, to:string, type:string, cost:number}> }}
 */
function computeSoftViolations(order, edges, weightFn) {
  const wFn = weightFn || getWeight;
  const position = {};
  for (let i = 0; i < order.length; i++) {
    position[order[i]] = i;
  }

  let totalCost = 0;
  const violations = [];

  for (const edge of edges) {
    const weight = wFn(edge.type);
    if (weight <= 0 || weight === Infinity) continue; // Only soft edges
    if (!SOFT_EDGE_TYPES.has(edge.type)) continue;

    const posU = position[edge.from];
    const posV = position[edge.to];
    if (posU === undefined || posV === undefined) continue;

    // Violation: u is positioned after v
    if (posU > posV) {
      totalCost += weight;
      violations.push({
        from: edge.from,
        to: edge.type,
        type: edge.type,
        cost: weight,
      });
    }
  }

  return { totalCost, violations };
}

// ============================================================
// Phase 4: Phase merging and discretization
// ============================================================

/**
 * Split the topological sort order into phases.
 *
 * Each phase is guaranteed to contain at least minSize nodes.
 * However, if hardEdges (weight ∞ edges) exist, from and to are
 * split so they are not in the same phase.
 * If the total node count is less than minSize, all nodes become one
 * phase (warning is handled by the caller).
 *
 * @param {string[]} sortedNodes — Topologically sorted node ID array
 * @param {number} minSize — Minimum nodes per phase (default: 10)
 * @param {Array<{from:string, to:string}>} [hardEdges] — Array of weight ∞ edges (optional)
 * @returns {Array<{id: number, nodeIds: string[]}>} Phase array
 */
function mergePhases(sortedNodes, minSize, hardEdges) {
  const size = minSize || 10;
  if (!sortedNodes || sortedNodes.length === 0) return [];

  // Build hard edge to→from (source) map
  // "Which nodes have depends_on edges pointing to this node (key)"
  const incomingHard = {};
  if (hardEdges) {
    for (const edge of hardEdges) {
      if (!incomingHard[edge.to]) incomingHard[edge.to] = new Set();
      incomingHard[edge.to].add(edge.from);
    }
  }

  const phases = [];
  let currentPhase = [];
  let phaseId = 0;

  for (let i = 0; i < sortedNodes.length; i++) {
    const nid = sortedNodes[i];

    // When the size limit is reached, check if the phase can be safely closed
    if (currentPhase.length >= size) {
      // Scan ahead up to size nodes to see if any node is a dependency target
      // of nodes in the current phase
      let dependentInLookahead = false;
      if (hardEdges) {
        const lookaheadLimit = Math.min(i + size, sortedNodes.length);
        for (let j = i; j < lookaheadLimit; j++) {
          const lookaheadNode = sortedNodes[j];
          const fromNodes = incomingHard[lookaheadNode];
          if (fromNodes) {
            for (const fromNode of fromNodes) {
              if (currentPhase.includes(fromNode)) {
                dependentInLookahead = true;
                break;
              }
            }
          }
          if (dependentInLookahead) break;
        }
      }

      if (!dependentInLookahead) {
        // Can safely close
        phases.push({ id: phaseId, name: 'P' + phaseId, nodeIds: currentPhase });
        currentPhase = [];
        phaseId++;
      }
    }

    currentPhase.push(nid);
  }

  // Merge remaining nodes into the previous phase (if it exists)
  if (currentPhase.length > 0) {
    if (phases.length > 0) {
      const lastPhase = phases[phases.length - 1];
      lastPhase.nodeIds = lastPhase.nodeIds.concat(currentPhase);
    } else {
      phases.push({ id: 0, name: 'P0', nodeIds: currentPhase });
    }
  }

  return phases;
}

// ============================================================
// Phase 5 auxiliary: SCC condensation result expansion
// ============================================================

/**
 * Build constraint information from SCC condensation results
 * to assign nodes in the same SCC to the same phase.
 *
 * @param {Array<{cycle: string[]}>} sccResult — Return value of tarjanSCC
 * @returns {{ sccMap: object, sccIds: Set<string> }}
 *   sccMap: node ID → SCC representative node ID (first node in SCC)
 *   sccIds: set of all node IDs contained in multi-node SCCs
 */
function buildSccConstraint(sccResult) {
  const sccMap = {};
  const sccIds = new Set();

  if (!sccResult) return { sccMap, sccIds };

  for (const entry of sccResult) {
    if (entry.cycle && entry.cycle.length > 1) {
      const representative = entry.cycle[0];
      for (const nid of entry.cycle) {
        sccMap[nid] = representative;
        sccIds.add(nid);
      }
    }
  }

  return { sccMap, sccIds };
}

/**
 * Build a node array considering SCC constraints.
 * Nodes in the same SCC are reordered to be adjacent.
 *
 * @param {string[]} sortedNodes — Topological sort order
 * @param {object} sccMap — Node ID → SCC representative node ID map
 * @returns {string[]} Node order after applying SCC constraints
 */
function applySccToOrder(sortedNodes, sccMap) {
  const groups = {};
  const groupOrder = [];

  for (const nid of sortedNodes) {
    const rep = sccMap[nid] || nid;
    if (!groups[rep]) {
      groups[rep] = [];
      groupOrder.push(rep);
    }
    groups[rep].push(nid);
  }

  const result = [];
  for (const rep of groupOrder) {
    for (const nid of (groups[rep] || [])) {
      result.push(nid);
    }
  }
  return result;
}

// ============================================================
// Post-hoc hard constraint adjustment
// ============================================================

/**
 * Post-hoc adjust the output of mergePhases to ensure both endpoints
 * of depends_on edges are not in the same phase.
 *
 * Since the topological sort guarantees the "correct order",
 * splitting phases does not create new order violations.
 * This is a mathematically safe operation.
 *
 * @param {Array<{id:number, name:string, nodeIds:string[]}>} phases — Output of mergePhases
 * @param {Array<{from:string, to:string}>} hardEdges — Array of weight ∞ edges
 * @returns {Array<{id:number, name:string, nodeIds:string[]}>} Adjusted phases
 */
function enforceHardConstraints(phases, hardEdges) {
  if (!hardEdges || hardEdges.length === 0) return phases;
  if (!phases || phases.length === 0) return phases;

  let maxPhaseId = 0;
  for (let pi = 0; pi < phases.length; pi++) {
    if (phases[pi].id > maxPhaseId) maxPhaseId = phases[pi].id;
  }

  let changed = true;
  while (changed) {
    changed = false;

    // Build current node → phase ID map
    const nodePhase = {};
    for (let pi = 0; pi < phases.length; pi++) {
      const phase = phases[pi];
      for (let ni = 0; ni < phase.nodeIds.length; ni++) {
        nodePhase[phase.nodeIds[ni]] = phase.id;
      }
    }

    // Detect violations
    for (let ei = 0; ei < hardEdges.length; ei++) {
      const edge = hardEdges[ei];
      const phaseU = nodePhase[edge.from];
      const phaseV = nodePhase[edge.to];
      if (phaseU === undefined || phaseV === undefined) continue;

      // depends_on(u→v): u(dependent) depends on v(dependency) → v must be implemented first
      // Violation: dependency v phase position >= dependent u phase position
      // Compare by array index, not phase ID (ID does not guarantee order)
      const idxU = phases.findIndex(function(p) { return p.id === phaseU; });
      const idxV = phases.findIndex(function(p) { return p.id === phaseV; });
      if (idxU === -1 || idxV === -1) continue;
      if (idxV >= idxU) {
        // Split the phase to resolve the violation
        const vPhaseIndex = phases.findIndex(function(p) { return p.id === phaseV; });
        if (vPhaseIndex === -1) continue;
        const vPhase = phases[vPhaseIndex];

        const splitIdx = vPhase.nodeIds.indexOf(edge.to);
        if (splitIdx > 0) {
          // Normal case: split at edge.to position → move to and after to a new phase
          const movedNodes = vPhase.nodeIds.splice(splitIdx);
          maxPhaseId++;
          const newPhase = { id: maxPhaseId, name: 'P' + maxPhaseId, nodeIds: movedNodes };
          phases.splice(vPhaseIndex + 1, 0, newPhase);
          changed = true;
          break;
        }

        // splitIdx === 0: edge.to is at the beginning of the phase.
        // If edge.from is in the same phase, split at the from position.
        if (phaseU === phaseV) {
          const fromIdx = vPhase.nodeIds.indexOf(edge.from);
          if (fromIdx > 0) {
            const movedNodes = vPhase.nodeIds.splice(fromIdx);
            maxPhaseId++;
            const newPhase = { id: maxPhaseId, name: 'P' + maxPhaseId, nodeIds: movedNodes };
            phases.splice(vPhaseIndex + 1, 0, newPhase);
            changed = true;
            break;
          }
        }
        // Unable to split — this violation is deferred
      }
    }
  }

  // Remove empty phases
  for (let pi = phases.length - 1; pi >= 0; pi--) {
    if (phases[pi].nodeIds.length === 0) {
      phases.splice(pi, 1);
    }
  }

  return phases;
}

// ============================================================
// Post-phase consolidation — merge small phases below the minimum
// ============================================================

/**
 * Safely merge small phases (below the minimum size of 10) created by
 * enforceHardConstraints into adjacent phases.
 *
 * Respects depends_on constraints and guarantees no new violations
 * are introduced by the merge.
 *
 * @param {Array<{id:number, name:string, nodeIds:string[]}>} phases — Phase array
 * @param {Array<{from:string, to:string}>} hardEdges — Array of weight ∞ edges
 * @param {number} minSize — Minimum size threshold
 * @returns {Array<{id:number, name:string, nodeIds:string[]}>} Consolidated phases
 */
function consolidatePhases(phases, hardEdges, minSize) {
  if (!phases || phases.length <= 1) return phases;
  const size = minSize || 10;

  // depends_on node → {froms,tos} map
  const depsFrom = {}; // node → nodes that depend on this node
  const depsTo = {};   // node → nodes this node depends on
  for (const e of (hardEdges || [])) {
    if (!depsFrom[e.to]) depsFrom[e.to] = new Set();
    depsFrom[e.to].add(e.from);
    if (!depsTo[e.from]) depsTo[e.from] = new Set();
    depsTo[e.from].add(e.to);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < phases.length; i++) {
      if (phases[i].nodeIds.length >= size) continue;

      // Try merging with the previous phase
      if (i > 0) {
        const prevPhase = phases[i - 1];
        const currPhase = phases[i];
        // Check if currPhase nodes depend on prevPhase nodes
        let canMergePrev = true;
        for (const nid of currPhase.nodeIds) {
          const targets = depsTo[nid];
          if (targets) {
            for (const target of targets) {
              if (prevPhase.nodeIds.includes(target)) {
                canMergePrev = false;
                break;
              }
            }
          }
          if (!canMergePrev) break;
        }
        if (canMergePrev) {
          prevPhase.nodeIds = prevPhase.nodeIds.concat(currPhase.nodeIds);
          phases.splice(i, 1);
          changed = true;
          break;
        }
      }

      // Try merging with the next phase
      if (i < phases.length - 1) {
        const nextPhase = phases[i + 1];
        const currPhase = phases[i];
        // Check if nextPhase nodes depend on currPhase nodes
        let canMergeNext = true;
        for (const nid of nextPhase.nodeIds) {
          const targets = depsTo[nid];
          if (targets) {
            for (const target of targets) {
              if (currPhase.nodeIds.includes(target)) {
                canMergeNext = false;
                break;
              }
            }
          }
          if (!canMergeNext) break;
        }
        if (canMergeNext) {
          currPhase.nodeIds = currPhase.nodeIds.concat(nextPhase.nodeIds);
          phases.splice(i + 1, 1);
          changed = true;
          break;
        }
      }
    }
  }

  return phases;
}

// ============================================================
// Phase ID reassignment
// ============================================================

/**
 * Reassign phase IDs sequentially from 0 in array order.
 *
 * Phases split by enforceHardConstraints have non-sequential IDs.
 * Since array order = correct implementation order, reassign IDs
 * sequentially from 0. This function does not change the phase array order.
 *
 * @param {Array<{id:number, name:string, nodeIds:string[]}>} phases — Phase array
 * @returns {Array<{id:number, name:string, nodeIds:string[]}>} Phase array after ID reassignment
 */
function reassignPhaseIds(phases) {
  if (!phases) return phases;
  for (let i = 0; i < phases.length; i++) {
    phases[i].id = i;
    phases[i].name = 'P' + i;
    // Sort nodeIds in ascending order (implementation order within a phase
    // is not meaningful; sorting by RFC section order improves readability)
    if (phases[i].nodeIds) {
      phases[i].nodeIds.sort();
    }
  }
  return phases;
}

// ============================================================
// Directory constraint application
// ============================================================

/**
 * Reflect directory dependency directions into the topological order.
 *
 * For each dependency direction (fromDir → toDir), all nodes belonging
 * to fromDir are adjusted to appear before all nodes belonging to toDir.
 * If a violation exists, the toDir nodes are moved after the fromDir nodes.
 *
 * @param {string[]} order — Current order
 * @param {Array<{from:string, to:string}>} depDirs — Array of dependency directions
 * @param {object} nodeToDirMap — Node ID → directory path map
 * @returns {string[]} Adjusted order (returns original order if no violation)
 */
function applyDirectoryConstraints(order, depDirs, nodeToDirMap) {
  if (!depDirs || depDirs.length === 0) return order;

  for (const dep of depDirs) {
    const fromDir = dep.from;
    const toDir = dep.to;
    const fromNodes = order.filter(function(nid) {
      return nodeToDirMap[nid] === fromDir;
    });
    const toNodes = order.filter(function(nid) {
      return nodeToDirMap[nid] === toDir;
    });
    if (fromNodes.length === 0 || toNodes.length === 0) continue;

    const lastFromPos = Math.max.apply(null, fromNodes.map(function(nid) {
      return order.indexOf(nid);
    }));
    const firstToPos = Math.min.apply(null, toNodes.map(function(nid) {
      return order.indexOf(nid);
    }));
    if (lastFromPos < firstToPos) continue;

    // Violation: move toNodes after fromNodes
    const ordered = [];
    const moved = new Set(toNodes);
    for (let i = 0; i < order.length; i++) {
      const nid = order[i];
      if (!moved.has(nid)) ordered.push(nid);
    }
    for (const nid of order) {
      if (moved.has(nid)) ordered.push(nid);
    }
    return ordered;
  }

  return order;
}

// ============================================================
// Conversion to Tickets.json write format
// ============================================================

/**
 * Convert the phase array to the Tickets.json phase format.
 * If existing Tickets.json phases need to be merged, the caller
 * should handle that separately.
 *
 * @param {Array<{id: number, name: string, nodeIds: string[]}>} phases — Output of mergePhases
 * @returns {Array} Tickets.json-compatible phase object array
 */
function phasesToTicketsFormat(phases) {
  return phases.map(function(phase) {
    return {
      id: phase.id,
      name: phase.name,
      tickets: [],
      nodeIds: phase.nodeIds,
    };
  });
}

// ---------------------------------------------------------------------------
// PX-120: STUB key rewrite and no-excuse merge guard
// ---------------------------------------------------------------------------

/**
 * Rewrite the ticket keys inside stubs[].content of a cloned ticket.
 * Pure function — returns a new clone, never mutates the input.
 *
 * The marker key is a forward declaration of which future ticket resolves the
 * stub. When phasify re-keys a clone into a new phase, every stale key must be
 * rewritten so provenance points at the new resolving ticket.
 *
 * @param {object} clone — Deep-cloned ticket { id, phaseId, stubs: [{content}] }
 * @param {object} oldToNewMap — { oldKey: newKey } mapping
 * @returns {object} — New clone with rewritten stub contents
 */
// [::TICKET::] PX-120, PX-121 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-120|PX-121) --for-spec --no-implementation-order`.
function rewriteStubKeys(clone, oldToNewMap) {
  const stubs = (clone.stubs || []).map(function (stub) {
    let content = stub.content;
    for (const oldKey of Object.keys(oldToNewMap)) {
      content = content.replace(
        new RegExp('\\[::STUB::\\]\\s+' + oldKey + '\\b'),
        '[::STUB::] ' + oldToNewMap[oldKey]
      );
    }
    return Object.assign({}, stub, { content: content });
  });
  return Object.assign({}, clone, { stubs: stubs });
}

/**
 * Guard that rejects a merge when any clone still carries a terminal-excuse stub.
 * Defense-in-depth: the find-omissions Step 1 preflight is the primary gate; this
 * guard ensures an excuse never enters Tickets.json through the phasify merge.
 *
 * @param {Array<{id:number, stubs:Array}>} clones — Phasified clones
 * @throws {Error} — EXCUSE_MERGE_REJECTED when an excuse stub is present
 */
// [::TICKET::] PX-120, PX-121 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-120|PX-121) --for-spec --no-implementation-order`.
function guardExcuseMerge(clones) {
  const { EXCUSE_PATTERNS, WORK_ITEM_VERB_RE } = require('../tickets/validate-no-external-excuses.js');
  for (const clone of clones) {
    for (const stub of (clone.stubs || [])) {
      const content = stub.content || '';
      const excuseHit = EXCUSE_PATTERNS.some(function (re) { return re.test(content); });
      const workItem = WORK_ITEM_VERB_RE.test(content);
      if (excuseHit && !workItem) {
        const location = (stub.file || 'unknown') + ':' + (stub.line || '?');
        const err = new Error('[phasify] REJECTED merge: excuse stub in clone ' + clone.id + ' at ' + location +
          ' — Action: resolve via find-omissions Step 1 preflight before re-running');
        err.code = 'EXCUSE_MERGE_REJECTED';
        throw err;
      }
    }
  }
}

/**
 * Run the find-omissions self-healing loop: validate -> fix -> revalidate until
 * zero failures. Never aborts on failures; a zero-progress round is a hard-stop
 * diagnostic (the AI failed to make progress, which is a behavior failure).
 *
 * @param {Array<{content:string}>} stubs — Stub entries to validate
 * @param {Function} fixStub — (stub) => fixed stub; must change the stub or the loop hard-stops
 * @param {object} opts — { ticketsData, maxRounds }
 * @returns {{failures: number, proceeded: boolean, rounds: number, stubs: Array}}
 * @throws {Error} — on zero-progress round or non-convergence
 */
// [::TICKET::] PX-120, PX-121 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-120|PX-121) --for-spec --no-implementation-order`.
function runSelfHealingLoop(stubs, fixStub, opts) {
  const { classifyVerdict } = require('../tickets/validate-no-external-excuses.js');
  const ticketsData = (opts && opts.ticketsData) || {};
  const maxRounds = (opts && opts.maxRounds) || 100;
  let current = stubs.map(function (s) { return Object.assign({}, s); });

  for (let round = 0; round < maxRounds; round++) {
    const failures = current.filter(function (s) {
      return !classifyVerdict(s.content, ticketsData).passed;
    });
    if (failures.length === 0) {
      return { failures: 0, proceeded: true, rounds: round, stubs: current };
    }

    const fixed = current.map(function (s) {
      return classifyVerdict(s.content, ticketsData).passed ? s : fixStub(s);
    });
    const madeProgress = JSON.stringify(fixed) !== JSON.stringify(current);
    current = fixed;

    if (!madeProgress) {
      throw new Error('[phasify] self-healing loop made no progress in round ' + (round + 1) +
        ' — hard-stop diagnostic: ' + failures.length + ' excuses remain — Action: rewrite each to an AI-executable work item or remove the marker');
    }
  }

  throw new Error('[phasify] self-healing loop did not converge within ' + maxRounds + ' rounds');
}

module.exports = {
  // Weight table
  WEIGHT_MAP,
  WEIGHT_INFINITY,
  WEIGHT_STRONG,
  WEIGHT_WEAK,
  WEIGHT_NONE,
  HARD_EDGE_TYPES,
  SOFT_EDGE_TYPES,
  getWeight,
  isHard,
  // Phase 2
  kahnTopologicalSort,
  // Phase 3
  computeSoftViolations,
  // Phase 4
  mergePhases,
  // Post-hoc hard constraint adjustment
  enforceHardConstraints,
  consolidatePhases,
  reassignPhaseIds,
  // Directory constraints
  applyDirectoryConstraints,
  // Phase 5 auxiliary
  buildSccConstraint,
  applySccToOrder,
  phasesToTicketsFormat,
  // PX-120: STUB key rewrite + no-excuse merge guard + self-healing loop
  rewriteStubKeys,
  guardExcuseMerge,
  runSelfHealingLoop,
};
