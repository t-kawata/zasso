// [::TICKET::] PX-177, PX-188, PX-192, PX-202 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-177|PX-188|PX-192) --for-spec --no-implementation-order`.
/**
 * Dependency graph checks (§11.4).
 *
 * Edges are oriented consumer -> direct dependency. The module reports unknown
 * references, self loops, duplicate edges, layer/forbidden violations, and
 * cycles (with an explicit cycle path), and computes a topological order for
 * acyclic graphs.
 */
import { LAYER_FORBIDDEN_TARGETS, PRODUCTION_KINDS } from './workspace-model.mjs';

/**
 * Detect cycles in a directed graph.
 *
 * @param {Array<string>} nodeIds - node identifiers
 * @param {Array<{ from: string, to: string }>} edges - directed edges
 * @returns {Array<{ path: string[] }>} one entry per distinct cycle
 */
export function detectCycles(nodeIds, edges) {
  const adjacency = new Map(nodeIds.map((id) => [id, []]));
  for (const edge of edges) {
    if (adjacency.has(edge.from) && adjacency.has(edge.to)) {
      adjacency.get(edge.from).push(edge.to);
    }
  }
  const nodeSet = new Set(nodeIds);
  const visited = new Set();
  const cycles = [];

  for (const start of nodeSet) {
    if (visited.has(start)) {
      continue;
    }
    const path = [];
    const inPath = new Set();
    const stack = [{ node: start, neighborIndex: 0 }];
    visited.add(start);
    inPath.add(start);
    path.push(start);

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const neighbors = adjacency.get(frame.node) ?? [];
      if (frame.neighborIndex < neighbors.length) {
        const nextNode = neighbors[frame.neighborIndex++];
        if (inPath.has(nextNode)) {
          const cycleStart = path.indexOf(nextNode);
          cycles.push({ path: path.slice(cycleStart).concat(nextNode) });
        } else if (!visited.has(nextNode)) {
          visited.add(nextNode);
          inPath.add(nextNode);
          path.push(nextNode);
          stack.push({ node: nextNode, neighborIndex: 0 });
        }
      } else {
        stack.pop();
        inPath.delete(frame.node);
        path.pop();
      }
    }
  }
  return cycles;
}

/**
 * Run all DAG checks and return a report matching the manifest dag_report shape.
 *
 * @param {{ packages: Array<object>, edges: Array<object>, forbiddenEdges?: Array<object> }} input
 * @returns {object} dag report with counts and a topological order
 */
export function runDagChecks({ packages, edges, forbiddenEdges = [] }) {
  const nodeIds = (packages ?? []).map((pkg) => pkg.id);
  const nodeSet = new Set(nodeIds);
  const packageById = new Map((packages ?? []).map((pkg) => [pkg.id, pkg]));
  const edgeList = edges ?? [];

  const unknownDependencyCount = edgeList.filter((edge) => !nodeSet.has(edge.from) || !nodeSet.has(edge.to)).length;
  const selfLoopCount = edgeList.filter((edge) => edge.from === edge.to).length;

  const seenKeys = new Set();
  let duplicateEdgeCount = 0;
  for (const edge of edgeList) {
    const key = `${edge.from}->${edge.to}`;
    if (seenKeys.has(key)) {
      duplicateEdgeCount++;
    } else {
      seenKeys.add(key);
    }
  }

  const forbiddenPairSet = new Set(forbiddenEdges.map((edge) => `${edge.from}->${edge.to}`));
  let layerViolationCount = 0;
  let forbiddenEdgeCount = 0;
  // A count alone cannot be repaired: the operator needs the pair and the reason.
  const forbiddenEdgeReasons = [];
  for (const edge of edgeList) {
    if (!nodeSet.has(edge.from) || !nodeSet.has(edge.to)) {
      continue;
    }
    const fromPackage = packageById.get(edge.from);
    const toPackage = packageById.get(edge.to);
    const violatesLayer = violatesLayerRule(fromPackage, toPackage);
    const explicitForbidden = forbiddenPairSet.has(`${edge.from}->${edge.to}`);
    if (violatesLayer) {
      layerViolationCount++;
      forbiddenEdgeReasons.push(`normal edge ${edge.from}->${edge.to} breaks the layer rule: ${fromPackage?.layer} must not depend on ${toPackage?.layer}`);
    }
    if (explicitForbidden) {
      forbiddenEdgeReasons.push(`the pair ${edge.from}->${edge.to} is declared both as a normal edge and as a forbidden edge`);
    }
    if (violatesLayer || explicitForbidden) {
      forbiddenEdgeCount++;
    }
  }

  const cycleList = detectCycles(nodeIds, edgeList);
  const topologicalOrder = kahnTopologicalOrder(nodeSet, edgeList);

  return {
    node_count: nodeIds.length,
    edge_count: edgeList.length,
    // How many forbidden declarations reached the check. Without this the gate cannot
    // tell "no forbidden edge was declared" from "the declarations never arrived".
    declared_forbidden_edge_count: forbiddenEdges.length,
    unknown_dependency_count: unknownDependencyCount,
    self_loop_count: selfLoopCount,
    duplicate_edge_count: duplicateEdgeCount,
    forbidden_edge_count: forbiddenEdgeCount,
    forbidden_edge_reasons: forbiddenEdgeReasons,
    layer_violation_count: layerViolationCount,
    cycle_count: cycleList.length,
    cycles: cycleList,
    topological_order: topologicalOrder,
    canonical_edges: canonicalizeEdges(edgeList),
    implementation_order: computeImplementationOrder(nodeSet, edgeList, cycleList.length),
  };
}

