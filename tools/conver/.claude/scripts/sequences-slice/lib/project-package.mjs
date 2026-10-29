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
 * Design context: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-270 --for-spec --no-implementation-order`.
 */
import fs from 'node:fs';
import path from 'node:path';

import { parseSequencesArtifact } from './artifact.mjs';
import { digestOf, readDistributionRecord, writeDistributionRecord } from './distribution-record.mjs';
import { VIEW_JSON_NAME, VIEW_MARKDOWN_NAME } from './material.mjs';
import { readPackageObligations, resolveAssignedSequenceOwners } from './obligation.mjs';
import { resolvePackageByPath } from './packages.mjs';
import { PACKAGE_ROOT_DIRECTORY, readPackageSegments } from './segments.mjs';
import { buildPackageView, renderPackageViewJson, renderPackageViewMarkdown } from './view.mjs';

export const TREE_MANIFEST_FILENAME = 'WORKSPACIFY-TREE-MANIFEST.json';
export const ALLOCATE_MANIFEST_FILENAME = 'WORKSPACIFY-ALLOCATE-MANIFEST.json';

/** A failure that is reported rather than thrown out of the process. */
// [::TICKET::] PX-256, PX-260, PX-261, PX-264, PX-270 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-256|PX-260|PX-261|PX-264|PX-270) --for-spec --no-implementation-order`.
export class ProjectionRefused extends Error {}

/**
 * Read a file, or refuse with the path named.
 *
 * @param {string} filePath
 * @returns {string}
 */
// [::TICKET::] PX-256, PX-270 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-256|PX-270) --for-spec --no-implementation-order`.
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
// [::TICKET::] PX-256 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-256 --for-spec --no-implementation-order`.
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
// [::TICKET::] PX-256 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-256 --for-spec --no-implementation-order`.
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
 * Count a distribution when the view it writes differs from the recorded one.
 *
 * The comparison is between the projected JSON and the digest the record names, never
 * between the record and the file on disk: a manual edit that the projection restores is
 * the same distribution, not a new one. The view is already written when this runs, so a
 * failed record write leaves a correct view and an unknown count rather than losing the
 * view to a provenance failure.
 *
 * @param {string} packageDir
 * @param {string} viewJson — the exact bytes written to SEQUENCES.json
 * @returns {{ changed: boolean, distributions: number|null, reason: string|null }}
 */
// [::TICKET::] PX-282 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-282 --for-spec --no-implementation-order`.
function recordDistribution(packageDir, viewJson) {
  const digest = digestOf(viewJson);
  const previous = readDistributionRecord(packageDir);
  if (previous !== null && previous.digest === digest) {
    return { changed: false, distributions: previous.distributions, reason: null };
  }
  const distributions = (previous?.distributions ?? 0) + 1;
  try {
    writeDistributionRecord(packageDir, { distributions, digest });
    return { changed: true, distributions, reason: null };
  } catch (error) {
    return { changed: true, distributions: previous?.distributions ?? null, reason: error.message };
  }
}

/**
 * One package's record, found from either an absolute directory or one relative to the
 * workspace root.
 *
 * The record map is keyed by the package's path relative to the package root, so the
 * caller's form cannot be used as the key directly: a relative directory would resolve
 * against the process's current directory and name no record at all.
 *
 * @param {Map<string, object>} obligationsByPath
 * @param {string} root
 * @param {string} packageDir
 * @returns {object|null}
 */
export function packageRecordFor(obligationsByPath, root, packageDir) {
  const packageRoot = path.join(root, PACKAGE_ROOT_DIRECTORY);
  const key = path.relative(packageRoot, path.resolve(root, packageDir));
  return obligationsByPath.get(key) ?? null;
}

/**
 * Write the two view files and report what was written.
 *
 * The artifact path names the workspace: the two manifests are resolved beside it, and the package
 * directory is resolved against the tree manifest rather than by its own name.
 *
 * @param {string} artifactPath
 * @param {string} packageDir
 * @returns {{ written: string[], packageId: string, reason: string|null, refused: string[],
 *   distribution: { changed: boolean, distributions: number|null, reason: string|null } }}
 */
// [::TICKET::] PX-256, PX-259, PX-260, PX-261 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-256|PX-259|PX-260|PX-261) --for-spec --no-implementation-order`.
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
  const obligationsByPath = readPackageObligations(packageRoot, allocateManifest);
  const obligation = packageRecordFor(obligationsByPath, root, packageDir)
    ?? { serves: [], assignments: [], adjudications: [], refused: [] };
  // A sequence assignment places the whole ordered procedure, and only a package that knows
  // every assigner can tell an own unit from a shared one. Reading every record here is what
  // keeps the unit ids and owner lists equal across the views of one sequence.
  const sequenceAssignments = resolveAssignedSequenceOwners({
    packages: treeManifest.workspace.packages,
    recordsByPackageId: new Map(treeManifest.workspace.packages.map((pkg) => [pkg.id, packageRecordFor(obligationsByPath, root, pkg.path)])),
  });
  const view = buildPackageView({
    artifact,
    treeManifest,
    packageSegments,
    obligations: {
      allocateManifest,
      declared: obligation.serves,
      record: { assignments: obligation.assignments, adjudications: obligation.adjudications },
      sequenceAssignments,
    },
  }, resolved.packageId);
  fs.mkdirSync(packageDir, { recursive: true });
  const viewJson = renderPackageViewJson(view);
  fs.writeFileSync(path.join(packageDir, VIEW_MARKDOWN_NAME), renderPackageViewMarkdown(view));
  fs.writeFileSync(path.join(packageDir, VIEW_JSON_NAME), viewJson);
  const distribution = recordDistribution(packageDir, viewJson);

  return { written: [VIEW_MARKDOWN_NAME, VIEW_JSON_NAME], packageId: resolved.packageId, reason: null, refused: obligation.refused, distribution };
}
