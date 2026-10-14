// The demand the specification states, and who still owes it (PX-260).
//
// The rail emits the demand and never assigns it. What it can state from its own materials is
// what the specification asks for: the candidate columns its pinned vocabularies reach through
// the operation rows, and how many boundaries the workspace's contract registry declares. Both
// derive from the specification and from frozen manifests alone, so they cannot go stale inside
// an artifact that is verified by re-derivation.
//
// Who owes a demand is measured fresh every time this is asked, and never stored: a view is
// written by a later run of a different command, so a stored partition would be a claim about a
// workspace state that has already moved. The partition itself is the sequences slice's — the one
// implementation of it — because a second copy here would be a second answer to one question.
//
// The workspace is read beside the specification, the way the run directory is derived from it
// rather than passed beside it. A specification with no workspace beside it is not an error: it is
// a workspace that has declared nothing yet, and every demand it states is owed by nobody.
import fs from 'node:fs';
import { existsSync, mkdirSync } from 'node:fs';
import path, { join } from 'node:path';

import { DEMAND_AXES, demandFactsOf, measureCoverage } from '../../sequences-slice/lib/obligation-coverage.mjs';
import { VIEW_JSON_NAME } from '../../sequences-slice/lib/material.mjs';
import { PACKAGE_ROOT_DIRECTORY } from '../../sequences-slice/lib/segments.mjs';
import { replaceFile, runDirectoryFor } from './run-state.mjs';

/** The name the demand record carries inside the run directory. */
// [::TICKET::] PX-261 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-261 --for-spec --no-implementation-order`.
export const DEMAND_RECORD_NAME = 'demand.json';

/** The manifests a workspace carries beside its specification. */
const TREE_MANIFEST_FILENAME = 'WORKSPACIFY-TREE-MANIFEST.json';
const ALLOCATE_MANIFEST_FILENAME = 'WORKSPACIFY-ALLOCATE-MANIFEST.json';

/** Read and parse one JSON file beside the specification, or null when it cannot be read. */
// [::TICKET::] PX-260, PX-261, PX-262 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-260|PX-261|PX-262) --for-spec --no-implementation-order`.
function readJsonOrNull(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/** Every package view beneath a workspace root, in path order. */
// [::TICKET::] PX-260, PX-261, PX-262 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-260|PX-261|PX-262) --for-spec --no-implementation-order`.
function readViewsBeneath(root) {
  const packageRoot = path.join(root, PACKAGE_ROOT_DIRECTORY);
  if (!fs.existsSync(packageRoot)) return [];
  const views = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.name === VIEW_JSON_NAME) {
        const view = readJsonOrNull(fullPath);
        if (view !== null) views.push(view);
      }
    }
  };
  walk(packageRoot);
  return views;
}

/**
 * The workspace the specification sits in, as far as the demand question needs it.
 *
 * A missing manifest is answered with the empty manifold rather than with a refusal, because the
 * question this answers is not "is this workspace well formed" — the coverage gate answers that —
 * but "how many boundaries does it declare", and an absent registry declares none.
 *
 * @param {string} specPath
 * @returns {{ allocateManifest: object, treeManifest: object|null, views: object[] }}
 */
// [::TICKET::] PX-260, PX-261, PX-262 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-260|PX-261|PX-262) --for-spec --no-implementation-order`.
function readWorkspaceBeside(specPath) {
  const root = path.dirname(specPath);
  return {
    allocateManifest: readJsonOrNull(path.join(root, ALLOCATE_MANIFEST_FILENAME)) ?? { contract_registry: [] },
    treeManifest: readJsonOrNull(path.join(root, TREE_MANIFEST_FILENAME)),
    views: readViewsBeneath(root),
  };
}

/**
 * The demand facts an artifact carries, read from the specification and the frozen manifests.
 *
 * @param {string} specPath
 * @param {object} artifact — the artifact being composed, which is what the columns are read from
 * @returns {{ candidateColumns: string[], boundaryCount: number, counts: object }}
 */
// [::TICKET::] PX-260 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-260 --for-spec --no-implementation-order`.
export function demandFactsBeside(specPath, artifact) {
  return demandFactsOf({ artifact, allocateManifest: readWorkspaceBeside(specPath).allocateManifest });
}

/**
 * The demand, and the partition of it the workspace has reached.
 *
 * The unassigned list is flattened across the axes so a report prints one line per demand rather
 * than one per axis; the axes themselves stay in the measured partition, because a reader asking
 * why the guarantee does not hold needs the axis as much as the id.
 *
 * @param {string} specPath
 * @param {object} artifact
 * @returns {{ facts: object, denominator: object, coverage: object }}
 */
// [::TICKET::] PX-260 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-260 --for-spec --no-implementation-order`.
/**
 * Write the demand this run measured, beside the run that measured it.
 *
 * The rail's durable products are the artifact and the rendering, and neither may carry the
 * demand's partition: the artifact is verified by re-derivation and a verification writes nothing,
 * so a partition stored in it would go stale the moment another command wrote a view. The run
 * directory is the rail's own, and a file written directly into it is not an inherited asset —
 * inherit.mjs builds that set from a fixed list of names plus the adhoc and archive directories —
 * so recording the demand there changes nothing a later generation inherits.
 *
 * The record is a snapshot and says so. A grill run resolves demands without re-running the rail,
 * so the file answers "what did the last rail run measure", and the live answer is the gate.
 *
 * @param {string} specPath
 * @param {object} artifact
 * @returns {string} the path the record was written to
 */
// [::TICKET::] PX-261 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-261 --for-spec --no-implementation-order`.
export function writeDemandRecord(specPath, artifact) {
  const directory = runDirectoryFor(specPath);
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true });

  const summary = demandSummaryBeside(specPath, artifact);
  const record = {
    measuredAgainst: { spec: artifact?.spec?.sha256 ?? null, path: artifact?.spec?.path ?? null },
    note: 'a snapshot of the run that wrote it; the live answer is check-obligation-coverage.js',
    facts: summary.facts,
    // What each demand axis was measured against. Recorded here rather than refused over: a run
    // that borrowed no census has produced an artifact it can produce, and the rail's product is a
    // reading of the specification rather than a verdict about it. The absence is written down so
    // the next reader finds it stated instead of inferring it from a verdict that withheld, and so
    // a later run that does supply the census moves this field rather than being refused entry.
    denominator: summary.denominator,
    coverage: summary.coverage,
  };
  const recordPath = join(directory, DEMAND_RECORD_NAME);
  replaceFile(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  return recordPath;
}

// [::TICKET::] PX-261 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-261 --for-spec --no-implementation-order`.
export function demandSummaryBeside(specPath, artifact) {
  const workspace = readWorkspaceBeside(specPath);
  const measured = measureCoverage({
    artifact,
    allocateManifest: workspace.allocateManifest,
    views: workspace.views,
    exemptions: artifact?.exemptions ?? [],
    treeManifest: workspace.treeManifest,
  });
  return {
    facts: demandFactsOf({ artifact, allocateManifest: workspace.allocateManifest }),
    denominator: measured.denominator,
    coverage: {
      verdict: measured.verdict,
      unassigned: DEMAND_AXES.flatMap((axis) => measured.axes[axis].unassigned.map((demand) => ({ axis, id: demand.id }))),
      refusedExemptions: measured.refusedExemptions,
      denominatorGaps: measured.denominatorGaps,
      assignmentDistribution: measured.assignmentDistribution,
    },
  };
}
