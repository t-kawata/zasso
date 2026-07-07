#!/usr/bin/env node
/**
 * boundify-graph-to-dirs.js <graph-json-path> [--json] [--dry-run] [--force]
 *
 * graphify が生成したグラフJSONを解析し、安全な境界を持つディレクトリツリーを
 * 提案する。Dirs-Tree.json、GRAPH-LANG.json、*-BOUNDIFY-Status.json を出力する。
 *
 * 下位層モジュール（boundify-helpers.js、boundify-tree.js）を require で読み込み、
 * アダプター関数を介して関数シグネチャの差異を吸収する。
 *
 * CLI: boundify-graph-to-dirs.js /path/to/RFC-ROOT-GRAPH.json [--json] [--quiet]
 *
 * 出力契約:
 *   --json なし → 標準出力に .en.md + Markdown分析 + ```json ブロック
 *   --json あり → 標準出力に JSON のみ
 *   --quiet     → 標準出力を抑制（ファイル出力のみ）
 *   常にグラフ同ディレクトリに Dirs-Tree.json / GRAPH-LANG.json / *-BOUNDIFY-Status.json を書き出す
 *
 * @module boundify-graph-to-dirs
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ============================================================
// 既存下位層モジュールの読み込み
// ============================================================

const helpers = require('./boundify-helpers.js');
const treeBuilder = require('./boundify-tree.js');
const { validateFiles } = require('./validate-dirs-tree-schema.js');

// ============================================================
// 定数定義
// ============================================================

/** 正常終了コード */
const EXIT_SUCCESS = 0;
/** 異常終了コード */
const EXIT_FAILURE = 1;

/** 対応言語の一覧 */
const SUPPORTED_LANGUAGES = Object.freeze(['rust', 'go', 'typescript']);

/** 3段テンプレートエラー — 引数不足時 */
const ERROR_MISSING_ARGS =
  '[ERROR] 引数が不足しています\n' +
  '原因: グラフJSONファイルのパスが必要です\n' +
  '対応: boundify-graph-to-dirs.js <graph-json-path> [--json] [--quiet] [--dry-run] [--force]';

/** DIRECTIONAL_EDGE_TYPES — helpers から流用 */
const DIRECTIONAL_EDGE_TYPES = helpers.DIRECTIONAL_EDGE_TYPES;

// ============================================================
// エラー報告（3段テンプレート）
// ============================================================

/**
 * 3段テンプレート形式でエラーを stderr に出力する
 *
 * @param {string} message — エラー概要
 * @param {string} cause — 原因
 * @param {string} remedy — 対応方法
 * @returns {string} 整形されたエラーテキスト
 */
function reportError(message, cause, remedy) {
  const text = `[ERROR] ${message}\n原因: ${cause}\n対応: ${remedy}`;
  console.error(text);
  return text;
}

// ============================================================
// 使用方法の表示
// ============================================================

/**
 * スクリプトの使い方を表示する
 */
function printUsage() {
  console.log(`\
boundify-graph-to-dirs.js <graph-json-path> [--json] [--dry-run] [--force]

Arguments:
  <graph-json-path>  グラフJSONファイルのパス（必須）

Flags:
  --json             JSONのみを標準出力に出力
  --quiet            標準出力を抑制（ファイル出力のみ）
  --dry-run          ファイル生成を行わず予定一覧を表示
  --force            既存ファイルを上書きして生成
  --help, -h         このヘルプを表示`);
}

// ============================================================
// 引数パース
// ============================================================

/**
 * コマンドライン引数をパースする
 *
 * @param {string[]} [testArgs] — テスト用の引数配列（省略時は process.argv）
 * @returns {{ graphPath: string, graphDir: string, basename: string, flags: { json: boolean, dryRun: boolean, force: boolean, quiet: boolean } }}
 * @throws {never} — 異常時は process.exit(EXIT_FAILURE) で終了
 */
function parseArguments(testArgs) {
  const args = testArgs || process.argv.slice(2);

  // 引数なし、または --help/-h の場合は使用方法を表示して終了
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage();
    process.exit(EXIT_SUCCESS);
  }

  // 第1引数をグラフパスとして解決
  const graphPath = path.resolve(args[0]);
  if (!fs.existsSync(graphPath)) {
    reportError(
      `グラフファイルが見つかりません: ${graphPath}`,
      '指定されたパスにファイルが存在しない',
      'グラフJSONファイルの正しいパスを指定してください' +
        '（例: node boundify-graph-to-dirs.js ./RFC-ROOT-GRAPH.json）'
    );
    process.exit(EXIT_FAILURE);
  }

  const flags = {
    json: args.includes('--json'),
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force'),
    quiet: args.includes('--quiet'),
  };

  const graphDir = path.dirname(graphPath);
  const baseName = path.basename(graphPath, path.extname(graphPath));
  // basename: 接尾辞 -GRAPH があれば除去、なければファイル名そのまま
  const basename = baseName.endsWith('-GRAPH') ? baseName.slice(0, -6) : baseName;

  return { graphPath, graphDir, basename, flags };
}

