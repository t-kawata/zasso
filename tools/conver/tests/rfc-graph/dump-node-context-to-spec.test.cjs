/**
 * dump-node-context-to-spec.test.cjs — dump-node-context-to-spec.js のテスト
 *
 * テストフレームワーク: Node.js 標準の node:test + node:assert/strict
 * テスト対象は主に純粋関数（formatNodeDetailsBlock / formatEdgeRelationsBlock / formatFilePathsBlock）。
 * ファイルI/O を含む appendToSpec は dump-ticket-graph-commands.test.cjs で既にカバー済み。
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  parseArguments,
  loadTickets,
  collectTicketNodes,
  collectNodeDetails,
  collectEdges,
  buildNodeIdToPathMap,
  formatNodeDetailsBlock,
  formatEdgeRelationsBlock,
  formatFilePathsBlock,
  combineBlocks,
} = require('../../.claude/scripts/rfc-graph/dump-node-context-to-spec.js');

// ============================================================
// テスト用共通データ
// ============================================================

const SAMPLE_NODES = [
  { id: 'N0001', title: '§1 目的 — 本crateの責務定義', kind: 'architecture', language: 'rust', slug: 'purpose', summary: 'RustからPJSUAを安全に利用する', headingRefs: [{ refId: 'REF001', heading: 1, texts: ['§1 目的'] }] },
  { id: 'N0002', title: '§1a M20実装優先度マップ', kind: 'requirement', language: 'rust', slug: 'm20_priority', summary: 'M20追補の実装項目', headingRefs: [{ refId: 'REF002', heading: 2, texts: ['§1a M20実装優先度マップ'] }] },
  { id: 'N0003', title: '§1a 設計判断対応表', kind: 'rationale', language: 'rust', slug: 'design_decisions', summary: 'M20設計判断一覧', headingRefs: [] },
];

const SAMPLE_EDGES = [
  { from: 'N0001', to: 'N0002', type: 'part_of', fromInTicket: true, toInTicket: true },
  { from: 'N0003', to: 'N0001', type: 'depends_on', fromInTicket: true, toInTicket: true },
  { from: 'N0002', to: 'N0099', type: 'references', fromInTicket: true, toInTicket: false },
  { from: 'N0098', to: 'N0001', type: 'depends_on', fromInTicket: false, toInTicket: true },
];

const SAMPLE_DIRS_TREE = {
  sourceFile: '/path/to/RFC-ROOT.md',
  trees: {
    rust: {
      name: 'src',
      type: 'directory',
      children: [
        {
          name: 'auth',
          type: 'directory',
          children: [
            { name: 'keystore.rs', type: 'file', mappedNodeIds: ['N0001', 'N0003'] },
            { name: 'token.rs', type: 'file', mappedNodeIds: ['N0001'] },
          ],
        },
        {
          name: 'config',
          type: 'directory',
          children: [
            { name: 'client_config.rs', type: 'file', mappedNodeIds: ['N0099'] },
          ],
        },
        {
          name: 'lib.rs',
          type: 'file',
          mappedNodeIds: ['N0098'],
        },
      ],
    },
  },
};

const SAMPLE_ALL_NODES = [
  ...SAMPLE_NODES,
  { id: 'N0098', title: '§3 用語' },
  { id: 'N0099', title: '§10 ClientConfig完全仕様' },
];

// ============================================================
// parseArguments
// ============================================================

describe('parseArguments', () => {
  it('正常系: 全引数をパースする', () => {
    const result = parseArguments([
      '--tickets=Tickets.json',
      '--graph=graph.json',
      '--dirs-tree=dirs.json',
      '--ticket-key=P0-1',
    ]);
    assert.equal(result.ticketsPath, 'Tickets.json');
    assert.equal(result.graphPath, 'graph.json');
    assert.equal(result.dirsTreePath, 'dirs.json');
    assert.deepEqual(result.ticketKeys, ['P0-1']);
  });

  it('正常系: 複数 --ticket-key をパースする', () => {
    const result = parseArguments([
      '--tickets=T.json',
      '--graph=G.json',
      '--dirs-tree=D.json',
      '--ticket-key=P0-1',
      '--ticket-key=P0-2',
    ]);
    assert.deepEqual(result.ticketKeys, ['P0-1', 'P0-2']);
  });

  it('異常系: --ticket-key なし', () => {
    assert.throws(() => {
      parseArguments(['--tickets=T.json', '--graph=G.json', '--dirs-tree=D.json']);
    }, /--ticket-key/);
  });

  it('異常系: 引数不足', () => {
    assert.throws(() => {
      parseArguments(['--tickets=T.json']);
    }, /引数が不足/);
  });
});

// ============================================================
// collectTicketNodes
// ============================================================

describe('collectTicketNodes', () => {
  const tickets = {
    phases: [
      { id: 0, name: 'フェーズ0', tickets: [
        { id: 1, title: 'テスト', nodeIDs: ['N0001', 'N0003'], default_files: ['src/auth/keystore.rs'] },
      ]},
      { id: -1, name: '[X]', tickets: [
        { id: 99, title: 'PXテスト', nodeIds: ['N0099'] },
      ]},
    ],
  };

  it('正常系: P{id}-{id} 形式のチケットを解決する', () => {
    const result = collectTicketNodes(tickets, 'P0-1');
    assert.ok(result);
    assert.deepEqual(result.nodeIds, ['N0001', 'N0003']);
    assert.deepEqual(result.defaultFiles, ['src/auth/keystore.rs']);
  });

  it('正常系: PX-{id} 形式のチケットを解決する', () => {
    const result = collectTicketNodes(tickets, 'P-1-99');
    assert.ok(result);
    assert.deepEqual(result.nodeIds, ['N0099']);
  });

  it('異常系: 存在しないチケットキー', () => {
    assert.equal(collectTicketNodes(tickets, 'P999-999'), null);
  });
});

// ============================================================
// collectNodeDetails
// ============================================================

describe('collectNodeDetails', () => {
  it('正常系: 指定された nodeIds のノードを収集する', () => {
    const result = collectNodeDetails({ nodes: SAMPLE_NODES }, ['N0001', 'N0003']);
    assert.equal(result.length, 2);
    assert.equal(result[0].id, 'N0001');
    assert.equal(result[1].id, 'N0003');
  });

  it('正常系: 空の nodeIds は空配列を返す', () => {
    const result = collectNodeDetails({ nodes: SAMPLE_NODES }, []);
    assert.deepEqual(result, []);
  });
});

// ============================================================
// collectEdges
// ============================================================

describe('collectEdges', () => {
  const graph = { edges: SAMPLE_EDGES };

  it('正常系: nodeIds を含むエッジのみ収集する', () => {
    const result = collectEdges(graph, ['N0001', 'N0002', 'N0003']);
    assert.equal(result.length, 4);
  });

  it('正常系: チケット内/外の区別がついている', () => {
    const result = collectEdges(graph, ['N0001', 'N0002', 'N0003']);
    const refEdge = result.find(e => e.type === 'references');
    assert.ok(refEdge);
    assert.equal(refEdge.fromInTicket, true);
    assert.equal(refEdge.toInTicket, false);
  });

  it('正常系: 自チケットに含まれないノードのみのエッジは収集しない', () => {
    const result = collectEdges(graph, ['N9999']);
    assert.equal(result.length, 0);
  });
});

// ============================================================
// buildNodeIdToPathMap
// ============================================================

describe('buildNodeIdToPathMap', () => {
  it('正常系: ツリーから nodeId → filePath のマップを構築する', () => {
    const map = buildNodeIdToPathMap(SAMPLE_DIRS_TREE);
    assert.equal(map['N0001'], 'src/auth/keystore.rs');
    assert.equal(map['N0003'], 'src/auth/keystore.rs');
    assert.equal(map['N0099'], 'src/config/client_config.rs');
    assert.equal(map['N0098'], 'src/lib.rs');
  });

  it('正常系: 空のツリーは空マップを返す', () => {
    const map = buildNodeIdToPathMap({ trees: {} });
    assert.deepEqual(map, {});
  });
});

// ============================================================
// formatNodeDetailsBlock
// ============================================================

describe('formatNodeDetailsBlock', () => {
  it('正常系: ノード詳細のMarkdown表を生成する', () => {
    const result = formatNodeDetailsBlock(SAMPLE_NODES, 'テストチケット');
    assert.ok(result.includes('設計コンテキスト: ノード詳細'));
    assert.ok(result.includes('N0001'));
    assert.ok(result.includes('architecture'));
    assert.ok(result.includes('rust'));
    assert.ok(result.includes('purpose'));
    assert.ok(result.includes('headingRefs'));
    assert.ok(result.includes('§1 目的'));
  });

  it('正常系: 空ノード配列は空文字列を返す', () => {
    assert.equal(formatNodeDetailsBlock([], 'テスト'), '');
  });
});

// ============================================================
// formatEdgeRelationsBlock
// ============================================================

describe('formatEdgeRelationsBlock', () => {
  it('正常系: エッジ種別グループ + ★/☆ 区別でMarkdownを生成する', () => {
    const result = formatEdgeRelationsBlock(SAMPLE_EDGES, SAMPLE_ALL_NODES);
    assert.ok(result.includes('設計コンテキスト: ノード間関係性'));
    assert.ok(result.includes('part_of'));
    assert.ok(result.includes('depends_on'));
    assert.ok(result.includes('references'));
    assert.ok(result.includes('★'));
    assert.ok(result.includes('☆'));
    assert.ok(result.includes('N0001'));
    assert.ok(result.includes('N0099'));
  });

  it('正常系: 空エッジ配列は空文字列を返す', () => {
    assert.equal(formatEdgeRelationsBlock([], SAMPLE_ALL_NODES), '');
  });
});

// ============================================================
// formatFilePathsBlock
// ============================================================

describe('formatFilePathsBlock', () => {

  it('正常系: default_files + 関連ノードファイルパス + 定型案内文を生成する', () => {
    const ticketInfo = { defaultFiles: ['src/auth/keystore.rs'], title: 'テスト' };
    const result = formatFilePathsBlock(SAMPLE_NODES, SAMPLE_EDGES, SAMPLE_DIRS_TREE, ticketInfo);
    assert.ok(result.includes('実装ファイルパス'));
    assert.ok(result.includes('default_files'));
    assert.ok(result.includes('src/auth/keystore.rs'));
    assert.ok(result.includes('関連ノードの実装先'));
    assert.ok(result.includes('src/config/client_config.rs'));
    assert.ok(result.includes('src/lib.rs'));
    assert.ok(result.includes('Initial Design Artifact'));
  });

  it('正常系: default_files が空でもエラーにならない', () => {
    const ticketInfo = { defaultFiles: [], title: 'テスト' };
    const result = formatFilePathsBlock(SAMPLE_NODES, SAMPLE_EDGES, SAMPLE_DIRS_TREE, ticketInfo);
    assert.ok(result.includes('実装ファイルパス'));
    assert.ok(result.includes('関連ノードの実装先'));
    assert.ok(!result.includes('default_files'));
  });

  it('正常系: 定型案内文が常に含まれる', () => {
    const ticketInfo = { defaultFiles: [], title: 'テスト' };
    const result = formatFilePathsBlock([], [], SAMPLE_DIRS_TREE, ticketInfo);
    assert.ok(result.includes('Initial Design Artifact'));
    assert.ok(result.includes('実装ファイル冒頭コメントの活用'));
  });
});

// ============================================================
// combineBlocks
// ============================================================

describe('combineBlocks', () => {
  it('正常系: 3ブロックを結合する', () => {
    const result = combineBlocks('block1', 'block2', 'block3', 'test.json');
    assert.ok(result.includes('### 設計コンテキスト'));
    assert.ok(result.includes('test.json'));
    assert.ok(result.includes('block1'));
    assert.ok(result.includes('block2'));
    assert.ok(result.includes('block3'));
  });

  it('正常系: 空ブロックがあっても結合する', () => {
    const result = combineBlocks('block1', '', '', 'test.json');
    assert.ok(result.includes('block1'));
    assert.equal(result.includes('block2'), false);
  });
});
