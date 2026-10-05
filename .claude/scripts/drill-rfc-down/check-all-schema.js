#!/usr/bin/env node
/**
 * check-all-schema.js <session-dir>
 *
 * Validates the schema of Status.json, DesignTree.json, and CheckList.md.
 * Exported as a module and called internally at the end of every script's success path.
 * Also executable standalone as a CLI.
 *
 * Usage (CLI):
 *   node check-all-schema.js <session-dir>
 *
 * Usage (import within scripts):
 *   import { validateAll } from './check-all-schema.js';
 *   const errors = validateAll(sessionDir);
 *   if (errors.length) { process.exit(1); }
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ─── State constants (keep in sync with update-status.js) ───
const VALID_STATES = [
  "GRILLING",
  "CHECKLIST_PENDING",
  "CHECKLIST_APPROVED",
  "WRITING",
  "REVIEWING",
  "DONE",
];

// DesignTree node id convention: Q<number> top-level (Q1, Q2, ...) and
// Q<number><letter> for children (Q1a, Q1b). Enforced by validateNodeArray.
// [::TICKET::] PX-159 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-159 --for-spec --no-implementation-order`.
const Q_ID_PATTERN = /^Q\d+[a-z]?$/;

// ─── Status.json schema validation ───

export function validateStatus(sessionDir) {
  const errors = [];
  const statusPath = path.join(sessionDir, "Status.json");

  if (!fs.existsSync(statusPath)) {
    errors.push("Status.json: file does not exist");
    return errors;
  }

  let status;
  try {
    status = JSON.parse(fs.readFileSync(statusPath, "utf-8"));
  } catch (e) {
    errors.push("Status.json: JSON parse failed — " + e.message);
    return errors;
  }

  const requiredFields = ["state", "researchPath", "rfcPath", "rfcDir", "reviewLoopCount", "createdAt", "updatedAt"];
  for (const field of requiredFields) {
    if (status[field] === undefined || status[field] === null) {
      errors.push(`Status.json: required field "${field}" is missing`);
    }
  }

  if (status.state && !VALID_STATES.includes(status.state)) {
    errors.push(`Status.json.state: invalid value "${status.state}" (valid: ${VALID_STATES.join(", ")})`);
  }

  if (typeof status.reviewLoopCount !== "number" || status.reviewLoopCount < 0) {
    errors.push("Status.json.reviewLoopCount: must be a non-negative number");
  }

  if (status.createdAt && isNaN(Date.parse(status.createdAt))) {
    errors.push("Status.json.createdAt: must be a valid ISO 8601 date");
  }
  if (status.updatedAt && isNaN(Date.parse(status.updatedAt))) {
    errors.push("Status.json.updatedAt: must be a valid ISO 8601 date");
  }

  return errors;
}

// ─── DesignTree.json schema validation ───

export function validateDesignTree(sessionDir) {
  const errors = [];
  const treePath = path.join(sessionDir, "DesignTree.json");

  if (!fs.existsSync(treePath)) {
    errors.push("DesignTree.json: file does not exist");
    return errors;
  }

  let tree;
  try {
    tree = JSON.parse(fs.readFileSync(treePath, "utf-8"));
  } catch (e) {
    errors.push("DesignTree.json: JSON parse failed — " + e.message);
    return errors;
  }

  if (tree.version === undefined || typeof tree.version !== "number" || tree.version < 1) {
    errors.push("DesignTree.json.version: must be a number >= 1");
  }

  if (tree.updatedAt && isNaN(Date.parse(tree.updatedAt))) {
    errors.push("DesignTree.json.updatedAt: must be a valid ISO 8601 date");
  }

  if (!Array.isArray(tree.nodes)) {
    errors.push("DesignTree.json.nodes: must be an array");
  } else {
    errors.push(...validateNodeArray(tree.nodes, "nodes", new Set()));
  }

  if (tree.questions !== undefined && !Array.isArray(tree.questions)) {
    errors.push("DesignTree.json.questions: must be an array when present");
  } else if (Array.isArray(tree.questions)) {
    errors.push(...validateQuestionBlocks(tree.questions));
  }

  if (tree.priorScan !== undefined && !Array.isArray(tree.priorScan.artifacts)) {
    errors.push("DesignTree.json.priorScan.artifacts: must be an array when a prior scan is present");
  }

  return errors;
}

/**
 * The question blocks a run has opened.
 *
 * This validates shape only. Whether a block is *allowed* — whether it binds
 * enough nodes, whether its settle trace accounts for the records that were read —
 * is the question gate's judgement and lives in settle-run.js check, because a
 * block is opened empty and filled afterwards and must be readable in between.
 *
 * @param {Array<object>} blocks
 * @returns {string[]} error messages
 */
