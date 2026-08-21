#!/usr/bin/env node
/**
 * boundify-step.js --dirs-tree=<path> --src=<dir> [--graph=<path>] [--graph-delta=<path>] [--stage|--approve|--reject]
 *
 * /drill-rfc-down Step 3 boundify step driver (PX-161, PX-164).
 *
 * The AI is the engineering expert who designs the Dirs-Tree + src evolution;
 * this driver only stages, validates, and promotes — it never applies an
 * analyzer plan.
 *
 *   --stage   copies the real Dirs-Tree to <dirsTree>.staging.json and shows the
 *             analyzer candidates (written to <dirsTree>.candidates.json) as an
 *             information aid. The real Dirs-Tree and src are left untouched.
 *             The AI then designs the evolution by editing the STAGING copy via
 *             dirs-tree-crud.js and by creating/editing src files directly.
 *   --approve validates the STAGING Dirs-Tree with validate-dirs-tree-schema,
 *             derives dirs-tree-delta.json (newFiles/modifiedFiles/srcDrift/
 *             dependencyDirs) by diffing the real Dirs-Tree against the staged
 *             graph, commits missing src stubs for new file nodes, and promotes
 *             the staging copy to the real Dirs-Tree. The analyzer is NOT re-run
 *             — the staged Dirs-Tree, which the AI crafted via dirs-tree-crud.js,
 *             is the plan.
 *   --reject  discards the staging copy; the real Dirs-Tree and src stay
 *             byte-identical (perfect-before-write gate).
 *
 * Destructive changes (file/directory removal or moves) are forbidden by
 * default — dirs-tree-crud.js --force is the only destructive path.
 *
 * Design context: tools/conver/README.md — 進化ループ / /drill-rfc-down (Step 3).
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'url';
import { buildAdvisoryReport } from './advisory-report.js';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ANALYZER = path.join(SCRIPT_DIR, 'boundify-delta-analyzer.js');
const VALIDATE = path.resolve(SCRIPT_DIR, '../rfc-graph/validate-dirs-tree-schema.js');

/** Spawn a node script and return the result. */
// [::TICKET::] PX-161, PX-162, PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-161|PX-162|PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function runNode(script, args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
}

/** The staging copy path the AI designs with dirs-tree-crud.js before --approve. */
// [::TICKET::] PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function stagingPathOf(dirsTreePath) {
  return `${dirsTreePath}.staging.json`;
}

/** The candidates file path written by --stage for the AI to consult. */
// [::TICKET::] PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function candidatesPathOf(dirsTreePath) {
  return `${dirsTreePath}.candidates.json`;
}

/** The pipeline handoff path written by --approve (Step 4 split consumes it). */
// [::TICKET::] PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function deltaPathOf(dirsTreePath) {
  return `${dirsTreePath}.delta.json`;
}

/** Collect every file node (path + node + mappedNodeIds) from a Dirs-Tree branch. */
// [::TICKET::] PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function collectFileNodes(node, prefix, acc) {
  const currentPath = prefix ? `${prefix}/${node.name}` : node.name;
  if (node.type === 'file') {
    acc.push({ path: currentPath, node });
  }
  for (const child of node.children || []) {
    collectFileNodes(child, currentPath, acc);
  }
  return acc;
}

/** Collect every file path under a src directory (relative to root). */
// [::TICKET::] PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
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

/** Detect drift between the staged Dirs-Tree file list and the real src file list. */
// [::TICKET::] PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
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

/** A stable identity for an edge used by the dependency-direction derivation. */
// [::TICKET::] PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function directionKey(direction) {
  return `${direction.from}->${direction.to}->${direction.type}`;
}

/**
 * Derive the Dirs-Tree evolution delta by diffing the real Dirs-Tree (before
 * promote) against the staged Dirs-Tree (the AI-crafted design). The result is
 * deterministic: it records exactly what the AI designed via dirs-tree-crud.js,
 * never the analyzer output.
 */
// [::TICKET::] PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function deriveDirsTreeDelta(beforeTree, stagedTree, srcDir) {
  const beforeFiles = new Map(collectTreeFilesFromTrees(beforeTree.trees || {}).map((f) => [f.path, f.node]));
  const stagedFiles = collectTreeFilesFromTrees(stagedTree.trees || {});
  const beforeDirections = new Set(collectDirections(beforeTree).map(directionKey));
  const stagedDirections = collectDirections(stagedTree);

  const newFiles = [];
  const modifiedFiles = [];
  for (const file of stagedFiles) {
    if (!beforeFiles.has(file.path)) {
      const first = file.node.mappedNodeIds?.[0] || {};
      newFiles.push({
        path: file.path,
        kind: file.node.kind,
        nodeId: first.nodeId || null,
        title: first.title || file.node.name,
      });
    } else if (JSON.stringify(beforeFiles.get(file.path)) !== JSON.stringify(file.node)) {
      const first = file.node.mappedNodeIds?.[0] || {};
      modifiedFiles.push({
        nodeId: first.nodeId || null,
        path: file.path,
        changes: { kind: file.node.kind, mappedNodeIds: file.node.mappedNodeIds || [] },
      });
    }
  }

  const treePaths = stagedFiles.map((f) => f.path);
  const srcFiles = collectSrcFiles(srcDir, '', []);
  const dependencyDirs = stagedDirections.filter((d) => !beforeDirections.has(directionKey(d)));

  return {
    sourceFile: beforeTree.sourceFile || stagedTree.sourceFile || '',
    newFiles,
    modifiedFiles,
    srcDrift: detectSrcDrift(treePaths.map((p) => ({ path: p })), srcFiles),
    dependencyDirs,
  };
}

