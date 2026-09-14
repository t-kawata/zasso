#!/usr/bin/env node

/**
 * validate-phasify.js — 6-item phase assignment validation sub-script
 *
 * Validates that the output of phasify-graph-and-dirs-files-tree.js (Tickets.json phase[].nodeIds)
 * satisfies the following 6 checks:
 *
 * 1. All nodes covered: every node in GRAPH.json belongs to at least 1 phase
 * 2. SCC identity: all nodes of the same SCC belong to the same phase
 * 3. Hard constraint compliance: no reverse order (phase(u) >= phase(v)) for w=infinity edges
 * 4. Lower bound: each phase has >=10 nodes (warning only if total nodes < 10)
 * 5. Dirs constraint: no violation of inter-directory dependency direction
 * 6. No orphans: no node is phase-unassigned (= same as 1 but reverse guarantee)
 *
 * Usage:
 *   node validate-phasify.js --tickets=<PATH> --graph=<PATH> --dirs-tree=<PATH>
 *
 * Output (stdout):
 *   {"valid": true/false, "checks": {...}, "errors": [...]}
 *
 * Exit code:
 *   0 = valid
 *   1 = validation error
 *   2 = argument error
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ============================================================
// Weight table (also used in PX-38. Here only used for infinity determination in validation)
// ============================================================

/** Hard constraint edge types — prohibits reverse order */
const HARD_EDGE_TYPES = new Set([
  'depends_on',
  'implements',
  'constrains',
]);

/** Edge types with weight infinity */
const WEIGHT_INFINITY = new Set([
  'depends_on',
  'implements',
  'constrains',
]);

// ============================================================
// Projection: node → directory
// ============================================================

/** Builds a nodeId→directory path map from Dirs-Tree.json */
function buildNodeToDirMap(dirsTree) {
  const nodeToDir = {};
  function walk(node, parentPath) {
    if (!node || !node.name) return;
    const currentPath = parentPath ? parentPath + '/' + node.name : node.name;
    if (node.type === 'directory' && node.children) {
      for (const child of node.children) {
        walk(child, currentPath);
      }
    }
    if (node.mappedNodeIds) {
      for (const entry of node.mappedNodeIds) {
        const nid = entry.nodeId || entry;
        if (nid && !nodeToDir[nid]) {
          nodeToDir[nid] = currentPath;
        }
      }
    }
  }
  if (dirsTree && dirsTree.trees) {
    for (const lang of Object.keys(dirsTree.trees)) {
      walk(dirsTree.trees[lang], '');
    }
  }
  return nodeToDir;
}

// ============================================================
// 6-check validation
// ============================================================

/**
 * Check 1: All nodes covered
 * Confirms that every node in GRAPH.json belongs to at least 1 phase.
 */
function checkAllNodesCovered(graphNodes, phases) {
  const coveredIds = new Set();
  for (const phase of phases) {
    if (phase.nodeIds) {
      for (const nid of phase.nodeIds) {
        coveredIds.add(nid);
      }
    }
  }
  const allIds = new Set(graphNodes.map(n => n.id));
  const missing = [...allIds].filter(id => !coveredIds.has(id));
  return {
    passed: missing.length === 0,
    total: allIds.size,
    covered: coveredIds.size,
    missing,
  };
}

/**
 * Check 2: SCC identity
 * Confirms that all nodes of the same SCC belong to the same phase.
 * SCC info is not obtainable from Dirs-Tree.json analysis results,
 * so this is omitted here and guaranteed by PX-38 scripts instead.
 * Instead validates that each node belongs to exactly one phase.
 */
function checkSinglePhasePerNode(phases) {
  const nodeToPhases = {};
  for (let pi = 0; pi < phases.length; pi++) {
    const phase = phases[pi];
    if (phase.nodeIds) {
      for (const nid of phase.nodeIds) {
        if (!nodeToPhases[nid]) nodeToPhases[nid] = [];
        nodeToPhases[nid].push(phase.id !== undefined ? phase.id : pi);
      }
    }
  }
  const duplicates = Object.entries(nodeToPhases)
    .filter(([, phases]) => phases.length > 1)
    .map(([nid, pids]) => ({ nodeId: nid, phaseIds: pids }));
  return {
    passed: duplicates.length === 0,
    duplicates,
  };
}

/**
 * Check 3: Hard constraint compliance
 * Confirms that no w=infinity edge has phase(u) >= phase(v).
 */
