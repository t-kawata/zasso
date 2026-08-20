#!/usr/bin/env node
/**
 * boundify-step.js --graph=<path> --dirs-tree=<path> --src=<dir> --graph-delta=<path> [--dry-run|--approve|--reject]
 *
 * /drill-rfc-down Step 3 boundify step driver (PX-161).
 *
 * Runs the boundify-delta-analyzer to produce dirs-tree-delta.json, then:
 *   --dry-run  prints the candidate report (incl. src drift) and changes nothing
 *   --reject   leaves *-Dirs-Tree.json and src byte-identical (perfect-before-write gate)
 *   --approve  applies the plan (creates new files + updates the Dirs-Tree) and
 *              runs validate-dirs-tree-schema; exits 1 if any check fails
 *
 * Destructive changes (file/directory removal or moves) are forbidden by default.
 *
 * Design context: tools/conver/README.md — 進化ループ / /drill-rfc-down (Step 3).
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ANALYZER = path.join(SCRIPT_DIR, 'boundify-delta-analyzer.js');
const VALIDATE = path.resolve(SCRIPT_DIR, '../rfc-graph/validate-dirs-tree-schema.js');

/** Spawn a node script and return the result. */
// [::TICKET::] PX-161, PX-162 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-161|PX-162) --for-spec --no-implementation-order`.
function runNode(script, args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
}

/** Format the dry-run report from a dirs-tree-delta object (AI judgment aid). */
// [::TICKET::] PX-161, PX-162 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-161|PX-162) --for-spec --no-implementation-order`.
function formatDirsTreeDeltaReport(dirsTreeDelta) {
  const lines = ['## /drill-rfc-down Step 3 Boundify Dry-run', ''];
  lines.push(`### New file candidates (${dirsTreeDelta.newFiles.length})`);
  if (dirsTreeDelta.newFiles.length === 0) {
    lines.push('- none');
  } else {
    for (const fileCandidate of dirsTreeDelta.newFiles) lines.push(`- ${fileCandidate.path} (kind: ${fileCandidate.kind}, node: ${fileCandidate.nodeId})`);
  }
  lines.push('');
  lines.push(`### Modified file candidates (${dirsTreeDelta.modifiedFiles.length})`);
  if (dirsTreeDelta.modifiedFiles.length === 0) {
    lines.push('- none');
  } else {
    for (const modifiedFile of dirsTreeDelta.modifiedFiles) lines.push(`- ${modifiedFile.path || '(unmapped)'} (node: ${modifiedFile.nodeId})`);
  }
  lines.push('');
  lines.push(`### src drift (${dirsTreeDelta.srcDrift.length})`);
  if (dirsTreeDelta.srcDrift.length === 0) {
    lines.push('- none');
  } else {
    for (const drift of dirsTreeDelta.srcDrift) lines.push(`- ${drift.path} (${drift.kind})`);
  }
  return lines.join('\n');
}

/**
 * Apply the approved plan: create new files in src and update the Dirs-Tree.
 * Returns true on success. Destructive changes are never applied.
 */
// [::TICKET::] PX-161, PX-162 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-161|PX-162) --for-spec --no-implementation-order`.
function applyPlan(dirsTreePath, srcDir, dirsTreeDelta) {
  try {
    for (const fileCandidate of dirsTreeDelta.newFiles || []) {
      // The candidate path is Dirs-Tree-relative (e.g. "src/api/x.rs"); strip
      // the tree root name because srcDir already is that root.
      const relativePath = fileCandidate.path.split('/').slice(1).join('/') || fileCandidate.path;
      const fullPath = path.join(srcDir, relativePath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, `// ${fileCandidate.title} — declaration stub\n`, 'utf8');
    }

    const dirsTree = JSON.parse(fs.readFileSync(dirsTreePath, 'utf8'));
    for (const fileCandidate of dirsTreeDelta.newFiles || []) {
      const rootName = fileCandidate.path.split('/')[0];
      const fileName = fileCandidate.path.split('/').slice(1).join('/') || fileCandidate.path;
      for (const lang of Object.keys(dirsTree.trees || {})) {
        const root = dirsTree.trees[lang];
        if (root.name === rootName) {
          root.children = root.children || [];
          root.children.push({
            name: fileName,
            type: 'file',
            kind: fileCandidate.kind,
            mappedNodeIds: [{ nodeId: fileCandidate.nodeId, title: fileCandidate.title }],
          });
          break;
        }
      }
    }
    fs.writeFileSync(dirsTreePath, JSON.stringify(dirsTree, null, 2) + '\n', 'utf8');
    return true;
  } catch (e) {
    process.stderr.write(`[ERROR] boundify-step: apply failed: ${e.message}\n`);
    return false;
  }
}

// [::TICKET::] PX-161, PX-162 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-161|PX-162) --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  let graphPath = '';
  let dirsTreePath = '';
  let srcDir = '';
  let graphDeltaPath = '';
  let mode = '';
  for (const arg of args) {
    if (arg.startsWith('--graph=')) graphPath = arg.slice('--graph='.length);
    else if (arg.startsWith('--dirs-tree=')) dirsTreePath = arg.slice('--dirs-tree='.length);
    else if (arg.startsWith('--src=')) srcDir = arg.slice('--src='.length);
    else if (arg.startsWith('--graph-delta=')) graphDeltaPath = arg.slice('--graph-delta='.length);
    else if (arg === '--dry-run') mode = 'dry-run';
    else if (arg === '--approve') mode = 'approve';
    else if (arg === '--reject') mode = 'reject';
  }
  if (!graphPath || !dirsTreePath || !srcDir || !graphDeltaPath || !mode) {
    console.error('Usage: boundify-step.js --graph=<path> --dirs-tree=<path> --src=<dir> --graph-delta=<path> [--dry-run|--approve|--reject]');
    process.exit(1);
  }

  // Produce the dirs-tree-delta via the analyzer (deterministic dry-run; no writes).
  const outPath = path.join(os.tmpdir(), `dirs-tree-delta-${process.pid}.json`);
  const analyzerResult = runNode(ANALYZER, [`--graph-delta=${graphDeltaPath}`, `--dirs-tree=${dirsTreePath}`, `--src=${srcDir}`, `--out=${outPath}`]);
  if (analyzerResult.status !== 0) {
    process.stderr.write(analyzerResult.stderr || analyzerResult.stdout);
    process.exit(1);
  }
  const dirsTreeDelta = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  fs.rmSync(outPath, { force: true });

  if (mode === 'dry-run') {
    process.stdout.write(formatDirsTreeDeltaReport(dirsTreeDelta) + '\n');
    process.exit(0);
  }
  if (mode === 'reject') {
    process.stdout.write('Plan rejected. Dirs-Tree and src left unchanged.\n');
    process.exit(0);
  }
  if (mode === 'approve') {
    if (!applyPlan(dirsTreePath, srcDir, dirsTreeDelta)) process.exit(1);
    const validate = runNode(VALIDATE, [`--dirs-tree=${dirsTreePath}`, `--graph=${graphPath}`]);
    if (validate.status !== 0) {
      process.stderr.write(`[ERROR] boundify-step: validate-dirs-tree-schema failed after apply:\n${validate.stderr || validate.stdout}`);
      process.exit(1);
    }
    process.stdout.write(formatDirsTreeDeltaReport(dirsTreeDelta) + '\nApplied and validated.\n');
    process.exit(0);
  }
}

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main();
}

export { formatDirsTreeDeltaReport, applyPlan, main };
