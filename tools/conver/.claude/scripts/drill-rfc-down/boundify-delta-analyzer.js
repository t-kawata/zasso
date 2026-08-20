#!/usr/bin/env node
/**
 * boundify-delta-analyzer.js --graph-delta=<path> --dirs-tree=<path> --src=<dir> --out=<path>
 *
 * /drill-rfc-down Step 3 boundify delta analyzer (PX-161).
 *
 * Reads Step 2 graph-delta.json, the existing *-Dirs-Tree.json, and the real
 * src directory tree, and deterministically proposes the Dirs-Tree + src
 * evolution candidates:
 *   - newFiles:     a file candidate for each new graph node
 *   - modifiedFiles: the file mapped to each modified node
 *   - srcDrift:     files in the Dirs-Tree absent from src (missing) and files
 *                   in src absent from the Dirs-Tree (extra)
 *   - dependencyDirs: dependency-direction candidates for new edges
 *
 * Generates dirs-tree-delta.json (the lockstep handoff for Step 4 split) and
 * NEVER writes to *-Dirs-Tree.json or src — the write happens only after the AI
 * engineering-expert approves the dry-run plan.
 *
 * Exit codes: 0 = success, 1 = failure (missing args, malformed graph-delta).
 *
 * Design context: tools/conver/README.md — 進化ループ / /drill-rfc-down (Step 3).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DEFAULT_EXTENSION = { rust: '.rs', typescript: '.ts', javascript: '.js', python: '.py', go: '.go', swift: '.swift' };

/** Collect every file (path + mappedNodeIds) from a Dirs-Tree branch. */
// [::TICKET::] PX-161, PX-162 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-161|PX-162) --for-spec --no-implementation-order`.
function collectTreeFiles(node, prefix, acc) {
  const currentPath = prefix ? `${prefix}/${node.name}` : node.name;
  if (node.type === 'file') {
    acc.push({ path: currentPath, mappedNodeIds: node.mappedNodeIds || [] });
  }
  for (const child of node.children || []) {
    collectTreeFiles(child, currentPath, acc);
  }
  return acc;
}

/** Collect every regular file path under a src directory (relative to root). */
// [::TICKET::] PX-161, PX-162 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-161|PX-162) --for-spec --no-implementation-order`.
function collectSrcFiles(dir, prefix, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const currentPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSrcFiles(fullPath, currentPath, acc);
    } else if (entry.isFile()) {
      acc.push(currentPath);
    }
  }
  return acc;
}

/** Detect drift between the Dirs-Tree file list and the real src file list. */
// [::TICKET::] PX-161, PX-162 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-161|PX-162) --for-spec --no-implementation-order`.
function detectSrcDrift(treeFiles, srcFiles) {
  const srcSet = new Set(srcFiles);
  const treeSet = new Set(treeFiles.map((f) => f.path));
  const missing = treeFiles
    .map((f) => f.path)
    .filter((p) => !srcSet.has(p))
    .map((p) => ({ path: p, kind: 'missing' }));
  const extra = srcFiles
    .filter((p) => !treeSet.has(p))
    .map((p) => ({ path: p, kind: 'extra' }));
  return [...missing, ...extra];
}

/** Propose a new file candidate for each new graph node. */
// [::TICKET::] PX-161, PX-162 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-161|PX-162) --for-spec --no-implementation-order`.
function proposeNewFileCandidates(newNodes, dirsTree) {
  const languages = Object.keys(dirsTree.trees || {});
  const language = languages[0] || '';
  const rootName = language ? (dirsTree.trees[language].name || 'src') : 'src';
  const ext = DEFAULT_EXTENSION[language] || '';
  return (newNodes || []).map((node) => ({
    path: `${rootName}/${node.slug}${ext}`,
    kind: node.kind,
    nodeId: node.id,
    title: node.title,
  }));
}

/** Find the file mapped to each modified node in the Dirs-Tree. */
// [::TICKET::] PX-161, PX-162 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-161|PX-162) --for-spec --no-implementation-order`.
function proposeModifyCandidates(modifiedNodes, treeFiles) {
  return (modifiedNodes || []).map((mod) => {
    const mapped = treeFiles.find((f) => f.mappedNodeIds.some((m) => m.nodeId === mod.id));
    return {
      nodeId: mod.id,
      path: mapped ? mapped.path : null,
      changes: mod.changes,
    };
  });
}

