/**
 * The terminal state the three-command chain is supposed to reach, measured.
 *
 * Design §7.3 records the largest unverified item in the document: "Nobody has
 * ever observed a project reaching the terminal state through the reverse
 * rotation. Every statement in §2 is a design claim, not a measurement." This
 * module is the measurement's instrument — it states §2.3's inventory as data,
 * checks a tree against it, compares two terminal states, and renders the
 * outcome.
 *
 * Two rules shape everything here. **An exit code is not evidence that a
 * structure is complete**: the inventory is asserted against the declared list,
 * never against whatever the run happened to produce. And **a difference of zero
 * is a signal, not health**: §2.4 records that "a difference of zero, or a
 * disagreement of zero, can be a signal of abnormality rather than of health",
 * so a comparison reports its zeroes rather than reporting a clean run.
 *
 * Nothing here decides whether the reverse engineering succeeded. The machine's
 * vocabulary is `proved` and `not proved` and nothing else, the L0-L3 ladder is
 * reported as a position rather than a grade, and only L3 may be called success
 * — which is a human's judgement after several rounds, not one run's output.
 *
 * `proved` is the narrower claim: it states that a measured tree satisfied §2.3's
 * inventory, so the terminal state was reached and measured at all. It says nothing
 * about whether the patterns converge, which is the judgement L3 reserves and this
 * module is built not to make.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The bytes a decisions input is written as.
 *
 * One function produces them for both the writer and the digest, because the two
 * disagreeing is invisible: a digest taken over `JSON.stringify(skeleton)` names
 * bytes that are never on disk while the file holds the indented form, and nothing
 * about the record looks wrong. Both describe the same object, so the record
 * appears consistent and only a reader who opens the file finds it does not
 * describe what is there.
 *
 * What is lost when they disagree is the field's whole purpose. The observation
 * records the input a run read so that a later reader can tell whether the
 * judgement rested on the input still on disk; a digest of bytes that were never
 * written cannot answer that, and two representatives that read the same skeleton
 * become indistinguishable by the field that exists to name what each one read.
 *
 * @param {unknown} skeleton the decisions input, as the chain's fallback declares it
 * @returns {string} the bytes to write, and the bytes to digest
 */
export function decisionsInputText(skeleton) {
// [::TICKET::] P26-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-1 --for-spec --no-implementation-order`.
  return `${JSON.stringify(skeleton, null, 2)}\n`;
}

/**
 * The digest a record names a decisions input by.
 *
 * @param {unknown} skeleton the decisions input, as the chain's fallback declares it
 * @returns {string} the sha256 of the bytes `decisionsInputText` produces
 */
export function decisionsInputDigest(skeleton) {
// [::TICKET::] P26-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-1 --for-spec --no-implementation-order`.
  return createHash('sha256').update(decisionsInputText(skeleton), 'utf8').digest('hex');
}

/**
 * The §2.3 inventory, as data.
 *
 * The fourth layer is the package's own RFC material; the fifth is what the two
 * downstream commands add. They are declared separately because a tree can
 * reach the fourth layer and stop, and that is a different outcome from never
 * having started.
 */
export const TERMINAL_ARTEFACTS = Object.freeze({
  root: Object.freeze([
    'RFC-ROOT.md',
    'RFC-ROOT-GRAPH.json',
    'RFC-ROOT-Dirs-Tree.json',
    'RFC-ROOT-GRAPHIFY-Status.json',
    'RFC-ROOT-BOUNDIFY-Status.json',
    'RFC-ROOT-SPLIT-Status.json',
    'Tickets.json',
  ]),
  fifthLayer: Object.freeze([
    'WORKSPACIFY-TREE-MANIFEST.json',
    'WORKSPACIFY-ALLOCATE-MANIFEST.json',
    'ARCHITECTURE-DELTA.json',
    'DesignTree.json',
  ]),
  /** Names in a package directory that do not vary with the package's own name. */
  package: Object.freeze([
    'Tickets.json',
  ]),
  /** Names in a package directory that carry the package's own name. */
  packageNamed: Object.freeze([
    'RFC-{package}.md',
    'RFC-{package}-GRAPH.json',
    'RFC-{package}-Dirs-Tree.json',
    'RFC-{package}-GRAPHIFY-Status.json',
    'RFC-{package}-BOUNDIFY-Status.json',
    'RFC-{package}-SPLIT-Status.json',
  ]),
  /** The fifth layer's per-package artefact: one seed, written by the allocate command. */
  packageFifthLayer: Object.freeze(['RFC-SEED.md']),
});

