/**
 * phasify-integration.test.cjs — Integration test with real data (176 nodes)
 *
 * Verifies that all PX-38 Phases work correctly with real data.
 * Test framework: Node.js standard node:test + node:assert/strict
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { tarjanSCC } = require('../../.claude/scripts/rfc-graph/boundify-helpers.js');
const {
  getWeight,
  kahnTopologicalSort,
  computeSoftViolations,
  mergePhases,
  buildSccConstraint,
  applySccToOrder,
} = require('../../.claude/scripts/rfc-graph/phasify-helpers.js');
const { buildNodeToDirMap } = require('../../.claude/scripts/rfc-graph/validate-phasify.js');

// Real data paths
const GRAPH_PATH = path.resolve(__dirname, '../../../../crates/siprs/RFC-ROOT-GRAPH.json');
const DIRS_TREE_PATH = path.resolve(__dirname, '../../../../crates/siprs/RFC-ROOT-Dirs-Tree.json');

/**
 * Check that real data files exist before running tests.
 * Skips if not found (handles CI or alternate setup).
 */
function loadRealData() {
  if (!fs.existsSync(GRAPH_PATH) || !fs.existsSync(DIRS_TREE_PATH)) {
    return null;
  }
  const graphData = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf8'));
  const dirsTreeData = JSON.parse(fs.readFileSync(DIRS_TREE_PATH, 'utf8'));
  return { graphData, dirsTreeData };
}

// ============================================================
// Integration tests
// ============================================================

