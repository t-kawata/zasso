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
  console.log("⚠️  Status.json not found. Run init.js first.");
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
          label: "STEP 1: DesignTree Initial Node Generation",
          action: "Run update-tree.js add to create initial nodes from research material",
        };
      }
      if (openCount > 0) {
        return {
          step: "STEP 2",
          label: "STEP 2: Grill Session Active",
          action: "Run tree-query.js tree to review unresolved nodes and generate questions",
        };
      }
      return {
        step: "STEP 3",
        label: "STEP 3: Grill End Pending",
        action:
          "All nodes resolved. Propose session end to user; transition to CHECKLIST_PENDING on approval",
      };
    case "CHECKLIST_PENDING":
      return {
        step: "STEP 4",
        label: "STEP 4: Checklist Generation Pending",
        action:
          "Run generate-checklist.js, visually verify, get user approval, then transition to CHECKLIST_APPROVED",
      };
    case "CHECKLIST_APPROVED":
      return {
        step: "STEP 4 → STEP 5",
        label: "STEP 4 → STEP 5: Checklist Approved",
        action: "Begin writing the RFC. Transition to WRITING",
      };
    case "WRITING":
      return {
        step: "STEP 5",
        label: "STEP 5: RFC Writing",
        action: "When RFC writing is complete, transition to REVIEWING",
      };
    case "REVIEWING":
      if (openCount > 0) {
        const base = {
          step: "STEP 7",
          label: "STEP 7: Re-grill Required",
          action:
            "Transition to GRILLING to re-grill unresolved nodes (inc-loop)",
        };
        if (loopCount >= 3) {
          base.warning =
            "Loop count exceeds 3. Report the reason for the extended cycle and current status to the user before transitioning";
        }
        return base;
      }
      return {
        step: "STEP 8",
        label: "STEP 8: Completion Check",
        action: "Verify all conditions, transition to DONE to declare completion",
      };
    case "DONE":
      return {
        step: "✅ STEP 8",
        label: "Complete",
        action: "—",
      };
    default:
      return {
        step: "⚠️",
        label: "Unknown State",
        action: "Check Status.json state field",
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
console.log(`  Step: ${step} — ${label}`);
console.log(`  Next Action: ${action}`);
if (warning) {
  console.log(`  ⚠️  ${warning}`);
}
console.log("");
console.log(`  Nodes: ${totalNodes} total / ${openCount} open`);
console.log(`  Loop Count: ${reviewLoopCount ?? 0}`);
console.log(`  Research Path: ${researchPath ?? "(not set)"}`);
console.log(`  RFC Path: ${rfcPath ?? "(not set)"}`);
