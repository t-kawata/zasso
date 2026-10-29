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

/**
 * The package a directory names, or the reason it names none.
 *
 * The directory may be given absolute or relative to the workspace root; both spellings
 * are accepted because a command line carries whichever the operator typed. Paths are
 * compared with forward slashes, because the manifest is written that way and a Windows
 * separator would otherwise make every lookup miss.
 *
 * @param {Array<{ id: string, path: string }>} packages
 * @param {string} packagePath
 * @param {string} workspaceRoot
 * @returns {{ packageId: string|null, packagePath: string|null, reason: string|null }}
 */
// [::TICKET::] PX-256 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-256 --for-spec --no-implementation-order`.
export function resolvePackageByPath(packages, packagePath, workspaceRoot) {
  const relative = path.isAbsolute(packagePath) ? path.relative(workspaceRoot, packagePath) : packagePath;
  const normalized = relative.split(path.sep).join('/');
  const found = packages.find((entry) => entry.path === normalized);

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
