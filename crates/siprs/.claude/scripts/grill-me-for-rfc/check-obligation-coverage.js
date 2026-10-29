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

import { toHomeRelative } from '../lib/path-utils.js';
import {
  DEMAND_AXES,
  DEMAND_RELATIONS,
  VERDICT_HOLDS,
  describeRefusedExemption,
  findUngroundedAdjudications,
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
// [::TICKET::] PX-259 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-259 --for-spec --no-implementation-order`.
function readJsonOrNull(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/** The workspace's sequences artifact, or null when the root carries none. */
// [::TICKET::] PX-259 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-259 --for-spec --no-implementation-order`.
function findArtifact(root) {
  const entries = fs.existsSync(root) ? fs.readdirSync(root) : [];
  const name = entries.find((entry) => entry.endsWith(SOURCE_ARTIFACT_SUFFIX) && entry.endsWith('.json'));
  return name === undefined ? null : readJsonOrNull(path.join(root, name));
}

/** Every package view beneath the workspace's package root, in path order. */
// [::TICKET::] PX-259 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-259 --for-spec --no-implementation-order`.
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
// [::TICKET::] PX-259 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-259 --for-spec --no-implementation-order`.
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
// [::TICKET::] PX-260, PX-261, PX-262, PX-263 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-260|PX-261|PX-262|PX-263) --for-spec --no-implementation-order`.
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
// [::TICKET::] PX-260, PX-261, PX-262, PX-263 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-260|PX-261|PX-262|PX-263) --for-spec --no-implementation-order`.
function renderAssignmentDistribution(coverage) {
  const rows = coverage.assignmentDistribution.filter((row) => row.count > 0);
  if (rows.length === 0) return ['assignment distribution: no package holds an obligation unit'];
  return [`assignment distribution: ${rows.map((row) => `${row.packageId} ${row.count}`).join(', ')}`];
}

/** The lines naming every exemption that was refused, and the rule each one broke. */
// [::TICKET::] PX-260, PX-261, PX-262, PX-263 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-260|PX-261|PX-262|PX-263) --for-spec --no-implementation-order`.
function renderRefusedExemptionLines(coverage) {
  if (coverage.refusedExemptions.length === 0) return [];
  return [
    `refused exemptions: ${coverage.refusedExemptions.length}`,
    ...coverage.refusedExemptions.map((row) => `  ${describeRefusedExemption(row)}`),
  ];
}

/** The packages whose record named a unit the artifact does not hold, with the names it used. */
// [::TICKET::] PX-260, PX-261, PX-262, PX-263 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-260|PX-261|PX-262|PX-263) --for-spec --no-implementation-order`.
function findUnboundAssignments(views) {
  return views
    .filter((view) => (view.unboundAssignments ?? []).length > 0)
    .map((view) => `${view.packageId} — ${view.unboundAssignments.join(', ')}`);
}

/**
 * The lines naming each exemption with the route it was recorded on.
 *
 * One line per demand rather than one per row. A live workspace carries dozens of exemption rows
 * that name the same region — four blank-line rows for one line, and so on — and the partition
 * counts the demand once, so printing the rows would print the same fact repeatedly and bury the
 * one that differs.
 */
// [::TICKET::] PX-261, PX-262, PX-263 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-261|PX-262|PX-263) --for-spec --no-implementation-order`.
function renderExemptionRouteLines(coverage) {
  const seen = new Set();
  const lines = [];
  for (const row of coverage.allowedExemptions) {
    const key = `${row.route}:${row.subject}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(`exempted (${row.route}): ${row.subject}`);
  }
  return lines;
}

/**
 * The lines naming every judgment whose ground names nothing the workspace holds.
 *
 * Printed as its own family because it is a different defect from an unassigned demand: the
 * demand was placed, and the evidence for placing it does not resolve. A reviewer repairs it by
 * reading the specification, not by deciding anything new.
 */
// [::TICKET::] PX-261, PX-262, PX-263 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-261|PX-262|PX-263) --for-spec --no-implementation-order`.
function renderUnresolvedGroundLines(coverage) {
  return coverage.unresolvedGrounds.map((row) => `unresolved ground: ${row.axis} ${row.subject} — ${row.ground}`);
}

/**
 * The lines naming a surface declaration that binds to nothing.
 *
 * Two ways to bind to nothing, and they read differently on purpose: a column no operation row
 * carries cannot reach an operation at all, while a column whose values its declared vocabulary
 * does not cover is a declaration about something other than what it says it is.
 */
// [::TICKET::] PX-261, PX-262, PX-263 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-261|PX-262|PX-263) --for-spec --no-implementation-order`.
function renderUnboundDeclarationLines(views) {
  const lines = [];
  for (const view of views) {
    for (const unit of view.obligationUnits ?? []) {
      if (unit?.relation !== 'serves') continue;
      const { column, operationSet, crossChecked, foreignValues } = unit.coverage ?? {};
      if (crossChecked === false) {
        lines.push(`declaration binding nothing: ${view.packageId} ${unit.unitId} — the artifact carries no ${column} column`);
      } else if (Array.isArray(foreignValues) && foreignValues.length > 0) {
        const value = foreignValues.length === 1 ? 'value' : 'values';
        lines.push(`declaration binding nothing: ${view.packageId} ${unit.unitId} — ${foreignValues.length} ${value} of ${column} is not ${operationSet}`);
      }
    }
  }
  return lines;
}

/**
 * What this verdict does and does not guarantee, and where the rest of the chain is measured.
 *
 * Printed by the gate rather than left to the reader, because a gate that says only "holds" is
 * claiming more than it checked. The third line exists because an earlier version of this sentence
 * claimed traceability to a design node and an implementation header: neither is measured here and
 * neither exists yet, since the graph, the headers and the tickets are produced after this gate
 * runs. A claim that cannot be true where it is printed is worse than no claim, because a reader
 * stops looking, so the sentence states what this stage can establish and names the stage that
 * measures the rest.
 */
// [::TICKET::] PX-261, PX-262 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-261|PX-262) --for-spec --no-implementation-order`.
export const GUARANTEE_LINES = Object.freeze([
  'guarantees: every demand is placed by a named package, by a route that resolves, and every placement is traceable to an RFC section anchor and a ledger row',
  'does not guarantee: that a judgment is the right one, or that the specification names every procedure the project needs',
  'measured elsewhere: the design node, the implementation header and the ticket are measured by drill-rfc-down Step 5, because they do not exist when this gate runs',
]);

// [::TICKET::] PX-263 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-263 --for-spec --no-implementation-order`.
function renderGuaranteeLines() {
  return [...GUARANTEE_LINES];
}

/** The lines naming the judgments that named nothing, and the ones that carried no ground. */
// [::TICKET::] PX-260, PX-261, PX-262, PX-263 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-260|PX-261|PX-262|PX-263) --for-spec --no-implementation-order`.
function renderAssignmentFindingLines(views) {
  const lines = [];
  const unbound = findUnboundAssignments(views);
  if (unbound.length > 0) lines.push(`unbound assignments: ${unbound.join('; ')}`);

  const ungrounded = findUngroundedAssignments(views);
  if (ungrounded.length > 0) lines.push(`ungrounded assignments: ${ungrounded.join(', ')}`);
  const ungroundedAdjudications = findUngroundedAdjudications(views);
  if (ungroundedAdjudications.length > 0) lines.push(`ungrounded adjudications: ${ungroundedAdjudications.join(', ')}`);
  return lines;
}

/** The lines naming every demand that no package owes. */
// [::TICKET::] PX-259, PX-261, PX-262, PX-263 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-259|PX-261|PX-262|PX-263) --for-spec --no-implementation-order`.
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

/**
 * The line stating what each axis is measured against.
 *
 * Printed before the partition because it frames it: a count of assigned demands means one thing
 * against a borrowed census and another against a list the artifact wrote itself. Every axis is
 * named rather than only the gaps, so a reader sees which axes were stated and by what structure,
 * and not only which were not.
 */
// [::TICKET::] PX-262, PX-263 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-262|PX-263) --for-spec --no-implementation-order`.
function renderDenominatorLine(coverage) {
  const stated = DEMAND_AXES.map((axis) => `${axis} ${coverage.denominator[axis].source} ${coverage.denominator[axis].members}`);
  return `denominator: ${stated.join(', ')}`;
}

/**
 * The lines naming every axis whose completeness cannot be judged, with the repair it calls for.
 *
 * Kept apart from the unassigned list because it is a different statement: an unassigned demand is
 * a decision the workspace has not made, while an unstated axis is a question the workspace cannot
 * answer, and no amount of assigning will answer it.
 */
// [::TICKET::] PX-262, PX-263 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-262|PX-263) --for-spec --no-implementation-order`.
function renderDenominatorGapLines(coverage) {
  if (coverage.denominatorGaps.length === 0) return [];
  return [
    `unstated denominator: ${coverage.denominatorGaps.length}`,
    ...coverage.denominatorGaps.map((gap) => `  ${gap.axis}: ${gap.why}. repair: ${gap.repair}`),
  ];
}

/** The line stating what the workspace holds. */
// [::TICKET::] PX-259, PX-263 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-259|PX-263) --for-spec --no-implementation-order`.
function renderVerdictLine(coverage, exemptionCount) {
  const assigned = DEMAND_AXES.reduce((total, axis) => total + coverage.axes[axis].assigned.length, 0);
  const unassigned = DEMAND_AXES.reduce((total, axis) => total + coverage.axes[axis].unassigned.length, 0);
  return `verdict: ${coverage.verdict} — ${assigned} demand(s) assigned, ${exemptionCount} exempted, ${unassigned} assigned to nobody`;
}

/** Measure one workspace and print its verdict. */
// [::TICKET::] PX-259, PX-260, PX-261, PX-262, PX-263 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-259|PX-260|PX-261|PX-262|PX-263) --for-spec --no-implementation-order`.
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
    renderDenominatorLine(coverage),
    ...renderDenominatorGapLines(coverage),
    ...renderAssignedLines(coverage),
    ...renderAssignmentDistribution(coverage),
    ...renderExemptionRouteLines(coverage),
    ...renderUnassignedLines(coverage),
    ...renderRefusedExemptionLines(coverage),
    ...renderUnresolvedGroundLines(coverage),
    ...renderUnboundDeclarationLines(views),
    ...renderAssignmentFindingLines(views),
    ...renderGuaranteeLines(),
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
  const defects = unbound.length > 0
    || findUnboundAssignments(views).length > 0
    || renderUnboundDeclarationLines(views).length > 0;
  if (coverage.verdict !== VERDICT_HOLDS || defects) return EXIT_FAILED;
  return EXIT_OK;
}

// The gate is spawned as a program by both the grill and its tests, so the entry point is explicit.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  process.exit(main());
}

export { findArtifact, findDeclarationsThatDidNotBind, main, readJsonOrNull, readViews, renderDenominatorGapLines, renderDenominatorLine, renderGuaranteeLines, renderUnassignedLines };
