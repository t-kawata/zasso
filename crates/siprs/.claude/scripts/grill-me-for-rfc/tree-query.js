#!/usr/bin/env node
/**
 * tree-query.js <rfc-dir> <operation> [args...]
 *
 * DesignTree を可読性高く表示・検索する読み取り専用スクリプト。
 * ツリー描画・検索・パス表示・統計を提供し、AI が生JSONを読む代わりに
 * 構造を一目で把握できるようにする。
 *
 * Operations:
 *   tree                    - ツリー構造を階層表示（open/resolved バッジ付き）
 *   search <keyword>        - ノードタイトルまたはIDから部分一致検索
 *   path <node-id>          - ルートから指定ノードまでの経路を表示
 *   stats                   - 統計情報（総数/open/resolved/深度/進行度）を表示
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

// ─── ヘルパー ───

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

// ─── 各操作の描画処理 ───

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
    console.log(`📋 DesignTree（${total} ノード: ${open} open, ${resolved} resolved）`);
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
      console.log(`🔍 "${keyword}" に一致するノードはありません`);
    } else {
      console.log(`🔍 "${keyword}" の検索結果（${results.length}件）:`);
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
      console.log(`📍 ノード "${nodeId}" は見つかりませんでした`);
    } else {
      console.log(`📍 ${nodeId} までのパス:`);
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
    console.log(`📊 DesignTree 統計`);
    console.log(`  総ノード数: ${total}`);
    console.log(`  Open: ${open}`);
    console.log(`  Resolved: ${resolved}`);
    console.log(`  最大深度: ${depth}`);
    console.log(`  トップレベルセクション: ${tree.nodes.length}`);
    console.log(`  進行度: ${progress}%`);
    break;
  }

  default:
    console.error(`Unknown operation: ${operation}. Valid: tree, search, path, stats`);
    process.exit(1);
}