/** The gate a reverse run refuses through when the plan and the tree disagree. */
export const ALLOCATE_REFUSAL_GATE = 'A1';

/**
 * The ladder §§5.9 declares, weakest first, with L3 the only position a human
 * may call success. It is a sequence of positions rather than a score.
 */
export const LADDER_POSITIONS = Object.freeze(['L0', 'L1', 'L2', 'L2.5', 'L3']);

/**
 * The machine's whole vocabulary for the outcome: two values, and nothing else.
 *
 * §5.9 says it in as many words. A third word — a grade, a percentage, a verdict —
 * would look objective while encoding a threshold nobody chose (`ABOUT-REVERSE`
 * §7.7.2), so `renderTerminalStateReport` refuses one rather than rendering it.
 */
export const TERMINAL_OUTCOMES = Object.freeze(['proved', 'not proved']);

/** The caveat that both permits the word `success` and denies it to everything but L3. */
const L3_CAVEAT =
  'Only L3 may be called success, and that judgement is a human’s, taken after several rounds. This '
  + 'report states a position rather than a grade and reaches no conclusion about the project.';

/**
 * The report's statement of where its own reach ends.
 *
 * A reader who cannot see the instrument's limit will assume there is none, and this
 * observation has one the record shows plainly: no representative reached the
 * terminal state, so the comparison has nothing to compare. Stated as a limit of the
 * instrument, that is a measurement. Left unstated, the same fact reads as a property
 * of the projects measured — which is the reading §7.3's own history warns against.
 */
const INSTRUMENT_LIMIT =
  'Where a representative stopped short, the record names the stage that refused it. A gap here is a '
  + 'limitation of the instrument rather than evidence about the project: it says this observation did '
  + 'not produce a terminal state to measure, not that the project has none.';

/** The verdict a caller that measured nothing is given, so the report still names a position. */
const LADDER_UNREPORTED = Object.freeze({
  ladder: Object.freeze({ position: 'L0' }),
  stages: null,
  outcome: 'not proved',
});


/** True when a path exists and is a directory. */
// [::TICKET::] P24-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-8 --for-spec --no-implementation-order`.
function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The two questions the scope list can answer, named so a reader can tell them apart.
 *
 * The design records what reading one as evidence about the other costs: an earlier
 * reading of `measureExistingDirectories` as evidence about `measureDirectoryTree`
 * produced a wrong conclusion about root ownership, because the two answer different
 * questions. A state that did not say which source produced its scope would put the
 * same mistake one call away.
 */
export const SCOPE_SOURCES = Object.freeze({
  PARTITION: 'partition',
  DIRECTORY_WALK: 'directory-walk',
});

/**
 * The label the root's artefacts are recorded under.
 *
 * A label rather than a path: the root has no name of its own, and `.` is the path a
 * partition uses for the package that *is* the root. Both reach the same eleven
 * artefacts, and spelling the label as a path would invite `join(root, '.', a)`.
 */
const ROOT_SCOPE = 'root';

/** The path a declared partition gives the package that is the tree's own root. */
const ROOT_PACKAGE_PATH = '.';

/** Whether a declared package path names the root rather than a directory under it. */
// [::TICKET::] P25-3, P25-4, P25-5, P25-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P25-3|P25-4|P25-5|P25-6) --for-spec --no-implementation-order`.
function isRootPackagePath(path) {
  return path === ROOT_PACKAGE_PATH || path === '';
}

