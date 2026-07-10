/**
 * phasify-e2e.test.cjs — エンドツーエンドテスト（書き込みパス・循環検出・--dry-run）
 *
 * 実際のファイルI/Oを伴う phasify スクリプトの動作を検証する。
 * テスト用の一時ディレクトリを作成し、後でクリーンアップする。
 *
 * テストフレームワーク: Node.js 標準の node:test + node:assert/strict
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const PHASIFY_SCRIPT = path.resolve(__dirname, '../../.claude/scripts/rfc-graph/phasify-graph-and-dirs-files-tree.js');

// ============================================================
// ヘルパー: テスト用グラフデータ生成
// ============================================================

function makeSimpleGraph() {
  return {
    mainLanguage: 'rust',
    sourceFile: 'test.md',
    nodes: Array.from({ length: 30 }, (_, i) => ({
      id: 'N' + String(i + 1).padStart(4, '0'),
      kind: 'api_contract',
      language: 'rust',
      slug: 'test_' + (i + 1),
      title: 'Test Node ' + (i + 1),
      summary: 'Summary ' + (i + 1),
    })),
    edges: [
      { from: 'N0001', to: 'N0025', type: 'depends_on' },
      { from: 'N0002', to: 'N0005', type: 'depends_on' },
    ],
  };
}

function makeCyclicGraph() {
  const graph = makeSimpleGraph();
  // N0001→N0025 + N0025→N0001 = 循環
  graph.edges.push(
    { from: 'N0025', to: 'N0001', type: 'depends_on' },
  );
  return graph;
}

function makeSimpleDirsTree() {
  return {
    schemaVersion: '1.0',
    generatedAt: '2026-07-10',
    sourceGraph: 'test-GRAPH.json',
    sourceFile: 'test.md',
    analysis: {
      nodeCount: 30,
      kindCounts: { api_contract: 30 },
      edgeTypeCounts: { depends_on: 3 },
    },
    trees: {
      rust: { name: 'src', type: 'directory', children: [] },
    },
    dependencyDirections: {},
    warnings: [],
  };
}

// ============================================================
// E2E テスト
// ============================================================

describe('phasify E2E (write path, cycle detection, dry-run)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phasify-e2e-'));
  const graphPath = path.join(tmpDir, 'test-GRAPH.json');
  const dirsTreePath = path.join(tmpDir, 'test-Dirs-Tree.json');
  const ticketsPath = path.join(tmpDir, 'Tickets.json');

  before(() => {
    // テスト用の write-tickets-json-template.js を用意
    // 実際のスクリプトをそのまま使う
  });

  after(() => {
    // クリーンアップ
    try {
      const files = fs.readdirSync(tmpDir);
      for (const f of files) {
        const fp = path.join(tmpDir, f);
        fs.rmSync(fp, { force: true });
      }
      fs.rmdirSync(tmpDir);
    } catch {
      // cleanup errors are non-fatal
    }
  });

  // ----------------------------------------------------------
  // --dry-run モード
  // ----------------------------------------------------------
  describe('--dry-run mode', () => {
    before(() => {
      fs.writeFileSync(graphPath, JSON.stringify(makeSimpleGraph()));
      fs.writeFileSync(dirsTreePath, JSON.stringify(makeSimpleDirsTree()));
      // Tickets.json は作成しない（未存在テスト）
    });

    it('should not create Tickets.json in dry-run mode', () => {
      const result = spawnSync('node', [
        PHASIFY_SCRIPT,
        graphPath,
        dirsTreePath,
        '--dry-run',
      ], { encoding: 'utf8' });

      assert.strictEqual(result.status, 0, 'exit code should be 0. stderr: ' + result.stderr);
      assert.ok(!fs.existsSync(ticketsPath), 'Tickets.json should NOT be created in --dry-run');
    });

    it('should validate in-memory in dry-run mode', () => {
      const result = spawnSync('node', [
        PHASIFY_SCRIPT,
        graphPath,
        dirsTreePath,
        '--dry-run',
        '--verbose',
      ], { encoding: 'utf8' });

      // 検証がメモリ上で実行される（ディスクのTickets.jsonを読まない）
      // 結果の成否はともかく、「ファイル読み込みエラー」が発生しない
      assert.ok(!result.stdout.includes('ファイル読み込みエラー'),
        'dry-run でファイル読み込みエラーが発生: ' + result.stdout.substring(result.stdout.length - 300));
    });
  });

  // ----------------------------------------------------------
  // 書き込みパス（正常系）
  // ----------------------------------------------------------
  describe('write path (normal)', () => {
    before(() => {
      fs.writeFileSync(graphPath, JSON.stringify(makeSimpleGraph()));
      fs.writeFileSync(dirsTreePath, JSON.stringify(makeSimpleDirsTree()));
      // Tickets.json は未存在 → 自動生成される
    });

    it('should create Tickets.json and write phases', () => {
      // 事前にファイルが存在しないことを確認
      if (fs.existsSync(ticketsPath)) {
        fs.rmSync(ticketsPath);
      }

      const result = spawnSync('node', [
        PHASIFY_SCRIPT,
        graphPath,
        dirsTreePath,
      ], { encoding: 'utf8', timeout: 10000 });

      assert.strictEqual(result.status, 0, 'exit code 0 expected. stderr: ' + result.stderr);

      // Tickets.json が作成されたことを確認
      assert.ok(fs.existsSync(ticketsPath), 'Tickets.json should be created');

      const tickets = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
      assert.ok(tickets.phases, 'phases should exist');
      assert.ok(tickets.phases.length >= 2, '30 nodes / 10 = 3 phases');
    });

    it('should cover all nodes in phases', () => {
      const tickets = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
      const coveredIds = new Set();
      for (const phase of tickets.phases) {
        if (phase.nodeIds) {
          for (const nid of phase.nodeIds) {
            coveredIds.add(nid);
          }
        }
      }
      assert.strictEqual(coveredIds.size, 30, 'all 30 nodes should be covered');
    });

    it('should have nodeIds in phase objects', () => {
      const tickets = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
      for (const phase of tickets.phases) {
        assert.ok(Array.isArray(phase.nodeIds), 'phase ' + phase.id + ' should have nodeIds array');
      }
    });

    it('should overwrite existing Tickets.json', () => {
      // 2回目の実行で上書きされることを確認
      const result = spawnSync('node', [
        PHASIFY_SCRIPT,
        graphPath,
        dirsTreePath,
      ], { encoding: 'utf8', timeout: 10000 });

      assert.strictEqual(result.status, 0);
      assert.ok(fs.existsSync(ticketsPath));
      const tickets = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
      assert.ok(tickets.phases.length >= 2);
    });
  });

  // ----------------------------------------------------------
  // 循環依存検出
  // ----------------------------------------------------------
  describe('cycle detection', () => {
    it('should exit with code 1 on cyclic graph', () => {
      const cyclicGraphPath = path.join(tmpDir, 'cyclic-GRAPH.json');
      fs.writeFileSync(cyclicGraphPath, JSON.stringify(makeCyclicGraph()));

      const result = spawnSync('node', [
        PHASIFY_SCRIPT,
        cyclicGraphPath,
        dirsTreePath,
        '--dry-run',
      ], { encoding: 'utf8', timeout: 10000 });

      assert.strictEqual(result.status, 1, 'should exit with code 1 on cycle');
    });

    it('should output cycle error message', () => {
      const cyclicGraphPath = path.join(tmpDir, 'cyclic2-GRAPH.json');
      fs.writeFileSync(cyclicGraphPath, JSON.stringify(makeCyclicGraph()));

      const result = spawnSync('node', [
        PHASIFY_SCRIPT,
        cyclicGraphPath,
        dirsTreePath,
        '--dry-run',
      ], { encoding: 'utf8', timeout: 10000 });

      assert.ok(result.stderr.includes('循環') || result.stdout.includes('ERROR'),
        'should mention cycle in output: ' + result.stderr + result.stdout);
    });
  });

  // ----------------------------------------------------------
  // Dirs-Tree.json 未存在
  // ----------------------------------------------------------
  describe('missing Dirs-Tree.json', () => {
    it('should exit with code 3 when Dirs-Tree.json missing (same dir)', () => {
      const missingDirsPath = path.join(tmpDir, 'nonexistent-Dirs-Tree.json');
      const result = spawnSync('node', [
        PHASIFY_SCRIPT,
        graphPath,
        missingDirsPath,
        '--dry-run',
      ], { encoding: 'utf8', timeout: 10000 });

      assert.strictEqual(result.status, 3, 'should exit with code 3 (Dirs-Tree missing)');
    });
  });

  // ----------------------------------------------------------
  // 引数不足
  // ----------------------------------------------------------
  describe('missing arguments', () => {
    it('should exit with code 2 when no arguments', () => {
      const result = spawnSync('node', [
        PHASIFY_SCRIPT,
      ], { encoding: 'utf8', timeout: 10000 });

      assert.strictEqual(result.status, 2, 'should exit with code 2');
    });

    it('should exit with code 2 when only one argument', () => {
      const result = spawnSync('node', [
        PHASIFY_SCRIPT,
        graphPath,
      ], { encoding: 'utf8', timeout: 10000 });

      assert.strictEqual(result.status, 2, 'should exit with code 2 for 1 arg');
    });
  });
});
