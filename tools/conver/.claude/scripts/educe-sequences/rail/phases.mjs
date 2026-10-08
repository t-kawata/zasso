// The phase driver (PX-240).
//
// Without this module the command's phase table is a claim nothing evaluates: a phase
// would be "done" because its row had been read. Here each phase is entered through its
// `requires` list, performed by an action if the library can perform it, and left
// through its exit gate; a refusal spends one loop and names the edge to go back to.
//
// The driver also says, for every phase a reader performs, exactly what the reader must
// have produced by the time the phase is entered again. That is the only thing a machine
// can ask of a reading, and stating it is what turns "dispatch a brief" into an
// instruction someone can follow.
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { buildArtifact } from './artifact.mjs';
import { PHASES, PHASE_TAGS, entryGate, evaluateGate, phaseById } from './gates.mjs';
import { readArtifact } from './load.mjs';
import { artifactPathFor } from './paths.mjs';
import { establishPins } from './pins.mjs';
import { applyReadings, buildWorklist } from './reading.mjs';
import { DECLARATION_FILE, readDeclarationFile, readReadingsFile, signedCount } from './readings.mjs';
import { noteDone, noteLoop, noteReading, openRun, phaseState, writeStatus } from './run-state.mjs';

/** The working files a run directory holds. */
export const WORKLIST_FILE = 'worklist.txt';
export const PINS_FILE = 'pins.json';

/** The exit code that means "stop": the phase spent its loop limit and is not a retry. */
export const HALT_EXIT_CODE = 3;

/**
 * The exit code an outcome carries: 0 pass, 3 halt, 1 refusal.
 *
 * One function rather than a rule applied twice, because a Step that went back on a halt
 * would be the limit failing to bind, and the place that decides is the place a test can
 * reach.
 */
export function exitCodeFor(outcome) {
  if (outcome.ok) return 0;
  return outcome.halted === true ? HALT_EXIT_CODE : 1;
}

/**
 * What a reader must have produced before a `[read]` phase can be entered again.
 *
 * Four phases fill one declaration, each its own section, because a single reader asked
 * for all four at once answers three of them from the first and calls it reading.
 */
export const PHASE_EXPECTS = Object.freeze({
  2: `${DECLARATION_FILE} with predicate.limbs`,
  3: `${DECLARATION_FILE} with rowSchema.fields`,
  4: `${DECLARATION_FILE} with enumerations[].{name,members,closedness}`,
  5: `${DECLARATION_FILE} with sections[].{id,firstLine,lastLine}`,
  8: 'readings-span.jsonl, one signed line per entry, each carrying the steps and operations read there',
  10: 'readings-adversarial.jsonl, one signed attack per ruling, each naming the weakest link',
  11: 'readings-reroute.jsonl, one signed reroute per entry bound to a window',
  12: 'readings-adjudicate.jsonl, one signed ruling per entry with no outcome',
});

/** What the reader is asked to do, in the words the brief is rendered with. */
export const PHASE_GUIDANCE = Object.freeze({
  2: 'Find the sentence that says when a procedure counts, quote it verbatim, and record the line and its limbs.',
  3: 'Find the sentence that states the fields an entry carries, and record the line and the fields.',
  4: 'Find every closed vocabulary, its members, and the lines those members occupy.',
  5: 'Partition the specification into sections that cover every line exactly once.',
  8: 'For each worklist entry, read its span and answer whether the named operation is performed there.',
  10: 'Attack each ruling: name the one claim whose failure would take it down.',
  11: 'For each entry bound to a window, name the entry that should realize it instead, and the line that says so.',
  12: 'For each entry with no outcome, rule whether one named actor performs two or more ordered acts there.',
});

/** Merge readings by subject, so a later brief's verdict replaces the earlier one. */
// [::TICKET::] PX-240, PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241) --for-spec --no-implementation-order`.
function mergeBySubject(...groups) {
  const merged = new Map();
  for (const group of groups) for (const reading of group) merged.set(reading.subject, reading);
  return [...merged.values()];
}

