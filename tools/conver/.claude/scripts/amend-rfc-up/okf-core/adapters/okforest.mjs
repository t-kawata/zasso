// [::TICKET::] PX-428 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-428 --for-spec --no-implementation-order`.
// [::TICKET::] PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-427 --for-spec --no-implementation-order`.
/**
 * Read an OKF bundle through @okforest/okf and expose the engine model.
 *
 * The library owns frontmatter, mdast links, footnotes, trust tiers, status,
 * staleness, and backlinks. This adapter only adds path-based lookup and the
 * directory view the CLI needs.
 */

import { parseTree, buildInventory, deriveTrustTier, deriveStatus, isStaleAt, normalizeSources } from '@okforest/okf';
import { readTree } from '@okforest/okf/node';
import { posix } from 'node:path';
import { mapLinkToEdge } from '../graph/build.mjs';

export async function loadBundle(root) {
  const tree = await readTree(root);
  const directories = collectDirectories(tree.files);
  return {
    root,
    tree,
    concepts: tree.concepts,
    byId: new Map(tree.concepts.map((concept) => [concept.id, concept])),
    dependents: buildDependentsIndex(tree.concepts),
    reserved: tree.reserved,
    files: tree.files,
    directories,
    diagnostics: collectLibraryDiagnostics(tree),
  };
}

/**
 * Normalize the x-requires relation into a reverse index.
 *
 * OKF graph edges come from body links only, so a required concept has no
 * backlink on its own. The index makes "which concepts require this one"
 * answerable without re-reading every frontmatter block on each hop.
 */
export function buildDependentsIndex(concepts) {
  const dependents = new Map();
  for (const concept of concepts) {
    for (const requiredId of concept.frontmatter?.['x-requires'] ?? []) {
      if (!dependents.has(requiredId)) dependents.set(requiredId, []);
      dependents.get(requiredId).push(concept.id);
    }
  }
  for (const ids of dependents.values()) ids.sort();
  return dependents;
}

export function getDependents(bundle, id) {
  const ids = bundle.dependents?.get(id) ?? [];
  return ids.map((dependentId) => getConcept(bundle, dependentId)).filter(Boolean);
}

export function collectLibraryDiagnostics(tree) {
  const diagnostics = [];
  for (const concept of tree.concepts) {
    if (concept.frontmatterError) {
      diagnostics.push({
        code: 'FRONTMATTER_INVALID',
        path: concept.path,
        line: concept.frontmatterError.line,
        column: concept.frontmatterError.column,
        message: concept.frontmatterError.message,
      });
    }
  }
  return diagnostics;
}

export function getConcept(bundle, id) {
  return bundle.byId.get(id) ?? bundle.tree.concept(id) ?? null;
}

export function getOutgoing(bundle, id) {
  const concept = getConcept(bundle, id);
  return (concept?.links ?? []).map(mapLinkToEdge);
}

export function getIncoming(bundle, id) {
  const backlinks = bundle.tree.backlinks(id)
    .map(mapLinkToEdge)
    .map((edge) => ({ ...edge, kind: 'backlink' }));
  const dependents = getDependents(bundle, id).map((concept) => ({
    from: concept.id,
    to: id,
    rawTarget: id,
    resolvedPath: concept.path,
    origin: 'x-requires',
    state: 'resolved',
    kind: 'dependent',
  }));
  return [...backlinks, ...dependents];
}

export function listDirectory(bundle, directory = '') {
  const normalized = normalizeDirectory(directory);
  const entries = [];
  for (const child of directChildren(bundle, normalized)) {
    entries.push(child);
  }
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

// [::TICKET::] PX-425, PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-425|PX-426) --for-spec --no-implementation-order`.
function directChildren(bundle, directory) {
  const prefix = directory === '' ? '' : `${directory}/`;
  const children = new Map();
  for (const path of bundle.files) {
    if (!path.startsWith(prefix)) continue;
    const rest = path.slice(prefix.length);
    if (rest.length === 0) continue;
    const slash = rest.indexOf('/');
    if (slash >= 0) {
      const child = `${prefix}${rest.slice(0, slash)}`;
      children.set(child, { path: child, kind: 'directory' });
      continue;
    }
    children.set(path, entryFor(bundle, path));
  }
  return [...children.values()];
}

// [::TICKET::] PX-425, PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-425|PX-426) --for-spec --no-implementation-order`.
function entryFor(bundle, path) {
  if (path.endsWith('/index.md') || path.endsWith('/log.md') || path === 'index.md' || path === 'log.md') {
    return { path, kind: 'reserved' };
  }
  if (path.endsWith('.md')) {
    return { path, kind: 'concept', id: path.replace(/\.md$/, '') };
  }
  return { path, kind: 'asset' };
}

// [::TICKET::] PX-425, PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-425|PX-426) --for-spec --no-implementation-order`.
function collectDirectories(files) {
  const directories = new Set(['']);
  for (const path of files) {
    let directory = posix.dirname(path);
    while (directory !== '.' && directory !== '') {
      directories.add(directory);
      directory = posix.dirname(directory);
    }
  }
  return [...directories].sort();
}

// [::TICKET::] PX-425, PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-425|PX-426) --for-spec --no-implementation-order`.
function normalizeDirectory(directory) {
  return String(directory ?? '').replace(/^\/+|\/+$/g, '');
}

export function parseSingleFile(path, text) {
  return parseTree([{ path, text }]);
}

export { buildInventory, deriveTrustTier, deriveStatus, isStaleAt, normalizeSources };
