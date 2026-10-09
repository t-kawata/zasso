// the command (PX-240, contracts C010, C011, C013).
//
// One argument, one derived location, one artifact. Four run shapes follow from that
// and they are the whole surface:
//
//   no artifact, no readings   the shape is performed and nothing is read, so the run
//                              stops at the first [read] phase. This is the honest
//                              result of a run that has not read anything, and it is
//                              deliberately not a success.
//   no artifact, readings      the pins are established from the text, the readings
//                              are proven, the checks run, and the artifact is written.
//   artifact, no readings      a verification: the pins are re-derived against the
//                              specification and the recorded digest is matched. No
//                              byte is written.
//   artifact, readings         a rebuild. Over an unchanged specification it must
//                              produce byte-identical output, which is what makes the
//                              artifact checkable by a script at any time.
import { existsSync, readFileSync } from 'node:fs';

import { VERIFY_COMMAND, buildArtifact } from './artifact.mjs';
import { coverageLine } from './coverage.mjs';
import { limbCensusLines } from './report.mjs';
import { checkAll, describeRefusal } from './engine.mjs';
import { digestOf, readArtifact, readJsonOrNull, readSpecification } from './load.mjs';
import { artifactPathFor, parseSpecArgument, renderPathFor } from './paths.mjs';
import { rederiveAll } from './pins.mjs';
import { ADJUDICATION_OUTCOMES, applyReadings } from './reading.mjs';
import { loadAdhocChecks } from './adhoc.mjs';
import { railExitStoreFor } from './harness.mjs';
import { inquestBeside } from './readings.mjs';
import { runDirectoryFor, statusPath } from './run-state.mjs';
import { suppliedDigestOf } from './supplied.mjs';
import { readRailExits } from './harness.mjs';

/** The exit codes the command contract declares. */
export const EXIT = Object.freeze({ OK: 0, REFUSED: 1, MISUSED: 2 });

/** The refusal a run reports when nothing has been read. */
const UNREAD_REASON = 'the run performed the shape and read nothing; the first [read] phase carries no signed reading';

/**
 * Run the command.
 *
 * @param {string[]} argv — the arguments after the script name
 * @param {{runInput?: {declaration: object, readings: object}, stdout?: (line: string) => void,
 *          stderr?: (line: string) => void, railExits?: unknown[]}} options
 */
// [::TICKET::] PX-242 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-242 --for-spec --no-implementation-order`.
// [::TICKET::] PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-244 --for-spec --no-implementation-order`.
// [::TICKET::] PX-247 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-247 --for-spec --no-implementation-order`.
export async function runCommand(argv, options = {}) {
  const stdout = options.stdout ?? ((line) => process.stdout.write(`${line}\n`));
  const stderr = options.stderr ?? ((line) => process.stderr.write(`${line}\n`));
  const runInput = options.runInput ?? null;

  const parsed = parseSpecArgument(argv);
  if (!parsed.ok) {
    stderr(`refused: ${parsed.reason}`);
    return { exitCode: EXIT.MISUSED, artifactPath: null, summary: null, verdicts: [] };
  }

  const { specPath } = parsed;
  const spec = readSpecification(specPath);
  const artifactPath = artifactPathFor(specPath);
  const existing = readArtifact(artifactPath);

  // The product path loads the same checks the phase driver does, so the two report the
  // same count. A module that cannot join the set refuses the run rather than being
  // dropped: a check missing from the count reads exactly like a check that passed.
  const loaded = await loadAdhocChecks({ directory: runDirectoryFor(specPath) });
  if (loaded.problems.length > 0) {
    stderr(`refused: the ad-hoc check set could not be assembled: ${loaded.problems.join('; ')}`);
    return { exitCode: EXIT.REFUSED, artifactPath, summary: null, verdicts: loaded.problems.map((problem) => ({ check: 'adhoc', reason: problem })) };
  }

  // A citation is meaningful only against one revision, so a recorded digest that no
  // longer matches is refused rather than re-derived silently: repairing it would
  // make every line number in the artifact mean something else without saying so.
  if (existing !== null) {
    if (existing.spec.sha256 !== spec.sha256 || existing.spec.lines !== spec.lineCount) {
      stderr(`refused: the artifact records spec sha256 ${existing.spec.sha256} over ${existing.spec.lines} lines; this specification is ${spec.sha256} over ${spec.lineCount} lines`);
      return { exitCode: EXIT.REFUSED, artifactPath, summary: null, verdicts: [] };
    }
  }

  if (existing !== null && runInput === null) {
    // The material is re-digested beside the specification rather than read from the
    // artifact's own claim: a verification that compared the record against itself
    // would agree with any record at all.
    const suppliedDigest = suppliedDigestOf(runDirectoryFor(specPath));
    if (existing.supplied !== undefined && existing.supplied.digest !== suppliedDigest) {
      stderr(`refused: the artifact records supplied digest ${existing.supplied.digest}; the material beside this specification digests to ${suppliedDigest}`);
      return { exitCode: EXIT.REFUSED, artifactPath, summary: null, verdicts: [] };
    }
    const rederived = rederiveAll(existing.pins, spec.lines);
    const { verdicts, summary } = checkAll({
      specLines: spec.lines,
      artifact: existing,
      recorded: {
        railExits: options.railExits ?? readRailExits(railExitStoreFor(runDirectoryFor(specPath))),
        inquest: options.inquest ?? inquestBeside(runDirectoryFor(specPath)),
        adhocChecks: loaded.checks,
      },
    });
    const failures = [...rederived.failures, ...verdicts];
    if (failures.length > 0) {
      for (const failure of failures) stderr(`refused: ${describeRefusal(failure)}`);
      return { exitCode: EXIT.REFUSED, artifactPath, summary: null, verdicts: failures };
    }
    report(stdout, summary, previousCoverageFor(specPath));
    stdout(`artifact digest: ${digestOf(artifactPath)}`);
    return { exitCode: EXIT.OK, artifactPath, summary, verdicts: [] };
  }

  if (runInput === null) {
    stderr(`refused: ${UNREAD_REASON}`);
    return { exitCode: EXIT.REFUSED, artifactPath: null, summary: null, verdicts: [] };
  }

  const artifact = buildArtifact({
    specPath,
    spec,
    declaration: runInput.declaration,
    readings: runInput.readings,
    supplied: suppliedDigestOf(runDirectoryFor(specPath)),
  });
  const { verdicts, summary } = checkAll({
    specLines: spec.lines,
    artifact,
    recorded: {
      railExits: options.railExits ?? readRailExits(railExitStoreFor(runDirectoryFor(specPath))),
      inquest: options.inquest ?? inquestBeside(runDirectoryFor(specPath)),
      adhocChecks: loaded.checks,
    },
  });

  if (verdicts.length > 0) {
    for (const verdict of verdicts) stderr(`refused: ${describeRefusal(verdict)}`);
    return { exitCode: EXIT.REFUSED, artifactPath, summary: null, verdicts };
  }

  // The integrator performs the write, so a refusal leaves the artifact byte-identical
  // to its state before the call rather than half-updated.
  const applied = applyReadings({ artifactPath, readings: runInput.readings.sequences, artifact, specLines: spec.lines });
  if (applied.refused !== undefined) {
    for (const refusal of applied.refused) stderr(`refused: ${refusal.subject} ${refusal.field}: ${refusal.why}`);
    return { exitCode: EXIT.REFUSED, artifactPath, summary: null, verdicts: applied.refused };
  }
  report(stdout, summary, previousCoverageFor(specPath));
  stdout(`artifact digest: ${digestOf(artifactPath)}`);
  stdout(`rendering: ${renderPathFor(specPath)} (run rail/render.mjs to write it)`);
  return { exitCode: EXIT.OK, artifactPath, summary, verdicts: [] };
}

