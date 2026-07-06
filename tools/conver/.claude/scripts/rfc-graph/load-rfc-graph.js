#!/usr/bin/env node

/**
 * load-rfc-graph.js — グラフサマリー＋CLI使用例表示
 *
 * graphify-rfc で生成されたグラフファイルのサマリー（ノード数・エッジ数・
 * kind別分布・type別分布等）を自然言語で標準出力に出力する。
 * 同時に crud.js と query.js の具体的なCLI使用例も出力する。
 *
 * グラフファイルが存在しない場合は何も出力せず終了コード0で終了する。
 *
 * CLI: load-rfc-graph.js <source-path>
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// 定数定義
// ============================================================

/** グラフファイル名の接尾辞 */
const GRAPH_FILE_SUFFIX = '-GRAPH.json';

/** 正常終了コード */
const EXIT_SUCCESS = 0;

/** 異常終了コード */
const EXIT_FAILURE = 1;

/** デフォルトの探索ホップ数（CLI使用例で表示する値） */
const DEFAULT_HOPS = 2;

/** スクリプトディレクトリへの相対パス */
const SCRIPTS_DIR = '.claude/scripts/rfc-graph';

// ============================================================
// コマンドライン引数パース
// ============================================================

/**
 * コマンドライン引数をパースする
 *
 * @param {string[]} [testArgs] — テスト用の引数配列（省略時は process.argv から取得）
 * @returns {{ sourcePath: string }}
 * @throws {Error} 引数が不正な場合
 */
function parseArguments(testArgs) {
  const args = testArgs || process.argv.slice(2);

  // --help オプション
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    printUsage();
    process.exit(EXIT_SUCCESS);
  }

  // 必須引数: <source-path>
  if (args.length < 1) {
    throw new Error(
      'ソースファイルのパスを指定してください。\n' +
      '  Usage: load-rfc-graph.js <source-path>'
    );
  }

  const sourcePath = args[0];

  // 余剰引数のチェック
  if (args.length > 1) {
    throw new Error(
      '余剰な引数があります。\n' +
      '  Usage: load-rfc-graph.js <source-path>'
    );
  }

  return { sourcePath };
}

// ============================================================
// グラフパス導出（純粋関数）
// ============================================================

/**
 * ソースファイルのパスからグラフファイルのパスを導出する
 *
 * RFC §3.9.1 の導出式: <source-dir>/<basename>-GRAPH.json
 * ソースパスが /path/to/doc.md の場合 → /path/to/doc-GRAPH.json
 *
 * @param {string} sourcePath — ソースファイルのパス
 * @returns {string} グラフファイルのパス
 */
function deriveGraphPath(sourcePath) {
  const dir = path.dirname(sourcePath);
  const baseName = path.basename(sourcePath, '.md');
  return path.join(dir, `${baseName}${GRAPH_FILE_SUFFIX}`);
}

// ============================================================
// ファイル読み込み
// ============================================================

/**
 * グラフJSONファイルを読み込む
 *
 * グラフファイルが存在しない場合は null を返す（エラーにしない）。
 *
 * @param {string} graphPath — グラフファイルのパス
 * @returns {Object|null} パース済みグラフデータ、または null（ファイル不在時）
 * @throws {Error} ファイル読み込みまたはJSONパースに失敗した場合
 */
function loadGraph(graphPath) {
  if (!fs.existsSync(graphPath)) {
    return null;
  }

  let raw;
  try {
    raw = fs.readFileSync(graphPath, 'utf8');
  } catch (readError) {
    throw new Error(
      `グラフファイルの読み込みに失敗しました: ${readError.message}`
    );
  }

  let graph;
  try {
    graph = JSON.parse(raw);
  } catch (parseError) {
    throw new Error(
      `グラフファイルのJSONパースに失敗しました: ${parseError.message}`
    );
  }

  // 最小限の構造検証
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    throw new Error(
      'グラフデータの構造が不正です。nodes と edges が必要です。'
    );
  }

  return graph;
}

// ============================================================
// 集計関数（純粋関数）
// ============================================================

/**
 * グラフデータを集計しサマリーを生成する
 *
 * @param {Object} graph — グラフデータ（{ nodes, edges }）
 * @returns {Object} サマリー情報
 * @returns {number} return.nodeCount — ノード総数
 * @returns {Object<string, number>} return.kindDistribution — kind別の件数
 * @returns {number} return.edgeCount — エッジ総数
 * @returns {Object<string, number>} return.typeDistribution — type別の件数
 * @returns {string[]} return.isolatedNodes — 孤立ノードのIDリスト
 */
function summarizeGraph(graph) {
  // kind別分布の集計
  const kindDistribution = {};
  for (const node of graph.nodes) {
    const kind = node.kind || 'unknown';
    kindDistribution[kind] = (kindDistribution[kind] || 0) + 1;
  }

  // type別分布の集計
  const typeDistribution = {};
  for (const edge of graph.edges) {
    const type = edge.type || 'unknown';
    typeDistribution[type] = (typeDistribution[type] || 0) + 1;
  }

  // 孤立ノードの検出
  const connectedNodes = new Set();
  for (const edge of graph.edges) {
    connectedNodes.add(edge.from);
    connectedNodes.add(edge.to);
  }
  const isolatedNodes = graph.nodes
    .map(node => node.id)
    .filter(id => !connectedNodes.has(id));

  return {
    nodeCount: graph.nodes.length,
    kindDistribution,
    edgeCount: graph.edges.length,
    typeDistribution,
    isolatedNodes,
  };
}

