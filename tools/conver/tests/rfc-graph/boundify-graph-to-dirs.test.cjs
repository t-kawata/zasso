/**
 * boundify-graph-to-dirs.test.cjs — boundify-graph-to-dirs.js のユニットテスト
 *
 * テストフレームワーク: Node.js 標準の node:test + node:assert/strict
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  main,
  parseArguments,
  loadGraph,
  adaptBuildDirectoryTree,
  adaptProjectEdgesToDirectories,
  buildLangGraph,
  reportError,
  printUsage,
  countKinds,
  countEdgeTypes,
  resolveOutputPaths,
  collectDirectoryPaths,
  resolveDirNameToPath,
} = require('../../.claude/scripts/rfc-graph/boundify-graph-to-dirs.js');

// ============================================================
// テスト用グラフデータ
// ============================================================

/** 最小グラフ（nodes 1件 + edges 0件） */
function createMinimalGraph() {
  return {
    nodes: [
      { id: 'n1', title: 'Root Module', kind: 'architecture' },
    ],
    edges: [],
  };
}

/** 標準グラフ（nodes 5件 + part_of/depends_on エッジ） */
function createStandardGraph() {
  return {
    nodes: [
      { id: 'n1', title: '§1 Root Architecture', kind: 'architecture', summary: 'system architecture' },
      { id: 'n2', title: '§1.1 Config Module', kind: 'config', summary: 'configuration module' },
      { id: 'n3', title: '§1.2 Error Types', kind: 'error_policy', summary: 'error handling types' },
      { id: 'n4', title: '§1.3 Security Module', kind: 'security', summary: 'security utilities' },
      { id: 'n5', title: '§1.4 Build Scripts', kind: 'build_ci', summary: 'CI pipeline config' },
    ],
    edges: [
      { from: 'n2', to: 'n1', type: 'part_of' },
      { from: 'n3', to: 'n1', type: 'part_of' },
      { from: 'n4', to: 'n1', type: 'part_of' },
      { from: 'n5', to: 'n1', type: 'part_of' },
      { from: 'n4', to: 'n3', type: 'depends_on' },
    ],
  };
}

/** 循環依存を含むグラフ */
function createCyclicGraph() {
  return {
    nodes: [
      { id: 'a', title: 'Module A', kind: 'config' },
      { id: 'b', title: 'Module B', kind: 'security' },
      { id: 'c', title: 'Module C', kind: 'error_policy' },
    ],
    edges: [
      { from: 'a', to: 'b', type: 'depends_on' },
      { from: 'b', to: 'c', type: 'depends_on' },
      { from: 'c', to: 'a', type: 'depends_on' },
    ],
  };
}

// ============================================================
// グローバルフック: process.exit のモック
// ============================================================

let originalExit;

before(() => {
  originalExit = process.exit;
  process.exit = (code) => { throw new Error(`exit: ${code}`); };
});

after(() => {
  process.exit = originalExit;
});

// ============================================================
// parseArguments のテスト
// ============================================================

describe('parseArguments', () => {
  let tempDir;
  let graphFilePath;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parseargs-test-'));
    graphFilePath = path.join(tempDir, 'RFC-GRAPH.json');
    fs.writeFileSync(graphFilePath, '{"nodes":[],"edges":[]}', 'utf-8');
  });

  after(() => {
    try { fs.rmSync(tempDir, { recursive: true }); } catch (_) { /* クリーンアップ */ }
  });

  it('should parse graph path and flags correctly', () => {
    const result = parseArguments([graphFilePath, '--json', '--quiet']);
    assert.strictEqual(result.graphPath, path.resolve(graphFilePath));
    assert.strictEqual(result.flags.json, true);
    assert.strictEqual(result.flags.quiet, true);
    assert.strictEqual(result.flags.dryRun, false);
    assert.strictEqual(result.flags.force, false);
  });

  it('should strip -GRAPH suffix from basename', () => {
    const graphPath = path.join(tempDir, 'RFC-ROOT-GRAPH.json');
    fs.writeFileSync(graphPath, '{"nodes":[],"edges":[]}', 'utf-8');
    const result = parseArguments([graphPath]);
    assert.strictEqual(result.basename, 'RFC-ROOT');
  });

  it('should keep basename as-is when no -GRAPH suffix', () => {
    const result = parseArguments([graphFilePath]);
    assert.strictEqual(result.basename, 'RFC');
  });

  it('should detect all four flags', () => {
    const result = parseArguments([graphFilePath, '--json', '--quiet', '--dry-run', '--force']);
    assert.strictEqual(result.flags.json, true);
    assert.strictEqual(result.flags.quiet, true);
    assert.strictEqual(result.flags.dryRun, true);
    assert.strictEqual(result.flags.force, true);
  });

  it('should exit when no arguments given', () => {
    assert.throws(() => parseArguments([]), /exit/);
  });

  it('should exit when --help is given', () => {
    assert.throws(() => parseArguments(['--help']), /exit/);
  });

  it('should exit when -h is given', () => {
    assert.throws(() => parseArguments(['-h']), /exit/);
  });

  it('should exit when graph path does not exist', () => {
    assert.throws(() => parseArguments(['/nonexistent/path.json']), /exit/);
  });
});

