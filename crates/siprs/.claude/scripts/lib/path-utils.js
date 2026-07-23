/**
 * path-utils.js — Home-directory-relative path normalization utilities
 *
 * Provides pure functions for converting between absolute paths
 * and ~/-relative paths, ensuring JSON file path portability across machines.
 *
 * @module path-utils
 */
const os = require('os');
const path = require('path');

/**
 * Converts an absolute path to ~/-relative if it's under $HOME.
 * Returns the original path unchanged if it's already ~/-relative,
 * outside $HOME, or empty.
 *
 * @param {string} absPath — Absolute or relative file path
 * @returns {string} ~/-relative path if under $HOME, otherwise absPath unchanged
 */
function toHomeRelative(absPath) {
  if (!absPath) return absPath;
  // Already ~/-relative: return unchanged (path.resolve would interpret ~/ literally)
  if (absPath === '~' || absPath.startsWith('~/')) return absPath;
  const homedir = os.homedir();
  if (!homedir) return absPath;
  const resolved = path.resolve(absPath);
  if (resolved === homedir) return '~';
  if (resolved.startsWith(homedir + path.sep)) {
    return '~/' + resolved.slice(homedir.length + 1);
  }
  return resolved;
}

/**
 * Expands ~/ and ~ at the start of a path to the current $HOME.
 * Non-~ paths are returned as-is — the caller resolves with path.resolve().
 *
 * @param {string} homeRelPath — Path possibly starting with ~/ or ~
 * @returns {string} Path with ~ expanded to $HOME, or unchanged for non-~ paths
 */
function fromHomeRelative(homeRelPath) {
  if (!homeRelPath) return homeRelPath;
  const homedir = os.homedir();
  if (!homedir) return homeRelPath;
  if (homeRelPath === '~') return homedir;
  if (homeRelPath.startsWith('~/')) {
    return path.resolve(homedir, homeRelPath.slice(2));
  }
  // Non-~ path: return as-is (caller resolves with path.resolve())
  return homeRelPath;
}

module.exports = { toHomeRelative, fromHomeRelative };
