// the check registry, built from the constructor library (PX-241, contracts C001,
// C002, C014, C015).
//
// Every check carries the defect that produced it, the reading it refuses to accept,
// and its scope, because a check whose origin is forgotten is the first one deleted
// when it turns red. The rule that shapes all of them is stated once: a check may
// propose candidates and may never decide. No check treats a name appearing near a
// region, a plain span intersection, or a coverage relation as evidence about what a
// line says — those signals produced the fabrications, and a check built on one
// inherits their error.
//
// The checks are built from the constructors in checks.mjs rather than written out,
// so the shape of a check is declared once and a new check costs choosing a shape.
import { agreeOn, citeFrom, citeInside, coverEvery, coverEveryLine, groundIn, pinCheck, placeEach, reachEvery } from './checks.mjs';
import { coverageOf } from './coverage.mjs';
import {
  DIAGRAMMED_OUTCOMES,
  OPERATION_POSITIONS,
  UNREACHED_ESCAPES,
  readArtifactSchema,
  validateArtifactShape,
} from './load.mjs';
import { PIN_RULES, blocksFromHeadings, flattenPins, selectNeighbourFor } from './pins.mjs';
import {
  INQUEST_ANSWERS,
  INQUEST_LENSES,
  LIMB_RULING_OUTCOMES,
  NO_LIMB_APPLIES,
  inquestPairs,
  inquestSubjects,
  isExempt,
} from './readings.mjs';

/**
 * The three schema-derived vocabularies this module decides with.
 *
 * They are declared in `load.mjs`, beside the schema's reader, because the measurement in
 * `coverage.mjs` counts with the same lists and `engine.mjs` imports `coverage.mjs`: a
 * declaration here could not be read there without an import cycle. The names are imported
 * as well as re-exported, because this module reads them below — a bare `export … from`
 * would re-export them without binding them here.
 */
// [::TICKET::] PX-251 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-251 --for-spec --no-implementation-order`.
export { DIAGRAMMED_OUTCOMES, OPERATION_POSITIONS, UNREACHED_ESCAPES };

/** The classes a declared column may be placed in, and what evidence each class needs. */
export const COLUMN_DECIDERS = Object.freeze(['borrowedVocabulary', 'literalInLine', 'predicateLimb', 'unmeasured']);


/**
 * The fields a message on a sequence diagram is drawn from, one participant per side.
 *
 * Named here rather than written at the check, so the criterion and the renderer read the
 * same vocabulary: `renderSequenceDiagram` draws exactly these and the drawability check
 * refuses a step missing any one of them.
 */
// [::TICKET::] PX-249 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-249 --for-spec --no-implementation-order`.
export const DIAGRAM_FIELDS = Object.freeze(['subject', 'object', 'operation']);

/**
 * The operations a step does not perform and an escape covers.
 *
 * These are the readings a run could excuse and then forget, so the phases that attack a
 * ruling and ask a question both take their extra subjects from here rather than each
 * deciding for itself which operations those are.
 */
// [::TICKET::] PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-248 --for-spec --no-implementation-order`.
export function escapedOperationsOf(artifact) {
  return (artifact.operations ?? [])
    .filter((operation) => UNREACHED_ESCAPES.includes(operation.position))
    .map((operation) => operation.id);
}

/** The members of the borrowed census holding a role, or null when nothing is borrowed. */
// [::TICKET::] PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-248 --for-spec --no-implementation-order`.
function borrowedCensusOf(context, role) {
  const pin = (context.artifact.pins.sourceEnumerations ?? []).find((entry) => entry.role === role);
  return pin === undefined ? null : [...(pin.members ?? [])];
}

/**
 * Where a column stands, and the evidence its class rests on.
 *
 * A column whose class carries no evidence is not placed: an `unmeasured` column must say
 * which line of the specification leaves it unmeasured, and a measured one must show the
 * line, the literal or the vocabulary that measures it. Without the evidence half the
 * classification would be satisfied by relabelling.
 */
// [::TICKET::] PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-248 --for-spec --no-implementation-order`.
function columnClassOf(column, context) {
  if (!COLUMN_DECIDERS.includes(column?.decidedBy)) return { bucket: column?.decidedBy, evidence: '' };
  const inside = Number.isInteger(column.line) && column.line >= 1 && column.line <= context.specLines.length;
  const line = inside ? context.specLines[column.line - 1] ?? '' : '';
  if (column.decidedBy === 'unmeasured') return { bucket: 'unmeasured', evidence: inside ? String(column.line) : '' };
  if (column.decidedBy === 'literalInLine') {
    const carried = inside && typeof column.literal === 'string' && line.includes(column.literal);
    return { bucket: 'literalInLine', evidence: carried ? String(column.line) : '' };
  }
  if (column.decidedBy === 'predicateLimb') {
    const limbs = context.artifact.pins?.predicate?.limbs ?? [];
    const carried = inside && typeof column.limb === 'string' && limbs.includes(column.limb) && line.includes(column.limb);
    return { bucket: 'predicateLimb', evidence: carried ? String(column.line) : '' };
  }
  const vocabularies = [
    ...(context.artifact.pins?.enumerations ?? []).map((enumeration) => enumeration.name),
    ...(context.artifact.pins?.sourceEnumerations ?? []).map((borrowed) => borrowed.name),
  ];
  return { bucket: 'borrowedVocabulary', evidence: vocabularies.includes(column.vocabulary) ? String(column.vocabulary) : '' };
}

