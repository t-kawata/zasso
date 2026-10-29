#!/usr/bin/env node
// [::TICKET::] PX-341 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-341 --for-spec --no-implementation-order`.
/**
 * Report the obligation state of a workspace without deciding anything about it.
 *
 * The two gates answer whether the guarantee holds, and they answer it with an exit code the grill
 * reads at Step 1, Step 3 and Step 8. A tree that never runs the grill is therefore never asked,
 * and this reporter is the asking: it runs both gates over a workspace and prints what they say,
 * so a session can see the state without a pipeline run and without a verdict being pronounced.
 *
 * It exits 0 on every path, which is the whole point of separating it from the gates. A reporter
 * that could fail would become a second blocking point, and the blocking decision belongs to one
 * place — the Step 8 gate — where the run has already declared that it intends to establish the
 * guarantee. Anywhere else, a nonzero exit would stop work over a state the reader had not claimed.
 *
 * The gate verdicts are read by running the gates rather than by measuring a second time. A second
 * reader would be a second thing to drift, and the drift would be invisible: the reporter and the
 * gate would disagree about the same workspace and the reader would have no way to tell which one
 * the grill would act on.
 */
import path from 'node:path';

import { main as coverageGateMain, readJsonOrNull } from './check-obligation-coverage.js';
import { findPackageDirectories, main as dischargeGateMain } from './check-ledger-discharge.js';
import { readPackageObligationState } from './obligation-state.js';
import { SOURCE_ARTIFACT_SUFFIX } from '../sequences-slice/lib/material.mjs';
import { SEQUENCE_VERDICT_COMPLETE, SEQUENCE_VERDICT_FAILED } from '../sequences-slice/lib/package-verdict.mjs';
import { toHomeRelative } from '../lib/path-utils.js';

const USAGE = 'usage: report-obligation-state.js <WORKSPACE_ROOT> [<material>...]';

/** The workspace's own package list, which is the only place a package id and a directory are joined. */
const TREE_MANIFEST_FILENAME = 'WORKSPACIFY-TREE-MANIFEST.json';
/** The command that verifies, after a repair, that every carried unit is accounted for. */
const DISCHARGE_COMMAND = 'node "$(git rev-parse --show-toplevel)/.claude/scripts/grill-me-for-rfc/check-ledger-discharge.js"';

/** This reporter never blocks, on any path, including the ones where it cannot do its work. */
const EXIT_ADVISORY = 0;

/**
 * One gate's exit code and everything it printed.
 *
 * The gates write their findings to stdout and answer with a code, and there is no way to ask them
 * for the findings without also letting them print. Redirecting for the duration of one call keeps
 * the two apart so a quiet verdict can be summarised in one line instead of replayed, and the
 * redirection is restored in a finally so a gate that throws does not leave the process writing
 * into a buffer nobody reads.
 *
 * @param {() => number} runGate
 * @returns {{ status: number, output: string }}
 */
// [::TICKET::] PX-262 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-262 --for-spec --no-implementation-order`.
function captureGateOutput(runGate) {
  const written = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => {
    written.push(String(chunk));
    return true;
  };
  try {
    return { status: runGate(), output: written.join('') };
  } finally {
    process.stdout.write = originalWrite;
  }
}

/** The findings a gate printed, as lines, or nothing when it found nothing to report. */
// [::TICKET::] PX-262 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-262 --for-spec --no-implementation-order`.
function findingsOf(gate, subject) {
  if (gate.status === EXIT_ADVISORY) return [`${subject}: reported nothing to repair`];
  return gate.output.split('\n').filter((line) => line.trim().length > 0).map((line) => `  ${line}`);
}

/**
 * Every package directory the workspace names, with the id the allocation knows it by.
 *
 * The tree manifest is the authority because it is the only document that joins an id to a
 * directory; a workspace that carries none still receives an answer, keyed by the directory's own
 * name, because a report that refused would be a report nobody could read.
 */
// [::TICKET::] PX-270 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-270 --for-spec --no-implementation-order`.
function packageDirectoriesOf(root) {
  const treeManifest = readJsonOrNull(path.join(root, TREE_MANIFEST_FILENAME));
  const packages = treeManifest?.workspace?.packages;
  if (Array.isArray(packages) && packages.length > 0) {
    return packages.map((pkg) => ({ packageId: String(pkg.id), directory: path.join(root, String(pkg.path)) }));
  }
  return findPackageDirectories(root).map((directory) => ({ packageId: path.basename(directory), directory }));
}

/** What is wrong with one directory, and what writing it right would consist of. */
// [::TICKET::] PX-270 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-270 --for-spec --no-implementation-order`.
function describeEntry(root, { packageId, directory }) {
  const { material, verdict } = readPackageObligationState(directory);
  const relative = path.relative(root, directory);
  const repair = verdict.state === SEQUENCE_VERDICT_FAILED
    ? `re-run /grill-me-for-rfc in ${relative} so the units above acquire rows in its own Distribution ledger`
    : null;
  return {
    packageId,
    directory: relative,
    state: verdict.state,
    reason: verdict.reason,
    unaccountedUnitIds: material.unaccountedUnitIds,
    repair,
  };
}

/**
 * A count and its noun, so the report reads as prose.
 *
 * A template plural renders as "(s)" or "(ies)", which is the mark of a sentence assembled from
 * parts; the section exists to be read by whoever has to repair the workspace.
 */
