#!/usr/bin/env node
/**
 * update-status.js <session-dir> <operation> [args...] — /drill-rfc-down progress manager
 *
 * Manages the ENTIRE drill pipeline (Step 1-5) at sub-step granularity. The step
 * definition table (STEP_DEFINITIONS) registers every sub-step 1-1..1-12 plus
 * the Step 2-5 gate steps (graphify / boundify / split / verify). Every
 * invocation prints the current step and the next AI action in English, so the
 * AI can never overlook the next required work.
 *
 * Operations:
 *   set-step <STEP-ID>      - Set the current sub-step (validated against the table)
 *   set-state <STATE>       - Set the grill-session state (GRILLING..DONE)
 *   inc-loop                - Increment reviewLoopCount (re-grill loop guard)
 *   show                    - Print current status + English nextAction (read-only)
 *
 * Exit codes: 0 = success, 1 = failure (unknown step/state, missing Status.json).
 *
 * Design context: tools/conver/README.md — 進化ループ / /drill-rfc-down (Step 1-12).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateAll } from './check-all-schema.js';

const STATUS_FILE = 'Status.json';

const VALID_STATES = [
  'GRILLING',
  'CHECKLIST_PENDING',
  'CHECKLIST_APPROVED',
  'WRITING',
  'REVIEWING',
  'DONE',
];

/**
 * Step definition table for the whole drill pipeline.
 *
 * Step 1 (grill) is sub-step granular (1-1..1-12); Steps 2-5 (graphify /
 * boundify / split / verify) are gate steps driven by their step scripts
 * (graphify-step.js / boundify-step.js / split-step.js / verify-step.js).
 */
const STEP_DEFINITIONS = {
  '1-1': { title: 'session-init', nextAction: 'Run session-init.js to create or resume the drill session in $SESSION_DIR.' },
  '1-2': { title: 'baseline', nextAction: 'Run rfc-evolution.js capture <RFC_PATH> to snapshot the RFC before editing.' },
  '1-3': { title: 'input-understanding', nextAction: 'Read all materials, the RESIDUE markers in README.md, and prior conversation; summarize the evolution scope to the user.' },
  '1-4': { title: 'design-tree', nextAction: 'Add initial DesignTree nodes via update-tree.js add for each evolution decision.' },
  '1-5': { title: 'grill', nextAction: 'Run the grill: validated questions (validate-question-format.js), collect Yes/No or A/B/C answers, resolve nodes via update-tree.js.' },
  '1-6': { title: 'grill-end', nextAction: 'Check open-count via update-tree.js; when it is 0, set-state CHECKLIST_PENDING and propose ending the grill.' },
  '1-7': { title: 'checklist', nextAction: 'Generate CheckList via generate-checklist.js, review it, get user approval, set-state CHECKLIST_APPROVED.' },
  '1-8': { title: 'rfc-append', nextAction: 'Append the confirmed evolution content to the RFC (append-only; include I/O boundary reference info).' },
  '1-9': { title: 'checklist-verify', nextAction: 'Set-state REVIEWING and fix every CheckList item until all are checked.' },
  '1-10': { title: 're-grill', nextAction: 'If new unresolved nodes exist, set-state GRILLING and inc-loop then return to 1-5; otherwise proceed.' },
  '1-11': { title: 'evolution-verify', nextAction: 'Run rfc-evolution.js verify <RFC_PATH>; fix violations until it exits 0.' },
  '1-12': { title: 'complete', nextAction: 'Set-state DONE, run check-all-schema.js, run rfc-evolution.js clean, and hand delta.json to Step 2.' },
  '2-1': { title: 'graphify', nextAction: 'Run graphify-step.js --stage with delta.json, design the GRAPH evolution on the staging copy with crud.js, then --approve (or --reject).' },
  '3-1': { title: 'boundify', nextAction: 'Run boundify-step.js --stage with the graph-delta, design the Dirs-Tree evolution on the staging copy with dirs-tree-crud.js, then --approve (or --reject).' },
  '4-1': { title: 'split', nextAction: 'Run split-step.js --stage with the dirs-tree-delta, edit the staging Tickets.json with add-ticket.js / update-ticket.js, then --approve (or --reject).' },
  '5-1': { title: 'verify', nextAction: 'Run verify-step.js with the 5 artifacts; on FAIL (exit 1) return to Step 2 and re-verify until PASS.' },
};

/** Read Status.json from the session directory. */
// [::TICKET::] PX-158, PX-159 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-158|PX-159) --for-spec --no-implementation-order`.
function readStatus(sessionDir) {
  const statusPath = path.join(path.resolve(sessionDir), STATUS_FILE);
  if (!fs.existsSync(statusPath)) {
    console.error(`Status.json not found: ${statusPath}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(statusPath, 'utf8'));
}

/** Persist Status.json and validate the whole session schema. */
// [::TICKET::] PX-158, PX-159 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-158|PX-159) --for-spec --no-implementation-order`.
function saveStatus(sessionDir, status) {
  status.updatedAt = new Date().toISOString();
  fs.writeFileSync(path.join(path.resolve(sessionDir), STATUS_FILE), JSON.stringify(status, null, 2), 'utf8');
  const errors = validateAll(path.resolve(sessionDir));
  if (errors.length > 0) {
    console.error(JSON.stringify({ ok: false, phase: 'schema-validation', errors }, null, 2));
    process.exit(1);
  }
}

/** Print the current step, state, and the English nextAction (machine-readable). */
// [::TICKET::] PX-158, PX-159 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-158|PX-159) --for-spec --no-implementation-order`.
function printStatus(status) {
  const step = STEP_DEFINITIONS[status.currentStep];
  process.stdout.write(JSON.stringify({
    ok: true,
    state: status.state,
    currentStep: status.currentStep || null,
    title: step ? step.title : null,
    nextAction: step
      ? step.nextAction
      : 'No current step set. Set the drill step with: update-status.js <dir> set-step <STEP>.',
    reviewLoopCount: status.reviewLoopCount || 0,
  }) + '\n');
}

// [::TICKET::] PX-158, PX-159 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-158|PX-159) --for-spec --no-implementation-order`.
function main() {
  const [,, sessionDir, operation, ...args] = process.argv;
  if (!sessionDir || !operation) {
    console.error('Usage: update-status.js <session-dir> <operation> [args...]');
    process.exit(1);
  }
  const status = readStatus(sessionDir);

  switch (operation) {
    case 'set-step': {
      const stepId = args[0];
      if (!STEP_DEFINITIONS[stepId]) {
        console.error(`Unknown step: ${stepId}. Valid steps: ${Object.keys(STEP_DEFINITIONS).join(', ')}`);
        process.exit(1);
      }
      status.currentStep = stepId;
      saveStatus(sessionDir, status);
      printStatus(status);
      break;
    }
    case 'set-state': {
      const newState = args[0];
      if (!VALID_STATES.includes(newState)) {
        console.error(`Invalid state: ${newState}. Valid: ${VALID_STATES.join(', ')}`);
        process.exit(1);
      }
      status.state = newState;
      saveStatus(sessionDir, status);
      printStatus(status);
      break;
    }
    case 'inc-loop': {
      status.reviewLoopCount = (status.reviewLoopCount || 0) + 1;
      saveStatus(sessionDir, status);
      printStatus(status);
      break;
    }
    case 'show': {
      printStatus(status);
      break;
    }
    default:
      console.error(`Unknown operation: ${operation}`);
      process.exit(1);
  }
}

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main();
}

export { STEP_DEFINITIONS, VALID_STATES, main };
