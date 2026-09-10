#!/usr/bin/env node
/**
 * show-split-rfc-status.js — /split-rfc-to-children の進捗を表示する
 *
 * 使用例:
 *   node show-split-rfc-status.js RFC-TREE.json
 *
 * 全ステップ完了時: exit 0 + 「全ステップ完了」
 * 未完了あり: exit 1 + 次Stepの指示
 */
var fs = require("fs");
var path = require("path");

// 全19ステップのラベルと説明（コマンドファイルと同期すること）
var STEP_LABELS = {
  "0": "引数パース",
  "1": "I/O境界参考情報",
  "2": "RFC-TREE.json作成",
  "3": "RFC理解",
  "3a-1": "├─ 3a-1: 目的とゴールの把握",
  "3a-2": "├─ 3a-2: メタ情報の記録",
  "3b": "├─ 3b: アーキテクチャ把握",
  "3c-1": "├─ 3c-1: 実装詳細（型・API・依存）",
  "3c-2": "├─ 3c-2: 実装詳細（テスト・エラー処理・設定）",
  "3-review": "└─ 3-review: RFC理解の全体確認",
  "4": "素案ツリー作成",
  "5": "検証ループ（1子ずつ修正）",
  "6": "Anchor Marker 登録",
  "7": "Anchor Marker 自動挿入 + 機械転記",
  "8": "リンク整合性検証",
  "9": "詳細記述",
  "10": "コメント削除",
  "11": "完全性検証",
  "12": "完了報告"
};

// 各ステップの自然言語による指示文
var STEP_INSTRUCTIONS = {
  "6": "各 childNode に add-ref-pointer.js で正典RFCの該当セクション行範囲を登録してください。\n  node .claude/scripts/tickets/add-ref-pointer.js <TREE_PATH> <childId> add --id <id> --lineStart <n> --lineEnd <n>\n完了したら: update-split-rfc-status.js <TREE_PATH> 6 done",
  "7": "generate-child-rfcs.js を --phase=insert で実行し、次に --phase=transfer で機械転記してください。\n  node .claude/scripts/tickets/generate-child-rfcs.js <TREE_PATH>\n完了したら: update-split-rfc-status.js <TREE_PATH> 7 done",
  "8": "validate-ref-pointer.js で Anchor Marker の整合性を検証してください。\n  node .claude/scripts/tickets/validate-ref-pointer.js <TREE_PATH>\nエラーがゼロになるまで修正を繰り返します。\n完了したら: update-split-rfc-status.js <TREE_PATH> 8 done",
  "9": "各子RFCの AI記述部に設計判断・補足説明を記述してください。\n編集禁止: 機械転記ブロック、frontmatter、Anchor Marker 注釈\n完了したら: update-split-rfc-status.js <TREE_PATH> 9 done",
  "10": "strip-rfc-comments.js で全子孫RFCからガイダンスコメントを削除してください。\n  node .claude/scripts/tickets/strip-rfc-comments.js <TREE_PATH>\nまたは check-all-rfcs-completeness.js の walk + strip を使用します。\n完了したら: update-split-rfc-status.js <TREE_PATH> 10 done",
  "11": "check-all-rfcs-completeness.js で全子孫RFCの完全性を検証してください。\n  node .claude/scripts/tickets/check-all-rfcs-completeness.js <TREE_PATH>\nincomplete: 0 になるまで Step 9 に戻って修正します。\n完了したら: update-split-rfc-status.js <TREE_PATH> 11 done",
  "12": "verify-rfc-coverage.js と check-rfc-placeholders.js で最終検証し、\nshow-split-rfc-status.js が「全ステップ完了」を出力することを確認してください。\n完了したら: update-split-rfc-status.js <TREE_PATH> 12 done"
};

var DEFAULT_INSTRUCTION = "コマンドファイルの該当 Step の説明に従って進めてください。";

/**
 * 進捗状況を表示する。
 */
function printProgress(data) {
  var steps = data.split_status && data.split_status.steps;
  if (!steps) {
    console.log("[ERROR] split_status.steps が見つかりません");
    return { total: 0, done: 0, nextId: null };
  }

  var total = 0;
  var done = 0;
  var nextId = null;
  var doneList = [];
  var pendingList = [];

  var orderedIds = Object.keys(STEP_LABELS);

  orderedIds.forEach(function(id) {
    var status = steps[id] || "pending";
    total++;
    if (status === "done") {
      done++;
      doneList.push(id);
    } else {
      if (!nextId) nextId = id;
      pendingList.push({ id: id, status: status });
    }
  });

  console.log("【進捗状況】" + total + "ステップ中 " + done + "ステップ完了\n");

  if (doneList.length > 0) {
    console.log("=== 完了 ===");
    doneList.forEach(function(id) {
      console.log("  " + STEP_LABELS[id] || id);
    });
    console.log("");
  }

  if (pendingList.length > 0) {
    console.log("=== 未完了 ===");
    pendingList.forEach(function(item) {
      var label = STEP_LABELS[item.id] || item.id;
      console.log("  " + label + " [" + item.status.toUpperCase() + "]");
    });
    console.log("");
  }

  return { total: total, done: done, nextId: nextId };
}

/**
 * 次に実行すべき Step の指示文を表示する。
 */
function printNextAction(nextId) {
  if (!nextId) {
    console.log("【全ステップ完了】/split-rfc-to-children は正常に完了しました。");
    return;
  }

  var label = STEP_LABELS[nextId] || nextId;
  var instruction = STEP_INSTRUCTIONS[nextId] || DEFAULT_INSTRUCTION;

  console.log("【次のアクション】");
  console.log("次に実行すべき Step: " + nextId + " — " + label + "\n");
  console.log(instruction);
  console.log("");
}

// === メイン ===
function main() {
  var args = process.argv.slice(2);
  if (args.length < 1) {
    console.log("Usage: node show-split-rfc-status.js <RFC-TREE.json>");
    process.exit(1);
  }

  var resolved = path.resolve(args[0]);
  if (!fs.existsSync(resolved)) {
    console.log("【進捗状況】RFC-TREE.json がまだ作成されていません（Step 0-1: 準備段階）");
    console.log("次のアクション: 引数パースとI/O境界情報の確認を進めてください。");
    console.log("RFC-TREE.json は Step 2 で作成されます。");
    process.exit(1);
  }

  var data = JSON.parse(fs.readFileSync(resolved, "utf8"));
  var progress = printProgress(data);
  printNextAction(progress.nextId);

  process.exit(progress.nextId ? 1 : 0);
}

if (require.main === module) { main(); }