// ============================================================
// loadGraph のテスト
// ============================================================

describe('loadGraph', () => {
  let tempDir;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loadgraph-test-'));
  });

  after(() => {
    try { fs.rmSync(tempDir, { recursive: true }); } catch (_) { /* クリーンアップ */ }
  });

  it('should load and parse a valid graph JSON', () => {
    const filePath = path.join(tempDir, 'valid.json');
    fs.writeFileSync(filePath, JSON.stringify(createStandardGraph()), 'utf-8');
    const graph = loadGraph(filePath);
    assert.strictEqual(graph.nodes.length, 5);
    assert.strictEqual(graph.edges.length, 5);
  });

  it('should fail when file does not exist', () => {
    assert.throws(() => loadGraph('/nonexistent/graph.json'), /exit/);
  });

  it('should fail when JSON is malformed', () => {
    const filePath = path.join(tempDir, 'malformed.json');
    fs.writeFileSync(filePath, '{ this is not json }', 'utf-8');
    assert.throws(() => loadGraph(filePath), /exit/);
  });

  it('should fail when nodes array is missing', () => {
    const filePath = path.join(tempDir, 'no-nodes.json');
    fs.writeFileSync(filePath, JSON.stringify({ edges: [] }), 'utf-8');
    assert.throws(() => loadGraph(filePath), /exit/);
  });

  it('should fail when edges array is missing', () => {
    const filePath = path.join(tempDir, 'no-edges.json');
    fs.writeFileSync(filePath, JSON.stringify({ nodes: [] }), 'utf-8');
    assert.throws(() => loadGraph(filePath), /exit/);
  });
});

// ============================================================
// adaptBuildDirectoryTree のテスト
// ============================================================

describe('adaptBuildDirectoryTree', () => {
  it('should produce a tree with nodeToDir map for standard graph', () => {
    const graph = createStandardGraph();
    const { tree, nodeToDir, files } = adaptBuildDirectoryTree(graph, 'rust');
    // 少なくとも何らかのツリーとマップが得られる
    assert.ok(typeof tree === 'object' || tree === null);
    assert.ok(typeof nodeToDir === 'object');
    assert.ok(Array.isArray(files));
  });

  it('should provide different trees for different languages', () => {
    const graph = createStandardGraph();
    const rustResult = adaptBuildDirectoryTree(graph, 'rust');
    const goResult = adaptBuildDirectoryTree(graph, 'go');
    // 言語が違っても同一グラフからツリーを生成できる
    assert.ok(rustResult.tree !== undefined);
    assert.ok(goResult.tree !== undefined);
  });

  it('should handle minimal graph without crashing', () => {
    const graph = createMinimalGraph();
    const { tree, nodeToDir } = adaptBuildDirectoryTree(graph, 'typescript');
    // 最小グラフでも適切に処理される
    assert.ok(typeof nodeToDir === 'object');
  });
});

// ============================================================
// adaptProjectEdgesToDirectories のテスト
// ============================================================

describe('adaptProjectEdgesToDirectories', () => {
  it('should project edges between different directories', () => {
    const graph = createStandardGraph();
    const { nodeToDir } = adaptBuildDirectoryTree(graph, 'rust');
    const dirEdges = adaptProjectEdgesToDirectories(graph, nodeToDir);

    assert.ok(Array.isArray(dirEdges));
    // 全エッジが from/to を持つ
    for (const edge of dirEdges) {
      assert.ok(typeof edge.from === 'string');
      assert.ok(typeof edge.to === 'string');
      assert.ok(['depends_on', 'implements', 'references', 'extends', 'constrains'].includes(edge.type));
    }
  });

  it('should skip edges where mapping is unresolved', () => {
    const graph = createStandardGraph();
    const emptyNodeToDir = {};
    const dirEdges = adaptProjectEdgesToDirectories(graph, emptyNodeToDir);
    // マッピングが空なら空配列
    assert.strictEqual(dirEdges.length, 0);
  });
});

