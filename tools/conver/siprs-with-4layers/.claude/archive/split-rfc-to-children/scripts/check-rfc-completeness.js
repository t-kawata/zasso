#!/usr/bin/env node
/**
 * check-rfc-completeness.js — 単一RFCファイルの完全性を検証する
 *
 * 以下の4基準で判定する：
 * 1. `<!-- ??? -->` が含まれていない
 * 2. 機械転記ブロックが空でない
 * 3. ガイダンスコメント（【記述指針】）が残存していない
 * 4. 各セクションに最低限の記述量がある
 *
 * 使用例:
 *   node check-rfc-completeness.js path/to/child-rfc.md
 *   {"success":true,"complete":true}
 *   {"success":true,"complete":false,"issues":["empty transfer block"]}
 */
var fs = require("fs");
var path = require("path");

var PLACEHOLDER_RE = /<!--\s*\?\?\?\s*-->/;
var TRANSFER_BLOCK_BEGIN = "<!-- 機械転記ブロック";
var TRANSFER_BLOCK_END = "<!-- /機械転記ブロック -->";
var GUIDANCE_RE = /<!--\s*【記述指針】/;
var MIN_SECTION_LENGTH = 10; // 1セクションあたりの最低文字数

/**
 * ファイルを読み込み、完全性チェックを実行する。
 * @param {string} filePath - RFCファイルのパス
 * @returns {{success: boolean, complete: boolean, issues: string[], path: string}}
 */
function checkFileCompleteness(filePath) {
  var resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    return { success: false, complete: false, issues: ["file not found: " + resolved], path: resolved };
  }

  var content = fs.readFileSync(resolved, "utf8");
  var issues = [];

  // 基準1: `<!-- ??? -->` プレースホルダーの有無
  if (PLACEHOLDER_RE.test(content)) {
    issues.push("placeholder marker <!-- ??? --> remains");
  }

  // 基準2: 機械転記ブロックが空でないか
  var beginIdx = content.indexOf(TRANSFER_BLOCK_BEGIN);
  var endIdx = content.indexOf(TRANSFER_BLOCK_END);
  if (beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx) {
    var inner = content.slice(
      content.indexOf("\n", beginIdx) + 1,
      content.lastIndexOf("\n", endIdx)
    ).trim();
    if (!inner) {
      issues.push("empty transfer block between " + TRANSFER_BLOCK_BEGIN + " and " + TRANSFER_BLOCK_END);
    }
  }

  // 基準3: ガイダンスコメントの残存
  if (GUIDANCE_RE.test(content)) {
    issues.push("guidance comment 【記述指針】 remains");
  }

  // 基準4: 各セクションの最低記述量
  var sections = content.split(/\n##\s+/);
  for (var i = 0; i < sections.length; i++) {
    // 最初の分割はfrontmatter＋タイトルなのでスキップ
    if (i === 0) continue;
    var sectionBody = sections[i].split("\n").slice(1).join("\n").trim();
    if (sectionBody.length < MIN_SECTION_LENGTH) {
      var sectionName = sections[i].split("\n")[0].trim();
      issues.push("section \"" + sectionName + "\" has insufficient content (" + sectionBody.length + " chars, minimum " + MIN_SECTION_LENGTH + ")");
    }
  }

  return {
    success: true,
    complete: issues.length === 0,
    issues: issues,
    path: resolved
  };
}

// === メイン処理 ===
function main() {
  var args = process.argv.slice(2);
  if (args.length < 1) {
    console.log(JSON.stringify({ success: false, error: "Usage: node check-rfc-completeness.js <RFC_FILE_PATH>", complete: false }));
    process.exit(1);
  }
  var result = checkFileCompleteness(args[0]);
  console.log(JSON.stringify(result));
  process.exit(result.success && result.complete ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { checkFileCompleteness: checkFileCompleteness };
