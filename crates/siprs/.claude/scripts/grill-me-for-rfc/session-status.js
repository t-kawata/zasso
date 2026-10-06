#!/usr/bin/env node
/**
 * session-status.js <rfc-dir>
 *
 * Reads Status.json / DesignTree.json and mechanically derives
 * the current step, next step, node status, and loop count.
 *
 * The AI can understand "where it is now" and "what to do next"
 * just by calling this script, without having to think about it.
 *
 * Usage:
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
  process.stdout.write("⚠️  Status.json not found. Run init.js first." + "\n");
  process.exit(0);
}

const status = JSON.parse(fs.readFileSync(statusPath, "utf-8"));
const { state, reviewLoopCount, researchPath, materialPaths, rfcPath } = status;

// Read DesignTree (treat as empty tree if it does not exist)
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
    // Treat parse failure as empty
  }
}

// Helpers shared by the step table above.

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

// ─── Derive step ───

/**
 * Whether material was recorded after the run last completed.
 *
 * Both moments are written by scripts rather than inferred: update-status.js
 * writes completedAt on the completion transition, and init.js writes
 * materialsAddedAt only when a resume actually contributed a path. Comparing them
 * is what tells "a viewpoint arrived after this run finished" — which the command's
 * re-entry rule says re-opens it — apart from a session that has merely been written
 * to since. A record carrying neither field (one written before they existed) has
 * nothing to re-open, so it answers false rather than guessing.
 *
 * @param {object} status — the parsed Status.json
 * @returns {boolean}
 */
// [::TICKET::] PX-238, PX-239 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-238|PX-239) --for-spec --no-implementation-order`.
function materialArrivedAfterCompletion(status) {
  const completedAt = Date.parse(status.completedAt ?? "");
  const materialsAddedAt = Date.parse(status.materialsAddedAt ?? "");
  if (Number.isNaN(completedAt) || Number.isNaN(materialsAddedAt)) return false;
  return materialsAddedAt > completedAt;
}

// [::TICKET::] PX-238, PX-239 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-238|PX-239) --for-spec --no-implementation-order`.
function deriveStep(state, nodes, openCount, loopCount, reentry) {
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
      if (reentry) {
        return {
          step: "✅ STEP 8 → STEP 2",
          label: "Complete — material arrived afterwards",
          action:
            "Re-entry: run settle-run.js prior, then STEP 2 to STEP 8 over the material added since this run completed",
        };
      }
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
  materialArrivedAfterCompletion(status),
);

// ─── Display ───

process.stdout.write("📋 Session Status" + "\n");
process.stdout.write(`  State: ${state}` + "\n");
process.stdout.write(`  Step: ${step} — ${label}` + "\n");
process.stdout.write(`  Next Action: ${action}` + "\n");
if (warning) {
  process.stdout.write(`  ⚠️  ${warning}` + "\n");
}
process.stdout.write("\n");
process.stdout.write(`  Nodes: ${totalNodes} total / ${openCount} open` + "\n");
process.stdout.write(`  Loop Count: ${reviewLoopCount ?? 0}` + "\n");
process.stdout.write("  Material:" + "\n");
// materialPaths is the list current runs write; researchPath is the single path an
// older session carries, and is shown only when the list is absent.
const materials = Array.isArray(materialPaths) ? materialPaths : (researchPath ? [researchPath] : []);
if (materials.length === 0) {
  process.stdout.write("    (none)" + "\n");
}
for (const materialPath of materials) {
  process.stdout.write(`    ${materialPath}` + "\n");
}
process.stdout.write(`  RFC Path: ${rfcPath ?? "(not set)"}` + "\n");
