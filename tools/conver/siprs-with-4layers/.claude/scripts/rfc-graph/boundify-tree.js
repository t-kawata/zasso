#!/usr/bin/env node

/**
 * boundify-tree.js — Directory tree generation functions for boundify-graph
 *
 * Provides functions to generate directory trees from graph nodes.
 * Conforms to RFC-BOUNDIFY.md §3.5 (Directory proposal algorithm).
 *
 * PX-29 added: pruneEmptyDirectories (empty directory removal and flattening)
 * PX-30 added: computeCrossReferences (cross-references for prose-type nodes)
 *
 * Dependencies: boundify-helpers.js (titleToFileName, deduplicateFileNames)
 */

'use strict';

// P18-1 Uses require internally (CommonJS)
const path = require('path');

/**
 * kind → directory placement mapping constants
 *
 * Defines which subdirectory each kind is placed into.
 * Kinds with null value are directory skeletons (architecture) or
 * inline placement within the parent domain (api_contract/data_model/state_machine).
 */
const KIND_FILE_RULES = Object.freeze({
  config: 'config',
  error_policy: 'error',
  security: 'security',
  test_policy: 'tests',
  build_ci: 'build',
  api_contract: 'api',
  data_model: 'model',
  state_machine: 'state',
});

/**
 * Set of kinds placed inline within the parent domain
 */
const INLINE_KINDS = Object.freeze(new Set([
  // PX-48 moved api_contract / data_model / state_machine to
  // KIND_FILE_RULES, so INLINE_KINDS is now empty.
  // Add kinds that need inline placement in the future here.
]));

/**
 * Set of directory skeleton kinds (do not generate files)
 */
const BACKBONE_KINDS = Object.freeze(new Set([
  'architecture',
]));

/**
 * Prose-type kinds — no runtime behavior, do not generate independent files.
 * PX-28: rationale/glossary/requirement are excluded from kind→directory name
 * fallback to prevent file generation.
 */
const PROSE_KINDS = Object.freeze(new Set([
  'rationale',
  'glossary',
  'requirement',
]));

/**
 * Build domain hierarchy from part_of edges
 *
 * @param {object} graph - Graph object ({nodes, edges})
 * @returns {{roots: Array, childOf: object}}
 *   roots: Root node array of the recursive tree structure
 *   childOf: Node ID → parent node ID map
 */
function buildDomainHierarchy(graph) {
  const childOf = {};
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];

  // Build parent-child relationship map from part_of edges
  for (const edge of edges) {
    if (edge.type === 'part_of') {
      childOf[edge.from] = edge.to;
    }
  }

  // Identify root nodes (not targeted by part_of edges)
  const allNodeIds = new Set(nodes.map(n => n.id));
  const hasParent = new Set(Object.keys(childOf));
  const rootIds = [...allNodeIds].filter(id => !hasParent.has(id));

  // Recursively build a subtree rooted at the specified node
  function buildTree(nodeId, visited) {
    if (visited.has(nodeId)) {
      // [::STUB::] Circular part_of edge: currently treated as an error.
      // For improved circular detection, see tickets/P18-1.
      return null;
    }
    const nextVisited = new Set(visited);
    nextVisited.add(nodeId);

    const node = nodes.find(n => n.id === nodeId);
    if (!node) return null;

    // Collect children whose parent is this node
    const childIds = edges
      .filter(e => e.type === 'part_of' && childOf[e.from] === nodeId && e.from !== nodeId)
      .map(e => e.from);

    const children = childIds
      .map(id => buildTree(id, nextVisited))
      .filter(Boolean);

    return {
      node,
      children: children.length > 0 ? children : null,
    };
  }

  const roots = rootIds
    .map(id => buildTree(id, new Set()))
    .filter(Boolean);

  return { roots, childOf };
}

/**
 * Resolve the target directory for a node based on its kind and hierarchy
 *
 * @param {object} node - Graph node ({id, kind, title})
 * @param {object} hierarchy - Return value of buildDomainHierarchy
 * @returns {string|null} Directory name (null for skeleton kinds)
 */
