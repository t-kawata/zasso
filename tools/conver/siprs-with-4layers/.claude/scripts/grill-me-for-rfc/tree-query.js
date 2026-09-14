#!/usr/bin/env node
/**
 * tree-query.js <rfc-dir> <operation> [args...]
 *
 * A read-only script to display and search the DesignTree with high readability.
 * Provides tree rendering, search, path display, and statistics so the AI can
 * grasp the structure at a glance instead of reading raw JSON.
 *
 * Operations:
 *   tree                    - Display tree structure hierarchically (with open/resolved badges)
 *   search <keyword>        - Partial-match search by node title or ID
 *   path <node-id>          - Display the path from root to the specified node
 *   stats                   - Display statistics (total/open/resolved/depth/progress)
 */
import fs from "fs";
import path from "path";

const [,, rfcDir, operation, ...args] = process.argv;
if (!rfcDir || !operation) {
  console.error("Usage: tree-query.js <rfc-dir> <operation> [args...]");
  process.exit(1);
}

const treePath = path.join(path.resolve(rfcDir), "DesignTree.json");
if (!fs.existsSync(treePath)) {
  console.error(`DesignTree.json not found: ${treePath}`);
  process.exit(1);
}

const tree = JSON.parse(fs.readFileSync(treePath, "utf-8"));

// ─── Helpers ───

function findNodeWithPath(nodes, id, trail = []) {
  for (let i = 0; i < nodes.length; i++) {
    const p = [...trail, nodes[i]];
    if (nodes[i].id === id) return p;
    if (nodes[i].children?.length) {
      const found = findNodeWithPath(nodes[i].children, id, p);
      if (found) return found;
    }
  }
  return null;
}

function countNodes(nodes) {
  return nodes.reduce((acc, n) => acc + 1 + countNodes(n.children || []), 0);
}

function countStatus(nodes, status) {
  return nodes.reduce(
    (acc, n) => acc + (n.status === status ? 1 : 0) + countStatus(n.children || [], status),
    0,
  );
}

function maxDepth(nodes, depth = 1) {
  return nodes.reduce(
    (acc, n) => Math.max(acc, n.children?.length ? maxDepth(n.children, depth + 1) : depth),
    depth,
  );
}

const BADGE = { open: "🔲", resolved: "✅" };

// ─── Render operations ───

function renderTree(nodes, prefix = "") {
  return nodes
    .map((node, i) => {
      const isLast = i === nodes.length - 1;
      const connector = isLast ? "└── " : "├── ";
      const badge = BADGE[node.status] || "🔲";
      const line = `${prefix}${connector}[${badge}] ${node.id}: ${node.title}`;
      const childPrefix = prefix + (isLast ? "    " : "│   ");
      const children = node.children?.length ? renderTree(node.children, childPrefix) : "";
      return line + (children ? "\n" + children : "");
    })
    .join("\n");
}

function renderPath(pathNodes) {
  return pathNodes
    .map((n, i) => {
      const indent = "  ".repeat(i);
      const badge = BADGE[n.status] || "🔲";
      const marker = i === pathNodes.length - 1 ? "└── " : "├── ";
      return `${indent}${marker}[${badge}] ${n.id}: ${n.title}`;
    })
    .join("\n");
}

switch (operation) {
  // ── tree ──
  case "tree": {
    const total = countNodes(tree.nodes);
    const open = countStatus(tree.nodes, "open");
    const resolved = countStatus(tree.nodes, "resolved");
    console.log(`📋 DesignTree (${total} nodes: ${open} open, ${resolved} resolved)`);
    console.log(renderTree(tree.nodes));
    break;
  }

  // ── search ──
  case "search": {
    const keyword = args[0];
    if (!keyword) {
      console.error("Usage: tree-query.js <rfc-dir> search <keyword>");
      process.exit(1);
    }
    const kw = keyword.toLowerCase();
    const results = [];
    function searchNodes(nodes) {
      for (const n of nodes) {
        if (n.id.toLowerCase().includes(kw) || n.title.toLowerCase().includes(kw)) {
          results.push({ id: n.id, title: n.title, status: n.status });
        }
        if (n.children?.length) searchNodes(n.children);
      }
    }
    searchNodes(tree.nodes);
    if (results.length === 0) {
      console.log(`🔍 No nodes match "${keyword}"`);
    } else {
      console.log(`🔍 Search results for "${keyword}" (${results.length}):`);
      results.forEach((r) => console.log(`  [${BADGE[r.status]}] ${r.id}: ${r.title}`));
    }
    break;
  }

  // ── path ──
  case "path": {
    const nodeId = args[0];
    if (!nodeId) {
      console.error("Usage: tree-query.js <rfc-dir> path <node-id>");
      process.exit(1);
    }
    const found = findNodeWithPath(tree.nodes, nodeId);
    if (!found) {
      console.log(`📍 Node "${nodeId}" not found`);
    } else {
      console.log(`📍 Path to ${nodeId}:`);
      console.log(renderPath(found));
    }
    break;
  }

  // ── stats ──
  case "stats": {
    const total = countNodes(tree.nodes);
    const open = countStatus(tree.nodes, "open");
    const resolved = countStatus(tree.nodes, "resolved");
    const depth = maxDepth(tree.nodes);
    const progress = total > 0 ? Math.round((resolved / total) * 100) : 0;
    console.log(`📊 DesignTree Stats`);
    console.log(`  Total Nodes: ${total}`);
    console.log(`  Open: ${open}`);
    console.log(`  Resolved: ${resolved}`);
    console.log(`  Max Depth: ${depth}`);
    console.log(`  Top-Level Sections: ${tree.nodes.length}`);
    console.log(`  Progress: ${progress}%`);
    break;
  }

  default:
    console.error(`Unknown operation: ${operation}. Valid: tree, search, path, stats`);
    process.exit(1);
}