/**
 * The measurements of the generation before this one, or null when the run holds none.
 *
 * Read tolerantly: this runs while a report is being printed, and a record that cannot be
 * parsed has the same answer here as a record that is not there — nothing to compare
 * against. The state machine still refuses a status it cannot read, so only the
 * comparison is given up and the run that was already verified still reports.
 */
// [::TICKET::] PX-245 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-245 --for-spec --no-implementation-order`.
function previousCoverageFor(specPath) {
  const recorded = readJsonOrNull(statusPath(runDirectoryFor(specPath)));
  return recorded?.history?.at(-1)?.coverage ?? null;
}

/**
 * Print the coverage block: every line is a number a reading pass moves.
 *
 * The measurements carry the generation before them when the run directory holds one, so
 * a reader running the product path sees the same comparison the phase driver's report
 * shows. The predecessor comes from the status rather than from a flag, because a number
 * that could be supplied by the caller is a number that could disagree with the run.
 */
// [::TICKET::] PX-240, PX-241, PX-244, PX-243, PX-245, PX-246 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241|PX-244|PX-243|PX-245|PX-246) --for-spec --no-implementation-order`.
function report(stdout, summary, previousCoverage = null) {
  const measured = coverageLine(summary);
  stdout(previousCoverage === null ? measured : `${measured} (previous generation: ${coverageLine(previousCoverage)})`);
  for (const line of limbCensusLines(summary)) stdout(line);
  stdout(`checksRun=${summary.checksRun} of ${summary.checksDeclared} checksAdhoc=${summary.checksAdhoc}`);
  stdout(`pinsRederived=${summary.pinsRederived} of ${summary.pinsTotal}`);
  stdout(`railExits=${summary.railExits} promotionCandidates=${summary.promotionCandidates}`);
  const unread = summary.sequencesUnread ?? 0;
  if (unread > 0) stdout(`sequencesUnread=${unread}`);
}

/** The outcomes a reading may declare, re-exported for the command file's refusal list. */
export const DECLARED_OUTCOMES = ADJUDICATION_OUTCOMES;

// Re-exported so a caller that already holds this module does not have to reach past it
// for the composition rule and the verify command.
export { VERIFY_COMMAND, buildArtifact };

/** Whether an artifact already exists beside a specification. */
export function artifactExists(specPath) {
  return existsSync(artifactPathFor(specPath));
}

/**
 * Read a run input from stdin when one was piped in.
 *
 * Stdin is not an argument, which is why it can carry the readings without breaking
 * the one-argument contract: a run with nothing piped in is a run that has read
 * nothing, and it is refused at the first [read] phase rather than guessed at.
 */
// [::TICKET::] PX-240, PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241) --for-spec --no-implementation-order`.
function readRunInputFromStdin() {
  if (process.stdin.isTTY) return null;
  try {
    const text = readFileSync(0, 'utf8').trim();
    return text === '' ? null : JSON.parse(text);
  } catch {
    return null;
  }
}

// Command-line entry: `node rail/run.mjs <spec-file>`.
if (process.argv[1] !== undefined && process.argv[1].endsWith('run.mjs')) {
  process.exitCode = (await runCommand(process.argv.slice(2), { runInput: readRunInputFromStdin() })).exitCode;
}
