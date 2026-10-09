/**
 * install-deps.cjs — Safe, non-destructive dependency resolution for install.js
 *
 * install.js copies the source .claude tree to a target, where the installed
 * scripts depend on npm packages (ajv, sql.js) declared in .claude/package.json.
 * This module decides whether and how to make those dependencies resolvable
 * from the target without ever destroying pre-existing content:
 *
 *  1. Verify first — if every dependency already resolves, do nothing.
 *  2. Never modify an existing node_modules — if one exists but the dependencies
 *     are missing, skip with a report.
 *  3. Install only into a node_modules that does not exist yet, using safe npm
 *     flags (no lifecycle scripts, no audit, no fund).
 *  4. On failure, remove the node_modules this module created (rollback).
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

/** Safe npm flags: no audit/fund network chatter and no package lifecycle scripts. */
const DEFAULT_NPM_INSTALL_ARGS = ['install', '--no-audit', '--no-fund', '--ignore-scripts'];

/** Where the installer records what it installed and what it found, so a later run can tell a user edit from conver moving on. */
const INSTALL_STATE_FILE_NAME = '.conver-install-state.json';

/**
 * Resolve a command name for a platform — a pure function, so the Windows
 * branch can be asserted on a machine that is not Windows.
 *
 * On Windows `npm` is `npm.cmd`, and a shell-less spawn cannot resolve a `.cmd`:
 * the call fails with ENOENT and the caller sees `status: null`, which is how a
 * Windows-only failure once survived with the message "npm install failed".
 *
 * @param {{platform: string, command: string}} params
 * @returns {string} the executable name to spawn
 */
function resolveExecutable({ platform, command }) {
  if (platform === 'win32' && !command.endsWith('.cmd') && !command.endsWith('.exe')) {
    return `${command}.cmd`;
  }
  return command;
}

/**
 * Describe a failed spawn by naming the command and the platform.
 *
 * "npm install failed" names a symptom and hides the cause; the operator needs
 * to know that `npm.cmd` was attempted, on win32, and was not found.
 *
 * @param {{command: string, platform: string, status: number|null, stderr?: string, stdout?: string}} params
 * @returns {string}
 */
function describeSpawnFailure({ command, platform, status, stderr, stdout }) {
  if (status === null) {
    return `could not run "${command}" on ${platform} — the command was not found or could not be executed`;
  }
  const detail = (stderr || stdout || '').trim();
  return `"${command}" exited with status ${status} on ${platform}${detail ? `: ${detail}` : ''}`;
}

/**
 * Decide what to do with a file that already exists at the install target.
 *
 * The decision is made from the target, the source, and what the installer has seen
 * at this path before — never by asking. A flag would ask the caller to know
 * something the installer can determine for itself; a prompt cannot be answered
 * by an automated session at all.
 *
 * Two observations are needed rather than one, because they answer different questions and
 * neither implies the other. `previousSourceDigest` says the installer once wrote this path, so
 * content that differs from it is an edit and stays preserved. `previouslyObservedDigest` says
 * the installer once found content there it had not written, which is all a foreign tree ever
 * offers: without it a file the installer never installed is indistinguishable from an edit
 * forever and stays at its old revision however far conver moves on. Recording only the second
 * would be worse than recording neither — a preserved edit would be read as a stale copy and
 * overwritten on the following run.
 *
 * With no observation of either kind the answer is `preserve`: unknown provenance is
 * resolved toward safety.
 *
 * A local file is the one thing the installer never replaces once it exists. It accumulates
 * state belonging to the project that holds it, so its content is not conver's to move.
 *
 * @param {{targetExists: boolean, targetDigest?: string|null, sourceDigest?: string|null,
 *   previousSourceDigest?: string|null, previouslyObservedDigest?: string|null,
 *   isLocalFile?: boolean}} params
 * @returns {'install'|'unchanged'|'update'|'preserve'}
 */
