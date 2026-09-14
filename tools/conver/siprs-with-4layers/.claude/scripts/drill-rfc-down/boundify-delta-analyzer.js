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
 * Generates boundify-candidates.json (the candidates the AI designs from) and
 * NEVER writes to *-Dirs-Tree.json or src — the write happens only after the AI
 * engineering-expert approves the staged plan. The AI's design is recorded in
 * dirs-tree-delta.json by boundify-step.js --approve (the Step 4 handoff).
 *
 * Exit codes: 0 = success, 1 = failure (missing args, malformed graph-delta).
 *
 * Design context: tools/conver/README.md — 進化ループ / /drill-rfc-down (Step 3).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { emptyAdvisory } from './advisory-report.js';

const DEFAULT_EXTENSION = { rust: '.rs', typescript: '.ts', javascript: '.js', python: '.py', go: '.go', swift: '.swift' };

/** Prose node kinds that must be excluded from src file generation (本家 rule). */
const PROSE_KINDS = ['rationale', 'glossary', 'requirement'];

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

/**
 * Validate the generated candidates structure and return English error messages.
 * Returns an empty array when valid. modifiedFiles.path may be null for an
 * unmapped node (the AI decides where to place it), so only nodeId is required.
 */
// [::TICKET::] PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function validateCandidates(candidates) {
  const errors = [];
  const requireFields = (items, pathPrefix, required) => {
    for (const item of items || []) {
      for (const field of required) {
        if (!item[field] || (Array.isArray(item[field]) && item[field].length === 0)) {
          errors.push(`${pathPrefix} item is missing required field "${field}"`);
        }
      }
    }
  };
  requireFields(candidates.newFiles, 'newFiles', ['path', 'kind']);
  requireFields(candidates.modifiedFiles, 'modifiedFiles', ['nodeId']);
  requireFields(candidates.srcDrift, 'srcDrift', ['path', 'kind']);
  requireFields(candidates.dependencyDirs, 'dependencyDirs', ['from', 'to', 'type']);
  return errors;
}

/** Collect every file node (path + mappedNodeIds) from a Dirs-Tree branch. */
// [::TICKET::] PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function collectDirsTreeFiles(node, prefix, acc) {
  const currentPath = prefix ? `${prefix}/${node.name}` : node.name;
  acc.push({ path: currentPath, node });
  for (const child of node.children || []) {
    collectDirsTreeFiles(child, currentPath, acc);
  }
  return acc;
}

/** Collect every Dirs-Tree file across all language trees. */
// [::TICKET::] PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function collectDirsTreeFilesFromTrees(trees) {
  const acc = [];
  for (const lang of Object.keys(trees)) {
    collectDirsTreeFiles(trees[lang], '', acc);
  }
  return acc;
}

/** A danger finding: a new file candidate path collides with an existing Dirs-Tree file. */
// [::TICKET::] PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function flagPathCollisions(newFiles, dirsTree) {
  const existing = new Set(collectDirsTreeFilesFromTrees(dirsTree.trees || {}).map((f) => f.path));
  return (newFiles || [])
    .filter((f) => existing.has(f.path))
    .map((f) => ({ message: `new file candidate "${f.path}" collides with an existing Dirs-Tree file; choose a distinct path` }));
}

/** A danger finding: the proposed new edges contain a dependency cycle (node level). */
// [::TICKET::] PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function flagDependencyCycles(newEdges) {
  const out = new Map();
  for (const edge of newEdges || []) {
    if (!out.has(edge.from)) out.set(edge.from, []);
    out.get(edge.from).push(edge.to);
  }
  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  const findings = [];
// [::TICKET::] PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
  function visit(node) {
    if (visited.has(node)) return;
    if (visiting.has(node)) {
      const cycleStart = stack.indexOf(node);
      const cycle = stack.slice(cycleStart).concat(node).join(' -> ');
      findings.push({ message: `circular dependency detected among new edges: ${cycle}; examine whether the dependency direction is truly bidirectional` });
      return;
    }
    visiting.add(node);
    stack.push(node);
    for (const next of out.get(node) || []) visit(next);
    stack.pop();
    visiting.delete(node);
    visited.add(node);
  }
  for (const node of out.keys()) visit(node);
  return findings;
}

/** An omission finding: a GRAPH node is unmapped to any Dirs-Tree file and has no new-file candidate. */
// [::TICKET::] PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function flagUnmappedGraphNodes(graph, dirsTree, newFiles) {
  if (!graph) return [];
  const mapped = new Set(collectDirsTreeFilesFromTrees(dirsTree.trees || {})
    .flatMap((f) => (f.node.mappedNodeIds || []).map((m) => m.nodeId)));
  const proposed = new Set((newFiles || []).map((f) => f.nodeId));
  return (graph.nodes || [])
    .filter((n) => !PROSE_KINDS.includes(n.kind))
    .filter((n) => !mapped.has(n.id) && !proposed.has(n.id))
    .map((n) => ({ message: `graph node ${n.id} "${n.title}" is not mapped to any Dirs-Tree file and has no new-file candidate; decide its placement` }));
}

/** A contradiction finding: a Dirs-Tree file kind differs from its mapped GRAPH node kind. */
// [::TICKET::] PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function flagKindMismatches(graph, dirsTree) {
  if (!graph) return [];
  const nodeByKind = new Map((graph.nodes || []).map((n) => [n.id, n.kind]));
  const findings = [];
  for (const file of collectDirsTreeFilesFromTrees(dirsTree.trees || {})) {
    for (const mapping of file.node.mappedNodeIds || []) {
      const graphKind = nodeByKind.get(mapping.nodeId);
      if (graphKind && file.node.kind !== graphKind) {
        findings.push({ message: `Dirs-Tree file "${file.path}" kind "${file.node.kind}" differs from graph node ${mapping.nodeId} kind "${graphKind}"; reconcile them` });
      }
    }
  }
  return findings;
}

