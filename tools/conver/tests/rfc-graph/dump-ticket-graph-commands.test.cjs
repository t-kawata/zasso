/**
 * dump-ticket-graph-commands.test.cjs — dump-ticket-graph-commands.js のテスト
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
  loadTickets,
  collectNodeIds,
  generateCommand,
  buildNodeTitleMap,
  formatSection,
  formatNoGraphSection,
  appendToSpec,
  printUsage,
} = require('../../.claude/scripts/rfc-graph/dump-ticket-graph-commands.js');

const { resolveSpecPath, parseTicketKey } = require('../../.claude/scripts/lib/resolve-spec-path.js');

// ============================================================
// テスト用ユーティリティ
// ============================================================

/** テスト用の一時ディレクトリパス */
let tmpDir;

/** テスト用 Tickets.json のパス */
let ticketsPath;

/** テスト用 Tickets.json データ（正常系） */
const NORMAL_TICKETS = {
  title: 'テストプロジェクト 実装チケット分解設計書',
  source: 'RFC-TEST.md',
  generatedAt: '2026-07-06',
  phases: [
    {
      phaseId: 0,
      name: '純粋ロジック基盤',
      tickets: [
        { id: 1, title: '認証モジュール', status: 'todo', nodeIDs: ['N0001', 'N0003'] },
        { id: 2, title: 'データベース接続', status: 'todo', nodeIDs: ['N0005'] },
      ],
    },
    {
      phaseId: 1,
      name: '非同期ランタイム',
      tickets: [
        { id: 1, title: 'APIサーバー', status: 'todo', nodeIDs: ['N0002'] },
      ],
    },
  ],
};

/** nodeIDs がないチケットを含む Tickets.json */
const TICKETS_WITHOUT_NODE_IDS = {
  title: 'テスト',
  source: 'RFC.md',
  generatedAt: '2026-07-06',
  phases: [
    {
      phaseId: 0,
      name: 'Phase 0',
      tickets: [
        { id: 1, title: 'ノードあり', status: 'todo', nodeIDs: ['N0001'] },
        { id: 2, title: 'ノードなし', status: 'todo' },
        { id: 3, title: '空配列', status: 'todo', nodeIDs: [] },
      ],
    },
  ],
};

/** 全チケットに nodeIDs がない Tickets.json */
const TICKETS_ALL_EMPTY = {
  title: 'テスト',
  source: 'RFC.md',
  generatedAt: '2026-07-06',
  phases: [
    {
      phaseId: 0,
      name: 'Phase 0',
      tickets: [
        { id: 1, title: 'ノードなし', status: 'todo' },
        { id: 2, title: 'ノードなし2', status: 'todo' },
      ],
    },
  ],
};

/** テスト用グラフデータ */
const TEST_GRAPH = {
  sourceFile: '/tmp/test-rfc.md',
  nodes: [
    { id: 'N0001', kind: 'requirement', title: '認証API定義', headingRefs: [{ heading:1, texts:["test"]}]},
    { id: 'N0002', kind: 'api_contract', title: 'ログインエンドポイント', headingRefs: [{ heading:1, texts:["test"]}]},
    { id: 'N0003', kind: 'data_model', title: 'トークン検証ロジック', headingRefs: [{ heading:1, texts:["test"]}]},
    { id: 'N0005', kind: 'rationale', title: 'セッション管理', headingRefs: [{ heading:1, texts:["test"]}]},
  ],
  edges: [],
};

/** nodes 情報がない空グラフ */
const EMPTY_NODES_GRAPH = {
  sourceFile: '/tmp/empty.md',
  nodes: [],
  edges: [],
};

// ============================================================
// テスト
// ============================================================

