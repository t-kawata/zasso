// [::TICKET::] P22-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-12 --for-spec --no-implementation-order`.
/**
 * Fixtures for the reverse-mode allocate gate tests.
 *
 * Reverse allocate is judged against a real filesystem, not against a description
 * of one, because A1's whole content is "the planned set and the existing set are
 * the same set". The layout mirrors `siprs-for-reverse`: the planned package
 * directories sit beside the populations the reverse rotation must preserve
 * untouched — `vendor/` and `target/` — plus the root files that are not
 * directories and therefore outside the directory-set contract.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { runDagChecks } from '../../../../.claude/scripts/workspacify-tree/lib/dag.mjs';
import { assembleManifest } from '../../../../.claude/scripts/workspacify-tree/lib/render.mjs';
import { REVERSE_PROVENANCE_FIELD } from '../../../../.claude/scripts/workspacify-tree/lib/reverse-mode.mjs';
import {
  DEFAULT_SPEC_TEXT,
  buildValidManifest,
  makeDecisions,
} from '../../helpers/build-valid-manifest.mjs';

/** The stage-1 manifest file name a reverse run reads. */
export const TREE_MANIFEST_FILE_NAME = 'WORKSPACIFY-TREE-MANIFEST.json';

/** The seed file reverse allocate places inside each package. */
export const SEED_FILE_NAME = 'RFC-SEED.md';

/**
 * Files the tree carries at its root. They are not directories, so A1 never
 * compares them — which is exactly the boundary the gate must respect.
 */
export const FIXTURE_ROOT_FILES = Object.freeze({
  'Cargo.toml': '[package]\nname = "siprs"\n',
  'build.rs': 'fn main() {}\n',
  'wrapper.h': '#pragma once\n',
});

/**
 * The hand-written sources, plus the two populations reverse mode must never
 * disturb. `vendor/` is a dependency and `target/` is a build artefact; both are
 * directories that no package path contains.
 */
export const FIXTURE_SOURCE_FILES = Object.freeze({
  'crates/protocol/alpha/mod.rs': 'pub fn alpha_record() {}\n',
  'crates/protocol/beta/mod.rs': 'pub fn beta_consumer() {}\n',
  'vendor/pjsip/pj.c': 'int pj(void) { return 0; }\n',
  'target/debug/generated.rs': 'fn generated() {}\n',
});

/** The top-level directories of the fixture tree, sorted. */
export const FIXTURE_TOP_LEVEL_DIRECTORIES = Object.freeze(['crates', 'target', 'vendor']);

/** The sidecar bundle the fixture manifest's reverse provenance resolves against. */
export const FIXTURE_SIDECAR_BUNDLE_HASH = 'c'.repeat(64);

/**
 * The implementation of every package, read from a `{ path: text }` layout.
 *
 * A6's material has to come from the tree — at allocate time there is no deeper
 * analysis to ask, and the code on disk is the only honest answer to "who uses
 * this?". Reading it from a layout map keeps the unit tests on the real shape
 * without needing a filesystem.
 *
 * @param {object} manifest - the stage-1 manifest
 * @param {Record<string, string>} layout - relative path to file contents
 * @returns {Map<string, Array<{path: string, text: string}>>} files by package id
 */
export function incomingImplementationsFrom(manifest, layout) {
  const byPackage = new Map();
  for (const pkg of manifest.workspace?.packages ?? []) {
    const files = Object.entries(layout)
      .filter(([relativePath]) => relativePath.startsWith(`${pkg.path}/`))
      .map(([relativePath, text]) => ({ path: relativePath, text }));
    if (files.length > 0) {
      byPackage.set(pkg.id, files);
    }
  }
  return byPackage;
}

/**
 * The shared stage-1 fixture, carrying the provenance a reverse tree run records.
 *
 * The partition itself is deliberately left exactly as the forward fixture builds
 * it: widening it would move a forward baseline, and the reverse rotation grounds
 * the existing partition rather than replacing it. The one addition is P22-11's
 * `reverse_provenance`, which reverse allocate reads to populate section 1's index
 * and to name the sidecar it resolved against.
 *
 * @returns {{ manifest: object, decisions: object, specText: string }}
 */
export function buildReverseManifest() {
  const { manifest, specText } = buildValidManifest();
  const withProvenance = assembleManifest({
    ...JSON.parse(JSON.stringify(manifest)),
    [REVERSE_PROVENANCE_FIELD]: {
      sidecar_bundle_hash: FIXTURE_SIDECAR_BUNDLE_HASH,
      counts: { claims: 2, residuals: 1 },
    },
  });
  return { manifest: withProvenance, decisions: makeDecisions(withProvenance), specText };
}

