'use strict';

/**
 * PX-442 — workspace-level proof isolation.
 *
 * A proof may mutate a package file while its tests read a sibling artifact
 * through a relative include. Copying only the package breaks that relative
 * path. The isolated tree therefore mirrors the project root: the package sits
 * at its project-relative location and every required external path is copied
 * to the same relative location. A missing or escaping path fails closed.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CONFIG_FILE_NAME = 'CONTRACT-INVENTORY-CONFIG.json';
const INCLUDE_PATTERN = /\binclude_(?:str|bytes)!\s*\(\s*"([^"]+)"\s*\)/g;
const COPY_SKIP = new Set(['node_modules', '.git', 'target', 'dist', 'build', '.next', 'vendor']);
const TEMP_PREFIX = 'px442-workspace-';

const PROOF_WORKSPACE_INCOMPLETE = 'PROOF_WORKSPACE_INCOMPLETE';
const PROOF_WORKSPACE_ESCAPE = 'PROOF_WORKSPACE_ESCAPE';

/** Whether a value is a non-empty string. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

/** A path in the portable form the workspace reports. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function toPosix(relativePath) {
  return String(relativePath ?? '').split(path.sep).join('/');
}

/** Whether `target` is `base` or below it. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function isInside(base, target) {
  const relative = path.relative(path.resolve(base), path.resolve(target));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/** The configured workspace roots, resolved to absolute paths. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function workspaceRootsOf({ cwd, workspaceRoots = undefined }) {
  if (Array.isArray(workspaceRoots) && workspaceRoots.length > 0) {
    return workspaceRoots.filter(isNonEmptyString).map((root) => path.resolve(cwd, root));
  }
  const configPath = path.join(cwd, CONFIG_FILE_NAME);
  if (!fs.existsSync(configPath)) return [];
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!Array.isArray(config.proofWorkspaceRoots)) return [];
    return config.proofWorkspaceRoots.filter(isNonEmptyString).map((root) => path.resolve(cwd, root));
  } catch {
    // The roots are optional: an unreadable config must not abort a proof.
    // Discovery still falls back to the .git ancestor or the package itself.
    return [];
  }
}

/** The ancestor that contains both the package and its external inputs. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function discoverProjectRoot({ cwd, workspaceRoots = undefined }) {
  const roots = workspaceRootsOf({ cwd, workspaceRoots })
    .filter((root) => isInside(root, cwd))
    .sort((left, right) => right.length - left.length);
  if (roots.length > 0) return roots[0];

  let current = path.resolve(cwd);
  for (;;) {
    if (fs.existsSync(path.join(current, '.git'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(cwd);
    current = parent;
  }
}

/** Every module specifier an include macro names. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function includeSpecifiersOf(text) {
  const specifiers = [];
  INCLUDE_PATTERN.lastIndex = 0;
  let match = INCLUDE_PATTERN.exec(text);
  while (match !== null) {
    specifiers.push(match[1]);
    match = INCLUDE_PATTERN.exec(text);
  }
  return specifiers;
}

/** Add one path to a set and its finding. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function addFinding({ findings, code, target }) {
  findings.push({ code, path: target });
}

/**
 * Discover the external files a package's includes require.
 *
 * @param {{cwd:string, files:string[], workspaceRoots?:string[]}} input
 * @returns {{ok:boolean, projectRoot:string, packageRelative:string, externalPaths:string[], missing:string[], escaped:string[], findings:object[]}}
 */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function discoverExternalInputs({ cwd, files = [], workspaceRoots = undefined }) {
  let projectRoot = discoverProjectRoot({ cwd, workspaceRoots });
  let packageRelative = toPosix(path.relative(projectRoot, path.resolve(cwd)));
  if (packageRelative.startsWith('..') || path.isAbsolute(packageRelative)) {
    projectRoot = path.resolve(cwd);
    packageRelative = '';
  }

  const external = new Set();
  const missing = new Set();
  const escaped = new Set();
  const findings = [];

  for (const file of [...new Set(files)].sort()) {
    if (!isNonEmptyString(file)) continue;
    const absolute = path.resolve(cwd, file);
    if (!fs.existsSync(absolute)) continue;
    let text;
    try {
      text = fs.readFileSync(absolute, 'utf8');
    } catch {
      const relative = toPosix(path.relative(projectRoot, absolute));
      missing.add(relative);
      addFinding({ findings, code: PROOF_WORKSPACE_INCOMPLETE, target: relative });
      continue;
    }
    for (const specifier of includeSpecifiersOf(text)) {
      const resolved = path.isAbsolute(specifier)
        ? path.resolve(specifier)
        : path.resolve(path.dirname(absolute), specifier);
      if (isInside(cwd, resolved)) continue;
      const relative = toPosix(path.relative(projectRoot, resolved));
      if (!isInside(projectRoot, resolved)) {
        escaped.add(relative);
        addFinding({ findings, code: PROOF_WORKSPACE_ESCAPE, target: relative });
        continue;
      }
      if (!fs.existsSync(resolved)) {
        missing.add(relative);
        addFinding({ findings, code: PROOF_WORKSPACE_INCOMPLETE, target: relative });
        continue;
      }
      external.add(relative);
    }
  }

  return {
    ok: missing.size === 0 && escaped.size === 0,
    projectRoot,
    packageRelative,
    externalPaths: [...external].sort(),
    missing: [...missing].sort(),
    escaped: [...escaped].sort(),
    findings,
  };
}

