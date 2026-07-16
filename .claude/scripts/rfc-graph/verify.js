#!/usr/bin/env node

/**
 * verify.js — カバレッジ・孤立ノード検証 + headingRefs 解決可能性検証
 *
 * graphify-rfc Step 3 で使用する。グラフファイルのノードがソースファイルの全見出し
 * （`## `）を headingRefs 経由でカバーしているか、全ノードが最低1本のエッジで
 * 接続されているか、および全 headingRefs が resolve-by-heading.js で一意に
 * 解決可能かを検証する。
 *
 * CLI: verify.js --graph=<path> --source=<path>
 *
 * 出力契約:
 *   正常時 → {"ok":true}（終了コード0）
 *   異常時 → {"ok":false, "uncoveredHeadings":[...], "isolatedNodes":[...], "unresolvableRefs":[...]}（終了コード1）
 *   異常時は stderr に3段テンプレートの自然言語エラーも出力する。
 */

const fs = require('fs');
const path = require('path');
const { resolveByHeading } = require('./resolve-by-heading.js');

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
      'Insufficient arguments.\n' +
      '  Usage: verify.js --graph=<path> --source=<path>'
    );
  }

  // Parse --graph=<path>
  const graphFlag = args[0];
  if (!graphFlag.startsWith(GRAPH_PATH_ARG_PREFIX)) {
    throw new Error(
      'The first argument must be --graph=<path>.\n' +
      `  Actual value: ${graphFlag}`
    );
  }
  const graphPath = graphFlag.slice(GRAPH_PATH_ARG_PREFIX.length);
  if (!graphPath) {
    throw new Error('The <path> in --graph=<path> is empty.');
  }

  // Parse --source=<path>
  const sourceFlag = args[1];
  if (!sourceFlag.startsWith(SOURCE_PATH_ARG_PREFIX)) {
    throw new Error(
      'The second argument must be --source=<path>.\n' +
      `  Actual value: ${sourceFlag}`
    );
  }
  const sourcePath = sourceFlag.slice(SOURCE_PATH_ARG_PREFIX.length);
  if (!sourcePath) {
    throw new Error('The <path> in --source=<path> is empty.');
  }

  // Check for extra arguments
  if (args.length > 2) {
    throw new Error(
      'Extra arguments found.\n' +
      '  Usage: verify.js --graph=<path> --source=<path>'
    );
  }

  return { graphPath, sourcePath };
}

// ============================================================
// ファイル読み込み
// ============================================================

/**
 * Read the graph JSON file.
 *
 * @param {string} graphPath — Path to the graph file
 * @returns {Object} Parsed graph data ({ sourceFile, nodes, edges })
 * @throws {Error} If file reading or JSON parsing fails
 */
