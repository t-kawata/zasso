#!/usr/bin/env node
/**
 * check-obligation-coverage.js <WORKSPACE_ROOT>
 *
 * The gate that decides whether a workspace's obligations cover the workspace.
 *
 * The guarantee is an implication whose antecedent is a property of the whole workspace — every
 * package discharges its own set — so this gate is measured over the workspace root and not over one
 * package: every package's run reaches the same verdict, and an incomplete workspace is incomplete
 * from all of them. Exit 0 means every demand is assigned to a named package or exempted with a
 * ground; exit 1 means a demand is assigned to nobody, which is reported by axis and by id.
 *
 * It does not decide whether the design is adequate, which is a reading and not a property.
 *
 * Exit-code contract:
 *   every demand assigned or exempted → 0
 *   a demand assigned to nobody, or an unreadable input → 1
 *
 * Design context: tools/conver/docs/FIX-PLAN006.md sections 3.5 and 3.6.
 */
import fs from 'node:fs';
import path from 'node:path';

import {
  DEMAND_AXES,
  DEMAND_RELATIONS,
  VERDICT_HOLDS,
  describeRefusedExemption,
  findUngroundedAssignments,
  measureCoverage,
} from '../sequences-slice/lib/obligation-coverage.mjs';
import { SOURCE_ARTIFACT_SUFFIX, VIEW_JSON_NAME } from '../sequences-slice/lib/material.mjs';
import { PACKAGE_ROOT_DIRECTORY } from '../sequences-slice/lib/segments.mjs';
import { OBLIGATION_SOURCES } from '../sequences-slice/lib/obligation.mjs';

const EXIT_OK = 0;
const EXIT_FAILED = 1;

const TREE_MANIFEST_FILENAME = 'WORKSPACIFY-TREE-MANIFEST.json';
const ALLOCATE_MANIFEST_FILENAME = 'WORKSPACIFY-ALLOCATE-MANIFEST.json';
const USAGE = 'usage: check-obligation-coverage.js <WORKSPACE_ROOT>';

/** The verdict a view declares when it holds no obligation units. */
const DECLARED_SOURCE = OBLIGATION_SOURCES[0];