/**
 * The directories under a root, as the fallback scope when no partition is declared.
 *
 * This is the fallback and the name says so. It cannot know the partition: it sees
 * every directory, so a build output directory is a package to it. `siprs-for-reverse`
 * carries an ignored `target/`, and this walk counts it — which is why the partition
 * is the source of record where one exists, and why the state records which source
 * produced the scope it reports.
 */
// [::TICKET::] P24-8, P25-3, P25-4, P25-5, P25-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P24-8|P25-3|P25-4|P25-5|P25-6) --for-spec --no-implementation-order`.
function directoriesUnder(root) {
  try {
    return readdirSync(root)
      .filter((entry) => isDirectory(join(root, entry)))
      .filter((entry) => !entry.startsWith('.'))
      .sort();
  } catch {
    return [];
  }
}

/**
 * The packages a declared partition names, as `{name, path}` pairs.
 *
 * A partition entry carries both because the two are used for different things: the
 * path is where the package's directory is, and the name is the identifier its
 * artefacts carry. `RFC-{package}.md` is named after the identifier, not after the
 * directory, and the two differ as soon as a package is nested — `src-api` is the
 * name of the package at `src/api`.
 *
 * An entry without both is dropped rather than guessed at: a partition that cannot
 * say where a package is cannot be measured against, and inventing a path from the
 * name would produce a scope that looks checked and is not.
 *
 * @param {Array<{name: string, path: string}>|null|undefined} partition
 * @returns {Array<{name: string, path: string}>}
 */
// [::TICKET::] P25-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-3 --for-spec --no-implementation-order`.
export function packagesFromPartition(partition) {
  if (!Array.isArray(partition)) return [];
  return partition
    .filter((entry) => entry && typeof entry.name === 'string' && typeof entry.path === 'string')
    .map((entry) => ({ name: entry.name, path: entry.path }));
}

/**
 * True when the tree holds the artefact a scope names.
 *
 * The root's artefacts sit directly under it; every other scope is a package
 * directory, so the artefact is looked for one level in. Spelled once here because
 * the two paths are the whole content of the check and a reader has to see both to
 * know which one a given scope takes. The scope is a path — `src/api` for a nested
 * package — or the root label for the eleven the root owes.
 */
// [::TICKET::] P24-12, P25-3, P25-4, P25-5, P25-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P24-12|P25-3|P25-4|P25-5|P25-6) --for-spec --no-implementation-order`.
function artefactExists(root, { scope, artefact }) {
  return existsSync(scope === ROOT_SCOPE ? join(root, artefact) : join(root, scope, artefact));
}

/**
 * The state one representative's tree is in, against §2.3's list.
 *
 * `missing` is the finding: it names the scope and the artefact, so a tree that
 * stopped short says where. `complete` is `missing.length === 0` and nothing
 * else — never an exit code, and never an inference from the documents a run
 * happened to publish.
 *
 * The scope is the partition a caller declares, and the directory walk only when no
 * partition is declared. `partition` being null and being `[]` are different answers:
 * null says nothing declared the packages and the walk stands in, while an empty list
 * says the partition declared none — which is a measurement of a tree whose root is
 * all there is, not a reason to look at its directories instead.
 *
 * The state says which source produced its scope. Two readings that answer different
 * questions are one call apart here, and the design records what confusing them cost
 * the last time it happened.
 *
 * @param {{root: string, manifest?: object|null, partition?: Array<{name: string, path: string}>|null}} params
 * @returns {object} the measured state
 */
