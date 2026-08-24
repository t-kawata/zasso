#!/usr/bin/env node
/**
 * refresh-file-headers.js — drill-rfc-down Step 3 safe existing-file header refresh (PX-171)
 *
 * After graphify (Step 2) updates the GRAPH, existing files' Initial Design Artifact
 * headers can go stale. This module refreshes ONLY the bounded header region
 * (opening separator .. closing separator) of header-carrying files whose mapped
 * nodes changed per the graph delta. The implementation body stays byte-identical
 * and [::TICKET::] provenance annotations are preserved. Header-less files are
 * skipped (C002); declaration stubs are refreshed only in template-state files
 * (C003); cross-references are recomputed from the updated GRAPH via
 * boundify-tree.js computeCrossReferences (C004).
 *
 * Design context: tools/conver/README.md — 進化ループ / /drill-rfc-down (Step 3).
 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { generateHeaderComment, resolveHeaderPaths, getDeclarationStub } = require(path.resolve(SCRIPT_DIR, '../rfc-graph/boundify-helpers.js'));
const { computeCrossReferences } = require(path.resolve(SCRIPT_DIR, '../rfc-graph/boundify-tree.js'));

const HEADER_MARKER = 'Initial Design Artifact — RFC-driven Implementation';
const SEPARATOR_RE = /^\/\/ =+$/;
const TICKET_LINE_RE = /^\s*\/\/ \[::TICKET::\]/;
const STUB_MARKER_RE = /\[::STUB::\]/;

/** Walk a Dirs-Tree branch, visiting every node with its Dirs-Tree-relative path. */
// [::TICKET::] PX-171, PX-172 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-171|PX-172) --for-spec --no-implementation-order`.
function walkTree(node, prefix, visit) {
  const relPath = prefix ? `${prefix}/${node.name}` : node.name;
  visit(relPath, node);
  for (const child of node.children || []) walkTree(child, relPath, visit);
}

/** Build nodeId → file path and nodeId → directory maps from the Dirs-Tree. */
// [::TICKET::] PX-171, PX-172 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-171|PX-172) --for-spec --no-implementation-order`.
function buildNodeFileMaps(dirsTree) {
  const nodeToFilePath = {};
  const nodeToDir = {};
  for (const tree of Object.values(dirsTree.trees || {})) {
    walkTree(tree, '', (relPath, node) => {
      if (node.type !== 'file') return;
      const dir = relPath.split('/').slice(0, -1).join('/');
      for (const mapping of node.mappedNodeIds || []) {
        const nodeId = typeof mapping === 'string' ? mapping : mapping.nodeId;
        if (nodeId && !(nodeId in nodeToFilePath)) {
          nodeToFilePath[nodeId] = relPath;
          nodeToDir[nodeId] = dir;
        }
      }
    });
  }
  return { nodeToFilePath, nodeToDir };
}

/** Locate the Dirs-Tree file node by a Dirs-Tree-relative path. */
// [::TICKET::] PX-171, PX-172 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-171|PX-172) --for-spec --no-implementation-order`.
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

/** The language tree owning a Dirs-Tree-relative path (defaults to rust). */
// [::TICKET::] PX-171, PX-172 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-171|PX-172) --for-spec --no-implementation-order`.
function langOf(dirsTree, relPath) {
  const rootName = relPath.split('/')[0];
  for (const [lang, tree] of Object.entries(dirsTree.trees || {})) {
    if (tree.name === rootName) return lang;
  }
  return 'rust';
}

/** Derive the Dirs-Tree-relative paths of files whose mapped nodes changed per the delta. */
// [::TICKET::] PX-171, PX-172 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-171|PX-172) --for-spec --no-implementation-order`.
function deriveRefreshTargets(graphDelta, dirsTree) {
  const changedNodeIds = new Set([
    ...(graphDelta.newNodes || []).map((node) => node.id),
    ...(graphDelta.modifiedNodes || []).map((mod) => mod.id),
  ]);
  const targets = [];
  for (const tree of Object.values(dirsTree.trees || {})) {
    walkTree(tree, '', (relPath, node) => {
      if (node.type !== 'file') return;
      const mapped = (node.mappedNodeIds || []).map((m) => (typeof m === 'string' ? m : m.nodeId));
      if (mapped.some((id) => changedNodeIds.has(id))) targets.push(relPath);
    });
  }
  return targets;
}

/** Split a file into preHeader / headerRegion / body; null when not a refreshable header-carrying file. */
// [::TICKET::] PX-171, PX-172 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-171|PX-172) --for-spec --no-implementation-order`.
function parseHeaderRegions(content) {
  const lines = content.split('\n');
  const firstSep = lines.findIndex((line) => SEPARATOR_RE.test(line));
  let lastSep = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (SEPARATOR_RE.test(lines[i])) { lastSep = i; break; }
  }
  if (firstSep === -1 || lastSep === -1 || firstSep >= lastSep) return null;
  if (!content.includes(HEADER_MARKER)) return null;
  return {
    preHeader: lines.slice(0, firstSep).join('\n'),
    headerRegion: lines.slice(firstSep, lastSep + 1).join('\n'),
    body: lines.slice(lastSep + 1).join('\n'),
  };
}

/** Whether the body after the closing separator is only stubs/comments (template state). */
// [::TICKET::] PX-171, PX-172 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-171|PX-172) --for-spec --no-implementation-order`.
function isTemplateStateFile(body) {
  const significant = body.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
  return significant.every((line) => line.startsWith('//') || STUB_MARKER_RE.test(line));
}

/** Extract [::TICKET::] annotation lines so they survive the header refresh. */
// [::TICKET::] PX-171, PX-172 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-171|PX-172) --for-spec --no-implementation-order`.
function extractTicketAnnotations(text) {
  return text.split('\n').filter((line) => TICKET_LINE_RE.test(line));
}

