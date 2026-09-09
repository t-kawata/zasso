// [::TICKET::] PX-189 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-189 --for-spec --no-implementation-order`.
// PX-189 @verifies C005
/**
 * Staged directory-tree materialization (corrected ALLOCATE §8.3-§8.4).
 *
 * Directories are never created directly under the workspace root. They are
 * fully built inside a process-unique staging root, verified, and then moved
 * into place one top-level directory at a time. A failed publish rolls back
 * every directory this run created and leaves the workspace byte-identical.
 */
import { readdirSync, mkdirSync, mkdtempSync, renameSync, rmSync, lstatSync, existsSync } from 'node:fs';
import path from 'node:path';

/** Reserved staging prefix; never a planned path, always removed before exit. */
export const STAGING_PREFIX = '.workspacify-allocate-stage-';

/**
 * Enforce the fresh-workspace output policy.
 *
 * A planned path may be absent or an empty pre-existing directory. It must not
 * be a file, a symlink, a non-empty directory, or sit below a non-directory
 * ancestor.
 *
 * @param {string} root - workspace root (absolute)
 * @param {string[]} plan - root-relative planned directories
 * @returns {{ ok: boolean, reason?: string }}
 */
export function checkExistingOutputPolicy(root, plan) {
  for (const relPath of plan) {
    const segments = relPath.split('/').filter((segment) => segment.length > 0);
    let cursor = root;
    let pathExists = true;
    for (let index = 0; index < segments.length && pathExists; index += 1) {
      cursor = path.join(cursor, segments[index]);
      let stat;
      try {
        stat = lstatSync(cursor);
      } catch {
        pathExists = false; // Nothing further exists along this path.
        break;
      }
      const isLeaf = index === segments.length - 1;
      if (!stat.isDirectory()) {
        const reason = isLeaf
          ? `planned path exists as a file or symlink: ${relPath}`
          : `non-directory ancestor at "${segments.slice(0, index + 1).join('/')}" for ${relPath}`;
        return { ok: false, reason };
      }
      if (isLeaf && readdirSync(cursor).length > 0) {
        return { ok: false, reason: `planned directory is not empty: ${relPath}` };
      }
    }
  }
  return { ok: true };
}

/**
 * Create a process-unique staging root inside the workspace root.
 *
 * Staging lives on the same filesystem as the root so directory renames stay
 * atomic. The reserved prefix guarantees the staging path is never part of a
 * directory plan.
 *
 * @param {string} root - workspace root (absolute)
 * @returns {{ path: string }} staging root path
 */
export function createStagingRoot(root) {
  return { path: mkdtempSync(path.join(root, STAGING_PREFIX)) };
}

/**
 * Create every planned directory under the staging root.
 *
 * @param {string} stagingRoot - staging root path
 * @param {string[]} plan - root-relative planned directories
 */
export function materializeDirectories(stagingRoot, plan) {
  for (const relPath of plan) {
    mkdirSync(path.join(stagingRoot, relPath), { recursive: true });
  }
}

/**
 * Verify that the staging tree realizes the plan exactly: every planned
 * directory exists and no unexpected file, symlink, or directory is present.
 *
 * @param {string} stagingRoot - staging root path
 * @param {string[]} plan - root-relative planned directories
 * @returns {{ ok: boolean, missing: string[], unexpected: string[] }}
 */
export function verifyStaging(stagingRoot, plan) {
  const expectedDirs = expandWithAncestors(plan);
  const { dirs, entries } = walkTree(stagingRoot);
  const missing = expectedDirs.filter((relPath) => !dirs.includes(relPath));
  const unexpectedDirs = dirs.filter((relPath) => !expectedDirs.includes(relPath));
  return { ok: missing.length === 0 && unexpectedDirs.length === 0 && entries.length === 0, missing, unexpected: [...unexpectedDirs, ...entries] };
}