// [::TICKET::] P22-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-1 --for-spec --no-implementation-order`.
function decideFileAction({
  targetExists,
  targetDigest,
  sourceDigest,
  previousSourceDigest,
  previouslyObservedDigest,
  isLocalFile,
}) {
  if (!targetExists) {
    return 'install';
  }
  if (targetDigest === sourceDigest) {
    return 'unchanged';
  }
  if (isLocalFile) {
    return 'preserve';
  }
  // The target still matches what we installed last time, so the only thing that
  // moved is conver itself: safe to update.
  if (previousSourceDigest && targetDigest === previousSourceDigest) {
    return 'update';
  }
  // We installed this path and its content is no longer what we put there, so the project
  // changed it: that is an edit, and an edit is not ours to move.
  if (previousSourceDigest) {
    return 'preserve';
  }
  // We never installed this path, and nothing has changed it since we looked: the only thing
  // that moved is conver, so the copy we found is a revision rather than an edit.
  if (previouslyObservedDigest && targetDigest === previouslyObservedDigest) {
    return 'update';
  }
  return 'preserve';
}

/** Files a project owns once they exist: installed into an empty target, then never replaced. */
// [::TICKET::] P22-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-1 --for-spec --no-implementation-order`.
const LOCAL_FILE_NAMES = Object.freeze(['settings.local.json']);

/**
 * Whether a path names a file whose content belongs to the project holding it.
 *
 * Matched by file name rather than by full path, so the answer survives the file being
 * moved inside the tree.
 *
 * @param {string} relativePath - a path relative to the `.claude` directory
 * @returns {boolean}
 */
// [::TICKET::] P22-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-1 --for-spec --no-implementation-order`.
function isLocalFilePath(relativePath) {
  return LOCAL_FILE_NAMES.includes(path.basename(relativePath));
}

/**
 * Read the `dependencies` object of a package manifest.
 * @param {string} manifestPath - Path to package.json
 * @returns {object} The declared dependencies (empty object when absent/unreadable)
 */
function readManifestDependencies(manifestPath) {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return manifest.dependencies || {};
  } catch {
    return {};
  }
}

/**
 * Whether a package is installed and reachable from a directory.
 *
 * Presence is tested on disk by walking up the directory tree the way Node
 * itself does, rather than through `require.resolve` — a package whose `exports`
 * map does not expose a root entry (an ESM-only package, for instance) is
 * installed and importable by its real specifier while `require.resolve` still
 * throws ERR_PACKAGE_PATH_NOT_EXPORTED. Testing with `require.resolve` would
 * report such a package as missing forever, and a diagnosis that cries wolf is
 * worse than no diagnosis.
 *
 * @param {string} dependency - package name, possibly scoped
 * @param {string} fromDir - directory to start walking up from
 * @returns {boolean}
 */
function isDependencyInstalled(dependency, fromDir) {
  let current = path.resolve(fromDir);
  for (;;) {
    if (fs.existsSync(path.join(current, 'node_modules', dependency, 'package.json'))) {
      return true;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return false;
    }
    current = parent;
  }
}

/**
 * What dependency resolution can decide.
 *
 * One constant rather than the same string literals repeated across the classifier and the
 * resolver, so a comparison against a misspelled value is a reference error instead of a
 * branch that silently never matches.
 */
const DEPENDENCY_ACTIONS = Object.freeze({
  NONE: 'no-dependencies',
  RESOLVED: 'resolved',
  SKIP_EXISTING: 'skip-existing-node_modules',
  INSTALL_MISSING: 'install-missing',
  INSTALL: 'install',
});

/**
 * What resolution reports back.
 *
 * Separate from the plan because there are five plans and four outcomes: adding a missing
 * declaration and filling an empty tree both end as `installed`. The names are the ones this
 * module has always reported and are unchanged by the extra plan.
 */
const RESOLUTION_STATUS = Object.freeze({
  NONE: 'no-dependencies',
  RESOLVED: 'resolved',
  SKIPPED: 'skipped-existing',
  INSTALLED: 'installed',
  FAILED: 'install-failed',
});

