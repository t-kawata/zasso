#!/usr/bin/env node
/**
 * boundify-graph-to-dirs.js <graph-json-path> [--json] [--dry-run] [--force]
 *
 * graphify が生成したグラフJSONを解析し、安全な境界を持つディレクトリツリーを
 * 提案する。Dirs-Tree.json を出力する（*-BOUNDIFY-Status.json は update-step-status.js が管理）。
 *
 * 下位層モジュール（boundify-helpers.js、boundify-tree.js）を require で読み込み、
 * アダプター関数を介して関数シグネチャの差異を吸収する。
 *
 * PX-30: 出力 Dirs-Tree.json の各言語ツリーに、prose 系ノードのクロスリファレンス
 * （crossReferences）を boundify-tree.js の computeCrossReferences() 経由で注入する。
 *
 * CLI: boundify-graph-to-dirs.js /path/to/RFC-ROOT-GRAPH.json [--json] [--quiet]
 *
 * 出力契約:
 *   --json なし → 標準出力に .en.md + Markdown分析 + ```json ブロック
 *   --json あり → 標準出力に JSON のみ
 *   --quiet     → 標準出力を抑制（ファイル出力のみ）
 *   常にグラフ同ディレクトリに Dirs-Tree.json を書き出す（*-BOUNDIFY-Status.json は update-step-status.js が管理）
 *
 * @module boundify-graph-to-dirs
 */

"use strict";

const fs = require("fs");
const path = require("path");

// ============================================================
// 既存下位層モジュールの読み込み
// ============================================================

const helpers = require("./boundify-helpers.js");
const treeBuilder = require("./boundify-tree.js");
const { validateFiles } = require("./validate-dirs-tree-schema.js");
const { createDefaultStatus, atomicWrite } = require("./update-boundify-step-status.js");

// ============================================================
// 定数定義
// ============================================================

/** 正常終了コード */
const EXIT_SUCCESS = 0;
/** 異常終了コード */
const EXIT_FAILURE = 1;

/** 言語別拡張子（boundify-helpers から流用、循環参照回避のため独立定義） */
const LANGUAGE_EXTENSIONS = Object.freeze({
  rust: ".rs",
  go: ".go",
  typescript: ".ts",
});

/** 3段テンプレートエラー — 引数不足時 */
const ERROR_MISSING_ARGS =
  "[ERROR] 引数が不足しています\n" +
  "原因: グラフJSONファイルのパスが必要です\n" +
  "対応: boundify-graph-to-dirs.js <graph-json-path> [--json] [--quiet] [--dry-run] [--force]";

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
 * `--graph=<path>` 形式（正規）または位置引数 `<path>` 形式（後方互換）に対応する。
 * 両方が指定された場合は `--graph=` を優先する。
 *
 * @param {string[]} [testArgs] — テスト用の引数配列（省略時は process.argv）
 * @returns {{ graphPath: string, graphDir: string, basename: string, flags: { json: boolean, dryRun: boolean, force: boolean, quiet: boolean } }}
 * @throws {never} — 異常時は process.exit(EXIT_FAILURE) で終了
 */