function readGraph(graphPath) {
  if (!fs.existsSync(graphPath)) {
    throw new Error(
      `Graph file not found: ${graphPath}`
    );
  }

  let raw;
  try {
    raw = fs.readFileSync(graphPath, 'utf8');
  } catch (readError) {
    throw new Error(
      `Failed to read graph file: ${readError.message}`
    );
  }

  let graph;
  try {
    graph = JSON.parse(raw);
  } catch (parseError) {
    throw new Error(
      `Failed to parse graph JSON: ${parseError.message}`
    );
  }

  // Minimal structure validation
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    throw new Error(
      'Invalid graph data structure. nodes and edges arrays are required.'
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

/**
 * 全 headingRefs が resolve-by-heading.js で一意に解決可能かを検証する
 *
 * 各ノードの headingRefs エントリに対して resolveByHeading を実行し、
 * 解決に失敗したものを unresolvableRefs として報告する。
 *
 * @param {string[]} sourceLines — ソースファイルの行配列
 * @param {Object[]} nodes — グラフのノード配列
 * @param {Object[]} nodes[].headingRefs — 各ノードの headingRefs
 * @returns {{ resolvable: boolean, unresolvableRefs: Array<{ nodeId: string, refId: string, heading: number, texts: string[] }> }}
 */
function checkResolvability(sourceLines, nodes) {
  const failures = [];
  for (const node of nodes) {
    if (!Array.isArray(node.headingRefs)) continue;
    for (const ref of node.headingRefs) {
      const result = resolveByHeading(sourceLines, ref.heading, ref.texts);
      if (!result) {
        failures.push({
          nodeId: node.id,
          refId: ref.refId,
          heading: ref.heading,
          texts: ref.texts,
        });
      }
    }
  }
  return {
    resolvable: failures.length === 0,
    unresolvableRefs: failures,
  };
}

// ============================================================
// 出力処理
// ============================================================

/**
 * 検証結果を出力し、適切な終了コードでプロセスを終了する
 *
 * 正常時: {"ok":true} を stdout、終了コード0
 * 異常時: {"ok":false, ...} を stdout、
 *         終了コード1、加えて自然言語の3段テンプレートを stderr
 *
 * @param {boolean} ok — 検証が成功したか
 * @param {string[]} uncoveredHeadings — 未カバー見出しのテキストリスト
 * @param {string[]} isolatedNodes — 孤立ノードのIDリスト
 * @param {Array} unresolvableRefs — 解決不能な headingRefs のリスト
 */
function exitWithResult(ok, uncoveredHeadings, isolatedNodes, unresolvableRefs) {
  const result = {
    ok,
    uncoveredHeadings,
    isolatedNodes,
    unresolvableRefs,
  };

  console.log(JSON.stringify(result));

  if (!ok) {
    const messages = [];

    if (uncoveredHeadings.length > 0) {
      messages.push(
        `[ERROR] ${uncoveredHeadings.length} uncovered headings found.`,
        `Cause: The following headings are not covered by any node's headingRefs: ${uncoveredHeadings.join(', ')}`,
        `Action: Add nodes covering the sections for these headings, or extend existing nodes' headingRefs.`
      );
    }

    if (isolatedNodes.length > 0) {
      messages.push(
        `[ERROR] ${isolatedNodes.length} orphan nodes found.`,
        `Cause: The following nodes have no connected edges: ${isolatedNodes.join(', ')}`,
        `Action: Use crud.js create-edges to connect these nodes to others.`
      );
    }

    if (unresolvableRefs && unresolvableRefs.length > 0) {
      const details = unresolvableRefs.map(
        r => `${r.nodeId}(${r.refId}): heading=${r.heading}, texts=[${r.texts.join(', ')}]`
      ).join('; ');
      messages.push(
        `[ERROR] ${unresolvableRefs.length} unresolvable headingRefs found.`,
        `Cause: Could not uniquely resolve via resolve-by-heading.js: ${details}`,
        `Action: Fix the heading level or texts tokens in the affected node's headingRefs.`
      );
    }

    process.stderr.write(messages.join('\n') + '\n');
    process.exit(EXIT_FAILURE);
  }

  process.exit(EXIT_SUCCESS);
}

// ============================================================
// Help display
// ============================================================

/**
 * Display usage information.
 */
function printUsage() {
  console.log(
    'verify.js — Coverage and orphan node verification (headingRefs method)\n' +
    '\n' +
    'Usage:\n' +
    '  verify.js --graph=<path> --source=<path>\n' +
    '\n' +
    'Options:\n' +
    '  --graph=<path>   Path to the graph file (graph.schema.json compliant)\n' +
    '  --source=<path>  Path to the source file to verify\n' +
    '  --help, -h       Show this help message\n' +
    '\n' +
    'Exit codes:\n' +
    '  0  All headings covered + all nodes connected\n' +
    '  1  Uncovered headings or orphan nodes exist\n'
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
  const resolvabilityResult = checkResolvability(sourceLines, graph.nodes);

  exitWithResult(
    coverageResult.covered && isolatedResult.connected && resolvabilityResult.resolvable,
    coverageResult.uncoveredHeadings,
    isolatedResult.isolatedNodes,
    resolvabilityResult.unresolvableRefs,
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
  checkResolvability,
  exitWithResult,
  printUsage,
};
