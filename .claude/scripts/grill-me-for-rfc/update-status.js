#!/usr/bin/env node
/**
 * update-status.js <rfc-dir> <operation> [args...]
 *
 * Operations:
 *   set-state  <STATE>        - Update the state
 *                               Valid values: GRILLING | CHECKLIST_PENDING | CHECKLIST_APPROVED
 *                                             WRITING | REVIEWING | DONE
 *   inc-loop                  - Increment reviewLoopCount
 *   show                      - Output the current Status.json
 */
import fs from "fs";
import path from "path";
import { validateAll } from "./check-all-schema.js";
// [::TICKET::] PX-231 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-231 --for-spec --no-implementation-order`.
import { toHomeRelative } from '../lib/path-utils.js';

const VALID_STATES = [
  "GRILLING",
  "CHECKLIST_PENDING",
  "CHECKLIST_APPROVED",
  "WRITING",
  "REVIEWING",
  "DONE",
];

/**
 * The one state that means a run is finished.
 *
 * Named because it is the only transition that also records when it happened:
 * `updatedAt` moves on every transition, so once anything else is written the
 * record no longer says when the run completed — and that moment is what tells a
 * later arrival of material apart from a session that has simply been touched.
 */
const COMPLETION_STATE = "DONE";

const [,, rfcDir, operation, ...args] = process.argv;
if (!rfcDir || !operation) {
  console.error("Usage: update-status.js <rfc-dir> <operation> [args...]");
  process.exit(1);
}

const statusPath = path.join(path.resolve(rfcDir), "Status.json");
if (!fs.existsSync(statusPath)) {
  console.error(`Status.json not found: ${toHomeRelative(statusPath)}`);
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

/**
 * Record that the run completed, at the moment it did.
 *
 * Only a completion calls this, and a re-entered run that completes again
 * overwrites the value, which keeps "material arrived after this run finished"
 * true of the latest completion rather than of the first one.
 */
// [::TICKET::] PX-238 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-238 --for-spec --no-implementation-order`.
function recordCompletion() {
  status.completedAt = new Date().toISOString();
}

switch (operation) {
  case "set-state": {
    const newState = args[0];
    if (!VALID_STATES.includes(newState)) {
      console.error(`Invalid state: ${newState}. Valid: ${VALID_STATES.join(", ")}`);
      process.exit(1);
    }
    status.state = newState;
    if (newState === COMPLETION_STATE) {
      recordCompletion();
    }
    saveAndValidate();
    process.stdout.write(JSON.stringify({ ok: true, state: newState }) + "\n");
    break;
  }
  case "inc-loop": {
    status.reviewLoopCount = (status.reviewLoopCount || 0) + 1;
    saveAndValidate();
    process.stdout.write(JSON.stringify({ ok: true, reviewLoopCount: status.reviewLoopCount }) + "\n");
    break;
  }
  case "show": {
    process.stdout.write(JSON.stringify(status, null, 2) + "\n");
    break;
  }
  default:
    console.error(`Unknown operation: ${operation}`);
    process.exit(1);
}