/** Collect every file node across all language trees. */
// [::TICKET::] PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function collectTreeFilesFromTrees(trees) {
  const acc = [];
  for (const lang of Object.keys(trees)) {
    collectFileNodes(trees[lang], '', acc);
  }
  return acc;
}

/** Collect every dependency-direction entry across all language trees. */
// [::TICKET::] PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function collectDirections(dirsTree) {
  const acc = [];
  for (const lang of Object.keys(dirsTree.dependencyDirections || {})) {
    for (const direction of dirsTree.dependencyDirections[lang] || []) {
      acc.push({ ...direction, lang });
    }
  }
  return acc;
}

/** Format the candidate report from a candidates object (AI judgment aid). */
// [::TICKET::] PX-161, PX-162, PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-161|PX-162|PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function formatDirsTreeDeltaReport(candidates) {
  const lines = ['## /drill-rfc-down Step 3 Boundify Stage', ''];
  lines.push('### New file candidates (analyzer information, not the plan)');
  for (const fileCandidate of candidates.newFiles || []) {
    lines.push(`- ${fileCandidate.path} (kind: ${fileCandidate.kind}, node: ${fileCandidate.nodeId})`);
  }
  if (!candidates.newFiles || candidates.newFiles.length === 0) lines.push('- none');
  lines.push('');
  lines.push('### Modified file candidates');
  for (const modifiedFile of candidates.modifiedFiles || []) {
    lines.push(`- ${modifiedFile.path || '(unmapped)'} (node: ${modifiedFile.nodeId})`);
  }
  if (!candidates.modifiedFiles || candidates.modifiedFiles.length === 0) lines.push('- none');
  lines.push('');
  lines.push('### src drift');
  for (const drift of candidates.srcDrift || []) {
    lines.push(`- ${drift.path} (${drift.kind})`);
  }
  if (!candidates.srcDrift || candidates.srcDrift.length === 0) lines.push('- none');
  lines.push('');
  // The four-axis advisory (danger/omission/contradiction/deficiency) is a
  // mechanical inspection aid; it never blocks promote.
  if (candidates.advisory) {
    lines.push(buildAdvisoryReport(candidates.advisory));
  }
  lines.push('Design the evolution with dirs-tree-crud.js on the staging Dirs-Tree, then run --approve.');
  return lines.join('\n');
}

/** Emit an English Error/Cause/Action message and exit with status 1. */
// [::TICKET::] PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function failWithEnglishError(error, cause, action) {
  console.error(`[ERROR] boundify-step: ${error}`);
  console.error(`Cause: ${cause}`);
  console.error(`Action: ${action}`);
  process.exit(1);
}

/** Copy the real Dirs-Tree to the staging path so the AI can design via dirs-tree-crud. */
// [::TICKET::] PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function createStagingCopy(dirsTreePath) {
  fs.copyFileSync(dirsTreePath, stagingPathOf(dirsTreePath));
}

/** Run the analyzer to write the candidates file and return the parsed candidates. */
// [::TICKET::] PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function produceCandidates(dirsTreePath, srcDir, graphDeltaPath, graphPath) {
  const args = [`--graph-delta=${graphDeltaPath}`, `--dirs-tree=${dirsTreePath}`, `--src=${srcDir}`, `--out=${candidatesPathOf(dirsTreePath)}`];
  if (graphPath) args.push(`--graph=${graphPath}`);
  const analyzerResult = runNode(ANALYZER, args);
  if (analyzerResult.status !== 0) {
    process.stderr.write(analyzerResult.stderr || analyzerResult.stdout);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(candidatesPathOf(dirsTreePath), 'utf8'));
}

/** Validate the staging Dirs-Tree with validate-dirs-tree-schema. */
// [::TICKET::] PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function verifyStagingDirsTree(dirsTreePath, graphPath) {
  const validate = runNode(VALIDATE, [`--dirs-tree=${stagingPathOf(dirsTreePath)}`, `--graph=${graphPath}`]);
  if (validate.status !== 0) {
    failWithEnglishError(
      'the staged Dirs-Tree failed validate-dirs-tree-schema and was NOT promoted.',
      `validate-dirs-tree-schema reported: ${(validate.stderr || validate.stdout).trim()}`,
      'design the evolution on the staging Dirs-Tree with dirs-tree-crud.js so every node/edge is consistent, then re-run --approve.'
    );
  }
}

