#!/usr/bin/env node

/**
 * discover-boundary.js — find the workspace, package, unit, role and interfaces.
 *
 * No project name is special. The resolution order is the unit declaration, the
 * nearest language manifest, then the RFC directory. The command displays a
 * divergence between packageRoot and rfcDir rather than moving a README silently.
 */

const fs = require('fs');
const path = require('path');
const { parseTomlSubset } = require('./parse-toml-subset.js');

const WORKSPACE_MAP = 'workspace-map.auto.toml';
const TREE_MANIFEST = 'WORKSPACIFY-TREE-MANIFEST.json';
const LANGUAGE_MANIFESTS = [
  ['Cargo.toml', 'rust'],
  ['package.json', 'typescript'],
  ['pyproject.toml', 'python'],
  ['go.mod', 'go'],
];

// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function isDirectory(candidate) {
  try {
    return fs.statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function isFile(candidate) {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

/**
 * Walk up to the workspace root.
 *
 * @param {string} startDir
 * @returns {string}
 */
// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function findWorkspaceRoot(startDir) {
  let current = path.resolve(startDir);
  while (true) {
    if (isDirectory(path.join(current, '.git')) || isFile(path.join(current, TREE_MANIFEST))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(startDir);
    current = parent;
  }
}

// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function loadWorkspaceMap(workspaceRoot) {
  const file = path.join(workspaceRoot, WORKSPACE_MAP);
  if (!isFile(file)) return { units: [] };
  return { units: parseTomlSubset(fs.readFileSync(file, 'utf8')).unit || [] };
}

// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function relativePath(rfcDir, workspaceRoot) {
  const relative = path.relative(workspaceRoot, rfcDir).replace(/\\/g, '/');
  return relative === '' ? '.' : relative;
}

// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function unitMatches(unit, relative) {
  for (const pattern of unit.paths || []) {
    if (pattern === '/**' || pattern === '**' || pattern === '.') return true;
    const prefix = String(pattern).replace(/\/\*\*$/, '').replace(/\/\*$/, '');
    if (relative === prefix || relative.startsWith(`${prefix}/`)) return true;
  }
  return false;
}

// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function unitPackagePath(unit, workspaceRoot) {
  for (const pattern of unit.paths || []) {
    if (pattern === '/**' || pattern === '**') return workspaceRoot;
    const prefix = String(pattern).replace(/\/\*\*$/, '').replace(/\/\*$/, '');
    if (prefix !== '') return path.join(workspaceRoot, prefix);
  }
  return workspaceRoot;
}

/**
 * Find the package root.
 *
 * @param {string} rfcDir
 * @param {string} workspaceRoot
 * @returns {string}
 */
// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function findPackageRoot(rfcDir, workspaceRoot) {
  const relative = relativePath(rfcDir, workspaceRoot);
  const map = loadWorkspaceMap(workspaceRoot);
  const unit = map.units.find((candidate) => unitMatches(candidate, relative));
  if (unit) return unitPackagePath(unit, workspaceRoot);

  let current = path.resolve(rfcDir);
  const boundary = path.resolve(workspaceRoot);
  while (current.startsWith(boundary)) {
    if (LANGUAGE_MANIFESTS.some(([name]) => isFile(path.join(current, name)))) return current;
    if (current === boundary) break;
    current = path.dirname(current);
  }
  return path.resolve(rfcDir);
}

// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function detectLanguage(packageRoot) {
  for (const [name, language] of LANGUAGE_MANIFESTS) {
    if (isFile(path.join(packageRoot, name))) return language;
  }
  return 'unknown';
}

/**
 * Discover one package boundary.
 *
 * @param {{rfcDir: string, workspaceRoot?: string}} input
 * @returns {object}
 */
// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function discoverBoundary({ rfcDir, workspaceRoot = null } = {}) {
  const resolvedRfcDir = path.resolve(rfcDir);
  const resolvedWorkspace = path.resolve(workspaceRoot || findWorkspaceRoot(resolvedRfcDir));
  const packageRoot = findPackageRoot(resolvedRfcDir, resolvedWorkspace);
  const relative = relativePath(resolvedRfcDir, resolvedWorkspace);
  const map = loadWorkspaceMap(resolvedWorkspace);
  const unit = map.units.find((candidate) => unitMatches(candidate, relative));
  const fallbackId = path.relative(resolvedWorkspace, packageRoot).replace(/\\/g, '/').replace(/\//g, '__') || path.basename(resolvedWorkspace);

  return {
    workspaceRoot: resolvedWorkspace,
    packageRoot,
    unitId: unit ? unit.id : fallbackId,
    role: unit ? unit.role || '' : '',
    interfaces: unit && Array.isArray(unit.interfaces) ? unit.interfaces : [],
    sourceLanguage: detectLanguage(packageRoot),
    rfcDir: resolvedRfcDir,
    packageReadmePath: path.join(packageRoot, 'README.md'),
    workspaceReadmePath: path.join(resolvedWorkspace, 'README.md'),
    packageRootDiffersFromRfcDir: packageRoot !== resolvedRfcDir,
  };
}

/** The scalar fields the command shells out for. */
const FIELD_EXTRACTORS = {
  // [::TICKET::] PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-452 --for-spec --no-implementation-order`.
  packageRoot: (boundary) => boundary.packageRoot,
  workspaceRoot: (boundary) => boundary.workspaceRoot,
  workspaceReadmePath: (boundary) => boundary.workspaceReadmePath,
  packageReadmePath: (boundary) => boundary.packageReadmePath,
  unitId: (boundary) => boundary.unitId,
  role: (boundary) => boundary.role,
  interfaces: (boundary) => boundary.interfaces.join(','),
  sourceLanguage: (boundary) => boundary.sourceLanguage,
};

if (require.main === module) {
  const argv = process.argv.slice(2);
  let rfcDir = process.cwd();
  let field = null;
  for (const arg of argv) {
    if (arg.startsWith('--field=')) field = arg.slice('--field='.length);
    else rfcDir = arg;
  }
  try {
    const boundary = discoverBoundary({ rfcDir });
    if (field !== null) {
      const extractor = FIELD_EXTRACTORS[field];
      if (!extractor) {
        console.error(`[ERROR] Unknown field: ${field}`);
        console.error(`Cause: supported fields are ${Object.keys(FIELD_EXTRACTORS).join(', ')}`);
        console.error('Action: Pass --field=<name> with one of the supported names.');
        process.exit(2);
      }
      process.stdout.write(`${extractor(boundary)}\n`);
      process.exit(0);
    }
    process.stdout.write(`${JSON.stringify(boundary, null, 2)}\n`);
  } catch (error) {
    console.error('[ERROR] Boundary discovery failed.');
    console.error(`Cause: ${error.message}`);
    console.error('Action: Fix the workspace map or language manifest that could not be read.');
    process.exit(1);
  }
}

module.exports = {
  WORKSPACE_MAP,
  TREE_MANIFEST,
  findWorkspaceRoot,
  findPackageRoot,
  discoverBoundary,
  loadWorkspaceMap,
};
