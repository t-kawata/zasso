#!/usr/bin/env node
/**
 * update-tree.js <rfc-dir> <operation> [args...]
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

const [,, rfcDir, operation, ...args] = process.argv;
if (!rfcDir || !operation) {
  console.error("Usage: update-tree.js <rfc-dir> <operation> [args...]");
  process.exit(1);
}

const treePath = path.join(path.resolve(rfcDir), "DesignTree.json");
if (!fs.existsSync(treePath)) {
  console.error(`DesignTree.json not found: ${treePath}`);
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
  const errors = validateAll(path.resolve(rfcDir));
  if (errors.length > 0) {
    fs.writeFileSync(treePath, previousContent, "utf-8");
    console.error(JSON.stringify({ ok: false, phase: "schema-validation", errors }, null, 2));
    process.exit(1);
  }
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
  case "open-count": {
    const count = countOpen(tree.nodes);
    process.stdout.write(JSON.stringify({ openCount: count }) + "\n");
    break;
  }
  default:
    console.error(`Unknown operation: ${operation}`);
    process.exit(1);
}
