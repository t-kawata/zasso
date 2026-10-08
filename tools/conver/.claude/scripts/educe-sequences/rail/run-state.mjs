// The run directory and the phase status file (PX-241, contracts C015, C020).
//
// The one-argument contract says the artifact, the rendering and everything else the
// run touches are determined by the argument alone, so the state lives beside the
// specification, in a directory named for this tool: `join(dirname(specPath),
// 'educe-sequences')`.
//
// PX-240 put it under the tool and gitignored it, on the argument that the contract
// should be a statement about products rather than about everything the run touched.
// That is reversed here, because the declaration and the readings are the evidence for
// the artifact: evidence kept under the tool is evidence a reader of the specification
// cannot find and cannot commit beside what it supports. The directory name carries no
// digest, so it is stable across revisions and an edited specification is refused
// against the state it already has rather than quietly opening a second one.
//
// The state carries no timestamp. A run that recorded when it happened would make the
// same run over the same specification produce different bytes on different days, and
// the only thing the status is for is deciding what to do next.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/** The directory a run keeps its state in, beside the specification that owns it. */
export const RUN_DIRECTORY_NAME = 'educe-sequences';

/** The status file each run directory holds. */
export const STATUS_FILE = 'status.json';

/** The phases a status file tracks, so a resumed run knows what is missing. */
export const TRACKED_PHASES = 17;

/**
 * The run directory for a specification.
 *
 * `root` overrides the specification's own directory and exists for tests that must
 * not write beside a committed fixture; a production caller passes the specification
 * path alone, which is what makes the location a pure function of the argument.
 */
export function runDirectoryFor(specPath, root = null) {
  return join(root ?? dirname(specPath), RUN_DIRECTORY_NAME);
}

/** The status file path inside a run directory. */
export function statusPath(directory) {
  return join(directory, STATUS_FILE);
}

/** Read a run's status, or null when the run has not been opened. */
export function readStatus(directory) {
  const path = statusPath(directory);
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

/** Write a run's status. */
export function writeStatus(directory, status) {
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true });
  writeFileSync(statusPath(directory), `${JSON.stringify(status, null, 2)}\n`);
}

/**
 * Why an existing status cannot be resumed, or null when it can.
 *
 * A specification changed by one byte has a different digest, and inheriting verdicts
 * taken against the previous revision would make every line citation in them mean
 * something else without saying so. The same holds for another specification that
 * happens to share the directory: one directory holds one specification's run.
 */
// [::TICKET::] PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-241 --for-spec --no-implementation-order`.
function whyNotResumed(existing, specPath, spec) {
  if (existing.spec?.path !== basename(specPath)) {
    return `the run directory belongs to ${existing.spec?.path}; this specification is ${basename(specPath)}`;
  }
  if (existing.spec?.sha256 !== spec.sha256) {
    return `the recorded state is for spec sha256 ${existing.spec?.sha256} and this specification is ${spec.sha256}; remove the run directory to start again`;
  }
  if (existing.spec?.lines !== spec.lineCount) {
    return `the recorded state is for a specification of ${existing.spec?.lines} lines and this one has ${spec.lineCount}`;
  }
  return null;
}

/**
 * Open a run, reusing the status of a previous run over the same revision.
 *
 * Reuse matters: a resumed run must not lose the loops it has already spent, or a
 * phase that fails repeatedly would be retried for ever. A status that cannot be
 * resumed is returned with the reason rather than overwritten, because overwriting
 * would destroy the evidence that a previous run existed.
 *
 * @returns {{directory: string, status: object, resumed: boolean, refused?: string}}
 */
export function openRun({ specPath, spec, root = null }) {
  const directory = runDirectoryFor(specPath, root);
  const existing = readStatus(directory);
  if (existing !== null) {
    const refused = whyNotResumed(existing, specPath, spec);
    if (refused !== null) return { directory, status: existing, resumed: false, refused };
    return { directory, status: existing, resumed: true };
  }

  const status = {
    spec: { path: basename(specPath), sha256: spec.sha256, lines: spec.lineCount },
    phases: [],
    readings: {},
  };
  writeStatus(directory, status);
  return { directory, status, resumed: false };
}

/** One phase's recorded state, or a fresh open record. */
export function phaseState(status, id) {
  return status.phases.find((phase) => phase.id === id) ?? { id, status: 'open', verdict: null, loops: 0 };
}

/**
 * Write one phase's record, replacing any earlier record for the same id.
 *
 * `loops` counts how many times the phase has been entered and refused. The count alone
 * is a tally; what makes "max N" in the command a limit is that `entryGate` reads it
 * against the phase's `maxLoops` and halts the run instead of entering again. `verdict`
 * is kept beside it because a halt repeats the last refusal verbatim, and the writer that
 * produced it is the only place that text exists.
 */
// [::TICKET::] PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-241 --for-spec --no-implementation-order`.
function writePhase(status, record) {
  status.phases = [...status.phases.filter((phase) => phase.id !== record.id), record].sort((left, right) => left.id - right.id);
  return status;
}

/**
 * Record that a phase passed.
 *
 * This writer and `noteLoop` below state their own `status` literally instead of taking a
 * flag from the caller. A flag is what caused the defect this shape replaces: the status
 * used to be derived from whether a verdict was present, so a refusal was written as a
 * completion and `requires` — the whole ordering — became satisfiable by a phase that had
 * just failed. With the status stated at each writer there is nothing left to infer.
 */
export function noteDone(status, id, { verdict, tag = null }) {
  const current = phaseState(status, id);
  return writePhase(status, { id, tag: tag ?? current.tag ?? null, status: 'done', verdict, loops: current.loops });
}

/**
 * Record that a phase was refused, which spends one loop.
 *
 * The phase is left refused rather than done, so every later phase that requires it is
 * still refused by the entry gate and `next` still proposes it. A refusal that read as a
 * completion would let the run walk past the failure it just recorded.
 */
export function noteLoop(status, id, tag, verdict) {
  const current = phaseState(status, id);
  return writePhase(status, { id, tag: tag ?? current.tag ?? null, status: 'refused', verdict, loops: current.loops + 1 });
}

/** The loops a phase has already spent. */
export function loopsFor(status, id) {
  return phaseState(status, id).loops;
}

/**
 * Record what a `[read]` phase reported: how many signed claims, and whether the phase
 * had anything to read at all. The two are kept apart because a phase that legitimately
 * found nothing is complete, and a phase whose reader never reported is not.
 */
export function noteReading(status, phaseName, { claims, vacuous = false }) {
  status.readings = { ...status.readings, [phaseName]: { claims, vacuous } };
  return status;
}

/** What a `[read]` phase reported, with the shape a caller can rely on. */
export function readingOf(status, phaseName) {
  const record = status.readings[phaseName];
  if (typeof record === 'number') return { claims: record, vacuous: false };
  return record ?? { claims: 0, vacuous: false };
}

/** The phases that are not yet done, in order. */
export function openPhases(status) {
  return Array.from({ length: TRACKED_PHASES }, (_, index) => index + 1).filter((id) => phaseState(status, id).status !== 'done');
}