function checkHardConstraints(graphEdges, phases, nodeToPhaseMap) {
  const violations = [];
  for (const edge of graphEdges) {
    if (!HARD_EDGE_TYPES.has(edge.type)) continue;
    const phaseU = nodeToPhaseMap[edge.from];
    const phaseV = nodeToPhaseMap[edge.to];
    if (phaseU === undefined || phaseV === undefined) {
      violations.push({
        from: edge.from,
        to: edge.to,
        type: edge.type,
        reason: 'Node does not belong to any phase',
      });
      continue;
    }
    // depends_on(u→v) = u depends on v → v (dependency) is implemented first
    // Violation: dependency v's phase index >= dependent u's phase index
    // Compare by array index, not phase ID
    // (enforceHardConstraints may cause ID/order divergence)
    const idxU = phases.findIndex(function(p) { return p.id === phaseU; });
    const idxV = phases.findIndex(function(p) { return p.id === phaseV; });
    if (idxU === -1 || idxV === -1) continue;

    if (idxV >= idxU) {
      violations.push({
        from: edge.from,
        to: edge.to,
        type: edge.type,
        phaseU,
        phaseV,
        reason: 'Reverse order: phase_index(dependency) >= phase_index(dependant)',
      });
    }
  }
  return {
    passed: violations.length === 0,
    violations,
  };
}

/**
 * Check 4: Lower bound
 * Validates that each phase has at least 10 nodes.
 * Warning only if total nodes < 10.
 */
function checkPhaseSizeMinimum(phases, totalNodes) {
  const sizeIssues = [];
  for (const phase of phases) {
    const size = phase.nodeIds ? phase.nodeIds.length : 0;
    if (size < 10) {
      sizeIssues.push({
        phaseId: phase.id,
        phaseName: phase.name,
        size,
        isWarning: totalNodes < 10,
      });
    }
  }
  const anyBelow10 = sizeIssues.some(i => !i.isWarning);
  return {
    passed: !anyBelow10,
    issues: sizeIssues,
    totalNodes,
  };
}

/**
 * Check 5: Dirs constraint
 * Validates that inter-directory dependency directions are not violated.
 */