/** Read a brief's readings, treating an absent file as no readings rather than as a failure. */
// [::TICKET::] PX-240, PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241) --for-spec --no-implementation-order`.
function optionalBrief(directory, briefName) {
  const result = readReadingsFile(join(directory, `readings-${briefName}.jsonl`));
  return result.ok ? result.readings : [];
}

/** The brief each `[read]` phase collects, so the count recorded is the count that arrived. */
const BRIEF_OF_PHASE = Object.freeze({ 2: null, 3: null, 4: null, 5: null, 8: 'span', 10: 'adversarial', 11: 'reroute', 12: 'adjudicate' });

/**
 * How many signed claims a `[read]` phase produced.
 *
 * The four declaration phases each read one section, so each counts one; the four brief
 * phases count the signed lines that arrived. A phase that passes while reporting zero
 * is the case the report calls incomplete, which is why the count is taken here rather
 * than assumed from the gate having passed.
 */
// [::TICKET::] PX-240, PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241) --for-spec --no-implementation-order`.
function claimedBy(directory, id) {
  const brief = BRIEF_OF_PHASE[id];
  if (brief === undefined) return 0;
  if (brief === null) return existsSync(join(directory, DECLARATION_FILE)) ? 1 : 0;
  return signedCount(optionalBrief(directory, brief));
}

/**
 * The actions the library performs.
 *
 * A `[read]` phase has no action: the library cannot read, and giving it one would be
 * the substitution the whole design refuses.
 */
const ACTIONS = Object.freeze({
  6: (ctx) => {
    const declaration = readDeclarationFile(join(ctx.directory, DECLARATION_FILE));
    if (!declaration.ok) return declaration;
    writeFileSync(join(ctx.directory, PINS_FILE), `${JSON.stringify(establishPins(ctx.spec.lines, declaration.declaration), null, 2)}\n`);
    return { ok: true };
  },
  7: (ctx) => {
    const declaration = readDeclarationFile(join(ctx.directory, DECLARATION_FILE));
    if (!declaration.ok) return declaration;
    const worklist = buildWorklist({ artifact: { sequences: declaration.declaration.entries }, select: () => true });
    writeFileSync(join(ctx.directory, WORKLIST_FILE), `${worklist.join('\n')}\n`);
    return { ok: true };
  },
  9: (ctx) => {
    const declaration = readDeclarationFile(join(ctx.directory, DECLARATION_FILE));
    if (!declaration.ok) return declaration;
    const span = optionalBrief(ctx.directory, 'span');
    const reroute = optionalBrief(ctx.directory, 'reroute');
    const adjudicate = optionalBrief(ctx.directory, 'adjudicate');
    const sequences = mergeBySubject(span, reroute);
    const artifact = buildArtifact({
      specPath: ctx.specPath,
      spec: ctx.spec,
      declaration: declaration.declaration,
      readings: {
        sequences,
        steps: span.flatMap((reading) => reading.steps ?? []),
        operations: span.flatMap((reading) => reading.operations ?? []),
        adjudications: adjudicate,
      },
    });
    return applyReadings({ artifactPath: ctx.artifactPath, readings: sequences, artifact, specLines: ctx.spec.lines });
  },
});

/**
 * Assemble everything a gate may need, so a gate never reaches for a global.
 *
 * The falsification gate digests the tree it reads, and the tree a run reads is the one
 * holding the specification, so that is the default rather than a parameter a caller can
 * forget: a falsification whose restoration is not measured is not falsification.
 */
export function buildContext({ specPath, spec, run, railExits = [], fixtureRoot = dirname(specPath) }) {
  return {
    specPath,
    spec,
    directory: run.directory,
    status: run.status,
    artifactPath: artifactPathFor(specPath),
    railExits,
    fixtureRoot,
  };
}

/**
 * Run one phase: entry gate, action, exit gate.
 *
 * @returns {{id: number, tag: string, ok: boolean, reason: string, backTo: number|null,
 *            expects: string|null, exitCode: number, loops: number}}
 */
