#!/usr/bin/env node

/**
 * resolve-by-heading.js — 見出し+トークンからファイル内の行位置を特定する
 *
 * embed-markers.js（マーカー走査方式）と query.js の resolveCurrentLines の後継。
 * 行番号を一切使わず、heading（見出しレベル）+ texts（トークン列）のみで
 * ソースファイル内の該当行を4段階フォールバックで特定する。
 *
 * graphify-rfc パイプラインの Layer 1（グラフ管理基盤）に属し、
 * crud.js / query.js / show-graph-summary-markdown.js から呼び出される。
 * CLI 実行も可能で、formulate 連携時に直接使用する。
 *
 * CLI: resolve-by-heading.js --source=<path> --heading=<N> --texts="token1,token2,..."
 *
 * 出力:
 *   {"line": 192, "confidence": "exact"}
 *   {"line": 192, "confidence": "partial"}
 *   {"error": "message"}  — 特定失敗時
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// 定数定義
// ============================================================

/** ソースファイルパスを指定するCLI引数のプレフィックス */
const SOURCE_ARG_PREFIX = '--source=';

/** 見出しレベルを指定するCLI引数のプレフィックス */
const HEADING_ARG_PREFIX = '--heading=';

/** トークン列を指定するCLI引数のプレフィックス */
const TEXTS_ARG_PREFIX = '--texts=';

/** 正常終了コード */
const EXIT_SUCCESS = 0;

/** 異常終了コード */
const EXIT_FAILURE = 1;

// ============================================================
// CLI引数パース
// ============================================================

/**
 * コマンドライン引数をパースする
 *
 * @param {string[]} [testArgs] — テスト用の引数配列（省略時は process.argv から取得）
 * @returns {{ sourcePath: string, heading: number, texts: string[] }}
 * @throws {Error} 引数が不正な場合
 */
function parseArguments(testArgs) {
  const args = testArgs || process.argv.slice(2);

  if (args.length < 3) {
    throw new Error(
      '引数が不足しています。\n' +
      '  Usage: resolve-by-heading.js --source=<path> --heading=<N> --texts="t1,t2,..."'
    );
  }

  const sourceArg = args[0];
  if (!sourceArg.startsWith(SOURCE_ARG_PREFIX)) {
    throw new Error(`最初の引数は --source=<path> である必要があります: ${sourceArg}`);
  }
  const sourcePath = sourceArg.slice(SOURCE_ARG_PREFIX.length);
  if (!sourcePath) {
    throw new Error('--source=<path> の <path> が空です。');
  }

  const headingArg = args[1];
  if (!headingArg.startsWith(HEADING_ARG_PREFIX)) {
    throw new Error(`2番目の引数は --heading=<N> である必要があります: ${headingArg}`);
  }
  const headingStr = headingArg.slice(HEADING_ARG_PREFIX.length);
  const heading = parseInt(headingStr, 10);
  if (!Number.isInteger(heading) || heading < 0 || heading > 6) {
    throw new Error(`--heading=<N> は0〜6の整数である必要があります: ${headingStr}`);
  }

  const textsArg = args[2];
  if (!textsArg.startsWith(TEXTS_ARG_PREFIX)) {
    throw new Error(`3番目の引数は --texts="..." である必要があります: ${textsArg}`);
  }
  const textsStr = textsArg.slice(TEXTS_ARG_PREFIX.length);
  if (!textsStr) {
    throw new Error('--texts の値が空です。');
  }
  // カンマ区切りで分割、トリム、空要素除外
  const texts = textsStr.split(',').map(t => t.trim()).filter(t => t.length > 0);

  return { sourcePath, heading, texts };
}

// ============================================================
// コア照合アルゴリズム（4段階フォールバック）
// ============================================================

/**
 * 見出しレベルに応じたマーカー文字列を取得する
 *
 * @param {number} heading — 見出しレベル（1〜6）
 * @returns {string} "# " を level 個繰り返したマーカー
 */
function buildHeadingMarker(heading) {
  if (heading <= 0) return '';  // heading 0 はタイトル行（先頭行）を指す
  return '#'.repeat(heading) + ' ';
}

/**
 * 指定された heading レベルと条件に合致する行を検索する
 *
 * @param {string[]} lines — ソースファイルの行配列
 * @param {number} heading — 見出しレベル
 * @param {function} matchFn — 各行に対して true/false を返すフィルタ関数
 * @returns {{ lineNumbers: number[], lineTexts: string[] }}
 */
function findMatchingLines(lines, heading, matchFn) {
  const marker = buildHeadingMarker(heading);
  const lineNumbers = [];
  const lineTexts = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (marker && !line.startsWith(marker)) continue;
    if (!marker && i !== 0) continue; // heading 0 は1行目のみ
    if (matchFn(line, i)) {
      lineNumbers.push(i + 1); // 1-based 行番号
      lineTexts.push(line);
    }
  }

  return { lineNumbers, lineTexts };
}

/**
 * ソーステキストから heading + texts で該当行を特定する
 *
 * 4段階フォールバック照合:
 *   1. heading + texts[0] → 一意 → exact
 *   2. heading + texts[0..1] → 一意 → exact
 *   3. heading + texts[0] + texts[last] → 一意 → partial
 *   4. heading + 全 texts → 一意 → partial
 *   フォールバック: より深い heading を試行 → texts 連結 grep → エラー
 *
 * @param {string} sourceText — ソースファイルの全文
 * @param {number} heading — 見出しレベル（1〜6、0はタイトル行）
 * @param {string[]} texts — 照合トークン列
 * @returns {{ line: number, confidence: string }|{ error: string }}
 */