/**
 * Publish the staged tree into the workspace root.
 *
 * Each top-level planned directory is renamed from staging into the root. If
 * any destination already exists or a rename fails, every directory already
 * moved is rolled back and the staging root is removed.
 *
 * @param {string} stagingRoot - staging root path
 * @param {string} root - workspace root (absolute)
 * @param {string[]} plan - root-relative planned directories
 * @returns {{ published: boolean, reason?: string }}
 */
export function publishStagedTree(stagingRoot, root, plan) {
  const topLevels = [...new Set(plan.map((relPath) => relPath.split('/')[0]))].sort();
  const renamed = [];
  const abort = (reason) => {
    rollbackPublished(root, renamed);
    rmSync(stagingRoot, { recursive: true, force: true });
    return { published: false, reason };
  };
  for (const topLevel of topLevels) {
    const destination = path.join(root, topLevel);
    if (existsSync(destination)) {
      return abort(`destination already exists: ${topLevel}`);
    }
    try {
      renameSync(path.join(stagingRoot, topLevel), destination);
      renamed.push(topLevel);
    } catch (error) {
      return abort(`rename failed for "${topLevel}": ${error.message}`);
    }
  }
  rmSync(stagingRoot, { recursive: true, force: true });
  return { published: true };
}

/**
 * Verify that the workspace root realizes the plan's directory topology.
 *
 * Only directories are compared: every planned directory must exist and no
 * extra directory may appear. Pre-existing root-level files (the spec and the
 * manifest) are intentionally outside the directory-set contract; seed files
 * are verified separately by the seed checks in PX-190/PX-191.
 *
 * @param {string} root - workspace root (absolute)
 * @param {string[]} plan - root-relative planned directories
 * @returns {{ ok: boolean, missing: string[], unexpected: string[] }}
 */
export function verifyDirectorySet(root, plan) {
  const expectedDirs = expandWithAncestors(plan);
  const { dirs } = walkTree(root);
  const missing = expectedDirs.filter((relPath) => !dirs.includes(relPath));
  const unexpected = dirs.filter((relPath) => !expectedDirs.includes(relPath));
  return { ok: missing.length === 0 && unexpected.length === 0, missing, unexpected };
}

/**
 * Expand a directory plan to include every ancestor directory of each planned
 * path, because materializing a deep leaf necessarily creates its ancestors.
 *
 * @param {string[]} plan - root-relative planned directories
 * @returns {string[]} plan closed under ancestor prefixes, de-duplicated
 */
function expandWithAncestors(plan) {
  const expanded = new Set();
  for (const relPath of plan) {
    const segments = relPath.split('/').filter((segment) => segment.length > 0);
    let prefix = '';
    for (const segment of segments) {
      prefix = prefix ? `${prefix}/${segment}` : segment;
      expanded.add(prefix);
    }
  }
  return [...expanded];
}

/**
 * Remove the listed top-level directories from the root (rollback).
 *
 * @param {string} root - workspace root (absolute)
 * @param {string[]} topLevels - top-level directories to remove
 */
export function rollbackPublished(root, topLevels) {
  for (const topLevel of topLevels) {
    rmSync(path.join(root, topLevel), { recursive: true, force: true });
  }
}

/**
 * Recursively list directories and non-directory entries under a root.
 *
 * @param {string} absRoot - absolute directory to walk
 * @returns {{ dirs: string[], entries: string[] }} root-relative POSIX paths
 */
function walkTree(absRoot) {
  const dirs = [];
  const entries = [];
  const visit = (dirAbs, rel) => {
    for (const dirent of readdirSync(dirAbs, { withFileTypes: true })) {
      const relPath = rel ? `${rel}/${dirent.name}` : dirent.name;
      if (dirent.isDirectory()) {
        dirs.push(relPath);
        visit(path.join(dirAbs, dirent.name), relPath);
      } else {
        entries.push(relPath);
      }
    }
  };
  visit(absRoot, '');
  return { dirs, entries };
}
