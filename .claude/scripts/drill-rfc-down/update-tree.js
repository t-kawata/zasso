#!/usr/bin/env node
/**
 * update-tree.js <session-dir> <operation> [args...]
 *
 * Operations:
 *   add            '<node_json>'                        - Add a node to the root
 *   add-child      '<parent_id>' '<node_json>'          - Add a child to a parent node
 *   resolve        '<node_id>'  '<answer_summary>'      - Mark a node as resolved and record the answer
 *   batch-resolve  '<["id1","id2",...]>' '<answer>'     - Resolve multiple nodes at once
 *   refine         '<node_id>'  '<new_title>'           - Update (refine) a node's title
 *   delete         '<node_id>'                          - Delete a node and all its descendants
 *   show                                                - Output the current tree to STDOUT
 *   open-count                                          - Output the count of nodes with status:open
 */
import fs from "fs";
import path from "path";
import { validateAll } from "./check-all-schema.js";
import { MAX_POINTS_PER_AXIS_FLOOR, bundleAxes } from "../question-gate/bundle.mjs";
import { refineLetterlessAnswer } from "../question-gate/answers.mjs";
import { settlePoint } from "../question-gate/settle.mjs";
// [::TICKET::] PX-231 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-231 --for-spec --no-implementation-order`.
import { toHomeRelative } from '../lib/path-utils.js';

const [,, sessionDir, operation, ...args] = process.argv;
if (!sessionDir || !operation) {
  console.error("Usage: update-tree.js <session-dir> <operation> [args...]");
  process.exit(1);
}

const treePath = path.join(path.resolve(sessionDir), "DesignTree.json");
if (!fs.existsSync(treePath)) {
  console.error(`DesignTree.json not found: ${toHomeRelative(treePath)}`);
  process.exit(1);
}

const tree = JSON.parse(fs.readFileSync(treePath, "utf-8"));

// [::TICKET::] PX-157, PX-158, PX-159 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-157|PX-158|PX-159) --for-spec --no-implementation-order`.
function findNode(nodes, id) {
  for (const candidate of nodes) {
    if (candidate.id === id) return candidate;
    if (candidate.children?.length) {
      const found = findNode(candidate.children, id);
      if (found) return found;
    }
  }
  return null;
}

// [::TICKET::] PX-157, PX-158, PX-159 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-157|PX-158|PX-159) --for-spec --no-implementation-order`.
function countOpen(nodes) {
  let count = 0;
  for (const node of nodes) {
    if (node.status === "open") count++;
    if (node.children?.length) count += countOpen(node.children);
  }
  return count;
}

// [::TICKET::] PX-157, PX-158, PX-159 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-157|PX-158|PX-159) --for-spec --no-implementation-order`.
function save() {
  tree.updatedAt = new Date().toISOString();
  fs.writeFileSync(treePath, JSON.stringify(tree, null, 2), "utf-8");
}

// [::TICKET::] PX-157, PX-158, PX-159 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-157|PX-158|PX-159) --for-spec --no-implementation-order`.
function saveAndValidate() {
  // Capture the pre-mutation content so a failed write can be rolled back.
  // Strict validation must guard the file, not just report after corrupting it.
  const previousContent = fs.readFileSync(treePath, "utf-8");
  save();
  const errors = validateAll(path.resolve(sessionDir));
  if (errors.length > 0) {
    fs.writeFileSync(treePath, previousContent, "utf-8");
    console.error(JSON.stringify({ ok: false, phase: "schema-validation", errors }, null, 2));
    process.exit(1);
  }
}

/**
 * The grounds this run has actually read: the artifacts it found, the grounds the
 * decisions in them rest on, and what they state.
 *
 * A settlement may rest only on one of these. A ground the AI never read is not a
 * ground it has, which is why an empty scan settles nothing.
 */