/** Read and parse one JSON file, or null when it cannot be read. */
// [::TICKET::] PX-259 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-259 --for-spec --no-implementation-order`.
function readJsonOrNull(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/** The workspace's sequences artifact, or null when the root carries none. */
// [::TICKET::] PX-259 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-259 --for-spec --no-implementation-order`.
function findArtifact(root) {
  const entries = fs.existsSync(root) ? fs.readdirSync(root) : [];
  const name = entries.find((entry) => entry.endsWith(SOURCE_ARTIFACT_SUFFIX) && entry.endsWith('.json'));
  return name === undefined ? null : readJsonOrNull(path.join(root, name));
}

/** Every package view beneath the workspace's package root, in path order. */
// [::TICKET::] PX-259 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-259 --for-spec --no-implementation-order`.
function readViews(root) {
  const packageRoot = path.join(root, PACKAGE_ROOT_DIRECTORY);
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
  if (fs.existsSync(packageRoot)) walk(packageRoot);
  return views;
}

/**
 * The views that declare a surface mapping and hold no unit for it.
 *
 * The coverage gate subsumes this in outcome, and it is reported apart because the two facts call
 * for different repairs: a declaration that did not bind to its package is a wiring defect, while an
 * unserved column is a decision the workspace has not made yet.
 *
 * @param {object[]} views
 * @returns {string[]}
 */
// [::TICKET::] PX-259 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-259 --for-spec --no-implementation-order`.
function findDeclarationsThatDidNotBind(views) {
  return views
    .filter((view) => view?.obligationSource === DECLARED_SOURCE && (view.obligationUnits ?? []).length === 0)
    .map((view) => String(view.packageId));
}

/**
 * The lines naming, per axis, how many demands were placed and by which relation.
 *
 * The mix is printed because a count alone cannot tell a workspace that distributed its work from
 * one where a single relation reached everything. An axis nobody placed a demand on prints no
 * line: a zero here is the unassigned list's business, and stating it twice invites the reader to
 * read one of the two as the other.
 */
// [::TICKET::] PX-260, PX-261, PX-262, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-260|PX-261|PX-262|PX-263) --for-spec --no-implementation-order`.
function renderAssignedLines(coverage) {
  return DEMAND_AXES.flatMap((axis) => {
    const assigned = coverage.axes[axis].assigned;
    if (assigned.length === 0) return [];
    const mix = DEMAND_RELATIONS
      .map((relation) => [relation, assigned.filter((demand) => demand.by === relation).length])
      .filter(([, count]) => count > 0)
      .map(([relation, count]) => `${relation} ${count}`)
      .join(', ');
    return [`assigned ${axis}: ${assigned.length} (${mix})`];
  });
}

/** The lines naming the demands one package was handed, so a concentration is visible. */
// [::TICKET::] PX-260, PX-261, PX-262, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-260|PX-261|PX-262|PX-263) --for-spec --no-implementation-order`.
function renderAssignmentDistribution(coverage) {
  const rows = coverage.assignmentDistribution.filter((row) => row.count > 0);
  if (rows.length === 0) return ['assignment distribution: no package holds an obligation unit'];
  return [`assignment distribution: ${rows.map((row) => `${row.packageId} ${row.count}`).join(', ')}`];
}

/** The lines naming every exemption that was refused, and the rule each one broke. */
// [::TICKET::] PX-260, PX-261, PX-262, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-260|PX-261|PX-262|PX-263) --for-spec --no-implementation-order`.
function renderRefusedExemptionLines(coverage) {
  if (coverage.refusedExemptions.length === 0) return [];
  return [
    `refused exemptions: ${coverage.refusedExemptions.length}`,
    ...coverage.refusedExemptions.map((row) => `  ${describeRefusedExemption(row)}`),
  ];
}

/** The packages whose record named a unit the artifact does not hold, with the names it used. */
// [::TICKET::] PX-260, PX-261, PX-262, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-260|PX-261|PX-262|PX-263) --for-spec --no-implementation-order`.
function findUnboundAssignments(views) {
  return views
    .filter((view) => (view.unboundAssignments ?? []).length > 0)
    .map((view) => `${view.packageId} — ${view.unboundAssignments.join(', ')}`);
}

/** The lines naming the judgments that named nothing, and the ones that carried no ground. */
// [::TICKET::] PX-260, PX-261, PX-262, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-260|PX-261|PX-262|PX-263) --for-spec --no-implementation-order`.
function renderAssignmentFindingLines(views) {
  const lines = [];
  const unbound = findUnboundAssignments(views);
  if (unbound.length > 0) lines.push(`unbound assignments: ${unbound.join('; ')}`);

  const ungrounded = findUngroundedAssignments(views);
  if (ungrounded.length > 0) lines.push(`ungrounded assignments: ${ungrounded.join(', ')}`);
  return lines;
}

/** The lines naming every demand that no package owes. */
// [::TICKET::] PX-259 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-259 --for-spec --no-implementation-order`.
function renderUnassignedLines(coverage) {
  const lines = [];
  for (const axis of DEMAND_AXES) {
    const demands = coverage.axes[axis].unassigned;
    if (demands.length === 0) continue;
    lines.push(`unassigned ${axis}: ${demands.length}`);
    for (const demand of demands) lines.push(`  ${axis}: ${demand.id}`);
  }
  return lines;
}

/** The line stating what the workspace holds. */
// [::TICKET::] PX-259 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-259 --for-spec --no-implementation-order`.
function renderVerdictLine(coverage, exemptionCount) {
  const assigned = DEMAND_AXES.reduce((total, axis) => total + coverage.axes[axis].assigned.length, 0);
  const unassigned = DEMAND_AXES.reduce((total, axis) => total + coverage.axes[axis].unassigned.length, 0);
  return `verdict: ${coverage.verdict} — ${assigned} demand(s) assigned, ${exemptionCount} exempted, ${unassigned} assigned to nobody`;
}

/** Measure one workspace and print its verdict. */
// [::TICKET::] PX-259, PX-260, PX-261, PX-262, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-259|PX-260|PX-261|PX-262|PX-263) --for-spec --no-implementation-order`.
function main(argv = process.argv.slice(2)) {
  const [rootArgument] = argv.filter((argument) => !argument.startsWith('--'));
  if (rootArgument === undefined) {
    process.stderr.write(`${USAGE}\n`);
    return EXIT_FAILED;
  }
  const root = path.resolve(rootArgument);

  const artifact = findArtifact(root);
  const allocateManifest = readJsonOrNull(path.join(root, ALLOCATE_MANIFEST_FILENAME));
  if (artifact === null || allocateManifest === null) {
    process.stderr.write(`refused: ${toHomeRelative(root)} does not hold both an artifact and an ${ALLOCATE_MANIFEST_FILENAME}\n`);
    return EXIT_FAILED;
  }

  const views = readViews(root);
  const exemptions = (artifact.exemptions ?? []).filter((row) => typeof row?.why === 'string' && row.why.trim().length > 0);
  const coverage = measureCoverage({
    artifact,
    allocateManifest,
    views,
    exemptions,
    treeManifest: readJsonOrNull(path.join(root, TREE_MANIFEST_FILENAME)),
  });

  const unbound = findDeclarationsThatDidNotBind(views);
  const lines = [
    renderVerdictLine(coverage, DEMAND_AXES.reduce((total, axis) => total + coverage.axes[axis].exempt.length, 0)),
    ...renderAssignedLines(coverage),
    ...renderAssignmentDistribution(coverage),
    ...renderUnassignedLines(coverage),
    ...renderRefusedExemptionLines(coverage),
    ...renderAssignmentFindingLines(views),
  ];
  if (coverage.unreachedOwnedObjects > 0) {
    lines.push(`objects no operation reaches: ${coverage.unreachedOwnedObjects} (owned by a package the ownership join cannot see)`);
  }
  if (unbound.length > 0) {
    lines.push(`declared but unbound: ${unbound.join(', ')}`);
  }
  process.stdout.write(`${lines.join('\n')}\n`);

  // A refusal here is not a judgment about the design; it is a defect in the record itself — a
  // declaration that bound to nothing, a judgment that named a demand the artifact does not hold,
  // or a judgment with no ground. All three are repairable and none of them is coverage.
  const defects = unbound.length > 0 || findUnboundAssignments(views).length > 0;
  if (coverage.verdict !== VERDICT_HOLDS || defects) return EXIT_FAILED;
  return EXIT_OK;
}

// The gate is spawned as a program by both the grill and its tests, so the entry point is explicit.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  process.exit(main());
}

export { findDeclarationsThatDidNotBind, main, readViews, renderUnassignedLines };