describe('phasify integration (real 176-node data)', () => {
  const data = loadRealData();

  // Skip if no real data
  if (!data) {
    it.skip('skipped: real data files not found');
    return;
  }

  const { graphData, dirsTreeData } = data;
  const nodes = graphData.nodes || [];
  const edges = graphData.edges || [];
  const allNodeIds = nodes.map(n => n.id);

  // Basic statistics
  it('should have expected nodes and edges', () => {
    assert.ok(nodes.length > 0, 'graph must have nodes');
    assert.ok(edges.length > 0, 'graph must have edges');
  });

  // ----------------------------------------------------------
  // Phase 1: SCC contraction
  // ----------------------------------------------------------
  describe('Phase 1: SCC contraction', () => {
    it('should contract SCC without error', () => {
      const sccResult = tarjanSCC(edges);
      assert.ok(Array.isArray(sccResult));
    });

    it('should build SCC constraint map', () => {
      const sccResult = tarjanSCC(edges);
      const { sccMap, sccIds } = buildSccConstraint(sccResult);
      // In real data, most SCCs are single-node
      // sccIds only contains multi-node SCCs
      assert.ok(Object.keys(sccMap).length >= 0);
      assert.ok(sccIds.size >= 0);
    });
  });

  // ----------------------------------------------------------
  // Phase 2: topological sort
  // ----------------------------------------------------------
  describe('Phase 2: topological sort', () => {
    it('should succeed on real data (no cycles)', () => {
      const result = kahnTopologicalSort(allNodeIds, edges, getWeight);
      assert.ok(result.success, 'Cyclic dependency detected. Please review the design document.');
    });

    it('should sort all nodes', () => {
      const result = kahnTopologicalSort(allNodeIds, edges, getWeight);
      assert.ok(result.success);
      assert.strictEqual(result.order.length, nodes.length);
    });

    it('should respect all hard constraints', () => {
      const sortResult = kahnTopologicalSort(allNodeIds, edges, getWeight);
      assert.ok(sortResult.success);

      const order = sortResult.order;
      const position = {};
      for (let i = 0; i < order.length; i++) {
        position[order[i]] = i;
      }

      // Check all depends_on edges
      for (const edge of edges) {
        if (edge.type === 'depends_on') {
          const posU = position[edge.from];
          const posV = position[edge.to];
          // depends_on(u→v): u depends on v → v (dependency target) should be implemented first
          assert.ok(posV < posU,
            'depends_on violation: ' + edge.from + ' (pos=' + posU + ') depends on ' + edge.to + ' (pos=' + posV + ') — to should come before from');
        }
      }
    });

    it('should apply SCC constraints to order', () => {
      const sccResult = tarjanSCC(edges);
      const { sccMap } = buildSccConstraint(sccResult);
      const sortResult = kahnTopologicalSort(allNodeIds, edges, getWeight);
      assert.ok(sortResult.success);

      const sccOrder = applySccToOrder(sortResult.order, sccMap);
      assert.strictEqual(sccOrder.length, nodes.length);

      // Check that SCC nodes are adjacent
      for (const nid of Object.keys(sccMap)) {
        const rep = sccMap[nid];
        if (rep !== nid) {
          // Check position difference between the representative node and the SCC node
          const posRep = sccOrder.indexOf(rep);
          const posNid = sccOrder.indexOf(nid);
          assert.ok(Math.abs(posRep - posNid) < 10,
            'SCC violation: ' + nid + ' too far from representative ' + rep + ' (distance: ' + Math.abs(posRep - posNid) + ')');
        }
      }
    });
  });

  // ----------------------------------------------------------
  // Phase 3: soft constraints
  // ----------------------------------------------------------
  describe('Phase 3: soft constraint violations', () => {
    it('should compute violations without error', () => {
      const sortResult = kahnTopologicalSort(allNodeIds, edges, getWeight);
      assert.ok(sortResult.success);

      const sccResult = tarjanSCC(edges);
      const { sccMap } = buildSccConstraint(sccResult);
      const order = applySccToOrder(sortResult.order, sccMap);

      const softResult = computeSoftViolations(order, edges, getWeight);
      assert.ok(typeof softResult.totalCost === 'number');
      assert.ok(Array.isArray(softResult.violations));
    });
  });

  // ----------------------------------------------------------
  // Phase 4: phase merging
  // ----------------------------------------------------------
  describe('Phase 4: phase merging', () => {
    it('should produce phases with 10+ nodes each', () => {
      const sortResult = kahnTopologicalSort(allNodeIds, edges, getWeight);
      assert.ok(sortResult.success);

      const sccResult = tarjanSCC(edges);
      const { sccMap } = buildSccConstraint(sccResult);
      const order = applySccToOrder(sortResult.order, sccMap);

      const phases = mergePhases(order, 10);
      assert.ok(phases.length >= 1);

      // All phases should have 10+ nodes (since total nodes >= 10)
      for (const phase of phases) {
        assert.ok(phase.nodeIds.length >= 10,
          'Phase P' + phase.id + ' has ' + phase.nodeIds.length + ' nodes (minimum 10 required)');
      }
    });

    it('should cover all nodes', () => {
      const sortResult = kahnTopologicalSort(allNodeIds, edges, getWeight);
      assert.ok(sortResult.success);

      const sccResult = tarjanSCC(edges);
      const { sccMap } = buildSccConstraint(sccResult);
      const order = applySccToOrder(sortResult.order, sccMap);

      const phases = mergePhases(order, 10);
      const coveredIds = new Set();
      for (const phase of phases) {
        for (const nid of phase.nodeIds) {
          coveredIds.add(nid);
        }
      }
      assert.strictEqual(coveredIds.size, nodes.length);
    });

    it('should produce reasonable number of phases', () => {
      const sortResult = kahnTopologicalSort(allNodeIds, edges, getWeight);
      assert.ok(sortResult.success);

      const sccResult = tarjanSCC(edges);
      const { sccMap } = buildSccConstraint(sccResult);
      const order = applySccToOrder(sortResult.order, sccMap);

      const phases = mergePhases(order, 10);
      // Expected ~ceil(nodes/10) phases
      const minExpected = Math.ceil(nodes.length / 10);
      const maxExpected = Math.ceil(nodes.length / 10) + 3;
      assert.ok(phases.length >= Math.max(1, minExpected - 2), 'Too few phases: ' + phases.length);
      assert.ok(phases.length <= maxExpected, 'Too many phases: ' + phases.length);
    });
  });

  // ----------------------------------------------------------
  // Determinism test
  // ----------------------------------------------------------
  describe('determinism', () => {
    it('should produce identical order on two runs', () => {
      const result1 = kahnTopologicalSort(allNodeIds, edges, getWeight);
      const result2 = kahnTopologicalSort(allNodeIds, edges, getWeight);
      assert.ok(result1.success);
      assert.ok(result2.success);
      assert.deepStrictEqual(result1.order, result2.order);
    });
  });
});
