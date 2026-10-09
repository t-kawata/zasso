// the two-sided harness, the rail-exit record, the rendering and the coverage
// direction (PX-240, contracts C005, C009, C014, C015).
//
// The rule that makes a check trustworthy is that both directions have been run: a
// mutation of the subject must redden the check it names, for a reason attributable
// to that check, and a counter-mutation on correct work must stay green. A rule that
// fails correct work is a defect in the rule, not in the subject, so a counter-case
// that reddens fails the case rather than the fixture.
//
// The mutation corpus works on copies, and the harness digests the fixture tree
// before and after anyway: asserting restoration from a copy would be asserting the
// implementation's own claim, and the corpus is only repeatable if the tree it reads
// is the tree it found.
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { checkAll } from './engine.mjs';

/** The file a run keeps its rail-exit records in, beside the checks it had to write. */
export const RAIL_EXIT_FILE = 'rail-exits.jsonl';

/**
 * Where a run's rail exits are recorded.
 *
 * This used to be a module-level constant computed from `import.meta.dirname`, which put
 * every specification's records inside the tool tree: a run of one specification read
 * another's ad-hoc history, and a successful scaffold wrote into the library. The store
 * is now a function of the run directory, so the location is stated where the run is
 * opened and a reader of the specification finds the records beside what they describe.
 */
// [::TICKET::] PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-244 --for-spec --no-implementation-order`.
export function railExitStoreFor(runDirectory) {
  requireStore(runDirectory, 'railExitStoreFor');
  return join(runDirectory, RAIL_EXIT_FILE);
}

/**
 * Refuse a call that did not say where the store is.
 *
 * There is no default, and that is the point: a default is what allowed a scaffold to write
 * inside the tool tree. The refusal names the argument rather than the rule, because the
 * caller has to pass something and the useful thing to say is what.
 */
// [::TICKET::] PX-244, PX-243 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-244|PX-243) --for-spec --no-implementation-order`.
function requireStore(storePath, caller) {
  if (typeof storePath !== 'string' || storePath.trim() === '') {
    throw new Error(`${caller} needs the store path; the rail-exit store belongs to a run directory, and a default would write into the tool tree`);
  }
}

/** The three things an execution observes, and the only shape a record may claim. */
export const EXECUTION_FIELDS = Object.freeze(['reddened', 'attributable', 'counterGreen']);

/** Every field a rail-exit record carries; an empty one is refused. */
export const RAIL_EXIT_FIELDS = Object.freeze([
  'id',
  'check',
  'noAnalogueInRecord',
  'inputs',
  'outputShape',
  'readBy',
  'verifiedBy',
  'promoted',
  'promotionCondition',
  'executed',
]);

/**
 * Read the rail-exit records, oldest first.
 *
 * A run with no store has no records rather than an error: a specification that has never
 * needed an ad-hoc check has nothing to say here, and that is the same state as one whose
 * directory was opened a moment ago.
 */
