#!/usr/bin/env node

/**
 * run.mjs — write one package's share of the sequences artifact into its directory.
 *
 * Usage: node run.mjs <sequences-artifact> <package-dir>
 *
 * The artifact path names the workspace: the two manifests are resolved beside it, and the
 * package directory is resolved against the tree manifest rather than by its own name.
 *
 * This runs inside `/grill-me-for-rfc`, so it must never stop the command. Every failure
 * is a reported reason and exit 0, writing nothing; a run that cannot produce a view
 * leaves the session exactly as it found it, which is the state the detector then reports.
 *
 * Design context: tools/conver/README.md — 上流ループ, and PX-256 for the ordering that
 * places the tolerant detector before the strict reader.
 */

import fs from 'node:fs';
import path from 'node:path';

import { parseSequencesArtifact } from './lib/artifact.mjs';
import { resolvePackageByPath } from './lib/packages.mjs';
import { readPackageObligations } from './lib/obligation.mjs';
import { PACKAGE_ROOT_DIRECTORY, readPackageSegments } from './lib/segments.mjs';
import { buildPackageView, renderPackageViewJson, renderPackageViewMarkdown } from './lib/view.mjs';

const EXIT_OK = 0;
const TREE_MANIFEST_FILENAME = 'WORKSPACIFY-TREE-MANIFEST.json';
const ALLOCATE_MANIFEST_FILENAME = 'WORKSPACIFY-ALLOCATE-MANIFEST.json';
const VIEW_MARKDOWN_NAME = 'SEQUENCES.md';
const VIEW_JSON_NAME = 'SEQUENCES.json';
const USAGE = 'usage: run.mjs <sequences-artifact> <package-dir>';

/** A failure that is reported rather than thrown out of the process. */
// [::TICKET::] PX-256, PX-260, PX-261, PX-262, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-256|PX-260|PX-261|PX-262|PX-263) --for-spec --no-implementation-order`.
class ProjectionRefused extends Error {}

/**
 * Read a file, or refuse with the path named.
 *
 * @param {string} filePath
 * @returns {string}
 */
// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
function readTextOrRefuse(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new ProjectionRefused(`${filePath} could not be read (${error.code ?? error.message})`);
  }
}

/**
 * Read and parse one JSON file, or refuse with the path named.
 *
 * @param {string} filePath
 * @returns {unknown}
 */
// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
function readJsonOrRefuse(filePath) {
  const text = readTextOrRefuse(filePath);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ProjectionRefused(`${filePath} does not parse as JSON (${error.message})`);
  }
}

/**
 * The workspace's package segments, or a refusal naming what could not be read.
 *
 * The view states the workspace's line coordinate, so this list is an input to it. A
 * workspace whose seeds are absent, or whose package root cannot be walked, is refused
 * rather than passed on as an empty list: an empty list renders as a package count the
 * workspace never measured, which is the shape of the defect this projection exists to
 * avoid repeating.
 *
 * @param {string} root
 * @returns {Array<{ packagePath: string, segmentIds: string[] }>}
 */
// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
function readWorkspaceSegmentsOrRefuse(root) {
  const packageRoot = path.join(root, PACKAGE_ROOT_DIRECTORY);

  let packageSegments;
  try {
    packageSegments = readPackageSegments(packageRoot);
  } catch (error) {
    throw new ProjectionRefused(`${packageRoot} could not be read (${error.code ?? error.message})`);
  }
  if (packageSegments.length === 0) {
    throw new ProjectionRefused(`no package seed was readable under ${packageRoot}`);
  }
  return packageSegments;
}

/**
 * Write the two view files and report what was written.
 *
 * @param {string} artifactPath
 * @param {string} packageDir
 * @returns {{ written: string[], packageId: string, reason: string|null, refused: string[] }}
 */
// [::TICKET::] PX-256, PX-259, PX-260, PX-261, PX-262, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-256|PX-259|PX-260|PX-261|PX-262|PX-263) --for-spec --no-implementation-order`.
function projectPackageView(artifactPath, packageDir) {
  const root = path.dirname(artifactPath);

  // parseSequencesArtifact throws a plain Error naming the source, which is what a caller
  // reading stderr wants and not what a pipeline wants. It is turned into a refusal here,
  // at the boundary where the two audiences meet.
  let artifact;
  try {
    artifact = parseSequencesArtifact(readTextOrRefuse(artifactPath), artifactPath);
  } catch (error) {
    throw new ProjectionRefused(error.message);
  }
  const treeManifest = readJsonOrRefuse(path.join(root, TREE_MANIFEST_FILENAME));
  // The allocate manifest is read because the view is a slice of a workspace the two
  // manifests jointly describe, and a workspace where one is missing is not one this
  // projection may speak for. It is also where the boundary relation comes from, so the
  // parsed value is passed on rather than discarded.
  const allocateManifest = readJsonOrRefuse(path.join(root, ALLOCATE_MANIFEST_FILENAME));

  const packageRoot = path.join(root, PACKAGE_ROOT_DIRECTORY);
  const packageSegments = readWorkspaceSegmentsOrRefuse(root);

  const resolved = resolvePackageByPath(treeManifest.workspace.packages, packageDir, root);
  if (resolved.packageId === null) throw new ProjectionRefused(resolved.reason);

  // The obligations are read for every package at once, because the record is keyed by the
  // package's own directory and the reader is the one place that knows the key. A record that
  // could not be read leaves its package declaring nothing, so the demands it would have placed
  // are reported as unassigned by the gate rather than disappearing with the refusal.
  const obligation = readPackageObligations(packageRoot, allocateManifest).get(path.relative(packageRoot, packageDir))
    ?? { serves: [], assignments: [], refused: [] };
  const view = buildPackageView({
    artifact,
    treeManifest,
    packageSegments,
    obligations: { allocateManifest, declared: obligation.serves, record: { assignments: obligation.assignments } },
  }, resolved.packageId);
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(packageDir, VIEW_MARKDOWN_NAME), renderPackageViewMarkdown(view));
  fs.writeFileSync(path.join(packageDir, VIEW_JSON_NAME), renderPackageViewJson(view));

  return { written: [VIEW_MARKDOWN_NAME, VIEW_JSON_NAME], packageId: resolved.packageId, reason: null, refused: obligation.refused };
}

// [::TICKET::] PX-256, PX-260, PX-261, PX-262, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-256|PX-260|PX-261|PX-262|PX-263) --for-spec --no-implementation-order`.
function main() {
  const positional = process.argv.slice(2);
  if (positional.length !== 2) {
    process.stdout.write(`${JSON.stringify({ written: [], packageId: null, reason: USAGE, refused: [] })}\n`);
    return EXIT_OK;
  }

  const artifactPath = path.resolve(positional[0]);
  const packageDir = path.resolve(positional[1]);

  try {
    process.stdout.write(`${JSON.stringify(projectPackageView(artifactPath, packageDir))}\n`);
  } catch (error) {
    if (error instanceof ProjectionRefused) {
      process.stdout.write(`${JSON.stringify({ written: [], packageId: null, reason: error.message, refused: [] })}\n`);
      return EXIT_OK;
    }
    throw error;
  }
  return EXIT_OK;
}

process.exit(main());