// ============================================================
// グラフ読み込みと検証
// ============================================================

/**
 * グラフJSONファイルを読み込み、nodes/edges の存在を検証する
 *
 * @param {string} graphPath — グラフJSONファイルのパス
 * @returns {{ nodes: object[], edges: object[] }} パースされたグラフオブジェクト
 * @throws {never} — 異常時は process.exit(EXIT_FAILURE) で終了
 */
function loadGraph(graphPath) {
  let raw;
  try {
    raw = fs.readFileSync(graphPath, 'utf-8');
  } catch (e) {
    reportError(
      `グラフファイルの読み込みに失敗しました: ${e.message}`,
      'ファイルI/Oエラー',
      'ファイルのパーミッションと存在を確認してください'
    );
    process.exit(EXIT_FAILURE);
  }

  let graph;
  try {
    graph = JSON.parse(raw);
  } catch (e) {
    reportError(
      `グラフJSONのパースに失敗しました: ${e.message}`,
      'JSON形式が不正',
      'グラフファイルが有効なJSONであることを確認してください' +
        '（node -e "JSON.parse(fs.readFileSync(...))" で検証可能）'
    );
    process.exit(EXIT_FAILURE);
  }

  if (!graph.nodes || !Array.isArray(graph.nodes)) {
    reportError(
      'グラフJSONに nodes 配列が見つかりません',
      '必須フィールド nodes が欠落',
      '/graphify-rfc で生成された正しいグラフJSONを入力してください'
    );
    process.exit(EXIT_FAILURE);
  }

  if (!graph.edges || !Array.isArray(graph.edges)) {
    reportError(
      'グラフJSONに edges 配列が見つかりません',
      '必須フィールド edges が欠落',
      '/graphify-rfc で生成された正しいグラフJSONを入力してください'
    );
    process.exit(EXIT_FAILURE);
  }

  return graph;
}

// ============================================================
// アダプター関数 — 既存下位層とRFC §4.2 のシグネチャ差異を吸収
// ============================================================

/**
 * P18-1 (boundify-tree.js) の buildDirectoryTree をアダプトする
 *
 * RFC §4.2 は buildDirectoryTree(graph, lang) の2引数だが、
 * P18-1 の実装は buildDirectoryTree(graph, lang, helpers) の3引数。
 * 本アダプターが helpers オブジェクトを注入する。
 *
 * @param {object} graph — グラフオブジェクト
 * @param {string} lang — 言語名 ('rust' | 'go' | 'typescript')
 * @returns {{ tree: object|null, nodeToDir: object, files: Array }}
 */
function adaptBuildDirectoryTree(graph, lang) {
  const boundHelpers = {
    titleToFileName: helpers.titleToFileName,
    deduplicateFileNames: helpers.deduplicateFileNames,
  };
  return treeBuilder.buildDirectoryTree(graph, lang, boundHelpers);
}

/**
 * P17-1 (boundify-helpers.js) の projectEdgesToDirectories をアダプトする
 *
 * RFC §4.2 は projectEdgesToDirectories(graph, nodeToDir) の2引数だが、
 * P17-1 の実装は projectEdgesToDirectories(graphEdges, nodeToDirMap) の2引数。
 * 本アダプターが graph.edges を抽出して渡す。
 *
 * @param {object} graph — グラフオブジェクト
 * @param {object} nodeToDir — ノードID→ディレクトリパスのマッピング
 * @returns {{ from: string, to: string, type: string, evidence: string }[]}
 */
function adaptProjectEdgesToDirectories(graph, nodeToDir) {
  return helpers.projectEdgesToDirectories(graph.edges || [], nodeToDir);
}

/**
 * グラフJSONオブジェクトから、全ノードに言語推定情報を付与した拡張グラフを構築する
 *
 * P17-1 の graphToLangJson(graph, inferFn?) を使用。
 * languageMap を nodes にマージした統一オブジェクトと生の languageMap を返す。
 *
 * @param {object} graph — グラフオブジェクト
 * @returns {{ langGraph: object, languageMap: object }}
 */