/**
 * Write a `{ 'relative/path': 'contents' }` map under a root.
 *
 * @param {string} root - absolute directory to write into
 * @param {Record<string, string>} layout - relative paths to file contents
 */
export function writeFiles(root, layout) {
  for (const [relativePath, contents] of Object.entries(layout)) {
    const absolute = join(root, relativePath);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents);
  }
}

/**
 * Build a workspace the reverse rotation can be pointed at.
 *
 * The directory tree matches the manifest's package paths exactly, so A1 agrees.
 * `extraDirectories` adds paths no package claims — which is how the tests drive
 * A1 to BLOCKED without touching the fixture itself.
 *
 * @param {{ extraDirectories?: string[], extraFiles?: Record<string, string> }} [options]
 * @returns {{ dir: string, manifestPath: string, manifest: object, decisions: object, specText: string,
 *             plannedPaths: string[], expectedTopLevel: string[] }}
 */
export function buildReverseWorkspace({ extraDirectories = [], extraFiles = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'allocate-reverse-'));
  const { manifest, decisions } = buildReverseManifest();

  writeFileSync(join(dir, 'spec.md'), DEFAULT_SPEC_TEXT);
  writeFileSync(join(dir, TREE_MANIFEST_FILE_NAME), JSON.stringify(manifest));
  writeFiles(dir, FIXTURE_ROOT_FILES);
  writeFiles(dir, FIXTURE_SOURCE_FILES);

  // The package directories exist as real, populated directories: reverse mode
  // must leave every one of them standing.
  for (const pkg of manifest.workspace?.packages ?? []) {
    mkdirSync(join(dir, pkg.path), { recursive: true });
  }
  for (const extra of extraDirectories) {
    mkdirSync(join(dir, extra), { recursive: true });
  }
  writeFiles(dir, extraFiles);

  return {
    dir,
    manifestPath: join(dir, TREE_MANIFEST_FILE_NAME),
    manifest,
    decisions,
    plannedPaths: plannedPathsOf(manifest),
    expectedTopLevel: [...FIXTURE_TOP_LEVEL_DIRECTORIES, ...extraDirectories].sort(),
  };
}

/** The directory plan the stage-1 tree implies, closed under ancestors. */
export function plannedPathsOf(manifest) {
  const expanded = new Set();
  for (const pkg of manifest.workspace?.packages ?? []) {
    const segments = pkg.path.split('/').filter((segment) => segment.length > 0);
    let prefix = '';
    for (const segment of segments) {
      prefix = prefix ? `${prefix}/${segment}` : segment;
      expanded.add(prefix);
    }
  }
  return [...expanded].sort();
}

/**
 * The top-level directory names under a root, sorted.
 *
 * Only directories: the root files (`Cargo.toml`, the manifest, the seeds' parent
 * packages) are outside A2's contract, and counting them would make the gate
 * report a change every time the manifest was rewritten.
 *
 * @param {string} root - absolute directory
 * @returns {string[]} sorted top-level directory names
 */
export function readTopLevelDirectories(root) {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * Every `RFC-SEED.md` under a root, as root-relative POSIX paths.
 *
 * @param {string} root - absolute directory
 * @returns {string[]} sorted seed paths
 */
export function collectSeedPaths(root) {
  const found = [];
  const visit = (abs, rel) => {
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        visit(join(abs, entry.name), relPath);
      } else if (entry.name === SEED_FILE_NAME) {
        found.push(relPath);
      }
    }
  };
  visit(root, '');
  return found.sort();
}

/**
 * A byte-level fingerprint of a whole tree: every directory and file, with the
 * hash of every file's contents.
 *
 * Comparing two fingerprints proves that nothing was merged, overwritten or
 * deleted, which is the invariant C001 and C002 both rest on.
 *
 * @param {string} root - absolute directory
 * @returns {string[]} one line per entry
 */
export function fingerprintTree(root) {
  const lines = [];
  const visit = (abs, rel) => {
    const entries = readdirSync(abs, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      const absolute = join(abs, entry.name);
      if (entry.isDirectory()) {
        lines.push(`dir ${relPath}`);
        visit(absolute, relPath);
      } else {
        lines.push(`file ${relPath} ${sha256(readFileSync(absolute))}`);
      }
    }
  };
  visit(root, '');
  return lines;
}

/** Paths that exist under `root` but did not exist in `before`. */
export function createdEntries(before, after) {
  return after.filter((line) => !before.includes(line));
}

/** Remove a tree a fixture created. */
export function removeTree(root) {
  rmSync(root, { recursive: true, force: true });
}

/** Whether a path exists and is a directory. */
export function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

// [::TICKET::] P22-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-12 --for-spec --no-implementation-order`.
function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
