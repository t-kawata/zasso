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
import { basename, dirname, join } from 'node:path';

import { buildArtifact } from './artifact.mjs';
import { PHASES, PHASE_TAGS, entryGate, evaluateGate, phaseById, whyNotNewGeneration } from './gates.mjs';
import { assetDigestOf, survivingAssets } from './inherit.mjs';
import { readArtifact } from './load.mjs';
import { artifactPathFor } from './paths.mjs';
import { establishPins } from './pins.mjs';
import { applyReadings, buildWorklist } from './reading.mjs';
import {
  DECLARATION_FILE,
  INQUEST_FILE,
  PINS_FILE,
  WORKLIST_FILE,
  inquestBeside,
  inquestCounts,
  inquestRecordsIn,
  inquestSubjects,
  readDeclarationFile,
  readReadingsFile,
  signedCount,
} from './readings.mjs';
import {
  ASSETS_FIELD,
  ASSET_DIGEST_FIELD,
  GENERATION_FIELD,
  INVALIDATED_FIELD,
  RESUME_KINDS,
  SUPPLIED_FIELD,
  beginGeneration,
  generationOf,
  noteDone,
  noteLoop,
  noteReading,
  openRun,
  phaseState,
  reopenPhases,
  writeStatus,
} from './run-state.mjs';
import { digestOfSupplied, fileSuppliedMaterial } from './supplied.mjs';

/** The working files a run directory holds, named where the gates can reach them too. */
export { PINS_FILE, WORKLIST_FILE };

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
  13: `${INQUEST_FILE}, one signed answer per (subject, lens) pair, each naming a line and quoting it`,
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
  13: 'For each declared subject and each lens, ask the question, answer it in the closed vocabulary, and quote the line the answer rests on.',
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
const BRIEF_OF_PHASE = Object.freeze({ 2: null, 3: null, 4: null, 5: null, 8: 'span', 10: 'adversarial', 11: 'reroute', 12: 'adjudicate', 13: 'inquest' });

/**
 * How many signed claims a `[read]` phase produced.
 *
 * The four declaration phases each read one section, so each counts one; the five brief
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
      supplied: digestOfSupplied(ctx.status[SUPPLIED_FIELD] ?? []),
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
// [::TICKET::] PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-244 --for-spec --no-implementation-order`.
export function buildContext({ specPath, spec, run, recorded = {}, fixtureRoot = dirname(specPath) }) {
  return {
    specPath,
    spec,
    directory: run.directory,
    status: run.status,
    artifactPath: artifactPathFor(specPath),
    // What the run recorded beside the artifact, under the name `checkAll` reads it by.
    // The scaffolded checks are carried as loaded values, so no gate reaches for a
    // directory to load them itself: a gate that loaded its own registry could judge a
    // different set from the one the block was built from.
    recorded: {
      railExits: recorded.railExits ?? [],
      // Read here rather than at each call site: a caller that spread this value and
      // forgot the audit would build a block that judged no audit, and the run would
      // report a green block over a question it never asked.
      inquest: recorded.inquest ?? inquestBeside(run.directory),
      adhocChecks: recorded.adhocChecks ?? [],
      adhocProblems: recorded.adhocProblems ?? [],
    },
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
      writeStatus(ctx.directory, observeAssets(ctx.status, ctx.directory));
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
  writeStatus(ctx.directory, observeAssets(ctx.status, ctx.directory));
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
 * A state whose specification has moved is returned with its reason rather than thrown,
 * and this opener refuses it: the phases judge citations taken against one revision, so a
 * Step that is not `begin` has no way to re-anchor them. `beginRun` is the opener that
 * does, by inheriting the assets by citation and re-deriving what no longer resolves.
 */
export function startRun({ specPath, spec, root = null }) {
  const opened = openRun({ specPath, spec, root });
  const refusal = opened.kind === RESUME_KINDS.SAME_REVISION ? null : opened.reason;
  // No context is returned: a context carries the loaded ad-hoc checks, and this opener
  // cannot load them, so the value it could build here is one that is right only until
  // someone uses it. Every caller builds its own with `buildContext`.
  return {
    directory: opened.directory,
    status: opened.status,
    resumed: refusal === null && opened.resumed,
    kind: opened.kind,
    ...(refusal === null ? {} : { refused: refusal }),
  };
}

/** How many pairs a run's declaration puts and how many its audit answered. */
// [::TICKET::] PX-243 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-243 --for-spec --no-implementation-order`.
export function inquestCountsIn(directory) {
  const declaration = readDeclarationFile(join(directory, DECLARATION_FILE));
  if (!declaration.ok) return { asked: 0, answered: 0, exempt: 0 };
  return inquestCounts({
    subjects: inquestSubjects({ sections: declaration.declaration.sections, entries: declaration.declaration.entries }),
    records: inquestRecordsIn(directory),
    exemptions: declaration.declaration.exemptions,
  });
}

