/**
 * One package's share of the sequences artifact, written into its directory.
 *
 * This is the only place a view is written. It lives here rather than in the command's entry point
 * because two callers need it and they must not differ: the projection command, which a person runs
 * to fill in a workspace, and the initialization step of a grill run, which repairs the view it was
 * handed an artifact for. A second writer would be a second answer to what a view contains, and the
 * ledger is checked against that answer.
 *
 * Every failure is a refusal with the path or the id named, never a throw out of the process: both
 * callers run inside a pipeline, and a workspace that cannot be projected is a finding about the
 * workspace rather than a reason to stop the command.
 *
 * Design context: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-270 --for-spec --no-implementation-order`.
 */
import fs from 'node:fs';
import path from 'node:path';

import { parseSequencesArtifact } from './artifact.mjs';
import { VIEW_JSON_NAME, VIEW_MARKDOWN_NAME } from './material.mjs';
import { readPackageObligations } from './obligation.mjs';
import { resolvePackageByPath } from './packages.mjs';
import { PACKAGE_ROOT_DIRECTORY, readPackageSegments } from './segments.mjs';
import { buildPackageView, renderPackageViewJson, renderPackageViewMarkdown } from './view.mjs';

export const TREE_MANIFEST_FILENAME = 'WORKSPACIFY-TREE-MANIFEST.json';
export const ALLOCATE_MANIFEST_FILENAME = 'WORKSPACIFY-ALLOCATE-MANIFEST.json';

/** A failure that is reported rather than thrown out of the process. */
// [::TICKET::] PX-256, PX-260, PX-261, PX-264, PX-270 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-256|PX-260|PX-261|PX-264|PX-270) --for-spec --no-implementation-order`.
export class ProjectionRefused extends Error {}

/**
 * Read a file, or refuse with the path named.
 *
 * @param {string} filePath
 * @returns {string}
 */
// [::TICKET::] PX-256, PX-270 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-256|PX-270) --for-spec --no-implementation-order`.
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
export function readJsonOrRefuse(filePath) {
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
 * The view states the workspace's line coordinate, so this list is an input to it. A workspace whose
 * seeds are absent, or whose package root cannot be walked, is refused rather than passed on as an
 * empty list: an empty list renders as a package count the workspace never measured, which is the
 * shape of the defect this projection exists to avoid repeating.
 *
 * @param {string} root
 * @returns {Array<{ packagePath: string, segmentIds: string[] }>}
 */
// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
export function readWorkspaceSegmentsOrRefuse(root) {
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
 * The artifact path names the workspace: the two manifests are resolved beside it, and the package
 * directory is resolved against the tree manifest rather than by its own name.
 *
 * @param {string} artifactPath
 * @param {string} packageDir
 * @returns {{ written: string[], packageId: string, reason: string|null, refused: string[] }}
 */
// [::TICKET::] PX-256, PX-259, PX-260, PX-261 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-256|PX-259|PX-260|PX-261) --for-spec --no-implementation-order`.
export function projectPackageView(artifactPath, packageDir) {
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
    ?? { serves: [], assignments: [], adjudications: [], refused: [] };
  const view = buildPackageView({
    artifact,
    treeManifest,
    packageSegments,
    obligations: { allocateManifest, declared: obligation.serves, record: { assignments: obligation.assignments, adjudications: obligation.adjudications } },
  }, resolved.packageId);
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(packageDir, VIEW_MARKDOWN_NAME), renderPackageViewMarkdown(view));
  fs.writeFileSync(path.join(packageDir, VIEW_JSON_NAME), renderPackageViewJson(view));

  return { written: [VIEW_MARKDOWN_NAME, VIEW_JSON_NAME], packageId: resolved.packageId, reason: null, refused: obligation.refused };
}
