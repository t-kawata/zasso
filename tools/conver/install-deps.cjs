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

  const allResolved = dependencyEntries.every((dep) => {
    try {
      require.resolve(dep, { paths: [targetClaudeDir] });
      return true;
    } catch {
      return false;
    }
  });
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
 * @returns {{ status: number|null, stdout: string, stderr: string }}
 */
function defaultCommandRunner({ command, args, cwd }) {
  return spawnSync(command, args, { cwd, encoding: 'utf8' });
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
}) {
  const result = commandRunner({ command: 'npm', args: npmArgs, cwd: targetClaudeDir });
  if (result.status === 0) {
    return { ok: true };
  }
  const detail = (result.stderr || result.stdout || 'npm install failed').trim();
  return { ok: false, error: detail };
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
  classifyDependencyAction,
  runDependencyInstall,
  resolveTargetDependencies,
  readManifestDependencies,
  defaultCommandRunner,
  DEFAULT_NPM_INSTALL_ARGS,
};
