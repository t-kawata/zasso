#!/usr/bin/env node
// [::TICKET::] PX-275 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-275 --for-spec --no-implementation-order`.
/**
 * smooth-sequences — the final mechanical acceptance gate of the design pipeline.
 *
 * Usage:
 *   node .claude/scripts/smooth-sequences/run.mjs
 *   node .claude/scripts/smooth-sequences/run.mjs <workspace-root>
 *
 * The current directory, or the single argument when one is given, is the workspace root
 * itself. The root must hold both manifests directly; the command never walks up to a
 * parent. The command reads the workspace and writes only SMOOTH-SEQUENCES.json and
 * SMOOTH-SEQUENCES.md. Exit 0 means every non-withheld check holds, 1 means at least one
 * blocking finding, and 2 means the workspace could not be read.
 */
import { checkArtifactViewConsistency, checkBoundaryClauses, checkContributionCompleteness, checkEnumerationIntegrity, checkOperationEnvelope, contributionWithheld } from './lib/checks-layer-a.mjs';
import { checkCrossingContracts, layerBWithheld } from './lib/checks-layer-b.mjs';
import { checkDangers } from './lib/checks-danger.mjs';
import { SmoothSequencesError } from './lib/errors.mjs';
import { indexArtifact } from './lib/index.mjs';
import { annotatePersisted, buildReport, EXIT_FINDINGS, EXIT_MISUSE, EXIT_PASS, readPreviousReport, renderConsoleReport, writeReport } from './lib/report.mjs';
import { assertWorkspaceRoot, loadWorkspace, startDirectoryFor } from './lib/workspace.mjs';

/** Every check family, in report order. */
const CHECK_FAMILIES = Object.freeze([
  checkEnumerationIntegrity,
  checkOperationEnvelope,
  checkBoundaryClauses,
  checkContributionCompleteness,
  checkArtifactViewConsistency,
  checkCrossingContracts,
  checkDangers,
]);

/**
 * Run the detector.
 *
 * @param {string[]} argv — zero arguments (current directory) or one workspace root
 * @param {{ stdout?: (line: string) => void, stderr?: (line: string) => void }} [io]
 * @returns {{ exitCode: number, report: object|null }}
 */
// [::TICKET::] PX-273 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-273 --for-spec --no-implementation-order`.
// [::TICKET::] PX-276 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-276 --for-spec --no-implementation-order`.
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
export function runCommand(argv, io = {}) {
  const stdout = io.stdout ?? ((line) => process.stdout.write(`${line}\n`));
  const stderr = io.stderr ?? ((line) => process.stderr.write(`${line}\n`));

  if (argv.length > 1) {
    stderr('smooth-sequences: usage: run.mjs [workspace-root]');
    return { exitCode: EXIT_MISUSE, report: null };
  }

  try {
    const root = assertWorkspaceRoot(startDirectoryFor(argv[0]));
    const loaded = loadWorkspace(root);
    const index = indexArtifact(loaded);
    const rawFindings = CHECK_FAMILIES.flatMap((check) => check(index));
    const findings = annotatePersisted(rawFindings, readPreviousReport(root));
    const withheld = [
      ...layerBWithheld(index),
      ...index.vocabulary.withheld,
      ...contributionWithheld(index),
    ];
    const checks = { run: CHECK_FAMILIES.length, failed: findings.length };
    const report = buildReport({ workspace: loaded, findings, withheld, checks });
    const paths = writeReport({ report, outputDirectory: root });
    const exitCode = findings.length === 0 ? EXIT_PASS : EXIT_FINDINGS;
    for (const line of renderConsoleReport(report, paths)) stdout(line);
    return { exitCode, report };
  } catch (error) {
    if (error instanceof SmoothSequencesError) {
      stderr(`smooth-sequences: ${error.code}: ${error.message}${error.repair ? ` — ${error.repair}` : ''}`);
    } else {
      stderr(`smooth-sequences: ${error.message}`);
    }
    stderr('next: fix the workspace and rerun; no report was written.');
    return { exitCode: EXIT_MISUSE, report: null };
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = runCommand(process.argv.slice(2)).exitCode;
}
