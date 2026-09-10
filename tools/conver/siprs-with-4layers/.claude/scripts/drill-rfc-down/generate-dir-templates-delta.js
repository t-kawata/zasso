#!/usr/bin/env node
/**
 * generate-dir-templates-delta.js — drill-rfc-down Step 3 delta-only file generation (PX-170)
 *
 * Creates ONLY the new files declared in dirs-tree-delta.json (newFiles) under the
 * real src tree, reusing the parent boundify template rendering
 * (generate-dir-template.js discover/buildHeaderContext, boundify-helpers.js
 * getDeclarationStub). Existing files and directories are never modified,
 * overwritten, or deleted (C002). Prose-kind file nodes never produce files (C003).
 *
 * The flow reads top-to-bottom as prose:
 *   build header context → render all file contents → filter to the delta →
 *   exclude Prose kinds → skip existing paths → write only the missing files.
 *
 * Design context: tools/conver/README.md — 進化ループ / /drill-rfc-down (Step 3).
 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { discover, buildHeaderContext } = require(path.resolve(SCRIPT_DIR, '../rfc-graph/generate-dir-template.js'));
const { getDeclarationStub } = require(path.resolve(SCRIPT_DIR, '../rfc-graph/boundify-helpers.js'));

const PROSE_KINDS = ['rationale', 'glossary', 'requirement'];

/** Read and validate the dirs-tree-delta newFiles array. */
// [::TICKET::] PX-170, PX-171, PX-172 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-170|PX-171|PX-172) --for-spec --no-implementation-order`.
function resolveDeltaNewFiles(deltaPath) {
  if (!fs.existsSync(deltaPath)) {
    throw new Error('[ERROR] dirs-tree-delta.json not found.\nCause: ' + deltaPath + ' does not exist.\nAction: run boundify-step --approve so the delta is derived before invoking the generator.');
  }
  let delta;
  try {
    delta = JSON.parse(fs.readFileSync(deltaPath, 'utf8'));
  } catch (error) {
    throw new Error('[ERROR] dirs-tree-delta.json is not valid JSON.\nCause: ' + error.message + '\nAction: re-run boundify-step --approve to regenerate the delta.');
  }
  if (!Array.isArray(delta.newFiles)) {
    throw new Error('[ERROR] dirs-tree-delta.json has no newFiles array.\nCause: the delta must carry the newFiles entries produced by deriveDirsTreeDelta.\nAction: re-run boundify-step --approve so newFiles is present.');
  }
  return delta.newFiles;
}

/** Locate the Dirs-Tree file node by a Dirs-Tree-relative path (e.g. "src/api/x.rs"). */
// [::TICKET::] PX-170, PX-171, PX-172 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-170|PX-171|PX-172) --for-spec --no-implementation-order`.
function findFileNodeByPath(dirsTree, relPath) {
  const segments = relPath.split('/').filter(Boolean);
  for (const tree of Object.values(dirsTree.trees || {})) {
    if (tree.name !== segments[0]) continue;
    let current = tree;
    for (let i = 1; i < segments.length; i++) {
      current = (current.children || []).find((child) => child.name === segments[i]);
      if (!current) return null;
    }
    return current;
  }
  return null;
}

/** Strip the tree-root segment (e.g. "src") from a Dirs-Tree-relative path. */
// [::TICKET::] PX-170, PX-171, PX-172 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-170|PX-171|PX-172) --for-spec --no-implementation-order`.
function stripTreeRoot(dirsTreeRelPath) {
  return dirsTreeRelPath.split('/').slice(1).join('/') || dirsTreeRelPath;
}

/**
 * Deep-clone a Dirs-Tree branch, filling any file node that lacks a
 * declarationStub with the kind/language template from getDeclarationStub.
 * Rendering with discover() then naturally includes the auto stub; the caller's
 * staged tree stays untouched (purity).
 */
// [::TICKET::] PX-170, PX-171, PX-172 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-170|PX-171|PX-172) --for-spec --no-implementation-order`.
function cloneTreeWithAutoStubs(node, lang) {
  const clone = { ...node, children: (node.children || []).map((child) => cloneTreeWithAutoStubs(child, lang)) };
  if (clone.type === 'file' && !clone.declarationStub) {
    const autoStub = getDeclarationStub(clone.kind, lang);
    if (autoStub) clone.declarationStub = autoStub;
  }
  return clone;
}

/** Fallback header context when the staged Dirs-Tree lacks sourceGraph. */
// [::TICKET::] PX-170, PX-171, PX-172 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-170|PX-171|PX-172) --for-spec --no-implementation-order`.
function fallbackHeaderContext(dirsTreePath, graphPath, lang) {
  const graphDirAbs = path.dirname(path.resolve(graphPath));
  return {
    graphDirAbs,
    graphBasename: path.basename(graphPath),
    dirsTreeBasename: path.basename(dirsTreePath),
    sourceBasename: 'UNKNOWN_SOURCE.md',
    crossReferences: [],
    nodeMetaMap: {},
    lang,
  };
}

/**
 * Generate the delta-only directory/file tree under srcDir.
 *
 * @param {Object} args
 * @param {string} args.dirsTreePath — path to the (staged) Dirs-Tree, used to derive rootDir
 * @param {Object} args.stagedDirsTree — parsed staged Dirs-Tree
 * @param {string} args.srcDir — the real src root directory
 * @param {string} args.graphPath — graph path, used as a header-context fallback
 * @param {string} args.deltaPath — path to dirs-tree-delta.json (newFiles)
 * @returns {{ created: string[], skipped: string[], excluded: string[] }}
 *   Dirs-Tree-relative paths; created = written, skipped = already on disk, excluded = Prose-kind
 */
export function generateDirsTreeDelta({ dirsTreePath, stagedDirsTree, srcDir, graphPath, deltaPath }) {
  if (!stagedDirsTree || typeof stagedDirsTree !== 'object' || !stagedDirsTree.trees) {
    throw new Error('[ERROR] stagedDirsTree is required.\nCause: the staged Dirs-Tree object is missing or invalid.\nAction: pass the parsed staged Dirs-Tree from boundify-step --approve.');
  }
  const newFiles = resolveDeltaNewFiles(deltaPath);
  const rootDir = path.dirname(path.resolve(dirsTreePath));
  const deltaAbsPaths = new Set(newFiles.map((file) => path.resolve(rootDir, file.path)));

  const created = [];
  const skipped = [];
  const excluded = [];

  for (const [lang, tree] of Object.entries(stagedDirsTree.trees || {})) {
    const treeWithAutoStubs = cloneTreeWithAutoStubs(tree, lang);
    const headerContext = buildHeaderContext(stagedDirsTree, dirsTreePath, rootDir, lang) || fallbackHeaderContext(dirsTreePath, graphPath, lang);
    const items = discover(treeWithAutoStubs, rootDir, headerContext);
    for (const item of items) {
      if (item.type !== 'file') continue;
      const itemRel = path.relative(rootDir, item.path);
      if (!deltaAbsPaths.has(path.resolve(rootDir, itemRel))) continue;

      const node = findFileNodeByPath(stagedDirsTree, itemRel);
      if (!node || PROSE_KINDS.includes(node.kind)) {
        excluded.push(itemRel);
        continue;
      }

      const fullPath = path.join(srcDir, stripTreeRoot(itemRel));
      if (fs.existsSync(fullPath)) {
        skipped.push(itemRel);
        continue;
      }

      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, item.content || '', 'utf8');
      created.push(itemRel);
    }
  }

  return { created, skipped, excluded };
}
