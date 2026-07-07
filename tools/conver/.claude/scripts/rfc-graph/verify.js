#!/usr/bin/env node

/**
 * verify.js — カバレッジ・孤立ノード検証
 *
 * graphify-rfc Step 3 で使用する。グラフファイルのノードがソースファイルの全見出し
 * （`## `）を headingRefs 経由でカバーしているか、および全ノードが最低1本のエッジで
 * 接続されているかを検証する。
 *
 * CLI: verify.js --graph=<path> --source=<path>
 *
 * 出力契約:
 *   正常時 → {"ok":true}（終了コード0）
 *   異常時 → {"ok":false, "uncoveredHeadings":[...], "isolatedNodes":[...]}（終了コード1）
 *   異常時は stderr に3段テンプレートの自然言語エラーも出力する。
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// 定数定義
// ============================================================

/** グラフファイルパスを指定するCLI引数のプレフィックス */
const GRAPH_PATH_ARG_PREFIX = '--graph=';

/** ソースファイルパスを指定するCLI引数のプレフィックス */
const SOURCE_PATH_ARG_PREFIX = '--source=';

/** 正常終了コード */
const EXIT_SUCCESS = 0;

/** 異常終了コード */
const EXIT_FAILURE = 1;

// ============================================================
// コマンドライン引数パース
// ============================================================

/**
 * コマンドライン引数をパースする
 *
 * @param {string[]} [testArgs] — テスト用の引数配列（省略時は process.argv から取得）
 * @returns {{ graphPath: string, sourcePath: string }}
 * @throws {Error} 引数が不正な場合
 */
function parseArguments(testArgs) {
  const args = testArgs || process.argv.slice(2);

  // --help オプション
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    printUsage();
    process.exit(EXIT_SUCCESS);
  }

  // 最小引数: --graph=<path> --source=<path>
  if (args.length < 2) {
    throw new Error(
      '引数が不足しています。\n' +
      '  Usage: verify.js --graph=<path> --source=<path>'
    );
  }

  // --graph=<path> のパース
  const graphFlag = args[0];
  if (!graphFlag.startsWith(GRAPH_PATH_ARG_PREFIX)) {
    throw new Error(
      '最初の引数は --graph=<path> である必要があります。\n' +
      `  実際の値: ${graphFlag}`
    );
  }
  const graphPath = graphFlag.slice(GRAPH_PATH_ARG_PREFIX.length);
  if (!graphPath) {
    throw new Error('--graph=<path> の <path> が空です。');
  }

  // --source=<path> のパース
  const sourceFlag = args[1];
  if (!sourceFlag.startsWith(SOURCE_PATH_ARG_PREFIX)) {
    throw new Error(
      '2番目の引数は --source=<path> である必要があります。\n' +
      `  実際の値: ${sourceFlag}`
    );
  }
  const sourcePath = sourceFlag.slice(SOURCE_PATH_ARG_PREFIX.length);
  if (!sourcePath) {
    throw new Error('--source=<path> の <path> が空です。');
  }

  // 余剰引数のチェック
  if (args.length > 2) {
    throw new Error(
      '余剰な引数があります。\n' +
      '  Usage: verify.js --graph=<path> --source=<path>'
    );
  }

  return { graphPath, sourcePath };
}

// ============================================================
// ファイル読み込み
// ============================================================

/**
 * グラフJSONファイルを読み込む
 *
 * @param {string} graphPath — グラフファイルのパス
 * @returns {Object} パース済みグラフデータ（{ sourceFile, nodes, edges }）
 * @throws {Error} ファイル読み込みまたはJSONパースに失敗した場合
 */