function resolveDirForNode(node, hierarchy) {
  const kind = node.kind || '';
  const rules = KIND_FILE_RULES;

  // Directory skeleton kinds do not generate files
  if (BACKBONE_KINDS.has(kind)) return null;

  // Prose-type kinds do not generate independent files
  if (PROSE_KINDS.has(kind)) return null;

  // Inline placement within parent domain uses parent architecture name
  if (INLINE_KINDS.has(kind)) {
    const parentId = hierarchy.childOf[node.id];
    if (parentId) {
      // [::STUB::] TO RESOLVE: Build the full hierarchy path when resolving the parent.
      // Currently returns only the parent node name, but should return a path from the root.
      return null;
    }
    return null;
  }

  // kind → directory name mapping
  const dirName = rules[kind];
  if (dirName) return dirName;

  // Undefined kind falls back to the kind name
  return kind || null;
}

/**
 * Build a node → directory name map from the graph
 *
 * @param {object} graph - Graph object ({nodes, edges})
 * @returns {object} {nodeToDir: {[nodeId]: string|null}}
 */
function resolveNodeToDirMap(graph, hierarchy) {
  const nodeToDir = {};
  const nodes = graph.nodes || [];

  for (const node of nodes) {
    nodeToDir[node.id] = resolveDirForNode(node, hierarchy);
  }

  return nodeToDir;
}

/**
 * Build directory tree from graph
 *
 * Apply Phase 2 (kind-based placement) to Phase 1 (buildDomainHierarchy) hierarchy.
 * Main integration function. Uses titleToFileName() and deduplicateFileNames() internally.
 *
 * @param {object} graph - Graph object
 * @param {string} lang - Language name ('rust' | 'go' | 'typescript')
 * @param {object} helpers - External dependency functions (titleToFileName, deduplicateFileNames)
 * @returns {{tree: object|null, nodeToDir: object, files: Array}}
 *   tree: Root of the directory tree
 *   nodeToDir: Node ID → directory path map
 *   files: List of generated files
 */