export function runPhase(id, ctx) {
  const phase = phaseById(id);
  if (phase === null) return { id, tag: null, ok: false, halted: false, reason: `there is no phase ${id}`, backTo: null, expects: null, exitCode: 1, loops: 0 };

  // A halt names no back-edge and asks the reader for nothing: the phase is not to be
  // repeated, so the two fields that tell a caller how to repeat it would be a
  // contradiction. Its exit code is its own so a shell-driven Step can tell "go back"
  // from "stop" without reading the prose.
  const verdictOf = (result, backTo) => {
    const halted = result.halted === true;
    return {
      id,
      tag: phase.tag,
      ok: result.ok,
      halted,
      reason: result.reason,
      backTo: result.ok || halted ? null : (backTo ?? phase.backTo),
      expects: result.ok || halted ? null : (PHASE_EXPECTS[id] ?? null),
      exitCode: exitCodeFor({ ok: result.ok, halted }),
      loops: phaseState(ctx.status, id).loops,
    };
  };

  const entry = entryGate(phase, ctx.status);
  if (!entry.ok) return verdictOf(entry);

  const action = ACTIONS[id];
  if (action !== undefined) {
    const performed = action(ctx);
    if (performed?.ok === false) {
      noteLoop(ctx.status, id, phase.tag, performed.problems?.join('; ') ?? 'the action refused');
      writeStatus(ctx.directory, ctx.status);
      return verdictOf({ ok: false, reason: performed.problems?.join('; ') ?? 'the action refused' });
    }
  }

  const exit = evaluateGate(id, ctx);
  if (exit.ok) {
    noteDone(ctx.status, id, { verdict: exit.reason, tag: phase.tag });
    if (phase.tag === PHASE_TAGS.READ) {
      noteReading(ctx.status, phase.name, { claims: claimedBy(ctx.directory, id), vacuous: exit.vacuous === true });
    }
  } else {
    noteLoop(ctx.status, id, phase.tag, exit.reason);
  }
  writeStatus(ctx.directory, ctx.status);
  return verdictOf(exit);
}

/**
 * Run from the first unfinished phase to the last, stopping at the first refusal.
 *
 * Stopping rather than continuing is the point: every later gate reads what an earlier
 * phase wrote, so a run that continued past a refusal would be checking an artifact
 * assembled from whatever happened to be on disk.
 */
export function runThrough(ctx, lastId = PHASES.length) {
  const results = [];
  for (const phase of PHASES.filter((candidate) => candidate.id <= lastId)) {
    const result = runPhase(phase.id, ctx);
    results.push(result);
    if (!result.ok) return { ok: false, stoppedAt: phase.id, halted: result.halted, results };
  }
  return { ok: true, stoppedAt: null, halted: false, results };
}

/**
 * Open a run and build its context in one call, so a caller cannot forget the state.
 *
 * A state that cannot be resumed is returned with its reason rather than thrown: the
 * caller decides whether to stop the run, and every caller stops it, because a run
 * that continued would be recording verdicts against a revision its state is not for.
 */
export function startRun({ specPath, spec, root = null }) {
  const opened = openRun({ specPath, spec, root });
  return {
    directory: opened.directory,
    status: opened.status,
    resumed: opened.resumed,
    ...(opened.refused === undefined ? {} : { refused: opened.refused }),
    context: buildContext({ specPath, spec, run: { directory: opened.directory, status: opened.status } }),
  };
}

/** The phase a run should do next: the first that is not done. */
export function nextPhase(status) {
  const pending = PHASES.find((phase) => phaseState(status, phase.id).status !== 'done');
  return pending?.id ?? null;
}

/** Whether the artifact a run is working on has been written. */
export function artifactWasWritten(ctx) {
  return existsSync(ctx.artifactPath) && readArtifact(ctx.artifactPath) !== null;
}

export { PHASES, PHASE_TAGS };
