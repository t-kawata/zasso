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
export const TRACKED_PHASES = 18;

/**
 * The fields a generation adds to the status.
 *
 * Named rather than written as literals because four modules read them: the driver opens
 * a generation, the gates ask whether one may be opened, the artifact records what was
 * supplied, and the report names what a generation invalidated.
 */
export const GENERATION_FIELD = 'generation';
export const HISTORY_FIELD = 'history';
export const SUPPLIED_FIELD = 'supplied';
export const INVALIDATED_FIELD = 'invalidated';
export const ENTERED_FIELD = 'entered';
export const ASSETS_FIELD = 'assets';
export const ASSET_DIGEST_FIELD = 'digest';

/**
 * Why an existing status can or cannot be resumed.
 *
 * A decision rather than a sentence: the rail states which of the three cases holds and
 * the caller chooses the wording, because a refusal a reader sees has to say what to do
 * next and that depends on who asked. `edited-specification` is deliberately not a
 * refusal here — it is the case the whole ticket exists for, and `begin` turns it into a
 * new generation.
 */
export const RESUME_KINDS = Object.freeze({
  SAME_REVISION: 'same-revision',
  EDITED_SPECIFICATION: 'edited-specification',
  ANOTHER_SPECIFICATION: 'another-specification',
});

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
 * Why an existing status cannot be resumed, as a kind and a reason.
 *
 * A specification changed by one byte has a different digest, and inheriting verdicts
 * taken against the previous revision would make every line citation in them mean
 * something else without saying so. That case is now `edited-specification` rather than a
 * wholesale refusal: the assets are inherited by citation instead of being destroyed,
 * and opening a generation over them is what repairs the citations. The same holds for
 * another specification that happens to share the directory — one directory holds one
 * specification's run — and that case remains a refusal, because no generation can make
 * one specification's declaration a reading of another's text.
 */
// [::TICKET::] PX-241, PX-242, PX-243, PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-241|PX-242|PX-243|PX-244) --for-spec --no-implementation-order`.
function whyNotResumed(existing, specPath, spec) {
  if (existing.spec?.path !== basename(specPath)) {
    return {
      kind: RESUME_KINDS.ANOTHER_SPECIFICATION,
      reason: `the run directory belongs to ${existing.spec?.path}; this specification is ${basename(specPath)}`,
    };
  }
  if (existing.spec?.sha256 !== spec.sha256) {
    return {
      kind: RESUME_KINDS.EDITED_SPECIFICATION,
      reason: `the recorded state is for spec sha256 ${existing.spec?.sha256} and this specification is ${spec.sha256}; run begin to open a new generation, which inherits every asset this state holds`,
    };
  }
  if (existing.spec?.lines !== spec.lineCount) {
    return {
      kind: RESUME_KINDS.EDITED_SPECIFICATION,
      reason: `the recorded state is for a specification of ${existing.spec?.lines} lines and this one has ${spec.lineCount}; run begin to open a new generation, which inherits every asset this state holds`,
    };
  }
  return { kind: RESUME_KINDS.SAME_REVISION, reason: null };
}

/**
 * The generation a status stands in, whatever it was called when it was written.
 *
 * A status written before generations existed carries phase records but no number, and
 * those records are a generation in substance: their loops are the ones an invocation
 * has to return. A directory that has opened nothing, by contrast, stands for no
 * generation at all, which is why the first `begin` over it returns generation 1.
 */
export function generationOf(status) {
  const recorded = status?.[GENERATION_FIELD];
  if (Number.isInteger(recorded) && recorded > 0) return recorded;
  return (status?.phases ?? []).length > 0 ? 1 : 0;
}

/**
 * Open a run, reusing the status of a previous run over the same revision.
 *
 * Reuse matters: a run that is driven without opening a generation must not lose the
 * loops it has already spent, or a phase that fails repeatedly would be retried for
 * ever. The loops are returned by `beginGeneration` and by nothing else, so a Step that
 * resumed its own run has not spent a generation.
 *
 * @returns {{directory: string, status: object, resumed: boolean, kind: string, refused?: string}}
 */
