#!/usr/bin/env node
/**
 * tree-query.js <session-dir> <operation> [args...]
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

const [,, sessionDir, operation, ...args] = process.argv;
if (!sessionDir || !operation) {
  console.error("Usage: tree-query.js <session-dir> <operation> [args...]");
  process.exit(1);
}

const treePath = path.join(path.resolve(sessionDir), "DesignTree.json");
if (!fs.existsSync(treePath)) {
  console.error(`DesignTree.json not found: ${treePath}`);
  process.exit(1);
}

const tree = JSON.parse(fs.readFileSync(treePath, "utf-8"));

// ─── Helpers ───

// [::TICKET::] PX-159, PX-158 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-159|PX-158) --for-spec --no-implementation-order`.
function findNodeWithPath(nodes, id, trail = []) {
  for (let i = 0; i < nodes.length; i++) {
    const trailPath = [...trail, nodes[i]];
    if (nodes[i].id === id) return trailPath;
    if (nodes[i].children?.length) {
      const found = findNodeWithPath(nodes[i].children, id, trailPath);
      if (found) return found;
    }
  }
  return null;
}

// [::TICKET::] PX-159, PX-158 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-159|PX-158) --for-spec --no-implementation-order`.
function countNodes(nodes) {
  return nodes.reduce((acc, n) => acc + 1 + countNodes(n.children || []), 0);
}

// [::TICKET::] PX-159, PX-158 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-159|PX-158) --for-spec --no-implementation-order`.
function countStatus(nodes, status) {
  return nodes.reduce(
    (acc, n) => acc + (n.status === status ? 1 : 0) + countStatus(n.children || [], status),
    0,
  );
}

// [::TICKET::] PX-159, PX-158 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-159|PX-158) --for-spec --no-implementation-order`.
function maxDepth(nodes, depth = 1) {
  return nodes.reduce(
    (acc, n) => Math.max(acc, n.children?.length ? maxDepth(n.children, depth + 1) : depth),
    depth,
  );
}

const BADGE = { open: "🔲", resolved: "✅" };

// ─── Render operations ───

// [::TICKET::] PX-159, PX-158 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-159|PX-158) --for-spec --no-implementation-order`.
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

// [::TICKET::] PX-159, PX-158 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-159|PX-158) --for-spec --no-implementation-order`.
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
    process.stdout.write(`📋 DesignTree (${total} nodes: ${open} open, ${resolved} resolved)` + "\n");
    process.stdout.write(renderTree(tree.nodes) + "\n");
    break;
  }

  // ── search ──
  case "search": {
    const keyword = args[0];
    if (!keyword) {
      console.error("Usage: tree-query.js <session-dir> search <keyword>");
      process.exit(1);
    }
    const kw = keyword.toLowerCase();
    const results = [];
// [::TICKET::] PX-159, PX-158 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-159|PX-158) --for-spec --no-implementation-order`.
    function searchNodes(nodes) {
      for (const node of nodes) {
        if (node.id.toLowerCase().includes(kw) || node.title.toLowerCase().includes(kw)) {
          results.push({ id: node.id, title: node.title, status: node.status });
        }
        if (node.children?.length) searchNodes(node.children);
      }
    }
    searchNodes(tree.nodes);
    if (results.length === 0) {
      process.stdout.write(`🔍 No nodes match "${keyword}"` + "\n");
    } else {
      process.stdout.write(`🔍 Search results for "${keyword}" (${results.length}):` + "\n");
      results.forEach((result) => process.stdout.write(`  [${BADGE[result.status]}] ${result.id}: ${result.title}` + "\n"));
    }
    break;
  }

  // ── path ──
  case "path": {
    const nodeId = args[0];
    if (!nodeId) {
      console.error("Usage: tree-query.js <session-dir> path <node-id>");
      process.exit(1);
    }
    const found = findNodeWithPath(tree.nodes, nodeId);
    if (!found) {
      process.stdout.write(`📍 Node "${nodeId}" not found` + "\n");
    } else {
      process.stdout.write(`📍 Path to ${nodeId}:` + "\n");
      process.stdout.write(renderPath(found) + "\n");
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
    process.stdout.write(`📊 DesignTree Stats` + "\n");
    process.stdout.write(`  Total Nodes: ${total}` + "\n");
    process.stdout.write(`  Open: ${open}` + "\n");
    process.stdout.write(`  Resolved: ${resolved}` + "\n");
    process.stdout.write(`  Max Depth: ${depth}` + "\n");
    process.stdout.write(`  Top-Level Sections: ${tree.nodes.length}` + "\n");
    process.stdout.write(`  Progress: ${progress}%` + "\n");
    break;
  }

  default:
    console.error(`Unknown operation: ${operation}. Valid: tree, search, path, stats`);
    process.exit(1);
}