function readGraph(graphPath) {
  if (!fs.existsSync(graphPath)) {
    throw new Error(
      `グラフファイルが見つかりません: ${graphPath}`
    );
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

/**
 * ソースファイルを行配列として読み込む
 *
 * @param {string} sourcePath — ソースファイルのパス
 * @returns {string[]} 1行ごとの配列（改行は除去済み）
 * @throws {Error} ファイル読み込みに失敗した場合
 */
function readSourceFile(sourcePath) {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(
      `ソースファイルが見つかりません: ${sourcePath}`
    );
  }

  try {
    const content = fs.readFileSync(sourcePath, 'utf8');
    return content.split('\n');
  } catch (readError) {
    throw new Error(
      `ソースファイルの読み込みに失敗しました: ${readError.message}`
    );
  }
}

// ============================================================
// 検証関数（純粋関数）
// ============================================================

/**
 * ソースファイルから大見出し（`## `）を抽出する
 *
 * @param {string[]} sourceLines — ソースファイルの行配列
 * @returns {Array<{ line: number, level: number, text: string, tokens: string[] }>}
 *   大見出しのリスト（行番号1-indexed、見出しレベル、見出しテキスト、トークン列）
 */
function extractHeadings(sourceLines) {
  const headings = [];
  for (let i = 0; i < sourceLines.length; i++) {
    const match = sourceLines[i].match(/^#{2,2}\s+(.+)/);
    if (match) {
      headings.push({
        line: i + 1,
        level: 2,
        text: match[1].trim(),
        tokens: match[1].trim().split(/[\s、。，．・：；（）\[\]{}「」『』【】　]+/).filter(Boolean),
      });
    }
  }
  return headings;
}

/**
 * 1つの見出しがいずれかのノードの headingRefs でカバーされているかを判定する
 *
 * 見出しレベルが一致し、かつ headingRefs の texts のいずれかが見出しテキストと
 * 部分一致する場合に「カバー済み」とみなす。
 *
 * @param {{ line: number, level: number, text: string, tokens: string[] }} heading
 *   判定対象の見出し
 * @param {Object[]} nodes — グラフのノード配列
 * @param {Object[]} nodes[].headingRefs — 各ノードの headingRefs
 * @returns {boolean} カバーされているか
 */
function isHeadingCovered(heading, nodes) {
  for (const node of nodes) {
    if (!Array.isArray(node.headingRefs)) continue;
    for (const ref of node.headingRefs) {
      if (ref.heading !== heading.level) continue;
      const anyMatch = ref.texts.some(text =>
        heading.text.includes(text) || text.includes(heading.text)
      );
      if (anyMatch) return true;
    }
  }
  return false;
}

/**
 * 未カバー見出しを検出する
 *
 * ソースファイルの大見出し（`## `）が各ノードの headingRefs に出現しているかを
 * 検証する。空行や通常の本文行は検証対象外。
 *
 * @param {string[]} sourceLines — ソースファイルの行配列
 * @param {Object[]} nodes — グラフのノード配列
 * @param {Object[]} nodes[].headingRefs — 各ノードの headingRefs
 *   （{ refId, heading: 見出しレベル, texts: トークン列 }）
 * @returns {{ covered: boolean, uncoveredHeadings: string[] }}
 *   covered: 全見出しがカバーされているか
 *   uncoveredHeadings: 未カバー見出しのテキストリスト
 */
function checkCoverage(sourceLines, nodes) {
  const headings = extractHeadings(sourceLines);

  const uncoveredHeadings = headings
    .filter(h => !isHeadingCovered(h, nodes))
    .map(h => h.text);

  return {
    covered: uncoveredHeadings.length === 0,
    uncoveredHeadings,
  };
}

/**
 * 孤立ノードを検出する
 *
 * 全ノードが最低1本のエッジで接続されているかを検証する。
 * エッジの from/to に1回も出現しないノードIDを孤立ノードとする。
 *
 * @param {Object[]} nodes — グラフのノード配列
 * @param {Object[]} edges — グラフのエッジ配列
 * @param {string} edges[].from — 参照元ノードID
 * @param {string} edges[].to — 参照先ノードID
 * @returns {{ connected: boolean, isolatedNodes: string[] }}
 *   connected: 全ノードが接続されているか
 *   isolatedNodes: 孤立ノードのIDリスト
 */
function checkIsolated(nodes, edges) {
  const connected = new Set();
  for (const edge of edges) {
    connected.add(edge.from);
    connected.add(edge.to);
  }

  const isolatedNodes = nodes
    .map(node => node.id)
    .filter(id => !connected.has(id));

  return {
    connected: isolatedNodes.length === 0,
    isolatedNodes,
  };
}

// ============================================================
// 出力処理
// ============================================================

/**
 * 検証結果を出力し、適切な終了コードでプロセスを終了する
 *
 * 正常時: {"ok":true} を stdout、終了コード0
 * 異常時: {"ok":false, "uncoveredHeadings":[], "isolatedNodes":[]} を stdout、
 *         終了コード1、加えて自然言語の3段テンプレートを stderr
 *
 * @param {boolean} ok — 検証が成功したか
 * @param {string[]} uncoveredHeadings — 未カバー見出しのテキストリスト
 * @param {string[]} isolatedNodes — 孤立ノードのIDリスト
 */
function exitWithResult(ok, uncoveredHeadings, isolatedNodes) {
  const result = {
    ok,
    uncoveredHeadings,
    isolatedNodes,
  };

  console.log(JSON.stringify(result));

  if (!ok) {
    const messages = [];

    if (uncoveredHeadings.length > 0) {
      messages.push(
        `[ERROR] ${uncoveredHeadings.length}件の未カバー見出しがあります。`,
        `原因: 以下の見出しが全ノードの headingRefs に含まれていません: ${uncoveredHeadings.join(', ')}`,
        `対応: 該当見出しのセクションをカバーするノードを追加するか、既存ノードの headingRefs を拡張してください。`
      );
    }

    if (isolatedNodes.length > 0) {
      messages.push(
        `[ERROR] ${isolatedNodes.length}件の孤立ノードがあります。`,
        `原因: 以下のノードが1本もエッジで接続されていません: ${isolatedNodes.join(', ')}`,
        `対応: crud.js create-edges で該当ノードを他のノードと接続してください。`
      );
    }

    process.stderr.write(messages.join('\n') + '\n');
    process.exit(EXIT_FAILURE);
  }

  process.exit(EXIT_SUCCESS);
}

// ============================================================
// ヘルプ表示
// ============================================================

/**
 * 使用方法を表示する
 */
function printUsage() {
  console.log(
    'verify.js — カバレッジ・孤立ノード検証（headingRefs 方式）\n' +
    '\n' +
    'Usage:\n' +
    '  verify.js --graph=<path> --source=<path>\n' +
    '\n' +
    'Options:\n' +
    '  --graph=<path>   グラフファイル（graph.schema.json 準拠）のパス\n' +
    '  --source=<path>  検証対象のソースファイルのパス\n' +
    '  --help, -h       このヘルプを表示\n' +
    '\n' +
    'Exit codes:\n' +
    '  0  全見出しカバー＋全ノード接続\n' +
    '  1  未カバー見出しまたは孤立ノードが存在\n'
  );
}

// ============================================================
// エントリポイント
// ============================================================

/**
 * main — CLIエントリポイント
 *
 * 1. 引数パース
 * 2. グラフ・ソースファイル読み込み
 * 3. カバレッジ検証
 * 4. 孤立ノード検証
 * 5. 結果出力
 *
 * 全エラーは3段テンプレートで stderr に出力し、終了コード1で終了する。
 * ファイル変更は一切行わない。
 */
function main() {
  let graphPath, sourcePath;

  try {
    const parsed = parseArguments();
    graphPath = parsed.graphPath;
    sourcePath = parsed.sourcePath;
  } catch (parseError) {
    process.stderr.write(
      `[ERROR] 引数のパースに失敗しました。\n` +
      `原因: ${parseError.message}\n` +
      `対応: 正しい引数で再実行してください。\n`
    );
    process.exit(EXIT_FAILURE);
  }

  let graph;
  try {
    graph = readGraph(graphPath);
  } catch (graphError) {
    process.stderr.write(
      `[ERROR] グラフファイルの読み込みに失敗しました。\n` +
      `原因: ${graphError.message}\n` +
      `対応: --graph=<path> に正しいグラフファイルを指定してください。\n`
    );
    process.exit(EXIT_FAILURE);
  }

  let sourceLines;
  try {
    sourceLines = readSourceFile(sourcePath);
  } catch (sourceError) {
    process.stderr.write(
      `[ERROR] ソースファイルの読み込みに失敗しました。\n` +
      `原因: ${sourceError.message}\n` +
      `対応: --source=<path> に正しいソースファイルを指定してください。\n`
    );
    process.exit(EXIT_FAILURE);
  }

  const coverageResult = checkCoverage(sourceLines, graph.nodes);
  const isolatedResult = checkIsolated(graph.nodes, graph.edges);

  exitWithResult(
    coverageResult.covered && isolatedResult.connected,
    coverageResult.uncoveredHeadings,
    isolatedResult.isolatedNodes
  );
}

// CLIとして実行された場合のみ main を呼び出す
if (require.main === module) {
  main();
}

module.exports = {
  parseArguments,
  readGraph,
  readSourceFile,
  extractHeadings,
  isHeadingCovered,
  checkCoverage,
  checkIsolated,
  exitWithResult,
  printUsage,
};
