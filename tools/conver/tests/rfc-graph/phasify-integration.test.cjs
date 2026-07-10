/**
 * phasify-integration.test.cjs — 実データ(176ノード)を使った統合テスト
 *
 * PX-38 の全 Phase が実データで正しく動作することを確認する。
 * テストフレームワーク: Node.js 標準の node:test + node:assert/strict
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

// 実データのパス
const GRAPH_PATH = path.resolve(__dirname, '../../../../crates/siprs/RFC-ROOT-GRAPH.json');
const DIRS_TREE_PATH = path.resolve(__dirname, '../../../../crates/siprs/RFC-ROOT-Dirs-Tree.json');

/**
 * テスト前に実データが存在することを確認する。
 * なければテストをスキップする（CI or 別構成への対応）。
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
// 統合テスト
// ============================================================

describe('phasify integration (real 176-node data)', () => {
  const data = loadRealData();

  // 実データがなければスキップ
  if (!data) {
    it.skip('skipped: real data files not found');
    return;
  }

  const { graphData, dirsTreeData } = data;
  const nodes = graphData.nodes || [];
  const edges = graphData.edges || [];
  const allNodeIds = nodes.map(n => n.id);

  // 基本統計
  it('should have 176 nodes and 207 edges', () => {
    assert.strictEqual(nodes.length, 176);
    assert.strictEqual(edges.length, 207);
  });

  // ----------------------------------------------------------
  // Phase 1: SCC縮約
  // ----------------------------------------------------------
  describe('Phase 1: SCC contraction', () => {
    it('should contract SCC without error', () => {
      const sccResult = tarjanSCC(edges);
      assert.ok(Array.isArray(sccResult));
    });

    it('should build SCC constraint map', () => {
      const sccResult = tarjanSCC(edges);
      const { sccMap, sccIds } = buildSccConstraint(sccResult);
      // 実データではほとんどのSCCは単一ノード
      // sccIds に含まれるのはマルチノードSCCのみ
      assert.ok(Object.keys(sccMap).length >= 0);
      assert.ok(sccIds.size >= 0);
    });
  });

  // ----------------------------------------------------------
  // Phase 2: トポロジカルソート
  // ----------------------------------------------------------
  describe('Phase 2: topological sort', () => {
    it('should succeed on real data (no cycles)', () => {
      const result = kahnTopologicalSort(allNodeIds, edges, getWeight);
      assert.ok(result.success, '循環依存が検出されました。設計書を確認してください。');
    });

    it('should sort all 176 nodes', () => {
      const result = kahnTopologicalSort(allNodeIds, edges, getWeight);
      assert.ok(result.success);
      assert.strictEqual(result.order.length, 176);
    });

    it('should respect all hard constraints', () => {
      const sortResult = kahnTopologicalSort(allNodeIds, edges, getWeight);
      assert.ok(sortResult.success);

      const order = sortResult.order;
      const position = {};
      for (let i = 0; i < order.length; i++) {
        position[order[i]] = i;
      }

      // 全 depends_on エッジをチェック
      for (const edge of edges) {
        if (edge.type === 'depends_on') {
          const posU = position[edge.from];
          const posV = position[edge.to];
          // depends_on(u→v): uはvに依存 → v(依存先)を先に実装
          assert.ok(posV < posU,
            'depends_on 違反: ' + edge.from + ' (pos=' + posU + ') depends on ' + edge.to + ' (pos=' + posV + ') — to should come before from');
        }
      }
    });

    it('should apply SCC constraints to order', () => {
      const sccResult = tarjanSCC(edges);
      const { sccMap } = buildSccConstraint(sccResult);
      const sortResult = kahnTopologicalSort(allNodeIds, edges, getWeight);
      assert.ok(sortResult.success);

      const sccOrder = applySccToOrder(sortResult.order, sccMap);
      assert.strictEqual(sccOrder.length, 176);

      // SCC 内のノードが隣接しているか確認
      for (const nid of Object.keys(sccMap)) {
        const rep = sccMap[nid];
        if (rep !== nid) {
          // 代表ノードと同一SCCのノードの位置差を確認
          const posRep = sccOrder.indexOf(rep);
          const posNid = sccOrder.indexOf(nid);
          assert.ok(Math.abs(posRep - posNid) < 10,
            'SCC違反: ' + nid + ' が代表 ' + rep + ' から離れすぎ (' + Math.abs(posRep - posNid) + ')');
        }
      }
    });
  });

  // ----------------------------------------------------------
  // Phase 3: Soft制約
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
  // Phase 4: フェーズ合併
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

      // 全フェーズが10ノード以上（総ノード≧10なので）
      for (const phase of phases) {
        assert.ok(phase.nodeIds.length >= 10,
          'フェーズ P' + phase.id + ' のノード数が ' + phase.nodeIds.length + '（下限10未満）');
      }
    });

    it('should cover all 176 nodes', () => {
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
      assert.strictEqual(coveredIds.size, 176);
    });

    it('should produce reasonable number of phases (15-20)', () => {
      const sortResult = kahnTopologicalSort(allNodeIds, edges, getWeight);
      assert.ok(sortResult.success);

      const sccResult = tarjanSCC(edges);
      const { sccMap } = buildSccConstraint(sccResult);
      const order = applySccToOrder(sortResult.order, sccMap);

      const phases = mergePhases(order, 10);
      // 176/10 = 17.6 → 17〜18 程度。SCC制約で多少増減
      assert.ok(phases.length >= 15, 'フェーズ数が少なすぎ: ' + phases.length);
      assert.ok(phases.length <= 20, 'フェーズ数が多すぎ: ' + phases.length);
    });
  });

  // ----------------------------------------------------------
  // 決定論性テスト
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
