#!/usr/bin/env node

/**
 * deduplicate-headings.js — 見出し重複排除（graphify-rfc Step 0）
 *
 * ソースMarkdown文書の全見出し行（^#{1,6}\s+）を抽出し、同一階層内で
 * 同一テキストの見出しが複数ある場合、末尾に " A", " B", ... " Z" を追記する。
 * これにより、見出しベースの参照（headingRefs）が一意に解決可能になる。
 *
 * CLI: deduplicate-headings.js <source-path>
 *
 * 出力契約:
 *   正常時 → 変更の有無を stdout に出力（終了コード0）
 *   異常時 → 3段テンプレートを stderr に出力（終了コード1）
 */

const fs = require('fs');

const MAX_DUPLICATES = 26;

function exitWithError(summary, cause, action) {
  process.stderr.write(`[ERROR] ${summary}\n原因: ${cause}\n対応: ${action}\n`);
  process.exit(1);
}

function readLines(filePath) {
  if (!fs.existsSync(filePath)) {
    exitWithError('ソースファイルが見つかりません。', `${filePath} が存在しません。`, '正しいファイルパスを指定してください。');
  }
  return fs.readFileSync(filePath, 'utf8').split('\n');
}

/**
 * 同一階層内で同一テキストの見出しを検出し、A-Z を追記する
 *
 * @param {string[]} lines — ファイルの行配列
 * @returns {{ result: string[], modified: boolean, changes: string[] }}
 */
function deduplicateHeadings(lines) {
  const seen = {}; // key: "level:text" → count
  const changes = [];

  const result = lines.map((line, i) => {
    const match = line.match(/^(#{1,6})\s+(.+)/);
    if (!match) return line;

    const level = match[1].length;
    const text = match[2].trim();
    const key = `${level}:${text}`;

    if (!seen[key]) {
      seen[key] = 0;
      return line;
    }

    seen[key]++;
    const count = seen[key];
    if (count > MAX_DUPLICATES) {
      throw new Error(
        `見出しの重複が27件を超えました。\n` +
        `  heading: ${'#'.repeat(level)} ${text}\n` +
        `  line: ${i + 1}\n` +
        `  対応: 手動で見出しを分割またはリネームしてください。`
      );
    }

    const suffix = ' ' + String.fromCharCode(64 + count); // A=65, B=66, ...
    const newLine = `${'#'.repeat(level)} ${text}${suffix}`;
    changes.push(`L${i + 1}: "${line}" → "${newLine}"`);
    return newLine;
  });

  return { result: result, modified: changes.length > 0, changes };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0] === '--help' || args[0] === '-h') {
    console.log('使用法: deduplicate-headings.js <source-path>');
    console.log('ソースファイルの重複見出しに A-Z を追記します。');
    process.exit(args[0] === '--help' || args[0] === '-h' ? 0 : 1);
  }

  const lines = readLines(args[0]);
  const { result, modified, changes } = deduplicateHeadings(lines);

  if (modified) {
    fs.writeFileSync(args[0], result.join('\n'), 'utf8');
    console.log(`[修正] ${changes.length}件の重複見出しに接尾辞を追加しました。`);
    changes.forEach(c => console.log(`  ${c}`));
  } else {
    console.log('重複見出しは見つかりませんでした。変更はありません。');
  }
}

module.exports = { deduplicateHeadings, readLines };

if (require.main === module) main();