export function openRun({ specPath, spec, root = null }) {
  const directory = runDirectoryFor(specPath, root);
  const existing = readStatus(directory);
  if (existing !== null) {
    const decision = whyNotResumed(existing, specPath, spec);
    if (decision.kind === RESUME_KINDS.ANOTHER_SPECIFICATION) {
      return { directory, status: existing, resumed: false, kind: decision.kind, reason: decision.reason, refused: decision.reason };
    }
    return { directory, status: existing, resumed: true, kind: decision.kind, reason: decision.reason };
  }

  const status = {
    spec: { path: basename(specPath), sha256: spec.sha256, lines: spec.lineCount },
    [GENERATION_FIELD]: 0,
    [ENTERED_FIELD]: false,
    [HISTORY_FIELD]: [],
    [SUPPLIED_FIELD]: [],
    [INVALIDATED_FIELD]: [],
    [ASSETS_FIELD]: { [ASSET_DIGEST_FIELD]: null },
    phases: [],
    readings: {},
  };
  writeStatus(directory, status);
  return { directory, status, resumed: false, kind: 'new-run' };
}

/**
 * Append one superseded generation to the history.
 *
 * The previous generation's phases, their loops and whether it had been entered are kept
 * as they were: a history that recorded a summary would lose exactly the evidence a
 * reader needs to see why a phase refused, and the loops are what the halt guard reads.
 */
export function appendHistory(status, entry) {
  return { ...status, [HISTORY_FIELD]: [...(status[HISTORY_FIELD] ?? []), entry] };
}

/**
 * Open the next generation: return every loop, record the asset digest, and keep the
 * generation that is being superseded.
 *
 * The phase records are carried over with their status and their verdict and only their
 * loops reset. Resetting the verdicts as well would throw away the reason a phase
 * refused, which is the one thing a reader needs to repair it; and the status is carried
 * because a phase that never passed must still not satisfy the phases that require it.
 */
// [::TICKET::] PX-242 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-242 --for-spec --no-implementation-order`.
// [::TICKET::] PX-245 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-245 --for-spec --no-implementation-order`.
export function beginGeneration(status, { spec, digest, inquest = null, coverage = null }) {
  const superseded = generationOf(status);
  const carried = {
    ...status,
    spec,
    [GENERATION_FIELD]: superseded + 1,
    [ENTERED_FIELD]: false,
    [ASSETS_FIELD]: { ...(status[ASSETS_FIELD] ?? {}), [ASSET_DIGEST_FIELD]: digest },
    phases: (status.phases ?? []).map((record) => ({ ...record, loops: 0 })),
  };
  if (superseded === 0) return { ...carried, [HISTORY_FIELD]: [...(status[HISTORY_FIELD] ?? [])] };
  return appendHistory(carried, {
    generation: superseded,
    phases: status.phases ?? [],
    // The audit's counts travel with the generation that produced them, so the next
    // report can say whether the questions moved anything rather than only what this
    // generation asked. Counts rather than answers: the answers stay in the file beside
    // the specification, where a reader can open them.
    inquest,
    // The artifact's measurements travel with it for the same reason, and carry no
    // verdict: a row per generation is what lets a reader see the returns diminishing,
    // and nothing reads one of these to decide whether a generation may open.
    coverage,
    [ENTERED_FIELD]: status[ENTERED_FIELD] ?? false,
  });
}

/**
 * Re-open the phases a generation asks the reader to perform again.
 *
 * The records are written through `writePhase`, so it stays the only writer of
 * `phases[]`, and `entered` is deliberately not set: re-opening a phase is the
 * generation's own act, not evidence that a reader has done anything.
 */
// [::TICKET::] PX-242 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-242 --for-spec --no-implementation-order`.
export function reopenPhases(status, ids) {
  let next = status;
  for (const id of ids) {
    const current = phaseState(next, id);
    next = writePhase(next, { id, tag: current.tag ?? null, status: 'open', verdict: null, loops: 0 });
  }
  return next;
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
 *
 * Both writers also record that the generation has been entered. That is the fact which
 * separates a generation that was opened and left alone — nothing to do, so a second
 * `begin` reports a verification — from one a reader has worked in, which opens the next
 * generation. It is recorded rather than inferred: every derivable proxy either loses a
 * carried-over refusal's verdict or reads a half-finished generation as untouched.
 */
export function noteDone(status, id, { verdict, tag = null }) {
  const current = phaseState(status, id);
  return writePhase(markEntered(status), { id, tag: tag ?? current.tag ?? null, status: 'done', verdict, loops: current.loops });
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
  return writePhase(markEntered(status), { id, tag: tag ?? current.tag ?? null, status: 'refused', verdict, loops: current.loops + 1 });
}

/** Record that a reader has done something in this generation. */
// [::TICKET::] PX-242, PX-243, PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-242|PX-243|PX-244) --for-spec --no-implementation-order`.
function markEntered(status) {
  status[ENTERED_FIELD] = true;
  return status;
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