function buildDirectoryTree(graph, lang, helpers) {
  const languageExtensions = helpers.languageExtensions || { rust: '.rs', go: '.go', typescript: '.ts' };
  const deduplicateFileNames = helpers.deduplicateFileNames;
  const getDeclarationStub = helpers.getDeclarationStub || (() => '');
  const hierarchy = buildDomainHierarchy(graph);
  const nodeToDir = resolveNodeToDirMap(graph, hierarchy);
  const nodes = graph.nodes || [];

  /**
   * Resolve the language-specific file name from a node slug.
   * Falls back to node ID if slug is not set.
   */
  function resolveFileName(node, lang) {
    const slug = node.slug;
    if (slug && typeof slug === 'string' && slug.length > 0) {
      return slug + (languageExtensions[lang] || '.rs');
    }
    // Fallback: slug not set (backward compatibility with older graphs)
    const fallback = node.id ? node.id.toLowerCase() : 'unnamed';
    return fallback + (languageExtensions[lang] || '.rs');
  }

    // Build directory tree from root hierarchy
  function buildTreeFromRoot(root) {
    if (!root || !root.node) return null;

    const node = root.node;
    const kind = node.kind || '';

    // architecture kind → directory node
    if (BACKBONE_KINDS.has(kind)) {
      const dirName = resolveFileName(node, lang).replace(/\.(rs|go|ts)$/, '');
      const dirNode = {
        name: dirName,
        type: 'directory',
        kind,
        mappedNodeIds: [{nodeId: node.id, title: node.title || ''}],
        children: [],
      };

      // Process children
      if (root.children) {
        // Separate children into architecture and non-architecture
        const backboneChildren = [];
        const ruleDirEntries = [];

        for (const child of root.children) {
          const childDir = buildTreeFromRoot(child);
          if (childDir) {
            backboneChildren.push(childDir);
          } else {
            // Non-architecture children → process as rule-driven
            const childNode = child.node;
            if (childNode && !PROSE_KINDS.has(childNode.kind || '')) {
              const childDirName = resolveDirForNode(childNode, hierarchy);
              if (childDirName && !BACKBONE_KINDS.has(childNode.kind || '')) {
                const fileName = resolveFileName(childNode, lang);
                ruleDirEntries.push({
                  dirName: childDirName,
                  fileNode: {
                    name: fileName,
                    type: 'file',
                    kind: childNode.kind || '',
                    mappedNodeIds: [{nodeId: childNode.id, title: childNode.title || ''}],
                    declarationStub: getDeclarationStub(childNode.kind || '', lang),
                  },
                });
              }
            }
          }
        }

        // Add architecture children
        dirNode.children.push(...backboneChildren);

        // Group rule-driven children by directory name and add as subdirectories
        const dirGroups = {};
        for (const entry of ruleDirEntries) {
          if (!dirGroups[entry.dirName]) dirGroups[entry.dirName] = [];
          dirGroups[entry.dirName].push(entry.fileNode);
        }
        for (const [subDirName, files] of Object.entries(dirGroups)) {
          dirNode.children.push({
            name: subDirName,
            type: 'directory',
            kind: files[0].kind,
            children: files,
          });
        }
      }

      // Also add inline kind children (from non-part_of edges)
      const inlineChildren = findInlineChildren(node.id, graph, hierarchy);
      for (const inlineChild of inlineChildren) {
        const fileName = resolveFileName(inlineChild, lang);
        dirNode.children.push({
          name: fileName,
          type: 'file',
          kind: inlineChild.kind || '',
          mappedNodeIds: [{nodeId: inlineChild.id, title: inlineChild.title || ''}],
          declarationStub: getDeclarationStub(inlineChild.kind || '', lang),
        });
      }

      return dirNode;
    }

    return null;
  }

  // Get inline children for the specified node (kind-based)
  function findInlineChildren(nodeId, graph, hierarchy) {
    const allNodes = graph.nodes || [];
    const edges = graph.edges || [];

    // Collect children of part_of edges whose parent is this node and whose kind is inline
    const childIds = edges
      .filter(e => e.type === 'part_of' && hierarchy.childOf[e.from] === nodeId && e.from !== nodeId)
      .map(e => e.from);

    return childIds
      .map(id => allNodes.find(n => n.id === id))
      .filter(n => n && INLINE_KINDS.has(n.kind || ''));
  }

  // Convert entire root hierarchy to tree
  const topNodes = [];
  for (const root of hierarchy.roots) {
    const treeNode = buildTreeFromRoot(root);
    if (treeNode) topNodes.push(treeNode);
  }

  // Collect all descendants of hierarchy roots to exclude from findRuleDrivenNodes
  const descendantIds = collectDescendantIds(hierarchy.roots);

  // Also collect independent nodes matching kind→directory rules (excluding hierarchy descendants)
  const ruleDrivenNodes = findRuleDrivenNodes(graph, hierarchy, lang, resolveFileName, deduplicateFileNames, getDeclarationStub, descendantIds);

  // Merge
  const allTopNodes = mergeTopLevelNodes(topNodes, ruleDrivenNodes);

  // Remove empty directories and flatten single-child directories
  // Prune children individually; src/ root itself is not flattened
  const prunedChildren = allTopNodes.length > 0
    ? allTopNodes.map(n => pruneEmptyDirectories(n)).filter(Boolean)
    : [];
  const tree = prunedChildren.length > 0
    ? { name: 'src', type: 'directory', kind: 'root', children: prunedChildren }
    : null;

  // Collect the full file list
  const files = collectFiles(tree, []);

  // Build node ID → file path map (used for crossReferences toFile field)
  const nodeIdToFilePath = {};
  for (let fi = 0; fi < files.length; fi++) {
    const file = files[fi];
    const ids = file.mappedNodeIds || [];
    for (let mi = 0; mi < ids.length; mi++) {
      const entry = ids[mi];
      const nid = (typeof entry === 'string') ? entry : entry.nodeId;
      if (nid && !nodeIdToFilePath[nid]) {
        nodeIdToFilePath[nid] = file.path;
      }
    }
  }

  return { tree, nodeToDir, files, nodeIdToFilePath };
}

/**
 * Collect all descendant node IDs from hierarchy roots
 *
 * Used to exclude nodes already processed by buildTreeFromRoot from findRuleDrivenNodes.
 *
 * @param {Array} roots — roots array from buildDomainHierarchy
 * @returns {Set<string>} Set of all descendant node IDs
 */
function collectDescendantIds(roots) {
  const ids = new Set();
  function walk(root) {
    if (!root || !root.node) return;
    ids.add(root.node.id);
    if (root.children) {
      for (const child of root.children) {
        walk(child);
      }
    }
  }
  for (const root of roots) {
    // Only collect descendants of architecture (BACKBONE) roots.
    // Non-architecture roots (e.g. config without part_of) are processed by findRuleDrivenNodes.
    if (root.node && BACKBONE_KINDS.has(root.node.kind || '')) {
      walk(root);
    }
  }
  return ids;
}

