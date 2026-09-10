#!/usr/bin/env node
/**
 * check-all-rfcs-completeness.js — RFC-TREE.json から全子孫RFCを再帰的に走査し
 * 完全性を検証する。正典RFCのファイル名に依存せず、RFC-TREE.json を唯一の
 * ソース・オブ・トゥルースとする。
 *
 * 使用例:
 *   node check-all-rfcs-completeness.js RFC-TREE.json
 *   {"success":true,"total":5,"complete":3,"incomplete":2,"files":[...]}
 */
var fs = require("fs");
var path = require("path");
var completenessChecker = require("./check-rfc-completeness");

/**
 * childNode のディレクトリ名を導出する。
 * generate-child-rfcs.js と同じロジック。
 */
function childDirName(cb, child) {
  return cb + "-" + child.childId + "-" + (child.slug || child.directoryName || child.childId);
}

/**
 * 孫ノードのディレクトリ名を導出する。
 */
function gcDirName(cb, parentId, gc) {
  return cb + "-" + parentId + "-" + gc.grandchildId + "-" + (gc.slug || gc.directoryName || gc.grandchildId);
}

/**
 * RFC-TREE.json を読み込み、全子孫RFCファイルを走査する。
 *
 * @param {string} treePath - RFC-TREE.json のパス
 * @returns {{success: boolean, total: number, complete: number, incomplete: number, files: object[]}}
 */
function walkAllRfcFiles(treePath) {
  var resolved = path.resolve(treePath);
  if (!fs.existsSync(resolved)) {
    return { success: false, error: "RFC-TREE.json not found: " + resolved, total: 0, complete: 0, incomplete: 0, files: [] };
  }

  var data = JSON.parse(fs.readFileSync(resolved, "utf8"));
  var tree = data.finalTree;
  if (!Array.isArray(tree)) {
    return { success: false, error: "finalTree not found", total: 0, complete: 0, incomplete: 0, files: [] };
  }

  var cb = path.basename(data.canonicalRfcPath, ".md");
  var bd = path.dirname(data.canonicalRfcPath);
  var results = [];

  tree.forEach(function(child) {
    var dn = childDirName(cb, child);
    var childDir = path.join(bd, dn);
    var childFile = path.join(childDir, dn + ".md");

    if (fs.existsSync(childFile)) {
      results.push(completenessChecker.checkFileCompleteness(childFile));
    }

    // 孫RFC
    if (child.children) {
      child.children.forEach(function(gc) {
        var dnGC = gcDirName(cb, child.childId, gc);
        var gcFile = path.join(childDir, dnGC, dnGC + ".md");
        if (fs.existsSync(gcFile)) {
          results.push(completenessChecker.checkFileCompleteness(gcFile));
        }
      });
    }
  });

  var complete = results.filter(function(r) { return r.complete; }).length;
  var incomplete = results.filter(function(r) { return !r.complete; }).length;

  return {
    success: true,
    total: results.length,
    complete: complete,
    incomplete: incomplete,
    files: results
  };
}

// === メイン処理 ===
function main() {
  var args = process.argv.slice(2);
  if (args.length < 1) {
    console.log(JSON.stringify({ success: false, error: "Usage: node check-all-rfcs-completeness.js <RFC_TREE_PATH>", total: 0, complete: 0, incomplete: 0, files: [] }));
    process.exit(1);
  }

  var result = walkAllRfcFiles(args[0]);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.incomplete > 0 ? 1 : 0);
}

if (require.main === module) {
  main();
}

module.exports = { walkAllRfcFiles: walkAllRfcFiles };
