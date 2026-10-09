// One gate per phase (PX-240, the phase driver).
//
// A phase is not "done" because its text was read; it is done when a command says so.
// Each gate below answers a question with code and returns a verdict, an exit code and
// a back-edge, so the command file's table is a summary of this module rather than a
// claim nothing evaluates.
//
// Three tags divide the phases, and the division is the determinism boundary:
//   det    — the library performs it; the gate is a proof
//   read   — a reader performs it; the gate checks the shape and the signature of what
//            came back, and can never check that the reading happened
//   ad-hoc — new code is written; the gate checks the record that must accompany it
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { uncoveredRanges } from './coverage.mjs';
import { CHECKS, checkAll, describeRefusal } from './engine.mjs';
import { COUNTER_MUTATION_CORPUS, EXECUTION_FIELDS, SPEC_MUTATION_CORPUS, runCase } from './harness.mjs';
import { deriveSet, readArtifact } from './load.mjs';
import { blocksFromHeadings, establishPins, findLineContainingAll, rederiveAll, sectionLevelOf } from './pins.mjs';
import { ADJUDICATION_OUTCOMES } from './reading.mjs';
import {
  DECLARATION_FILE,
  INQUEST_FILE,
  WORKLIST_FILE,
  inquestPairs,
  inquestSubjects,
  isExempt,
  readDeclarationFile,
  readInquestFile,
  readReadingsFile,
  signedCount,
} from './readings.mjs';
import { generationOf } from './run-state.mjs';

/** The three tags. Their meanings are stated above and used by the command's table. */
export const PHASE_TAGS = Object.freeze({ DET: 'det', READ: 'read', ADHOC: 'ad-hoc' });

/**
 * A refusal, in the one shape every gate returns.
 *
 * `halted` marks the one refusal that is not a retry: the phase has spent its loop limit,
 * which no further entry repairs. The command's loop reads the flag to choose between
 * repeating a Step and stopping the run, so the choice is a named field rather than a
 * reading of the refusal's prose.
 */
// [::TICKET::] PX-240, PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241) --for-spec --no-implementation-order`.
function refuse(reason, extra = {}) {
  return { ok: false, reason, ...extra };
}

/**
 * A proof that the phase is complete.
 *
 * `vacuous` says the phase had nothing to do — an adversarial pass with no ruling to
 * attack, a reroute with no window-bound entry. It is recorded rather than folded into
 * "zero claims", because a phase that legitimately found nothing and a phase whose
 * reader never reported must not print the same, and only one of them is incompleteness.
 */
// [::TICKET::] PX-240, PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241) --for-spec --no-implementation-order`.
function prove(reason, extra = {}) {
  return { ok: true, reason, ...extra };
}

/** The readings a brief reported, or a refusal naming the file. */
// [::TICKET::] PX-240, PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241) --for-spec --no-implementation-order`.
function readBrief(directory, briefName) {
  return readReadingsFile(join(directory, `readings-${briefName}.jsonl`));
}

/** The declaration a run read, or a refusal naming the file. */
// [::TICKET::] PX-240, PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241) --for-spec --no-implementation-order`.
function readDeclaration(directory) {
  return readDeclarationFile(join(directory, DECLARATION_FILE));
}

/**
 * The sequences that are entries rather than neighbour candidates.
 *
 * A neighbour is a place an entry's act may be found, not something to adjudicate, so
 * the two gates that require a verdict read only the entries. Counting a neighbour as an
 * unadjudicated entry would make every run refuse on work that does not exist.
 */
// [::TICKET::] PX-240, PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241) --for-spec --no-implementation-order`.
function entriesOf(artifact) {
  return artifact.sequences.filter((entry) => entry.kind === 'entry');
}

/**
 * Every check id this run can answer for: the declared ones, plus the scaffolded ones.
 *
 * A weakest link may be tightened by a check written during this run, which is the
 * whole purpose of the ad-hoc surface, so the registry the gate reads is the union of
 * the declared checks and the modules the run has scaffolded.
 */