describe('dump-ticket-graph-commands.js', () => {
  // 各テストの前に一時ディレクトリを作成
  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dump-ticket-graph-test-'));
    ticketsPath = path.join(tmpDir, 'Tickets.json');
  });

  // 後始末
  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ============================================================
  // parseArguments
  // ============================================================

  describe('parseArguments', () => {
    it('正常系: 全引数をパースする', () => {
      const result = parseArguments([
        '--tickets=/path/Tickets.json',
        '--graph=/path/graph.json',
        '--source=/path/doc.md',
      ]);
      assert.equal(result.ticketsPath, '/path/Tickets.json');
      assert.equal(result.graphPath, '/path/graph.json');
      assert.equal(result.sourcePath, '/path/doc.md');
    });

    it('異常系: 引数不足', () => {
      assert.throws(() => {
        parseArguments(['--tickets=a.json', '--graph=b.json']);
      }, /引数が不足しています/);
    });

    it('異常系: --tickets のプレフィックス誤り', () => {
      assert.throws(() => {
        parseArguments(['--ticket=a.json', '--graph=b.json', '--source=c.md']);
      }, /最初の引数は --tickets=<path>/);
    });

    it('異常系: --graph のプレフィックス誤り', () => {
      assert.throws(() => {
        parseArguments(['--tickets=a.json', '--gra=b.json', '--source=c.md']);
      }, /2番目の引数は --graph=<path>/);
    });

    it('異常系: 空のパス', () => {
      assert.throws(() => {
        parseArguments(['--tickets=', '--graph=b.json', '--source=c.md']);
      }, /<path> が空です/);
    });
  });

  // ============================================================
  // loadTickets
  // ============================================================

  describe('loadTickets', () => {
    it('正常系: Tickets.json を読み込む', () => {
      fs.writeFileSync(ticketsPath, JSON.stringify(NORMAL_TICKETS), 'utf8');
      const data = loadTickets(ticketsPath);
      assert.equal(data.title, NORMAL_TICKETS.title);
      assert.equal(data.phases.length, 2);
    });

    it('異常系: ファイルが存在しない', () => {
      const noExist = path.join(tmpDir, 'no-such-file.json');
      assert.throws(() => {
        loadTickets(noExist);
      }, /Tickets.json が見つかりません/);
    });

    it('異常系: 不正なJSON', () => {
      fs.writeFileSync(ticketsPath, '{不正}', 'utf8');
      assert.throws(() => {
        loadTickets(ticketsPath);
      }, /JSONパースに失敗/);
    });
  });

  // ============================================================
  // collectNodeIds
  // ============================================================

  describe('collectNodeIds', () => {
    it('正常系: 全チケットにnodeIDsあり', () => {
      const entries = collectNodeIds(NORMAL_TICKETS);
      assert.equal(entries.length, 3);
      assert.equal(entries[0].ticketKey, 'P0-1');
      assert.deepEqual(entries[0].nodeIds, ['N0001', 'N0003']);
      assert.equal(entries[1].ticketKey, 'P0-2');
      assert.deepEqual(entries[1].nodeIds, ['N0005']);
      assert.equal(entries[2].ticketKey, 'P1-1');
      assert.deepEqual(entries[2].nodeIds, ['N0002']);
    });

    it('正常系: nodeIDsなしのチケットが混在', () => {
      const entries = collectNodeIds(TICKETS_WITHOUT_NODE_IDS);
      assert.equal(entries.length, 1); // nodeIDs あるのは1つだけ
      assert.equal(entries[0].ticketKey, 'P0-1');
    });

    it('正常系: 全チケットにnodeIDsなし', () => {
      const entries = collectNodeIds(TICKETS_ALL_EMPTY);
      assert.equal(entries.length, 0);
    });
  });

  // ============================================================
  // buildNodeTitleMap
  // ============================================================

  describe('buildNodeTitleMap', () => {
    it('正常系: ノードIDとタイトルのマッピングを構築する', () => {
      const map = buildNodeTitleMap(TEST_GRAPH);
      assert.equal(map['N0001'], '認証API定義');
      assert.equal(map['N0002'], 'ログインエンドポイント');
      assert.equal(map['N0003'], 'トークン検証ロジック');
      assert.equal(map['N0005'], 'セッション管理');
    });

    it('境界値: nodes が空配列', () => {
      const map = buildNodeTitleMap(EMPTY_NODES_GRAPH);
      assert.deepEqual(map, {});
    });
  });

  // ============================================================
  // generateCommand
  // ============================================================

  describe('generateCommand', () => {
    it('正常系: タイトルありのコマンドを生成する', () => {
      const cmd = generateCommand('N0001', { N0001: '認証API定義' }, '/tmp/graph.json', '/tmp/source.md');
      assert.ok(cmd.includes('N0001'));
      assert.ok(cmd.includes('認証API定義'));
      assert.ok(cmd.includes('query.js'));
      assert.ok(cmd.includes('--hops=3'));
    });

    it('正常系: タイトルなしの場合', () => {
      const cmd = generateCommand('N0005', {}, '/tmp/g.json', '/tmp/s.md');
      assert.ok(cmd.includes('N0005'));
      assert.ok(!cmd.includes('undefined'));
      // タイトルなしの場合、括弧内は空になる
      assert.ok(cmd.includes('N0005 →'));
    });
  });

  // ============================================================
  // formatSection
  // ============================================================

  describe('formatSection', () => {
    it('正常系: コマンドありのセクションを生成する', () => {
      const results = [
        {
          ticketKey: 'P0-1',
          nodeIds: ['N0001'],
          commands: [
            '- N0001 (認証API定義) → `node .claude/scripts/rfc-graph/query.js --graph=graph.json --source=source.md --id=N0001 --hops=3`',
          ],
        },
      ];
      const section = formatSection(results, 'graph.json');
      assert.ok(section.includes('### RFC設計グラフ構造探索コマンド'));
      assert.ok(section.includes('グラフファイル: graph.json'));
      assert.ok(section.includes('P0-1'));
      assert.ok(section.includes('N0001'));
      assert.ok(section.includes('query.js'));
    });

    it('正常系: 複数チケットのセクション', () => {
      const results = [
        {
          ticketKey: 'P0-1',
          nodeIds: ['N0001', 'N0003'],
          commands: [
            '- N0001 → `...`',
            '- N0003 → `...`',
          ],
        },
        {
          ticketKey: 'P1-1',
          nodeIds: ['N0002'],
          commands: [
            '- N0002 → `...`',
          ],
        },
      ];
      const section = formatSection(results, 'g.json');
      assert.ok(section.includes('P0-1'));
      assert.ok(section.includes('P1-1'));
    });
  });

  // ============================================================
  // formatNoGraphSection
  // ============================================================

  describe('formatNoGraphSection', () => {
    it('正常系: グラフ不在メッセージを生成する', () => {
      const section = formatNoGraphSection();
      assert.ok(section.includes('### RFC設計グラフ構造探索コマンド'));
      assert.ok(section.includes('グラフファイルがありません'));
    });
  });

  // ============================================================
  // appendToSpec
  // ============================================================

  describe('appendToSpec', () => {
    it('正常系: spec ファイルに追記する', () => {
      const specPath = path.join(tmpDir, 'spec-test.md');
      fs.writeFileSync(specPath, '# テストSpec\n', 'utf8');

      appendToSpec(specPath, '### RFC設計グラフ構造探索コマンド\n\ngraph.json\n');

      const content = fs.readFileSync(specPath, 'utf8');
      assert.ok(content.includes('### RFC設計グラフ構造探索コマンド'));
      assert.ok(content.includes('graph.json'));
    });

    it('正常系: 冪等性 — 同一セクションの重複追記を防止する', () => {
      const specPath = path.join(tmpDir, 'spec-idempotent.md');
      fs.writeFileSync(specPath, '# テストSpec\n', 'utf8');

      const section = '### RFC設計グラフ構造探索コマンド\n\ngraph.json\n';
      const firstResult = appendToSpec(specPath, section);
      const secondResult = appendToSpec(specPath, section);

      assert.equal(firstResult, true);
      assert.equal(secondResult, false);

      const content = fs.readFileSync(specPath, 'utf8');
      const occurrences = content.split('### RFC設計グラフ構造探索コマンド').length - 1;
      assert.equal(occurrences, 1);
    });
  });

  // ============================================================
  // resolveSpecPath
  // ============================================================

  describe('resolveSpecPath', () => {
    it('正常系: チケットキーから referenceSection 経由で spec パスを解決する', () => {
      const specPath = path.join(tmpDir, '0001-test-spec.md');
      fs.writeFileSync(specPath, '# テストSpec\n', 'utf8');

      // referenceSection を持つチケットを含む Tickets.json
      // referenceSection は Tickets.json のある tmpDir からの相対パス
      const ticketsWithRef = {
        title: 'テスト',
        phases: [
          {
            id: 0,
            name: 'フェーズ0',
            tickets: [
              {
                id: 1,
                title: 'テストチケット',
                referenceSection: '0001-test-spec.md',
              },
            ],
          },
        ],
      };
      const ticketsPath = path.join(tmpDir, 'tickets-ref.json');
      fs.writeFileSync(ticketsPath, JSON.stringify(ticketsWithRef), 'utf8');

      const result = resolveSpecPath('P0-1', ticketsPath);
      assert.ok(result);
      assert.ok(result.endsWith('0001-test-spec.md'));
    });

    it('正常系: referenceSection がないチケットは null を返す', () => {
      const ticketsNoRef = {
        title: 'テスト',
        phases: [
          {
            id: 0,
            name: 'フェーズ0',
            tickets: [{ id: 1, title: 'no-ref', background: '何か' }],
          },
        ],
      };
      const ticketsPath = path.join(tmpDir, 'tickets-no-ref.json');
      fs.writeFileSync(ticketsPath, JSON.stringify(ticketsNoRef), 'utf8');

      const result = resolveSpecPath('P0-1', ticketsPath);
      assert.equal(result, null);
    });

    it('正常系: spec ファイルが存在しないパスでもエラーにならず null を返す', () => {
      const ticketsMissingFile = {
        title: 'テスト',
        phases: [
          {
            id: 0,
            name: 'フェーズ0',
            tickets: [
              { id: 1, title: 'missing', referenceSection: 'nonexistent/path.md' },
            ],
          },
        ],
      };
      const ticketsPath = path.join(tmpDir, 'tickets-missing.json');
      fs.writeFileSync(ticketsPath, JSON.stringify(ticketsMissingFile), 'utf8');

      const result = resolveSpecPath('P0-1', ticketsPath);
      assert.equal(result, null);
    });

    it('異常系: 存在しないチケットキーは null を返す', () => {
      const ticketsPath = path.join(tmpDir, 'tickets-empty.json');
      fs.writeFileSync(ticketsPath, JSON.stringify({ title: 'テスト', phases: [] }), 'utf8');

      const result = resolveSpecPath('P999-999', ticketsPath);
      assert.equal(result, null);
    });

    it('異常系: 不正なチケットキー形式は null を返す（例外を投げない）', () => {
      const ticketsPath = path.join(tmpDir, 'tickets-dummy.json');
      fs.writeFileSync(ticketsPath, JSON.stringify({ title: 'テスト', phases: [] }), 'utf8');

      const result = resolveSpecPath('invalid-key', ticketsPath);
      assert.equal(result, null);
    });

    it('正常系: PX-{id} 形式のチケットキーも解決できる', () => {
      const specPath = path.join(tmpDir, '0099-px-test.md');
      fs.writeFileSync(specPath, '# PXテスト\n', 'utf8');

      const ticketsPx = {
        title: 'テスト',
        phases: [
          {
            id: -1,
            name: '[X] 独立フェーズ',
            tickets: [
              {
                id: 99,
                title: 'PXテスト',
                referenceSection: '0099-px-test.md',
              },
            ],
          },
        ],
      };
      const ticketsPath = path.join(tmpDir, 'tickets-px.json');
      fs.writeFileSync(ticketsPath, JSON.stringify(ticketsPx), 'utf8');

      const result = resolveSpecPath('PX-99', ticketsPath);
      assert.ok(result);
      assert.ok(result.endsWith('0099-px-test.md'));
    });
  });
});
