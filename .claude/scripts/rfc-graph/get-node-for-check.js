#!/usr/bin/env node

/**
 * get-node-for-check.js — Display individual node quality check
 *
 * Shows the output of query.js saved in the _quality/ directory,
 * appending three check items at the end.
 *
 * CLI: get-node-for-check.js <nodeId>
 *   nodeId: e.g. N0001
 *
 * Exit codes:
 *   0  Normal termination
 *   1  Error termination (missing arguments / file not found)
 */

const fs = require("fs");
const path = require("path");

/** Path to the _quality directory (relative to the current working directory) */
const QUALITY_DIR = path.resolve(process.cwd(), "_quality");

/** Check items template */
const CHECK_ITEMS = `
# 点検項目
1. 他のノードとの関係性が設計文書の記述を正しく反映しているか
2. 各ノードの内容が設計文書の該当箇所を過不足なくカバーしているか
3. /formulate-tickets 及び /formulate-tickets-for-next スラッシュコマンドがこのグラフからチケット分解する際に、不足している情報がないか
`;

/**
 * Print an error message in a three-part template and exit with code 1
 *
 * @param {string} message — what happened
 * @param {string} cause — why it happened
 * @param {string} action — next action to take
 */
function printError(message, cause, action) {
  process.stderr.write(
    `[ERROR] ${message}\n` +
    `原因: ${cause}\n` +
    `対応: ${action}\n`
  );
  process.exit(1);
}

/**
 * Main entry point
 *
 * 1. Get node ID from arguments
 * 2. Read _quality/<nodeId>.md
 * 3. Display content and check items
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printError(
      "ノードIDが指定されていません。",
      "引数なしで実行されました。",
      "get-node-for-check.js N0001 のようにノードIDを指定してください。"
    );
  }

  const nodeId = args[0];

  // Validate node ID format (Nxxxx)
  if (!/^N[0-9]{4}$/.test(nodeId)) {
    printError(
      `ノードIDの形式が不正です: ${nodeId}`,
      `Nxxxx 形式（例: N0001）である必要があります。`,
      "正しいノードIDを指定してください。"
    );
  }

  const filePath = path.join(QUALITY_DIR, `${nodeId}.md`);

  if (!fs.existsSync(filePath)) {
    printError(
      `品質点検ファイルが見つかりません: ${filePath}`,
      `ノードID ${nodeId} に対応する _quality/${nodeId}.md が存在しません。`,
      "先に query-all-nodes.sh を実行して _quality/ ディレクトリを生成してください。"
    );
  }

  const content = fs.readFileSync(filePath, "utf8");

  // Display content
  process.stdout.write(content);

  // Add a blank line if content does not end with one
  if (!content.endsWith("\n")) {
    process.stdout.write("\n");
  }

  // Append check items
  process.stdout.write(CHECK_ITEMS);
}

if (require.main === module) {
  main();
}

module.exports = { CHECK_ITEMS, QUALITY_DIR };