/**
 * Collect root-level nodes that match kind → directory rules
 *
 * @param {object} graph — Graph object
 * @param {object} hierarchy — Return value of buildDomainHierarchy
 * @param {string} lang — Language name
 * @param {Function} resolveFileNameFn — File name resolution function
 * @param {Function} deduplicateFileNames — Deduplication function (unused)
 * @param {Function} getDeclarationStubFn — Declaration stub function
 * @param {Set<string>} [excludeNodeIds] — Set of node IDs to exclude
 * @returns {Array} Array of rule-driven nodes
 */
function findRuleDrivenNodes(graph, hierarchy, lang, resolveFileNameFn, deduplicateFileNames, getDeclarationStubFn, excludeNodeIds) {
  const getStub = getDeclarationStubFn || (() => '');
  const nodes = graph.nodes || [];
  const result = [];

  for (const node of nodes) {
    // Exclude nodes already processed within the hierarchy
    if (excludeNodeIds && excludeNodeIds.has(node.id)) continue;

    const dirName = resolveDirForNode(node, hierarchy);
    // Nodes matching rules and not in the root hierarchy
    if (dirName && !BACKBONE_KINDS.has(node.kind || '')) {
      const fileName = resolveFileNameFn(node, lang);
      result.push({
        name: dirName,
        type: 'directory',
        kind: node.kind || '',
        mappedNodeIds: [{nodeId: node.id, title: node.title || ''}],
        children: [{
          name: fileName,
          type: 'file',
          kind: node.kind || '',
          mappedNodeIds: [{nodeId: node.id, title: node.title || ''}],
          declarationStub: getStub(node.kind || '', lang),
        }],
      });
    }
  }

  return result;
}

/**
 * Merge nodes at the same level by name
 * Merges children if directories share the same name (with child deduplication)
 */
function mergeTopLevelNodes(backboneNodes, ruleDrivenNodes) {
  const merged = {};

  for (const node of [...backboneNodes, ...ruleDrivenNodes]) {
    if (!merged[node.name]) {
      merged[node.name] = {
        ...node,
        children: [...(node.children || [])],
        mappedNodeIds: [...(node.mappedNodeIds || [])],
      };
    } else {
      // Same name directory → merge children (deduplicate)
      const existing = merged[node.name];
      if (node.children) {
        const existingChildNames = new Set(existing.children.map(c => c.name));
        for (const child of node.children) {
          if (!existingChildNames.has(child.name)) {
            existing.children.push(child);
          }
        }
      }
      if (node.mappedNodeIds) {
        const existingIdSet = new Set(
          (existing.mappedNodeIds || []).map(function(e) { return e.nodeId || e; })
        );
        for (const id of node.mappedNodeIds) {
          if (!existingIdSet.has(id.nodeId || id)) {
            existing.mappedNodeIds.push(id);
          }
        }
      }
    }
  }

  return Object.values(merged);
}

/**
 * Remove empty directories and flatten single-child directories
 *
 * Transforms the tree according to these rules:
 * 1. Directory with no children → remove (return null)
 * 2. Directory with exactly one child (and that child is a directory) → flatten (merge child contents into parent)
 * 3. Directory containing files → keep
 *
 * @param {object|null} node — Tree node
 * @param {boolean} [skipFlatten] — If true, skip flattening (rule 2)
 * @returns {object|null} Transformed node, or null if removed
 */
function pruneEmptyDirectories(node, skipFlatten) {
  if (!node) return null;

  // File nodes are returned as-is
  if (node.type !== 'directory') return node;

  // Recursively transform children
  if (node.children && node.children.length > 0) {
    node.children = node.children
      .map(child => pruneEmptyDirectories(child))
      .filter(Boolean);
  }

  // Rule 1: Directory with no children → remove
  if (!node.children || node.children.length === 0) {
    return null;
  }

  // Rule 2: Directory with exactly one child (and that child is a directory) → flatten
  if (!skipFlatten && node.children.length === 1 && node.children[0].type === 'directory') {
    const singleChild = node.children[0];
    return {
      ...node,
      children: singleChild.children || [],
      mappedNodeIds: [
        ...(node.mappedNodeIds || []),
        ...(singleChild.mappedNodeIds || []),
      ],
    };
  }

  // Rule 3: Directory with multiple children → keep
  return node;
}

