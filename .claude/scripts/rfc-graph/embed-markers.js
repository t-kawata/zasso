#!/usr/bin/env node

/**
 * embed-markers.js — REFマーカー埋め込み（冪等）
 *
 * graphify-rfc Step 4 で使用する。検証済みグラフの sourceRanges 情報に基づき、
 * ソース文書に [::REF<N>-START::] / [::REF<N>-END::] 形式のマーカーを
 * 冪等かつアトミックに挿入する。
 *
 * CLI: embed-markers.js --graph=<path> --source=<path>
 *
 * 冪等性保証:
 *   1. 既存のマーカーを検出して重複挿入を防止する
 *   2. 同一 refId が複数の sourceRanges に出現してもマーカーは1回のみ
 *   3. 異種 refId が同一範囲を指す場合は両方のマーカーを挿入する（範囲重複許容）
 *
 * アトミック書込:
 *   一時ファイル + rename により、書き込み途中のプロセス異常終了でも
 *   元ファイルが破損しない。
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

/** REFマーカーの接頭辞 */
const REF_PREFIX = 'REF';

/** REFマーカーのゼロ埋め最小桁数 */
const REF_MIN_DIGITS = 3;

/** マーカー開始行のテンプレート（{refId} が置換される） */
const MARKER_FORMAT_START = '[::{refId}-START::] ';

/** マーカー終了行のテンプレート（{refId} が置換される） */
const MARKER_FORMAT_END = '[::{refId}-END::] ';

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
 * @returns {{ graphPath: string, sourcePath: string }}
 * @throws {Error} 引数が不正な場合
 */
