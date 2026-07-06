/**
 * query.test.cjs — query.js のテスト
 *
 * テストフレームワーク: Node.js 標準の node:test + node:assert/strict
 * テスト対象モジュールの全公開関数をカバーする。
 * 一時ディレクトリを使用した実際のファイル I/O テストを含む。
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// テスト対象モジュールを require パスで読み込む
const {
  parseArguments,
  parseNodeIds,
  parseHops,
  loadGraph,
  loadSourceFile,
  resolveNodeById,
  multiHopBFS,
  resolveCurrentLines,
  formatNodeMarkdown,
  groupEdgesByType,
  getDirectionLabel,
  printUsage,
} = require('../../.claude/scripts/rfc-graph/query.js');

// ============================================================
// テスト用ユーティリティ
// ============================================================

/** テスト用の一時ディレクトリパス */
let tmpDir;

/**
 * テスト前に一時ディレクトリを作成する
 */
function setupTempDir() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'query-test-'));
}

/**
 * テスト後に一時ディレクトリを削除する
 */
function cleanupTempDir() {
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * テスト用のグラフファイルを作成する
 *
 * @param {string} fileName — ファイル名
 * @param {Object} data — グラフデータ
 * @returns {string} 作成されたファイルの絶対パス
 */
function writeGraphFile(fileName, data) {
  const filePath = path.join(tmpDir, fileName);
  fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
  return filePath;
}

/**
 * テスト用のソースファイルを作成する
 *
 * @param {string} fileName — ファイル名
 * @param {string[]} lines — 行配列
 * @returns {string} 作成されたファイルの絶対パス
 */
function writeSourceFile(fileName, lines) {
  const filePath = path.join(tmpDir, fileName);
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  return filePath;
}

// ============================================================
// テスト用フィクスチャ
// ============================================================

/**
 * テスト用のシンプルなグラフデータ
 *
 * ノード: N0001(api_contract) → N0003(token_logic) [depends_on/hard]
 * ノード: N0003(token_logic) → N0005(session_mgmt) [refines/medium]
 * ノード: N0001 → N0004(data_model) [implements/soft]
 * 孤立ノード: N0002(glossary)
 */
const SIMPLE_GRAPH = {
  sourceFile: 'test-rfc.md',
  nodes: [
    {
      id: 'N0001',
      title: '認証API定義',
      kind: 'api_contract',
      summary: 'POST /api/v1/auth/login エンドポイントの定義。',
      sourceRanges: [{ refId: 'REF001', startLine: 10, endLine: 25 }],
    },
    {
      id: 'N0002',
      title: '用語集',
      kind: 'glossary',
      summary: '認証関連の用語定義。',
      sourceRanges: [{ refId: 'REF002', startLine: 30, endLine: 40 }],
    },
    {
      id: 'N0003',
      title: 'トークン検証ロジック',
      kind: 'requirement',
      summary: 'JWTトークンの検証手順。',
      sourceRanges: [{ refId: 'REF003', startLine: 50, endLine: 65 }],
    },
    {
      id: 'N0004',
      title: 'データモデル定義',
      kind: 'data_model',
      summary: 'Userエンティティの定義。',
      sourceRanges: [{ refId: 'REF004', startLine: 70, endLine: 85 }],
    },
    {
      id: 'N0005',
      title: 'セッション管理',
      kind: 'requirement',
      summary: 'ユーザーセッションの管理方法。',
      sourceRanges: [{ refId: 'REF005', startLine: 90, endLine: 105 }],
    },
  ],
  edges: [
    {
      from: 'N0001', to: 'N0003', type: 'depends_on',
      attributes: { strength: 'hard', bidirectional: false },
    },
    {
      from: 'N0003', to: 'N0005', type: 'refines',
      attributes: { strength: 'medium', bidirectional: false },
    },
    {
      from: 'N0001', to: 'N0004', type: 'implements',
      attributes: { strength: 'soft', bidirectional: false },
    },
  ],
};

/**
 * テスト用の循環グラフデータ
 */
const CYCLIC_GRAPH = {
  sourceFile: 'cyclic-rfc.md',
  nodes: [
    { id: 'N0001', title: 'A', kind: 'requirement', summary: 'Node A' },
    { id: 'N0002', title: 'B', kind: 'requirement', summary: 'Node B' },
    { id: 'N0003', title: 'C', kind: 'requirement', summary: 'Node C' },
  ],
  edges: [
    { from: 'N0001', to: 'N0002', type: 'depends_on', attributes: { strength: 'hard' } },
    { from: 'N0002', to: 'N0003', type: 'depends_on', attributes: { strength: 'hard' } },
    { from: 'N0003', to: 'N0001', type: 'depends_on', attributes: { strength: 'hard' } },
  ],
};

/**
 * テスト用のソーステキスト（マーカー付き）
 */
const SOURCE_LINES = [
  '# テストRFC文書',
  '',
  '## 概要',
  'この文書はテスト用です。',
  '',
  '## 詳細',
  '認証APIの定義を行います。',
  '',
  '## 認証API定義 [::REF001-START::]',
  'RESTful API によるユーザー認証。',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/refresh',
  '',
  'リクエストボディには email と password を含む。',
  'レスポンスは JWT 形式のアクセストークン。',
  'トークンの有効期限は24時間。',
  '',
  'レート制限: 1分間に10リクエストまで。',
  '【認証API定義】 [::REF001-END::]',
  '',
  '## 用語集 [::REF002-START::]',
  '- アクセストークン: 認証済みユーザーの識別子',
  '- リフレッシュトークン: トークン更新用',
  '- CSRFトークン: クロスサイト対策',
  '【用語集】 [::REF002-END::]',
  '',
  '## トークン検証 [::REF003-START::]',
  'JWTの署名検証手順。',
  '公開鍵を使用してペイロードの改ざんをチェックする。',
  'algヘッダーのホワイトリスト検証を含む。',
  '【トークン検証】 [::REF003-END::]',
  '',
  '## データモデル [::REF004-START::]',
  'User: id, email, password_hash, created_at',
  'Session: id, user_id, token, expires_at',
  '【データモデル】 [::REF004-END::]',
  '',
  '## セッション管理 [::REF005-START::]',
  'ユーザーセッションの作成と破棄。',
  'セッション有効期限は7日間。',
  '【セッション管理】 [::REF005-END::]',
];

// ============================================================
// parseArguments
// ============================================================

describe('parseArguments', () => {
  it('正常系: 必須引数のみ（--graph --source --id）をパースする', () => {
    const result = parseArguments([
      '--graph=test-graph.json',
      '--source=test-source.md',
      '--id=N0001',
    ]);
    assert.equal(result.graphPath, 'test-graph.json');
    assert.equal(result.sourcePath, 'test-source.md');
    assert.deepEqual(result.nodeIds, ['N0001']);
    assert.equal(result.hops, 1); // デフォルト
  });

  it('正常系: --hops を指定してパースする', () => {
    const result = parseArguments([
      '--graph=test-graph.json',
      '--source=test-source.md',
      '--id=N0001',
      '--hops=3',
    ]);
    assert.equal(result.hops, 3);
  });

  it('正常系: カンマ区切りで複数ノードIDをパースする', () => {
    const result = parseArguments([
      '--graph=test-graph.json',
      '--source=test-source.md',
      '--id=N0001,N0003,N0005',
    ]);
    assert.deepEqual(result.nodeIds, ['N0001', 'N0003', 'N0005']);
  });

  it('異常系: 引数不足（--graph のみ）でエラー', () => {
    assert.throws(() => {
      parseArguments(['--graph=test.json']);
    }, /引数が不足/);
  });

  it('異常系: 引数なしでエラー', () => {
    assert.throws(() => {
      parseArguments([]);
    }, /引数が不足/);
  });

  it('異常系: --graph が空でエラー', () => {
    assert.throws(() => {
      parseArguments(['--graph=', '--source=test.md', '--id=N0001']);
    }, /空です/);
  });

  it('異常系: --id が空でエラー', () => {
    assert.throws(() => {
      parseArguments(['--graph=test.json', '--source=test.md', '--id=']);
    }, /空です/);
  });

  it('異常系: 最初の引数が --graph 以外でエラー', () => {
    assert.throws(() => {
      parseArguments(['--source=test.md', '--graph=test.json', '--id=N0001']);
    }, /最初の引数/);
  });
});

// ============================================================
// parseNodeIds / parseHops
// ============================================================

describe('parseNodeIds', () => {
  it('正常系: 単一ノードIDをパースする', () => {
    assert.deepEqual(parseNodeIds('--id=N0001'), ['N0001']);
  });

  it('正常系: カンマ区切り複数IDをパースする', () => {
    assert.deepEqual(parseNodeIds('--id=N0001,N0003,N0005'), ['N0001', 'N0003', 'N0005']);
  });

  it('正規化: 前後の空白を除去する', () => {
    assert.deepEqual(parseNodeIds('--id= N0001 , N0003 '), ['N0001', 'N0003']);
  });

  it('異常系: --id= プレフィックスなしでエラー', () => {
    assert.throws(() => parseNodeIds('--source=test.md'), /--id=/);
  });

  it('異常系: 空のIDでエラー', () => {
    assert.throws(() => parseNodeIds('--id='), /空/);
  });
});

describe('parseHops', () => {
  it('正常系: 正の整数をパースする', () => {
    assert.equal(parseHops('--hops=3'), 3);
  });

  it('異常系: hops=0 でエラー', () => {
    assert.throws(() => parseHops('--hops=0'), /1以上/);
  });

  it('異常系: hops が負数でエラー', () => {
    assert.throws(() => parseHops('--hops=-1'), /1以上/);
  });

  it('異常系: hops が非整数でエラー', () => {
    assert.throws(() => parseHops('--hops=abc'), /1以上/);
  });

  it('異常系: hops が空でエラー', () => {
    assert.throws(() => parseHops('--hops='), /空です/);
  });

  it('異常系: --hops= プレフィックスなしでエラー', () => {
    assert.throws(() => parseHops('--id=N0001'), /--hops=/);
  });
});

// ============================================================
// loadGraph
// ============================================================

describe('loadGraph', () => {
  before(setupTempDir);
  after(cleanupTempDir);

  it('正常系: 有効なグラフJSONを読み込む', () => {
    const filePath = writeGraphFile('graph.json', SIMPLE_GRAPH);
    const graph = loadGraph(filePath);
    assert.equal(graph.sourceFile, 'test-rfc.md');
    assert.equal(graph.nodes.length, 5);
    assert.equal(graph.edges.length, 3);
  });

  it('異常系: 存在しないファイルでエラー（ENOENT）', () => {
    assert.throws(() => {
      loadGraph(path.join(tmpDir, 'not-exists.json'));
    }, /ENOENT/);
  });

  it('異常系: 不正なJSONでエラー', () => {
    const filePath = path.join(tmpDir, 'invalid.json');
    fs.writeFileSync(filePath, 'not-json', 'utf8');
    assert.throws(() => {
      loadGraph(filePath);
    }, /JSONパース/);
  });
});

// ============================================================
// loadSourceFile
// ============================================================

describe('loadSourceFile', () => {
  before(setupTempDir);
  after(cleanupTempDir);

  it('正常系: ソースファイルを読み込む', () => {
    const filePath = writeSourceFile('test.md', SOURCE_LINES);
    const content = loadSourceFile(filePath);
    assert.ok(content.includes('::REF001-START::'));
    assert.ok(content.includes('::REF005-END::'));
  });

  it('異常系: 存在しないファイルでエラー', () => {
    assert.throws(() => {
      loadSourceFile(path.join(tmpDir, 'not-exists.md'));
    });
  });
});

// ============================================================
// resolveNodeById
// ============================================================

describe('resolveNodeById', () => {
  it('正常系: 存在するノードIDを解決する', () => {
    const node = resolveNodeById(SIMPLE_GRAPH, 'N0001');
    assert.notEqual(node, null);
    assert.equal(node.title, '認証API定義');
    assert.equal(node.kind, 'api_contract');
  });

  it('正常系: 存在しないノードIDは null を返す', () => {
    const node = resolveNodeById(SIMPLE_GRAPH, 'NX001');
    assert.equal(node, null);
  });
});

// ============================================================
// multiHopBFS
// ============================================================

describe('multiHopBFS', () => {
  it('正常系: 1ホップで直接接続ノードを返す', () => {
    const result = multiHopBFS(SIMPLE_GRAPH, 'N0001', 1);
    // N0001 + N0003(直接) + N0004(直接) = 3ノード
    assert.equal(result.nodeIds.length, 3);
    assert.ok(result.nodeIds.includes('N0001'));
    assert.ok(result.nodeIds.includes('N0003'));
    assert.ok(result.nodeIds.includes('N0004'));
    // エッジ2本
    assert.equal(result.edges.length, 2);
  });

  it('正常系: 2ホップで間接接続ノードまで到達する', () => {
    const result = multiHopBFS(SIMPLE_GRAPH, 'N0001', 2);
    // N0001 + N0003 + N0004 + N0005(N0003→N0005) = 4ノード
    assert.equal(result.nodeIds.length, 4);
    assert.ok(result.nodeIds.includes('N0005'));
    // 全3エッジ
    assert.equal(result.edges.length, 3);
  });

  it('正常系: ホップ制限で探索が制限される', () => {
    // 2ホップ → N0001,N0003,N0004,N0005 = 4ノード
    const result1 = multiHopBFS(SIMPLE_GRAPH, 'N0001', 2);
    assert.equal(result1.nodeIds.length, 4);

    // 3ホップ → 全ノード（孤立N0002を除く）つまり4ノード（循環なし）
    const result2 = multiHopBFS(SIMPLE_GRAPH, 'N0001', 3);
    assert.equal(result2.nodeIds.length, 4);
    assert.ok(!result2.nodeIds.includes('N0002')); // 孤立ノードは含まれない
  });

  it('正常系: 孤立ノードは自身のみを返す', () => {
    const result = multiHopBFS(SIMPLE_GRAPH, 'N0002', 1);
    assert.equal(result.nodeIds.length, 1);
    assert.equal(result.nodeIds[0], 'N0002');
    assert.equal(result.edges.length, 0);
  });

  it('正常系: 循環グラフで無限ループしない', () => {
    const result = multiHopBFS(CYCLIC_GRAPH, 'N0001', 5);
    // 3ノードすべてに到達
    assert.equal(result.nodeIds.length, 3);
    assert.ok(result.nodeIds.includes('N0001'));
    assert.ok(result.nodeIds.includes('N0002'));
    assert.ok(result.nodeIds.includes('N0003'));
    // エッジは3本（重複しない）
    assert.equal(result.edges.length, 3);
  });

  it('正常系: 同一エッジが結果に重複しない', () => {
    const result1 = multiHopBFS(SIMPLE_GRAPH, 'N0001', 1);
    // 1ホップ: N0001→N0003のエッジが1本
    const n0001ToN0003Edges = result1.edges.filter(
      e => (e.from === 'N0001' && e.to === 'N0003')
    );
    assert.equal(n0001ToN0003Edges.length, 1);

    // 2ホップでも同じエッジは1本
    const result2 = multiHopBFS(SIMPLE_GRAPH, 'N0001', 2);
    const n0001ToN0003Edges2 = result2.edges.filter(
      e => (e.from === 'N0001' && e.to === 'N0003')
    );
    assert.equal(n0001ToN0003Edges2.length, 1);
  });
});

// ============================================================
// resolveCurrentLines
// ============================================================

describe('resolveCurrentLines', () => {
  it('正常系: マーカーが存在する行範囲を正しく解決する', () => {
    const sourceText = SOURCE_LINES.join('\n');
    const ranges = resolveCurrentLines(sourceText, 'REF001');
    assert.notEqual(ranges, undefined);
    assert.equal(ranges.length, 1);
    assert.equal(ranges[0].startLine, 9); // 1-based
    assert.equal(ranges[0].endLine, 19);
  });

  it('正常系: 複数ノードの行範囲をそれぞれ解決する', () => {
    const sourceText = SOURCE_LINES.join('\n');
    const r1 = resolveCurrentLines(sourceText, 'REF001');
    const r3 = resolveCurrentLines(sourceText, 'REF003');
    const r5 = resolveCurrentLines(sourceText, 'REF005');

    assert.notEqual(r1, undefined);
    assert.notEqual(r3, undefined);
    assert.notEqual(r5, undefined);

    // REF003 は REF001 より後
    assert.ok(r3[0].startLine > r1[0].endLine);
    // REF005 は REF003 より後
    assert.ok(r5[0].startLine > r3[0].endLine);
  });

  it('異常系: マーカーが存在しない refId は undefined を返す', () => {
    const sourceText = SOURCE_LINES.join('\n');
    const ranges = resolveCurrentLines(sourceText, 'REF999');
    assert.equal(ranges, undefined);
  });
});

// ============================================================
// groupEdgesByType
// ============================================================

describe('groupEdgesByType', () => {
  it('正常系: エッジを type ごとにグループ化する', () => {
    const groups = groupEdgesByType(SIMPLE_GRAPH.edges);
    assert.equal(groups.size, 3);
    assert.ok(groups.has('depends_on'));
    assert.ok(groups.has('refines'));
    assert.ok(groups.has('implements'));
    assert.equal(groups.get('depends_on').length, 1);
  });

  it('異常系: 空配列は空のMapを返す', () => {
    const groups = groupEdgesByType([]);
    assert.equal(groups.size, 0);
  });
});

// ============================================================
// getDirectionLabel
// ============================================================

describe('getDirectionLabel', () => {
  it('正常系: from→to は "→" を返す', () => {
    const edge = { from: 'N0001', to: 'N0003', type: 'depends_on' };
    assert.equal(getDirectionLabel('N0001', edge), '→');
  });

  it('正常系: to→from は "←" を返す', () => {
    const edge = { from: 'N0001', to: 'N0003', type: 'depends_on' };
    assert.equal(getDirectionLabel('N0003', edge), '←');
  });

  it('正常系: 双方向エッジは "↔" を返す', () => {
    const edge = {
      from: 'N0001', to: 'N0003', type: 'depends_on',
      attributes: { strength: 'hard', bidirectional: true },
    };
    assert.equal(getDirectionLabel('N0001', edge), '↔');
    assert.equal(getDirectionLabel('N0003', edge), '↔');
  });

  it('正常系: attributes がない場合も正しく動作する', () => {
    const edge = { from: 'N0001', to: 'N0003', type: 'depends_on' };
    assert.equal(getDirectionLabel('N0001', edge), '→');
  });
});

// ============================================================
// formatNodeMarkdown
// ============================================================

describe('formatNodeMarkdown', () => {
  it('正常系: ノード情報を正しいMarkdownに整形する', () => {
    const node = SIMPLE_GRAPH.nodes[0]; // N0001
    const searchResult = multiHopBFS(SIMPLE_GRAPH, 'N0001', 1);
    const sourceText = SOURCE_LINES.join('\n');
    const output = formatNodeMarkdown(node, searchResult.edges, SIMPLE_GRAPH, sourceText);

    // 見出し
    assert.ok(output.includes('## N0001: 認証API定義'));
    // 種別と参照
    assert.ok(output.includes('api_contract'));
    assert.ok(output.includes('REF001'));
    // 現在行番号
    assert.ok(output.includes('L9-L19') || output.includes('L'));
    // Summary
    assert.ok(output.includes('POST /api/v1/auth/login'));
    // 関係セクション
    assert.ok(output.includes('### 関係'));
    assert.ok(output.includes('depends_on'));
    assert.ok(output.includes('implements'));
  });

  it('正常系: 孤立ノードは「関係 (なし)」を出力する', () => {
    const node = SIMPLE_GRAPH.nodes[1]; // N0002（孤立）
    const sourceText = SOURCE_LINES.join('\n');
    const output = formatNodeMarkdown(node, [], SIMPLE_GRAPH, sourceText);

    assert.ok(output.includes('## N0002: 用語集'));
    assert.ok(output.includes('### 関係 (なし)'));
  });

  it('正常系: マーカー欠損時に行番号をN/Aと表示する', () => {
    // マーカーがない refId のノード
    const nodeWithMissingRef = {
      id: 'NX001',
      title: '欠損ノード',
      kind: 'requirement',
      sourceRanges: [{ refId: 'REF999', startLine: 1, endLine: 10 }],
    };
    const sourceText = SOURCE_LINES.join('\n');
    const output = formatNodeMarkdown(nodeWithMissingRef, [], SIMPLE_GRAPH, sourceText);

    assert.ok(output.includes('NX001'));
    assert.ok(output.includes('N/A'));
  });

  it('正常系: 双方向エッジを含む場合に正しく表示する', () => {
    const graphWithBidi = {
      sourceFile: 'test.md',
      nodes: [
        { id: 'N0001', title: 'Node A', kind: 'requirement', summary: 'A', sourceRanges: [{ refId: 'REF001', startLine: 1, endLine: 5 }] },
        { id: 'N0002', title: 'Node B', kind: 'requirement', summary: 'B', sourceRanges: [{ refId: 'REF002', startLine: 10, endLine: 15 }] },
      ],
      edges: [
        { from: 'N0001', to: 'N0002', type: 'depends_on', attributes: { strength: 'hard', bidirectional: true } },
      ],
    };
    const sourceLines = ['', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
    const sourceText = sourceLines.join('\n');
    const node = graphWithBidi.nodes[0];
    const searchResult = multiHopBFS(graphWithBidi, 'N0001', 1);
    const output = formatNodeMarkdown(node, searchResult.edges, graphWithBidi, sourceText);

    assert.ok(output.includes('↔'));
  });

  it('正常系: sourceRanges がないノードは N/A と表示する', () => {
    const node = { id: 'NX001', title: '範囲なし', kind: 'requirement', summary: 'Test' };
    const sourceText = SOURCE_LINES.join('\n');
    const output = formatNodeMarkdown(node, [], SIMPLE_GRAPH, sourceText);

    assert.ok(output.includes('NX001'));
    assert.ok(output.includes('N/A'));
  });
});

// ============================================================
// printUsage
// ============================================================

describe('printUsage', () => {
  it('正常系: 使用方法を出力する（エラーを吐かない）', () => {
    // console.log が呼ばれることを確認（例外が発生しないこと）
    printUsage();
  });
});

// ============================================================
// 統合テスト — main関数（実際のファイルI/O）
// ============================================================

describe('main 統合', () => {
  before(setupTempDir);
  after(cleanupTempDir);

  it('正常系: --graph --source --id --hops で正しいMarkdown出力を得る', () => {
    // テスト用ファイル作成
    const graphPath = writeGraphFile('graph.json', SIMPLE_GRAPH);
    const sourcePath = writeSourceFile('test.md', SOURCE_LINES);

    // parseArguments でパースして各関数を呼ぶ（main は process.exit するため直接呼ばない）
    const parsed = parseArguments([
      `--graph=${graphPath}`,
      `--source=${sourcePath}`,
      '--id=N0001',
      '--hops=2',
    ]);
    assert.equal(parsed.graphPath, graphPath);
    assert.equal(parsed.sourcePath, sourcePath);
    assert.deepEqual(parsed.nodeIds, ['N0001']);
    assert.equal(parsed.hops, 2);

    const graph = loadGraph(parsed.graphPath);
    const sourceText = loadSourceFile(parsed.sourcePath);

    const node = resolveNodeById(graph, 'N0001');
    assert.notEqual(node, null);

    const searchResult = multiHopBFS(graph, 'N0001', 2);
    assert.equal(searchResult.nodeIds.length, 4);

    const output = formatNodeMarkdown(node, searchResult.edges, graph, sourceText);
    assert.ok(output.includes('N0001'));
    assert.ok(output.includes('N0005')); // 2ホップで到達
  });

  it('異常系: 存在しないグラフファイルでエラーになる', () => {
    assert.throws(() => {
      loadGraph(path.join(tmpDir, 'not-exists.json'));
    });
  });

  it('異常系: 存在しないソースファイルでエラーになる', () => {
    assert.throws(() => {
      loadSourceFile(path.join(tmpDir, 'not-exists.md'));
    });
  });

  it('異常系: 存在しないノードIDでエラーになる', () => {
    const node = resolveNodeById(SIMPLE_GRAPH, 'NX001');
    assert.equal(node, null);
  });
});