/**
 * Recursively collect all files from the tree
 */
function collectFiles(treeNode, pathSegments) {
  const files = [];
  if (!treeNode) return files;

  if (treeNode.type === 'file') {
    files.push({
      path: [...pathSegments, treeNode.name].join('/'),
      name: treeNode.name,
      kind: treeNode.kind || '',
      mappedNodeIds: treeNode.mappedNodeIds || [],
      declarationStub: treeNode.declarationStub || '',
    });
  }

  if (treeNode.children) {
    const newPath = treeNode.type === 'directory'
      ? [...pathSegments, treeNode.name]
      : pathSegments;
    for (const child of treeNode.children) {
      files.push(...collectFiles(child, newPath));
    }
  }

  return files;
}

/**
 * Generate declaration stubs for child files (Rust pub mod / Go package / TS barrel)
 *
 * @param {object} dirNode - Directory node ({name, type, children})
 * @param {string} lang - Language name ('rust' | 'go' | 'typescript')
 * @returns {string|null} Declaration string, or null if no children
 */
function generateDeclarationStub(dirNode, lang) {
  if (!dirNode || !dirNode.children || dirNode.children.length === 0) return null;

  const files = dirNode.children.filter(c => c.type === 'file');
  const subdirs = dirNode.children.filter(c => c.type === 'directory');
  const declarations = [];

  switch (lang) {
    case 'rust': {
      // mod.rs is equivalent to a self declaration, so skip it
      const modDecls = files
        .filter(f => path.basename(f.name, '.rs') !== 'mod')
        .map(f => `pub mod ${path.basename(f.name, '.rs')};`);
      const subModDecls = subdirs.map(d => `pub mod ${d.name};`);
      declarations.push(...modDecls, ...subModDecls);
      break;
    }
    case 'go': {
      declarations.push(`package ${dirNode.name}`);
      break;
    }
    case 'typescript': {
      // index.ts is equivalent to the barrel itself, so skip it
      const barrel = files
        .filter(f => path.basename(f.name, '.ts') !== 'index')
        .map(f => `export * from './${path.basename(f.name, '.ts')}';`);
      const subBarrel = subdirs.map(d => `export * from './${d.name}';`);
      declarations.push(...barrel, ...subBarrel);
      break;
    }
    default:
      return null;
  }

  return declarations.length > 0 ? declarations.join('\n') : null;
}

/**
 * Generate a Markdown report
 *
 * @param {object} graph - Graph object
 * @param {object|null} dirsTree - buildDirectoryTree return value tree
 * @param {string} lang - Language name
 * @returns {string} Markdown report
 */
function generateReport(graph, dirsTree, lang) {
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];
  const langName = { rust: 'Rust', go: 'Go', typescript: 'TypeScript' }[lang] || lang;

  const lines = [];
  lines.push(`# Directory Tree Report (${langName})`);
  lines.push('');
  lines.push(`Generated at: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Statistics');
  lines.push('');
  lines.push(`- Total nodes: ${nodes.length}`);
  lines.push(`- Total edges: ${edges.length}`);
  lines.push(`- Target language: ${langName}`);

  // Collect total file count
  const files = dirsTree ? collectFiles(dirsTree, []) : [];
  lines.push(`- Generated files: ${files.length}`);

  // Statistics by kind
  const kindCounts = {};
  for (const node of nodes) {
    const kind = node.kind || 'unknown';
    kindCounts[kind] = (kindCounts[kind] || 0) + 1;
  }
  lines.push('');
  lines.push('### Node count by kind');
  lines.push('');
  lines.push('| kind | Count |');
  lines.push('|------|-------|');
  for (const [kind, count] of Object.entries(kindCounts).sort()) {
    lines.push(`| ${kind} | ${count} |`);
  }

  // Tree structure
  if (dirsTree) {
    lines.push('');
    lines.push('## Directory Tree');
    lines.push('');
    lines.push('```');
    lines.push(...renderTreeAscii(dirsTree));
    lines.push('```');
  }

  // File list
  if (files.length > 0) {
    lines.push('');
    lines.push('## File List');
    lines.push('');
    for (const file of files) {
      lines.push(`- ${file.path}`);
    }
  }

  return lines.join('\n');
}