function parseArguments(testArgs) {
  const args = testArgs || process.argv.slice(2);

  // 引数なし、または --help/-h の場合は使用方法を表示して終了
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    printUsage();
    process.exit(EXIT_SUCCESS);
  }

  // --graph=<path> 形式を検出してパスを抽出（正規形式）
  const GRAPH_FLAG_PREFIX = "--graph=";
  const graphFlagArg = args.find(function (a) {
    return a.startsWith(GRAPH_FLAG_PREFIX);
  });
  const rawPath = graphFlagArg
    ? graphFlagArg.slice(GRAPH_FLAG_PREFIX.length)
    : args[0];

  // 空文字列の場合はエラー
  if (!rawPath) {
    reportError(
      "グラフファイルのパスが空です",
      "--graph= の後にパスが指定されていない",
      "--graph=/path/to/RFC-ROOT-GRAPH.json の形式で指定してください",
    );
    process.exit(EXIT_FAILURE);
  }

  // グラフパスを解決
  const graphPath = path.resolve(rawPath);
  if (!fs.existsSync(graphPath)) {
    reportError(
      `グラフファイルが見つかりません: ${graphPath}`,
      "指定されたパスにファイルが存在しない",
      "グラフJSONファイルの正しいパスを指定してください" +
        "（例: node boundify-graph-to-dirs.js --graph=./RFC-ROOT-GRAPH.json）",
    );
    process.exit(EXIT_FAILURE);
  }

  const flags = {
    json: args.includes("--json"),
    dryRun: args.includes("--dry-run"),
    force: args.includes("--force"),
    quiet: args.includes("--quiet"),
  };

  const graphDir = path.dirname(graphPath);
  const baseName = path.basename(graphPath, path.extname(graphPath));
  // basename: 接尾辞 -GRAPH があれば除去、なければファイル名そのまま
  const basename = baseName.endsWith("-GRAPH")
    ? baseName.slice(0, -6)
    : baseName;

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
    raw = fs.readFileSync(graphPath, "utf-8");
  } catch (e) {
    reportError(
      `グラフファイルの読み込みに失敗しました: ${e.message}`,
      "ファイルI/Oエラー",
      "ファイルのパーミッションと存在を確認してください",
    );
    process.exit(EXIT_FAILURE);
  }

  let graph;
  try {
    graph = JSON.parse(raw);
  } catch (e) {
    reportError(
      `グラフJSONのパースに失敗しました: ${e.message}`,
      "JSON形式が不正",
      "グラフファイルが有効なJSONであることを確認してください" +
        '（node -e "JSON.parse(fs.readFileSync(...))" で検証可能）',
    );
    process.exit(EXIT_FAILURE);
  }

  if (!graph.nodes || !Array.isArray(graph.nodes)) {
    reportError(
      "グラフJSONに nodes 配列が見つかりません",
      "必須フィールド nodes が欠落",
      "/graphify-rfc で生成された正しいグラフJSONを入力してください",
    );
    process.exit(EXIT_FAILURE);
  }

  if (!graph.edges || !Array.isArray(graph.edges)) {
    reportError(
      "グラフJSONに edges 配列が見つかりません",
      "必須フィールド edges が欠落",
      "/graphify-rfc で生成された正しいグラフJSONを入力してください",
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
 * PX-25: languageExtensions を注入して titleToFileName を代替。
 * ファイル名はノードの slug + 拡張子から生成される。
 *
 * @param {object} graph — グラフオブジェクト
 * @param {string} lang — 言語名 ('rust' | 'go' | 'typescript')
 * @returns {{ tree: object|null, nodeToDir: object, files: Array }}
 */
function adaptBuildDirectoryTree(graph, lang) {
  const boundHelpers = {
    languageExtensions: LANGUAGE_EXTENSIONS,
    deduplicateFileNames: helpers.deduplicateFileNames,
    getDeclarationStub: helpers.getDeclarationStub,
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
 * グラフから実在する言語値のリストを収集する
 *
 * PX-24 で追加されたノードの language フィールド（単一値）を直接読み取る。
 * 言語推論は行わない。language 未設定のノードは無視。
 * 全ノードが language 未設定の場合は graph.mainLanguage をフォールバックとして使用する。
 *
 * @param {{ mainLanguage?: string, nodes: object[] }} graph — グラフオブジェクト
 * @returns {string[]} 使用する言語値のユニーク配列（少なくとも1件）
 */
function collectLanguagesFromGraph(graph) {
  const languageSet = new Set();
  for (const node of (graph.nodes || [])) {
    if (node.language && typeof node.language === "string") {
      languageSet.add(node.language);
    }
  }
  if (languageSet.size === 0 && graph.mainLanguage && typeof graph.mainLanguage === "string") {
    languageSet.add(graph.mainLanguage);
  }
  return Array.from(languageSet);
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
    const kind = node.kind || "unknown";
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
    if (node.type === "directory") {
      const fullPath = currentPath ? currentPath + "/" + node.name : node.name;
      paths.add(fullPath);
      if (node.children) {
        for (const child of node.children) {
          walk(child, fullPath);
        }
      }
    }
  }

  walk(tree, "");
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
    const segments = dirPath.split("/");
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
 * 2ファイル（Dirs-Tree.json、Status.json）をグラフJSONと同じディレクトリに出力する。
 * basename は -GRAPH 接尾辞が除去されたベース名。
 *
 * @param {string} graphDir — グラフディレクトリ
 * @param {string} basename — ベース名（-GRAPH 除去済み）
 * @returns {{ dirsTreePath: string, statusPath: string }}
 */
function resolveOutputPaths(graphDir, basename) {
  return {
    dirsTreePath: path.join(graphDir, `${basename}-Dirs-Tree.json`),
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
 *   3. グラフ内実在言語を収集 → collectLanguagesFromGraph
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

  // ---- Step 3: グラフ内実在言語を収集 ----
  // PX-24 スキーマの language フィールド（単一値）を直接読み取る。
  // language 未設定のノードは無視される。
  const languages = collectLanguagesFromGraph(graph);

  // ---- Step 4: 言語別ツリー生成と依存解析 ----
  const trees = {};
  const allDependencyDirections = {};
  const allWarnings = [];

  for (const lang of languages) {
    // 4-a: ディレクトリツリー生成（アダプター経由）
    const { tree, nodeToDir, nodeIdToFilePath } = adaptBuildDirectoryTree(graph, lang);
    trees[lang] = tree;

    // 4-a2: クロスリファレンス計算（PX-30: prose 系ノードの設計情報を接続先ファイルに紐付け）
    if (tree && graph) {
      tree.crossReferences = treeBuilder.computeCrossReferences(graph, nodeToDir, nodeIdToFilePath);
    }

    // 4-b: エッジ投影（アダプター経由）
    const dirEdges = adaptProjectEdgesToDirectories(graph, nodeToDir);

    // 依存方向の記録（ディレクトリ名→フルパスに解決）
    const dirPaths = collectDirectoryPaths(tree);
    allDependencyDirections[lang] = dirEdges.map(function (edge) {
      return {
        from: resolveDirNameToPath(dirPaths, edge.from) || edge.from,
        to: resolveDirNameToPath(dirPaths, edge.to) || edge.to,
        rule: edge.from + " → " + edge.to + " (" + edge.evidence + ")",
      };
    });

    // 4-c: 循環依存検出
    const cycles = helpers.tarjanSCC(dirEdges);
    for (const cycle of cycles) {
      const cyclePath = cycle.cycle.join(" → ");
      allWarnings.push({
        cycle: cycle.cycle,
        language: lang,
        message:
          `循環依存を検出しました: ${cyclePath}（${lang}）\n` +
          `この循環は design-level の問題である可能性があります。以下の手順で対応してください:\n` +
          `\n` +
          `  1. 循環に含まれる各エッジの種類（depends_on, refines 等）と、その意味論が本当に双方向依存なのか確認してください\n` +
          `\n` +
          `  2. 真に双方向依存が必要な関係（例: 互いに参照し合う状態機械等）は、設計として許容する判断をしてください。\n` +
          `     その場合、warnings は既知の制約として記録されたまま次Stepに進んで構いません\n` +
          `\n` +
          `  3. 一方通行にできる関係は、crud.js で該当エッジを修正してください:\n` +
          `     node .claude/scripts/rfc-graph/crud.js --graph="<graphPath>" delete-edges --file=_remove.json\n` +
          `     node .claude/scripts/rfc-graph/crud.js --graph="<graphPath>" create-edges --file=_add.json\n` +
          `\n` +
          `  4. 循環が設計上の誤りである場合、ソースRFCを確認して正しい依存関係を特定し、crud.js でエッジ定義を直接修正してください\n` +
          `\n` +
          `  5. 修正後、本スクリプトを再実行して循環が解消されたことを確認し、verify-graph-integrity.js で退行チェックを実行してください\n` +
          `\n` +
          `注意: 意味論を無視したエッジの削除や反転はグラフの品質を損なうため避けてください。必ず各エッジの意味を確認した上で修正してください`,
      });
    }
  }

  // ---- Step 5: Dirs-Tree.json 構築 ----
  const dirsTree = {
    schemaVersion: "1.0",
    generatedAt: new Date().toISOString(),
    sourceGraph: graphPath,
    sourceFile: graph.sourceFile || '',
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

  // --dry-run モード: ファイル書き出しと検証をスキップ
  if (flags.dryRun) {
    if (flags.json) {
      console.log(JSON.stringify(dirsTree, null, 2));
    } else if (!flags.quiet) {
      const report = treeBuilder.generateReport(graph, dirsTree, "rust");
      const jsonBlock = JSON.stringify(dirsTree, null, 2);
      console.log(helpers.SAFE_BOUNDARIES_EN_TEXT);
      console.log("");
      console.log(report);
      console.log("");
      console.log("```json");
      console.log(jsonBlock);
      console.log("```");
    }
    return;
  }

  // まず Dirs-Tree.json を書き出す（検証のために必要）
  fs.writeFileSync(
    outputPaths.dirsTreePath,
    JSON.stringify(dirsTree, null, 2),
    "utf-8",
  );

  // 書き出したファイルを validateFiles で検証
  const validationResult = validateFiles(outputPaths.dirsTreePath, graphPath);
  if (!validationResult.ok) {
    // 検証失敗時は書き出したファイルを削除して終了
    try {
      fs.unlinkSync(outputPaths.dirsTreePath);
    } catch (_) {
      /* 削除失敗は無視 */
    }
    reportError(
      "Dirs-Tree.json のスキーマ検証に失敗しました",
      validationResult.errors.join("\n"),
      "validate-dirs-tree-schema.js の出力を確認して修正してください",
    );
    process.exit(EXIT_FAILURE);
  }

  // BOUNDIFY-Status.json を正しい形式で書き出す
  // update-boundify-step-status.js の createDefaultStatus を借用し、
  // スキーマの共通化を図る（分散したスキーマ定義のリスクを回避）
  const statusData = createDefaultStatus(outputPaths.statusPath);
  statusData.currentStep = 2;
  statusData.steps["0"] = "done";
  statusData.steps["1"] = "done";
  statusData.steps["2"] = "running";
  atomicWrite(outputPaths.statusPath, JSON.stringify(statusData, null, 2));

  // ---- Step 7: 標準出力の3分岐 ----
  if (flags.json) {
    // --json: JSON のみ stdout
    console.log(JSON.stringify(dirsTree, null, 2));
  } else if (!flags.quiet) {
    // デフォルト: .en.md + Markdown + JSON ブロック
    const report = treeBuilder.generateReport(graph, dirsTree, "rust");
    const jsonBlock = JSON.stringify(dirsTree, null, 2);
    console.log(helpers.SAFE_BOUNDARIES_EN_TEXT);
    console.log("");
    console.log(report);
    console.log("");
    console.log("```json");
    console.log(jsonBlock);
    console.log("```");
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
  collectLanguagesFromGraph,
  reportError,
  printUsage,
  countKinds,
  countEdgeTypes,
  resolveOutputPaths,
  collectDirectoryPaths,
  resolveDirNameToPath,
  LANGUAGE_EXTENSIONS,
};