/**
 * Every operation the borrowed census names is declared, and every declared one is named.
 *
 * The two directions are different findings and are never summed: a member the census names
 * and no operation record declares is the omission this ticket exists to make impossible to
 * leave silent, and an operation the artifact declares that nothing enumerates is a name
 * bound to nothing. An artifact that borrows no census has no denominator, so both checks
 * are silent rather than wrong.
 */
// [::TICKET::] PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-248 --for-spec --no-implementation-order`.
const everyEnumeratedOperationAccountedFor = agreeOn(
  { id: 'every-enumerated-operation-accounted-for', defect: 'an operation list complete against nothing but itself, so fourteen operations a specification names were absent from the artifact and every gate passed', refuses: 'a member the borrowed census names that no operation record declares, and an operation record the census does not name', scope: 'every artifact, over its operations and the census borrowed for the operations role' },
  {
    when: (context) => borrowedCensusOf(context, 'operations') !== null,
    left: (context) => (borrowedCensusOf(context, 'operations') ?? []).map((id) => ({ id })),
    right: (context) => context.artifact.operations,
    key: (record) => record.id,
    // Identities only: two records with the same id agree whatever else they carry, because
    // comparing the rest would make this check decide how an operation should be described.
    value: (record) => record.id,
  },
);

/**
 * Every entry the borrowed census names is adjudicated, and every adjudicated one is named.
 *
 * The outcome is read for presence and never for agreement: a census that records its own
 * category for an entry and an artifact that records a different outcome are a disagreement
 * for a reader to settle, and a check that refused it would be deciding which of the two is
 * right — which is the judgement no check in this library may make. What is refused is the
 * silence: a censused entry the artifact carries no outcome for reads here as absent.
 */
// [::TICKET::] PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-248 --for-spec --no-implementation-order`.
const everyCensusedEntryAdjudicated = agreeOn(
  { id: 'every-censused-entry-adjudicated', defect: 'a census of regions that had to be ruled on, held against an artifact that was allowed to carry a region with no outcome', refuses: 'a censused entry the artifact adjudicates nowhere, and an adjudicated entry the census does not name', scope: 'every artifact, over its sequences and the census borrowed for the entries role' },
  {
    when: (context) => borrowedCensusOf(context, 'entries') !== null,
    left: (context) => (borrowedCensusOf(context, 'entries') ?? []).map((id) => ({ id })),
    right: (context) => context.artifact.sequences.filter((entry) => entry.outcome !== null && entry.outcome !== undefined),
    key: (record) => record.id,
    value: (record) => record.id,
  },
);

/** Every declared column is placed in exactly one class, and that class carries its evidence. */
// [::TICKET::] PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-248 --for-spec --no-implementation-order`.
const everyDeclaredColumnHasADecider = placeEach(
  { id: 'every-declared-column-has-a-decider', defect: 'a column list in which a column nobody can measure sat beside measured ones and read as measured itself', refuses: 'a column outside the decider vocabulary, and a column whose class carries no evidence', scope: 'every artifact, over the columns the caller declares' },
  {
    members: (context) => context.artifact.pins.columns ?? [],
    buckets: () => COLUMN_DECIDERS,
    bucketOf: columnClassOf,
    label: (column) => column?.name ?? '(unnamed column)',
  },
);

/**
 * Every column the caller requires measured is measured.
 *
 * The requirement is the caller's and the rule is the rail's: which columns an interface
 * needs is a property of the project, and a rail that named them would serve that project
 * and no other. An empty requirement enforces nothing extra and is the honest state of a
 * caller who has not decided yet.
 */
// [::TICKET::] PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-248 --for-spec --no-implementation-order`.
const everyRequiredColumnIsMeasured = coverEvery(
  { id: 'every-required-column-is-measured', defect: 'a column the caller requires measured, declared unmeasured, so the interface was planned from a record that never carried it', refuses: 'a column the required-measured list names that is declared unmeasured or placed nowhere', scope: 'every artifact, over the required-measured list the caller declares' },
  {
    sources: (context) => context.artifact.pins.requiredMeasuredColumns ?? [],
    coveredBy: (name, context) => {
      const column = (context.artifact.pins.columns ?? []).find((candidate) => candidate.name === name);
      if (column === undefined) return false;
      return column.decidedBy !== 'unmeasured' && columnClassOf(column, context).evidence !== '';
    },
    label: (name) => name,
  },
);