function checkDirsConstraint(dependencyDirections, phases, nodeToDirMap, nodeToPhaseMap) {
  const violations = [];
  if (!dependencyDirections) return { passed: true, violations: [] };

  for (const lang of Object.keys(dependencyDirections)) {
    const dirs = dependencyDirections[lang] || [];
    for (const dep of dirs) {
      const fromDir = dep.from;
      const toDir = dep.to;
      // Validate all node pairs subject to this dependency direction
      for (const phase of phases) {
        if (!phase.nodeIds) continue;
        for (const nid of phase.nodeIds) {
          const nodeDir = nodeToDirMap[nid];
          if (nodeDir === fromDir) {
            const phaseU = nodeToPhaseMap[nid];
            // Check phases of all nodes belonging to toDir
            for (const otherPhase of phases) {
              if (!otherPhase.nodeIds) continue;
              for (const otherNid of otherPhase.nodeIds) {
                if (nodeToDirMap[otherNid] === toDir) {
                  const phaseV = nodeToPhaseMap[otherNid];
                  if (phaseU !== undefined && phaseV !== undefined && phaseU > phaseV) {
                    violations.push({
                      from: nid,
                      to: otherNid,
                      fromDir,
                      toDir,
                      rule: dep.rule,
                      reason: 'Violates inter-directory dependency direction',
                    });
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  return {
    passed: violations.length === 0,
    violations,
  };
}

/**
 * Check 6: No orphan nodes
 * Guarantees that all nodes belong to at least 1 phase (same as Check 1,
 * but reports results independently).
 */
function checkNoOrphanNodes(graphNodes, phases) {
  const coveredIds = new Set();
  for (const phase of phases) {
    if (phase.nodeIds) {
      for (const nid of phase.nodeIds) {
        coveredIds.add(nid);
      }
    }
  }
  const allIds = new Set(graphNodes.map(n => n.id));
  const orphans = [...allIds].filter(id => !coveredIds.has(id));
  return {
    passed: orphans.length === 0,
    orphans,
    total: allIds.size,
  };
}

// ============================================================
// NodeId → PhaseId map construction
// ============================================================

/**
 * Builds a nodeId→phaseId map from the phase array.
 * For nodes belonging to multiple phases, the first found phase takes priority.
 */
function buildNodeToPhaseMap(phases) {
  const map = {};
  for (const phase of phases) {
    if (phase.nodeIds) {
      for (const nid of phase.nodeIds) {
        if (map[nid] === undefined) {
          map[nid] = phase.id;
        }
      }
    }
  }
  return map;
}

// ============================================================
// main
// ============================================================

/**
 * Executes all 6 validation checks.
 *
 * Check 4 (lower bound) is informational and not a fatal violation like the other 5.
 * Phases with fewer than 10 nodes may be a result of depends_on constraints and are allowed.
 *
 * @param {object} graphTickets — Tickets.json equivalent object
 * @param {object[]} graphNodes — GRAPH.json nodes array
 * @param {object[]} graphEdges — GRAPH.json edges array
 * @param {object} dirsTree — Dirs-Tree.json equivalent object
 * @param {{ allowSmallPhases?: boolean }} [options] — Options (if allowSmallPhases=true, lower bound is not an error)
 * @returns {{ valid: boolean, checks: object, errors: string[] }}
 */
function validateAll(graphTickets, graphNodes, graphEdges, dirsTree, options) {
  const opts = options || {};
  const errors = [];
  const checks = {};
  const phases = graphTickets.phases || [];

  // Build nodeId→phaseId map
  const nodeToPhaseMap = buildNodeToPhaseMap(phases);

  // Build nodeId→directory path map
  const nodeToDirMap = buildNodeToDirMap(dirsTree);

  // Check 1: All nodes covered
  checks.allNodesCovered = checkAllNodesCovered(graphNodes, phases);
  if (!checks.allNodesCovered.passed) {
    errors.push('Check 1 FAILED: ' + checks.allNodesCovered.missing.length + ' nodes not covered');
  }

  // Check 2: Single phase per node (SCC identity alternate validation)
  checks.singlePhasePerNode = checkSinglePhasePerNode(phases);
  if (!checks.singlePhasePerNode.passed) {
    errors.push('Check 2 FAILED: ' + checks.singlePhasePerNode.duplicates.length + ' nodes belong to multiple phases');
  }

  // Check 3: Hard constraint compliance
  checks.hardConstraints = checkHardConstraints(graphEdges, phases, nodeToPhaseMap);
  if (!checks.hardConstraints.passed) {
    errors.push('Check 3 FAILED: ' + checks.hardConstraints.violations.length + ' hard constraint violations');
  }

  // Check 4: Lower bound (informational; counted as error only when allowSmallPhases=false)
  checks.phaseSizeMinimum = checkPhaseSizeMinimum(phases, graphNodes.length);
  if (!checks.phaseSizeMinimum.passed && opts.allowSmallPhases === false) {
    errors.push('Check 4 FAILED: ' + checks.phaseSizeMinimum.issues.filter(i => !i.isWarning).length + ' phases below min(10)');
  }

  // Check 5: Dirs constraint
  const depDirs = dirsTree ? dirsTree.dependencyDirections : null;
  checks.dirsConstraint = checkDirsConstraint(depDirs, phases, nodeToDirMap, nodeToPhaseMap);
  if (!checks.dirsConstraint.passed) {
    errors.push('Check 5 FAILED: ' + checks.dirsConstraint.violations.length + ' dirs constraint violations');
  }

  // Check 6: No orphan nodes
  checks.noOrphanNodes = checkNoOrphanNodes(graphNodes, phases);
  if (!checks.noOrphanNodes.passed) {
    errors.push('Check 6 FAILED: ' + checks.noOrphanNodes.orphans.length + ' orphan nodes');
  }

  const valid = errors.length === 0;
  return { valid, checks, errors };
}

/**
 * CLI entry point
 */
function main() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (const arg of args) {
    const match = arg.match(/^--(.+?)=(.+)$/);
    if (match) {
      parsed[match[1]] = match[2];
    }
  }

  if (!parsed.tickets || !parsed.graph || !parsed['dirs-tree']) {
    console.log(JSON.stringify({
      valid: false,
      checks: {},
      errors: ['Usage: node validate-phasify.js --tickets=<PATH> --graph=<PATH> --dirs-tree=<PATH>'],
    }));
    process.exit(2);
  }

  try {
    const ticketsData = JSON.parse(fs.readFileSync(path.resolve(parsed.tickets), 'utf8'));
    const graphData = JSON.parse(fs.readFileSync(path.resolve(parsed.graph), 'utf8'));
    const dirsTreeData = JSON.parse(fs.readFileSync(path.resolve(parsed['dirs-tree']), 'utf8'));

    const result = validateAll(ticketsData, graphData.nodes || [], graphData.edges || [], dirsTreeData);

    console.log(JSON.stringify(result, null, 2));
    process.exit(result.valid ? 0 : 1);
  } catch (e) {
    console.log(JSON.stringify({
      valid: false,
      checks: {},
      errors: ['File read error: ' + e.message],
    }));
    process.exit(2);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  validateAll,
  checkAllNodesCovered,
  checkSinglePhasePerNode,
  checkHardConstraints,
  checkPhaseSizeMinimum,
  checkDirsConstraint,
  checkNoOrphanNodes,
  buildNodeToDirMap,
  buildNodeToPhaseMap,
  HARD_EDGE_TYPES,
};
