#!/usr/bin/env node
/**
 * update-tree.js <rfc-dir> <operation> [args...]
 *
 * Operations:
 *   add            '<node_json>'                        - ルートにノードを追加
 *   add-child      '<parent_id>' '<node_json>'          - 親ノードに子を追加
 *   resolve        '<node_id>'  '<answer_summary>'      - ノードをresolvedにして回答を記録
 *   batch-resolve  '<["id1","id2",...]>' '<answer>'     - 複数ノードを一括resolve
 *   refine         '<node_id>'  '<new_title>'           - ノードのタイトルを更新（洗練）
 *   delete         '<node_id>'                          - ノードとその子孫をすべて削除
 *   show                                                - 現在のツリーをSTDOUTに出力
 *   open-count                                          - status:open のノード数を出力
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

function findNode(nodes, id) {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children?.length) {
      const found = findNode(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

function countOpen(nodes) {
  let count = 0;
  for (const n of nodes) {
    if (n.status === "open") count++;
    if (n.children?.length) count += countOpen(n.children);
  }
  return count;
}

function save() {
  tree.updatedAt = new Date().toISOString();
  fs.writeFileSync(treePath, JSON.stringify(tree, null, 2), "utf-8");
}

function saveAndValidate() {
  save();
  const errors = validateAll(path.resolve(rfcDir));
  if (errors.length > 0) {
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
    console.log(JSON.stringify({ ok: true, operation: "add", nodeId: node.id }));
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
    console.log(JSON.stringify({ ok: true, operation: "add-child", parentId, nodeId: node.id }));
    break;
  }
  case "resolve": {
    const [nodeId, answerSummary] = args;
    const node = findNode(tree.nodes, nodeId);
    if (!node) { console.error(`Node not found: ${nodeId}`); process.exit(1); }
    node.status = "resolved";
    node.questions.push({ resolvedAt: new Date().toISOString(), answer: answerSummary });
    saveAndValidate();
    console.log(JSON.stringify({ ok: true, operation: "resolve", nodeId }));
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
    console.log(JSON.stringify({ ok: true, operation: "batch-resolve", results }));
    break;
  }
  case "refine": {
    const [nodeId, newTitle] = args;
    const node = findNode(tree.nodes, nodeId);
    if (!node) { console.error(`Node not found: ${nodeId}`); process.exit(1); }
    node.title = newTitle;
    saveAndValidate();
    console.log(JSON.stringify({ ok: true, operation: "refine", nodeId, newTitle }));
    break;
  }
  case "show": {
    console.log(JSON.stringify(tree, null, 2));
    break;
  }
  case "delete": {
    const [nodeId] = args;
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
    console.log(JSON.stringify({ ok: true, operation: "delete", nodeId }));
    break;
  }
  case "open-count": {
    const count = countOpen(tree.nodes);
    console.log(JSON.stringify({ openCount: count }));
    break;
  }
  default:
    console.error(`Unknown operation: ${operation}`);
    process.exit(1);
}