/**
 * The top-level packages in a `node_modules` that the declared set does not account for.
 *
 * Declared is not the same as accounted for. The installed tree of this project holds four
 * packages that no manifest names, because they are the dependencies of one that does;
 * calling those extraneous would refuse to resolve a tree that is exactly right. So the walk
 * starts at the declared names and follows each installed package's own dependencies, and
 * what it does not reach is what a reify would remove.
 *
 * @param {object} params
 * @param {string} params.targetClaudeDir - directory whose node_modules is read
 * @param {string[]} params.dependencyEntries - the names the manifest declares
 * @returns {string[]} the names present that the closure does not reach
 */
// [::TICKET::] PX-250 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-250 --for-spec --no-implementation-order`.
function extraneousPackages({ targetClaudeDir, dependencyEntries }) {
  const nodeModulesPath = path.join(targetClaudeDir, 'node_modules');
  if (!fs.existsSync(nodeModulesPath)) {
    return [];
  }

  const accounted = new Set();
  const pending = [...(dependencyEntries ?? [])];
  while (pending.length > 0) {
    const name = pending.pop();
    if (accounted.has(name)) {
      continue;
    }
    accounted.add(name);
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(nodeModulesPath, name, 'package.json'), 'utf8'));
      pending.push(...Object.keys(manifest.dependencies ?? {}));
    } catch {
      // A declared package that is not installed has no manifest to read. Its absence is
      // what install-missing exists for, and it accounts for nothing.
    }
  }

  return topLevelPackageNames(nodeModulesPath).filter((name) => !accounted.has(name));
}

/**
 * The package names directly inside a `node_modules`, scoped names included.
 *
 * A scoped package is a directory holding more directories, so a plain listing would report
 * `@scope` as a package and never name the one that is installed.
 *
 * @param {string} nodeModulesPath
 * @returns {string[]}
 */
// [::TICKET::] PX-250 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-250 --for-spec --no-implementation-order`.
function topLevelPackageNames(nodeModulesPath) {
  const names = [];
  for (const entry of fs.readdirSync(nodeModulesPath, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) {
      continue;
    }
    if (!entry.name.startsWith('@')) {
      names.push(entry.name);
      continue;
    }
    for (const scoped of fs.readdirSync(path.join(nodeModulesPath, entry.name), { withFileTypes: true })) {
      if (scoped.isDirectory()) {
        names.push(`${entry.name}/${scoped.name}`);
      }
    }
  }
  return names;
}

/**
 * Classify what dependency resolution should do for a target .claude.
 * @param {object} params
 * @param {string} params.targetClaudeDir - Installed .claude directory
 * @param {string[]} params.dependencyEntries - Package names to resolve, e.g. ['ajv', 'sql.js']
 * @returns {{ action: string }}
 */
// [::TICKET::] PX-250 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-250 --for-spec --no-implementation-order`.
function classifyDependencyAction({ targetClaudeDir, dependencyEntries }) {
  if (!dependencyEntries || dependencyEntries.length === 0) {
    return { action: DEPENDENCY_ACTIONS.NONE };
  }

  const allResolved = dependencyEntries.every((dep) => isDependencyInstalled(dep, targetClaudeDir));
  if (allResolved) {
    return { action: DEPENDENCY_ACTIONS.RESOLVED };
  }

  const nodeModulesPath = path.join(targetClaudeDir, 'node_modules');
  if (!fs.existsSync(nodeModulesPath)) {
    return { action: DEPENDENCY_ACTIONS.INSTALL };
  }

  // A tree that holds something the manifest does not account for is one a reify would
  // damage; a tree that holds nothing else has only the absent declaration to resolve.
  if (extraneousPackages({ targetClaudeDir, dependencyEntries }).length > 0) {
    return { action: DEPENDENCY_ACTIONS.SKIP_EXISTING };
  }
  return { action: DEPENDENCY_ACTIONS.INSTALL_MISSING };
}

/**
 * Default command runner: spawns a process synchronously and returns its result.
 *
 * The executable name is resolved from the platform rather than assumed, so a
 * Windows `.cmd` shim is reachable from a shell-less spawn.
 *
 * @returns {{ status: number|null, stdout: string, stderr: string }}
 */