// [::TICKET::] PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
function recordsOf() {
  const scan = tree.priorScan;
  if (scan === undefined) return [];
  return [
    ...(scan.artifacts ?? []),
    ...(scan.decisions ?? []).map((entry) => entry.ground).filter((ground) => typeof ground === "string" && ground !== ""),
    ...(scan.grounds ?? []).map((entry) => entry.statement),
  ];
}
// [::TICKET::] PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
function refuseSettlement(settlement) {
  const required = ["decision", "ground", "override"];
  const missing = required.filter((field) => typeof settlement[field] !== "string" || settlement[field].trim() === "");
  if (missing.length === 0) return null;
  return `settle refused: ${missing.join(", ")} required — a settlement needs the decision, the record it rests on, and the fact that would overturn it`;
}

/**
 * Why a block may not be bound, or null when it may.
 *
 * The settle trace is not checked here: a block is opened empty and filled
 * afterwards, and whether its trace accounts for the records read is the gate's
 * judgement, not the writer's.
 */
// [::TICKET::] PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
function refuseBlock(block) {
  const boundIds = Array.isArray(block.boundNodeIds) ? block.boundNodeIds : [];
  // The floor is the core's, not a second copy of it: a question binds at least
  // MAX_POINTS_PER_AXIS_FLOOR points unless fewer than that many are open.
  const { axes } = bundleAxes({
    candidates: [{ boundIds, direction: block.scopeLine ?? "" }],
    openCount: Math.max(countOpen(tree.nodes), boundIds.length),
  });
  if (axes.length === 0) {
    return `bind refused: a question binds at least ${MAX_POINTS_PER_AXIS_FLOOR} points unless fewer are open — a single-point question is a fact-question wearing a question's clothes`;
  }
  return null;
}

// [::TICKET::] PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
function ensureQuestions() {
  if (!Array.isArray(tree.questions)) tree.questions = [];
}

