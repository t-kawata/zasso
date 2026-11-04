/**
 * Which directories a workspace's packages live in.
 *
 * The tree manifest is the only document that joins a package id to a directory, and it may
 * name the workspace root itself with path ".". A reader that walks only crates/ drops that
 * package; a reader that infers a root package from a root SEQUENCES.json reads a stray file
 * as a package. This module is the one answer: the manifest when it is readable, the crates
 * walk with the caller's artifact marker when it is not.
 *
 * The fallback deliberately does not include the workspace root. Without a manifest there is
 * no declaration that the root is a package, and a root view in that state is a stray file
 * (the invariant tests/workspacify-order/unit/verdicts.test.mjs holds).
 */
import fs from 'node:fs';
import path from 'node:path';

import { PACKAGE_ROOT_DIRECTORY, normalizePackagePath } from './packages.mjs';

/**
 * Every package directory the workspace names, with the id the tree manifest knows it by.
 *
 * @param {string} root
 * @param {object|null} treeManifest
 * @param {{ fallbackMarkers?: string[] }} [options] — the artifact a package carries, used only
 *   when the manifest is absent or carries no workspace.packages
 * @returns {Array<{ packageId: string, packagePath: string, directory: string }>}
 */
// [::TICKET::] PX-355 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-355 --for-spec --no-implementation-order`.
export function packageDirectoriesOf(root, treeManifest = null, { fallbackMarkers = [] } = {}) {
  const declared = treeManifest?.workspace?.packages;
  const entries = Array.isArray(declared) && declared.length > 0
    ? declared.map((pkg) => packageEntryOf(root, pkg))
    : fallbackPackageEntries(root, fallbackMarkers);
  return dedupeByDirectory(entries).sort(compareByPackagePath);
}

/** One manifest entry, with its directory resolved against the workspace root. */
// [::TICKET::] PX-355 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-355 --for-spec --no-implementation-order`.
function packageEntryOf(root, pkg) {
  const packagePath = normalizePackagePath(pkg?.path);
  return { packageId: String(pkg?.id), packagePath, directory: path.resolve(root, packagePath) };
}

/** The packages a workspace without a manifest declares by carrying an artifact. */
// [::TICKET::] PX-355 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-355 --for-spec --no-implementation-order`.
function fallbackPackageEntries(root, fallbackMarkers) {
  const packageRoot = path.join(root, PACKAGE_ROOT_DIRECTORY);
  if (fallbackMarkers.length === 0 || !fs.existsSync(packageRoot)) return [];

  const entries = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (fallbackMarkers.includes(entry.name)) {
        entries.push({
          packageId: path.basename(directory),
          packagePath: normalizePackagePath(path.relative(root, directory)),
          directory,
        });
      }
    }
  };
  visit(packageRoot);
  return entries;
}

/** One entry per directory; a manifest that names a directory twice still names one package. */
// [::TICKET::] PX-355 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-355 --for-spec --no-implementation-order`.
function dedupeByDirectory(entries) {
  const byDirectory = new Map();
  for (const entry of entries) {
    if (!byDirectory.has(entry.directory)) byDirectory.set(entry.directory, entry);
  }
  return [...byDirectory.values()];
}

/** A stable order, so a report and a gate list the same packages the same way. */
// [::TICKET::] PX-355 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-355 --for-spec --no-implementation-order`.
function compareByPackagePath(left, right) {
  return left.packagePath.localeCompare(right.packagePath);
}