/**
 * Every sequence that claims to be a sequence can be drawn from the artifact.
 *
 * This is what makes the completeness of the artifact's own records measurable rather than
 * asserted: a diagram needs a participant on each side of every message, so a step that
 * performs an act and names no actor or no target is a gap in the record, not a rendering
 * detail. A region ruled not a sequence is owed no diagram and is not asked for one.
 */
// [::TICKET::] PX-248, PX-249 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-248|PX-249) --for-spec --no-implementation-order`.
const everySequenceIsDrawable = coverEvery(
  { id: 'every-sequence-is-drawable', defect: 'an artifact whose steps carried what a diagram needs while nothing ever drew one, so the sufficiency of the record was never tested', refuses: 'a sequence whose step carries no subject, no object or no operation, so the diagram would name a participant or an act that was never read', scope: 'every artifact, over the sequences that claim to be sequences' },
  {
    sources: (context) => context.artifact.sequences.filter((entry) => DIAGRAMMED_OUTCOMES.includes(entry.outcome)),
    coveredBy: (entry, context) => {
      const steps = context.artifact.steps.filter((step) => step.sequence === entry.id);
      return steps.length > 0 && steps.every((step) => DIAGRAM_FIELDS.every((field) => typeof step[field] === 'string' && step[field] !== ''));
    },
    label: (entry) => entry.id,
  },
);

/**
 * Every step was given a sequence the artifact draws.
 *
 * The drawability check's denominator is the sequences that claim to be a sequence, so a
 * step attached to a region ruled notASequence lies outside it and no diagram would ever
 * carry it: the step is in the artifact and in no picture. This is the other half of the
 * same rule — that one asks whether every drawn sequence can be drawn, this one asks
 * whether every step was given a sequence that can — and together they say that every
 * step appears in exactly one diagram.
 */
// [::TICKET::] PX-249 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-249 --for-spec --no-implementation-order`.
const everyStepBelongsToADrawnSequence = coverEvery(
  { id: 'every-step-belongs-to-a-drawn-sequence', defect: 'an artifact holding a step whose sequence was ruled not a sequence, so the record carried the step and nothing drew it', refuses: 'a step whose sequence is not one the artifact draws', scope: 'every artifact, over every step' },
  {
    sources: (context) => context.artifact.steps,
    coveredBy: (step, context) => DIAGRAMMED_OUTCOMES.includes(
      context.artifact.sequences.find((entry) => entry.id === step.sequence)?.outcome,
    ),
    label: (step) => step.id,
  },
);

/** Every field the consumer of the artifact reads is carried by every operation record. */
// [::TICKET::] PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-248 --for-spec --no-implementation-order`.
const everyOperationRecordCarriesTheConsumerFields = coverEvery(
  { id: 'every-operation-record-carries-the-consumer-fields', defect: 'an artifact whose operation records carried what the rail needed and not what the implementer needed, so the interface was planned from fields nothing had checked', refuses: 'a field the caller names as one the consumer reads that an operation record does not carry', scope: 'every artifact, over the consumer fields the caller declares' },
  {
    sources: (context) => context.artifact.pins.consumerFields ?? [],
    coveredBy: (field, context) => context.artifact.operations.every((operation) => operation[field] !== undefined),
    label: (field) => field,
  },
);

/** Every operation a step does not perform is an escape, and an escape is interrogated. */

/** The four fields a step carries, so a missing one is named rather than counted. */
const STEP_FIELDS = Object.freeze(['subject', 'predicate', 'object', 'contract']);

/** A block whose range leaves the specification resolves a citation to nothing. */
const blockRangeInsideSpecification = {
  id: 'block-range-inside-specification',
  originatingDefect: 'a block range read past the end of the specification, so a citation resolved to nothing',
  refuses: 'a block whose last line is beyond the specification, or whose first line is below one',
  scope: 'every artifact, against the specification it names',
  // [::TICKET::] PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-241 --for-spec --no-implementation-order`.
  run(context) {
    return context.artifact.pins.blocks
      .filter((block) => block.lastLine > context.specLines.length || block.firstLine < 1)
      .map((block) => ({
        check: 'block-range-inside-specification',
        subject: block.id,
        reason: `block ${block.id} spans ${block.firstLine}-${block.lastLine} and the specification has ${context.specLines.length} lines`,
      }));
  },
};

/** A step missing any of the four fields is not a step, whatever else it carries. */
const stepCarriesFourFields = {
  id: 'step-carries-four-fields',
  originatingDefect: 'a step file in which every step carried all four fields, the ordering held and the bijection held, and none of it was a reading',
  refuses: 'a step missing any of subject, predicate, object or contract',
  scope: 'every artifact, over its steps',
  // [::TICKET::] PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-241 --for-spec --no-implementation-order`.
  run(context) {
    return context.artifact.steps.flatMap((step) =>
      STEP_FIELDS
        .filter((field) => step[field] === undefined || step[field] === '')
        .map((field) => ({
          check: 'step-carries-four-fields',
          subject: step.id ?? '(unnamed step)',
          reason: `step carries no ${field}`,
        })),
    );
  },
};

