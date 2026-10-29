// repo-root.cjs — the one anchor for every .claude script reference.
//
// A script may be started from the repository root, from a nested crate, or from a
// directory outside the repository. The .claude directory is the same one in all three
// cases: the one beside the git top level. The helper answers that question once, and
// every writer and child-process call reads the resolvedPath instead of spelling `.claude`
// relative to whatever cwd it happens to inherit.
//
// Two forms exist because they serve different consumers. The absolute form is for
// require(), execFileSync() and fs: neither the filesystem nor a subprocess expands a
// tilde. The display form is for text written into a file: it passes through
// toHomeRelative, so a committed header names no machine.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { toHomeRelative } = require('../lib/path-utils.js');

const ERROR_CODES = Object.freeze({
  NO_GIT_ROOT: 'NO_GIT_ROOT',
  NO_ROOT_CLAUDE: 'NO_ROOT_CLAUDE',
  UNKNOWN_OPTION: 'UNKNOWN_OPTION',
});

/** A failure with the code the CLI prints. */
// [::TICKET::] PX-341 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-341 --for-spec --no-implementation-order`.
function namedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/**
 * The absolute git top level of a directory.
 *
 * @param {string} [cwd] — directory to ask git about
 * @returns {string} normalized absolute path
 * @throws {Error} code NO_GIT_ROOT when the directory is not inside a work tree
 */
// [::TICKET::] PX-341 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-341 --for-spec --no-implementation-order`.
function getRepoRoot(cwd = process.cwd()) {
  try {
    const output = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return path.normalize(output.replace(/\r?\n$/, ''));
  } catch (cause) {
    throw namedError(ERROR_CODES.NO_GIT_ROOT, `no git work tree contains ${cwd}`);
  }
}

/**
 * The repository-root .claude directory.
 *
 * @param {string} [cwd] — directory to ask git about
 * @returns {string} absolute path to an existing .claude directory
 * @throws {Error} code NO_GIT_ROOT or NO_ROOT_CLAUDE
 */
// [::TICKET::] PX-341 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-341 --for-spec --no-implementation-order`.
function getClaudeDir(cwd = process.cwd()) {
  const directory = path.join(getRepoRoot(cwd), '.claude');
  if (!fs.existsSync(directory)) {
    throw namedError(ERROR_CODES.NO_ROOT_CLAUDE, `missing ${directory}`);
  }
  return directory;
}

/**
 * The machine-independent form of an absolute path, for text written into a file.
 *
 * @param {string} absolutePath — path to render
 * @returns {string} `~/...` under $HOME, otherwise the absolute path
 */
// [::TICKET::] PX-341 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-341 --for-spec --no-implementation-order`.
function toDisplayPath(absolutePath) {
  return toHomeRelative(absolutePath);
}

/**
 * The .claude directory for a script that may run outside a repository.
 *
 * A global plugin hook runs in whatever directory the user is in; it still needs the
 * plugin tree it was installed with. The fallback is used only for the NO_GIT_ROOT case,
 * so a repository with a missing .claude is still reported rather than silently swapped.
 *
 * @param {{ cwd?: string, fallbackDir?: string|null }} [options]
 * @returns {string} absolute path to a .claude directory
 */
// [::TICKET::] PX-341 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-341 --for-spec --no-implementation-order`.
function resolveProjectClaudeDir({ cwd = process.cwd(), fallbackDir = null } = {}) {
  try {
    return getClaudeDir(cwd);
  } catch (error) {
    if (error.code === ERROR_CODES.NO_GIT_ROOT && fallbackDir) return fallbackDir;
    throw error;
  }
}

/**
 * Quote a shell word, preserving the expansion a leading tilde needs.
 *
 * A tilde does not expand inside quotes, so `"~/my repo"` would name a directory called
 * `~`. `"$HOME/my repo"` expands and survives the space; that substitution is the whole
 * reason this function exists rather than a bare JSON.stringify.
 *
 * @param {string} value — shell word
 * @returns {string} a word safe to place in a command
 */
// [::TICKET::] PX-341 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-341 --for-spec --no-implementation-order`.
function quoteShell(value) {
  // The git-root anchor is a command substitution, not a literal `$`. Escape everything
  // else but leave the substitution intact so the shell resolves it at execution time.
  if (value.includes('$(git rev-parse --show-toplevel)')) {
    return `"${value.replace(/(["\\`])/g, '\\$1')}"`;
  }
  if (value.startsWith('~/')) {
    const pathAfterTilde = value.slice(2);
    if (/^[A-Za-z0-9_./:+-]+$/.test(pathAfterTilde)) return value;
    return `"$HOME/${pathAfterTilde.replace(/(["\\$`])/g, '\\$1')}"`;
  }
  if (/^[A-Za-z0-9_./:+-]+$/.test(value)) return value;
  return `"${value.replace(/(["\\$`])/g, '\\$1')}"`;
}

/**
 * A command that changes to the graph package and runs a repo-root script there.
 *
 * The graph package stays the cwd because the brief readers resolve their artifacts from
 * it; the script path is the repo-root .claude so the command works from any directory.
 *
 * @param {{ cwdDisplay: string, claudeDirDisplay: string, script: string, args?: string[] }} parts
 * @returns {string} a closed subshell command
 */
// [::TICKET::] PX-341 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-341 --for-spec --no-implementation-order`.
function buildAnchoredCommand({ cwdDisplay, claudeDirDisplay, script, args = [] }) {
  const scriptPath = `${claudeDirDisplay}/scripts/${script}`;
  return `(cd ${quoteShell(cwdDisplay)} && node ${quoteShell(scriptPath)} ${args.join(' ')})`;
}

/** Print one path: the repository root, its .claude, or the display form. */
// [::TICKET::] PX-341 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-341 --for-spec --no-implementation-order`.
function main(argv = process.argv.slice(2)) {
  try {
    const [option] = argv;
    let resolvedPath;
    if (option === undefined) resolvedPath = toDisplayPath(getRepoRoot());
    else if (option === '--home') resolvedPath = toDisplayPath(getRepoRoot());
    else if (option === '--claude') resolvedPath = toDisplayPath(getClaudeDir());
    else throw namedError(ERROR_CODES.UNKNOWN_OPTION, `unknown option: ${option}`);
    process.stdout.write(`${resolvedPath}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${error.code || 'ERROR'}: ${error.message}\n`);
    return 1;
  }
}

module.exports = {
  ERROR_CODES,
  getRepoRoot,
  getClaudeDir,
  toDisplayPath,
  resolveProjectClaudeDir,
  quoteShell,
  buildAnchoredCommand,
};

if (require.main === module) {
  process.exitCode = main();
}
