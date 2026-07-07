#!/usr/bin/env node

/**
 * query.js — マルチホップグラフ探索
 *
 * graphify-rfc パイプラインの Layer 2（グラフ探索機構）の中核。
 * ノードID起点の BFS（幅優先探索）で最大Nホップ先までグラフを探索し、
 * 実行時に行位置を headingRefs 経由で動的に解決し（マーカー不要）、
 * 結果を Markdown 形式で整形出力する。
 *
 * 読み取り専用で副作用ゼロ、headingRefs 欠損時は部分結果と stderr 通知を行う。
 *
 * CLI: query.js --graph=<path> --source=<path> --id=<nodeId> --hops=<N>
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

/** ノードIDを指定するCLI引数のプレフィックス */
const NODE_ID_ARG_PREFIX = '--id=';

/** ホップ数を指定するCLI引数のプレフィックス */
const HOPS_ARG_PREFIX = '--hops=';

/** 探索が未指定時のデフォルトホップ数 */
const DEFAULT_HOPS = 1;

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
 * @returns {{ graphPath: string, sourcePath: string, nodeIds: string[], hops: number }}
 * @throws {Error} 引数が不正な場合
 */
function parseArguments(testArgs) {
  const args = testArgs || process.argv.slice(2);

  // --help オプション
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    printUsage();
    process.exit(EXIT_SUCCESS);
  }

  // 最小引数: --graph=<path> --source=<path> --id=<nodeId>
  if (args.length < 3) {
    throw new Error(
      '引数が不足しています。\n' +
      '  Usage: query.js --graph=<path> --source=<path> --id=<nodeId> [--hops=<N>]'
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

  // --id=<nodeId> のパース（複数指定はカンマ区切りに対応）
  const idFlag = args[2];
  const nodeIds = parseNodeIds(idFlag);

  // --hops=<N> のパース（省略可能、デフォルト1）
  let hops = DEFAULT_HOPS;
  if (args.length > 3) {
    const hopsFlag = args[3];
    hops = parseHops(hopsFlag);
  }

  return { graphPath, sourcePath, nodeIds, hops };
}

/**
 * --id=<nodeId> の値からノードID配列をパースする（カンマ区切り対応）
 *
 * @param {string} idFlag — --id= を含む引数文字列
 * @returns {string[]} ノードID配列
 * @throws {Error} 引数が不正な場合
 */
function parseNodeIds(idFlag) {
  if (!idFlag.startsWith(NODE_ID_ARG_PREFIX)) {
    throw new Error(
      '3番目の引数は --id=<nodeId> である必要があります。\n' +
      `  実際の値: ${idFlag}`
    );
  }
  const rawIds = idFlag.slice(NODE_ID_ARG_PREFIX.length);
  if (!rawIds) {
    throw new Error('--id=<nodeId> の <nodeId> が空です。');
  }
  return rawIds.split(',').map(id => id.trim()).filter(id => id.length > 0);
}

/**
 * --hops=<N> の値をパースする
 *
 * @param {string} hopsFlag — --hops= を含む引数文字列
 * @returns {number} ホップ数
 * @throws {Error} 引数が不正な場合
 */
function parseHops(hopsFlag) {
  if (!hopsFlag.startsWith(HOPS_ARG_PREFIX)) {
    throw new Error(
      '4番目の引数は --hops=<N> である必要があります。\n' +
      `  実際の値: ${hopsFlag}`
    );
  }
  const hopsStr = hopsFlag.slice(HOPS_ARG_PREFIX.length);
  if (!hopsStr) {
    throw new Error('--hops=<N> の <N> が空です。');
  }
  const hops = parseInt(hopsStr, 10);
  if (!Number.isInteger(hops) || hops < 1) {
    throw new Error(
      '--hops=<N> の <N> は1以上の整数である必要があります。\n' +
      `  実際の値: ${hopsStr}`
    );
  }
  return hops;
}

// ============================================================
// ファイル読み込み
// ============================================================

/**
 * グラフJSONファイルを読み込み、パースする
 *
 * @param {string} graphPath — グラフファイルのパス
 * @returns {Object} パースされたグラフオブジェクト
 * @throws {Error} 読み込みまたはパースに失敗した場合
 */
function loadGraph(graphPath) {
  const resolvedPath = path.resolve(graphPath);
  const raw = fs.readFileSync(resolvedPath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (parseError) {
    throw new Error(
      `グラフファイルのJSONパースに失敗しました: ${graphPath}\n` +
      `原因: ${parseError.message}`
    );
  }
}

/**
 * ソースファイルを読み込む
 *
 * @param {string} sourcePath — ソースファイルのパス
 * @returns {string} ファイル内容
 * @throws {Error} 読み込みに失敗した場合
 */
function loadSourceFile(sourcePath) {
  const resolvedPath = path.resolve(sourcePath);
  return fs.readFileSync(resolvedPath, 'utf8');
}

// ============================================================
// ノード解決
// ============================================================

/**
 * ノードIDからグラフ内のノードを検索する
 *
 * @param {Object} graph — グラフオブジェクト
 * @param {string} nodeId — 検索するノードID
 * @returns {Object|null} 見つかったノード、存在しなければ null
 */
function resolveNodeById(graph, nodeId) {
  return graph.nodes.find(n => n.id === nodeId) || null;
}

// ============================================================
// BFSマルチホップ探索
// ============================================================

/**
 * BFS（幅優先探索）でグラフを探索する
 *
 * 無向グラフとして扱い、edge.from / edge.to 両方向を探索する。
 * visited は Map<nodeId, depth> で管理し、循環参照を防止する。
 * 同一エッジが重複しないように、エッジの参照による Set で管理する。
 *
 * @param {Object} graph — グラフオブジェクト
 * @param {string} startNodeId — 探索起点ノードID
 * @param {number} hops — 最大ホップ数（1以上）
 * @returns {{ nodeIds: string[], edges: Object[] }}
 */
function multiHopBFS(graph, startNodeId, hops) {
  const visited = new Map([[startNodeId, 0]]);
  const queue = [startNodeId];
  const resultEdges = [];
  const edgeSet = new Set();

  while (queue.length) {
    const current = queue.shift();
    const depth = visited.get(current);
    if (depth >= hops) continue;

    for (const edge of graph.edges) {
      const neighbor =
        edge.from === current ? edge.to
        : edge.to === current ? edge.from
        : null;
      if (!neighbor) continue;

      // エッジの重複を防止（エッジオブジェクトの参照によるSet管理）
      if (!edgeSet.has(edge)) {
        edgeSet.add(edge);
        resultEdges.push(edge);
      }

      if (!visited.has(neighbor)) {
        visited.set(neighbor, depth + 1);
        queue.push(neighbor);
      }
    }
  }

  return { nodeIds: [...visited.keys()], edges: resultEdges };
}

// ============================================================
// 行位置動的解決（headingRefs 方式）
// ============================================================

/**
 * headingRefs を元に resolveByHeading で行位置を動的に解決する
 *
 * マーカー方式（旧）の後継。行番号を一切使わず、見出しレベル+トークン列から
 * ソースファイル内の該当行を特定する。
 *
 * headingRefs 配列から該当 refId の heading と texts を取得し、
 * resolveByHeading に渡す。見つからない場合は undefined を返し、
 * 呼び出し元が欠損時の警告を行う。
 *
 * @param {string} sourceText — ソースファイルの全文
 * @param {Array<{refId: string, heading: number, texts: string[]}>} headingRefs — headingRefs 配列
 * @param {string} refId — 解決する参照ID（例: "REF001"）
 * @returns {{ line: number, confidence: string }|undefined}
 */
function resolveCurrentLines(sourceText, headingRefs, refId) {
  const ref = headingRefs.find(r => r.refId === refId);
  if (!ref) return undefined;

  const result = resolveByHeading(sourceText, ref.heading, ref.texts);
  if (result.error) return undefined;

  return { line: result.line, confidence: result.confidence };
}

// ============================================================
// Markdown整形出力
// ============================================================

/**
 * ノード情報をMarkdown形式に整形する
 *
 * @param {Object} node — ノードオブジェクト
 * @param {Object[]} edges — このノードに関連するエッジ配列
 * @param {Object} graph — グラフ全体（ノード名解決用）
 * @param {string} sourceText — ソーステキスト（行番号解決用）
 * @returns {string} Markdown形式の文字列
 */
function formatNodeMarkdown(node, edges, graph, sourceText) {
  const lines = [];

  // 見出し
  lines.push(`## ${node.id}: ${node.title}`);
  lines.push('');

  // 種別と参照情報（headingRefs 方式 — 見出し表示）
  const headingRef = node.headingRefs && node.headingRefs[0];
  const refId = headingRef ? headingRef.refId : null;
  let refText = 'N/A';

  if (refId && Array.isArray(node.headingRefs)) {
    const resolved = resolveCurrentLines(sourceText, node.headingRefs, refId);
    if (resolved) {
      const headingLevel = headingRef.heading;
      const headingLabel = headingLevel > 0 ? `h${headingLevel}` : 'title';
      const headingSummary = headingRef.texts.slice(0, 2).join(' ');
      refText = `[${headingLabel}: ${headingSummary}] (L${resolved.line})`;
    } else {
      refText = 'N/A';
    }
  }

  lines.push(`**種別**: ${node.kind} | **参照**: ${refId || 'N/A'} ${refText}`);
  lines.push('');

  // Summary
  if (node.summary) {
    lines.push(node.summary);
    lines.push('');
  }

  // エッジ情報
  if (edges.length === 0) {
    lines.push('### 関係 (なし)');
    lines.push('');
    return lines.join('\n');
  }

  // エッジを type ごとにグループ化
  const groupedEdges = groupEdgesByType(edges);

  for (const [type, typeEdges] of groupedEdges) {
    // グループ内の代表的な strength を取得（最初のエッジの strength）
    const firstStrength = typeEdges[0].attributes
      ? typeEdges[0].attributes.strength || 'hard'
      : 'hard';

    lines.push(`### 関係 (${type} / ${firstStrength})`);

    for (const edge of typeEdges) {
      const targetNode = resolveNodeById(graph, edge.to === node.id ? edge.from : edge.to);
      const targetTitle = targetNode ? targetNode.title : '不明なノード';
      const direction = getDirectionLabel(node.id, edge);
      const strength = edge.attributes ? edge.attributes.strength || 'hard' : 'hard';

      lines.push(`- ${type} ${direction} ${targetNode ? targetNode.id : 'N/A'} (${targetTitle}) [${strength}]`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * エッジ配列を type ごとにグループ化する
 *
 * @param {Object[]} edges — エッジ配列
 * @returns {Map<string, Object[]>} type をキーとするグループ化済み Map
 */
function groupEdgesByType(edges) {
  const grouped = new Map();

  for (const edge of edges) {
    const type = edge.type || 'unknown';
    if (!grouped.has(type)) {
      grouped.set(type, []);
    }
    grouped.get(type).push(edge);
  }

  return grouped;
}

/**
 * ノードから見たエッジの方向ラベルを取得する
 *
 * @param {string} nodeId — 基準ノードID
 * @param {Object} edge — エッジオブジェクト
 * @returns {string} 方向ラベル（"→", "←", "↔"）
 */
function getDirectionLabel(nodeId, edge) {
  if (edge.attributes && edge.attributes.bidirectional) {
    return '↔';
  }
  if (edge.from === nodeId) {
    return '→';
  }
  return '←';
}

// ============================================================
// 3段テンプレートエラー出力
// ============================================================

/**
 * 3段テンプレートのエラーメッセージを標準エラー出力に書き込む
 *
 * @param {string} message — 何が起きたか
 * @param {string} cause — なぜ起きたか
 * @param {string} action — 次に取るべきアクション
 */
function printError(message, cause, action) {
  process.stderr.write(
    `[ERROR] ${message}\n` +
    `原因: ${cause}\n` +
    `対応: ${action}\n`
  );
}

// ============================================================
// ヘルプ表示
// ============================================================

/**
 * 使用方法を表示する
 */
function printUsage() {
  console.log(
    'query.js — マルチホップグラフ探索\n' +
    '\n' +
    'Usage:\n' +
    '  query.js --graph=<path> --source=<path> --id=<nodeId> [--hops=<N>]\n' +
    '\n' +
    'Options:\n' +
    '  --graph=<path>   グラフファイル（graph.schema.json 準拠）のパス\n' +
    '  --source=<path>  探索対象のソースファイルのパス\n' +
    '  --id=<nodeId>    探索起点のノードID（カンマ区切りで複数指定可）\n' +
    '  --hops=<N>       最大ホップ数（デフォルト: 1、1以上）\n' +
    '  --help, -h       このヘルプを表示\n' +
    '\n' +
    'Exit codes:\n' +
    '  0  正常終了（マーカー欠損時も0、警告はstderr）\n' +
    '  1  エラー終了（引数不正・ファイル不在等）\n' +
    '\n' +
    'Examples:\n' +
    '  query.js --graph=RFC-GRAPH.json --source=RFC.md --id=N0001 --hops=2\n' +
    '  query.js --graph=RFC-GRAPH.json --source=RFC.md --id=N0001,N0003 --hops=1\n'
  );
}

// ============================================================
// エントリポイント
// ============================================================

/**
 * main — CLIエントリポイント
 *
 * 1. 引数をパースする
 * 2. グラフファイルを読み込む
 * 3. ソースファイルを読み込む
 * 4. ノードを解決する
 * 5. BFSでグラフを探索する
 * 6. 行番号を動的に解決する
 * 7. 結果をMarkdown形式で整形する
 * 8. 標準出力に出力する
 *
 * 全エラーは3段テンプレートで stderr に出力し、終了コード1で終了する。
 * マーカー欠損時は部分結果 + stderr 通知、終了コード0で続行する。
 * ファイル変更は一切行わない。
 */
function main() {
  let graphPath, sourcePath, nodeIds, hops;

  // 1. 引数をパースする
  try {
    const parsed = parseArguments();
    graphPath = parsed.graphPath;
    sourcePath = parsed.sourcePath;
    nodeIds = parsed.nodeIds;
    hops = parsed.hops;
  } catch (parseError) {
    printError(
      '引数のパースに失敗しました。',
      parseError.message,
      '正しい引数で再実行してください。'
    );
    process.exit(EXIT_FAILURE);
  }

  // 2. グラフファイルを読み込む
  let graph;
  try {
    graph = loadGraph(graphPath);
  } catch (graphError) {
    printError(
      'グラフファイルの読み込みに失敗しました。',
      graphError.message,
      '--graph=<path> に正しいグラフファイルを指定してください。'
    );
    process.exit(EXIT_FAILURE);
  }

  // 3. ソースファイルを読み込む
  let sourceText;
  try {
    sourceText = loadSourceFile(sourcePath);
  } catch (sourceError) {
    printError(
      'ソースファイルの読み込みに失敗しました。',
      sourceError.message,
      '--source=<path> に正しいソースファイルを指定してください。'
    );
    process.exit(EXIT_FAILURE);
  }

  // headingRefs 欠損の追跡
  let hasHeadingRefWarning = false;

  // 各ノードIDに対して探索と出力を実行
  for (const nodeId of nodeIds) {
    // 4. ノードを解決する
    const startNode = resolveNodeById(graph, nodeId);
    if (!startNode) {
      printError(
        `ノード ${nodeId} がグラフ内に見つかりません。`,
        `グラフ内のノード: [${graph.nodes.map(n => n.id).join(', ')}]`,
        '--id=<nodeId> に正しいノードIDを指定してください。'
      );
      process.exit(EXIT_FAILURE);
    }

    // 5. BFSでグラフを探索する
    const searchResult = multiHopBFS(graph, nodeId, hops);

    // 探索結果のノードのうち、起点以外のノード名を解決
    const visitedNodes = searchResult.nodeIds
      .map(id => resolveNodeById(graph, id))
      .filter(Boolean);

    // 6. 行位置を動的に解決し、欠損時に警告を出力する
    for (const vNode of visitedNodes) {
      if (!Array.isArray(vNode.headingRefs)) continue;
      for (const hr of vNode.headingRefs) {
        const resolved = resolveCurrentLines(sourceText, vNode.headingRefs, hr.refId);
        if (!resolved) {
          process.stderr.write(
            `[WARN] ノード ${vNode.id} の refId ${hr.refId} の見出しがソースファイル内に見つかりません。\n` +
            `原因: 見出しが書き換えられたか、headingRefs が更新されていない可能性があります。\n` +
            `対応: clarify-rfc / graphify-rfc を再実行して headingRefs を更新してください。\n`
          );
          hasHeadingRefWarning = true;
        }
      }
    }

    // 7. 結果をMarkdown形式で整形する
    const allEdges = searchResult.edges;
    const markdown = formatNodeMarkdown(startNode, allEdges, graph, sourceText);
    console.log(markdown);

    // 複数ノード指定時に区切りを出力
    if (nodeIds.length > 1 && nodeIds.indexOf(nodeId) < nodeIds.length - 1) {
      console.log('');
      console.log('---');
      console.log('');
    }
  }

  // headingRefs 欠損があっても終了コード0（部分結果を返す）
  if (hasHeadingRefWarning) {
    process.stderr.write(
      `[WARN] 一部のノードで headingRefs に対応する見出しが見つかりませんでした。出力の行位置が正しくない可能性があります。\n`
    );
  }

  process.exit(EXIT_SUCCESS);
}

// CLIとして実行された場合のみ main を呼び出す
if (require.main === module) {
  main();
}

module.exports = {
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
  printError,
  printUsage,
  resolveByHeading,
};
