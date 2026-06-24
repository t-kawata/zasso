#!/usr/bin/env node
/**
 * update-status.js <rfc-dir> <operation> [args...]
 *
 * Operations:
 *   set-state  <STATE>        - ステートを更新する
 *                               有効値: GRILLING | CHECKLIST_PENDING | CHECKLIST_APPROVED
 *                                       WRITING | REVIEWING | DONE
 *   inc-loop                  - reviewLoopCountをインクリメントする
 *   show                      - 現在のStatus.jsonを出力する
 */
import fs from "fs";
import path from "path";
import { validateAll } from "./check-all-schema.js";

const VALID_STATES = [
  "GRILLING",
  "CHECKLIST_PENDING",
  "CHECKLIST_APPROVED",
  "WRITING",
  "REVIEWING",
  "DONE",
];

const [,, rfcDir, operation, ...args] = process.argv;
if (!rfcDir || !operation) {
  console.error("Usage: update-status.js <rfc-dir> <operation> [args...]");
  process.exit(1);
}

const statusPath = path.join(path.resolve(rfcDir), "Status.json");
if (!fs.existsSync(statusPath)) {
  console.error(`Status.json not found: ${statusPath}`);
  process.exit(1);
}

const status = JSON.parse(fs.readFileSync(statusPath, "utf-8"));

function saveAndValidate() {
  status.updatedAt = new Date().toISOString();
  fs.writeFileSync(statusPath, JSON.stringify(status, null, 2), "utf-8");
  const errors = validateAll(path.resolve(rfcDir));
  if (errors.length > 0) {
    console.error(JSON.stringify({ ok: false, phase: "schema-validation", errors }, null, 2));
    process.exit(1);
  }
}

switch (operation) {
  case "set-state": {
    const newState = args[0];
    if (!VALID_STATES.includes(newState)) {
      console.error(`Invalid state: ${newState}. Valid: ${VALID_STATES.join(", ")}`);
      process.exit(1);
    }
    status.state = newState;
    saveAndValidate();
    console.log(JSON.stringify({ ok: true, state: newState }));
    break;
  }
  case "inc-loop": {
    status.reviewLoopCount = (status.reviewLoopCount || 0) + 1;
    saveAndValidate();
    console.log(JSON.stringify({ ok: true, reviewLoopCount: status.reviewLoopCount }));
    break;
  }
  case "show": {
    console.log(JSON.stringify(status, null, 2));
    break;
  }
  default:
    console.error(`Unknown operation: ${operation}`);
    process.exit(1);
}