/**
 * Render a directory tree in ASCII tree format
 *
 * @param {object} node - Tree node
 * @param {string} prefix - Line prefix
 * @returns {string[]} Array of tree lines
 */
function renderTreeAscii(node, prefix) {
  if (!node) return [];
  const lines = [];
  const name = node.name || '(unnamed)';
  const suffix = node.type === 'directory' ? '/' : '';
  lines.push(`${prefix || ''}${name}${suffix}`);

  if (node.children && node.children.length > 0) {
    for (let i = 0; i < node.children.length; i++) {
      const isLast = i === node.children.length - 1;
      const childPrefix = (prefix || '') + (isLast ? '    ' : '│   ');
      lines.push(
        ...renderTreeAscii(node.children[i], childPrefix)
          .map((l, idx) => idx === 0
            ? `${prefix || ''}${isLast ? '└── ' : '├── '}${l.slice((prefix || '').length)}`
            : l)
      );
    }
  }

  return lines;
}

// ============================================================
// Cross-reference computation (computeCrossReferences)
// PX-30: Link prose-type node design info to connected files
// ============================================================

/**
 * Collect prose-type kind (rationale/glossary/requirement) nodes and
 * resolve connected node file paths by traversing graph edges.
 *
 * Prose nodes with no edges will have an empty connections array.
 *
 * @param {{ nodes: object[], edges: Array<{from:string, to:string, type:string}> }} graph - Graph
 * @param {object} nodeToDirMap - Node ID → directory path mapping
 * @param {object} [nodeToFilePathMap] - Node ID → file path mapping (falls back to nodeToDirMap)
 * @returns {Array<{nodeId:string, kind:string, title:string, headingRef?:string, connections:Array<{toFile:string, edgeType:string, direction:string}>}>}
 */
function computeCrossReferences(graph, nodeToDirMap, nodeToFilePathMap) {
  const PROSE_KINDS = new Set(['rationale', 'glossary', 'requirement']);
  const proseNodes = (graph.nodes || []).filter(function (n) {
    return PROSE_KINDS.has(n.kind);
  });

  const edges = graph.edges || [];
  const nodeMap = {};
  for (let i = 0; i < (graph.nodes || []).length; i++) {
    const node = graph.nodes[i];
    nodeMap[node.id] = node;
  }

  const result = [];

  for (let i = 0; i < proseNodes.length; i++) {
    const prose = proseNodes[i];
    const connections = [];

    // Collect all edges with this prose node as an endpoint
    for (let j = 0; j < edges.length; j++) {
      const edge = edges[j];
      if (edge.from === prose.id || edge.to === prose.id) {
        // Connected node ID (the one that is not prose)
        const connectedNodeId = edge.from === prose.id ? edge.to : edge.from;
        const connectedNode = nodeMap[connectedNodeId];
        const connectedDir = connectedNode ? nodeToDirMap[connectedNodeId] : undefined;
        // Prefer file path if available, otherwise use directory name (backward compatibility)
        const connectedFile = (nodeToFilePathMap && connectedNodeId)
          ? (nodeToFilePathMap[connectedNodeId] || connectedDir)
          : connectedDir;

        if (connectedFile) {
          // Direction: "→" for prose → other, "←" for other → prose
          const direction = edge.from === prose.id ? '→' : '←';
          connections.push({
            toNodeId: connectedNodeId,
            toFile: connectedFile,
            edgeType: edge.type,
            direction: direction,
          });
        }
      }
    }

    result.push({
      nodeId: prose.id,
      kind: prose.kind,
      title: prose.title || '',
      headingRef: prose.headingRef || undefined,
      connections: connections,
    });
  }

  return result;
}

module.exports = {
  KIND_FILE_RULES,
  INLINE_KINDS,
  BACKBONE_KINDS,
  PROSE_KINDS,
  buildDomainHierarchy,
  resolveDirForNode,
  resolveNodeToDirMap,
  buildDirectoryTree,
  findRuleDrivenNodes,
  mergeTopLevelNodes,
  pruneEmptyDirectories,
  collectDescendantIds,
  collectFiles,
  computeCrossReferences,
  generateDeclarationStub,
  generateReport,
  // For testing
  renderTreeAscii,
};
