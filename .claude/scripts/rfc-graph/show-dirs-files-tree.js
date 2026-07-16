#!/usr/bin/env node

/**
 * show-dirs-files-tree.js — Dirs-Tree.json からディレクトリ・ファイル構造ツリー表示
 *
 * boundify が生成した Dirs-Tree.json を読み込み、各ファイルにマッピングされた
 * nodeId・title・kind をツリー形式で表示する。
 *
 * CLI: show-dirs-files-tree.js </path/to/RFC-ROOT-Dirs-Tree.json>
 *
 * Exit codes:
 *   0  正常終了
 *   1  エラー終了
 */

const fs = require("fs");
const path = require("path");

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

/**
 * 3段テンプレートでエラーを stderr に出力し exit 1 する
 */
function exitWithError(message, cause, action) {
  process.stderr.write("[ERROR] " + message + "\n");
  process.stderr.write("Cause: " + cause + "\n");
  process.stderr.write("Action: " + action + "\n");
  process.exit(EXIT_FAILURE);
}

/**
 * ツリーを再帰的に Markdown ネストリスト形式で出力する
 *
 * @param {object[]} nodes - DirNode 配列
 * @param {number} depth - 現在のインデント深さ（0始まり）
 * @param {string[]} lines - 行蓄積配列（破壊的追加）
 */
function renderTree(nodes, depth, lines) {
  const indent = "    ".repeat(depth);
  for (const node of nodes) {
    if (node.type === "directory") {
      const kindLabel = node.kind && node.kind !== "root" ? " [" + node.kind + "]" : "";
      lines.push(indent + "- " + node.name + "/" + kindLabel);
      if (node.children) {
        renderTree(node.children, depth + 1, lines);
      }
    } else if (node.type === "file") {
      const ids = node.mappedNodeIds || [];
      if (ids.length > 0) {
        const annotations = ids.map(function (e) {
          const nid = e.nodeId || "";
          const title = e.title || "";
          const kind = node.kind || "";
          return "(" + nid + ": " + title + " [" + kind + "])";
        });
        lines.push(indent + "- " + node.name + " " + annotations.join(" "));
      } else {
        lines.push(indent + "- " + node.name);
      }
    }
  }
}

/**
 * メインエントリポイント
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log("show-dirs-files-tree.js — Display directory/file tree from Dirs-Tree.json");
    console.log("");
    console.log("Usage:");
    console.log("  show-dirs-files-tree.js </path/to/RFC-ROOT-Dirs-Tree.json>");
    console.log("");
    console.log("Options:");
    console.log("  --help, -h  Show this help");
    process.exit(EXIT_SUCCESS);
  }

  const dirsTreePath = path.resolve(args[0]);
  if (!fs.existsSync(dirsTreePath)) {
    exitWithError(
      "Dirs-Tree.json が見つかりません: " + dirsTreePath,
      "指定されたパスにファイルが存在しません。",
      "正しいパスを指定してください。"
    );
  }

  let dirsTree;
  try {
    dirsTree = JSON.parse(fs.readFileSync(dirsTreePath, "utf8"));
  } catch (e) {
    exitWithError(
      "Dirs-Tree.json のパースに失敗しました: " + e.message,
      "ファイルが有効なJSON形式であることを確認してください。",
      "正しい Dirs-Tree.json を指定してください。"
    );
  }

  const graphFileName = path.basename(dirsTree.sourceGraph || "");
  const sourceFileName = path.basename(dirsTree.sourceFile || "");
  const dirsTreeFileName = path.basename(dirsTreePath);

  console.log("# Directory / File Structure — Mapped Nodes");
  console.log("");

  const langKeys = Object.keys(dirsTree.trees || {});
  const langInfo = langKeys.join(", ");
  console.log(
    "Language: " + langInfo + " | Graph: " + graphFileName + " | Source: " + sourceFileName
  );
  console.log("");

  console.log("## To show node details");
  console.log("");
  console.log("```");
  console.log(
    'node .claude/scripts/rfc-graph/query.js --graph="' +
      graphFileName +
      '" --source="' +
      sourceFileName +
      '" --dirs-tree="' +
      dirsTreeFileName +
      '" --id=Nxxxx (e.g. N0001) --hops=<N> (1=direct, 2+=includes grandchildren)'
  );
  console.log("```");
  console.log("");

  const trees = dirsTree.trees || {};
  for (const lang of langKeys) {
    const root = trees[lang];
    if (!root) continue;

    console.log("## " + lang.charAt(0).toUpperCase() + lang.slice(1));
    console.log("");

    const kindLabel = root.kind && root.kind !== "root" ? " [" + root.kind + "]" : " [source-root]";
    console.log("- " + root.name + "/" + kindLabel);

    if (root.children) {
      var treeLines = [];
      renderTree(root.children, 1, treeLines);
      for (var ti = 0; ti < treeLines.length; ti++) {
        console.log(treeLines[ti]);
      }
      console.log("");
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = { renderTree };
