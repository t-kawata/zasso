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
 * The projection itself lives in `lib/project-package.mjs` and this file is its command line, so
 * that the initialization step of a grill run can repair a view without spawning a process and
 * without a second writer existing. What is added here is the two forms the command offers and the
 * JSON both of them print.
 *
 * Design context: tools/conver/README.md — 上流ループ, and PX-256 for the ordering that
 * places the tolerant detector before the strict reader.
 */

import fs from 'node:fs';
import path from 'node:path';

import { VIEW_JSON_NAME } from './lib/material.mjs';
import {
  ALLOCATE_MANIFEST_FILENAME,
  ProjectionRefused,
  TREE_MANIFEST_FILENAME,
  projectPackageView,
  readJsonOrRefuse,
  readWorkspaceSegmentsOrRefuse,
} from './lib/project-package.mjs';

const EXIT_OK = 0;
const USAGE = 'usage: run.mjs <sequences-artifact> [<package-dir>] — one package directory, or every package the allocation names';

/**
 * Project a view for every package the allocation names that carries none.
 *
 * The single-package form is what the grill command calls, once per directory, and it
 * reaches only the directories someone ran it in — which is how a workspace of
 * twenty-nine packages came to hold twenty-six views with nothing naming the other
 * three. This form answers the question the single one cannot: which packages the
 * allocation names and no run has reached.
 *
 * It is additive. A package already carrying a view is reported as present and left
 * byte-identical, because a re-run that rewrote a view would make every later
 * projection a new claim rather than the same one. A package the material cannot carry
 * is reported with its reason rather than thrown, for the reason the single form reports
 * rather than throws: this runs inside a pipeline, and a workspace that cannot be
 * projected is a finding about the workspace, not a reason to stop the command.
 *
 * @param {string} artifactPath
 * @returns {{ projected: string[], present: string[], reported: Array<{packageId: string, reason: string}>, reason?: string }}
 */
// [::TICKET::] PX-264 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-264 --for-spec --no-implementation-order`.
// [::TICKET::] PX-270 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-270 --for-spec --no-implementation-order`.
function projectWorkspace(artifactPath) {
  const root = path.dirname(artifactPath);

  let treeManifest;
  try {
    treeManifest = readJsonOrRefuse(path.join(root, TREE_MANIFEST_FILENAME));
    // Read once here rather than once per package, so a workspace missing a manifest is
    // refused with one reason instead of one reason per package it names.
    readJsonOrRefuse(path.join(root, ALLOCATE_MANIFEST_FILENAME));
    readWorkspaceSegmentsOrRefuse(root);
  } catch (error) {
    if (!(error instanceof ProjectionRefused)) throw error;
    return { projected: [], present: [], reported: [], reason: error.message };
  }

  const projected = [];
  const present = [];
  const reported = [];
  for (const entry of treeManifest.workspace?.packages ?? []) {
    const packageDir = path.join(root, entry.path);
    if (fs.existsSync(path.join(packageDir, VIEW_JSON_NAME))) {
      present.push(entry.id);
      continue;
    }
    try {
      projectPackageView(artifactPath, packageDir);
      projected.push(entry.id);
    } catch (error) {
      if (!(error instanceof ProjectionRefused)) throw error;
      reported.push({ packageId: entry.id, reason: error.message });
    }
  }
  return { projected: projected.sort(), present: present.sort(), reported };
}

// [::TICKET::] PX-256, PX-260, PX-261, PX-264 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-256|PX-260|PX-261|PX-264) --for-spec --no-implementation-order`.
// [::TICKET::] PX-270 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-270 --for-spec --no-implementation-order`.
function main() {
  const positional = process.argv.slice(2);
  if (positional.length !== 1 && positional.length !== 2) {
    process.stdout.write(`${JSON.stringify({ written: [], packageId: null, reason: USAGE, refused: [] })}\n`);
    return EXIT_OK;
  }

  const artifactPath = path.resolve(positional[0]);

  try {
    process.stdout.write(positional.length === 1
      ? `${JSON.stringify(projectWorkspace(artifactPath))}\n`
      : `${JSON.stringify(projectPackageView(artifactPath, path.resolve(positional[1])))}\n`);
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