// [::TICKET::] PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-241 --for-spec --no-implementation-order`.
// [::TICKET::] PX-244, PX-243 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-244|PX-243) --for-spec --no-implementation-order`.
function declaredCheckIds(ctx) {
  return new Set([...CHECKS.map((check) => check.id), ...ctx.recorded.adhocChecks.map((check) => check.id)]);
}

/** The entries whose outcome is missing or outside the declared vocabulary. */
// [::TICKET::] PX-240, PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241) --for-spec --no-implementation-order`.
function entriesWithoutOutcome(artifact) {
  return entriesOf(artifact).filter((entry) => entry.outcome === null || !ADJUDICATION_OUTCOMES.includes(entry.outcome));
}

/**
 * The seventeen phases.
 *
 * `requires` is the entry gate: the phases whose verdict must already be `done`. It is
 * data rather than prose so the driver can refuse a phase that was entered out of order.
 */
// [::TICKET::] PX-243 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-243 --for-spec --no-implementation-order`.
// [::TICKET::] PX-247 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-247 --for-spec --no-implementation-order`.
export const PHASES = Object.freeze([
  {
    id: 1, name: 'identity', tag: PHASE_TAGS.DET, requires: [], backTo: null, maxLoops: 1,
    exit: (ctx) => (ctx.status.spec.sha256 === ctx.spec.sha256 && ctx.status.spec.lines === ctx.spec.lineCount
      ? prove(`the specification digest and line count are recorded: ${ctx.spec.lineCount} lines`)
      : refuse('the recorded specification identity does not match the file')),
  },
  {
    id: 2, name: 'predicate', tag: PHASE_TAGS.READ, requires: [1], backTo: 1, maxLoops: 3,
    exit: (ctx) => {
      const declaration = readDeclaration(ctx.directory);
      if (!declaration.ok) return refuse(declaration.problems.join('; '));
      const line = findLineContainingAll(ctx.spec.lines, declaration.declaration.predicate.limbs);
      return line === null
        ? refuse('no line carries every limb, so the predicate has not been read')
        : prove(`the predicate is stated on line ${line}`);
    },
  },
  {
    id: 3, name: 'row schema', tag: PHASE_TAGS.READ, requires: [2], backTo: 2, maxLoops: 3,
    exit: (ctx) => {
      const declaration = readDeclaration(ctx.directory);
      if (!declaration.ok) return refuse(declaration.problems.join('; '));
      const line = findLineContainingAll(ctx.spec.lines, declaration.declaration.rowSchema.fields);
      return line === null
        ? refuse('no line carries every field, so the row schema has not been read')
        : prove(`the row schema is stated on line ${line}`);
    },
  },
  {
    id: 4, name: 'enumerations', tag: PHASE_TAGS.READ, requires: [3], backTo: 3, maxLoops: 3,
    exit: (ctx) => {
      const declaration = readDeclaration(ctx.directory);
      if (!declaration.ok) return refuse(declaration.problems.join('; '));
      const pins = establishPins(ctx.spec.lines, declaration.declaration);
      const bare = pins.enumerations.filter((enumeration) => enumeration.ranges.length === 0);
      return bare.length > 0
        ? refuse(`${bare.map((enumeration) => enumeration.name).join(', ')} occur nowhere in the specification`)
        : prove(`${pins.enumerations.length} enumeration(s) carry ranges`);
    },
  },
  {
    id: 5, name: 'blocks', tag: PHASE_TAGS.READ, requires: [1], backTo: 1, maxLoops: 3,
// [::TICKET::] PX-246 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-246 --for-spec --no-implementation-order`.
    exit: (ctx) => {
      const declared = readDeclaration(ctx.directory);
      if (!declared.ok) return refuse(declared.problems.join('; '));
      const blocks = blocksFromHeadings(ctx.spec.lines, sectionLevelOf(declared.declaration));
      if (blocks.length === 0) return refuse('the specification states no sections, so nothing can be partitioned');
      const last = blocks.at(-1);
      if (last.lastLine !== ctx.spec.lineCount) {
        return refuse(`the partition ends on line ${last.lastLine} and the specification has ${ctx.spec.lineCount} lines`);
      }
      // The partition says every line belongs to a section; it does not say anyone read
      // one, and an entry that starts inside a section satisfies the census however little
      // of the section it spans. The rule is stated over the document rather than over the
      // partition, because a preamble before the first heading lies outside the partition
      // and inside the document.
      const unread = uncoveredRanges({ spans: declared.declaration.entries, lineCount: ctx.spec.lineCount });
      return unread.length > 0
        ? refuse(`line ${unread[0].first} belongs to no entry, so nothing was read there`)
        : prove(`${blocks.length} section(s) partition the specification and its entries cover every line`);
    },
  },
  {
    id: 6, name: 'pins', tag: PHASE_TAGS.DET, requires: [2, 3, 4, 5], backTo: 5, maxLoops: 3,
    exit: (ctx) => {
      const declaration = readDeclaration(ctx.directory);
      if (!declaration.ok) return refuse(declaration.problems.join('; '));
      const result = rederiveAll(establishPins(ctx.spec.lines, declaration.declaration), ctx.spec.lines);
      return result.ok ? prove('every pin re-derives by the rule it was read by') : refuse(result.failures[0].reason);
    },
  },
  {
    id: 7, name: 'worklist', tag: PHASE_TAGS.DET, requires: [6], backTo: 6, maxLoops: 3,
    exit: (ctx) => {
      const path = join(ctx.directory, WORKLIST_FILE);
      if (!existsSync(path)) return refuse('no worklist was built');
      const lines = readFileSync(path, 'utf8').split('\n').filter((line) => line.trim() !== '');
      if (lines.length === 0) return refuse('the worklist is empty');
      const wrong = lines.filter((line) => !/^\S+ span \d+-\d+/.test(line));
      if (wrong.length > 0) return refuse(`a worklist line names no span: ${wrong[0]}`);
      const coverage = lines.filter((line) => /coverage/i.test(line));
      return coverage.length > 0
        ? refuse(`a worklist line selects by coverage: ${coverage[0]}`)
        : prove(`${lines.length} worklist line(s), each naming a span`);
    },
  },
  {
    id: 8, name: 'span', tag: PHASE_TAGS.READ, requires: [7], backTo: 7, maxLoops: 3,
    exit: (ctx) => {
      const readings = readBrief(ctx.directory, 'span');
      if (!readings.ok) return refuse(readings.problems.join('; '));
      const unsigned = readings.readings.length - signedCount(readings.readings);
      return unsigned > 0
        ? refuse(`${unsigned} claim(s) carry no signature, and a claim with no signature is not a reading`)
        : prove(`${readings.readings.length} signed reading(s)`);
    },
  },
  {
    id: 9, name: 'integrate', tag: PHASE_TAGS.DET, requires: [8], backTo: 8, maxLoops: 5,
    exit: (ctx) => {
      const artifact = readArtifact(ctx.artifactPath);
      if (artifact === null) return refuse('no artifact was written, so nothing was proven');
      if (artifact.spec.sha256 !== ctx.spec.sha256) return refuse('the artifact was written against another revision');
      const rederived = rederiveAll(artifact.pins, ctx.spec.lines);
      if (!rederived.ok) return refuse(rederived.failures[0].reason);
      const { verdicts } = checkAll({ specLines: ctx.spec.lines, artifact });
      return verdicts.length > 0
        ? refuse(describeRefusal(verdicts[0]))
        : prove('the artifact is written and every check is green');
    },
  },
  {
    id: 10, name: 'adversarial', tag: PHASE_TAGS.READ, requires: [9], backTo: 9, maxLoops: 3,
    exit: (ctx) => {
      const readings = readBrief(ctx.directory, 'adversarial');
      if (!readings.ok) return refuse(readings.problems.join('; '));
      const artifact = readArtifact(ctx.artifactPath);
      const adjudicated = artifact.sequences.filter((entry) => entry.outcome === 'notASequence').map((entry) => entry.id);
      const attacked = new Set(readings.readings.map((reading) => reading.subject));
      const unattacked = adjudicated.filter((id) => !attacked.has(id));
      if (unattacked.length > 0) return refuse(`${unattacked.length} ruling(s) were never attacked, first ${unattacked[0]}`);
      return adjudicated.length === 0
        ? prove('no entry was ruled a non-sequence, so there is no ruling to attack', { vacuous: true })
        : prove(`${attacked.size} ruling(s) attacked`);
    },
  },
  {
    id: 11, name: 'reroute', tag: PHASE_TAGS.READ, requires: [10], backTo: 10, maxLoops: 3,
    exit: (ctx) => {
      const artifact = readArtifact(ctx.artifactPath);
      const unbound = entriesOf(artifact).filter((entry) => entry.outcome === null).map((entry) => entry.id);
      if (unbound.length === 0) return prove('every entry carries a verdict, so no entry is bound to a window', { vacuous: true });
      const readings = readBrief(ctx.directory, 'reroute');
      if (!readings.ok) return refuse(readings.problems.join('; '));
      const rerouted = new Set(readings.readings.map((reading) => reading.subject));
      const missed = unbound.filter((id) => !rerouted.has(id));
      return missed.length > 0
        ? refuse(`${missed.length} entr(y|ies) bound to a window and not rerouted, first ${missed[0]}`)
        : prove(`${rerouted.size} entry(ies) rerouted`);
    },
  },
  {
    id: 12, name: 'adjudicate', tag: PHASE_TAGS.READ, requires: [11], backTo: 11, maxLoops: 3,
    exit: (ctx) => {
      const artifact = readArtifact(ctx.artifactPath);
      const bare = entriesWithoutOutcome(artifact);
      return bare.length > 0
        ? refuse(`${bare.length} entr(y|ies) carry no declared outcome, first ${bare[0].id}`)
        : prove(`${entriesOf(artifact).length} entr(y|ies) carry an outcome`);
    },
  },
  {
    id: 13, name: 'inquest', tag: PHASE_TAGS.READ, requires: [12], backTo: 12, maxLoops: 3,
    // The audit is asked after the readings and before the checks, and the check block
    // requires it. A run that built a green block without having asked anything would be
    // reporting a guarantee it had already said it could not make — the idiom the weakest
    // link uses one phase later, applied to the question rather than to the answer.
    exit: (ctx) => {
      const declaration = readDeclaration(ctx.directory);
      if (!declaration.ok) return refuse(declaration.problems.join('; '));
      const answered = readInquestFile(join(ctx.directory, INQUEST_FILE));
      if (!answered.ok) return refuse(answered.problems.join('; '));
      const unsigned = answered.readings.length - signedCount(answered.readings);
      if (unsigned > 0) {
        return refuse(`${unsigned} answer(s) carry no signature, and an answer with no signature is not a reading`);
      }

      const subjects = inquestSubjects({
        sections: declaration.declaration.sections,
        entries: declaration.declaration.entries,
      });
      const pairs = inquestPairs(subjects);
      if (pairs.length === 0) {
        return prove('the declaration declares no subject, so there is nothing to ask', { vacuous: true });
      }
      const exemptions = declaration.declaration.exemptions;
      const unanswered = pairs.find((pair) => !answered.readings.some((record) => record.subject === pair.subject && record.lens === pair.lens)
        && !isExempt(exemptions, pair));
      return unanswered === undefined
        ? prove(`${pairs.length} (subject, lens) pair(s) answered`)
        : refuse(`no answer for ${unanswered.subject} under the ${unanswered.lens} lens, and no exemption covers it`);
    },
  },
  {
    id: 14, name: 'checks', tag: PHASE_TAGS.DET, requires: [9, 13], backTo: 6, maxLoops: 3,
    exit: (ctx) => {
      // The weakest link is closed before the checks speak. A run that named its own
      // loosest judgement and then reported a green block would be reporting a
      // guarantee it had already said it could not make, so the link is refused first
      // and the block is never built.
      const declaration = readDeclaration(ctx.directory);
      if (!declaration.ok) return refuse(declaration.problems.join('; '));
      const link = declaration.declaration.weakestLink;
      if (!declaredCheckIds(ctx).has(link.tightenedBy)) {
        return refuse(`the weakest link "${link.subject}" is tightened by "${link.tightenedBy}", which no declared check answers`);
      }

      // A module that could not join the set is refused before the block is built: a
      // count taken over a set that is missing a check would read as a pass.
      const unrunnable = ctx.recorded.adhocProblems;
      if (unrunnable.length > 0) return refuse(`the ad-hoc check set could not be assembled: ${unrunnable.join('; ')}`);

      const artifact = readArtifact(ctx.artifactPath);
      const { verdicts, summary } = checkAll({
        specLines: ctx.spec.lines,
        artifact,
        recorded: ctx.recorded,
      });
      if (verdicts.length > 0) return refuse(`${verdicts[0].check}: ${verdicts[0].reason}`);
      if (summary === null) return refuse('the block was not produced, so the run stopped before the checks could speak');
      return summary.checksRun === summary.checksDeclared
        ? prove(`${summary.checksRun} checks ran of ${summary.checksDeclared}`)
        : refuse(`${summary.checksRun} checks ran of ${summary.checksDeclared}`);
    },
  },
  {
    id: 15, name: 're-derive', tag: PHASE_TAGS.DET, requires: [14], backTo: 6, maxLoops: 2,
    exit: (ctx) => {
      const artifact = readArtifact(ctx.artifactPath);
      const result = rederiveAll(artifact.pins, ctx.spec.lines);
      return result.ok
        ? prove('no check consumed an underived pin')
        : refuse(`${result.failures[0].pin}: ${result.failures[0].reason}`);
    },
  },
  {
    id: 16, name: 'falsify', tag: PHASE_TAGS.DET, requires: [14], backTo: 14, maxLoops: 3,
    exit: (ctx) => {
      const artifact = readArtifact(ctx.artifactPath);
      const context = { artifact, specLines: ctx.spec.lines, fixtureRoot: ctx.fixtureRoot };
      const unattributable = SPEC_MUTATION_CORPUS.map((testCase) => runCase(testCase, context)).filter((outcome) => !outcome.attributable);
      if (unattributable.length > 0) return refuse(`${unattributable[0].name}: ${unattributable[0].reason}`);
      const broken = COUNTER_MUTATION_CORPUS.map((testCase) => runCase(testCase, context)).filter((outcome) => outcome.red);
      return broken.length > 0
        ? refuse(`a counter-mutation reddened correct work: ${broken[0].name}; the rule is defective, not the subject`)
        : prove(`${SPEC_MUTATION_CORPUS.length} mutation(s) red, ${COUNTER_MUTATION_CORPUS.length} counter-mutation(s) green`);
    },
  },
  {
    id: 17, name: 'rail exit', tag: PHASE_TAGS.ADHOC, requires: [], backTo: null, maxLoops: 5,
    exit: (ctx) => {
      const records = ctx.recorded.railExits;
      const empty = records.filter((record) => Object.values(record).some((value) => value === '' || value === null || value === undefined));
      if (empty.length > 0) return refuse(`a rail-exit record has an empty field: ${empty[0].id}`);
      // A record must carry what an execution observed, not merely assert that one
      // happened: a check that was never falsified leaves no trace otherwise.
      const unexecuted = records.filter((record) => EXECUTION_FIELDS.some((field) => typeof record.executed?.[field] !== 'boolean'));
      return unexecuted.length > 0
        ? refuse(`a rail-exit record claims no executed outcome: ${unexecuted[0].id}`)
        : prove(`${records.length} rail-exit record(s)`);
    },
  },
  {
    id: 18, name: 'report', tag: PHASE_TAGS.DET, requires: [14], backTo: 14, maxLoops: 2,
    exit: (ctx) => (existsSync(ctx.artifactPath)
      ? prove('the artifact exists and its digest can be printed')
      : refuse('there is nothing to report, because no artifact was written')),
  },
]);

