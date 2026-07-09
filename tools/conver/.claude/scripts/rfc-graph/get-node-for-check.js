#!/usr/bin/env node

/**
 * get-node-for-check.js — 個別ノードの品質点検表示
 *
 * _quality/ ディレクトリに保存された query.js の出力を表示し、
 * 末尾に3つの点検項目を追記する。
 *
 * CLI: get-node-for-check.js <nodeId>
 *   nodeId: 例 N0001
 *
 * Exit codes:
 *   0  正常終了
 *   1  エラー終了（引数不足・ファイル不在）
 */

const fs = require("fs");
const path = require("path");

/** _quality ディレクトリのパス（カレントワーキングディレクトリ基準） */
const QUALITY_DIR = path.resolve(process.cwd(), "_quality");

/** 点検項目テンプレート */
const CHECK_ITEMS = `
# 点検項目
1. 他のノードとの関係性が設計文書の記述を正しく反映しているか
2. 各ノードの内容が設計文書の該当箇所を過不足なくカバーしているか
3. /formulate-tickets 及び /formulate-tickets-for-next スラッシュコマンドがこのグラフからチケット分解する際に、不足している情報がないか
`;

/**
 * 3段テンプレートでエラーメッセージを出力し、exit 1 する
 *
 * @param {string} message — 何が起きたか
 * @param {string} cause — なぜ起きたか
 * @param {string} action — 次に取るべきアクション
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
 * メインエントリポイント
 *
 * 1. 引数からノードIDを取得
 * 2. _quality/<nodeId>.md を読み込む
 * 3. 内容と点検項目を表示
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

  // ノードIDの形式検証（Nxxxx）
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

  // 内容を表示
  process.stdout.write(content);

  // 内容が空行で終わっていなければ空行を追加
  if (!content.endsWith("\n")) {
    process.stdout.write("\n");
  }

  // 点検項目を追記
  process.stdout.write(CHECK_ITEMS);
}

if (require.main === module) {
  main();
}

module.exports = { CHECK_ITEMS, QUALITY_DIR };