function buildLangGraph(graph) {
  const { nodes, edges, languageMap } = helpers.graphToLangJson(graph);
  // inferLanguage を全ノードに適用した拡張グラフを構築
  const langGraph = {
    nodes: nodes.map(n => ({
      ...n,
      language: languageMap[n.id] || helpers.inferLanguage(n),
    })),
    edges,
  };
  return { langGraph, languageMap };
}

// ============================================================
// Dirs-Tree.json 構築
// ============================================================

/**
 * グラフの kind 別カウントを集計する
 *
 * @param {{ nodes: object[] }} graph — グラフオブジェクト
 * @returns {object} kind → カウント のマップ
 */
function countKinds(graph) {
  const counts = {};
  for (const node of graph.nodes) {
    const kind = node.kind || 'unknown';
    counts[kind] = (counts[kind] || 0) + 1;
  }
  return counts;
}

/**
 * グラフの edge type 別カウントを集計する
 *
 * @param {{ edges: object[] }} graph — グラフオブジェクト
 * @returns {object} edge type → カウント のマップ
 */
function countEdgeTypes(graph) {
  const counts = {};
  for (const edge of graph.edges) {
    counts[edge.type] = (counts[edge.type] || 0) + 1;
  }
  return counts;
}

/**
 * ディレクトリツリーから全ディレクトリのパスを収集する
 *
 * 収集されたパスは validate-dirs-tree-schema.js の想定する形式と一致する。
 * ツリーのルートは "src" で、その子ノードのパスは "src/config" 等となる。
 *
 * @param {object|null} tree — ディレクトリツリーのルートノード
 * @returns {Set<string>} ディレクトリパスの集合
 */
function collectDirectoryPaths(tree) {
  const paths = new Set();
  if (!tree) return paths;

  function walk(node, currentPath) {
    if (node.type === 'directory') {
      const fullPath = currentPath ? currentPath + '/' + node.name : node.name;
      paths.add(fullPath);
      if (node.children) {
        for (const child of node.children) {
          walk(child, fullPath);
        }
      }
    }
  }

  walk(tree, '');
  return paths;
}

/**
 * ディレクトリ名からツリー上のフルパスを解決する
 *
 * ファイル名にマッチしないように、ディレクトリ名のみを対象とする。
 * 同名ディレクトリがある場合は最初のものを採用する。
 *
 * @param {Set<string>} dirPaths — collectDirectoryPaths の戻り値
 * @param {string} dirName — 解決するディレクトリ名（例: "config"）
 * @returns {string|null} フルパス（例: "src/config"）、見つからない場合は null
 */
function resolveDirNameToPath(dirPaths, dirName) {
  for (const dirPath of dirPaths) {
    // パスの末尾セグメントが dirName と一致するか
    const segments = dirPath.split('/');
    const lastSegment = segments[segments.length - 1];
    if (lastSegment === dirName) {
      return dirPath;
    }
  }
  return null;
}

/**
 * 出力ファイルのパスを決定する
 *
 * 3ファイルすべてをグラフJSONと同じディレクトリに出力する。
 * basename は -GRAPH 接尾辞が除去されたベース名。
 *
 * @param {string} graphDir — グラフディレクトリ
 * @param {string} basename — ベース名（-GRAPH 除去済み）
 * @returns {{ dirsTreePath: string, langGraphPath: string, statusPath: string }}
 */
function resolveOutputPaths(graphDir, basename) {
  return {
    dirsTreePath: path.join(graphDir, `${basename}-Dirs-Tree.json`),
    langGraphPath: path.join(graphDir, `${basename}-GRAPH-LANG.json`),
    statusPath: path.join(graphDir, `${basename}-BOUNDIFY-Status.json`),
  };
}

// ============================================================
// メインエントリポイント
// ============================================================

/**
 * メインエントリポイント。全工程を統合する
 *
 * 処理の流れ:
 *   1. 引数パース → parseArguments
 *   2. グラフ読み込み → loadGraph
 *   3. 言語推定 → buildLangGraph
 *   4. 3言語のツリー生成・依存解析
 *   5. Dirs-Tree.json 構築
 *   6. スキーマ検証 → validateFiles
 *   7. 3ファイル書き出し
 *   8. 標準出力の3分岐（--json / --quiet / デフォルト）
 *
 * @param {string[]} [testArgs] — テスト用の引数配列
 */