export function measureTerminalState({ root, manifest = null, partition = null } = {}) {
  if (typeof root !== 'string' || root.length === 0) {
    throw new Error('measureTerminalState needs the tree root it measures');
  }

  const missing = [];
  const present = [];
  const record = (scope, artefact) => {
    const entry = { scope, artefact };
    (artefactExists(root, entry) ? present : missing).push(entry);
  };

  for (const artefact of TERMINAL_ARTEFACTS.root) record(ROOT_SCOPE, artefact);
  for (const artefact of TERMINAL_ARTEFACTS.fifthLayer) record(ROOT_SCOPE, artefact);

  const declared = partition === null ? null : packagesFromPartition(partition);
  const scopes = declared === null
    ? directoriesUnder(root).map((name) => ({ name, path: name }))
    : declared;
  const scopeSource = declared === null ? SCOPE_SOURCES.DIRECTORY_WALK : SCOPE_SOURCES.PARTITION;

  const packages = [];
  for (const scope of scopes) {
    packages.push(isRootPackagePath(scope.path) ? ROOT_PACKAGE_PATH : scope.path);
    // The package that is the root has no per-package rows: its material carries the
    // root's names, and adding eight more would count the same directory twice.
    if (isRootPackagePath(scope.path)) continue;

    for (const artefact of TERMINAL_ARTEFACTS.package) record(scope.path, artefact);
    for (const template of TERMINAL_ARTEFACTS.packageNamed) {
      record(scope.path, template.replace('{package}', scope.name));
    }
    for (const artefact of TERMINAL_ARTEFACTS.packageFifthLayer) record(scope.path, artefact);
  }

  return {
    root,
    packages,
    scopeSource,
    present,
    missing,
    complete: missing.length === 0,
    // The prior partition a pattern-2 subject already carried. Read as material
    // and as the prior a difference is taken against — never as the answer.
    prior: manifest?.workspace?.tree ?? null,
    manifestPresent: manifest !== null,
  };
}

/** The artefact names a state holds, per package, with the root's under `''`. */
// [::TICKET::] P24-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-8 --for-spec --no-implementation-order`.
function artefactNamesOf(state) {
  const byPackage = {};
  for (const entry of state.present) {
    const key = entry.scope === 'root' ? '' : entry.scope;
    if (!byPackage[key]) byPackage[key] = [];
    byPackage[key].push(entry.artefact);
  }
  for (const key of Object.keys(byPackage)) byPackage[key].sort();
  return byPackage;
}

/**
 * Compare two or more terminal states, dimension by dimension.
 *
 * Every dimension is reported for every representative, including the ones that
 * agree — which is the whole point of §2.4's rule. `differences` names what
 * differs and against which representative; `reported` carries the zeroes beside
 * them, because a comparison that printed only the differences would leave a
 * reader unable to tell agreement from a dimension nobody measured.
 *
 * @param {ReadonlyArray<object>} states - measured states, each naming its representative
 * @returns {object} the comparison
 */
export function compareTerminalStates(states) {
  if (!Array.isArray(states)) {
    throw new Error('compareTerminalStates needs the states it compares');
  }

  const representatives = states.map((state) => state.representative);
  const packagePaths = {};
  const artefactNames = {};
  const gates = {};
  for (const state of states) {
    packagePaths[state.representative] = [...state.packages];
    artefactNames[state.representative] = artefactNamesOf(state);
    gates[state.representative] = state.gates ?? {};
  }

  const differences = [];
  const reported = [];
  const dimensions = [
    { dimension: 'packagePaths', value: (state) => JSON.stringify(state.packages) },
    { dimension: 'artefactNames', value: (state) => JSON.stringify(artefactNamesOf(state)) },
  ];

  for (const { dimension, value } of dimensions) {
    // The distinct renderings, in the order the representatives were measured, so the
    // first entry is the reference the others are reported against and equal structures
    // collapse into one. An empty comparison has no representatives at all, so there is
    // nobody to stand apart and no reference to name.
    const distinct = states.length === 0
      ? []
      : [...new Map(states.map((state) => [value(state), state.representative])).entries()];
    const [reference] = distinct;
    reported.push({ dimension, value: Math.max(distinct.length - 1, 0) });
    for (const [, representative] of distinct.slice(1)) {
      differences.push({
        representative,
        dimension,
        artefact: dimension,
        detail: `${representative} differs from ${reference[1]} on ${dimension}`,
      });
    }
  }

  const gateNames = [...new Set(Object.values(gates).flatMap((entry) => Object.keys(entry)))].sort();
  for (const gate of gateNames) {
    const outcomes = new Set(states.map((state) => gates[state.representative]?.[gate] ?? 'not-reported'));
    reported.push({ dimension: 'gates', artefact: gate, value: outcomes.size === 1 ? 0 : outcomes.size - 1 });
    if (outcomes.size > 1) {
      for (const state of states) {
        differences.push({
          representative: state.representative,
          dimension: 'gates',
          artefact: gate,
          detail: `${state.representative} reports ${gates[state.representative]?.[gate] ?? 'not-reported'} for ${gate}`,
        });
      }
    }
  }

  return { representatives, packagePaths, artefactNames, gates, differences, reported };
}