/** Order edges by consumer then provider so the persisted proof is comparable run to run. */
export function canonicalizeEdges(edges) {
  return [...(edges ?? [])]
    .map((edge) => ({ from: edge.from, to: edge.to }))
    .sort((left, right) => (left.from === right.from ? left.to.localeCompare(right.to) : left.from.localeCompare(right.from)));
}

/**
 * Derive the order in which packages must be implemented.
 *
 * A package's depth is 0 when it depends on nothing and 1 + (deepest provider's
 * depth) otherwise, so every provider sits in an earlier wave than each of its
 * consumers. Waves make the parallel-safe groups explicit, and each wave is
 * sorted by package id so the result is stable.
 *
 * @param {Set<string>} nodeSet - package ids
 * @param {Array<{ from: string, to: string }>} edges - consumer -> provider edges
 * @param {number} cycleCount - a cyclic graph has no implementation order
 * @returns {{ serial: string[], levels: string[][] }}
 */
function computeImplementationOrder(nodeSet, edges, cycleCount) {
  if (cycleCount > 0) {
    return { serial: [], levels: [] };
  }
  const providersByConsumer = new Map([...nodeSet].map((id) => [id, []]));
  for (const edge of edges) {
    if (nodeSet.has(edge.from) && nodeSet.has(edge.to) && edge.from !== edge.to) {
      providersByConsumer.get(edge.from).push(edge.to);
    }
  }

  const depthByNode = new Map();
  const depthOf = (nodeId) => {
    if (depthByNode.has(nodeId)) {
      return depthByNode.get(nodeId);
    }
    depthByNode.set(nodeId, 0); // Guards against a cycle reintroduced by filtering.
    const providerDepths = providersByConsumer.get(nodeId).map((providerId) => depthOf(providerId));
    const depth = providerDepths.length === 0 ? 0 : Math.max(...providerDepths) + 1;
    depthByNode.set(nodeId, depth);
    return depth;
  };

  const levels = [];
  for (const nodeId of nodeSet) {
    const depth = depthOf(nodeId);
    levels[depth] = levels[depth] ?? [];
    levels[depth].push(nodeId);
  }
  const sortedLevels = levels.map((level) => [...(level ?? [])].sort());
  return { serial: sortedLevels.flat(), levels: sortedLevels };
}

function violatesLayerRule(fromPackage, toPackage) {
  const forbiddenTargets = LAYER_FORBIDDEN_TARGETS[fromPackage.layer];
  if (forbiddenTargets && forbiddenTargets.has(toPackage.layer)) {
    return true;
  }
  if (PRODUCTION_KINDS.has(fromPackage.kind) && toPackage.kind === 'conformance') {
    return true;
  }
  return false;
}

function kahnTopologicalOrder(nodeSet, edges) {
  const inDegree = new Map([...nodeSet].map((id) => [id, 0]));
  const adjacency = new Map([...nodeSet].map((id) => [id, []]));
  const validEdges = edges.filter((edge) => nodeSet.has(edge.from) && nodeSet.has(edge.to) && edge.from !== edge.to);
  for (const edge of validEdges) {
    if (edge.from === edge.to) {
      continue;
    }
    adjacency.get(edge.from).push(edge.to);
    inDegree.set(edge.to, inDegree.get(edge.to) + 1);
  }
  const queue = [...nodeSet].filter((id) => inDegree.get(id) === 0).sort();
  const order = [];
  while (queue.length > 0) {
    const node = queue.shift();
    order.push(node);
    for (const neighbor of adjacency.get(node)) {
      inDegree.set(neighbor, inDegree.get(neighbor) - 1);
      if (inDegree.get(neighbor) === 0) {
        queue.push(neighbor);
      }
    }
  }
  return order;
}
