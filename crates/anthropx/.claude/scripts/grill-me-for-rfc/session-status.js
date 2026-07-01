#!/usr/bin/env node
/**
 * session-status.js <rfc-dir>
 *
 * Status.json / DesignTree.json を読み取り、現在の工程・次の工程・
 * ノード状況・ループ回数を機械的に導出して表示する。
 *
 * AI はこのスクリプトを呼ぶだけで「今どこにいるか」「次に何をすべきか」
 * を考えることなく把握できる。
 *
 * 使用:
 *   node session-status.js <rfc-dir>
 */
import fs from "fs";
import path from "path";

const rfcDirArg = process.argv[2];
if (!rfcDirArg) {
  console.error("Usage: session-status.js <rfc-dir>");
  process.exit(1);
}

const rfcDir = path.resolve(rfcDirArg);
const statusPath = path.join(rfcDir, "Status.json");
const treePath = path.join(rfcDir, "DesignTree.json");

if (!fs.existsSync(statusPath)) {
  console.log("⚠️  Status.json が見つかりません。init.js を実行してください。");
  process.exit(0);
}

const status = JSON.parse(fs.readFileSync(statusPath, "utf-8"));
const { state, reviewLoopCount, researchPath, rfcPath } = status;

// DesignTree 読み取り（存在しなければ空ツリー扱い）
let nodes = [];
let totalNodes = 0;
let openCount = 0;
if (fs.existsSync(treePath)) {
  try {
    const tree = JSON.parse(fs.readFileSync(treePath, "utf-8"));
    nodes = tree.nodes || [];
    totalNodes = countAll(nodes);
    openCount = countOpen(nodes);
  } catch {
    // パース失敗時は空扱い
  }
}

// ─── 補助関数 ───

function countAll(ns) {
  return ns.reduce((acc, n) => acc + 1 + countAll(n.children || []), 0);
}

function countOpen(ns) {
  return ns.reduce(
    (acc, n) =>
      acc + (n.status === "open" ? 1 : 0) + countOpen(n.children || []),
    0,
  );
}

// ─── 工程導出 ───

function deriveStep(state, nodes, openCount, loopCount) {
  switch (state) {
    case "GRILLING":
      if (nodes.length === 0) {
        return {
          step: "STEP 1",
          label: "DesignTree 初期ノード生成",
          action: "update-tree.js add で調査内容から初期ノードを追加する",
        };
      }
      if (openCount > 0) {
        return {
          step: "STEP 2",
          label: "Grill セッション中",
          action: "tree-query.js tree で未解決ノードを確認し、質問を生成する",
        };
      }
      return {
        step: "STEP 3",
        label: "Grill 終了判定待ち",
        action:
          "全ノード解決済み。ユーザーに終了を提案し、承認されれば CHECKLIST_PENDING に遷移する",
      };
    case "CHECKLIST_PENDING":
      return {
        step: "STEP 4",
        label: "チェックリスト生成前",
        action:
          "generate-checklist.js を実行し、目視チェック後ユーザー承認を得る。承認後 CHECKLIST_APPROVED に遷移",
      };
    case "CHECKLIST_APPROVED":
      return {
        step: "STEP 4 → STEP 5",
        label: "チェックリスト承認済み",
        action: "RFC 執筆を開始する。WRITING に遷移",
      };
    case "WRITING":
      return {
        step: "STEP 5",
        label: "RFC 執筆中",
        action: "RFC を書き終えたら REVIEWING に遷移する",
      };
    case "REVIEWING":
      if (openCount > 0) {
        const base = {
          step: "STEP 7",
          label: "再grill が必要",
          action:
            "未解決ノードを grill するため GRILLING に遷移する（inc-loop）",
        };
        if (loopCount >= 3) {
          base.warning =
            "ループが3回を超えました。ユーザーに長期化の理由と現状を報告してから遷移すること";
        }
        return base;
      }
      return {
        step: "STEP 8",
        label: "完了条件確認中",
        action: "全条件を確認し、DONE に遷移して完了宣言する",
      };
    case "DONE":
      return {
        step: "✅ STEP 8",
        label: "完了",
        action: "—",
      };
    default:
      return {
        step: "⚠️",
        label: "不明な状態",
        action: "Status.json の state を確認する",
      };
  }
}

const { step, label, action, warning } = deriveStep(
  state,
  nodes,
  openCount,
  reviewLoopCount,
);

// ─── 表示 ───

console.log("📋 Session Status");
console.log(`  State: ${state}`);
console.log(`  現在の工程: ${step} — ${label}`);
console.log(`  次のアクション: ${action}`);
if (warning) {
  console.log(`  ⚠️  ${warning}`);
}
console.log("");
console.log(`  ノード: ${totalNodes} 総数 / ${openCount} open`);
console.log(`  ループ回数: ${reviewLoopCount ?? 0}`);
console.log(`  調査パス: ${researchPath ?? "（未設定）"}`);
console.log(`  RFC パス: ${rfcPath ?? "（未設定）"}`);
