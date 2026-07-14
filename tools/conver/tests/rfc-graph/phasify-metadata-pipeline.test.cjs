/**
 * phasify-metadata-pipeline.test.cjs — phasify→Tickets.json→resolve-ticket-context 結合テスト
 *
 * 以下のパイプライン全体が正しく動作することを検証する:
 *   phasify-graph-and-dirs-files-tree.js
 *     ↓ 生成
 *   Tickets.json（metadata に source + resolvedPaths）
 *     ↓ 読み取り
 *   resolve-ticket-context.js（出力に rfcPath, graphPath, dirsTreePath）
 *
 * PX-55 / PX-56 の Acceptance Criteria をカバーする。
 *
 * テストフレームワーク: Node.js 標準の node:test + node:assert/strict
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

// ============================================================
// スクリプトパス
// ============================================================

const PHASIFY_SCRIPT = path.resolve(__dirname, '../../.claude/scripts/rfc-graph/phasify-graph-and-dirs-files-tree.js');
const RESOLVE_SCRIPT = path.resolve(__dirname, '../../.claude/scripts/tickets/resolve-ticket-context.js');

// ============================================================
// ヘルパー: テスト用グラフ生成
// ============================================================

function makeGraph() {
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

function makeDirsTree() {
  return {
    schemaVersion: '1.0',
    generatedAt: '2026-07-14',
    sourceGraph: 'test-GRAPH.json',
    sourceFile: 'test.md',
    analysis: {
      nodeCount: 30,
      kindCounts: { api_contract: 30 },
      edgeTypeCounts: { depends_on: 2 },
    },
    trees: {
      rust: { name: 'src', type: 'directory', children: [] },
    },
    dependencyDirections: {},
    warnings: [],
  };
}

// ============================================================
// 結合テスト
// ============================================================

describe('phasify → Tickets.json metadata → resolve-ticket-context pipeline', () => {
  let tmpDir;
  let graphPath;
  let dirsTreePath;
  let ticketsPath;
  let rfcPath;
  let graphFilePath;
  let dirsTreeFilePath;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phasify-pipe-'));
    graphPath = path.join(tmpDir, 'RFC-ROOT-GRAPH.json');
    dirsTreePath = path.join(tmpDir, 'RFC-ROOT-Dirs-Tree.json');
    ticketsPath = path.join(tmpDir, 'Tickets.json');
    rfcPath = path.join(tmpDir, 'RFC-ROOT.md');
    graphFilePath = graphPath;
    dirsTreeFilePath = dirsTreePath;

    // テスト用のグラフと Dirs-Tree を作成
    fs.writeFileSync(graphPath, JSON.stringify(makeGraph()));
    fs.writeFileSync(dirsTreePath, JSON.stringify(makeDirsTree()));

    // RFC.md を作成（resolvedPaths の実在確認用）
    fs.writeFileSync(rfcPath, '# RFC-ROOT Test Document\n\nTest content for phasify metadata pipeline.\n');
  });

  after(() => {
    // クリーンアップ
    try {
      const files = fs.readdirSync(tmpDir);
      for (const f of files) {
        fs.rmSync(path.join(tmpDir, f), { force: true });
      }
      fs.rmdirSync(tmpDir);
    } catch {
      // cleanup errors are non-fatal
    }
  });

  // ----------------------------------------------------------
  // PX-55: phasify が Tickets.json metadata に resolvedPaths を出力する
  // ----------------------------------------------------------

  describe('PX-55: Tickets.json metadata resolvedPaths', () => {
    before(() => {
      // Tickets.json が存在しない状態で phasify を実行
      if (fs.existsSync(ticketsPath)) {
        fs.rmSync(ticketsPath);
      }
      const result = spawnSync('node', [
        PHASIFY_SCRIPT,
        graphPath,
        dirsTreePath,
      ], { encoding: 'utf8', timeout: 10000 });
      assert.strictEqual(result.status, 0, `phasify exit code should be 0. stderr: ${result.stderr}`);
    });

    it('should create Tickets.json', () => {
      assert.ok(fs.existsSync(ticketsPath), 'Tickets.json should be created');
    });

    it('should have metadata.source pointing to .md (not .json)', () => {
      const tickets = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
      assert.ok(tickets.metadata, 'metadata should exist');
      assert.ok(tickets.metadata.source.endsWith('.md'),
        `metadata.source should end with .md, got: ${tickets.metadata.source}`);
      assert.ok(!tickets.metadata.source.endsWith('.json'),
        `metadata.source should NOT end with .json, got: ${tickets.metadata.source}`);
    });

    it('should have metadata.resolvedPaths with all three fields', () => {
      const tickets = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
      assert.ok(tickets.metadata.resolvedPaths, 'resolvedPaths should exist');
      assert.ok(tickets.metadata.resolvedPaths.rfcPath, 'resolvedPaths.rfcPath should exist');
      assert.ok(tickets.metadata.resolvedPaths.graphPath, 'resolvedPaths.graphPath should exist');
      assert.ok(tickets.metadata.resolvedPaths.dirsTreePath, 'resolvedPaths.dirsTreePath should exist');
    });

    it('should have resolvedPaths.rfcPath pointing to .md file', () => {
      const tickets = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
      assert.ok(tickets.metadata.resolvedPaths.rfcPath.endsWith('.md'),
        `rfcPath should end with .md, got: ${tickets.metadata.resolvedPaths.rfcPath}`);
    });

    it('should have resolvedPaths.graphPath pointing to the GRAPH.json input', () => {
      const tickets = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
      assert.equal(tickets.metadata.resolvedPaths.graphPath, graphPath,
        `graphPath should match input: ${graphPath}`);
    });

    it('should have resolvedPaths.dirsTreePath pointing to the Dirs-Tree.json input', () => {
      const tickets = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
      assert.equal(tickets.metadata.resolvedPaths.dirsTreePath, dirsTreePath,
        `dirsTreePath should match input: ${dirsTreePath}`);
    });

    it('should have metadata.source equal to resolvedPaths.rfcPath', () => {
      const tickets = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
      assert.equal(tickets.metadata.source, tickets.metadata.resolvedPaths.rfcPath,
        'source should equal resolvedPaths.rfcPath');
    });

    it('should have existing files at all three resolvedPaths', () => {
      const { resolvedPaths } = JSON.parse(fs.readFileSync(ticketsPath, 'utf8')).metadata;
      assert.ok(fs.existsSync(resolvedPaths.rfcPath), `rfcPath file should exist: ${resolvedPaths.rfcPath}`);
      assert.ok(fs.existsSync(resolvedPaths.graphPath), `graphPath file should exist: ${resolvedPaths.graphPath}`);
      assert.ok(fs.existsSync(resolvedPaths.dirsTreePath), `dirsTreePath file should exist: ${resolvedPaths.dirsTreePath}`);
    });

    it('should have analyzedSections in metadata', () => {
      const tickets = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
      assert.ok(tickets.metadata.analyzedSections, 'analyzedSections should exist');
    });

    it('should have phases array in Tickets.json', () => {
      const tickets = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
      assert.ok(Array.isArray(tickets.phases), 'phases should be an array');
      assert.ok(tickets.phases.length >= 1, 'at least one phase');
    });

    it('should preserve metadata on re-run (phases overwritten, metadata unchanged)', () => {
      // 1回目の metadata を記録
      const first = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
      const firstMeta = JSON.stringify(first.metadata);
      const firstPhaseCount = first.phases.length;

      // 2回目の phasify 実行
      const result = spawnSync('node', [
        PHASIFY_SCRIPT,
        graphPath,
        dirsTreePath,
      ], { encoding: 'utf8', timeout: 10000 });
      assert.strictEqual(result.status, 0);

      // 2回目の metadata が同じであること
      const second = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
      const secondMeta = JSON.stringify(second.metadata);
      assert.equal(secondMeta, firstMeta, 'metadata should be preserved on re-run');

      // phases は上書きされていること（同じ結果になるはずだが再生成はされている）
      assert.ok(second.phases.length >= 1, 'phases should exist after re-run');
    });
  });

  // ----------------------------------------------------------
  // PX-56: resolve-ticket-context が rfcPath を出力する
  // ----------------------------------------------------------

  describe('PX-56: resolve-ticket-context outputs rfcPath', () => {
    it('should output rfcPath in JSON (not docPath)', () => {
      const result = spawnSync('node', [
        RESOLVE_SCRIPT,
        `--ticket-key=P0-1`,
        `--title=Test Ticket`,
        `--tickets=${ticketsPath}`,
      ], { encoding: 'utf8', timeout: 10000 });

      assert.strictEqual(result.status, 0, `resolve-ticket-context exit code should be 0. stderr: ${result.stderr}`);

      const output = JSON.parse(result.stdout);
      assert.ok(output.success, 'resolve-ticket-context should succeed');

      // rfcPath が存在し docPath が存在しないこと
      assert.ok(output.hasOwnProperty('rfcPath'), 'output should have rfcPath property');
      assert.ok(!output.hasOwnProperty('docPath'), 'output should NOT have docPath property');

      // rfcPath が .md ファイルを指していること
      assert.ok(output.rfcPath.endsWith('.md'), `rfcPath should end with .md, got: ${output.rfcPath}`);
    });

    it('should output rfcPathSource (not docPathSource)', () => {
      const result = spawnSync('node', [
        RESOLVE_SCRIPT,
        `--ticket-key=P0-1`,
        `--title=Test Ticket`,
        `--tickets=${ticketsPath}`,
      ], { encoding: 'utf8', timeout: 10000 });

      assert.strictEqual(result.status, 0);
      const output = JSON.parse(result.stdout);

      assert.ok(output.hasOwnProperty('rfcPathSource'), 'output should have rfcPathSource property');
      assert.ok(!output.hasOwnProperty('docPathSource'), 'output should NOT have docPathSource property');
    });

    it('should have pipelineAvailable=false (ticket P0-1 not yet created, but paths are resolved)', () => {
      const result = spawnSync('node', [
        RESOLVE_SCRIPT,
        `--ticket-key=P0-1`,
        `--title=Test Ticket`,
        `--tickets=${ticketsPath}`,
      ], { encoding: 'utf8', timeout: 10000 });

      assert.strictEqual(result.status, 0);
      const output = JSON.parse(result.stdout);

      // pipelineAvailable は ticket exists && rfcPath && graphPath && dirsTreePath 全てが必要。
      // phasify は phases のみ作成し個別チケットは作成しないため、exists=false → pipelineAvailable=false が正しい。
      // しかし rfcPath/graphPath/dirsTreePath は正しく解決されている。
      assert.equal(output.pipelineAvailable, false,
        'pipelineAvailable should be false because ticket P0-1 does not exist yet');
      assert.ok(output.available.includes('rfcPath'), 'available should include rfcPath');
      assert.ok(output.graphPath, 'graphPath should be resolved');
      assert.ok(output.dirsTreePath, 'dirsTreePath should be resolved');
    });

    it('should have correct graphPath and dirsTreePath in output', () => {
      const result = spawnSync('node', [
        RESOLVE_SCRIPT,
        `--ticket-key=P0-1`,
        `--title=Test Ticket`,
        `--tickets=${ticketsPath}`,
      ], { encoding: 'utf8', timeout: 10000 });

      assert.strictEqual(result.status, 0);
      const output = JSON.parse(result.stdout);

      assert.equal(output.graphPath, graphPath, 'graphPath should match input');
      assert.equal(output.dirsTreePath, dirsTreePath, 'dirsTreePath should match input');
    });

    it('should have rfcPathSource set to "resolvedPaths"', () => {
      const result = spawnSync('node', [
        RESOLVE_SCRIPT,
        `--ticket-key=P0-1`,
        `--title=Test Ticket`,
        `--tickets=${ticketsPath}`,
      ], { encoding: 'utf8', timeout: 10000 });

      assert.strictEqual(result.status, 0);
      const output = JSON.parse(result.stdout);

      // resolvedPaths が存在するので、ソースは 'resolvedPaths' になる
      assert.equal(output.rfcPathSource, 'resolvedPaths',
        `rfcPathSource should be 'resolvedPaths', got: ${output.rfcPathSource}`);
    });

    it('should have ticketKey, exists, specPath in output', () => {
      const result = spawnSync('node', [
        RESOLVE_SCRIPT,
        `--ticket-key=P0-1`,
        `--title=Test Ticket`,
        `--tickets=${ticketsPath}`,
      ], { encoding: 'utf8', timeout: 10000 });

      assert.strictEqual(result.status, 0);
      const output = JSON.parse(result.stdout);

      assert.equal(output.ticketKey, 'P0-1');
      assert.ok(output.hasOwnProperty('exists'));
      assert.ok(output.hasOwnProperty('specPath'));
      assert.ok(output.hasOwnProperty('specExists'));
      assert.ok(output.hasOwnProperty('autoCreated'));
    });

    it('should list rfcPath in available (not missing)', () => {
      const result = spawnSync('node', [
        RESOLVE_SCRIPT,
        `--ticket-key=P0-1`,
        `--title=Test Ticket`,
        `--tickets=${ticketsPath}`,
      ], { encoding: 'utf8', timeout: 10000 });

      assert.strictEqual(result.status, 0);
      const output = JSON.parse(result.stdout);

      assert.ok(output.available.includes('rfcPath'), 'available should include rfcPath');
      assert.ok(!output.available.includes('docPath'), 'available should NOT include docPath');
      assert.ok(!output.missing.includes('rfcPath'), 'missing should NOT include rfcPath');
    });
  });
});
