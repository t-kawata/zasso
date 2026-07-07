#!/usr/bin/env node

/**
 * deduplicate-headings.js — 見出し重複排除の前処理
 *
 * graphify-rfc パイプラインの Step 0 で実行される。
 * 同一階層内で同一テキストの見出しが複数ある場合、末尾に A, B, ... Z を追記する。
 * これにより、resolve-by-heading.js の heading + texts 照合が常に一意となることが保証される。
 *
 * CLI: deduplicate-headings.js <file-path>
 *
 * 出力:
 *   変更あり → ファイルを上書きし、変更ログを stdout に出力（終了コード0）
 *   変更なし → 何も出力せず終了（終了コード0）
 *   エラー   → stderr に3段テンプレート（終了コード1）
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// 定数定義
// ============================================================

/** A-Z のサフィックス配列 */
const SUFFIXES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/** 最大重複許容数（A-Z の26文字分） */
const MAX_DUPLICATES = 26;

/** 見出し行の正規表現（先頭の # のみ） */
const HEADING_REGEX = /^(#{1,6})\s+(.+)/;

/** 正常終了コード */
const EXIT_SUCCESS = 0;

/** 異常終了コード */
const EXIT_FAILURE = 1;

// ============================================================
// コア処理
// ============================================================

/**
 * 見出し行の重複キー（レベル + テキスト）を生成する
 *
 * @param {number} level — 見出しレベル（1〜6）
 * @param {string} text — 見出しテキスト
 * @returns {string} 重複判定用のキー
 */
function buildHeadingKey(level, text) {
  return `${level}:${text}`;
}

/**
 * ファイル内の見出し重複を検出・排除する
 *
 * 同一階層で同一テキストの見出しが複数ある場合、
 * 2回目以降に A, B, ... Z を末尾に追記する。
 * 変更があった場合は元のファイルを .bak として保存し、
 * 元のファイルを上書きする。
 *
 * @param {string} filePath — 処理対象ファイルの絶対パス
 * @returns {{ modified: boolean, changes: Array<{line: number, oldText: string, newText: string}> }}
 * @throws {Error} 26件を超える重複があった場合
 */
function deduplicateHeadings(filePath) {
  const resolvedPath = path.resolve(filePath);
  const content = fs.readFileSync(resolvedPath, 'utf8');
  const lines = content.split('\n');
  const changes = [];

  // 重複カウンター: key → count
  const seen = new Map();

  // 最終的な行配列（変更を適用したコピー）
  const result = [...lines];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(HEADING_REGEX);
    if (!match) continue;

    const level = match[1].length;
    const text = match[2];
    const key = buildHeadingKey(level, text);

    const count = (seen.get(key) || 0) + 1;
    seen.set(key, count);

    if (count >= 2) {
      if (count > MAX_DUPLICATES) {
        throw new Error(
          `見出し「${'#'.repeat(level)} ${text}」が ${count} 回出現しました。` +
          `最大 ${MAX_DUPLICATES} 回（A-Z）までしか対応できません。`
        );
      }

      const suffix = SUFFIXES[count - 2]; // 0-indexed: 2回目→A(0), 3回目→B(1)
      const newLine = `${'#'.repeat(level)} ${text} ${suffix}`;
      result[i] = newLine;

      changes.push({
        line: i + 1,
        oldText: line,
        newText: newLine,
      });
    }
  }

  if (changes.length === 0) {
    return { modified: false, changes: [] };
  }

  // バックアップを作成
  const bakPath = resolvedPath + '.bak';
  fs.writeFileSync(bakPath, content, 'utf8');

  // 変更を適用
  fs.writeFileSync(resolvedPath, result.join('\n'), 'utf8');

  return { modified: true, changes };
}

// ============================================================
// 3段テンプレートエラー出力
// ============================================================

function printError(message, cause, action) {
  process.stderr.write(
    `[ERROR] ${message}\n原因: ${cause}\n対応: ${action}\n`
  );
}

// ============================================================
// エントリポイント
// ============================================================

function main() {
  const args = process.argv.slice(2);

  // ヘルプ表示
  if (args.some(a => a === '--help' || a === '-h')) {
    console.log(
      'deduplicate-headings.js — 見出し重複排除\n' +
      '\n' +
      'Usage:\n' +
      '  deduplicate-headings.js <file-path>\n' +
      '\n' +
      '同一階層で同一テキストの見出しが複数ある場合、\n' +
      '2回目以降に A, B, ... Z を末尾に追記します。\n' +
      '元ファイルは .bak として保存されます。\n' +
      '\n' +
      'Exit codes:\n' +
      '  0  正常終了（変更あり・なし両方）\n' +
      '  1  エラー終了（26件以上重複等）\n'
    );
    process.exit(EXIT_SUCCESS);
  }

  if (args.length !== 1) {
    printError(
      '引数が不足しています。',
      `1つのファイルパスが必要ですが、${args.length} 個指定されました。`,
      'deduplicate-headings.js <file-path>'
    );
    process.exit(EXIT_FAILURE);
  }

  const filePath = args[0];

  if (!fs.existsSync(filePath)) {
    printError(
      'ファイルが見つかりません。',
      `${filePath} が存在しません。`,
      '正しいファイルパスを指定してください。'
    );
    process.exit(EXIT_FAILURE);
  }

  try {
    const result = deduplicateHeadings(filePath);

    if (result.modified) {
      for (const change of result.changes) {
        console.log(`L${change.line}: ${change.oldText} → ${change.newText}`);
      }
    } else {
      console.log('見出しに重複はありませんでした。変更は不要です。');
    }
    process.exit(EXIT_SUCCESS);
  } catch (error) {
    printError(
      '見出し重複排除に失敗しました。',
      error.message,
      'ファイルの内容を確認してください。'
    );
    process.exit(EXIT_FAILURE);
  }
}

module.exports = {
  deduplicateHeadings,
  buildHeadingKey,
  HEADING_REGEX,
  MAX_DUPLICATES,
};

if (require.main === module) {
  main();
}
