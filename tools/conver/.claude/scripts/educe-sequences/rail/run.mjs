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
import { checkAll, ENGINE_DECLARED_CHECK_COUNT } from './engine.mjs';
import { digestOf, readArtifact, readSpecification } from './load.mjs';
import { artifactPathFor, parseSpecArgument, renderPathFor } from './paths.mjs';
import { rederiveAll } from './pins.mjs';
import { ADJUDICATION_OUTCOMES, applyReadings } from './reading.mjs';
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
export function runCommand(argv, options = {}) {
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
    const rederived = rederiveAll(existing.pins, spec.lines);
    const { verdicts, summary } = checkAll({ specLines: spec.lines, artifact: existing, railExits: options.railExits ?? [] });
    const failures = [...rederived.failures, ...verdicts];
    if (failures.length > 0) {
      for (const failure of failures) stderr(`refused: ${failure.check ?? failure.pin}: ${failure.reason}`);
      return { exitCode: EXIT.REFUSED, artifactPath, summary: null, verdicts: failures };
    }
    report(stdout, summary);
    stdout(`artifact digest: ${digestOf(artifactPath)}`);
    return { exitCode: EXIT.OK, artifactPath, summary, verdicts: [] };
  }

  if (runInput === null) {
    stderr(`refused: ${UNREAD_REASON}`);
    return { exitCode: EXIT.REFUSED, artifactPath: null, summary: null, verdicts: [] };
  }

  const artifact = buildArtifact({ specPath, spec, declaration: runInput.declaration, readings: runInput.readings });
  const { verdicts, summary } = checkAll({ specLines: spec.lines, artifact, railExits: options.railExits ?? readRailExits() });

  if (verdicts.length > 0) {
    for (const verdict of verdicts) stderr(`refused: ${verdict.check}: ${verdict.reason}`);
    return { exitCode: EXIT.REFUSED, artifactPath, summary: null, verdicts };
  }

  // The integrator performs the write, so a refusal leaves the artifact byte-identical
  // to its state before the call rather than half-updated.
  const applied = applyReadings({ artifactPath, readings: runInput.readings.sequences, artifact, specLines: spec.lines });
  if (applied.refused !== undefined) {
    for (const refusal of applied.refused) stderr(`refused: ${refusal.subject} ${refusal.field}: ${refusal.why}`);
    return { exitCode: EXIT.REFUSED, artifactPath, summary: null, verdicts: applied.refused };
  }

  report(stdout, summary);
  stdout(`artifact digest: ${digestOf(artifactPath)}`);
  stdout(`rendering: ${renderPathFor(specPath)} (run rail/render.mjs to write it)`);
  return { exitCode: EXIT.OK, artifactPath, summary, verdicts: [] };
}

/** Print the coverage block: every line is a number a reading pass moves. */
// [::TICKET::] PX-240, PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241) --for-spec --no-implementation-order`.
function report(stdout, summary) {
  stdout(`rows=${summary.rows} sequences=${summary.sequences} steps=${summary.steps} operations=${summary.operations}`);
  stdout(`checksRun=${summary.checksRun} of ${ENGINE_DECLARED_CHECK_COUNT}`);
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
  process.exitCode = runCommand(process.argv.slice(2), { runInput: readRunInputFromStdin() }).exitCode;
}
