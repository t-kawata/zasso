// [::TICKET::] PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-248 --for-spec --no-implementation-order`.
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
import { coverageLine, predecessorLine } from './coverage.mjs';
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
import { suppliedDigestOf, suppliedDocumentsOf } from './supplied.mjs';
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

  // A run without readings stands by the artifact beside the specification and is judged by
  // it; a run holding readings is about to replace it, so it clears the ground and is judged
  // by what it built. Judging the old artifact first would make a check added after that
  // artifact was written a wall rather than a gate: the only way out of a failed generation
  // would be refused as well.
  if (runInput === null) {
    const verified = await verifyArtifact(specPath, options);
    if (verified.refusals.length > 0) {
      for (const refusal of verified.refusals) stderr(`refused: ${refusal}`);
      return { exitCode: EXIT.REFUSED, artifactPath: verified.artifactPath, summary: null, verdicts: verified.verdicts };
    }
    if (verified.existing === null) {
      stderr(`refused: ${UNREAD_REASON}`);
      return { exitCode: EXIT.REFUSED, artifactPath: null, summary: null, verdicts: [] };
    }
    report(stdout, verified.summary, previousCoverageFor(specPath));
    stdout(`artifact digest: ${digestOf(verified.artifactPath)}`);
    return { exitCode: EXIT.OK, artifactPath: verified.artifactPath, summary: verified.summary, verdicts: [] };
  }

  const ground = await loadRunGround(specPath);
  if (ground.refusals.length > 0) {
    for (const refusal of ground.refusals) stderr(`refused: ${refusal}`);
    return { exitCode: EXIT.REFUSED, artifactPath: ground.artifactPath, summary: null, verdicts: ground.verdicts };
  }

  const material = suppliedDocumentsOf(runDirectoryFor(specPath));
  const artifact = buildArtifact({
    specPath,
    spec: ground.spec,
    declaration: runInput.declaration,
    readings: runInput.readings,
    supplied: suppliedDigestOf(runDirectoryFor(specPath)),
    suppliedDocuments: material,
  });
  const { verdicts, summary } = checkAll({
    specLines: ground.spec.lines,
    artifact,
    recorded: {
      railExits: options.railExits ?? readRailExits(railExitStoreFor(runDirectoryFor(specPath))),
      inquest: options.inquest ?? inquestBeside(runDirectoryFor(specPath)),
      adhocChecks: ground.checks,
      supplied: material,
    },
  });

  if (verdicts.length > 0) {
    for (const verdict of verdicts) stderr(`refused: ${describeRefusal(verdict)}`);
    return { exitCode: EXIT.REFUSED, artifactPath: ground.artifactPath, summary: null, verdicts };
  }

  // The integrator performs the write, so a refusal leaves the artifact byte-identical
  // to its state before the call rather than half-updated.
  const applied = applyReadings({ artifactPath: ground.artifactPath, readings: runInput.readings.sequences, artifact, specLines: ground.spec.lines });
  if (applied.refused !== undefined) {
    for (const refusal of applied.refused) stderr(`refused: ${refusal.subject} ${refusal.field}: ${refusal.why}`);
    return { exitCode: EXIT.REFUSED, artifactPath: ground.artifactPath, summary: null, verdicts: applied.refused };
  }
  report(stdout, summary, previousCoverageFor(specPath));
  stdout(`artifact digest: ${digestOf(ground.artifactPath)}`);
  stdout(`rendering: ${renderPathFor(specPath)} (run rail/render.mjs to write it)`);
  return { exitCode: EXIT.OK, artifactPath: ground.artifactPath, summary, verdicts: [] };
}

/**
 * The ground both product paths stand on before either can proceed.
 *
 * Everything a run needs before it can judge anything: the specification, the artifact
 * beside it, and the checks the run directory adds to the declared set. A module that
 * cannot join the set refuses rather than being dropped, because a check missing from the
 * count reads exactly like a check that passed. An artifact recorded against another
 * revision or other material is refused rather than silently re-derived, because repairing
 * it would make every line number in it mean something else without saying so.
 *
 * The artifact's own verdicts are deliberately not part of this. Judging them is what
 * verification does, and a run holding readings is about to replace that artifact rather
 * than stand by it — so a check added after the artifact was written is a gate for the next
 * reading and not a wall in front of it.
 *
 * @param {string} specPath — the specification the artifact lies beside
 * @returns {Promise<{spec: object, artifactPath: string, existing: object|null, checks: object[],
 *   verdicts: object[], refusals: string[]}>} — `refusals` is empty when there is nothing
 *   to refuse, which includes a specification that has no artifact beside it yet.
 */