// [::TICKET::] PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
export function validateQuestionBlocks(blocks) {
  const errors = [];
  const seenNumbers = new Set();

  blocks.forEach((block, i) => {
    const p = `questions[${i}]`;
    if (typeof block.number !== "number") {
      errors.push(`${p}.number: must be a number`);
    } else if (seenNumbers.has(block.number)) {
      errors.push(`${p}.number: duplicate number ${block.number}`);
    } else {
      seenNumbers.add(block.number);
    }
    if (!Array.isArray(block.boundNodeIds)) errors.push(`${p}.boundNodeIds: must be an array`);
    if (typeof block.scopeLine !== "string") errors.push(`${p}.scopeLine: must be a string`);
    if (typeof block.settleTrace !== "string") errors.push(`${p}.settleTrace: must be a string`);
    if (block.framing !== undefined && typeof block.framing !== "object") errors.push(`${p}.framing: must be an object`);
    if (block.choice !== undefined && typeof block.choice !== "object") errors.push(`${p}.choice: must be an object`);
  });

  return errors;
}

// [::TICKET::] PX-157, PX-158, PX-159, PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-157|PX-158|PX-159|PX-234) --for-spec --no-implementation-order`.
function validateNodeArray(nodes, pathPrefix, seenIds) {
  const errors = [];
  nodes.forEach((node, i) => {
    const p = `${pathPrefix}[${i}]`;
    if (!node.id || typeof node.id !== "string") {
      errors.push(`${p}.id: must be a non-empty string`);
    } else if (!Q_ID_PATTERN.test(node.id)) {
      errors.push(`${p}.id: must follow the Q<number> convention (e.g., Q1, Q1a) — got "${node.id}"`);
    } else if (seenIds.has(node.id)) {
      errors.push(`${p}.id: duplicate id "${node.id}"`);
    } else {
      seenIds.add(node.id);
    }
    if (!node.title || typeof node.title !== "string") {
      errors.push(`${p}.title: must be a non-empty string`);
    }
    if (!["open", "resolved"].includes(node.status)) {
      errors.push(`${p}.status: must be "open" or "resolved" (current: "${node.status}")`);
    }
    if (!Array.isArray(node.questions)) {
      errors.push(`${p}.questions: must be an array`);
    } else {
      node.questions.forEach((q, qi) => {
        if (!q.resolvedAt || typeof q.resolvedAt !== "string") {
          errors.push(`${p}.questions[${qi}].resolvedAt: required field`);
        }
        if (!q.answer || typeof q.answer !== "string") {
          errors.push(`${p}.questions[${qi}].answer: required field`);
        }
        // A settlement that names a ground must also say what would overturn it:
        // a decision nobody can name the undoing of is not a decision the run can
        // stand behind. A human resolution carries no ground and is not held to
        // this, because the answer the person gave is its own ground.
        // [::TICKET::] PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
        if (q.ground !== undefined && (typeof q.override !== "string" || q.override === "")) {
          errors.push(`${p}.questions[${qi}].override: required when a settlement carries a ground`);
        }
      });
    }
    if (!Array.isArray(node.children)) {
      errors.push(`${p}.children: must be an array`);
    } else {
      errors.push(...validateNodeArray(node.children, `${p}.children`, seenIds));
    }
  });
  return errors;
}

// ─── CheckList.md schema validation ───

export function validateChecklist(sessionDir) {
  const errors = [];
  const checklistPath = path.join(sessionDir, "CheckList.md");

  if (!fs.existsSync(checklistPath)) {
    errors.push("CheckList.md: file does not exist");
    return errors;
  }

  const content = fs.readFileSync(checklistPath, "utf-8");

  if (!content.includes("# RFC 要件チェックリスト")) {
    errors.push("CheckList.md: header \"# RFC 要件チェックリスト\" not found");
  }

  return errors;
}

// ─── Combined validation ───

/**
 * Validates the schema of all 3 files and returns an array of error messages.
 * Returns an empty array if there are no errors.
 */
export function validateAll(sessionDir) {
  const errors = [];
  errors.push(...validateStatus(sessionDir));
  errors.push(...validateDesignTree(sessionDir));
  errors.push(...validateChecklist(sessionDir));
  return errors;
}

// ─── CLI entry point ───
// Guard to prevent side effects when imported as a module

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  const cliSessionDir = process.argv[2];
  if (!cliSessionDir) {
    console.error("Usage: check-all-schema.js <session-dir>");
    process.exit(1);
  }
  const resolved = path.resolve(cliSessionDir);
  const errors = validateAll(resolved);
  if (errors.length > 0) {
    process.stdout.write(JSON.stringify({ ok: false, errors }, null, 2) + "\n");
    process.exit(1);
  }
  process.stdout.write(JSON.stringify({ ok: true }) + "\n");
}
