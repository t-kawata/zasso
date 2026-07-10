#!/usr/bin/env node

/**
 * show-phase-nodes.js — フェーズ内ノード詳細のMarkdown出力
 *
 * split-to-tickets パイプラインの Step 5-1 で使用する。
 * 指定フェーズに割り当てられた全ノードの詳細（ID・タイトル・種別・要約・実装先ファイルパス）を
 * query.js --dirs-tree を子プロセスで呼び出して取得し、読みやすい Markdown 形式で stdout に出力する。
 * 各ノードは graphify-rfc によって安全な I/O 境界として策定されていることを注釈として含む。
 *
 * 読み取り専用で副作用ゼロ。
 *
 * Usage:
 *   node show-phase-nodes.js \
 *     --tickets=<Tickets.json のパス> \
 *     --graph=<GRAPH.json のパス> \
 *     --dirs-tree=<Dirs-Tree.json のパス> \
 *     --phase=<P{id}>
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

// ============================================================
// 定数定義
// ============================================================

/** Tickets.json のパスを指定するCLI引数 */
const TICKETS_PATH_ARG_PREFIX = "--tickets=";

/** GRAPH.json のパスを指定するCLI引数 */
const GRAPH_PATH_ARG_PREFIX = "--graph=";

/** Dirs-Tree.json のパスを指定するCLI引数 */
const DIRS_TREE_ARG_PREFIX = "--dirs-tree=";

/** 処理対象フェーズを指定するCLI引数 */
const PHASE_ARG_PREFIX = "--phase=";

/** query.js のパス（同ディレクトリ内） */
const QUERY_JS_RELATIVE_PATH = "./query.js";

/** 正常終了コード */
const EXIT_SUCCESS = 0;

/** 異常終了コード */
const EXIT_FAILURE = 1;

// ============================================================
// コマンドライン引数パース
// ============================================================

/**
 * CLI引数をパースして各パスを取得する。
 *
 * @param {string[]} args — process.argv.slice(2)
 * @returns {{ ticketsPath: string, graphPath: string, dirsTreePath: string, phaseArg: string }}
 */
function parseCliArguments(args) {
  let ticketsPath = null;
  let graphPath = null;
  let dirsTreePath = null;
  let phaseArg = null;

  for (const arg of args) {
    if (arg.startsWith(TICKETS_PATH_ARG_PREFIX)) {
      ticketsPath = arg.slice(TICKETS_PATH_ARG_PREFIX.length);
    } else if (arg.startsWith(GRAPH_PATH_ARG_PREFIX)) {
      graphPath = arg.slice(GRAPH_PATH_ARG_PREFIX.length);
    } else if (arg.startsWith(DIRS_TREE_ARG_PREFIX)) {
      dirsTreePath = arg.slice(DIRS_TREE_ARG_PREFIX.length);
    } else if (arg.startsWith(PHASE_ARG_PREFIX)) {
      phaseArg = arg.slice(PHASE_ARG_PREFIX.length);
    }
  }

  return { ticketsPath, graphPath, dirsTreePath, phaseArg };
}

// ============================================================
// フェーズ解決
// ============================================================

/**
 * フェーズ指定子（"PX", "P{n}"）からフェーズオブジェクトを解決する。
 *
 * @param {Object[]} phases — Tickets.json の phases 配列
 * @param {string} phaseArg — フェーズ指定子
 * @returns {{ phase: Object|null, error: string|null }}
 */
function resolvePhase(phases, phaseArg) {
  if (phaseArg === "PX") {
    const phase = phases.find(function (p) { return p.id === -1; });
    return { phase: phase || null, error: phase ? null : 'Phase "PX" not found in Tickets.json' };
  }
  const matchResult = phaseArg.match(/^P(-?\d+)$/);
  if (matchResult) {
    const phaseId = parseInt(matchResult[1], 10);
    const phase = phases.find(function (p) { return p.id === phaseId; });
    return { phase: phase || null, error: phase ? null : 'Phase "' + phaseArg + '" not found in Tickets.json' };
  }
  return { phase: null, error: "Invalid phase format: " + phaseArg + '. Use "PX" or "P{n}"' };
}

// ============================================================
// query.js 子プロセス実行
// ============================================================

/**
 * query.js を子プロセスで実行し、ノード詳細のMarkdownを取得する。
 *
 * @param {string} queryJsDir — query.js が存在するディレクトリ
 * @param {string} graphPath — GRAPH.json のパス
 * @param {string} sourcePath — ソースファイルのパス
 * @param {string} dirsTreePath — Dirs-Tree.json のパス
 * @param {string} nodeId — ノードID（例: "N0001"）
 * @returns {{ markdown: string, error: string|null }}
 */
function runQueryJs(queryJsDir, graphPath, sourcePath, dirsTreePath, nodeId) {
  try {
    const queryJsPath = path.resolve(queryJsDir, QUERY_JS_RELATIVE_PATH);
    const output = execFileSync(
      process.execPath,
      [
        queryJsPath,
        "--graph=" + graphPath,
        "--source=" + sourcePath,
        "--dirs-tree=" + dirsTreePath,
        "--id=" + nodeId,
        "--hops=2",
      ],
      {
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
      }
    );
    return { markdown: output, error: null };
  } catch (err) {
    const errorMessage = err.stderr
      ? err.stderr.toString().trim()
      : "query.js execution failed for node " + nodeId + ": " + err.message;
    return { markdown: null, error: errorMessage };
  }
}

// ============================================================
// Markdown出力生成
// ============================================================

/**
 * フェーズ情報と全ノード詳細を連結したMarkdownを生成する。
 *
 * @param {Object} phase — フェーズオブジェクト
 * @param {string[]} nodeIds — ノードID配列
 * @param {Array} nodeMarkdowns — 各ノードのMarkdown文字列配列（成功ノードのみ）
 * @param {string[]} nodeErrors — エラーが発生したノードの説明配列
 * @returns {string} 完全なMarkdown
 */