switch (operation) {
  case "add": {
    const node = JSON.parse(args[0]);
    if (!node.children) node.children = [];
    if (!node.questions) node.questions = [];
    if (!node.status) node.status = "open";
    tree.nodes.push(node);
    saveAndValidate();
    process.stdout.write(JSON.stringify({ ok: true, operation: "add", nodeId: node.id }) + "\n");
    break;
  }
  case "add-child": {
    const [parentId, nodeJson] = args;
    const parent = findNode(tree.nodes, parentId);
    if (!parent) { console.error(`Node not found: ${parentId}`); process.exit(1); }
    const node = JSON.parse(nodeJson);
    if (!node.children) node.children = [];
    if (!node.questions) node.questions = [];
    if (!node.status) node.status = "open";
    parent.children.push(node);
    saveAndValidate();
    process.stdout.write(JSON.stringify({ ok: true, operation: "add-child", parentId, nodeId: node.id }) + "\n");
    break;
  }
  case "resolve": {
    const [nodeId, answerSummary] = args;
    const node = findNode(tree.nodes, nodeId);
    if (!node) { console.error(`Node not found: ${nodeId}`); process.exit(1); }
    node.status = "resolved";
    node.questions.push({ resolvedAt: new Date().toISOString(), answer: answerSummary });
    saveAndValidate();
    process.stdout.write(JSON.stringify({ ok: true, operation: "resolve", nodeId }) + "\n");
    break;
  }
  case "batch-resolve": {
    const [idsJson, answerSummary] = args;
    const ids = JSON.parse(idsJson);
    const results = [];
    for (const nodeId of ids) {
      const node = findNode(tree.nodes, nodeId);
      if (!node) {
        results.push({ nodeId, ok: false, error: "not found" });
        continue;
      }
      node.status = "resolved";
      node.questions.push({ resolvedAt: new Date().toISOString(), answer: answerSummary });
      results.push({ nodeId, ok: true });
    }
    saveAndValidate();
    process.stdout.write(JSON.stringify({ ok: true, operation: "batch-resolve", results }) + "\n");
    break;
  }
  case "refine": {
    const [nodeId, newTitle] = args;
    const node = findNode(tree.nodes, nodeId);
    if (!node) { console.error(`Node not found: ${nodeId}`); process.exit(1); }
    node.title = newTitle;
    saveAndValidate();
    process.stdout.write(JSON.stringify({ ok: true, operation: "refine", nodeId, newTitle }) + "\n");
    break;
  }
  case "show": {
    process.stdout.write(JSON.stringify(tree, null, 2) + "\n");
    break;
  }
  case "delete": {
    const [nodeId] = args;
// [::TICKET::] PX-157, PX-158, PX-159 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-157|PX-158|PX-159) --for-spec --no-implementation-order`.
    function removeNode(nodes, id) {
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].id === id) {
          nodes.splice(i, 1);
          return true;
        }
        if (nodes[i].children?.length) {
          if (removeNode(nodes[i].children, id)) return true;
        }
      }
      return false;
    }
    if (!removeNode(tree.nodes, nodeId)) {
      console.error(`Node not found: ${nodeId}`);
      process.exit(1);
    }
    saveAndValidate();
    process.stdout.write(JSON.stringify({ ok: true, operation: "delete", nodeId }) + "\n");
    break;
  }
  case "settle": {
    const [nodeId, settlementJson] = args;
    const node = findNode(tree.nodes, nodeId);
    if (!node) { console.error(`Node not found: ${nodeId}`); process.exit(1); }
    const settlement = JSON.parse(settlementJson);
    // The gate runs here rather than a second copy of its rules: a point whose only
    // support is one of the four forbidden inferences is refused by name, and one
    // whose ground the run never read is not settled.
    const verdict = settlePoint({
      point: { id: nodeId },
      candidate: settlement,
      records: recordsOf(),
      inferences: settlement.inferences ?? [],
    });
    if (verdict.kind !== "settled") {
      console.error(`settle refused (${verdict.kind}): ${verdict.refusal ?? verdict.reason}`);
      process.exit(1);
    }
    node.status = "resolved";
    node.questions.push({
      resolvedAt: new Date().toISOString(),
      answer: verdict.decision,
      decision: verdict.decision,
      ground: verdict.ground,
      override: verdict.override,
      source: "ai",
    });
    saveAndValidate();
    process.stdout.write(JSON.stringify({ ok: true, operation: "settle", nodeId }) + "\n");
    break;
  }
  case "bind": {
    const [numberText, blockJson] = args;
    const block = JSON.parse(blockJson);
    const refusal = refuseBlock(block);
    if (refusal) { console.error(refusal); process.exit(1); }
    ensureQuestions();
    const number = Number(numberText);
    const existing = tree.questions.find((entry) => entry.number === number);
    const filled = {
      number,
      boundNodeIds: block.boundNodeIds,
      scopeLine: typeof block.scopeLine === "string" ? block.scopeLine : "",
      settleTrace: typeof block.settleTrace === "string" ? block.settleTrace : "",
      framing: block.framing ?? { context: "", conclusion: "", settled: "", remainder: "" },
      choice: block.choice ?? { directions: [], recommendation: "", overturning: "" },
      answer: null,
    };
    if (existing) Object.assign(existing, filled);
    else tree.questions.push(filled);
    tree.questions.sort((left, right) => left.number - right.number);
    saveAndValidate();
    process.stdout.write(JSON.stringify({ ok: true, operation: "bind", number }) + "\n");
    break;
  }
  case "answer": {
    const [numberText, reply] = args;
    ensureQuestions();
    const block = tree.questions.find((entry) => entry.number === Number(numberText));
    if (!block) { console.error(`Question not found: ${numberText}`); process.exit(1); }
    const refined = refineLetterlessAnswer({ reply });
    if (!refined.answered) {
      console.error(
        `answer refused: the reply carries no letter, so it does not answer Q${block.number}. ` +
          `What it raised — "${refined.raised.origin}" — is a point: refine it into a node and settle or bind that.`,
      );
      process.exit(1);
    }
    block.answer = reply;
    saveAndValidate();
    process.stdout.write(JSON.stringify({ ok: true, operation: "answer", number: block.number }) + "\n");
    break;
  }
  case "blocks": {
    process.stdout.write(JSON.stringify({ ok: true, operation: "blocks", questions: tree.questions ?? [] }) + "\n");
    break;
  }
  case "open-count": {
    const count = countOpen(tree.nodes);
    process.stdout.write(JSON.stringify({ openCount: count }) + "\n");
    break;
  }
  default:
    console.error(`Unknown operation: ${operation}`);
    process.exit(1);
}