// [::TICKET::] PX-249 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-249 --for-spec --no-implementation-order`.
async function loadRunGround(specPath) {
  const spec = readSpecification(specPath);
  const artifactPath = artifactPathFor(specPath);
  const existing = readArtifact(artifactPath);

  // The product path loads the same checks the phase driver does, so the two report the
  // same count.
  const loaded = await loadAdhocChecks({ directory: runDirectoryFor(specPath) });
  // What was read, before any judgement: every answer below is this, plus how it came out.
  const runAsRead = { spec, artifactPath, existing, checks: loaded.checks };
  if (loaded.problems.length > 0) {
    return {
      ...runAsRead,
      verdicts: loaded.problems.map((problem) => ({ check: 'adhoc', reason: problem })),
      refusals: [`the ad-hoc check set could not be assembled: ${loaded.problems.join('; ')}`],
    };
  }

  if (existing === null) return { ...runAsRead, verdicts: [], refusals: [] };

  if (existing.spec.sha256 !== spec.sha256 || existing.spec.lines !== spec.lineCount) {
    return {
      ...runAsRead,
      verdicts: [],
      refusals: [`the artifact records spec sha256 ${existing.spec.sha256} over ${existing.spec.lines} lines; this specification is ${spec.sha256} over ${spec.lineCount} lines`],
    };
  }

  // The material is re-digested beside the specification rather than read from the
  // artifact's own claim: a verification that compared the record against itself would
  // agree with any record at all.
  const suppliedDigest = suppliedDigestOf(runDirectoryFor(specPath));
  if (existing.supplied !== undefined && existing.supplied.digest !== suppliedDigest) {
    return {
      ...runAsRead,
      verdicts: [],
      refusals: [`the artifact records supplied digest ${existing.supplied.digest}; the material beside this specification digests to ${suppliedDigest}`],
    };
  }

  return { ...runAsRead, verdicts: [], refusals: [] };
}

/**
 * Verify the artifact beside a specification, and answer with everything a caller needs.
 *
 * One implementation for both surfaces that verify: `run.mjs` without readings prints the
 * refusals this returns and reports only when it returns none, and `render.mjs` writes the
 * rendering on the same condition. The two used to carry their own copies — which is how a
 * rendering came to be written from records no check had ever read.
 *
 * A specification with no artifact beside it is not a refusal: the caller decides what that
 * means, because a run with readings is about to write the first artifact and a rendering
 * has nothing to draw.
 *
 * @param {string} specPath — the specification the artifact lies beside
 * @param {{railExits?: unknown[], inquest?: unknown[]}} options — the records a test supplies
 * @returns {Promise<{spec: object, artifactPath: string, existing: object|null, checks: object[],
 *   artifact: object|null, summary: object|null, verdicts: object[], refusals: string[]}>}
 *   — `artifact` and `summary` are set only when the verification passed; `refusals` holds
 *   one described line per failure in the order they were found.
 */
// [::TICKET::] PX-249 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-249 --for-spec --no-implementation-order`.
export async function verifyArtifact(specPath, options = {}) {
  const ground = await loadRunGround(specPath);
  if (ground.refusals.length > 0 || ground.existing === null) {
    return { ...ground, artifact: null, summary: null };
  }

  const { spec, existing } = ground;
  const material = suppliedDocumentsOf(runDirectoryFor(specPath));
  const rederived = rederiveAll(existing.pins, spec.lines, material);
  const { verdicts, summary } = checkAll({
    specLines: spec.lines,
    artifact: existing,
    recorded: {
      railExits: options.railExits ?? readRailExits(railExitStoreFor(runDirectoryFor(specPath))),
      inquest: options.inquest ?? inquestBeside(runDirectoryFor(specPath)),
      adhocChecks: ground.checks,
      supplied: material,
    },
  });
  const failures = [...rederived.failures, ...verdicts];
  if (failures.length > 0) {
    return { ...ground, artifact: null, summary: null, verdicts: failures, refusals: failures.map((failure) => describeRefusal(failure)) };
  }
  return { ...ground, artifact: existing, summary, verdicts: [], refusals: [] };
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
// [::TICKET::] PX-240, PX-241, PX-244, PX-243, PX-245, PX-246, PX-251 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241|PX-244|PX-243|PX-245|PX-246|PX-251) --for-spec --no-implementation-order`.
function report(stdout, summary, previousCoverage = null) {
  const measured = coverageLine(summary);
  // The predecessor is respelled through the mapping rather than handed to `coverageLine`:
  // a stored generation measured under another vocabulary would otherwise be read by field
  // names that meant other sets when it was written, and print `entries=undefined`.
  const predecessor = predecessorLine(previousCoverage);
  stdout(predecessor === null ? measured : `${measured} (previous generation: ${predecessor})`);
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
