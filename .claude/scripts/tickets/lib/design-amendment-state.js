'use strict';

/**
 * Per-artifact state for the design amendment transaction.
 *
 * The README invariant says an incomplete conver project is input, not a refusal
 * condition: absence is a state here, never a thrown error. Only an unreadable
 * artifact or an ambiguous canonical name is a failure. Owner commands keep their
 * own hard prerequisites and never use this module to relax them.
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const {
  TREE_MANIFEST_NAME,
  deriveDirsTreePathFromGraph,
  findSingleSiblingPath,
  resolveGraphPath,
  resolveSourcePath,
  resolveTicketsPath,
} = require('../../lib/package-artifacts');

const ARTIFACT_KINDS = Object.freeze({
  SPEC: 'spec',
  RFC: 'rfc',
  GRAPH: 'graph',
  DIRS_TREE: 'dirs-tree',
  TICKETS: 'tickets',
});

const ARTIFACT_STATES = Object.freeze({
  PRESENT: 'present',
  ABSENT: 'absent',
  AMBIGUOUS: 'ambiguous',
  UNREADABLE: 'unreadable',
});

const ARTIFACT_ORDER = Object.freeze([
  ARTIFACT_KINDS.SPEC,
  ARTIFACT_KINDS.RFC,
  ARTIFACT_KINDS.GRAPH,
  ARTIFACT_KINDS.DIRS_TREE,
  ARTIFACT_KINDS.TICKETS,
]);

const JSON_ARTIFACTS = new Set([
  ARTIFACT_KINDS.GRAPH,
  ARTIFACT_KINDS.DIRS_TREE,
  ARTIFACT_KINDS.TICKETS,
]);

const UNREADABLE_CODE = 'UNREADABLE_ARTIFACT';

const OWNER_REQUIREMENTS = Object.freeze({
  graphify: Object.freeze([ARTIFACT_KINDS.RFC]),
  boundify: Object.freeze([ARTIFACT_KINDS.GRAPH]),
  split: Object.freeze([ARTIFACT_KINDS.GRAPH, ARTIFACT_KINDS.DIRS_TREE]),
  'workspacify-tree': Object.freeze([ARTIFACT_KINDS.SPEC]),
  'workspacify-allocate': Object.freeze([ARTIFACT_KINDS.SPEC]),
  'condense-tickets': Object.freeze([ARTIFACT_KINDS.TICKETS]),
});

/**
 * The workspace root: the git top-level of the package directory.
 *
 * gaia, crystal and doors are one-workspace-per-git-repository projects, so the
 * git root is the workspace root. A directory outside a repository has no
 * workspace; absence is a state, never a guessed sibling.
 *
 * @param {string} directory
 * @returns {string|null}
 */
