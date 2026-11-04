/**
 * Which package a directory is.
 *
 * The artifact is directory-blind by design: it names operations and sequences, never
 * crates. The tree manifest is the only document that says which directory a package sits
 * in, so the projection resolves a directory through it rather than guessing from the
 * directory's name. A guess would produce a view for a package that does not exist, and a
 * view nobody implements is worse than no view.
 */
import path from 'node:path';

/** The path the tree manifest uses for the workspace root itself. */
export const ROOT_PACKAGE_PATH = '.';

/** The directory beneath a workspace root that holds its packages, when no manifest says otherwise. */
export const PACKAGE_ROOT_DIRECTORY = 'crates';

/**
 * A package path in the spelling the tree manifest uses.
 *
 * The manifest may spell the root ".", "./" or, when a writer normalized it, the empty
 * string. All three name the same directory, so all three become ".". Non-root paths keep
 * their segments and lose only a trailing slash and a platform separator.
 *
 * @param {string|null|undefined} value
 * @returns {string}
 */
// [::TICKET::] PX-355 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-355 --for-spec --no-implementation-order`.
export function normalizePackagePath(value) {
  const posix = String(value ?? '').replace(/\\/g, '/');
  const trimmed = posix.replace(/\/+$/, '');
  if (trimmed === '' || trimmed === ROOT_PACKAGE_PATH) return ROOT_PACKAGE_PATH;
  const normalized = path.posix.normalize(trimmed);
  return normalized === '' ? ROOT_PACKAGE_PATH : normalized;
}

/**
 * The package a directory names, or the reason it names none.
 *
 * The directory may be given absolute or relative to the workspace root; both spellings
 * are accepted because a command line carries whichever the operator typed. Both sides of
 * the comparison are normalized, because the manifest may spell the root "." or "./" and
 * a caller may hand the root as an absolute path, whose relative form is the empty string.
 *
 * @param {Array<{ id: string, path: string }>} packages
 * @param {string} packagePath
 * @param {string} workspaceRoot
 * @returns {{ packageId: string|null, packagePath: string|null, reason: string|null }}
 */
// [::TICKET::] PX-256, PX-355 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-256|PX-355) --for-spec --no-implementation-order`.
export function resolvePackageByPath(packages, packagePath, workspaceRoot) {
  const relative = path.isAbsolute(packagePath) ? path.relative(workspaceRoot, packagePath) : packagePath;
  const normalized = normalizePackagePath(relative);
  const found = packages.find((entry) => normalizePackagePath(entry.path) === normalized);

  if (found === undefined) {
    return {
      packageId: null,
      packagePath: null,
      reason: `${normalized} is not a package the tree manifest names`,
    };
  }
  return { packageId: found.id, packagePath: found.path, reason: null };
}

/**
 * The packages an operation reaches, and the ones it does not.
 *
 * Reported so that "this package has nothing to implement" can be told from "this package
 * was never resolved", which are the same empty view and very different findings.
 *
 * @param {Array<{ id: string, path: string }>} packages
 * @param {string[]} reachedPackageIds
 * @returns {{ reached: Array<{ id: string, path: string }>, unreached: Array<{ id: string, path: string }> }}
 */
// [::TICKET::] PX-256 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-256 --for-spec --no-implementation-order`.
export function partitionPackagesByReach(packages, reachedPackageIds) {
  const reached = new Set(reachedPackageIds);
  return {
    reached: packages.filter((entry) => reached.has(entry.id)),
    unreached: packages.filter((entry) => !reached.has(entry.id)),
  };
}
