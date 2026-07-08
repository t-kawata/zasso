/**
 * acceptance-criteria.test.cjs — graphify-rfc のAcceptance Criteria検証テスト
 *
 * テストフレームワーク: Node.js 標準の node:test + node:assert/strict
 * 既存の基盤スクリプト（verify.js / query.js）の公開関数を
 * monkey-patch して、RFC-GRAPHIFY.md で定義されたAcceptance Criteriaを検証する。
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// ============================================================
// AC 1: verify.js カバレッジ検証
// ============================================================

describe('AC1: verify.js カバレッジ検証', () => {
  it('カバレッジ100%で {"ok":true} を返す', () => {
    const { checkCoverage } = require('../../.claude/scripts/rfc-graph/verify.js');

    // ## 見出しがなく、headingRefs も空 → 全見出しがカバー済み
    const sourceLines = [
      '# テスト要件',
      '',
      '要件1: ログイン機能',
    ];

    const nodes = [
      { id: 'N0001', headingRefs: [{ refId: 'REF001', heading: 1, texts: ['テスト要件'] }]},
      { id: 'N0002', headingRefs: [{ refId: 'REF002', heading: 1, texts: ['要件1'] }]},
    ];

    const result = checkCoverage(sourceLines, nodes);

    assert.equal(result.covered, true);
    assert.deepEqual(result.uncoveredHeadings, []);
  });

  it('未カバー見出しがある場合に ok:false を返す', () => {
    const { checkCoverage } = require('../../.claude/scripts/rfc-graph/verify.js');

    // ## API は見出しだが、どのノードの headingRefs も "API" を含まない
    const sourceLines = [
      '# テスト要件',
      '要件1: ログイン機能',
      '',
      '## API',
    ];

    const nodes = [
      { id: 'N0001', headingRefs: [{ refId: 'REF001', heading: 2, texts: ['要件'] }]},
    ];

    const result = checkCoverage(sourceLines, nodes);

    assert.equal(result.covered, false);
    assert.deepEqual(result.uncoveredHeadings, ['API']);
  });

  it('孤立ノードがある場合に ok:false を返す', () => {
    const { checkIsolated } = require('../../.claude/scripts/rfc-graph/verify.js');

    const nodes = [
      { id: 'N0001' },
      { id: 'N0002' },
      { id: 'N0003' },
    ];

    const edges = [
      { from: 'N0001', to: 'N0002', type: 'depends_on' },
    ];

    const result = checkIsolated(nodes, edges);

    assert.equal(result.connected, false);
    assert.deepEqual(result.isolatedNodes, ['N0003']);
  });
});


// ============================================================
// AC 3: query.js マルチホップ
// ============================================================

describe('AC3: query.js マルチホップ', () => {
  it('--hops=1 と --hops=2 で返却ノード集合が異なる', () => {
    const { multiHopBFS } = require('../../.claude/scripts/rfc-graph/query.js');

    // A → B → C のグラフ
    const graph = {
      nodes: [
        { id: 'N0001', title: 'A', kind: 'requirement', summary: '' },
        { id: 'N0002', title: 'B', kind: 'requirement', summary: '' },
        { id: 'N0003', title: 'C', kind: 'requirement', summary: '' },
      ],
      edges: [
        { from: 'N0001', to: 'N0002', type: 'depends_on', attributes: {} },
        { from: 'N0002', to: 'N0003', type: 'depends_on', attributes: {} },
      ],
    };

    // hops=1: N0001から直接つながるノードのみ（自身+N0002）
    const hop1Result = multiHopBFS(graph, 'N0001', 1);
    const hop1Ids = hop1Result.nodeIds;

    // hops=2: N0001から2ホップ先まで（自身+N0002+N0003）
    const hop2Result = multiHopBFS(graph, 'N0001', 2);
    const hop2Ids = hop2Result.nodeIds;

    // hops=1 には N0001 と N0002 が含まれる（N0003は2ホップ先）
    assert.ok(hop1Ids.includes('N0002'));
    assert.ok(!hop1Ids.includes('N0003'));

    // hops=2 には N0001, N0002, N0003 が含まれる
    assert.ok(hop2Ids.includes('N0003'));

    // 集合が異なることを確認
    assert.notDeepEqual(hop1Ids, hop2Ids);
  });

  it('--hops=1 が直接接続ノードのみを返す', () => {
    const { multiHopBFS } = require('../../.claude/scripts/rfc-graph/query.js');

    // A → B, A → C, C → D のグラフ（Dは2ホップ先）
    const graph = {
      nodes: [
        { id: 'N0001', title: 'A', kind: 'requirement', summary: '' },
        { id: 'N0002', title: 'B', kind: 'requirement', summary: '' },
        { id: 'N0003', title: 'C', kind: 'requirement', summary: '' },
        { id: 'N0004', title: 'D', kind: 'requirement', summary: '' },
      ],
      edges: [
        { from: 'N0001', to: 'N0002', type: 'depends_on', attributes: {} },
        { from: 'N0001', to: 'N0003', type: 'refines', attributes: {} },
        { from: 'N0003', to: 'N0004', type: 'implements', attributes: {} },
      ],
    };

    const hop1Result = multiHopBFS(graph, 'N0001', 1);
    const hop1Ids = hop1Result.nodeIds;

    // 直接接続ノード + 自身
    assert.ok(hop1Ids.includes('N0001'));
    assert.ok(hop1Ids.includes('N0002'));
    assert.ok(hop1Ids.includes('N0003'));
    assert.ok(!hop1Ids.includes('N0004')); // D は2ホップ先
  });
});
