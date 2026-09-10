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

/** Where the installer records what it installed, so a later run can tell a user edit from conver moving on. */
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
 * The decision is made from three things — the target, the source, and what was
 * installed last time — never by asking. A flag would ask the caller to know
 * something the installer can determine for itself; a prompt cannot be answered
 * by an automated session at all.
 *
 * With no record of a previous installation the answer is `preserve`: unknown
 * provenance is resolved toward safety.
 *
 * @param {{targetExists: boolean, targetDigest?: string|null, sourceDigest?: string|null, previousSourceDigest?: string|null}} params
 * @returns {'install'|'unchanged'|'update'|'preserve'}
 */
function decideFileAction({ targetExists, targetDigest, sourceDigest, previousSourceDigest }) {
  if (!targetExists) {
    return 'install';
  }
  if (targetDigest === sourceDigest) {
    return 'unchanged';
  }
  // The target still matches what we installed last time, so the only thing that
  // moved is conver itself: safe to update.
  if (previousSourceDigest && targetDigest === previousSourceDigest) {
    return 'update';
  }
  return 'preserve';
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
 * Classify what dependency resolution should do for a target .claude.
 * @param {object} params
 * @param {string} params.targetClaudeDir - Installed .claude directory
 * @param {string[]} params.dependencyEntries - Package names to resolve, e.g. ['ajv', 'sql.js']
 * @returns {{ action: 'no-dependencies' | 'resolved' | 'skip-existing-node_modules' | 'install' }}
 */
function classifyDependencyAction({ targetClaudeDir, dependencyEntries }) {
  if (!dependencyEntries || dependencyEntries.length === 0) {
    return { action: 'no-dependencies' };
  }

  const allResolved = dependencyEntries.every((dep) => isDependencyInstalled(dep, targetClaudeDir));
  if (allResolved) {
    return { action: 'resolved' };
  }

  const nodeModulesPath = path.join(targetClaudeDir, 'node_modules');
  if (fs.existsSync(nodeModulesPath)) {
    return { action: 'skip-existing-node_modules' };
  }
  return { action: 'install' };
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
 * @param {object} params
 * @param {string} params.targetClaudeDir
 * @param {string[]} params.dependencyEntries
 * @param {string[]} [params.npmArgs]
 * @param {(cmd: object) => { status: number|null, stdout?: string, stderr?: string }} [params.commandRunner]
 * @returns {{ status: 'no-dependencies'|'resolved'|'skipped-existing'|'installed'|'install-failed', error?: string, message: string }}
 */
function resolveTargetDependencies({
  targetClaudeDir,
  dependencyEntries,
  npmArgs = DEFAULT_NPM_INSTALL_ARGS,
  commandRunner = defaultCommandRunner,
}) {
  const plan = classifyDependencyAction({ targetClaudeDir, dependencyEntries });

  if (plan.action === 'no-dependencies') {
    return { status: 'no-dependencies', message: 'No dependencies declared; dependency resolution skipped.' };
  }
  if (plan.action === 'resolved') {
    return { status: 'resolved', message: 'All declared dependencies already resolve from the target; nothing to install.' };
  }
  if (plan.action === 'skip-existing-node_modules') {
    return {
      status: 'skipped-existing',
      message:
        'node_modules exists in the target but declared dependencies are missing. ' +
        'To avoid destroying pre-existing content, nothing was modified. Resolve the dependencies manually.',
    };
  }

  const install = runDependencyInstall({ targetClaudeDir, npmArgs, commandRunner });
  if (install.ok) {
    return { status: 'installed', message: 'Dependencies installed into the target .claude.' };
  }

  // Roll back only what this module created: node_modules did not exist before the install.
  fs.rmSync(path.join(targetClaudeDir, 'node_modules'), { recursive: true, force: true });
  return {
    status: 'install-failed',
    error: install.error,
    message: 'Dependency install failed; the partially-created node_modules was removed.',
  };
}

module.exports = {
  INSTALL_STATE_FILE_NAME,
  classifyDependencyAction,
  decideFileAction,
  defaultCommandRunner,
  describeSpawnFailure,
  isDependencyInstalled,
  resolveExecutable,
  runDependencyInstall,
  resolveTargetDependencies,
  readManifestDependencies,
  DEFAULT_NPM_INSTALL_ARGS,
};