/** The phase record for an id, or null. */
export function phaseById(id) {
  return PHASES.find((phase) => phase.id === id) ?? null;
}

/** One phase's recorded state, so a reader of this file needs no import to find it. */
// [::TICKET::] PX-240, PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241) --for-spec --no-implementation-order`.
function recordOf(status, id) {
  return status.phases.find((record) => record.id === id) ?? null;
}

/**
 * The entry gate: the phase must be in order, and it must not have spent its loop limit.
 *
 * The first half is the ordering. Entering phase 14 before phase 9 would check an
 * artifact that does not exist yet, and the refusal says which phase is missing rather
 * than that the order was wrong.
 *
 * The second half is what makes `maxLoops` a limit rather than a tally. A phase refused
 * `maxLoops` times is refused entry with `halted`, naming its count and repeating its
 * last refusal verbatim, and spends no further loop. The reason a phase loops at all is
 * that its input is defective — a predicate whose limbs no line carries, a reading with
 * no signature — and asking the same reader the same question again is what already
 * failed. Reporting the count and the last refusal is the whole repair available to a run
 * that cannot change its own input, so a halt is a stop and not a retry.
 */
// [::TICKET::] PX-240 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-240 --for-spec --no-implementation-order`.
export function entryGate(phase, status) {
  const missing = phase.requires.filter((id) => !status.phases.some((record) => record.id === id && record.status === 'done'));
  if (missing.length > 0) return refuse(`phase ${missing[0]} is not done`);

  const record = recordOf(status, phase.id);
  const spent = record?.loops ?? 0;
  if (spent >= phase.maxLoops) {
    return refuse(
      `phase ${phase.id} has spent ${spent} of its ${phase.maxLoops} loops; the last refusal was: ${record.verdict ?? '(none recorded)'}`,
      { halted: true },
    );
  }
  return prove('every required phase is done and the loop limit is not spent');
}