/**
 * crud.js と query.js の具体的なCLI使用例を生成する
 *
 * @param {string} graphPath — グラフファイルのパス
 * @param {string} sourcePath — ソースファイルのパス
 * @param {string} [firstNodeId='N0001'] — 探索の起点とするノードID
 * @returns {string[]} CLI使用例の行配列
 */
function generateUsageExamples(graphPath, sourcePath, firstNodeId = 'N0001') {
  const graphFileName = path.basename(graphPath);
  const sourceFileName = path.basename(sourcePath);

  return [
    `全ノード一覧: node ${SCRIPTS_DIR}/crud.js list-nodes --graph=${graphFileName}`,
    `特定ノード取得: node ${SCRIPTS_DIR}/crud.js get-node --graph=${graphFileName} --id=${firstNodeId}`,
    `${DEFAULT_HOPS}ホップ探索: node ${SCRIPTS_DIR}/query.js --graph=${graphFileName} --source=${sourceFileName} --id=${firstNodeId} --hops=${DEFAULT_HOPS}`,
  ];
}

// ============================================================
// 出力処理
// ============================================================

/**
 * サマリーとCLI使用例を整形して標準出力に出力する
 *
 * @param {Object} summary — summarizeGraph の戻り値
 * @param {string} graphPath — グラフファイルのパス
 * @param {string[]} examples — generateUsageExamples の戻り値
 */
function outputSummary(summary, graphPath, examples) {
  const graphFileName = path.basename(graphPath);

  // kind別分布の文字列（例: requirement:4, api_contract:3）
  const kindParts = Object.entries(summary.kindDistribution)
    .sort((a, b) => b[1] - a[1]) // 件数の降順
    .map(([kind, count]) => `${kind}:${count}`)
    .join(', ');

  // type別分布の文字列
  const typeParts = Object.entries(summary.typeDistribution)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `${type}:${count}`)
    .join(', ');

  const lines = [
    '[グラフ構造サマリー]',
    `グラフファイル: ${graphFileName}`,
    `ノード: ${summary.nodeCount}件${kindParts ? ' (' + kindParts + ')' : ''}`,
    `エッジ: ${summary.edgeCount}件${typeParts ? ' (' + typeParts + ')' : ''}`,
    `孤立ノード: ${summary.isolatedNodes.length}件`,
    '',
    '[グラフ探索コマンド]',
    ...examples,
  ];

  console.log(lines.join('\n'));
}

// ============================================================
// ヘルプ表示
// ============================================================

/**
 * 使用方法を表示する
 */
function printUsage() {
  console.log(
    'load-rfc-graph.js — グラフサマリー＋CLI使用例表示\n' +
    '\n' +
    'Usage:\n' +
    '  load-rfc-graph.js <source-path>\n' +
    '\n' +
    'Options:\n' +
    '  <source-path>  グラフファイルの元となったソースファイルのパス\n' +
    '  --help, -h     このヘルプを表示\n' +
    '\n' +
    'Exit codes:\n' +
    '  0  正常終了（グラフファイルが存在しなくても0）\n' +
    '  1  引数エラーまたはファイル読み込みエラー\n'
  );
}

// ============================================================
// エントリポイント
// ============================================================

/**
 * main — CLIエントリポイント
 *
 * 1. 引数パース
 * 2. グラフパス導出
 * 3. グラフ読み込み（不在時は何も出力せず終了コード0）
 * 4. サマリー集計
 * 5. CLI使用例生成
 * 6. 整形出力
 *
 * 全エラーは3段テンプレートで stderr に出力し、終了コード1で終了する。
 * ファイル変更は一切行わない。
 */
function main() {
  let sourcePath;

  try {
    const parsed = parseArguments();
    sourcePath = parsed.sourcePath;
  } catch (parseError) {
    process.stderr.write(
      `[ERROR] 引数のパースに失敗しました。\n` +
      `原因: ${parseError.message}\n` +
      `対応: 正しい引数で再実行してください。\n`
    );
    process.exit(EXIT_FAILURE);
  }

  const graphPath = deriveGraphPath(sourcePath);

  let graph;
  try {
    graph = loadGraph(graphPath);
  } catch (graphError) {
    process.stderr.write(
      `[ERROR] グラフファイルの読み込みに失敗しました。\n` +
      `原因: ${graphError.message}\n` +
      `対応: グラフファイルのパーミッションと内容を確認してください。\n`
    );
    process.exit(EXIT_FAILURE);
  }

  // グラフが存在しない場合は何も出力せず正常終了
  if (graph === null) {
    process.exit(EXIT_SUCCESS);
  }

  const summary = summarizeGraph(graph);

  // 最初のノードIDを取得（出力例用、ノードがなければ N0001 をデフォルトとする）
  const firstNodeId = graph.nodes.length > 0 ? graph.nodes[0].id : 'N0001';

  const examples = generateUsageExamples(graphPath, sourcePath, firstNodeId);

  outputSummary(summary, graphPath, examples);

  process.exit(EXIT_SUCCESS);
}

// CLIとして実行された場合のみ main を呼び出す
if (require.main === module) {
  main();
}

module.exports = {
  parseArguments,
  deriveGraphPath,
  loadGraph,
  summarizeGraph,
  generateUsageExamples,
  outputSummary,
  printUsage,
};