// [::TICKET::] PX-270 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-270 --for-spec --no-implementation-order`.
function countNoun(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** The lines one failed directory contributes: what is missing, what to write, and the command. */
// [::TICKET::] PX-270 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-270 --for-spec --no-implementation-order`.
function renderFailedEntry(entry) {
  return [
    '',
    `### ${entry.directory} — failed (${entry.reason})`,
    'The projection reached this directory and its own Distribution ledger does not account for what it carries.',
    '',
    `**What is missing.** ${countNoun(entry.unaccountedUnitIds.length, 'unit')} this package carries and its ledger does not name:`,
    ...entry.unaccountedUnitIds.map((unitId) => `  - \`${unitId}\``),
    '',
    "**What to write.** one row per unit above, in this document's own Distribution ledger, whose",
    'location is a section of this document that designs the boundary the row names, and whose ground',
    'says what the row rests on. The section that designs a unit is the one a reader would open to',
    'check it, not the one the projection happens to cite.',
    '',
    `**Repair.** ${entry.repair}`,
  ];
}

/**
 * The carriage of a workspace, directory by directory.
 *
 * The two gates answer whether the guarantee holds and this reporter's other half prints what they
 * said. Neither says which directory to open or what to write in it, so a run that saw a short
 * clause had to reconstruct the repair from three scripts and six files. This is that answer, and
 * it is a reading: it judges each directory through the same reader the gates use, so a report and a
 * gate cannot disagree about one workspace.
 *
 * @param {{ root: string }} input
 * @returns {{ entries: object[], failedPackageIds: string[], notYetPackageIds: string[], completePackageIds: string[], text: string }}
 */
// [::TICKET::] PX-270 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-270 --for-spec --no-implementation-order`.
export function describeCarriage({ root }) {
  const entries = packageDirectoriesOf(root).map((entry) => describeEntry(root, entry));
  const idsInState = (state) => entries.filter((entry) => entry.state === state).map((entry) => entry.packageId).sort();
  const failedPackageIds = idsInState(SEQUENCE_VERDICT_FAILED);
  const notYetPackageIds = entries
    .filter((entry) => entry.state !== SEQUENCE_VERDICT_FAILED && entry.state !== SEQUENCE_VERDICT_COMPLETE)
    .map((entry) => entry.packageId)
    .sort();
  const completePackageIds = idsInState(SEQUENCE_VERDICT_COMPLETE);

  const text = [
    '',
    '## Obligation carriage',
    '',
    `${countNoun(entries.length, 'directory', 'directories')} named by this workspace's allocation: `
      + `${completePackageIds.length} carried, ${failedPackageIds.length} reached and not accounted for, `
      + `${notYetPackageIds.length} not yet projected with the carriage.`,
    // flatMap, because each entry is itself a block of lines: mapping alone leaves arrays inside
    // the list and Array.join stringifies those with commas, which renders the whole report as one
    // paragraph of comma-separated sentences.
    ...entries.filter((entry) => entry.state === SEQUENCE_VERDICT_FAILED).flatMap(renderFailedEntry),
    // Stated once, at the end, and about the workspace rather than about one directory: the
    // per-directory line says what to do there, and a reader is not told the same command twice.
    ...(failedPackageIds.length === 0 ? [] : ['', `**Done when.** \`${DISCHARGE_COMMAND} ${toHomeRelative(root)}\` exits 0, and the units above have rows.`]),
    ...(notYetPackageIds.length === 0 ? [] : ['', `Not yet carried: ${notYetPackageIds.join(', ')}. These need a grill run in each, which projects the view from the artifact as it starts.`]),
    ...(completePackageIds.length === 0 ? [] : ['', `Carried and accounted for: ${completePackageIds.join(', ')}.`]),
  ];
  return { entries, failedPackageIds, notYetPackageIds, completePackageIds, text: text.join('\n') };
}

/**
 * Run both gates over one workspace and print what they said.
 *
 * @param {string[]} [argv]
 * @returns {number}
 */
// [::TICKET::] PX-262 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-262 --for-spec --no-implementation-order`.
export function main(argv = process.argv.slice(2)) {
  const [rootArgument, ...materials] = argv.filter((argument) => !argument.startsWith('--'));
  if (rootArgument === undefined) {
    process.stderr.write(`${USAGE}\n`);
    return EXIT_ADVISORY;
  }
  const root = path.resolve(rootArgument);

  const lines = [`obligation state: ${toHomeRelative(root)}`];
  for (const [subject, runGate] of [['coverage', coverageGateMain], ['discharge', dischargeGateMain]]) {
    try {
      lines.push(...findingsOf(captureGateOutput(() => runGate([root])), subject));
    } catch (error) {
      lines.push(`  ${subject}: the gate could not be run — ${error.message}`);
    }
  }
  // The carriage section is a condition on this run being handed an artifact, not on the workspace:
  // a project with no artifact is asked nothing and prints exactly what it printed before.
  if (materials.some((material) => material.endsWith(SOURCE_ARTIFACT_SUFFIX))) {
    lines.push(describeCarriage({ root }).text);
  }
  lines.push('advisory: nothing here blocks; the blocking decision belongs to the grill Step 8 gate');
  process.stdout.write(`${lines.join('\n')}\n`);
  return EXIT_ADVISORY;
}

// The reporter is spawned as a program by a session and by its tests, so the entry point is explicit.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  process.exit(main());
}

export { captureGateOutput, describeEntry, findingsOf, packageDirectoriesOf };