function main(testArgs) {
  // ---- Step 1-2: 引数パースとグラフ読み込み ----
  const { graphPath, graphDir, basename, flags } = parseArguments(testArgs);
  const graph = loadGraph(graphPath);

  // ---- Step 3: 言語推定 ----
  const { langGraph, languageMap } = buildLangGraph(graph);

  // ---- Step 4: 3言語のツリー生成と依存解析 ----
  const trees = {};
  const allDependencyDirections = {};
  const allWarnings = [];

  for (const lang of SUPPORTED_LANGUAGES) {
    // 4-a: ディレクトリツリー生成（アダプター経由）
    const { tree, nodeToDir } = adaptBuildDirectoryTree(langGraph, lang);
    trees[lang] = tree;

    // 4-b: エッジ投影（アダプター経由）
    const dirEdges = adaptProjectEdgesToDirectories(langGraph, nodeToDir);

    // 依存方向の記録（ディレクトリ名→フルパスに解決）
    const dirPaths = collectDirectoryPaths(tree);
    allDependencyDirections[lang] = dirEdges.map(function(edge) {
      return {
        from: resolveDirNameToPath(dirPaths, edge.from) || edge.from,
        to: resolveDirNameToPath(dirPaths, edge.to) || edge.to,
        rule: edge.from + ' → ' + edge.to + ' (' + edge.evidence + ')',
      };
    });

    // 4-c: 循環依存検出
    const cycles = helpers.tarjanSCC(dirEdges);
    for (const cycle of cycles) {
      allWarnings.push({ cycle: cycle.cycle, language: lang });
    }
  }

  // ---- Step 5: Dirs-Tree.json 構築 ----
  const dirsTree = {
    schemaVersion: '1.0',
    generatedAt: new Date().toISOString(),
    sourceGraph: graphPath,
    analysis: {
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      kindCounts: countKinds(graph),
      edgeTypeCounts: countEdgeTypes(graph),
      circularDependencies: allWarnings.length > 0 ? allWarnings : undefined,
    },
    trees: trees,
    dependencyDirections: allDependencyDirections,
    warnings: allWarnings,
  };

  // ---- Step 6: スキーマ検証（書き出し後にファイルベース検証） ----
  const outputPaths = resolveOutputPaths(graphDir, basename);

  // まず Dirs-Tree.json を書き出す（検証のために必要）
  fs.writeFileSync(outputPaths.dirsTreePath, JSON.stringify(dirsTree, null, 2), 'utf-8');

  // 書き出したファイルを validateFiles で検証
  const validationResult = validateFiles(outputPaths.dirsTreePath, graphPath);
  if (!validationResult.ok) {
    // 検証失敗時は書き出したファイルを削除して終了
    try { fs.unlinkSync(outputPaths.dirsTreePath); } catch (_) { /* 削除失敗は無視 */ }
    reportError(
      'Dirs-Tree.json のスキーマ検証に失敗しました',
      validationResult.errors.join('; '),
      'validate-dirs-tree-schema.js の出力を確認して修正してください'
    );
    process.exit(EXIT_FAILURE);
  }

  // ---- Step 7: GRAPH-LANG.json と Status.json の書き出し ----
  fs.writeFileSync(outputPaths.langGraphPath, JSON.stringify(langGraph, null, 2), 'utf-8');

  fs.writeFileSync(outputPaths.statusPath, JSON.stringify({
    state: 'STEP1_DONE',
    sourceGraph: graphPath,
    dirsTree: outputPaths.dirsTreePath,
    langGraph: outputPaths.langGraphPath,
    updatedAt: new Date().toISOString(),
  }, null, 2), 'utf-8');

  // ---- Step 8: 標準出力の3分岐 ----
  if (flags.json) {
    // --json: JSON のみ stdout
    console.log(JSON.stringify(dirsTree, null, 2));
  } else if (!flags.quiet) {
    // デフォルト: .en.md + Markdown + JSON ブロック
    const report = treeBuilder.generateReport(graph, dirsTree, 'rust');
    const jsonBlock = JSON.stringify(dirsTree, null, 2);
    console.log(helpers.SAFE_BOUNDARIES_EN_TEXT);
    console.log('');
    console.log(report);
    console.log('');
    console.log('```json');
    console.log(jsonBlock);
    console.log('```');
  }
  // --quiet: 標準出力を完全抑制（ファイル出力のみ）
}

// ============================================================
// エントリポイント
// ============================================================

if (require.main === module) {
  main();
}

module.exports = {
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
};