/** Header-context fields shared by every refresh operation. */
// [::TICKET::] PX-171, PX-172 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-171|PX-172) --for-spec --no-implementation-order`.
function buildHeaderContext(dirsTreePath, graphPath, dirsTree) {
  const graphAbs = path.resolve(graphPath);
  const sourceFile = dirsTree.sourceFile || '';
  return {
    graphDirAbs: path.dirname(graphAbs),
    graphBasename: path.basename(graphAbs),
    dirsTreeBasename: path.basename(path.resolve(dirsTreePath)),
    sourceBasename: sourceFile ? path.basename(sourceFile) : 'UNKNOWN_SOURCE.md',
  };
}

/** Regenerate the provenance header for one file at fullPath, using the graph's current node metadata. */
// [::TICKET::] PX-171, PX-172 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-171|PX-172) --for-spec --no-implementation-order`.
function regenerateHeader(fullPath, node, designContext) {
  const { graphNodeMap, crossReferences, context, lang } = designContext;
  const headerPaths = resolveHeaderPaths(fullPath, context.graphDirAbs, context.graphBasename, context.dirsTreeBasename, context.sourceBasename);
  const mappedNodeIds = (node.mappedNodeIds || []).map((mapping) => {
    const nodeId = typeof mapping === 'string' ? mapping : mapping.nodeId;
    const graphNode = graphNodeMap.get(nodeId);
    return { nodeId, title: graphNode ? graphNode.title : (typeof mapping === 'object' ? mapping.title : '') };
  });
  const mappedIdStrings = mappedNodeIds.map((m) => m.nodeId);
  const mappedSet = new Set(mappedIdStrings);
  const fileCrossRefs = (crossReferences || []).filter((cr) =>
    cr.connections && cr.connections.some((conn) => mappedSet.has(conn.toNodeId)));
  return generateHeaderComment(headerPaths, mappedNodeIds, mappedIdStrings, fileCrossRefs, context.graphBasename, context.sourceBasename, lang);
}

/** Insert the current kind/language declaration stub before a template-state body's stub markers. */
// [::TICKET::] PX-171, PX-172 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-171|PX-172) --for-spec --no-implementation-order`.
function refreshTemplateStub(body, kind, lang) {
  const autoStub = getDeclarationStub(kind, lang);
  if (!autoStub) return body;
  const lines = body.split('\n');
  const markerIdx = lines.findIndex((line) => STUB_MARKER_RE.test(line));
  if (markerIdx === -1) return body + autoStub + '\n\n';
  lines.splice(markerIdx, 0, autoStub, '');
  return lines.join('\n');
}

/** Atomic write (temp + rename) so a crash never leaves a half-written file. */
// [::TICKET::] PX-171, PX-172 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-171|PX-172) --for-spec --no-implementation-order`.
function atomicWrite(filePath, data) {
  const tmpPath = `${filePath}.tmp.${process.pid}`;
  fs.writeFileSync(tmpPath, data, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

/**
 * Refresh the provenance headers of existing files whose mapped nodes changed.
 *
 * @param {Object} args
 * @param {string} args.dirsTreePath — path to the (staged) Dirs-Tree
 * @param {Object} args.stagedDirsTree — parsed staged Dirs-Tree
 * @param {string} args.srcDir — the real src root directory
 * @param {string} args.graphPath — the updated GRAPH path
 * @param {string} args.graphDeltaPath — path to graph-delta.json (newNodes/modifiedNodes)
 * @returns {{ refreshed: string[], skipped: string[] }} Dirs-Tree-relative paths
 */
export function refreshFileHeaders({ dirsTreePath, stagedDirsTree, srcDir, graphPath, graphDeltaPath }) {
  const graphDelta = JSON.parse(fs.readFileSync(graphDeltaPath, 'utf8'));
  const targets = deriveRefreshTargets(graphDelta, stagedDirsTree);
  const { nodeToFilePath, nodeToDir } = buildNodeFileMaps(stagedDirsTree);
  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  const graphNodeMap = new Map((graph.nodes || []).map((node) => [node.id, node]));
  const crossReferences = computeCrossReferences(graph, nodeToDir, nodeToFilePath);
  const context = buildHeaderContext(dirsTreePath, graphPath, stagedDirsTree);

  const refreshed = [];
  const skipped = [];

  for (const relPath of targets) {
    const node = findFileNodeByPath(stagedDirsTree, relPath);
    if (!node) continue;
    const fullPath = path.join(srcDir, relPath.split('/').slice(1).join('/'));
    if (!fs.existsSync(fullPath)) { skipped.push(relPath); continue; }
    const content = fs.readFileSync(fullPath, 'utf8');
    const regions = parseHeaderRegions(content);
    if (!regions) { skipped.push(relPath); continue; }

    const lang = langOf(stagedDirsTree, relPath);
    // generateHeaderComment returns a trailing newline; drop it so the region join
    // does not introduce an extra blank line between the header and the body.
    let headerLines = regenerateHeader(fullPath, node, { graphNodeMap, crossReferences, context, lang }).replace(/\n$/, '').split('\n');
    const preserved = extractTicketAnnotations(regions.headerRegion);
    if (preserved.length > 0) {
      headerLines = [...headerLines.slice(0, 1), ...preserved, ...headerLines.slice(1)];
    }
    let body = regions.body;
    if (isTemplateStateFile(body)) {
      body = refreshTemplateStub(body, node.kind, lang);
    }
    const newContent = [regions.preHeader, headerLines.join('\n'), body].filter((part) => part.length > 0).join('\n');
    atomicWrite(fullPath, newContent);
    refreshed.push(relPath);
  }

  return { refreshed, skipped };
}