/** A neighbour verdict must name the neighbour the engine selects by citation. */
const neighbourCitesInsideSpan = citeFrom(
  { id: 'neighbour-cites-inside-span', defect: 'an operation bound to a window because its name or result object appeared nearby', refuses: 'a neighbour verdict whose neighbour is not the entry the engine selects by citation', scope: 'every artifact, over its sequences' },
  {
  claims: (context) => context.artifact.sequences
    .filter((entry) => entry.outcome === 'viaNeighbour')
    .map((entry) => ({ subject: entry.id, carrier: entry.neighbour })),
  // The carrier set is resolved for this entry alone: an entry is realized by the
  // neighbour that cites a line inside it, and by no other.
  carriers: (claim, context) => {
    const entry = context.artifact.sequences.find((candidate) => candidate.id === claim.subject);
    const selected = entry === undefined ? null : selectNeighbourFor(context.artifact, entry);
    return selected === null ? [] : [selected];
  },
});

/** The supplied rows: the ones whose grounding was written by a designer rather than read. */
// [::TICKET::] PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-241 --for-spec --no-implementation-order`.
function suppliedRows(context) {
  return context.artifact.operations.filter((operation) => operation.grounding?.classification === 'designer_supplied');
}

/**
 * A supplied rule is grounded in a line, and the row it supersedes keeps no section.
 *
 * The grounding half is the constructor: the rule names an integer line and that line
 * contains the name. The second half is stated beside it rather than fused with it,
 * because a row can fail either condition and the reader of one refusal should not
 * have to work out which half spoke.
 */
const suppliedRuleHasNoDefiningSection = {
  id: 'supplied-rule-has-no-defining-section',
  originatingDefect: 'a row keeping a defining_section that a designer-supplied rule supersedes',
  refuses: 'a supplied row whose presupposition is not an integer line naming it, or that keeps a section the rule supersedes',
  scope: 'every artifact, over its operations',
  // [::TICKET::] PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-241 --for-spec --no-implementation-order`.
  run(context) {
    const ungrounded = groundIn(
      { id: 'supplied-rule-has-no-defining-section', defect: 'a supplied rule whose presupposition names no line that carries it', refuses: 'a supplied row whose presupposition is not an integer line naming it' },
      {
      claims: (inner) => suppliedRows(inner)
        .map((operation) => ({ subject: operation.id, line: operation.grounding.presupposition, quote: operation.id })),
    }).run(context);

    const keepsSupersededSection = suppliedRows(context)
      .filter((operation) => operation.defining_section !== undefined && operation.defining_section !== null)
      .map((operation) => ({
        check: 'supplied-rule-has-no-defining-section',
        subject: operation.id,
        reason: `the row keeps defining_section ${operation.defining_section} that the rule supersedes`,
      }));

    return [...ungrounded, ...keepsSupersededSection];
  },
};

/** Where an operation stands, and the evidence its position rests on. */
// [::TICKET::] PX-241, PX-246 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-241|PX-246) --for-spec --no-implementation-order`.
function placementOf(operation, context) {
  if (operation.position === 'positioned') {
    const carrier = context.artifact.steps.find((step) => step.operation === operation.id);
    return { bucket: 'positioned', evidence: carrier === undefined ? '' : carrier.id };
  }
  if (operation.position === 'singleStep') {
    const section = context.artifact.sections.find((candidate) => candidate.id === operation.definingSection);
    return { bucket: 'singleStep', evidence: section === undefined ? '' : section.id };
  }
  if (operation.position === 'suppliedRule') {
    const line = operation.grounding?.presupposition;
    const text = Number.isInteger(line) ? context.specLines[line - 1] ?? '' : '';
    return { bucket: 'suppliedRule', evidence: text.includes(operation.id) ? String(line) : '' };
  }
  if (operation.position === 'excluded') {
    // An exclusion is a boundary rather than a silence: the row stays, and the line that
    // excludes it is what places it. A row excused from the reach check on a reason that
    // cites nothing is the escape the census exists to close.
    const line = operation.grounding?.line;
    const inside = Number.isInteger(line) && line >= 1 && line <= context.specLines.length;
    return { bucket: 'excluded', evidence: inside ? String(line) : '' };
  }
  return { bucket: operation.position, evidence: '' };
}

/** The operations a step's entry derives, which is the only place the relation is kept. */
// [::TICKET::] PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-241 --for-spec --no-implementation-order`.
function derivedOperations(entry, context) {
  return [...new Set(context.artifact.steps.filter((step) => step.sequence === entry.id).map((step) => step.operation))];
}