function defaultCommandRunner({ command, args, cwd, platform = process.platform }) {
  return spawnSync(resolveExecutable({ platform, command }), args, { cwd, encoding: 'utf8' });
}

/**
 * Run `npm install` in the target .claude using safe flags.
 * @param {object} params
 * @param {string} params.targetClaudeDir
 * @param {string[]} [params.npmArgs]
 * @param {(cmd: object) => { status: number|null, stdout?: string, stderr?: string }} [params.commandRunner]
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
function runDependencyInstall({
  targetClaudeDir,
  npmArgs = DEFAULT_NPM_INSTALL_ARGS,
  commandRunner = defaultCommandRunner,
  platform = process.platform,
}) {
  const result = commandRunner({ command: 'npm', args: npmArgs, cwd: targetClaudeDir, platform });
  if (result.status === 0) {
    return { ok: true };
  }
  return { ok: false, error: describeSpawnFailure({ command: resolveExecutable({ platform, command: 'npm' }), platform, ...result }) };
}

/**
 * Resolve dependencies for a target .claude following the safe policy.
 *
 * Every answer carries the sentence a reader needs, because the function that decides the
 * status is the only one that knows which case was met. A caller holding a status-to-sentence
 * table of its own would be a second place for the two to disagree.
 *
 * @param {object} params
 * @param {string} params.targetClaudeDir
 * @param {string[]} params.dependencyEntries
 * @param {string[]} [params.npmArgs]
 * @param {(cmd: object) => { status: number|null, stdout?: string, stderr?: string }} [params.commandRunner]
 * @returns {{ status: string, error?: string, message: string }}
 */
// [::TICKET::] PX-250 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-250 --for-spec --no-implementation-order`.
function resolveTargetDependencies({
  targetClaudeDir,
  dependencyEntries,
  npmArgs = DEFAULT_NPM_INSTALL_ARGS,
  commandRunner = defaultCommandRunner,
}) {
  const plan = classifyDependencyAction({ targetClaudeDir, dependencyEntries });

  if (plan.action === DEPENDENCY_ACTIONS.NONE) {
    return { status: RESOLUTION_STATUS.NONE, message: 'No dependencies are declared, so none were installed.' };
  }
  if (plan.action === DEPENDENCY_ACTIONS.RESOLVED) {
    return { status: RESOLUTION_STATUS.RESOLVED, message: 'Every declared dependency already resolves; nothing was installed.' };
  }
  if (plan.action === DEPENDENCY_ACTIONS.SKIP_EXISTING) {
    return {
      status: RESOLUTION_STATUS.SKIPPED,
      message:
        'node_modules exists and holds a package the manifest does not account for, ' +
        'so nothing was modified. Resolve the dependencies manually.',
    };
  }

  const install = runDependencyInstall({ targetClaudeDir, npmArgs, commandRunner });
  if (install.ok) {
    return {
      status: RESOLUTION_STATUS.INSTALLED,
      message: plan.action === DEPENDENCY_ACTIONS.INSTALL_MISSING
        ? 'The declared dependencies that were missing were installed into the target .claude.'
        : 'Dependencies installed into the target .claude.',
    };
  }

  // Only a node_modules this run created is removed. A tree that was already there is left
  // as it was found, however the install ended: it is not this module's to discard.
  const created = plan.action === DEPENDENCY_ACTIONS.INSTALL;
  if (created) {
    fs.rmSync(path.join(targetClaudeDir, 'node_modules'), { recursive: true, force: true });
  }
  return {
    status: RESOLUTION_STATUS.FAILED,
    error: install.error,
    message: created
      ? 'Dependency install failed; the partially-created node_modules was removed.'
      : 'Dependency install failed; the existing node_modules was left as it was found.',
  };
}

module.exports = {
  INSTALL_STATE_FILE_NAME,
  classifyDependencyAction,
  decideFileAction,
  isLocalFilePath,
  defaultCommandRunner,
  describeSpawnFailure,
  isDependencyInstalled,
  resolveExecutable,
  runDependencyInstall,
  resolveTargetDependencies,
  readManifestDependencies,
  DEFAULT_NPM_INSTALL_ARGS,
};