/**
 * Summarise the stage records a run published.
 *
 * A stage that refused is named with its input rather than worked around: the
 * chain either reached every declared stage or it did not, and a summary that
 * omitted the refusing stage would report a broken run as a short one.
 */
export function summariseStages(records) {
  const list = Array.isArray(records) ? records : [];
  const reached = list.filter((entry) => entry.status !== 'refused').map((entry) => entry.stage);
  const refused = list
    .filter((entry) => entry.status === 'refused')
    .map((entry) => ({ stage: entry.stage, input: entry.input ?? null }));
  return { reached, refused, complete: refused.length === 0 && list.length > 0 };
}

/**
 * The outcome, derived from what was measured rather than declared.
 *
 * `proved` is not a grade and not a claim about the project: it states that at least
 * one measured tree satisfied §2.3's declared inventory, so the terminal state was
 * reached and measured at all — which is the one fact this observation can establish
 * and the fact §7.3 recorded as never established. Everything else is `not proved`,
 * including the case a run exited zero and left the tree short an element, because an
 * exit code is evidence that a program finished and never evidence of completeness.
 *
 * @param {ReadonlyArray<object>} states - the measured terminal states
 * @returns {'proved'|'not proved'}
 */
export function outcomeOf(states = []) {
  return Array.isArray(states) && states.some((state) => state?.complete === true) ? 'proved' : 'not proved';
}

/**
 * What each measured state holds and what it is short of, as the report's table.
 *
 * The missing artefacts are rows beneath their representative rather than a count,
 * because the finding is *which* element of §2.3 the tree does not hold: a reader
 * checking the claim needs the name, and a bare total would have them re-run the
 * measurement to recover it. The scope names where the artefact was looked for, so a
 * tree that stopped at one layer reads differently from one that never began.
 */
// [::TICKET::] P24-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-12 --for-spec --no-implementation-order`.
function stateTable(states) {
  if (states.length === 0) return ['No representative reached the terminal state in this observation.', ''];

  const rows = ['| Representative | Packages | Missing artefacts |', '|---|---|---|'];
  for (const state of states) {
    rows.push(`| ${state.representative} | ${state.packages.length} | ${state.missing.length} |`);
    for (const entry of state.missing) {
      rows.push(`| | ${entry.scope} | ${entry.artefact} |`);
    }
  }
  rows.push('');
  return rows;
}

/**
 * The outcome, rendered.
 *
 * The paragraph under the table is the instrument's own vocabulary: `proved` or
 * `not proved`, the ladder position as a position, and the statement that the
 * judgement is a human's. `omission 0` is reported as material and never as the
 * success condition, because §5.9 says in as many words that it is not.
 *
 * The verdict inputs travel together: an outcome is only meaningful against the ladder
 * position and the stage summary that produced it, and passing one without the others
 * is how a report comes to state a judgement its own measurement does not support.
 *
 * @param {{states: ReadonlyArray<object>, comparison: object|null, verdict?: {ladder: object, stages: object|null, outcome: string}}} params
 * @returns {string} the report
 * @throws {TypeError} when the outcome is not one of `TERMINAL_OUTCOMES`
 */
export function renderTerminalStateReport({ states = [], comparison = null, verdict = null } = {}) {
  const { ladder, stages, outcome } = verdict ?? LADDER_UNREPORTED;
  if (!TERMINAL_OUTCOMES.includes(outcome)) {
    throw new TypeError(`the outcome must be one of TERMINAL_OUTCOMES (${TERMINAL_OUTCOMES.join(' / ')}); make the observation state it, rather than asserting one: got ${JSON.stringify(outcome)}`);
  }

  return [
    '# Terminal state',
    '',
    ...stateTable(states),
    ...stageSection(stages),
    ...comparisonSection(comparison),
    ...outcomeSection({ ladder, outcome }),
  ].join('\n');
}

