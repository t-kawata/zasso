#!/usr/bin/env node

/**
 * validate-slug.js — グラフノードの slug フィールド命名規則検証
 *
 * graphify-rfc の自己修復ループで使用される。グラフJSONの全ノードの slug フィールドが
 * lower_snake_case 形式・最大25文字・先頭英小文字の制約を満たすか検証する。
 * 4単語以上の slug は警告として報告する（ブロックしない）。
 *
 * CLI: validate-slug.js --graph=<path>
 *
 * 出力契約:
 *   正常時 → {"ok":true, "errors":[], "warnings":[]}（終了コード0）
 *   異常時 → {"ok":false, "errors":[...], "warnings":[...]}（終了コード1）
 *   エラー時は stderr に3段テンプレートの自然言語エラーも出力する。
 */

const fs = require('fs');
const path = require('path');
const { MAX_FILE_NAME_LENGTH } = require('./boundify-helpers.js');

// ============================================================
// 定数定義
// ============================================================

/** 最大 slug 長（拡張子を除くファイル名ベースの最大長、boundify-helpers.js から参照） */
const MAX_SLUG_LENGTH = MAX_FILE_NAME_LENGTH;

/** slug の形式パターン: lower_snake_case、先頭英小文字 */
const SLUG_FORMAT_PATTERN = /^[a-z][a-z0-9_]*$/;

/** 警告を発する最低単語数（アンダースコア区切り） */
const WARNING_WORD_COUNT = 4;

/** グラフファイルパスを指定するCLI引数のプレフィックス */
const GRAPH_PATH_ARG_PREFIX = '--graph=';

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
 * @returns {{ graphPath: string }}
 * @throws {Error} 引数が不正な場合
 */
function parseArguments(testArgs) {
  const args = testArgs || process.argv.slice(2);

  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    printUsage();
    process.exit(EXIT_SUCCESS);
  }

  if (args.length !== 1) {
    throw new Error(
      '引数が不正です。\n' +
      '  Usage: validate-slug.js --graph=<path>'
    );
  }

  const graphFlag = args[0];
  if (!graphFlag.startsWith(GRAPH_PATH_ARG_PREFIX)) {
    throw new Error(
      '引数は --graph=<path> である必要があります。\n' +
      `  実際の値: ${graphFlag}`
    );
  }
  const graphPath = graphFlag.slice(GRAPH_PATH_ARG_PREFIX.length);
  if (!graphPath) {
    throw new Error('--graph=<path> <path> is empty.');
  }

  return { graphPath };
}

/**
 * 使用方法を出力する
 */
function printUsage() {
  console.log(`Usage: validate-slug.js --graph=<path>

Validates the slug field of all nodes in a graph JSON file.

Arguments:
  --graph=<path>  Path to the graph JSON file (required)

Output:
  Success: {"ok":true, "errors":[], "warnings":[]} (exit code 0)
  Failure: {"ok":false, "errors":[...], "warnings":[...]} (exit code 1)

Slug rules:
  - Must be lower_snake_case (lowercase letters, digits, underscores only)
  - Must start with a lowercase letter
  - Max 25 characters
  - Warning (not blocked) if 4+ words`);
}

// ============================================================
// グラフ読み込み
// ============================================================

/**
 * グラフJSONファイルを読み込む
 *
 * @param {string} graphPath — グラフファイルのパス
 * @returns {object} グラフオブジェクト
 * @throws {Error} ファイル読み込みまたはJSONパースに失敗した場合
 */
function loadGraph(graphPath) {
  const resolvedPath = path.resolve(graphPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(
      `グラフファイルが見つかりません: ${resolvedPath}\n` +
      '  指定されたパスが正しいか確認してください。'
    );
  }
  const raw = fs.readFileSync(resolvedPath, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `グラフファイルのJSONパースに失敗しました: ${resolvedPath}\n` +
      `  ${e.message}`
    );
  }
}

// ============================================================
// slug 検証関数
// ============================================================

/**
 * slug が lower_snake_case 形式（先頭英小文字、英小文字・数字・アンダースコアのみ）かを検証する
 *
 * @param {string} slug — 検証対象の slug
 * @returns {{ valid: boolean, reason: string | null }}
 */
function checkSlugFormat(slug) {
  if (!SLUG_FORMAT_PATTERN.test(slug)) {
    // 違反の種別を特定して具体的な理由を返す
    if (/[A-Z]/.test(slug)) {
      return { valid: false, reason: '大文字が含まれています（lower_snake_case にしてください）' };
    }
    if (/[ -]/.test(slug)) {
      return { valid: false, reason: 'スペースまたはハイフンが含まれています（アンダースコアを使用してください）' };
    }
    if (/^[^a-z]/.test(slug)) {
      return { valid: false, reason: '先頭が英小文字ではありません。英小文字で始めてください' };
    }
    return { valid: false, reason: '形式が lower_snake_case に違反しています（使用可能: [a-z0-9_]）' };
  }
  return { valid: true, reason: null };
}

/**
 * slug の長さが上限以内かを検証する
 *
 * @param {string} slug — 検証対象の slug
 * @returns {{ valid: boolean, reason: string | null }}
 */
function checkSlugLength(slug) {
  if (slug.length > MAX_SLUG_LENGTH) {
    return {
      valid: false,
      reason: `${slug.length}文字（上限${MAX_SLUG_LENGTH}文字を超えています。${MAX_SLUG_LENGTH}文字以内に短縮してください）`
    };
  }
  return { valid: true, reason: null };
}