/** A deficiency finding: a Prose node (rationale/glossary/requirement) is proposed as a src file. */
// [::TICKET::] PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function flagProseExclusions(graph, dirsTree, newFiles) {
  if (!graph) return [];
  const proseIds = new Set((graph.nodes || []).filter((n) => PROSE_KINDS.includes(n.kind)).map((n) => n.id));
  const findings = [];
  for (const file of collectDirsTreeFilesFromTrees(dirsTree.trees || {})) {
    for (const mapping of file.node.mappedNodeIds || []) {
      if (proseIds.has(mapping.nodeId)) {
        findings.push({ message: `Prose node ${mapping.nodeId} "${mapping.title || ''}" (${graph.nodes.find((n) => n.id === mapping.nodeId)?.kind}) is mapped to src file "${file.path}"; Prose nodes should be excluded from src` });
      }
    }
  }
  for (const fileCandidate of newFiles || []) {
    if (proseIds.has(fileCandidate.nodeId)) {
      findings.push({ message: `new file candidate "${fileCandidate.path}" maps a Prose node (${fileCandidate.kind}); exclude it from src file generation` });
    }
  }
  return findings;
}

/** A deficiency finding: a new file candidate has no declaration stub in src yet. */
// [::TICKET::] PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function flagMissingDeclarationStubs(newFiles, srcDir) {
  const srcSet = new Set(collectSrcFiles(srcDir, '', []));
  return (newFiles || [])
    .filter((f) => !srcSet.has(f.path))
    .map((f) => ({ message: `new file candidate "${f.path}" has no declaration stub in src yet; create it before approve` }));
}

/**
 * Mechanically inspect the candidates on the four axes (danger / omission /
 * contradiction / deficiency) as an advisory for the AI. Advisory-only: the
 * findings never block promote. graph-dependent checks run only when --graph is
 * provided (otherwise those axes may be empty).
 */
// [::TICKET::] PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function inspectCandidates(graphDelta, candidates, graph, dirsTree, srcDir) {
  const advisory = emptyAdvisory();
  advisory.danger = [
    ...flagPathCollisions(candidates.newFiles, dirsTree),
    ...flagDependencyCycles(graphDelta.newEdges),
  ];
  advisory.omission = flagUnmappedGraphNodes(graph, dirsTree, candidates.newFiles);
  advisory.contradiction = flagKindMismatches(graph, dirsTree);
  advisory.deficiency = [
    ...flagProseExclusions(graph, dirsTree, candidates.newFiles),
    ...flagMissingDeclarationStubs(candidates.newFiles, srcDir),
  ];
  return advisory;
}

// [::TICKET::] PX-161, PX-162, PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-161|PX-162|PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  let graphDeltaPath = '';
  let dirsTreePath = '';
  let srcDir = '';
  let outPath = '';
  let graphPath = '';
  for (const arg of args) {
    if (arg.startsWith('--graph-delta=')) graphDeltaPath = arg.slice('--graph-delta='.length);
    else if (arg.startsWith('--dirs-tree=')) dirsTreePath = arg.slice('--dirs-tree='.length);
    else if (arg.startsWith('--src=')) srcDir = arg.slice('--src='.length);
    else if (arg.startsWith('--out=')) outPath = arg.slice('--out='.length);
    else if (arg.startsWith('--graph=')) graphPath = arg.slice('--graph='.length);
  }
  if (!graphDeltaPath || !dirsTreePath || !srcDir || !outPath) {
    console.error('Usage: boundify-delta-analyzer.js --graph-delta=<path> --dirs-tree=<path> --src=<dir> --out=<path> [--graph=<path>]');
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

  // The source graph is optional; when provided the graph-dependent advisory
  // checks (unmapped nodes, kind mismatches, Prose exclusions) are enabled.
  let graph = null;
  if (graphPath) {
    try {
      graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
    } catch (e) {
      console.error(`[ERROR] boundify-delta-analyzer: invalid graph: ${e.message}`);
      process.exit(1);
    }
  }

  // The candidates are fully deterministic (no timestamp) so repeated analysis
  // of identical inputs yields byte-identical output. The output is INFORMATION
  // for the AI; it is never applied directly.
  const candidates = {
    sourceFile: graphDelta.sourceFile || dirsTree.sourceFile || '',
    ...analyzeDirsTreeDelta(graphDelta, dirsTree, srcDir),
  };
  // Mechanically inspect the candidates on the four axes (danger / omission /
  // contradiction / deficiency) as an advisory for the AI. Advisory-only.
  candidates.advisory = inspectCandidates(graphDelta, candidates, graph, dirsTree, srcDir);
  // Guarantee the output is always valid JSON with the expected shape; on
  // failure emit a natural-language English Error/Cause/Action and exit 1.
  const validationErrors = validateCandidates(candidates);
  if (validationErrors.length > 0) {
    console.error('[ERROR] boundify-delta-analyzer: generated candidates failed schema validation');
    console.error('Cause: ' + validationErrors.join('; '));
    console.error('Action: fix the candidate generation so every candidate carries its required fields, then re-run.');
    process.exit(1);
  }
  fs.writeFileSync(outPath, JSON.stringify(candidates, null, 2) + '\n', 'utf8');
  process.stdout.write(JSON.stringify({ ok: true, ...candidates }) + '\n');
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
  validateCandidates,
  flagPathCollisions,
  flagDependencyCycles,
  flagUnmappedGraphNodes,
  flagKindMismatches,
  flagProseExclusions,
  flagMissingDeclarationStubs,
  inspectCandidates,
  main,
};
