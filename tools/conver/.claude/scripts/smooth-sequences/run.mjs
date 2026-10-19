#!/usr/bin/env node
// [::TICKET::] PX-275 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-275 --for-spec --no-implementation-order`.
/**
 * smooth-sequences — the final mechanical acceptance gate of the design pipeline.
 *
 * Usage:
 *   node .claude/scripts/smooth-sequences/run.mjs
 *   node .claude/scripts/smooth-sequences/run.mjs <workspace-root>
 *
 * With no argument the root is found by walking up from the current directory. With one
 * argument the same walk starts at that path. The command reads the workspace and writes
 * only SMOOTH-SEQUENCES.json and SMOOTH-SEQUENCES.md. Exit 0 means every non-withheld
 * check holds, 1 means at least one blocking finding, and 2 means the workspace could
 * not be read.
 */
import { checkArtifactViewConsistency, checkBoundaryClauses, checkContributionCompleteness, checkEnumerationIntegrity, checkOperationEnvelope, contributionWithheld } from './lib/checks-layer-a.mjs';
import { checkCrossingContracts, layerBWithheld } from './lib/checks-layer-b.mjs';
import { checkDangers } from './lib/checks-danger.mjs';
import { SmoothSequencesError } from './lib/errors.mjs';
import { indexArtifact } from './lib/index.mjs';
import { buildReport, EXIT_FINDINGS, EXIT_MISUSE, EXIT_PASS, writeReport } from './lib/report.mjs';
import { loadWorkspace, resolveWorkspaceRoot, startDirectoryFor } from './lib/workspace.mjs';

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
 * @param {string[]} argv — zero arguments or one workspace path
 * @param {{ stdout?: (line: string) => void, stderr?: (line: string) => void }} [io]
 * @returns {{ exitCode: number, report: object|null }}
 */
// [::TICKET::] PX-273 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-273 --for-spec --no-implementation-order`.
export function runCommand(argv, io = {}) {
  const stdout = io.stdout ?? ((line) => process.stdout.write(`${line}\n`));
  const stderr = io.stderr ?? ((line) => process.stderr.write(`${line}\n`));

  if (argv.length > 1) {
    stderr('smooth-sequences: usage: run.mjs [workspace-root]');
    return { exitCode: EXIT_MISUSE, report: null };
  }

  try {
    const root = resolveWorkspaceRoot(startDirectoryFor(argv[0]));
    const loaded = loadWorkspace(root);
    const index = indexArtifact(loaded);
    const findings = CHECK_FAMILIES.flatMap((check) => check(index));
    const withheld = [
      ...layerBWithheld(index),
      ...index.rules.withheld,
      ...contributionWithheld(index),
    ];
    const checks = { run: CHECK_FAMILIES.length, failed: findings.length };
    const report = buildReport({ workspace: loaded, findings, withheld, checks });
    const paths = writeReport({ report, outputDirectory: root });
    const exitCode = findings.length === 0 ? EXIT_PASS : EXIT_FINDINGS;
    stdout(`smooth-sequences: ${findings.length} finding(s); ${paths.jsonPath}`);
    return { exitCode, report };
  } catch (error) {
    if (error instanceof SmoothSequencesError) {
      stderr(`smooth-sequences: ${error.code}: ${error.message}${error.repair ? ` — ${error.repair}` : ''}`);
    } else {
      stderr(`smooth-sequences: ${error.message}`);
    }
    return { exitCode: EXIT_MISUSE, report: null };
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = runCommand(process.argv.slice(2)).exitCode;
}