/** The entries: a neighbour is a place an act may be found, not an entry to adjudicate. */
// [::TICKET::] PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-241 --for-spec --no-implementation-order`.
function entriesOf(context) {
  return context.artifact.sequences.filter((entry) => entry.kind === 'entry');
}

/**
 * The audit: four checks over the artifact and the answers that arrived (PX-243).
 *
 * The answers are handed in as a value rather than read from a directory, so a check
 * cannot decide by looking around it. `inquest === null` says the run has no audit
 * anywhere — the product path, verifying an artifact with nothing beside it — and the
 * four checks are then vacuous rather than red, because "there is no audit to judge" and
 * "an audit was opened and answered nothing" are different findings and only one of them
 * is incompleteness. An empty array is the second.
 */
// [::TICKET::] PX-243, PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-243|PX-244) --for-spec --no-implementation-order`.
function answersOf(context) {
  return context.inquest ?? [];
}

/** The subjects the artifact puts to the audit: its sections and its entries. */
// [::TICKET::] PX-243, PX-244, PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-243|PX-244|PX-248) --for-spec --no-implementation-order`.
function inquestSubjectsOf(context) {
  // The escapes are asked because an operation no step performs is the one thing a reading
  // could excuse and then forget. The set is the escapes alone: a real operation is already
  // carried by the step that performs it, and interrogating all of them would multiply the
  // audit by the size of the interface.
  return inquestSubjects({
    sections: context.artifact.sections,
    entries: context.artifact.sequences,
    escaped: escapedOperationsOf(context.artifact),
  });
}

/** A pair, written the way every verdict about it writes it. */
// [::TICKET::] PX-243, PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-243|PX-244) --for-spec --no-implementation-order`.
function pairLabel(pair) {
  return `${pair.subject} · ${pair.lens}`;
}

/**
 * Every declared subject is interrogated under every lens, and no pair is answered twice
 * over.
 *
 * The sources are the pairs, so a verdict names the subject *and* the lens: "s5 is
 * unanswered" would leave a reader to work out which of four questions is missing, and
 * the four are different questions about the same text.
 */
const inquestCoversEverySubjectAndLens = coverEvery(
  { id: 'inquest-covers-every-subject-and-lens', defect: 'an audit that interrogated the subjects it happened to think of, so a lens nobody applied looked the same as one that was applied and found nothing', refuses: 'a (subject, lens) pair the declaration puts and no answer and no exemption covers', scope: 'every artifact, over its sections and entries, against INQUEST_LENSES' },
  {
    sources: (context) => (context.inquest === null
      ? []
      : inquestPairs(inquestSubjectsOf(context)).filter((pair) => !isExempt(context.artifact.exemptions, pair))),
    coveredBy: (pair, context) => answersOf(context).some((record) => record.subject === pair.subject && record.lens === pair.lens),
    label: pairLabel,
  },
);

/**
 * Every answer is one of the declared answers.
 *
 * The lens is the evidence and the answer is the bucket, because the lens vocabulary is
 * refused by the readings validator before any check sees a record — so what is left for
 * a check to refuse is an answer outside the vocabulary, and the verdict has to name it.
 */
const inquestAnswersStayInVocabulary = placeEach(
  { id: 'inquest-answers-stay-in-the-declared-vocabulary', defect: 'an answer written in prose because the closed vocabulary had no word for it, so the audit recorded a judgement nothing could compare', refuses: 'an answer outside INQUEST_ANSWERS', scope: 'every audit answer, over INQUEST_ANSWERS' },
  {
    members: answersOf,
    buckets: () => INQUEST_ANSWERS,
    bucketOf: (record) => ({ bucket: record.answer, evidence: INQUEST_LENSES.includes(record.lens) ? record.lens : '' }),
    label: pairLabel,
  },
);

/** Every answer is grounded in the line it names. */
const inquestAnswersAreGrounded = groundIn(
  { id: 'inquest-answers-are-grounded-in-their-line', defect: 'an answer whose quote was assembled from the artifact the audit was meant to interrogate, so the audit agreed with the thing it was checking', refuses: 'an answer whose cited line does not carry its quote', scope: 'every audit answer, against the specification' },
  {
    claims: (context) => answersOf(context).map((record) => ({ subject: pairLabel(record), line: record.line, quote: record.quote })),
  },
);

/** Every answer cites a line the specification has. */
const inquestAnswersCiteInsideSpecification = citeFrom(
  { id: 'inquest-answers-cite-a-line-inside-the-specification', defect: 'an answer citing a line number that resolves to nothing, so a citation read as a reading while pointing at no text at all', refuses: 'an answer whose cited line is not one of the specification lines', scope: 'every audit answer, against the specification' },
  {
    claims: (context) => answersOf(context).map((record) => ({ subject: pairLabel(record), carrier: record.line })),
    // The lines the specification has, and no others: the carrier set is the document.
    carriers: (claim, context) => Array.from({ length: context.specLines.length }, (_, index) => index + 1),
  },
);