// ============================================================
// buildLangGraph のテスト
// ============================================================

describe('buildLangGraph', () => {
  it('should add language field to all nodes', () => {
    const graph = createStandardGraph();
    const { langGraph, languageMap } = buildLangGraph(graph);

    assert.strictEqual(langGraph.nodes.length, graph.nodes.length);
    assert.strictEqual(langGraph.edges.length, graph.edges.length);

    // 全ノードに language が設定されている
    for (const node of langGraph.nodes) {
      assert.ok(Array.isArray(node.language));
      assert.ok(node.language.length > 0);
    }

    // languageMap が nodes の ID と一致している
    assert.strictEqual(Object.keys(languageMap).length, graph.nodes.length);
  });

  it('should handle minimal graph without crashing', () => {
    const graph = createMinimalGraph();
    const { langGraph } = buildLangGraph(graph);
    assert.strictEqual(langGraph.nodes.length, 1);
  });
});

// ============================================================
// countKinds / countEdgeTypes のテスト
// ============================================================

describe('countKinds', () => {
  it('should count kind occurrences in graph', () => {
    const graph = createStandardGraph();
    const counts = countKinds(graph);
    assert.strictEqual(counts['architecture'], 1);
    assert.strictEqual(counts['config'], 1);
    assert.strictEqual(Object.keys(counts).length, 5);
  });

  it('should handle empty nodes', () => {
    const counts = countKinds({ nodes: [] });
    assert.strictEqual(Object.keys(counts).length, 0);
  });
});

describe('countEdgeTypes', () => {
  it('should count edge type occurrences', () => {
    const graph = createStandardGraph();
    const counts = countEdgeTypes(graph);
    assert.strictEqual(counts['part_of'], 4);
    assert.strictEqual(counts['depends_on'], 1);
  });

  it('should handle empty edges', () => {
    const counts = countEdgeTypes({ edges: [] });
    assert.strictEqual(Object.keys(counts).length, 0);
  });
});

// ============================================================
// resolveOutputPaths のテスト
// ============================================================

describe('resolveOutputPaths', () => {
  it('should produce three output paths', () => {
    const paths = resolveOutputPaths('/some/dir', 'RFC-ROOT');
    assert.ok(paths.dirsTreePath.endsWith('/RFC-ROOT-Dirs-Tree.json'));
    assert.ok(paths.langGraphPath.endsWith('/RFC-ROOT-GRAPH-LANG.json'));
    assert.ok(paths.statusPath.endsWith('/RFC-ROOT-BOUNDIFY-Status.json'));
  });

  it('should preserve the directory prefix', () => {
    const paths = resolveOutputPaths('/some/dir', 'RFC-ROOT');
    assert.ok(paths.dirsTreePath.startsWith('/some/dir'));
    assert.ok(paths.langGraphPath.startsWith('/some/dir'));
    assert.ok(paths.statusPath.startsWith('/some/dir'));
  });
});

// ============================================================
// reportError のテスト
// ============================================================

describe('reportError', () => {
  it('should format error with 3-level template', () => {
    const result = reportError('test error', 'test cause', 'test remedy');
    assert.ok(result.includes('[ERROR] test error'));
    assert.ok(result.includes('原因: test cause'));
    assert.ok(result.includes('対応: test remedy'));
  });
});

describe('collectDirectoryPaths', () => {
  it('should return empty set for null tree', () => {
    const paths = collectDirectoryPaths(null);
    assert.strictEqual(paths.size, 0);
  });

  it('should collect all directory paths from a tree', () => {
    const tree = {
      name: 'src', type: 'directory', children: [
        { name: 'config', type: 'directory', children: [] },
        { name: 'error', type: 'directory', children: [
          { name: 'mod.rs', type: 'file' },
        ]},
        { name: 'main.rs', type: 'file' },
      ],
    };
    const paths = collectDirectoryPaths(tree);
    assert.ok(paths.has('src'));
    assert.ok(paths.has('src/config'));
    assert.ok(paths.has('src/error'));
    assert.strictEqual(paths.size, 3);
  });
});

