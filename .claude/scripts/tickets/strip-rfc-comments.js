#!/usr/bin/env node
/**
 * strip-rfc-comments.js — RFCファイルから HTML コメント（<!-- ... -->）を削除する。
 *
 * 以下のコメントは保護され、削除されない：
 * - Anchor Marker: <!-- [::REF-POINTER-BEGIN/END-*::] -->
 * - 機械転記ブロック開始: <!-- 機械転記ブロック（...） -->
 * - 機械転記ブロック終了: <!-- /機械転記ブロック -->
 *
 * 以下のコメントは削除される：
 * - ガイダンスコメント: <!--【記述指針】...-->
 * - プレースホルダー: <!-- ??? -->
 * - AI記述部: <!--【AI記述部】...-->
 * - WARNING: <!-- !!! WARNING ... !!! -->
 * - その他すべての HTML コメント
 *
 * frontmatter（--- で囲まれた YAML）は変更しない。
 *
 * 使用例:
 *   node strip-rfc-comments.js path/to/rfc.md
 *   {"success":true,"removed":5,"path":"..."}
 */
var fs = require("fs");
var path = require("path");

// 保護パターン（削除しないコメント）
var PROTECTED_PATTERNS = [
  /REF-POINTER-(BEGIN|END)-\d{2}-\d{3}/,  // Anchor Marker
  /^ 機械転記ブロック/,                       // 機械転記ブロック（先頭に空白あり）
  /^\/ 機械転記ブロック/                       // /機械転記ブロック終了
];

/**
 * コメント行が保護対象か判定する。
 * @param {string} commentContent - <!-- と --> の間の内容
 * @returns {boolean} 保護対象なら true
 */
function isProtectedComment(commentContent) {
  return PROTECTED_PATTERNS.some(function(pattern) {
    return pattern.test(commentContent);
  });
}

/**
 * RFCファイルから HTML コメントを削除する。
 *
 * @param {string} filePath - RFCファイルのパス
 * @returns {{success: boolean, removed: number, path: string}}
 */
function stripHtmlComments(filePath) {
  var resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    return { success: false, error: "File not found: " + resolved, removed: 0, path: resolved };
  }

  var content = fs.readFileSync(resolved, "utf8");
  var result = "";
  var removed = 0;
  var i = 0;
  var inFrontmatter = false;
  var frontmatterLineCount = 0;

  // frontmatter の範囲を特定（先頭の --- で区切られたブロック）
  var lines = content.split("\n");
  if (lines.length > 0 && lines[0].trim() === "---") {
    for (var j = 1; j < lines.length; j++) {
      if (lines[j].trim() === "---") {
        frontmatterLineCount = j + 1; // --- を含む行数
        break;
      }
    }
  }

  // frontmatter はそのまま出力
  for (var k = 0; k < frontmatterLineCount && k < lines.length; k++) {
    result += lines[k] + "\n";
  }

  // 本文を1行ずつ処理
  var inComment = false;
  var commentBuffer = "";
  for (var li = frontmatterLineCount; li < lines.length; li++) {
    var line = lines[li];

    if (!inComment) {
      // コメント開始を検出
      var commentStart = line.indexOf("<!--");
      if (commentStart !== -1) {
        var commentEnd = line.indexOf("-->", commentStart + 4);
        if (commentEnd !== -1) {
          // 単一行コメント
          var commentContent = line.slice(commentStart + 4, commentEnd);
          if (isProtectedComment(commentContent)) {
            result += line + "\n";
          } else {
            removed++;
            // コメント前のテキストがあれば出力
            var beforeComment = line.slice(0, commentStart);
            var afterComment = line.slice(commentEnd + 3);
            if (beforeComment.trim() || afterComment.trim()) {
              result += beforeComment + afterComment + "\n";
            }
          }
        } else {
          // 複数行コメント開始
          inComment = true;
          commentBuffer = line.slice(commentStart + 4);
          // コメント開始前のテキストがあれば出力
          result += line.slice(0, commentStart);
        }
      } else {
        result += line + "\n";
      }
    } else {
      // コメント内 — 終了を探す
      var endIdx = line.indexOf("-->");
      if (endIdx !== -1) {
        inComment = false;
        commentBuffer += "\n" + line.slice(0, endIdx);
        if (!isProtectedComment(commentBuffer)) {
          removed++;
          // コメント終了後のテキストがあれば出力
          var afterEnd = line.slice(endIdx + 3);
          if (afterEnd.trim()) {
            result += afterEnd;
          }
        } else {
          // 保護対象コメントは復元
          result += "<!--" + commentBuffer + "-->" + "\n";
        }
        // コメント終了行に他の内容がないかチェック
        if (endIdx + 3 < line.length && line.slice(endIdx + 3).trim()) {
          // 既に afterEnd を追加済み
        }
        result += "\n";
        commentBuffer = "";
      } else {
        commentBuffer += "\n" + line;
      }
    }
  }

  // 閉じていないコメントがあれば強制終了
  if (inComment) {
    removed++;
  }

  // 最終行の重複改行を整理
  result = result.replace(/\n{3,}/g, "\n\n");

  fs.writeFileSync(resolved, result, "utf8");
  return { success: true, removed: removed, path: resolved };
}

// === メイン処理 ===
function main() {
  var args = process.argv.slice(2);
  if (args.length < 1) {
    console.log(JSON.stringify({ success: false, error: "Usage: node strip-rfc-comments.js <RFC_FILE_PATH>", removed: 0 }));
    process.exit(1);
  }

  var result = stripHtmlComments(args[0]);
  console.log(JSON.stringify(result));
  process.exit(result.success ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { stripHtmlComments: stripHtmlComments, isProtectedComment: isProtectedComment };