/** Propose dependency-direction candidates for new edges. */
// [::TICKET::] PX-161, PX-162 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-161|PX-162) --for-spec --no-implementation-order`.
function proposeDependencyDirs(newEdges) {
  return (newEdges || []).map((edge) => ({
    from: edge.from,
    to: edge.to,
    type: edge.type,
  }));
}

/**
 * Propose the Dirs-Tree + src evolution candidates deterministically.
 * Returns { newFiles, modifiedFiles, srcDrift, dependencyDirs }.
 */
// [::TICKET::] PX-161, PX-162 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-161|PX-162) --for-spec --no-implementation-order`.
function analyzeDirsTreeDelta(graphDelta, dirsTree, srcDir) {
  const treeFiles = collectTreeFilesFromTrees(dirsTree.trees || {});
  const srcFiles = collectSrcFiles(srcDir, '', []);
  return {
    newFiles: proposeNewFileCandidates(graphDelta.newNodes, dirsTree),
    modifiedFiles: proposeModifyCandidates(graphDelta.modifiedNodes, treeFiles),
    srcDrift: detectSrcDrift(treeFiles, srcFiles),
    dependencyDirs: proposeDependencyDirs(graphDelta.newEdges),
  };
}

/** Collect all file paths from the per-language Dirs-Tree trees. */
// [::TICKET::] PX-161, PX-162 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-161|PX-162) --for-spec --no-implementation-order`.
function collectTreeFilesFromTrees(trees) {
  const acc = [];
  for (const lang of Object.keys(trees)) {
    collectTreeFiles(trees[lang], '', acc);
  }
  return acc;
}

// [::TICKET::] PX-161, PX-162 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-161|PX-162) --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  let graphDeltaPath = '';
  let dirsTreePath = '';
  let srcDir = '';
  let outPath = '';
  for (const arg of args) {
    if (arg.startsWith('--graph-delta=')) graphDeltaPath = arg.slice('--graph-delta='.length);
    else if (arg.startsWith('--dirs-tree=')) dirsTreePath = arg.slice('--dirs-tree='.length);
    else if (arg.startsWith('--src=')) srcDir = arg.slice('--src='.length);
    else if (arg.startsWith('--out=')) outPath = arg.slice('--out='.length);
  }
  if (!graphDeltaPath || !dirsTreePath || !srcDir || !outPath) {
    console.error('Usage: boundify-delta-analyzer.js --graph-delta=<path> --dirs-tree=<path> --src=<dir> --out=<path>');
    process.exit(1);
  }

  let graphDelta;
  try {
    graphDelta = JSON.parse(fs.readFileSync(graphDeltaPath, 'utf8'));
  } catch (e) {
    console.error(`[ERROR] boundify-delta-analyzer: invalid graph-delta.json: ${e.message}`);
    process.exit(1);
  }
  let dirsTree;
  try {
    dirsTree = JSON.parse(fs.readFileSync(dirsTreePath, 'utf8'));
  } catch (e) {
    console.error(`[ERROR] boundify-delta-analyzer: invalid dirs-tree: ${e.message}`);
    process.exit(1);
  }
  if (!fs.existsSync(srcDir)) {
    console.error(`[ERROR] boundify-delta-analyzer: src directory not found: ${srcDir}`);
    process.exit(1);
  }

  // Fully deterministic output (no timestamp) so repeated analysis is identical.
  const dirsTreeDelta = {
    sourceFile: graphDelta.sourceFile || dirsTree.sourceFile || '',
    ...analyzeDirsTreeDelta(graphDelta, dirsTree, srcDir),
  };
  fs.writeFileSync(outPath, JSON.stringify(dirsTreeDelta, null, 2) + '\n', 'utf8');
  process.stdout.write(JSON.stringify({ ok: true, ...dirsTreeDelta }) + '\n');
}

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main();
}

export {
  collectTreeFiles,
  collectSrcFiles,
  detectSrcDrift,
  proposeNewFileCandidates,
  proposeModifyCandidates,
  proposeDependencyDirs,
  analyzeDirsTreeDelta,
  main,
};
