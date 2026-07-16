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

const fs = require("fs");
const path = require("path");
const { resolveByHeading } = require("./resolve-by-heading.js");

// ============================================================
// 定数定義
// ============================================================

/** グラフファイルパスを指定するCLI引数のプレフィックス */
const GRAPH_PATH_ARG_PREFIX = "--graph=";

/** ソースファイルパスを指定するCLI引数のプレフィックス */
const SOURCE_PATH_ARG_PREFIX = "--source=";

/** ノードIDを指定するCLI引数のプレフィックス */
const NODE_ID_ARG_PREFIX = "--id=";

/** ホップ数を指定するCLI引数のプレフィックス */
const HOPS_ARG_PREFIX = "--hops=";

/** Dirs-Tree.json のパスを指定するCLI引数のプレフィックス（省略可） */
const DIRS_TREE_ARG_PREFIX = "--dirs-tree=";

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
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    printUsage();
    process.exit(EXIT_SUCCESS);
  }

  // 全引数をフラグ名で検索（位置に依存しない）
  let graphPath = null, sourcePath = null, nodeIds = null;
  let hops = DEFAULT_HOPS;
  let dirsTreePath = null;

  for (const arg of args) {
    if (arg.startsWith(GRAPH_PATH_ARG_PREFIX)) {
      graphPath = arg.slice(GRAPH_PATH_ARG_PREFIX.length);
    } else if (arg.startsWith(SOURCE_PATH_ARG_PREFIX)) {
      sourcePath = arg.slice(SOURCE_PATH_ARG_PREFIX.length);
    } else if (arg.startsWith(NODE_ID_ARG_PREFIX)) {
      const rawIds = arg.slice(NODE_ID_ARG_PREFIX.length);
      // 空 ID、および後続の -- フラグが連結した場合のゴミを除去
      // 後続フラグ（全角スペース等で連結されたケース）を除去
      const cleaned = rawIds.replace(/[\s　]+--.*$/, '');
      if (!cleaned) continue;
      nodeIds = cleaned.split(",").map((id) => id.trim()).filter((id) => id.length > 0);
    } else if (arg.startsWith(HOPS_ARG_PREFIX)) {
      hops = parseHops(arg);
    } else if (arg.startsWith(DIRS_TREE_ARG_PREFIX)) {
      dirsTreePath = arg.slice(DIRS_TREE_ARG_PREFIX.length);
    }
  }

  // 必須フラグのバリデーション
  if (!graphPath) throw new Error("--graph=<path> is required.");
  if (!sourcePath) throw new Error("--source=<path> is required.");
  if (!nodeIds || nodeIds.length === 0) throw new Error("--id=<nodeId> is required.");

  return { graphPath, sourcePath, nodeIds, hops, dirsTreePath };
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
      "The 3rd argument must be --id=<nodeId>.\n" +
        `  Actual value: ${idFlag}`,
    );
  }
  const rawIds = idFlag.slice(NODE_ID_ARG_PREFIX.length);
  if (!rawIds) {
    throw new Error("--id=<nodeId> <nodeId> is empty.");
  }
  return rawIds
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
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
      "The 4th argument must be --hops=<N>.\n" +
        `  Actual value: ${hopsFlag}`,
    );
  }
  const hopsStr = hopsFlag.slice(HOPS_ARG_PREFIX.length);
  if (!hopsStr) {
    throw new Error("--hops=<N> <N> is empty.");
  }
  const hops = parseInt(hopsStr, 10);
  if (!Number.isInteger(hops) || hops < 1) {
    throw new Error(
      "<N> in --hops=<N> must be a positive integer.\n" +
        `  Actual value: ${hopsStr}`,
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
  const raw = fs.readFileSync(resolvedPath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (parseError) {
    throw new Error(
      `Failed to parse graph JSON file: ${graphPath}\n` +
        `Cause: ${parseError.message}`,
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
  return fs.readFileSync(resolvedPath, "utf8");
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
  return graph.nodes.find((n) => n.id === nodeId) || null;
}

// ============================================================
// BFSマルチホップ探索
// ============================================================

/**
 * BFS（幅優先探索）でグラフを探索する
 *
 * 無向グラフとして扱い、edge.from / edge.to 両方向を探索する。
 * visited は Map<nodeId, depth> で管理し、循環参照を防止する。
 * 同一エッジが重複しないように、from:to:type の文字列キーで管理する。
 *
 * @param {Object} graph — グラフオブジェクト
 * @param {string} startNodeId — 探索起点ノードID
 * @param {number} hops — 最大ホップ数（1以上）
 * @returns {{ nodeIds: string[], edges: Object[] }}
 */
function multiHopBFS(graph, startNodeId, hops) {
  const visited = new Map([[startNodeId, { depth: 0, parent: null }]]);
  const queue = [startNodeId];
  const resultEdges = [];
  const edgeKeys = new Set();

  while (queue.length) {
    const current = queue.shift();
    const entry = visited.get(current);
    if (entry.depth >= hops) continue;

    for (const edge of graph.edges) {
      const neighbor =
        edge.from === current
          ? edge.to
          : edge.to === current
            ? edge.from
            : null;
      if (!neighbor) continue;

      // エッジの重複を防止（from+to+type の複合キーで管理）
      // from→to と to→from は方向が異なる別エッジとして扱う
      const key = edge.from + ':' + edge.to + ':' + edge.type;
      if (!edgeKeys.has(key)) {
        edgeKeys.add(key);
        resultEdges.push(edge);
      }

      if (!visited.has(neighbor)) {
        visited.set(neighbor, {
          depth: entry.depth + 1,
          parent: current,
          edge: edge,
        });
        queue.push(neighbor);
      }
    }
  }

  return {
    nodeIds: [...visited.keys()],
    edges: resultEdges,
    depthMap: visited,
  };
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
  const ref = headingRefs.find((r) => r.refId === refId);
  if (!ref) return undefined;

  // resolveByHeading は行配列を期待するため、文字列を分割する
  const sourceLines = sourceText.split("\n");
  const result = resolveByHeading(sourceLines, ref.heading, ref.texts);
  if (!result) return undefined;

  return { line: result.line, confidence: result.confidence };
}

// ============================================================
// Markdown整形出力
// ============================================================

/**
 * BFSのdepthMapから、起点ノードからtargetIdまでの経路を再構成する
 *
 * parent チェーンを逆にたどり、N0113 → N0119 → N0120 の配列を返す。
 * targetId が depthMap に含まれない場合は空配列。
 *
 * @param {Map} depthMap — BFS の訪問記録
 * @param {string} targetId — 経路終点のノードID
 * @returns {string[]} 経路上のノードID配列（起点→終点の順）
 */
function buildPathToNode(depthMap, targetId) {
  if (!depthMap.has(targetId)) return [];
  const path = [];
  let current = targetId;
  while (current !== null && depthMap.has(current)) {
    path.unshift(current);
    current = depthMap.get(current).parent;
  }
  return path;
}

/**
 * depthMap から親子隣接リストを構築する
 *
 * BFS の訪問記録から各親ノードに子ノードのリストを集約する。
 * 子ノードはノードID順にソートされる。
 *
 * @param {Map} depthMap — BFS の訪問記録（{depth, parent, edge}）
 * @returns {Map<string, Array<{nodeId:string, edge:Object}>>}
 */
function buildChildMap(depthMap) {
  const map = new Map();
  if (!depthMap) return map;
  for (const [nodeId, entry] of depthMap) {
    if (entry.parent === null) continue;
    if (!map.has(entry.parent)) map.set(entry.parent, []);
    map.get(entry.parent).push({ nodeId, edge: entry.edge });
  }
  for (const [, children] of map) {
    children.sort((a, b) => a.nodeId.localeCompare(b.nodeId));
  }
  return map;
}

/**
 * 親子隣接リストから再帰的にツリー行を生成する
 *
 * 各行の形式: {indent}- {edge.type} {direction} {nodeId} ({title})
 * direction は親ノードから見た方向（→ / ← / ↔）。
 *
 * @param {string} parentId — 親ノードID
 * @param {number} depth — インデント深さ（1始まり）
 * @param {Map} childMap — buildChildMap の出力
 * @param {Object} graph — グラフ全体（ノード名解決用）
 * @param {string[]} lines — 行蓄積配列（破壊的追加）
 */
function renderChildTree(parentId, depth, childMap, graph, lines) {
  const children = childMap.get(parentId) || [];
  const indent = "    ".repeat(depth);
  for (const { nodeId, edge } of children) {
    const childNode = resolveNodeById(graph, nodeId);
    if (!childNode) continue;
    const direction = getDirectionLabel(parentId, edge);
    lines.push(
      `${indent}- ${edge.type} ${direction} ${nodeId} (${childNode.title})`,
    );
    renderChildTree(nodeId, depth + 1, childMap, graph, lines);
  }
}

/**
 * 行配列から該当見出し行を起点に、次の同レベル以上の見出しまでを本文として抽出する
 *
 * 見出し行自身は除外し、本文のみを返す。
 * 次の見出しがない場合は EOF までを抽出する。
 *
 * @param {string[]} sourceLines — ソースファイルの行配列
 * @param {number} headingLineIndex — 見出し行の0-basedインデックス
 * @returns {string|null} 抽出された本文、失敗時は null
 */
function extractSectionContent(sourceLines, headingLineIndex) {
  if (!Array.isArray(sourceLines) || sourceLines.length === 0) return null;
  if (headingLineIndex < 0 || headingLineIndex >= sourceLines.length)
    return null;

  const headingLine = sourceLines[headingLineIndex];
  const headingMatch = headingLine.match(/^(#+)\s/);
  if (!headingMatch) return null;
  const headingLevel = headingMatch[1].length;

  // 次の同レベル以上の見出しまで走査（なければ EOF）
  let endIndex = sourceLines.length;
  for (let i = headingLineIndex + 1; i < sourceLines.length; i++) {
    const m = sourceLines[i].match(/^(#+)\s/);
    if (m && m[1].length <= headingLevel) {
      endIndex = i;
      break;
    }
  }

  // 見出し行自身を除外
  const contentLines = sourceLines.slice(headingLineIndex + 1, endIndex);
  if (contentLines.length === 0) return null;

  return contentLines.join("\n");
}

/**
 * ノード情報をMarkdown形式に整形する
 *
 * @param {Object} node — ノードオブジェクト
 * @param {Object[]} edges — このノードに関連するエッジ配列
 * @param {Object} graph — グラフ全体（ノード名解決用）
 * @param {string} sourceText — ソーステキスト（行番号解決用）
 * @param {Map} [depthMap] — BFS の訪問記録（周辺ノード間エッジの経路表示用）
 * @param {Object|null} [nodeToDirMap] — nodeId→ファイルパスのマップ（省略可）
 * @returns {string} Markdown形式の文字列
 */
function formatNodeMarkdown(node, edges, graph, sourceText, depthMap, nodeToDirMap) {
  const lines = [];

  // 見出し
  lines.push(`## ${node.id}: ${node.title}`);
  lines.push("");
  // 種別
  lines.push(`**Kind**: ${node.kind}`);
  lines.push("");

  // Summary（グラフJSON内の短い説明）
  if (node.summary) {
    lines.push(node.summary);
    lines.push("");
  }

  // RFC での記述（--source の該当セクション本文）
  if (
    sourceText &&
    Array.isArray(node.headingRefs) &&
    node.headingRefs.length > 0
  ) {
    const ref = node.headingRefs[0];
    const sourceLines = sourceText.split("\n");
    const resolved = resolveByHeading(sourceLines, ref.heading, ref.texts);
    if (resolved) {
      const content = extractSectionContent(sourceLines, resolved.line - 1);
      if (content) {
        lines.push("### RFC Description\n");
        lines.push("---");
        lines.push(content);
        lines.push("---\n");
      }
    }
  }

  // 実装先となるファイルパス（--dirs-tree 指定時のみ表示）
  if (nodeToDirMap) {
    const filePath = nodeToDirMap[node.id];
    lines.push("### Implementation File Path\n");
    if (filePath) {
      lines.push("```");
      lines.push(filePath);
      lines.push("```\n");
    } else {
      lines.push("(No file assigned to this node)\n");
    }
  }

  // ツリー形式で関係性を表示
  if (edges.length === 0) {
    lines.push("### Relationships with Other Nodes");
    lines.push("");
    return lines.join("\n");
  }

  lines.push("### Relationships with Other Nodes\n");

  // depthMap から親子隣接リストを構築し、再帰的に子ノードを描画
  if (depthMap) {
    const childMap = buildChildMap(depthMap);
    // ルート行（検索起点ノード）
    lines.push(`- ${node.id} (${node.title})`);
    renderChildTree(node.id, 1, childMap, graph, lines);
  } else {
    // depthMap がない場合は edges 配列から直接レンダリング
    const grouped = groupEdgesByType(edges);
    for (const [type, typeEdges] of grouped) {
      for (const edge of typeEdges) {
        const neighbor = edge.from === node.id ? edge.to : edge.from;
        const neighborNode = resolveNodeById(graph, neighbor);
        const title = neighborNode ? neighborNode.title : neighbor;
        const dir = getDirectionLabel(node.id, edge);
        lines.push(`  - ${edge.type} ${dir} ${neighbor} (${title})`);
      }
    }
  }

  return lines.join("\n");
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
    const type = edge.type || "unknown";
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
    return "↔";
  }
  if (edge.from === nodeId) {
    return "→";
  }
  return "←";
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
    `[ERROR] ${message}\n` + `Cause: ${cause}\n` + `Action: ${action}\n`,
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
    "query.js — Multi-hop graph traversal\n" +
      "\n" +
      "Usage:\n" +
      "  query.js --graph=<path> --source=<path> --id=<nodeId> [--hops=<N>] [--dirs-tree=<path>]\n" +
      "\n" +
      "Options:\n" +
      "  --graph=<path>       グラフファイル（graph.schema.json 準拠）のパス\n" +
      "  --source=<path>      探索対象のソースファイルのパス\n" +
      "  --id=<nodeId>        探索起点のノードID（カンマ区切りで複数指定可）\n" +
      "  --hops=<N>           最大ホップ数（デフォルト: 1、1以上）\n" +
      "  --dirs-tree=<path>   Dirs-Tree.json のパス（省略可、指定時は実装先ファイルパスを表示）\n" +
      "  --help, -h           このヘルプを表示\n" +
      "\n" +
      "Exit codes:\n" +
      "  0  正常終了\n" +
      "  1  エラー終了（引数不正・ファイル不在等）\n" +
      "\n" +
      "Examples:\n" +
      "  query.js --graph=RFC-GRAPH.json --source=RFC.md --id=N0001 --hops=2\n" +
      "  query.js --graph=RFC-GRAPH.json --source=RFC.md --id=N0001,N0003 --hops=1\n" +
      "  query.js --graph=RFC-GRAPH.json --source=RFC.md --id=N0001 --dirs-tree=RFC-Dirs-Tree.json\n",
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
  let graphPath, sourcePath, nodeIds, hops, dirsTreePath;

  // 1. 引数をパースする
  try {
    const parsed = parseArguments();
    graphPath = parsed.graphPath;
    sourcePath = parsed.sourcePath;
    nodeIds = parsed.nodeIds;
    hops = parsed.hops;
    dirsTreePath = parsed.dirsTreePath;
  } catch (parseError) {
    printError(
      "Failed to parse arguments.",
      parseError.message,
      "Re-run with correct arguments.",
    );
    process.exit(EXIT_FAILURE);
  }

  // 2. グラフファイルを読み込む
  let graph;
  try {
    graph = loadGraph(graphPath);
  } catch (graphError) {
    printError(
      "Failed to load graph file.",
      graphError.message,
      "Specify a valid graph file via --graph=<path>.",
    );
    process.exit(EXIT_FAILURE);
  }

  // 3. ソースファイルを読み込む
  let sourceText;
  try {
    sourceText = loadSourceFile(sourcePath);
  } catch (sourceError) {
    printError(
      "Failed to load source file.",
      sourceError.message,
      "Specify a valid source file via --source=<path>.",
    );
    process.exit(EXIT_FAILURE);
  }

  // 4. Dirs-Tree.json が指定されていれば node→dir マップを構築
  let nodeToDirMap = null;
  if (dirsTreePath) {
    try {
      const { buildNodeToDirMap } = require("./validate-phasify.js");
      const dirsTreeData = JSON.parse(
        fs.readFileSync(path.resolve(dirsTreePath), "utf8"),
      );
      nodeToDirMap = buildNodeToDirMap(dirsTreeData);
    } catch (e) {
      printError(
        "Failed to load Dirs-Tree.json.",
        e.message,
        "Specify a valid Dirs-Tree.json via --dirs-tree=<path>.",
      );
      process.exit(EXIT_FAILURE);
    }
  }

  // 各ノードIDに対して探索と出力を実行
  for (const nodeId of nodeIds) {
    // 4. ノードを解決する
    const startNode = resolveNodeById(graph, nodeId);
    if (!startNode) {
      printError(
        `Node ${nodeId} not found in graph.`,
        `Nodes in graph: [${graph.nodes.map((n) => n.id).join(", ")}]`,
        "Specify a valid node ID via --id=<nodeId>.",
      );
      process.exit(EXIT_FAILURE);
    }

    // 5. BFSでグラフを探索する
    const searchResult = multiHopBFS(graph, nodeId, hops);

    // 探索結果のノードのうち、起点以外のノード名を解決
    const visitedNodes = searchResult.nodeIds
      .map((id) => resolveNodeById(graph, id))
      .filter(Boolean);

    // 6. 結果をMarkdown形式で整形する
    const allEdges = searchResult.edges;
    const markdown = formatNodeMarkdown(
      startNode,
      allEdges,
      graph,
      sourceText,
      searchResult.depthMap,
      nodeToDirMap,
    );
    console.log(markdown);

    // 深掘り案内
    console.log("");
    console.log("---\n");
    console.log("### How to dig deeper");
    console.log(
      "You can dig deeper into node information with the following command.",
    );
    console.log("```");
    console.log(
      `node .claude/scripts/rfc-graph/query.js --graph="${graphPath}" --source="${sourcePath}"${dirsTreePath ? ' --dirs-tree="' + dirsTreePath + '"' : ''} --id=<target node ID (N??? format)> --hops=<number of hops to traverse>`,
    );
    console.log("```");

    // 複数ノード指定時に区切りを出力
    if (nodeIds.length > 1 && nodeIds.indexOf(nodeId) < nodeIds.length - 1) {
      console.log("");
      console.log("---");
      console.log("");
    }
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
  buildPathToNode,
  buildChildMap,
  renderChildTree,
  extractSectionContent,
  resolveCurrentLines,
  formatNodeMarkdown,
  groupEdgesByType,
  getDirectionLabel,
  printError,
  printUsage,
  resolveByHeading,
};
