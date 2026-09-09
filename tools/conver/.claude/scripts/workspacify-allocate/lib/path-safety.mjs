// [::TICKET::] PX-189 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-189 --for-spec --no-implementation-order`.
// PX-189 @verifies C003
/**
 * Workspace path safety (corrected ALLOCATE §8.1).
 *
 * Every planned directory is proven to live inside the workspace root before
 * any staging or publish step runs. Containment is decided with path.relative
 * (never a bare string prefix) and symlinks are detected with lstat on the
 * existing ancestors of each planned path.
 */
import { lstatSync as defaultLstat } from 'node:fs';
import path from 'node:path';

import { WorkSpacifyTreeError } from '../../workspacify-tree/lib/errors.mjs';

const NUL = String.fromCharCode(0);

/**
 * Classify a root-relative POSIX path for unsafe patterns.
 *
 * @param {string} relPath - workspace-root-relative path (POSIX separators)
 * @returns {string[]} reasons; empty when the path is safe
 */
export function classifyUnsafePath(relPath) {
  const reasons = [];
  if (typeof relPath !== 'string' || relPath.length === 0) {
    reasons.push('path is empty');
    return reasons;
  }
  if (relPath.includes(NUL)) {
    reasons.push('path contains a NUL byte');
  }
  if (path.posix.isAbsolute(relPath)) {
    reasons.push('path is absolute');
  }
  if (relPath.split('/').includes('..')) {
    reasons.push('path contains a parent (..) segment');
  }
  if (relPath.includes('\\')) {
    reasons.push('path contains a backslash separator');
  }
  if (/^[A-Za-z]:/.test(relPath)) {
    reasons.push('path contains a drive letter');
  }
  return reasons;
}

/**
 * True when candidatePath is the root or a descendant of root.
 *
 * @param {string} root - workspace root (absolute)
 * @param {string} candidatePath - candidate absolute path
 * @returns {boolean}
 */
export function isPathContained(root, candidatePath) {
  const rel = path.relative(path.resolve(root), path.resolve(candidatePath));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Resolve a package path under the workspace root.
 *
 * @param {string} root - workspace root (absolute)
 * @param {string} packagePath - root-relative POSIX package path
 * @returns {string} absolute descendant path
 * @throws {WorkSpacifyTreeError} gateId "G2.2" on unsafe or escaping paths
 */
export function resolvePackagePath(root, packagePath) {
  const reasons = classifyUnsafePath(packagePath);
  if (reasons.length > 0) {
    throw new WorkSpacifyTreeError(`unsafe package path "${packagePath}": ${reasons.join('; ')}`, { gateId: 'G2.2' });
  }
  const absPath = path.resolve(root, packagePath);
  if (!isPathContained(root, absPath)) {
    throw new WorkSpacifyTreeError(`package path "${packagePath}" resolves outside the workspace root`, { gateId: 'G2.2' });
  }
  return absPath;
}

/**
 * Verify that every planned relative directory is safe and that no existing
 * ancestor of it is a symbolic link (a symlink could escape the root).
 *
 * @param {{ root: string, relativeDirs: string[], lstatSync?: Function }} input
 * @returns {{ ok: boolean, unsafe: Array<{ path: string, reason: string }> }}
 */
export function checkPlannedPathSafety({ root, relativeDirs = [], lstatSync = defaultLstat }) {
  const unsafe = [];
  for (const relPath of relativeDirs) {
    const reasons = classifyUnsafePath(relPath);
    const absPath = path.resolve(root, relPath);
    if (!isPathContained(root, absPath)) {
      reasons.push('path resolves outside the workspace root');
    }
    reasons.push(...findSymlinkAncestorReasons(root, relPath, lstatSync));
    if (reasons.length > 0) {
      unsafe.push({ path: relPath, reason: reasons.join('; ') });
    }
  }
  return { ok: unsafe.length === 0, unsafe };
}

/**
 * Walk the existing ancestors of a planned path and report any that are
 * symbolic links. The walk stops at the first path that does not exist yet.
 *
 * @param {string} root - workspace root (absolute)
 * @param {string} relPath - planned root-relative path
 * @param {Function} lstatSync - injectable lstat for tests
 * @returns {string[]} symlink reasons
 */
function findSymlinkAncestorReasons(root, relPath, lstatSync) {
  const segments = relPath.split('/').filter((segment) => segment.length > 0);
  const reasons = [];
  let cursor = root;
  for (let index = 0; index < segments.length; index += 1) {
    cursor = path.join(cursor, segments[index]);
    let stat;
    try {
      stat = lstatSync(cursor);
    } catch {
      break; // Nothing further exists along this path.
    }
    if (stat.isSymbolicLink()) {
      const prefix = segments.slice(0, index + 1).join('/');
      reasons.push(`path contains a symlink at "${prefix}"`);
      break;
    }
  }
  return reasons;
}
