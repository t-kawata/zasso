// PX-307 @verifies C003
// The Dirs-Tree distribution index is a projection of mappedNodeIds, not an authored
// document. A unit-bearing node that resolves to no directory or file is the failure this
// layer exists to catch.
'use strict';

/**
 * Walk every tree and record the path of each mapped node.
 *
 * The root's own name is part of the path (`src/produce.rs`), because that is the path a
 * reader of the tree sees and the path a ticket's default_files must name.
 *
 * @param {object|Array<object>} trees
 * @returns {Map<string, string[]>}
 */
// [::TICKET::] PX-307 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-307 --for-spec --no-implementation-order`.
function collectNodePaths(trees) {
  const paths = new Map();
  const roots = Array.isArray(trees) ? trees : Object.values(trees ?? {});

  const walk = (node, parentPath) => {
    if (node === null || typeof node !== 'object') return;
    const currentPath = parentPath === '' ? String(node.name ?? '') : `${parentPath}/${node.name}`;
    for (const mapped of Array.isArray(node.mappedNodeIds) ? node.mappedNodeIds : []) {
      if (typeof mapped?.nodeId !== 'string') continue;
      const list = paths.get(mapped.nodeId) ?? [];
      list.push(currentPath);
      paths.set(mapped.nodeId, list);
    }
    for (const child of Array.isArray(node.children) ? node.children : []) walk(child, currentPath);
  };

  for (const root of roots) walk(root, '');
  return paths;
}

/**
 * Walk every tree and record only the leaf file paths of each mapped node.
 *
 * The distribution index uses this map for placement: a mapped directory is a valid
 * tree node but not an implementation file, so a unit that resolves only there is
 * unmapped.
 *
 * @param {object|Array<object>} trees
 * @returns {Map<string, string[]>}
 */
// [::TICKET::] PX-319 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-319 --for-spec --no-implementation-order`.
function collectNodeFilePaths(trees) {
  const paths = new Map();
  const roots = Array.isArray(trees) ? trees : Object.values(trees ?? {});

  const walk = (node, parentPath) => {
    if (node === null || typeof node !== 'object') return;
    const currentPath = parentPath === '' ? String(node.name ?? '') : `${parentPath}/${node.name}`;
    if (node.type === 'file') {
      for (const mapped of Array.isArray(node.mappedNodeIds) ? node.mappedNodeIds : []) {
        if (typeof mapped?.nodeId !== 'string') continue;
        const list = paths.get(mapped.nodeId) ?? [];
        list.push(currentPath);
        paths.set(mapped.nodeId, list);
      }
    }
    for (const child of Array.isArray(node.children) ? node.children : []) walk(child, currentPath);
  };

  for (const root of roots) walk(root, '');
  return paths;
}

/**
 * The unit-to-node-and-path index the Dirs-Tree carries.
 *
 * @param {{ nodes?: Array<object> }} graph
 * @param {Map<string, string[]>} nodeToPaths
 * @param {string} digest
 * @returns {{ digest: string, units: object }}
 */
// [::TICKET::] PX-307, PX-319 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-307|PX-319) --for-spec --no-implementation-order`.
function buildDistributionIndex(graph, nodeToPaths, digest, nodeToFilePaths = null) {
  const units = {};
  const includeFilePaths = nodeToFilePaths !== null;
  for (const node of graph?.nodes ?? []) {
    for (const unitId of Array.isArray(node.unitIds) ? node.unitIds : []) {
      const entry = units[unitId] ?? {
        nodeIds: [],
        paths: [],
        ...(includeFilePaths ? { filePaths: [] } : {}),
      };
      if (!entry.nodeIds.includes(node.id)) entry.nodeIds.push(node.id);
      for (const path of nodeToPaths.get(node.id) ?? []) {
        if (!entry.paths.includes(path)) entry.paths.push(path);
      }
      if (includeFilePaths) {
        for (const path of nodeToFilePaths.get(node.id) ?? []) {
          if (!entry.filePaths.includes(path)) entry.filePaths.push(path);
        }
      }
      units[unitId] = entry;
    }
  }

  const sorted = {};
  for (const unitId of Object.keys(units).sort()) {
    sorted[unitId] = {
      nodeIds: [...units[unitId].nodeIds].sort(),
      paths: [...units[unitId].paths].sort(),
      ...(includeFilePaths ? { filePaths: [...units[unitId].filePaths].sort() } : {}),
    };
  }
  return { digest, units: sorted };
}

/**
 * Verify that the index and the graph agree and that every unit has a path.
 *
 * @param {{ distribution?: { units?: object } }} dirsTree
 * @param {{ nodes?: Array<object> }} graph
 * @returns {{ ok: boolean, missing: string[], invented: string[], unmapped: string[] }}
 */
// [::TICKET::] PX-307, PX-319 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-307|PX-319) --for-spec --no-implementation-order`.
function verifyDistributionCoverage(dirsTree, graph) {
  const index = dirsTree?.distribution?.units ?? {};
  const graphUnits = new Set();
  for (const node of graph?.nodes ?? []) {
    for (const unitId of Array.isArray(node.unitIds) ? node.unitIds : []) graphUnits.add(unitId);
  }

  const missing = [...graphUnits].filter((unitId) => index[unitId] === undefined);
  const invented = Object.keys(index).filter((unitId) => !graphUnits.has(unitId));
  const hasFilePaths = Object.values(index).some((entry) => Array.isArray(entry?.filePaths));
  const unmapped = [...graphUnits].filter((unitId) => {
    const entry = index[unitId];
    const candidate = hasFilePaths ? entry?.filePaths : entry?.paths;
    return (candidate ?? []).length === 0;
  });
  return {
    ok: missing.length === 0 && invented.length === 0 && unmapped.length === 0,
    missing,
    invented,
    unmapped,
  };
}

module.exports = {
  collectNodePaths,
  collectNodeFilePaths,
  buildDistributionIndex,
  verifyDistributionCoverage,
};