/** Commit missing src stubs for every new file node in the approved delta. */
// [::TICKET::] PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function commitSrcStubs(dirsTreeDelta, srcDir) {
  for (const newFile of dirsTreeDelta.newFiles || []) {
    // The delta path is Dirs-Tree-relative (e.g. "src/api/x.rs"); strip the
    // tree root name because srcDir already is that root.
    const relativePath = newFile.path.split('/').slice(1).join('/') || newFile.path;
    const fullPath = path.join(srcDir, relativePath);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, `// ${newFile.title || newFile.path} — declaration stub\n`, 'utf8');
    }
  }
}

/** Promote the staging copy to the real Dirs-Tree (the only promote path). */
// [::TICKET::] PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function promoteStagingToReal(dirsTreePath) {
  fs.copyFileSync(stagingPathOf(dirsTreePath), dirsTreePath);
  fs.rmSync(stagingPathOf(dirsTreePath), { force: true });
}

/** Discard the staging copy, leaving the real Dirs-Tree and src untouched. */
// [::TICKET::] PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function discardStaging(dirsTreePath) {
  fs.rmSync(stagingPathOf(dirsTreePath), { force: true });
}

/**
 * Remove the transient candidates file written by --stage. Once the design is
 * committed (--approve) or discarded (--reject), the candidates are stale and
 * regenerable; the delta (.delta.json) is the persistent record and is kept.
 */
// [::TICKET::] PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function removeCandidates(dirsTreePath) {
  fs.rmSync(candidatesPathOf(dirsTreePath), { force: true });
}

// [::TICKET::] PX-161, PX-162, PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-161|PX-162|PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  let dirsTreePath = '';
  let srcDir = '';
  let graphPath = '';
  let graphDeltaPath = '';
  let mode = '';
  for (const arg of args) {
    if (arg.startsWith('--dirs-tree=')) dirsTreePath = arg.slice('--dirs-tree='.length);
    else if (arg.startsWith('--src=')) srcDir = arg.slice('--src='.length);
    else if (arg.startsWith('--graph=')) graphPath = arg.slice('--graph='.length);
    else if (arg.startsWith('--graph-delta=')) graphDeltaPath = arg.slice('--graph-delta='.length);
    else if (arg === '--stage') mode = 'stage';
    else if (arg === '--approve') mode = 'approve';
    else if (arg === '--reject') mode = 'reject';
  }

  if (!dirsTreePath || !srcDir || !mode) {
    console.error('Usage: boundify-step.js --dirs-tree=<path> --src=<dir> [--graph=<path>] [--graph-delta=<path>] [--stage|--approve|--reject]');
    process.exit(1);
  }
  if (mode === 'stage' && !graphDeltaPath) {
    failWithEnglishError(
      '--stage requires --graph-delta to produce the candidate report.',
      'no graph-delta path was provided, so the analyzer has nothing to analyze.',
      'run --stage with --graph-delta=<path> pointing at the Step 2 graph-delta.json.'
    );
  }
  if (mode === 'approve' && !graphPath) {
    failWithEnglishError(
      '--approve requires --graph to validate the staged Dirs-Tree.',
      'validate-dirs-tree-schema needs the source graph to check mappedNodeIds.',
      'run --approve with --graph=<path> as well as --dirs-tree and --src.'
    );
  }

  if (mode === 'stage') {
    createStagingCopy(dirsTreePath);
    const candidates = produceCandidates(dirsTreePath, srcDir, graphDeltaPath, graphPath);
    process.stdout.write(formatDirsTreeDeltaReport(candidates) + '\n');
    process.exit(0);
  }
  if (mode === 'reject') {
    discardStaging(dirsTreePath);
    removeCandidates(dirsTreePath);
    process.stdout.write('Plan rejected. Dirs-Tree and src left unchanged.\n');
    process.exit(0);
  }
  if (mode === 'approve') {
    if (!fs.existsSync(stagingPathOf(dirsTreePath))) {
      failWithEnglishError(
        'cannot approve: no staging Dirs-Tree exists.',
        '--approve requires a staging copy created by --stage that the AI designed via dirs-tree-crud.js.',
        'run --stage first, design the evolution on the staging Dirs-Tree with dirs-tree-crud.js, then re-run --approve.'
      );
    }
    verifyStagingDirsTree(dirsTreePath, graphPath);
    const beforeTree = JSON.parse(fs.readFileSync(dirsTreePath, 'utf8'));
    const stagedTree = JSON.parse(fs.readFileSync(stagingPathOf(dirsTreePath), 'utf8'));
    const delta = deriveDirsTreeDelta(beforeTree, stagedTree, srcDir);
    fs.writeFileSync(deltaPathOf(dirsTreePath), JSON.stringify(delta, null, 2) + '\n', 'utf8');
    commitSrcStubs(delta, srcDir);
    promoteStagingToReal(dirsTreePath);
    removeCandidates(dirsTreePath);
    process.stdout.write('Staged Dirs-Tree verified and promoted; dirs-tree-delta.json written for Step 4.\n');
    process.exit(0);
  }
}

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main();
}

export { formatDirsTreeDeltaReport, deriveDirsTreeDelta, stagingPathOf, candidatesPathOf, deltaPathOf, removeCandidates, main };