/** Add explicitly required paths to a discovery result. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function withExplicitPaths({ discovery, projectRoot, externalPaths }) {
  const external = new Set(discovery.externalPaths);
  const missing = new Set(discovery.missing);
  const escaped = new Set(discovery.escaped);
  const findings = [...discovery.findings];

  for (const declared of externalPaths ?? []) {
    if (!isNonEmptyString(declared)) continue;
    const resolved = path.resolve(projectRoot, declared);
    const relative = toPosix(path.relative(projectRoot, resolved));
    if (!isInside(projectRoot, resolved)) {
      escaped.add(relative);
      addFinding({ findings, code: PROOF_WORKSPACE_ESCAPE, target: relative });
      continue;
    }
    if (!fs.existsSync(resolved)) {
      missing.add(relative);
      addFinding({ findings, code: PROOF_WORKSPACE_INCOMPLETE, target: relative });
      continue;
    }
    external.add(relative);
  }

  return {
    ...discovery,
    ok: missing.size === 0 && escaped.size === 0,
    externalPaths: [...external].sort(),
    missing: [...missing].sort(),
    escaped: [...escaped].sort(),
    findings,
  };
}

/** Plan a workspace without copying anything. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function planProofWorkspace({ cwd, mutationFiles = [], includeFiles = [], externalPaths = [], workspaceRoots = undefined }) {
  const discovery = discoverExternalInputs({
    cwd,
    files: [...mutationFiles, ...includeFiles],
    workspaceRoots,
  });
  const planned = withExplicitPaths({ discovery, projectRoot: discovery.projectRoot, externalPaths });
  return { ...planned, code: planned.ok ? null : PROOF_WORKSPACE_INCOMPLETE };
}

/** Copy the package and every required external path into the isolated root. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function copyRequiredPaths({ projectRoot, root, paths }) {
  const ordered = [...new Set(paths)].sort((left, right) => left.length - right.length || (left < right ? -1 : 1));
  const copied = [];
  for (const relative of ordered) {
    if (copied.some((parent) => relative === parent || relative.startsWith(parent + '/'))) continue;
    const source = path.join(projectRoot, relative);
    const destination = path.join(root, relative);
    fs.accessSync(source, fs.constants.R_OK);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.cpSync(source, destination, {
      recursive: true,
      filter: (entry) => !COPY_SKIP.has(path.basename(entry)),
    });
    copied.push(relative);
  }
  return copied;
}

/** Remove one isolated tree. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function cleanupWorkspace(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

/** Materialize a planned workspace. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function materializeWorkspace({ cwd, plan }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  const packageRoot = plan.packageRelative === '' ? root : path.join(root, plan.packageRelative);
  try {
    fs.cpSync(cwd, packageRoot, {
      recursive: true,
      filter: (entry) => !COPY_SKIP.has(path.basename(entry)),
    });
    const workspaceRoots = copyRequiredPaths({ projectRoot: plan.projectRoot, root, paths: plan.externalPaths });
    return {
      ok: true,
      root,
      packageRoot,
      workspaceRoots,
      cleanup: () => cleanupWorkspace(root),
    };
  } catch (error) {
    cleanupWorkspace(root);
    return {
      ok: false,
      code: PROOF_WORKSPACE_INCOMPLETE,
      missing: plan.missing ?? [],
      problem: error.message,
    };
  }
}

/**
 * Resolve the isolated tree one proof runs in.
 *
 * @returns {{ok:boolean, root?:string, packageRoot?:string, workspaceRoots?:string[], code?:string, missing?:string[], escaped?:string[], findings?:object[], cleanup?:Function}}
 */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function resolveProofWorkspace({ cwd, mutationFiles = [], includeFiles = [], externalPaths = [], workspaceRoots = undefined }) {
  const plan = planProofWorkspace({ cwd, mutationFiles, includeFiles, externalPaths, workspaceRoots });
  if (!plan.ok) return plan;
  return materializeWorkspace({ cwd, plan });
}

/**
 * Reuse one isolated tree across proofs with the same external-input set.
 *
 * The pool keeps the language toolchain's build cache warm. A proof that
 * cannot restore its source evicts its tree, so a dirty copy cannot leak into
 * the next proof.
 */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function createProofWorkspacePool({ cwd, workspaceRoots = undefined }) {
  const cache = new Map();

  return {
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
    workspaceFor({ mutationFiles = [], includeFiles = [] }) {
      const plan = planProofWorkspace({ cwd, mutationFiles, includeFiles, workspaceRoots });
      if (!plan.ok) return plan;
      const key = [plan.packageRelative, ...plan.externalPaths].join('|');
      const cached = cache.get(key);
      if (cached !== undefined) return { ...cached, shared: true, poolKey: key };
      const workspace = materializeWorkspace({ cwd, plan });
      if (!workspace.ok) return workspace;
      const shared = { ...workspace, shared: true, poolKey: key };
      cache.set(key, shared);
      return shared;
    },
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
    evict(key) {
      const workspace = cache.get(key);
      if (workspace === undefined) return;
      workspace.cleanup();
      cache.delete(key);
    },
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
    cleanupAll() {
      for (const workspace of cache.values()) workspace.cleanup();
      cache.clear();
    },
  };
}

module.exports = {
  COPY_SKIP,
  PROOF_WORKSPACE_ESCAPE,
  PROOF_WORKSPACE_INCOMPLETE,
  cleanupWorkspace,
  copyRequiredPaths,
  createProofWorkspacePool,
  discoverExternalInputs,
  discoverProjectRoot,
  includeSpecifiersOf,
  planProofWorkspace,
  resolveProofWorkspace,
  workspaceRootsOf,
};