/** The declared partition and the section list must be the same partition. */const sectionsAgreeWithBlocks = agreeOn(
  { id: 'sections-agree-with-blocks', defect: 'a declared section list that drifted from the partition the headings state, so the census counted a section the specification does not have', refuses: 'a section present in one partition and absent from the other, or present in both with a different range', scope: 'every artifact, over its sections and its block pin' },
  {
  left: (context) => context.artifact.sections,
  // The headings themselves at the level the artifact declares, not the pin: the pin is a
  // claim, this check is about whether the declared list drifted from the document. A
  // section list taken at one level while the artifact says another is the drift.
  right: (context) => blocksFromHeadings(context.specLines, context.artifact.pins.sectionLevel),
  value: (record) => `${record.firstLine}-${record.lastLine}`,
});

/**
 * Every section is explained: an entry starts inside it, or a ruling names it.
 *
 * An entry that merely covers a section says nothing about that section, so it does
 * not explain it. This is the check that sees the sections the apparatus never entered,
 * which is the class of blind spot the census exists to make visible.
 */
const censusEverySectionExplained = coverEvery(
  { id: 'census-every-section-explained', defect: 'the apparatus could not see sections it had never entered, so a section nobody read looked the same as one that was read and found empty', refuses: 'a section no entry starts inside and no adjudication names', scope: 'every artifact, over its sections' },
  {
  sources: (context) => context.artifact.sections,
  coveredBy: (section, context) => context.artifact.sequences.some((entry) => entry.kind === 'entry'
    && entry.firstLine >= section.firstLine && entry.firstLine <= section.lastLine)
    || context.artifact.adjudications.some((row) => row.subject === section.id),
});

/**
 * Every line of the document belongs to an entry.
 *
 * The census counts sections and the reach check counts operations, and neither counts
 * lines: a section is satisfied by an entry that starts at its first line however little
 * of the section it spans, so the union of entry spans could cover a fraction of the
 * document while every gate passed. Measured on the golden fixture at 51 of 60 lines
 * belonging to nobody, which is the defect this check exists to name.
 */
// [::TICKET::] PX-247 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-247 --for-spec --no-implementation-order`.
const everyLineBelongsToAnEntry = coverEveryLine(
  { id: 'every-line-belongs-to-an-entry', defect: 'a document that was partitioned and adjudicated while its body was never read, so a run could finish with most of the specification belonging to no entry', refuses: 'a line of the specification that no entry spans, so nothing was read there', scope: 'every artifact, over its sequences and its specification line count' },
  {
    // The document rather than the artifact's own record of its size: what is verified is
    // the file the run was pointed at, and an artifact cannot be the authority on how many
    // lines that file has.
    spans: (context) => (context.artifact.sequences ?? []).map(({ firstLine, lastLine }) => ({ firstLine, lastLine })),
    lineCount: (context) => context.specLines.length,
  },
);

/**
 * Every step is grounded in the line it names.
 *
 * The device is the one the audit answers already use and the steps did not: the quote
 * must be a contiguous substring of the line it cites, after whitespace is normalised,
 * because a quote assembled from two places is the fabrication this asks about. Without
 * it a decomposition can carry every act field, in order, with the bijection holding, and
 * not be a reading — which is a measured failure rather than an imagined one.
 */
const stepIsGroundedInItsLine = groundIn(
  { id: 'step-is-grounded-in-its-line', defect: 'a step whose quote was assembled rather than read, so a decomposition passed every structural check without being a reading', refuses: 'a step whose cited line does not carry its quote', scope: 'every artifact, over its steps' },
  {
    claims: (context) => context.artifact.steps.map((step) => ({ line: step.line, quote: step.quote, subject: step.id })),
  },
);

/**
 * Every step cites a line inside its entry's span, or one the entry records as a crossing.
 *
 * The span is the currency the census and the neighbour relation are counted in, so an
 * absorbed distance makes both of them a rubber stamp; a recorded crossing keeps the
 * separation visible instead of hiding it inside a range.
 */
const stepCitesInsideItsEntrySpan = citeInside(
  { id: 'step-cites-a-line-inside-its-entry-span', defect: 'a span wide enough to absorb the distance between a procedure and its anchor, so the census counted lines nobody read', refuses: 'a step citing a line outside its entry span that the entry does not record as a crossing', scope: 'every artifact, over its steps and its sequences' },
  {
    claims: (context) => context.artifact.steps,
    spanOf: (step, context) => context.artifact.sequences.find((sequence) => sequence.id === step.sequence) ?? null,
    crossings: (span) => span.crossRefs ?? [],
  },
);

/**
 * Every ruling that applies the predicate names a limb of it, or says that none applies.
 *
 * This is what makes the predicate a criterion rather than a citation: the pin is
 * re-derived every run, and until a ruling has to point at a limb, a declaration whose
 * limbs are the chosen line's own words satisfies the re-derivation by quoting itself.
 */