function formatOutput(phase, nodeIds, nodeMarkdowns, nodeErrors) {
  const lines = [];

  // フェーズヘッダー
  const phaseLabel = phase.id === -1 ? "PX" : "P" + phase.id;
  lines.push("# Phase " + phaseLabel + ": " + phase.name);
  lines.push("");
  if (phase.summary) {
    lines.push(phase.summary);
    lines.push("");
  }

  // ノード一覧セクション
  lines.push("---\n");
  lines.push("# ノード一覧");
  lines.push("");
  lines.push("以下の " + nodeIds.length + " 個のノードがこのフェーズに割り当てられています。");
  lines.push("各ノードは graphify-rfc によって安全な I/O 境界として策定されています。");
  lines.push("ノード同士の組み合わせもまた安全な I/O 境界になりやすい性質を持ちます。");
  lines.push("");
  lines.push("チケットとは、1回の実装で安全に行えるノードの組み合わせです。");
  lines.push("1つ以上のノードを束ねてチケット単位を構成してください。");
  lines.push("全ノードを重複なく、過不足なくチケット化しなければなりません。");
  lines.push("");

  // 各ノードの詳細を出力
  for (let i = 0; i < nodeIds.length; i++) {
    lines.push("---\n");
    const nodeId = nodeIds[i];
    const nodeMarkdown = nodeMarkdowns[i];

    if (nodeMarkdown) {
      lines.push(nodeMarkdown);
    } else {
      lines.push("### " + nodeId + ": （エラーのためノード詳細を取得できませんでした）");
      lines.push("");
      if (nodeErrors[i]) {
        lines.push("**エラー**: " + nodeErrors[i]);
        lines.push("");
      }
    }
  }

  lines.push("---");

  return lines.join("\n");
}

// ============================================================
// メイン処理
// ============================================================

function main() {
  // 1. CLI引数をパース
  const args = process.argv.slice(2);
  const parsed = parseCliArguments(args);

  // 引数不足チェック
  const missingArgs = [];
  if (!parsed.ticketsPath) missingArgs.push("--tickets");
  if (!parsed.graphPath) missingArgs.push("--graph");
  if (!parsed.dirsTreePath) missingArgs.push("--dirs-tree");
  if (!parsed.phaseArg) missingArgs.push("--phase");

  if (missingArgs.length > 0) {
    console.error(
      "必須引数が不足しています: " + missingArgs.join(", ")
    );
    console.error(
      "Usage: node show-phase-nodes.js --tickets=<path> --graph=<path> --dirs-tree=<path> --phase=<P{id}>"
    );
    process.exit(EXIT_FAILURE);
  }

  // 2. Tickets.json を読み込みフェーズを解決
  let ticketsData;
  try {
    ticketsData = JSON.parse(
      fs.readFileSync(path.resolve(parsed.ticketsPath), "utf8")
    );
  } catch (err) {
    console.error("Tickets.json の読み込みに失敗しました: " + err.message);
    process.exit(EXIT_FAILURE);
  }

  const { phase, error: phaseError } = resolvePhase(
    ticketsData.phases,
    parsed.phaseArg
  );
  if (!phase) {
    console.error(phaseError);
    process.exit(EXIT_FAILURE);
  }

  // 3. フェーズの nodeIds を取得
  const nodeIds = phase.nodeIds;
  if (!nodeIds || !Array.isArray(nodeIds) || nodeIds.length === 0) {
    console.error(
      "フェーズ " + parsed.phaseArg + " にはノードが割り当てられていません（nodeIds が空です）。"
    );
    process.exit(EXIT_FAILURE);
  }

  // 4. 各ノードに対して query.js を実行
  // query.js と同じディレクトリを基準に相対パス解決
  const queryJsDir = path.resolve(__dirname, "../rfc-graph");
  // ソースファイルは GRAPH.json から推測（source フィールドがあれば使用、なければ graph と同じディレクトリに拡張子.md）
  // 実際には GRAPH.json の sourceFile フィールドを参照する
  let sourcePath = parsed.graphPath.replace(/\.json$/i, ".md");
  try {
    const graphData = JSON.parse(fs.readFileSync(path.resolve(parsed.graphPath), "utf8"));
    if (graphData.sourceFile) {
      sourcePath = graphData.sourceFile;
    }
  } catch (err) {
    // GRAPH.json から sourceFile が読めない場合、拡張子置換をデフォルトとして使用
  }

  const nodeMarkdowns = [];
  const nodeErrors = [];

  for (const nodeId of nodeIds) {
    const result = runQueryJs(
      queryJsDir,
      parsed.graphPath,
      sourcePath,
      parsed.dirsTreePath,
      nodeId
    );
    if (result.error) {
      nodeMarkdowns.push(null);
      nodeErrors.push(result.error);
      console.error("警告: " + result.error);
    } else {
      nodeMarkdowns.push(result.markdown);
      nodeErrors.push(null);
    }
  }

  // エラーがある場合は全体を失敗とする
  const hasErrors = nodeErrors.some(function (err) { return err !== null; });

  // 5. Markdown を生成して stdout に出力
  const output = formatOutput(phase, nodeIds, nodeMarkdowns, nodeErrors);
  process.stdout.write(output + "\n");

  if (hasErrors) {
    console.error(
      "一部のノード詳細の取得に失敗しました。上記の警告を確認してください。"
    );
    process.exit(EXIT_FAILURE);
  }
}

if (require.main === module) main();
module.exports = { parseCliArguments, resolvePhase, runQueryJs, formatOutput };