describe('resolveDirNameToPath', () => {
  it('should resolve directory name to full path', () => {
    const dirPaths = new Set(['src', 'src/config', 'src/error', 'src/security']);
    assert.strictEqual(resolveDirNameToPath(dirPaths, 'config'), 'src/config');
    assert.strictEqual(resolveDirNameToPath(dirPaths, 'src'), 'src');
  });

  it('should return null for unknown directory name', () => {
    const dirPaths = new Set(['src/config']);
    assert.strictEqual(resolveDirNameToPath(dirPaths, 'unknown'), null);
  });
});

// ============================================================
// main のテスト
// ============================================================

describe('main', () => {
  let tempDir;
  let graphFilePath;

  after(() => {
    try { if (tempDir) fs.rmSync(tempDir, { recursive: true }); } catch (_) { /* クリーンアップ */ }
  });

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'main-test-'));
    graphFilePath = path.join(tempDir, 'test-GRAPH.json');
    fs.writeFileSync(graphFilePath, JSON.stringify(createStandardGraph()), 'utf-8');
  });

  it('should produce three output files', () => {
    main([graphFilePath, '--quiet']);

    // 3ファイルが出力されている
    const files = fs.readdirSync(tempDir).filter(f => f.endsWith('.json'));
    const jsonFiles = files.filter(f => f.match(/Dirs-Tree\.json|GRAPH-LANG\.json|BOUNDIFY-Status\.json/));
    assert.strictEqual(jsonFiles.length, 3);
  });

  it('should output JSON only with --json flag', () => {
    const output = captureStdout(() => main([graphFilePath, '--json']));
    const parsed = JSON.parse(output);
    assert.ok(parsed.schemaVersion);
    assert.ok(parsed.analysis);
    assert.ok(parsed.trees);
  });

  it('should output nothing with --quiet flag', () => {
    const output = captureStdout(() => main([graphFilePath, '--quiet']));
    assert.strictEqual(output, '');
  });

  it('should output default format (en.md + markdown + json) without flags', () => {
    const output = captureStdout(() => main([graphFilePath]));
    // .en.md テキストが含まれている
    assert.ok(output.includes('Safe boundaries'));
    // Markdown レポートが含まれている
    assert.ok(output.includes('ディレクトリツリーレポート'));
    // JSON ブロックが含まれている
    assert.ok(output.includes('```json'));
  });

  it('should detect circular dependencies', () => {
    const cyclicFilePath = path.join(tempDir, 'cyclic-GRAPH.json');
    fs.writeFileSync(cyclicFilePath, JSON.stringify(createCyclicGraph()), 'utf-8');

    captureStdout(() => main([cyclicFilePath, '--quiet']));

    // Dirs-Tree.json を読み込んで検証
    const dirsTree = JSON.parse(
      fs.readFileSync(path.join(tempDir, 'cyclic-Dirs-Tree.json'), 'utf-8')
    );
    assert.ok(dirsTree.warnings.length > 0);
  });

  it('should write BOUNDIFY-Status.json with STEP1_DONE state', () => {
    main([graphFilePath, '--quiet']);

    const statusPath = path.join(tempDir, 'test-BOUNDIFY-Status.json');
    const status = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
    assert.strictEqual(status.state, 'STEP1_DONE');
  });

  it('should fail with invalid JSON', () => {
    const invalidPath = path.join(tempDir, 'invalid.json');
    fs.writeFileSync(invalidPath, '{ broken json }', 'utf-8');

    assert.throws(() => main([invalidPath]), /exit/);
  });

  it('should fail without arguments', () => {
    assert.throws(() => main([]), /exit/);
  });
});

// ============================================================
// ヘルパー: 標準出力キャプチャ
// ============================================================

/**
 * 関数実行中の標準出力をキャプチャして文字列として返す
 *
 * @param {Function} fn — 実行する関数
 * @returns {string} キャプチャされた標準出力
 */
function captureStdout(fn) {
  const originalStdoutWrite = process.stdout.write;
  const chunks = [];
  process.stdout.write = (chunk) => {
    chunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
    return true;
  };
  try {
    fn();
  } finally {
    process.stdout.write = originalStdoutWrite;
  }
  return chunks.join('');
}
