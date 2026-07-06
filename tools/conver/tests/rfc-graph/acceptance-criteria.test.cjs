/**
 * acceptance-criteria.test.cjs — graphify-rfc 4項目のAcceptance Criteria検証テスト
 *
 * テストフレームワーク: Node.js 標準の node:test + node:assert/strict
 * 既存の基盤スクリプト（verify.js / embed-markers.js / query.js）の公開関数を
 * monkey-patch して、RFC-GRAPHIFY.md §4.7 で定義された4項目のAcceptance Criteriaを検証する。
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// ============================================================
// AC 1: verify.js カバレッジ検証
// ============================================================

describe('AC1: verify.js カバレッジ検証', () => {
  it('カバレッジ100%で {"ok":true} を返す', () => {
    const { checkCoverage } = require('../../.claude/scripts/rfc-graph/verify.js');

    const sourceLines = [
      '# テスト要件',
      '',
      '要件1: ログイン機能',
      '',
      '## API',
    ];

    const nodes = [
      { id: 'N0001', sourceRanges: [{ startLine: 1, endLine: 1 }] },
      { id: 'N0002', sourceRanges: [{ startLine: 3, endLine: 3 }] },
      { id: 'N0003', sourceRanges: [{ startLine: 5, endLine: 5 }] },
    ];

    const result = checkCoverage(sourceLines, nodes);

    assert.equal(result.covered, true);
    assert.deepEqual(result.uncoveredLines, []);
  });

  it('未カバー行がある場合に ok:false を返す', () => {
    const { checkCoverage } = require('../../.claude/scripts/rfc-graph/verify.js');

    const sourceLines = [
      '# テスト要件',
      '要件1: ログイン機能',
      '',
      '## API',
    ];

    const nodes = [
      { id: 'N0001', sourceRanges: [{ startLine: 1, endLine: 1 }] },
      { id: 'N0002', sourceRanges: [{ startLine: 4, endLine: 4 }] },
    ];

    const result = checkCoverage(sourceLines, nodes);

    assert.equal(result.covered, false);
    assert.deepEqual(result.uncoveredLines, [2]);
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
// AC 2: embed-markers.js 冪等性
// ============================================================

describe('AC2: embed-markers.js 冪等性', () => {
  it('2回連続実行で差分が生じない（冪等性）', () => {
    const { embedAll } = require('../../.claude/scripts/rfc-graph/embed-markers.js');

    // embedAll は内部で extractExistingRefIds を呼び出し、既存マーカーを検出する
    const sourceLines = [
      '# テスト要件',
      '要件1: ログイン機能',
      '要件2: 認証機能',
    ];

    const nodes = [
      { id: 'N0001', sourceRanges: [{ startLine: 1, endLine: 1, refId: 'REF1' }] },
      { id: 'N0002', sourceRanges: [{ startLine: 2, endLine: 3, refId: 'REF2' }] },
    ];

    // 1回目の実行
    const firstResult = embedAll(sourceLines, nodes);

    // 2回目の実行（1回目の結果を元に再度実行 = 既存マーカーが埋め込まれた状態）
    const secondResult = embedAll(firstResult.result, nodes);

    // 冪等性: 2回目で新たに挿入された件数が0
    assert.equal(secondResult.insertedCount, 0);
    // 内容が同一
    assert.deepEqual(secondResult.result, firstResult.result);
  });

  it('同一refIdの重複マーカーを防止する', () => {
    const { embedAll } = require('../../.claude/scripts/rfc-graph/embed-markers.js');

    // 既にマーカーが埋め込まれている状態を模倣（embed-markers.js の MARKER_FORMAT 準拠）
    const sourceLines = [
      '[::REF1-START::] # テスト',
      '内容',
      '[::REF2-START::]詳細 [::REF2-END::]',
    ];

    const nodes = [
      { id: 'N0001', sourceRanges: [{ startLine: 1, endLine: 1, refId: 'REF1' }] },
      { id: 'N0002', sourceRanges: [{ startLine: 3, endLine: 3, refId: 'REF2' }] },
    ];

    const result = embedAll(sourceLines, nodes);

    // 既存の refId はスキップされるため、新規挿入は0
    assert.equal(result.insertedCount, 0);
    // 行数が増えていない
    assert.equal(result.result.length, 3);
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

// ============================================================
// AC 4: 行挿入耐性
// ============================================================

describe('AC4: query.js 行挿入耐性', () => {
  it('ソース文書に1行挿入後、正しい新行番号を返す', () => {
    const { resolveCurrentLines } = require('../../.claude/scripts/rfc-graph/query.js');

    // 1行挿入後のソース文書全文（文字列）— マーカーは embed-markers.js の MARKER_FORMAT 準拠
    const modifiedSourceText = [
      '# テスト要件',                                      // 1
      '[::REF001-START::] ',                               // 2
      '新しい行が挿入されました',                            // 3 ← NEW
      '要件1: ログイン機能',                                // 4
      '[::REF001-END::] ',                                 // 5
      '',                                                  // 6
      '[::REF002-START::] ',                               // 7
      '## API',                                            // 8
      'POST /login',                                       // 9
      '[::REF002-END::] ',                                 // 10
    ].join('\n');

    // REF001 の行範囲を解決（resolveCurrentLines は '::REF001-START::' を部分一致検索）
    const ref1Result = resolveCurrentLines(modifiedSourceText, 'REF001');
    assert.ok(ref1Result !== undefined);
    assert.equal(ref1Result[0].startLine, 2);  // [::REF001-START::] は2行目
    assert.equal(ref1Result[0].endLine, 5);    // [::REF001-END::] は5行目

    // REF002 の行範囲を解決
    const ref2Result = resolveCurrentLines(modifiedSourceText, 'REF002');
    assert.ok(ref2Result !== undefined);
    assert.equal(ref2Result[0].startLine, 7);  // [::REF002-START::] は7行目
    assert.equal(ref2Result[0].endLine, 10);   // [::REF002-END::] は10行目
  });

  it('ソース文書から1行削除後、正しい新行番号を返す', () => {
    const { resolveCurrentLines } = require('../../.claude/scripts/rfc-graph/query.js');

    // 1行削除後（元の5行目の空行が削除された状態）
    const modifiedSourceText = [
      '# テスト要件',                                      // 1
      '[::REF001-START::] ',                               // 2
      '要件1: ログイン機能',                                // 3
      '[::REF001-END::] ',                                 // 4
      '[::REF002-START::] ',                               // 5
      '## API',                                            // 6
      'POST /login',                                       // 7
      '[::REF002-END::] ',                                 // 8
    ].join('\n');

    // REF001 の行範囲
    const ref1Result = resolveCurrentLines(modifiedSourceText, 'REF001');
    assert.ok(ref1Result !== undefined);
    assert.equal(ref1Result[0].startLine, 2);
    assert.equal(ref1Result[0].endLine, 4);

    // REF002 の行範囲（削除により行番号が1つずつ繰り上がる）
    const ref2Result = resolveCurrentLines(modifiedSourceText, 'REF002');
    assert.ok(ref2Result !== undefined);
    assert.equal(ref2Result[0].startLine, 5);
    assert.equal(ref2Result[0].endLine, 8);
  });
});
