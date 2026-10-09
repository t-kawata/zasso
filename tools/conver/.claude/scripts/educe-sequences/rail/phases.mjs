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
import { coverageOf } from './coverage.mjs';
import { PHASES, PHASE_TAGS, entryGate, evaluateGate, phaseById, unchangedRepeatReason } from './gates.mjs';
import { escapedOperationsOf } from './engine.mjs';
import { assetDigestOf, survivingAssets } from './inherit.mjs';
import { readArtifact, readJsonOrNull } from './load.mjs';
import { artifactPathFor } from './paths.mjs';
import { establishPins } from './pins.mjs';
import { applyReadings, buildWorklist, vanishedRefusal, vanishedSubjects } from './reading.mjs';
import {
  DECLARATION_FILE,
  INQUEST_FILE,
  PINS_FILE,
  UNCOVERED_WORKLIST_FILE,
  WORKLIST_FILE,
  inquestBeside,
  inquestCounts,
  inquestRecordsIn,
  inquestSubjects,
  archiveReadings,
  readDeclarationFile,
  readReadingsFile,
  readingsFileName,
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
import { digestOfSupplied, fileSuppliedMaterial, suppliedDocumentsOf } from './supplied.mjs';

/** The working files a run directory holds, named where the gates can reach them too. */
export { PINS_FILE, UNCOVERED_WORKLIST_FILE, WORKLIST_FILE };

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
// [::TICKET::] PX-247 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-247 --for-spec --no-implementation-order`.
export const PHASE_EXPECTS = Object.freeze({
  2: `${DECLARATION_FILE} with predicate.limbs`,
  3: `${DECLARATION_FILE} with rowSchema.fields`,
  4: `${DECLARATION_FILE} with enumerations[].{name,members,closedness}`,
  5: `${DECLARATION_FILE} with sections[].{id,firstLine,lastLine} and entries[] whose spans cover every line`,
  8: 'readings-span.jsonl, one signed line per entry carrying the steps and operations read there, and readings-uncovered.jsonl accounting for every operation the borrowed census names',
  10: 'readings-adversarial.jsonl, one signed attack per ruling, each naming the weakest link',
  11: 'readings-reroute.jsonl, one signed reroute per entry bound to a window',
  12: 'readings-adjudicate.jsonl, one signed ruling per entry with no outcome',
  13: `${INQUEST_FILE}, one signed answer per (subject, lens) pair, each naming a line and quoting it`,
});

/** What the reader is asked to do, in the words the brief is rendered with. */
// [::TICKET::] PX-247 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-247 --for-spec --no-implementation-order`.
export const PHASE_GUIDANCE = Object.freeze({
  2: 'Find the sentence that says when a procedure counts, quote it verbatim, and record the line and its limbs.',
  3: 'Find the sentence that states the fields an entry carries, and record the line and the fields.',
  4: 'Find every closed vocabulary, its members, and the lines those members occupy. When the invocation supplied material carrying a census, also record `sourceEnumerations[]` naming the file, the shape, the parameter and the role it answers for.',
  5: 'Partition the specification into sections that cover every line exactly once, and name an entry for every line, so no line is left to nobody.',
  8: 'For each worklist entry, read its span and answer whether the named operation is performed there; for each operation the census names and no step performs, either place it or name the escape that covers it. A record read here also carries the columns the declaration lists, and a column the declaration requires measured carries its evidence.',
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
// Phase 8 carries two briefs: the entries to read and the borrowed census members to
// account for. They are the same act on two subjects — a span of the document and a name
// the document must perform — so they are one phase with two questions rather than a
// nineteenth phase, which would make the phase count a moving number.
// [::TICKET::] PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-248 --for-spec --no-implementation-order`.
const BRIEFS_OF_PHASE = Object.freeze({ 8: ['span', 'uncovered'], 10: ['adversarial'], 11: ['reroute'], 12: ['adjudicate'], 13: ['inquest'] });

/**
 * How many signed claims a `[read]` phase produced.
 *
 * The four declaration phases each read one section, so each counts one; the five brief
 * phases count the signed lines that arrived. A phase that passes while reporting zero
 * is the case the report calls incomplete, which is why the count is taken here rather
 * than assumed from the gate having passed.
 */
// [::TICKET::] PX-240, PX-241, PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241|PX-248) --for-spec --no-implementation-order`.
function claimedBy(directory, id) {
  const briefs = BRIEFS_OF_PHASE[id];
  // A phase with no brief is one of the four that fill the declaration, and each of them
  // counted one claim before this phase table carried arrays: the declaration existing is
  // what those phases produced.
  if (briefs === undefined) return existsSync(join(directory, DECLARATION_FILE)) ? 1 : 0;
  return briefs.reduce((total, brief) => total + claimedInBrief(directory, brief), 0);
}

/** How many signed claims one brief produced. */
// [::TICKET::] PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-248 --for-spec --no-implementation-order`.
function claimedInBrief(directory, brief) {
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
    writeFileSync(join(ctx.directory, PINS_FILE), `${JSON.stringify(establishPins(ctx.spec.lines, declaration.declaration, suppliedDocumentsOf(ctx.directory)), null, 2)}\n`);
    return { ok: true };
  },
  7: (ctx) => {
    const declaration = readDeclarationFile(join(ctx.directory, DECLARATION_FILE));
    if (!declaration.ok) return declaration;
    const worklist = buildWorklist({ artifact: { sequences: declaration.declaration.entries }, select: () => true });
    writeFileSync(join(ctx.directory, WORKLIST_FILE), `${worklist.join('\n')}\n`);
    // The second worklist: the operations a borrowed census names, which the reader is
    // asked to account for one at a time. It is written here rather than after the artifact
    // is assembled because it is what the reading phase is dispatched with — a list handed
    // out after the reading would be a report, not an instruction.
    const pins = establishPins(ctx.spec.lines, declaration.declaration, suppliedDocumentsOf(ctx.directory));
    const uncovered = pins.sourceEnumerations
      .filter((borrowed) => borrowed.role === 'operations')
      .flatMap((borrowed) => borrowed.members.map((member) => `${member} account-for`));
    writeFileSync(join(ctx.directory, UNCOVERED_WORKLIST_FILE), uncovered.length === 0 ? '' : `${uncovered.join('\n')}\n`);
    return { ok: true };
  },
// [::TICKET::] PX-253 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-253 --for-spec --no-implementation-order`.
// [::TICKET::] PX-254 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-254 --for-spec --no-implementation-order`.
  9: (ctx) => {
    const declaration = readDeclarationFile(join(ctx.directory, DECLARATION_FILE));
    if (!declaration.ok) return declaration;
    // The artifact this generation replaces, read before it is overwritten. It is the only
    // point in the run where both artifacts exist: the gate reads the file from disk after
    // this action has written it, so a comparison made there would compare an artifact with
    // itself and could never see a name leave.
    const previous = readArtifact(ctx.artifactPath);
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
      suppliedDocuments: suppliedDocumentsOf(ctx.directory),
    });
    // A merge is an improvement and is permitted; a merge that loses a name is not, so the
    // names are compared before anything is written. Refusing here rather than at the gate
    // is what leaves the artifact byte-identical, which is the state a reader repairs from.
    const vanished = vanishedSubjects({ previous, next: artifact });
    if (vanished.length > 0) {
      return { ok: false, problems: vanished.map(vanishedRefusal) };
    }
    // `applyReadings` answers in its own shape, and ignoring that answer would carry a
    // refused write to the gate as work that was never attempted — naming nothing the
    // reader can repair. The fields it refused are spelled out instead, because the
    // reader's next action is to repair one of them.
    const applied = applyReadings({ artifactPath: ctx.artifactPath, readings: sequences, artifact, specLines: ctx.spec.lines });
    if (applied.refused !== undefined) {
      return { ok: false, problems: applied.refused.map((refusal) => `${refusal.subject} ${refusal.field}: ${refusal.why}`) };
    }
    return applied;
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
      // Read here for the same reason the audit is: a caller that spread this value and
      // forgot the material would re-derive a borrowed census against no file at all and
      // refuse a run whose material is sitting beside it.
      supplied: recorded.supplied ?? suppliedDocumentsOf(run.directory),
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
export function inquestCountsIn(directory, specPath) {
  const declaration = readDeclarationFile(join(directory, DECLARATION_FILE));
  if (!declaration.ok) return { asked: 0, answered: 0, exempt: 0 };
  return inquestCounts({
    subjects: inquestSubjects({
      sections: declaration.declaration.sections,
      entries: declaration.declaration.entries,
      // Read from the artifact, because whether an operation escaped is what the artifact
      // decided; a count taken from the declaration alone would disagree with the gate.
      escaped: escapedOperationsOf(readArtifact(artifactPathFor(specPath)) ?? { operations: [] }),
    }),
    records: inquestRecordsIn(directory),
    exemptions: declaration.declaration.exemptions,
  });
}

/** The readings a run holds, by brief name, treating an absent file as no readings. */
// [::TICKET::] PX-242, PX-243, PX-244, PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-242|PX-243|PX-244|PX-248) --for-spec --no-implementation-order`.
function readingsByBrief(directory) {
  const briefs = PHASES
    .filter((phase) => phase.tag === PHASE_TAGS.READ)
    .flatMap((phase) => BRIEFS_OF_PHASE[phase.id] ?? []);
  return Object.fromEntries(briefs.map((brief) => [brief, optionalBrief(directory, brief)]));
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
// [::TICKET::] PX-245 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-245 --for-spec --no-implementation-order`.
export function beginRun({ specPath, spec, material = '', namedPaths = [], root = null }) {
  const opened = openRun({ specPath, spec, root });
  if (opened.kind === RESUME_KINDS.ANOTHER_SPECIFICATION) {
    return { ok: false, refused: opened.reason, directory: opened.directory, generation: null, status: opened.status, notice: null, coverage: null };
  }

  const status = opened.status;
  const assetDigest = assetDigestOf(opened.directory);
  // A repeat over an unchanged set is reported rather than refused. Re-asking the reader
  // is how a generation finds what the last one missed, so refusing it would refuse the
  // mechanism; and the only ways to clear the old refusal were a human editing the
  // inviolable specification or a human supplying material, which is an automatic run
  // stopped until someone acts.
  const notice = unchangedRepeatReason(status, { assetDigest, specSha256: spec.sha256 });
  // Measured before the generation opens, so the number recorded in history is the one
  // the superseded generation actually produced.
  const supersededArtifact = readJsonOrNull(artifactPathFor(specPath));
  const coverage = supersededArtifact === null ? null : coverageOf(supersededArtifact);

  const filed = fileSuppliedMaterial({ directory: opened.directory, material, namedPaths });
  if (!filed.ok) {
    return { ok: false, refused: filed.problems.join('; '), directory: opened.directory, generation: null, status, notice, coverage };
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
      notice,
      coverage: null,
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

  // What the superseded generation's audit asked and answered, read while the declaration
  // and the inquest file are still in the run directory: both are read from, and both are
  // moved by the archive below.
  const asked = inquestCountsIn(opened.directory, specPath);

  // Every `[read]` phase is asked again, and the files it is asked for are moved aside
  // first. The gate a `[read]` phase has can see only that the file it is told to read
  // exists and is signed, so a reading left in place is a reading that passes without a
  // reader ever being called - which is how a fifth generation over an unchanged
  // specification read nothing and reported a pass. The move is a rename into
  // `archive/`, named for the generation that wrote the file, so nothing is deleted and
  // the previous answers remain where a re-read can be made against them. It happens
  // after every read of these files above, and before the digest below.
  const readPhases = PHASES.filter((phase) => phase.tag === PHASE_TAGS.READ);
  const archived = archiveReadings({
    directory: opened.directory,
    generation,
    files: [
      DECLARATION_FILE,
      ...readPhases.flatMap((phase) => (BRIEFS_OF_PHASE[phase.id] ?? []).map(readingsFileName)),
    ],
  });
  // The digest the generation inherits, measured after the move, so the record describes
  // the set this generation holds and not the set the run found.
  const inheritedDigest = assetDigestOf(opened.directory);

  const carried = reopenPhases(
    beginGeneration(status, {
      spec: { path: basename(specPath), sha256: spec.sha256, lines: spec.lineCount },
      digest: inheritedDigest,
      // The generation being superseded records what its audit asked and answered, so the
      // next report can print the two beside each other and a reader can see whether the
      // questions moved anything.
      inquest: asked,
      coverage,
    }),
    readPhases.map((phase) => phase.id),
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
    assets: { digest: inheritedDigest },
    archived,
    invalidated: surviving.invalidated,
    notice,
    coverage,
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