function parseArguments() {
  const args = process.argv.slice(2);

  // --help オプション
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    printUsage();
    process.exit(EXIT_SUCCESS);
  }

  // 最小引数: --graph=<path> --source=<path>
  if (args.length < 2) {
    throw new Error(
      '引数が不足しています。\n' +
      '  Usage: embed-markers.js --graph=<path> --source=<path>'
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
      '  Usage: embed-markers.js --graph=<path> --source=<path>'
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
  if (!graph || !Array.isArray(graph.nodes)) {
    throw new Error(
      'グラフデータの構造が不正です。nodes が必要です。'
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
// マーカー処理（純粋関数）
// ============================================================

/**
 * ソース行から既存のREFマーカーのrefId集合を抽出する
 *
 * 正規表現で [::REF<N>-START::] または [::REF<N>-END::] パターンを検出し、
 * 既に挿入済みの refId を Set として返す。これにより冪等性を保証する。
 *
 * @param {string[]} sourceLines — ソースファイルの行配列
 * @returns {Set<string>} 既存の refId 集合（例: {"REF001", "REF042"}）
 */
function extractExistingRefIds(sourceLines) {
  const refIds = new Set();
  const markerRegex = /\[::(REF\d+)-(START|END)::\]/;

  for (const line of sourceLines) {
    const match = line.match(markerRegex);
    if (match) {
      refIds.add(match[1]);
    }
  }

  return refIds;
}

/**
 * 全ノードの sourceRanges にマーカーを挿入する（冪等）
 *
 * 各 sourceRange の refId が既存のマーカー集合に含まれていない場合のみ、
 * 開始行に [::<refId>-START::]、終了行に [::<refId>-END::] を挿入する。
 *
 * 同一 refId が複数の sourceRanges エントリから参照される場合でも
 * マーカーは1回のみ挿入される（extractExistingRefIds が検出後は
 * existingRefs に含まれているためスキップされる）。
 *
 * 異なる refId が同一範囲を指す場合は両方のマーカーが挿入される
 * （各 refId の存在チェックは独立しているため）。
 *
 * @param {string[]} sourceLines — ソースファイルの行配列
 * @param {Object[]} nodes — グラフのノード配列
 * @param {Object[]} nodes[].sourceRanges — 各ノードの sourceRanges
 * @returns {{ result: string[], insertedCount: number }}
 *   result: マーカー挿入後の行配列
 *   insertedCount: 新たに挿入したマーカー数
 */
function embedAll(sourceLines, nodes) {
  const existingRefs = extractExistingRefIds(sourceLines);
  const result = [...sourceLines];
  let insertedCount = 0;

  for (const node of nodes) {
    if (!Array.isArray(node.sourceRanges)) continue;

    for (const range of node.sourceRanges) {
      // 既存マーカーがあればスキップ（冪等性保証）
      if (existingRefs.has(range.refId)) continue;

      const startIndex = range.startLine - 1;
      const endIndex = range.endLine - 1;

      // 行番号の範囲チェック
      if (startIndex < 0 || startIndex >= result.length ||
          endIndex < 0 || endIndex >= result.length) {
        throw new Error(
          `ノード ${node.id} の sourceRanges に指定された行番号が` +
          `ソースファイルの行数を超えています。` +
          ` refId=${range.refId}, startLine=${range.startLine},` +
          ` endLine=${range.endLine}, ソース総行数=${result.length}`
        );
      }

      result[startIndex] = MARKER_FORMAT_START.replace('{refId}', range.refId) + result[startIndex];
      if (startIndex !== endIndex) {
        result[endIndex] = MARKER_FORMAT_END.replace('{refId}', range.refId) + result[endIndex];
      } else {
        // 1行のみの範囲の場合、START と END の両方を1行に配置する
        result[endIndex] = result[endIndex] + ' ' + MARKER_FORMAT_END.replace('{refId}', range.refId);
      }

      existingRefs.add(range.refId);
      insertedCount++;
    }
  }

  return { result, insertedCount };
}

// ============================================================
// アトミックファイル書込
// ============================================================

/**
 * アトミックファイル書込 — 一時ファイル + rename
 *
 * 書き込み途中のプロセス異常終了でも元ファイルが破損しないことを保証する。
 * 一時ファイルのパスは元のファイルパスに .tmp.<PID> を付与する。
 *
 * @param {string} targetPath — 書き込み先のファイルパス
 * @param {string} data — 書き込む内容
 * @throws {Error} 書き込みに失敗した場合
 */
function atomicWrite(targetPath, data) {
  const tmpPath = targetPath + '.tmp.' + process.pid;

  try {
    fs.writeFileSync(tmpPath, data, 'utf8');
    fs.renameSync(tmpPath, targetPath);
  } catch (writeError) {
    // 一時ファイルが残っていればクリーンアップ
    try {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    } catch {
      // クリーンアップ失敗は無視（次回実行時に上書きされる）
    }
    throw new Error(
      `ファイルの書き込みに失敗しました: ${writeError.message}`
    );
  }
}

// ============================================================
// エラー出力
// ============================================================

/**
 * 3段テンプレートでエラーを stderr に出力し、終了コード1でプロセスを終了する
 *
 * @param {string} summary — 何が起きたか
 * @param {string} cause — なぜ起きたか
 * @param {string} action — 次に取るべきアクション
 */
function exitWithError(summary, cause, action) {
  process.stderr.write(
    `[ERROR] ${summary}\n` +
    `原因: ${cause}\n` +
    `対応: ${action}\n`
  );
  process.exit(EXIT_FAILURE);
}

// ============================================================
// ヘルプ表示
// ============================================================

/**
 * 使用方法を表示する
 */
function printUsage() {
  console.log(
    'embed-markers.js — REFマーカー埋め込み（冪等）\n' +
    '\n' +
    'Usage:\n' +
    '  embed-markers.js --graph=<path> --source=<path>\n' +
    '\n' +
    'Options:\n' +
    '  --graph=<path>   グラフファイル（graph.schema.json 準拠）のパス\n' +
    '  --source=<path>  マーカーを埋め込むソースファイルのパス\n' +
    '  --help, -h       このヘルプを表示\n' +
    '\n' +
    'Exit codes:\n' +
    '  0  マーカー挿入成功（冪等: 既存マーカーがある場合は何もしない）\n' +
    '  1  エラーによりファイルを変更せずに終了\n'
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
 * 3. 既存マーカーの抽出
 * 4. 全ノードの sourceRanges にマーカー挿入
 * 5. アトミック書込で結果を保存
 *
 * 全エラー時はファイル変更を行わずに終了する（副作用ゼロ）。
 */
function main() {
  let graphPath, sourcePath;

  try {
    const parsed = parseArguments();
    graphPath = parsed.graphPath;
    sourcePath = parsed.sourcePath;
  } catch (parseError) {
    exitWithError(
      '引数のパースに失敗しました。',
      parseError.message,
      '正しい引数で再実行してください。'
    );
  }

  let graph;
  try {
    graph = readGraph(graphPath);
  } catch (graphError) {
    exitWithError(
      'グラフファイルの読み込みに失敗しました。',
      graphError.message,
      '--graph=<path> に正しいグラフファイルを指定してください。'
    );
  }

  let sourceLines;
  try {
    sourceLines = readSourceFile(sourcePath);
  } catch (sourceError) {
    exitWithError(
      'ソースファイルの読み込みに失敗しました。',
      sourceError.message,
      '--source=<path> に正しいソースファイルを指定してください。'
    );
  }

  // 全ノードの sourceRanges にマーカーを挿入
  let embedResult;
  try {
    embedResult = embedAll(sourceLines, graph.nodes);
  } catch (embedError) {
    exitWithError(
      'マーカー挿入中にエラーが発生しました。',
      embedError.message,
      'グラフの sourceRanges を確認し、修正後に再実行してください。'
    );
  }

  // 結果をソースファイルに書き戻す
  const outputContent = embedResult.result.join('\n');

  try {
    atomicWrite(sourcePath, outputContent);
  } catch (writeError) {
    exitWithError(
      'マーカー埋め込み後のファイル書き込みに失敗しました。',
      writeError.message,
      'ディスク容量とファイルパーミッションを確認してください。'
    );
  }

  // 結果を JSON 形式で標準出力
  console.log(JSON.stringify({
    ok: true,
    insertedCount: embedResult.insertedCount,
    sourcePath,
  }));

  process.exit(EXIT_SUCCESS);
}

// CLIとして実行された場合のみ main を呼び出す
if (require.main === module) {
  main();
}

module.exports = {
  parseArguments,
  readGraph,
  readSourceFile,
  extractExistingRefIds,
  embedAll,
  atomicWrite,
  exitWithError,
  printUsage,
};
