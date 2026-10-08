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
import { agreeOn, citeFrom, coverEvery, groundIn, pinCheck, placeEach, reachEvery } from './checks.mjs';
import { readArtifactSchema, validateArtifactShape } from './load.mjs';
import { PIN_RULES, flattenPins, selectNeighbourFor } from './pins.mjs';

/**
 * The positions an operation may hold, read from the schema rather than repeated.
 *
 * A fourth position is a schema edit and not a code edit, which is what keeps the
 * placement check from carrying a second copy of the vocabulary it enforces.
 */
export const OPERATION_POSITIONS = Object.freeze(readArtifactSchema().positions);

/** The escapes that count as reaching an operation without a step naming it. */
export const UNREACHED_ESCAPES = Object.freeze(['suppliedRule', 'excluded']);

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
// [::TICKET::] PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-241 --for-spec --no-implementation-order`.
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

/** The declared partition and the section list must be the same partition. */
const sectionsAgreeWithBlocks = agreeOn(
  { id: 'sections-agree-with-blocks', defect: 'a declared section list that drifted from the partition the headings state, so the census counted a section the specification does not have', refuses: 'a section present in one partition and absent from the other, or present in both with a different range', scope: 'every artifact, over its sections and its block pin' },
  {
  left: (context) => context.artifact.sections,
  right: (context) => context.artifact.pins.blocks,
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
  everyOperationPlaced,
  everyOperationReached,
  stepCarriesFourFields,
  neighbourCitesInsideSpan,
  suppliedRuleHasNoDefiningSection,
]);

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
export function checkAll({ specLines, artifact, rederivePins = true, railExits = [] }) {
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

  const context = { specLines, artifact };
  const verdicts = [];
  for (const check of CHECKS) {
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
      checksRun: CHECKS.length,
      checksDeclared: ENGINE_DECLARED_CHECK_COUNT,
      rows: artifact.pins.blocks.length,
      steps: artifact.steps.length,
      operations: artifact.operations.length,
      sequences: artifact.sequences.length,
      pinsRederived: flattenPins(artifact.pins).length,
      pinsTotal: flattenPins(artifact.pins).length,
      railExits: railExits.length,
      promotionCandidates: railExits.filter((record) => record.promoted === false).length,
    },
  };
}

/** The rule names, re-exported so a reader can see what re-derivation means without opening pins.mjs. */
export const ENGINE_PIN_RULES = PIN_RULES;