/** Evaluate a phase's exit gate. */
export function evaluateGate(phaseId, context) {
  const phase = phaseById(phaseId);
  if (phase === null) return refuse(`there is no phase ${phaseId}`);
  try {
    return phase.exit(context);
  } catch (error) {
    return refuse(`the gate threw rather than returning a verdict: ${error.message}`);
  }
}

/**
 * Why a repeat is over an unchanged set, or null when it is not.
 *
 * This used to refuse: a generation that halted and then repeated with nothing changed
 * was stopped, on the reasoning that re-asking would put the same question. The
 * reasoning was wrong twice over. Re-asking the reader *is* the mechanism by which a
 * generation finds what the last one missed, so refusing it refused the mechanism. And
 * the specification is inviolable, so the only ways to clear the refusal were a human
 * editing the document or a human supplying material — an automatic run stopped until
 * someone acted, which the command forbids.
 *
 * What remains is the observation itself. The facts are still read, because a reader
 * who sees that a repeat changed nothing learns something the counts alone do not say;
 * they are reported and never acted on.
 *
 * @returns {string|null} the notice, naming the phase, its loops and the generation
 */
// [::TICKET::] PX-242, PX-245 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-242|PX-245) --for-spec --no-implementation-order`.
export function unchangedRepeatReason(status, { assetDigest, specSha256 }) {
  if (status === null || status === undefined) return null;
  // A recorded digest that differs means the run inherits something new, which is not an
  // unchanged repeat. A run that halted before any generation recorded one has nothing
  // that moved, and "nothing recorded" is read as "nothing changed" for the same reason:
  // the notice describes what is there, and an absent digest is not a change.
  const recorded = status.assets?.digest ?? null;
  if (recorded !== null && recorded !== assetDigest) return null;
  if (status.spec?.sha256 !== specSha256) return null;

  for (const phase of PHASES) {
    const record = recordOf(status, phase.id);
    if (record === null || record.status === 'done') continue;
    if ((record.loops ?? 0) < phase.maxLoops) continue;
    return `generation ${generationOf(status)} halted at phase ${phase.id} with ${record.loops} of ${phase.maxLoops} loops, and neither the specification nor anything the run inherits has changed; this generation repeats it over an unchanged set — the last refusal was: ${record.verdict ?? '(none recorded)'}`;
  }
  return null;
}

/** The set a listing yields, re-exported so a gate and a caller cannot disagree about it. */
export { deriveSet };
