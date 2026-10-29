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

/**
 * Turn a path a record stored back into a path this machine can open.
 *
 * The expansion happens before the resolution, and the order is the whole point: a record
 * written on one machine stores `~/...`, which names no machine, and `path.resolve` given
 * that string would produce a directory literally called `~` beneath the base. The reverse
 * order is equally broken, which is how the defect this function removes worked — an
 * absolute stored path makes `path.resolve` discard its base, so a record resolved to the
 * writing machine on every other one.
 *
 * A record that still holds an absolute path, as every record written before the writer was
 * changed does, is passed through and resolved as before.
 *
 * @param {string} storedPath — a path as the record holds it: `~/...`, absolute, or relative
 * @param {string} baseDirectory — the directory a relative stored path is relative to
 * @returns {string}
 */
// [::TICKET::] PX-231 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-231 --for-spec --no-implementation-order`.
function resolveStoredPath(storedPath, baseDirectory) {
  return path.resolve(baseDirectory, fromHomeRelative(storedPath));
}

/**
 * Rewrite every home-directory path inside a text, not only the one at its start.
 *
 * A ticket field is prose: an absolute path can sit in the middle of a sentence, a
 * file list or a Markdown table, where `toHomeRelative` cannot see it because that
 * function asks whether the whole value is a path. The committed artefact rule is
 * about any occurrence, so the text form is a replacement rather than a check.
 *
 * The separator after the home directory is required, so a sibling such as
 * `/home/alice2` is not mistaken for the home directory itself.
 *
 * @param {string} text — prose that may embed absolute paths
 * @returns {string} the same text with every `$HOME` prefix rendered as `~`
 */
function toHomeRelativeText(text) {
  if (typeof text !== 'string' || text === '') return text;
  const homedir = os.homedir();
  if (!homedir) return text;
  // Rewriting the filesystem root would turn every absolute path into ~/.
  if (homedir === path.parse(homedir).root) return text;
  const escaped = homedir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`${escaped}[/\\\\]`, 'g'), '~/');
}

/**
 * Apply `toHomeRelativeText` to every string in a JSON-shaped value.
 *
 * A ticket update is an object graph, and the writer persists it whole. Converting
 * the graph before serialisation covers a path in a nested array or a contract
 * object without teaching every writer which field holds a path.
 *
 * @param {unknown} value — a JSON-shaped value
 * @returns {unknown} a new value with every string converted; non-strings are unchanged
 */
function toHomeRelativeDeep(value) {
  if (typeof value === 'string') return toHomeRelativeText(value);
  if (Array.isArray(value)) return value.map(toHomeRelativeDeep);
  if (value !== null && typeof value === 'object') {
    const converted = {};
    for (const [key, entry] of Object.entries(value)) {
      converted[key] = toHomeRelativeDeep(entry);
    }
    return converted;
  }
  return value;
}

module.exports = {
  toHomeRelative,
  fromHomeRelative,
  resolveStoredPath,
  toHomeRelativeText,
  toHomeRelativeDeep,
};