// [::TICKET::] PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-244 --for-spec --no-implementation-order`.
export function readRailExits(storePath) {
  requireStore(storePath, 'readRailExits');
  if (!existsSync(storePath)) return [];
  return readFileSync(storePath, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
}

/**
 * Why a record cannot be written, or null when it can.
 *
 * `executed` is checked for its shape and not only for its presence: the store exists
 * so that a claim about a check carries what was observed about it, and a record whose
 * executed field is an empty object would claim a verification that never happened.
 */
// [::TICKET::] PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-241 --for-spec --no-implementation-order`.
function whyUnwritable(record) {
  const empty = RAIL_EXIT_FIELDS.filter((field) => record[field] === undefined || record[field] === '' || record[field] === null);
  if (empty.length > 0) return `the rail-exit record has empty field(s): ${empty.join(', ')}`;
  const missing = EXECUTION_FIELDS.filter((field) => typeof record.executed[field] !== 'boolean');
  return missing.length > 0 ? `the rail-exit record claims no executed outcome for: ${missing.join(', ')}` : null;
}

/**
 * Write one rail-exit record, refusing a record that claims more than was observed.
 *
 * Appending is the shape a scaffold needs. A promotion rewrites a record that is already
 * there, which is `writeRailExits` below.
 */
// [::TICKET::] PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-244 --for-spec --no-implementation-order`.
export function writeRailExit(record, storePath) {
  requireStore(storePath, 'writeRailExit');
  const problem = whyUnwritable(record);
  if (problem !== null) throw new Error(problem);
  appendFileSync(storePath, `${JSON.stringify(record)}\n`);
  return record;
}

/**
 * Rewrite the whole store, which is what a promotion does.
 *
 * A promotion changes a record that is already there rather than adding one, and an
 * appending writer cannot express that. The records are written in the order they are
 * given, so the store keeps its history.
 */
// [::TICKET::] PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-244 --for-spec --no-implementation-order`.
export function writeRailExits(records, storePath) {
  requireStore(storePath, 'writeRailExits');
  writeFileSync(storePath, records.map((record) => `${JSON.stringify(record)}\n`).join(''));
  return records;
}

/**
 * Splice a new check into the record.
 *
 * A check whose originating defect is unknown is refused: the rail exit exists so a
 * defect class with no analogue stays visible, and an unrecorded check is exactly the
 * silent growth the record is for.
 */
// [::TICKET::] PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-244 --for-spec --no-implementation-order`.
export function spliceCheck({ contract, cases, executed, storePath }) {
  requireStore(storePath, 'spliceCheck');
  const { check, defect } = contract;
  const { mutationCase, counterCase } = cases;
  if (defect === undefined || defect === '') throw new Error('the check has no originating defect');
  if (mutationCase === undefined) throw new Error('the check has no mutation case, so nothing falsifies it');
  if (counterCase === undefined) throw new Error('the check has no counter-case, so nothing shows it passes correct work');
  if (executed === undefined) throw new Error('the check carries no executed outcome, so nothing shows it was falsified');

  return writeRailExit(
    {
      id: `${check}#${defect.length}`,
      check,
      noAnalogueInRecord: defect,
      inputs: mutationCase.inputs,
      outputShape: mutationCase.outputShape,
      readBy: mutationCase.readBy,
      verifiedBy: counterCase.name,
      promoted: false,
      promotionCondition: 'promote when a second specification needs the same rule',
      executed,
    },
    storePath,
  );
}

/** Move a pin's line to a line that does not carry its limbs. */
// [::TICKET::] PX-240, PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241) --for-spec --no-implementation-order`.
function movePinLine(artifact, kind, line) {
  const next = structuredClone(artifact);
  if (kind === 'predicate') next.pins.predicate.line = line;
  if (kind === 'rowSchema') next.pins.rowSchema.line = line;
  return next;
}

/** The specification mutations: each must redden the check it names. */
export const SPEC_MUTATION_CORPUS = Object.freeze([
// [::TICKET::] PX-246 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-246 --for-spec --no-implementation-order`.
  {
    name: 'predicate-line-moved',
    check: 'predicate-pin-rederives',
    mutate: ({ artifact, specLines }) => ({ artifact: movePinLine(artifact, 'predicate', 1), specLines }),
  },
  {
    name: 'row-schema-line-moved',
    check: 'row-schema-pin-rederives',
    mutate: ({ artifact, specLines }) => ({ artifact: movePinLine(artifact, 'rowSchema', 1), specLines }),
  },
  {
    name: 'enumeration-member-outside-range',
    check: 'enumeration-pin-rederives',
    mutate: ({ artifact, specLines }) => {
      const next = structuredClone(artifact);
      next.pins.enumerations[0].ranges = [[100, 200]];
      return { artifact: next, specLines };
    },
  },
  {
    name: 'block-partition-overlaps',
    check: 'block-partition-rederives',
    mutate: ({ artifact, specLines }) => {
      const next = structuredClone(artifact);
      next.pins.blocks[1].firstLine = next.pins.blocks[0].lastLine;
      return { artifact: next, specLines };
    },
  },
  {
    name: 'step-loses-its-contract',
    check: 'step-carries-four-fields',
    mutate: ({ artifact, specLines }) => {
      const next = structuredClone(artifact);
      delete next.steps[0].contract;
      return { artifact: next, specLines };
    },
  },
  {
    name: 'neighbour-chosen-by-coverage',
    check: 'neighbour-cites-inside-span',
    mutate: ({ artifact, specLines }) => {
      const next = structuredClone(artifact);
      const entry = next.sequences.find((candidate) => candidate.outcome === 'viaNeighbour');
      entry.neighbour = next.sequences.find((candidate) => candidate.kind === 'neighbour' && candidate.id !== entry.neighbour).id;
      return { artifact: next, specLines };
    },
  },
  {
    name: 'declared-section-drifts-from-the-partition',
    check: 'sections-agree-with-blocks',
    mutate: ({ artifact, specLines }) => {
      const next = structuredClone(artifact);
      next.sections[0].lastLine = next.sections[0].lastLine + 1;
      return { artifact: next, specLines };
    },
  },
  {
    name: 'section-loses-its-ruling-and-its-entry',
    check: 'census-every-section-explained',
    mutate: ({ artifact, specLines }) => {
      const next = structuredClone(artifact);
      next.adjudications = next.adjudications.filter((row) => row.subject !== 's10');
      return { artifact: next, specLines };
    },
  },
  {
    name: 'operation-position-outside-the-declared-set',
    check: 'every-operation-placed',
    mutate: ({ artifact, specLines }) => {
      // The row that carries the defect is the artifact's own first operation. Naming a row
      // from this file would make the case unrunnable on any specification whose operations
      // are named otherwise, which is the whole of them but the fixture.
      const next = structuredClone(artifact);
      next.operations[0].position = 'floating';
      return { artifact: next, specLines };
    },
  },
  {
    name: 'step-names-an-operation-nobody-declares',
    check: 'every-operation-reached',
    mutate: ({ artifact, specLines }) => {
      const next = structuredClone(artifact);
      next.steps[0].operation = 'Invented';
      return { artifact: next, specLines };
    },
  },
]);

/** The counter-mutations: edits that are correct but different, and must stay green. */
export const COUNTER_MUTATION_CORPUS = Object.freeze([
// [::TICKET::] PX-246 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-246 --for-spec --no-implementation-order`.
  {
    name: 'predicate-limbs-reordered',
    mutate: ({ artifact, specLines }) => {
      const next = structuredClone(artifact);
      next.pins.predicate.limbs = [...next.pins.predicate.limbs].reverse();
      return { artifact: next, specLines };
    },
  },
  {
    name: 'step-order-preserved-fields-rewritten',
    mutate: ({ artifact, specLines }) => {
      const next = structuredClone(artifact);
      next.steps = next.steps.map((step) => ({ ...step, contract: `${step.contract} ` }));
      return { artifact: next, specLines };
    },
  },
  {
    name: 'sections-reordered-within-the-partition',
    mutate: ({ artifact, specLines }) => {
      const next = structuredClone(artifact);
      next.sections = [...next.sections].reverse();
      return { artifact: next, specLines };
    },
  },
  {
    name: 'ruling-reason-rewritten',
    mutate: ({ artifact, specLines }) => {
      const next = structuredClone(artifact);
      next.adjudications = next.adjudications.map((row) => ({ ...row, reason: `${row.reason} ` }));
      return { artifact: next, specLines };
    },
  },
  {
    name: 'operations-reordered-with-their-positions',
    mutate: ({ artifact, specLines }) => {
      const next = structuredClone(artifact);
      next.operations = [...next.operations].reverse();
      return { artifact: next, specLines };
    },
  },
  {
    name: 'step-rebound-to-another-declared-operation',
    mutate: ({ artifact, specLines }) => {
      // Two steps that already carry an operation exchange theirs. What each step reaches
      // changes and the set of reached operations does not, so the run stays correct — and
      // the pair is drawn from the artifact, so no name is written into this file.
      const next = structuredClone(artifact);
      const bearing = next.steps.filter((step) => typeof step.operation === 'string' && step.operation !== '');
      if (bearing.length >= 2) {
        [bearing[0].operation, bearing[1].operation] = [bearing[1].operation, bearing[0].operation];
        return { artifact: next, specLines };
      }
      if (bearing.length === 1) {
        // A document that binds one step has only one relation to preserve, so the exchange
        // has nothing to exchange. Renaming the operation in both places is correct and
        // different on any artifact: every step still names a declared operation, and the
        // vocabulary is one no case in this file wrote down.
        const [only] = bearing;
        const operation = next.operations.find((candidate) => candidate.id === only.operation);
        if (operation === undefined) throw new Error(`the only bound step names ${only.operation}, which the artifact does not declare`);
        only.operation = `${operation.id}Rebound`;
        operation.id = only.operation;
        return { artifact: next, specLines };
      }
      throw new Error('the artifact binds no step to an operation, so the relation this case preserves does not exist');
    },
  },
]);

/** A stable digest of the trees the corpus reads, so restoration is measured. */
export function digestOfTree(root) {
  const hash = createHash('sha256');
  const walk = (directory, prefix) => {
    for (const name of readdirSync(directory).sort()) {
      const full = join(directory, name);
      const relative = `${prefix}/${name}`;
      if (statSync(full).isDirectory()) walk(full, relative);
      else hash.update(relative).update(readFileSync(full));
    }
  };
  walk(root, '');
  return hash.digest('hex');
}

/**
 * Run one case and report both directions.
 *
 * @returns {{name: string, red: boolean, attributable: boolean, reddenedCheck: string|null,
 *            counterGreen: boolean, restored: boolean, reason: string|null}}
 */
export function runCase(testCase, { artifact, specLines, fixtureRoot }) {
  const before = digestOfTree(fixtureRoot);
  const mutated = testCase.mutate({ artifact: structuredClone(artifact), specLines: [...specLines] });
  const { verdicts } = checkAll({ specLines: mutated.specLines, artifact: mutated.artifact });
  const reddened = verdicts.map((verdict) => verdict.check);
  const red = reddened.length > 0;
  const attributable = red && reddened.includes(testCase.check);

  const reason = red
    ? (attributable ? null : `unattributable: ${reddened.join(', ')} reddened instead of ${testCase.check}`)
    : 'no-verdict-for-the-named-check';

  return {
    name: testCase.name,
    red,
    attributable,
    reddenedCheck: reddened[0] ?? null,
    counterGreen: !red,
    restored: digestOfTree(fixtureRoot) === before,
    reason,
  };
}

/**
 * Render an artifact into a readable page.
 *
 * The rendering is a view and never a store: nothing reads it back, and the
 * freshness check re-renders and compares bytes rather than comparing parsed fields,
 * so a change in whitespace a reader would not notice still fails.
 */
export function renderArtifact(artifact) {
  const lines = [
    `# ${artifact.spec.path.split('/').at(-1)} — sequences`,
    '',
    `- specification sha256: ${artifact.spec.sha256}`,
    `- specification lines: ${artifact.spec.lines}`,
    `- schema version: ${artifact.schema_version}`,
    '',
    '## Pins',
    '',
    `- predicate line: ${artifact.pins.predicate.line}`,
    `- row schema line: ${artifact.pins.rowSchema.line}`,
    `- enumerations: ${artifact.pins.enumerations.map((entry) => `${entry.name} (${entry.closedness})`).join(', ')}`,
    `- blocks: ${artifact.pins.blocks.length}`,
    '',
    '## Sequences',
    '',
    ...artifact.sequences.map((entry) => `- ${entry.id} ${entry.firstLine}-${entry.lastLine} ${entry.outcome ?? 'unread'}`),
    '',
    '## Steps',
    '',
    ...artifact.steps.map((step) => `- ${step.id} ${step.subject} / ${step.predicate} / ${step.object} / ${step.contract}`),
    '',
    '## Operations',
    '',
    ...artifact.operations.map((operation) => `- ${operation.id} ${operation.position} ${operation.grounding.classification}`),
    '',
    '## Verify',
    '',
    `\`${artifact.verify.command}\` exits ${artifact.verify.expected_exit}`,
    '',
  ];
  return lines.join('\n');
}

/** Report whether a committed rendering is byte-equal to a re-render of the artifact. */
export function checkRenderFreshness({ artifact, committedPath }) {
  if (!existsSync(committedPath)) return { ok: false, files: [`${committedPath} does not exist`] };
  const rendered = Buffer.from(renderArtifact(artifact), 'utf8');
  const committed = readFileSync(committedPath);
  if (rendered.equals(committed)) return { ok: true, files: [] };
  return {
    ok: false,
    files: [`${committedPath} differs from a re-render (${committed.length} bytes committed, ${rendered.length} rendered)`],
  };
}

/**
 * Compare the artifact against a consuming package, in both directions.
 *
 * The two difference sets are reported separately and never summed: an operation the
 * artifact declares and the consumer does not implement is missing work, and one the
 * consumer declares and the artifact does not is an undeclared act — opposite
 * findings that one count would make identical.
 */
export function compareCoverage({ artifact, consumer }) {
  const declared = new Set(artifact.operations.map((operation) => operation.id));
  const implemented = new Set(consumer.declared);
  return {
    declaredNotImplemented: [...declared].filter((id) => !implemented.has(id)).sort(),
    implementedNotDeclared: [...implemented].filter((id) => !declared.has(id)).sort(),
  };
}

/** The ids a rename removed and added, so a rename is a removal plus an addition. */
export function idsRemoved(before, after) {
  const later = new Set(after.operations.map((operation) => operation.id));
  return before.operations.map((operation) => operation.id).filter((id) => !later.has(id));
}

/** The ids a rename added. */
export function idsAdded(before, after) {
  const earlier = new Set(before.operations.map((operation) => operation.id));
  return after.operations.map((operation) => operation.id).filter((id) => !earlier.has(id));
}