// [::TICKET::] PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-405 --for-spec --no-implementation-order`.
function resolveWorkspaceRoot(directory) {
  try {
    return execFileSync('git', ['-C', path.resolve(directory), 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Read the spec path the workspace tree manifest names.
 *
 * The manifest is the only authority for the SPEC path; a missing manifest means
 * the workspace never entered the fifth layer, so the SPEC is absent, not broken.
 * The path is resolved from the workspace root, not from the package that asked.
 *
 * @param {string|null} workspaceRoot
 * @returns {{ specPath: string|null, code?: string, message?: string }}
 */
// [::TICKET::] PX-400, PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-400|PX-405) --for-spec --no-implementation-order`.
function readManifestSpecPath(workspaceRoot) {
  if (!workspaceRoot) return { specPath: null };
  const manifestPath = path.join(workspaceRoot, TREE_MANIFEST_NAME);
  if (!fs.existsSync(manifestPath)) return { specPath: null };
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const specPath = manifest?.input?.spec_path;
    if (typeof specPath !== 'string' || specPath.trim().length === 0) {
      return { specPath: null };
    }
    return { specPath: path.resolve(workspaceRoot, specPath) };
  } catch (error) {
    return { specPath: null, code: UNREADABLE_CODE, message: error.message };
  }
}

/** Resolve the Dirs-Tree beside the graph, or the canonical name when no graph exists. */
// [::TICKET::] PX-400, PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-400|PX-405) --for-spec --no-implementation-order`.
function resolveDirsTreePath({ cwd, override = null }) {
  if (override) return path.resolve(cwd, override);
  const canonical = path.join(cwd, 'RFC-Dirs-Tree.json');
  if (fs.existsSync(canonical)) return canonical;
  const graphPath = resolveGraphPath({ cwd, allowMissing: true });
  if (fs.existsSync(graphPath)) return deriveDirsTreePathFromGraph(graphPath);
  return findSingleSiblingPath(cwd, '-Dirs-Tree.json') || canonical;
}

/** Resolve the path of one artifact without requiring it to exist. */
// [::TICKET::] PX-400, PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-400|PX-405) --for-spec --no-implementation-order`.
function resolveArtifactPath({ kind, cwd, override = null, specPath = null }) {
  switch (kind) {
    case ARTIFACT_KINDS.SPEC: {
      if (override) return { path: path.resolve(cwd, override) };
      if (specPath) return { path: path.resolve(cwd, specPath) };
      const workspaceRoot = resolveWorkspaceRoot(cwd);
      const manifest = readManifestSpecPath(workspaceRoot);
      if (manifest.code) return { path: null, code: manifest.code, message: manifest.message };
      return { path: manifest.specPath };
    }
    case ARTIFACT_KINDS.RFC:
      return { path: resolveSourcePath({ cwd, override, allowMissing: true }) };
    case ARTIFACT_KINDS.GRAPH:
      return { path: resolveGraphPath({ cwd, override, allowMissing: true }) };
    case ARTIFACT_KINDS.DIRS_TREE:
      return { path: resolveDirsTreePath({ cwd, override }) };
    case ARTIFACT_KINDS.TICKETS:
      return { path: resolveTicketsPath({ cwd, override, allowMissing: true }) };
    default:
      throw new Error('unknown design artifact kind: ' + kind);
  }
}

/** Build the observable state of one resolved path. */
// [::TICKET::] PX-400, PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-400|PX-405) --for-spec --no-implementation-order`.
function inspectArtifact({ kind, resolvedPath }) {
  if (!resolvedPath) return { kind, state: ARTIFACT_STATES.ABSENT, path: null };
  if (!fs.existsSync(resolvedPath)) {
    return { kind, state: ARTIFACT_STATES.ABSENT, path: resolvedPath };
  }
  try {
    const bytes = fs.readFileSync(resolvedPath);
    if (JSON_ARTIFACTS.has(kind)) JSON.parse(bytes.toString('utf8'));
    return { kind, state: ARTIFACT_STATES.PRESENT, path: resolvedPath };
  } catch (error) {
    return {
      kind,
      state: ARTIFACT_STATES.UNREADABLE,
      path: resolvedPath,
      code: UNREADABLE_CODE,
      message: error.message,
    };
  }
}

/**
 * Resolve one artifact into present, absent, ambiguous or unreadable.
 *
 * @param {{ kind: string, cwd?: string, override?: string|null,
 *           specPath?: string|null }} input
 * @returns {{ kind: string, state: string, path: string|null, code?: string, message?: string }}
 */
// [::TICKET::] PX-400, PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-400|PX-405) --for-spec --no-implementation-order`.
function resolveArtifactState({ kind, cwd = process.cwd(), override = null, specPath = null }) {
  let resolved;
  try {
    resolved = resolveArtifactPath({ kind, cwd, override, specPath });
  } catch (error) {
    const ambiguous = typeof error.code === 'string' && error.code.startsWith('AMBIGUOUS_');
    return {
      kind,
      state: ambiguous ? ARTIFACT_STATES.AMBIGUOUS : ARTIFACT_STATES.UNREADABLE,
      path: null,
      code: error.code || UNREADABLE_CODE,
      message: error.message,
    };
  }
  if (resolved.code) {
    return { kind, state: ARTIFACT_STATES.UNREADABLE, path: null, code: resolved.code, message: resolved.message };
  }
  return inspectArtifact({ kind, resolvedPath: resolved.path });
}

/**
 * Resolve all five artifacts in the fixed pipeline order.
 *
 * The SPEC is resolved from the git top-level; every other artifact is resolved
 * from `cwd`, the package.
 */
// [::TICKET::] PX-400, PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-400|PX-405) --for-spec --no-implementation-order`.
function resolveArtifactStates({ cwd = process.cwd(), overrides = {}, specPath = null } = {}) {
  return ARTIFACT_ORDER.map((kind) => resolveArtifactState({
    kind,
    cwd,
    override: overrides[kind] ?? null,
    specPath,
  }));
}

/**
 * The package-level state, delegated to the existing canon-state classifier.
 *
 * A second state machine would drift from the one `/grill-me-for-rfc` uses.
 *
 * @param {string} directory
 * @returns {Promise<object>}
 */
// [::TICKET::] PX-400, PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-400|PX-405) --for-spec --no-implementation-order`.
async function resolvePackageState(directory) {
  const module = await import('../../grill-me-for-rfc/canon-state.js');
  return module.classifyCanonState(path.resolve(directory));
}

module.exports = {
  ARTIFACT_KINDS,
  ARTIFACT_STATES,
  ARTIFACT_ORDER,
  OWNER_REQUIREMENTS,
  readManifestSpecPath,
  resolveArtifactState,
  resolveArtifactStates,
  resolvePackageState,
  resolveWorkspaceRoot,
};