const adjudicationCitesADeclaredLimb = coverEvery(
  { id: 'adjudication-cites-a-declared-limb', defect: 'a ruling that applies the predicate without naming the limb it fails, so the criterion was never used by the reading it decides', refuses: 'a ruling outside the declared limbs, and a ruling that names no limb and does not say none applies', scope: 'every artifact, over its adjudications' },
  {
    sources: (context) => context.artifact.adjudications.filter((row) => LIMB_RULING_OUTCOMES.includes(row.outcome)),
    coveredBy: (row, context) => {
      const limbs = context.artifact.pins?.predicate?.limbs ?? [];
      return row.predicateLimb === NO_LIMB_APPLIES || limbs.includes(row.predicateLimb);
    },
    label: (row) => row.subject,
  },
);

/**
 * How many of the declared limbs a ruling cited, and how many it did not.
 *
 * A count of what the artifact holds, so it lives beside the other measurements and in
 * the summary a report prints — and, like them, it is compared to no threshold. What it
 * makes visible is a predicate nothing decided by: every ruling saying no limb applies is
 * a reading of the document, and every ruling saying so while no limb was ever cited is a
 * declaration that is not being used.
 */
// [::TICKET::] PX-246 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-246 --for-spec --no-implementation-order`.
function limbCensus(artifact) {
  const limbs = artifact.pins?.predicate?.limbs ?? [];
  const cited = new Set(
    (artifact.adjudications ?? [])
      .map((row) => row.predicateLimb)
      .filter((limb) => limbs.includes(limb)),
  );
  return { predicateLimbs: limbs.length, limbsCited: cited.size, limbsUnused: limbs.length - cited.size };
}

/** Every operation names where it stands, and that place carries its evidence. */
const everyOperationPlaced = placeEach(
  { id: 'every-operation-placed', defect: 'an operation that was neither positioned nor single-step was allowed, and the escape from the census rested on a claim with nothing behind it', refuses: 'an operation whose position is undeclared, or whose position evidence is absent', scope: 'every artifact, over its operations' },
  {
  members: (context) => context.artifact.operations,
  buckets: () => OPERATION_POSITIONS,
  bucketOf: placementOf,
});

/**
 * Every operation is reached by a step, and every step names an operation that exists.
 *
 * The two directions are different findings and are never summed: a claimed name
 * nobody declares is a fabricated name, and a declared name nothing reaches is missing
 * work. An entry whose steps derive no operation is a third finding, because an entry
 * that realizes nothing is not a sequence.
 */
// [::TICKET::] PX-247 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-247 --for-spec --no-implementation-order`.
const everyOperationReached = reachEvery(
  { id: 'every-operation-reached', defect: 'a sequence to operation surjection that did not exist, so an entry could name an operation no step performed and an operation could be reached by nothing', refuses: 'a step naming an operation the artifact does not declare, an operation no step reaches and no escape covers, or an entry that derives no operation', scope: 'every artifact, over its steps and its operations' },
  {
  claimed: (context) => context.artifact.steps.map((step) => step.operation),
  declared: (context) => context.artifact.operations.map((operation) => operation.id),
  exempt: (name, context) => {
    const operation = context.artifact.operations.find((candidate) => candidate.id === name);
    return operation !== undefined && UNREACHED_ESCAPES.includes(operation.position);
  },
  entries: entriesOf,
  derivedBy: derivedOperations,
  // An entry that claims a sequence must realize one, and an entry a reader ruled not a
  // sequence claims none: requiring it to derive an operation would require a rejected
  // claim to hold. A region that holds no sequence has to be declareable, because the
  // line-coverage rule above needs exactly that declaration to name the lines it read.
  mustRealize: (entry) => entry.outcome !== 'notASequence',
});