/** The readings a run holds, by brief name, treating an absent file as no readings. */
// [::TICKET::] PX-242, PX-243, PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-242|PX-243|PX-244) --for-spec --no-implementation-order`.
function readingsByBrief(directory) {
  return Object.fromEntries(PHASES
    .filter((phase) => phase.tag === PHASE_TAGS.READ && BRIEF_OF_PHASE[phase.id] !== null)
    .map((phase) => [BRIEF_OF_PHASE[phase.id], optionalBrief(directory, BRIEF_OF_PHASE[phase.id])]));
}

/**
 * Record the inherited assets as the run last saw them.
 *
 * The digest is the fact that says whether a later invocation is asking a new question,
 * so it has to be as current as the record it is stored beside: a status that carried the
 * digest of some earlier moment would report a change that had already been absorbed, and
 * the guard against an unattended loop reads it to decide whether anything moved.
 */
// [::TICKET::] PX-242, PX-243, PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-242|PX-243|PX-244) --for-spec --no-implementation-order`.
function observeAssets(status, directory) {
  status[ASSETS_FIELD] = { ...(status[ASSETS_FIELD] ?? {}), [ASSET_DIGEST_FIELD]: assetDigestOf(directory) };
  return status;
}

/**
 * Open a generation: return the loop budget, re-open the phases a reader performs, and
 * record what the invocation was given and what it inherited.
 *
 * The three outcomes are decided in the order that keeps every refusal free of writes.
 * A refusal first, because the guard reads facts that filing material cannot change and
 * a refusal that had already written a supplied file would be a partial act; then the
 * material, because a named path that does not exist is refused before anything lands;
 * then the verification, which writes nothing at all; and only then a new generation.
 *
 * The classification of inherited assets runs here rather than inside the phases because
 * it is the answer to "what must the reader produce again", and `begin` is where the
 * reader asks the question.
 *
 * @returns {{ok: true, mode: 'new-generation'|'verification', generation: number,
 *            directory: string, status: object, supplied: Array<object>,
 *            assets: {digest: string}, invalidated: Array<object>}
 *          | {ok: false, refused: string, directory: string, generation: null, status: object}}
 */
export function beginRun({ specPath, spec, material = '', namedPaths = [], root = null }) {
  const opened = openRun({ specPath, spec, root });
  if (opened.kind === RESUME_KINDS.ANOTHER_SPECIFICATION) {
    return { ok: false, refused: opened.reason, directory: opened.directory, generation: null, status: opened.status };
  }

  const status = opened.status;
  const assetDigest = assetDigestOf(opened.directory);
  const held = whyNotNewGeneration(status, { assetDigest, specSha256: spec.sha256 });
  if (held !== null) {
    return { ok: false, refused: held, directory: opened.directory, generation: null, status };
  }

  const filed = fileSuppliedMaterial({ directory: opened.directory, material, namedPaths });
  if (!filed.ok) {
    return { ok: false, refused: filed.problems.join('; '), directory: opened.directory, generation: null, status };
  }

  const generation = generationOf(status);
  const unchanged = generation > 0
    && status.assets?.digest === assetDigest
    && status.spec?.sha256 === spec.sha256
    && digestOfSupplied(status[SUPPLIED_FIELD] ?? []) === digestOfSupplied(filed.files)
    && status.entered !== true;
  if (unchanged) {
    return {
      ok: true,
      mode: 'verification',
      generation,
      directory: opened.directory,
      status,
      supplied: filed.files,
      assets: { digest: assetDigest },
      invalidated: [],
    };
  }

  // Invalidation answers what an edit broke, so it is computed only when the text moved:
  // classifying an unchanged document would report every claim that cites no line as
  // destroyed by an edit that never happened, which reads to a reader as lost work. An
  // unreadable declaration has no assets to classify either; the `[read]` phase that reads
  // it is re-opened below, and its gate is what names the repair.
  const edited = status.spec?.sha256 !== spec.sha256 || status.spec?.lines !== spec.lineCount;
  const declaration = readDeclarationFile(join(opened.directory, DECLARATION_FILE));
  const surviving = edited && declaration.ok
    ? survivingAssets({ declaration: declaration.declaration, readings: readingsByBrief(opened.directory), specLines: spec.lines })
    : { invalidated: [] };

  const carried = reopenPhases(
    beginGeneration(status, {
      spec: { path: basename(specPath), sha256: spec.sha256, lines: spec.lineCount },
      digest: assetDigest,
      // The generation being superseded records what its audit asked and answered, so the
      // next report can print the two beside each other and a reader can see whether the
      // questions moved anything.
      inquest: inquestCountsIn(opened.directory),
    }),
    PHASES.filter((phase) => phase.tag === PHASE_TAGS.READ).map((phase) => phase.id),
  );
  const next = { ...carried, [SUPPLIED_FIELD]: filed.files, [INVALIDATED_FIELD]: surviving.invalidated };
  writeStatus(opened.directory, next);

  return {
    ok: true,
    mode: 'new-generation',
    generation: next[GENERATION_FIELD],
    directory: opened.directory,
    status: next,
    supplied: filed.files,
    assets: { digest: assetDigest },
    invalidated: surviving.invalidated,
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