/**
 * The stages the chain ran, each refusal named with the input it was handed.
 *
 * A summary that omitted the refusing stage would report a broken run as a short one,
 * so the refusals are listed rather than counted and the input is quoted beside the
 * stage — an operator reading the report learns where the chain stopped and on what,
 * without re-running the command to find out.
 */
// [::TICKET::] P24-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-12 --for-spec --no-implementation-order`.
function stageSection(stages) {
  if (stages === null) return [];

  const lines = ['## Stages', '', `Reached: ${stages.reached.join(', ') || 'none'}.`];
  for (const refused of stages.refused) {
    lines.push(`- \`${refused.stage}\` refused, with input \`${JSON.stringify(refused.input)}\`.`);
  }
  return [...lines, ''];
}

/**
 * The comparison, with its zeroes reported beside its differences.
 *
 * §2.4's rule is the shape of this section: a dimension where nothing differs is
 * reported as a signal, not dropped, because a table that printed only the differences
 * would leave a reader unable to tell agreement from a dimension nobody measured.
 */
// [::TICKET::] P24-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-12 --for-spec --no-implementation-order`.
function comparisonSection(comparison) {
  if (comparison === null) return [];

  // A comparison over no representatives has nothing to put in the table, and its
  // zeroes are not the agreement §2.4 warns about reading as health — they are the
  // absence of anyone to compare. Rendering them as agreement would report the
  // observation's own shortfall as a property of the structures.
  if (comparison.representatives.length === 0) {
    return [
      '## The comparison',
      '',
      'There is nothing to compare: no structure was measured, which is the finding above and not a '
        + 'result about the structures. The dimensions are reported as zero because nobody reached the '
        + 'terminal state, never because two structures were found to agree.',
      '',
    ];
  }

  const lines = [
    '## The comparison',
    '',
    'Every dimension is reported for every representative, including where the value is zero.',
    '',
    '| Dimension | Representative | Value |',
    '|---|---|---|',
  ];
  for (const entry of comparison.reported) {
    lines.push(`| ${entry.dimension}${entry.artefact ? ` (${entry.artefact})` : ''} | all | ${entry.value} |`);
  }
  lines.push('');

  if (comparison.differences.length === 0) {
    return [...lines,
      'The structures agree on every dimension measured. A difference of zero is reported here as a '
        + 'signal rather than as health: it says these representatives were compared and no difference '
        + 'was found, not that the comparison was skipped.',
      ''];
  }

  lines.push('The differences below are recorded, not resolved. A recorded difference is not a contradiction.', '');
  for (const difference of comparison.differences) {
    lines.push(`- \`${difference.representative}\` — ${difference.artefact}: ${difference.detail}`);
  }
  return [...lines, ''];
}

/**
 * The outcome, and the material a human judges it against.
 *
 * The machine states a position and stops. `omission 0` is reported as material and
 * never as the success condition, because §5.9 says in as many words that it is not.
 */
// [::TICKET::] P24-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-12 --for-spec --no-implementation-order`.
function outcomeSection({ ladder, outcome }) {
  const lines = ['## The outcome', '', `Outcome: ${outcome}.`, '', INSTRUMENT_LIMIT, ''];
  lines.push(`Ladder position reached: \`${ladder.position}\`.`, '');
  lines.push(L3_CAVEAT, '');
  if (ladder.omissionZero !== undefined) {
    lines.push(
      `\`omission 0\` result: ${JSON.stringify(ladder.omissionZero)}. It is material for the human’s `
        + 'decision and is not the success condition.',
      '',
    );
  }
  if (ladder.residue !== undefined) {
    lines.push(`Residue: ${JSON.stringify(ladder.residue)}.`, '');
  }
  return lines;
}