/** The checks, in the order the run reports them. */
export const CHECKS = Object.freeze([
  blockRangeInsideSpecification,
  pinCheck(
    'predicate-pin-rederives',
    'predicate',
    'a predicate read from a neighbouring sentence rather than from the line that states it',
    'a predicate pin whose line does not contain every limb it declares',
  ),
  pinCheck(
    'row-schema-pin-rederives',
    'rowSchema',
    'a field list assembled from two places in the document',
    'a row-schema pin whose line does not carry every field it declares',
  ),
  pinCheck(
    'enumeration-pin-rederives',
    'enumeration',
    'a member accepted from outside the range the specification states it in',
    'an enumeration pin with a member that occurs nowhere inside its declared ranges',
  ),
  pinCheck(
    'source-enumeration-pin-rederives',
    'sourceEnumeration',
    'a census read from supplied material that is compared with itself, so a file that moved left every member it named looking accounted for',
    'a borrowed census whose supplied file is not beside the run, whose bytes moved, or whose rows no longer carry the members the pin lists',
  ),
  pinCheck(
    'block-partition-rederives',
    'blocks',
    'an overlapping block partition hid a section from the census',
    'a partition that overlaps, leaves a gap, or ends before the last line',
  ),
  pinCheck(
    'form-pin-proposes',
    'form',
    'a form detector that decided instead of proposing candidates',
    'a form entry that claims to decide',
  ),
  sectionsAgreeWithBlocks,
  censusEverySectionExplained,
  everyLineBelongsToAnEntry,
  everyOperationPlaced,
  everyOperationReached,
  everyEnumeratedOperationAccountedFor,
  everyCensusedEntryAdjudicated,
  everyOperationRecordCarriesTheConsumerFields,
  everyDeclaredColumnHasADecider,
  everyRequiredColumnIsMeasured,
  everySequenceIsDrawable,
  everyStepBelongsToADrawnSequence,
  stepCarriesFourFields,
  stepIsGroundedInItsLine,
  stepCitesInsideItsEntrySpan,
  adjudicationCitesADeclaredLimb,
  neighbourCitesInsideSpan,
  suppliedRuleHasNoDefiningSection,
  inquestCoversEverySubjectAndLens,
  inquestAnswersStayInVocabulary,
  inquestAnswersAreGrounded,
  inquestAnswersCiteInsideSpecification,
]);

/**
 * Describe a refusal so a reader knows what to repair.
 *
 * A verdict names its subject — the line, the section, the step — and its reason is the
 * rule that refused it. Printing the rule alone tells a reader that something is wrong
 * and not where, so the subject travels with it. The two shapes are the two the engine
 * produces: a check's verdict, and a re-derivation failure, which carries the line it
 * failed on inside its reason and has no check to name.
 */
export function describeRefusal({ check, pin, subject, reason }) {
  if (check === undefined) return `${pin}: ${reason}`;
  return `${check}: ${subject} — ${reason}`;
}

/** The count the run must report; a run that ran fewer is incomplete even when it exits zero. */
export const ENGINE_DECLARED_CHECK_COUNT = CHECKS.length;

/**
 * Run every check and build the summary.
 *
 * The summary is produced only after every check has run, so a null summary means
 * the run stopped before the checks could speak — which is what a missing pin or a
 * disabled re-derivation has to look like, because "no verdicts" and "no checks"
 * must never print the same.
 *
 * @returns {{verdicts: Array<object>, summary: object|null}}
 */
// [::TICKET::] PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-244 --for-spec --no-implementation-order`.
// [::TICKET::] PX-245 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-245 --for-spec --no-implementation-order`.
export function checkAll({ specLines, artifact, rederivePins = true, recorded = {} }) {
  // Everything the run recorded beside the artifact is one input, because the checks read
  // it as one thing: the rail exits a scaffold left, the audit a reader answered, and the
  // ad-hoc checks that were loaded from the run directory.
  const { railExits = [], inquest = null, adhocChecks = [], supplied = {} } = recorded;
  const shapeProblems = validateArtifactShape(artifact, readArtifactSchema());
  if (shapeProblems.length > 0) {
    return {
      verdicts: shapeProblems.map((problem) => ({ check: 'artifact-shape', pin: problem.pin, subject: problem.pin, reason: problem.reason })),
      summary: null,
    };
  }

  if (!rederivePins) {
    return {
      verdicts: [{
        check: 'pin-not-rederived-in-this-run',
        subject: 'pins',
        reason: 'every pin must be re-derived from the specification in the same run that consumes it; this run disabled re-derivation',
      }],
      summary: null,
    };
  }

  // The declared set is what the run promised; the run set is what it could call. They
  // are counted separately so a check that was declared and never ran is visible as the
  // difference rather than absorbed into a total that reads the same either way.
  const declared = [...CHECKS, ...adhocChecks];
  const runnable = declared.filter((check) => typeof check.run === 'function');

  const context = { specLines, artifact, inquest, supplied };
  const verdicts = [];
  for (const check of runnable) {
    try {
      verdicts.push(...check.run(context));
    } catch (error) {
      verdicts.push({ check: check.id, subject: '(threw)', reason: error.message });
    }
  }

  if (verdicts.length > 0) return { verdicts, summary: null };

  return {
    verdicts,
    summary: {
      checksRun: runnable.length,
      checksDeclared: declared.length,
      checksAdhoc: adhocChecks.length,
      // The artifact's measurements come from one place, so the number a report prints
      // and the number recorded in history are the same value and cannot disagree.
      ...coverageOf(artifact),
      ...limbCensus(artifact),
      pinsRederived: flattenPins(artifact.pins).length,
      pinsTotal: flattenPins(artifact.pins).length,
      railExits: railExits.length,
      promotionCandidates: railExits.filter((record) => record.promoted === false).length,
    },
  };
}

/** The rule names, re-exported so a reader can see what re-derivation means without opening pins.mjs. */
export const ENGINE_PIN_RULES = PIN_RULES;