/**
 * slug の単語数（アンダースコア区切り）をカウントし、閾値を超えているか検証する
 *
 * @param {string} slug — 検証対象の slug
 * @returns {{ wordCount: number, isWarning: boolean }}
 */
function checkWordCount(slug) {
  if (slug.length === 0) return { wordCount: 0, isWarning: false };
  const wordCount = slug.split('_').length;
  return { wordCount, isWarning: wordCount >= WARNING_WORD_COUNT };
}

/**
 * 検証エラーオブジェクトを構築する（remedy フィールド付き）
 *
 * @param {string} nodeId — 違反のあるノードID
 * @param {string} slug — 違反のある slug
 * @param {string} reason — 違反理由
 * @returns {{ nodeId: string, slug: string, reason: string, remedy: string }}
 */
function buildSlugError(nodeId, slug, reason) {
  const suggestedSlug = suggestFixedSlug(slug);
  return {
    nodeId,
    slug,
    reason,
    remedy: `node .claude/scripts/rfc-graph/crud.js --graph="<graph-path>" update-node --id=${nodeId} --field=slug --value="${suggestedSlug}"`
  };
}

/**
 * 修正提案 slug を生成する（大文字→小文字、ハイフン→_、先頭数字回避、25文字以内）
 *
 * @param {string} slug — 元の slug
 * @returns {string} 修正提案
 */
function suggestFixedSlug(slug) {
  let fixed = slug
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/^_+/, '');

  // 空文字または先頭が英小文字でない場合、先頭に 's' を付与
  if (fixed.length === 0) {
    return 'unnamed';
  }
  if (!/^[a-z]/.test(fixed)) {
    fixed = 's' + fixed;
  }

  // 25文字以内に切り詰め（単語単位で）
  if (fixed.length > MAX_SLUG_LENGTH) {
    fixed = truncateAtWordBoundary(fixed, MAX_SLUG_LENGTH);
  }
  return fixed;
}

/**
 * 単語境界（アンダースコア）で切り詰める
 *
 * @param {string} str — 切り詰め対象文字列
 * @param {number} maxLen — 最大長
 * @returns {string}
 */
function truncateAtWordBoundary(str, maxLen) {
  if (str.length <= maxLen) return str;
  const parts = str.split('_');
  let result = '';
  for (const part of parts) {
    const candidate = result ? `${result}_${part}` : part;
    if (candidate.length <= maxLen) {
      result = candidate;
    } else {
      break;
    }
  }
  // 1単語も収まらない場合は単純切り詰め
  if (result.length === 0 || result.length > maxLen) {
    result = str.slice(0, maxLen).replace(/_+$/, '');
  }
  return result;
}

// ============================================================
// メイン検証ロジック
// ============================================================

/**
 * グラフの全ノードの slug を検証する
 *
 * @param {object} graph — グラフオブジェクト（{ nodes: [...], edges: [...] }）
 * @returns {{ ok: boolean, errors: Array, warnings: Array }}
 */
function validateSlugs(graph) {
  const errors = [];
  const warnings = [];
  const nodes = graph && graph.nodes ? graph.nodes : [];

  for (const node of nodes) {
    const { id, slug } = node;

    // slug 未設定または空文字はスキップ（許容）
    if (slug === undefined || slug === null || slug === '') {
      continue;
    }
    if (typeof slug !== 'string') {
      errors.push(buildSlugError(id, String(slug), 'slug が文字列ではありません'));
      continue;
    }

    // 形式チェック（形式違反の場合、長さチェックはスキップ）
    const formatResult = checkSlugFormat(slug);
    if (!formatResult.valid) {
      errors.push(buildSlugError(id, slug, formatResult.reason));
      continue;
    }

    // 長さチェック
    const lengthResult = checkSlugLength(slug);
    if (!lengthResult.valid) {
      errors.push(buildSlugError(id, slug, lengthResult.reason));
    }

    // 単語数チェック（警告のみ、ブロックしない）
    const wordResult = checkWordCount(slug);
    if (wordResult.isWarning) {
      warnings.push({
        nodeId: id,
        slug,
        message: `${wordResult.wordCount}単語の slug です（${WARNING_WORD_COUNT}単語以上は推奨されません。より短い slug にしてください）`
      });
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings
  };
}

// ============================================================
// メインエントリポイント
// ============================================================

function main() {
  try {
    const { graphPath } = parseArguments();
    const graph = loadGraph(graphPath);
    const result = validateSlugs(graph);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? EXIT_SUCCESS : EXIT_FAILURE);
  } catch (err) {
    console.error(`[ERROR] Slug validation failed.
Cause: ${err.message}
Action: Fix the arguments or graph file as indicated by the error message.`);
    console.log(JSON.stringify({ ok: false, errors: [], warnings: [] }));
    process.exit(EXIT_FAILURE);
  }
}

// テスト用に公開
module.exports = {
  validateSlugs,
  checkSlugFormat,
  checkSlugLength,
  checkWordCount,
  buildSlugError,
  suggestFixedSlug,
  truncateAtWordBoundary,
  parseArguments,
  MAX_SLUG_LENGTH,
  WARNING_WORD_COUNT,
  SLUG_FORMAT_PATTERN,
  GRAPH_PATH_ARG_PREFIX
};

// 直接実行時のみ main を呼び出す
if (require.main === module) {
  main();
}