function resolveByHeading(sourceText, heading, texts) {
  const lines = sourceText.split('\n');

  if (!Array.isArray(texts) || texts.length === 0) {
    return { error: 'texts 配列が空です。' };
  }

  // ========================================
  // Stage 1: heading + texts[0] で一意判定
  // ========================================
  {
    const { lineNumbers } = findMatchingLines(lines, heading,
      (line) => line.includes(texts[0]));
    if (lineNumbers.length === 1) {
      return { line: lineNumbers[0], confidence: 'exact' };
    }
  }

  // ========================================
  // Stage 2: heading + texts[0..1] で一意判定
  // ========================================
  if (texts.length >= 2) {
    const { lineNumbers } = findMatchingLines(lines, heading,
      (line) => texts.slice(0, 2).every(t => line.includes(t)));
    if (lineNumbers.length === 1) {
      return { line: lineNumbers[0], confidence: 'exact' };
    }
  }

  // ========================================
  // Stage 3: heading + texts[0] + texts[last] で一意判定
  // ========================================
  if (texts.length >= 2) {
    const lastText = texts[texts.length - 1];
    const { lineNumbers } = findMatchingLines(lines, heading,
      (line) => line.includes(texts[0]) && line.includes(lastText));
    if (lineNumbers.length === 1) {
      return { line: lineNumbers[0], confidence: 'partial' };
    }
  }

  // ========================================
  // Stage 4: heading + 全 texts で一意判定
  // ========================================
  {
    const { lineNumbers } = findMatchingLines(lines, heading,
      (line) => texts.every(t => line.includes(t)));
    if (lineNumbers.length === 1) {
      return { line: lineNumbers[0], confidence: 'partial' };
    }
  }

  // ========================================
  // フォールバック1: より深い heading レベルを試行
  // ========================================
  for (let headingLevel = heading + 1; headingLevel <= 6; headingLevel++) {
    const { lineNumbers } = findMatchingLines(lines, headingLevel,
      (line) => texts.some(t => line.includes(t)));
    if (lineNumbers.length === 1) {
      return { line: lineNumbers[0], confidence: 'partial' };
    }
  }

  // ========================================
  // フォールバック2: 全 texts を連結して grep（全行対象）
  // ========================================
  {
    const joined = texts.join('');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(joined)) {
        return { line: i + 1, confidence: 'partial' };
      }
    }
  }

  // ========================================
  // 特定失敗
  // ========================================
  return {
    error: `heading=${heading}, texts=["${texts.join('", "')}"] に該当する行が見つかりませんでした。`
  };
}

// ============================================================
// 3段テンプレートエラー出力
// ============================================================

/**
 * エラーメッセージを標準エラー出力に書き込む
 *
 * @param {string} message — 何が起きたか
 * @param {string} cause — なぜ起きたか
 * @param {string} action — 次に取るべきアクション
 */
function printError(message, cause, action) {
  process.stderr.write(
    `[ERROR] ${message}\n原因: ${cause}\n対応: ${action}\n`
  );
}

// ============================================================
// ヘルプ表示
// ============================================================

function printUsage() {
  console.log(
    'resolve-by-heading.js — 見出し+トークンによる行位置特定\n' +
    '\n' +
    'Usage:\n' +
    '  resolve-by-heading.js --source=<path> --heading=<N> --texts="token1,token2,..."\n' +
    '\n' +
    'Options:\n' +
    '  --source=<path>   ソースファイルのパス\n' +
    '  --heading=<N>     見出しレベル（1-6、0=タイトル行）\n' +
    '  --texts="..."     カンマ区切りの照合トークン列\n' +
    '\n' +
    'Output:\n' +
    '  {"line": 192, "confidence": "exact"}\n' +
    '  {"line": 192, "confidence": "partial"}\n' +
    '  {"error": "メッセージ"}  — 特定失敗\n' +
    '\n' +
    'Exit codes:\n' +
    '  0  正常終了\n' +
    '  1  エラー終了\n'
  );
}

// ============================================================
// エントリポイント
// ============================================================

function main() {
  // ヘルプ表示
  if (process.argv.slice(2).some(a => a === '--help' || a === '-h')) {
    printUsage();
    process.exit(EXIT_SUCCESS);
  }

  let sourcePath, heading, texts;
  try {
    const parsed = parseArguments();
    sourcePath = parsed.sourcePath;
    heading = parsed.heading;
    texts = parsed.texts;
  } catch (parseError) {
    printError(
      '引数のパースに失敗しました。',
      parseError.message,
      '正しい引数で再実行してください。'
    );
    process.exit(EXIT_FAILURE);
  }

  // ソースファイル読み込み
  let sourceText;
  try {
    const resolvedPath = path.resolve(sourcePath);
    sourceText = fs.readFileSync(resolvedPath, 'utf8');
  } catch (readError) {
    printError(
      'ソースファイルの読み込みに失敗しました。',
      readError.message,
      '--source=<path> に正しいファイルパスを指定してください。'
    );
    process.exit(EXIT_FAILURE);
  }

  // 照合実行
  const result = resolveByHeading(sourceText, heading, texts);

  if (result.error) {
    printError(
      '行位置の特定に失敗しました。',
      result.error,
      'heading と texts の値を確認し、ソースファイル内に対応する見出し行が存在するか確認してください。'
    );
    process.exit(EXIT_FAILURE);
  }

  // JSON 出力
  console.log(JSON.stringify({ line: result.line, confidence: result.confidence }));
  process.exit(EXIT_SUCCESS);
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArguments,
  resolveByHeading,
  buildHeadingMarker,
  findMatchingLines,
};
