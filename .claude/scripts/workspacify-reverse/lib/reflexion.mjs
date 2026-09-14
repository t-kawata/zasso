// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
/**
 * Card-driven Reflexion Modelling — the logical architecture as a choice (§7.4 item 9).
 *
 * An existing project's directories are a fact about its history. Treating them
 * as the architecture freezes that history into the canonical record as if it
 * had been designed, which is failure mode F14, and the record then defends the
 * accident forever. So the machine does not ask the human to author a model. It
 * derives several candidate partitions from the measurements it already holds,
 * states what each one costs and what would refute it, and the human adjudicates
 * between them — a bounded choice instead of an open-ended design task.
 *
 * Two properties are load-bearing and are enforced here rather than promised:
 *
 *   - **No candidate is ever removed.** Generation and adjudication are separate
 *     functions over immutable values, so "no option was lost" is checkable by
 *     counting. A candidate nobody decided stays `unresolved`.
 *   - **A card is answerable by choosing.** A card whose options are empty can
 *     only be answered in prose, which hands the judgement back to the machine
 *     without saying so. `assertCardIsAdjudicable` refuses it (7.4.1).
 *
 * The disagreements this produces are recorded in `ARCHITECTURE-DELTA.json`,
 * which P22-11's T5 already judges: a mismatch nobody wrote down is a FAIL, and
 * a run with zero mismatches still requires the record to exist. That vocabulary
 * is imported rather than restated, so the phase has one definition of it.
 *
 * Candidates are anchored on the `mappedNodeIds` chain the forward index already
 * carries (`rfc-graph/boundify-helpers.js`), not in a structure beside it.
 *
 * Note on naming: `semantics.mjs` also exports a `generateCandidates`, which
 * derives *state machine* candidates from R3 facts. This one derives *partition*
 * candidates from the R1 and R2 measurements. They are different stages over
 * different material and neither reuses the other's output.
 */
import { compareText } from './holdout-ledger.mjs';
import { CARD_FIELDS, CARD_SUBJECT_KINDS, HAND_TO_GRILL } from './packet.mjs';
import { mismatchKey } from '../../workspacify-tree/lib/architecture-delta.mjs';

/** The mechanical rules a candidate logical model can be derived from. */
export const CANDIDATE_RULES = Object.freeze([
  // The layout as measured. It is present so that "the layout is the architecture"
  // is a visible option with a stated cost, rather than an invisible default.
  'physical_faithful',
  // The directories the measured import graph ties into a cycle become one unit.
  'cycle_collapsed',
  // The first path segment becomes the unit — the coarsest split the layout offers.
  'depth_collapsed',
]);

/** A candidate is never removed; one nobody decided stays here. */
export const ADJUDICATION_STATES = Object.freeze(['unresolved', 'resolved']);

/** The ways a candidate can disagree with the measured layout. */
export const MISMATCH_KINDS = Object.freeze(['merged', 'missing', 'extra']);

/**
 * The measured layout as a partition: one group per directory the measurement
 * placed at least one file in.
 *
 * A directory with no measured files is not an empty group — it is not a unit at
 * all, because no measurement ever spoke about it. The physical unit is the
 * directory, not the file: the question a candidate answers is which directories
 * belong together.
 *
 * @param {{packages?: Array<{directory: string, files?: string[]}>}} structure - R1
 * @returns {{groups: Array<{name: string, members: string[]}>}}
 */
export function physicalPartition(structure) {
  const groups = (structure?.packages ?? [])
    .filter((entry) => Array.isArray(entry.files) && entry.files.length > 0)
    .map((entry) => ({ name: entry.directory, members: [entry.directory] }))
    .sort((left, right) => compareText(left.name, right.name));
  return { groups };
}

/**
 * Index the `mappedNodeIds` chain a Dirs-Tree carries, keyed by directory path.
 *
 * `trees` is keyed by language, but the node under that key is the top-level
 * *directory* the tree partitions and its name is the first segment of every
 * path: in `RFC-ROOT-Dirs-Tree.json` the key is `rust` and the node is `src`, so
 * the paths the tree maps are `src/api`, `src/model`. Those are exactly the paths
 * `dependencyDirections` in the same file names, which is the check that keeps
 * the two readings of the tree from drifting apart.
 *
 * @param {{trees?: object}} dirsTree
 * @returns {Map<string, Array<{nodeId: string, title?: string}>>}
 */
export function mapDirNodes(dirsTree) {
  const index = new Map();
  for (const root of Object.values(dirsTree?.trees ?? {})) {
    if (typeof root?.name === 'string') indexNode(root, '', index);
  }
  return index;
}

/** Walk one node and its descendants, carrying the path down from the root directory. */
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
function indexNode(node, parentPath, index) {
  const path = parentPath === '' ? node.name : `${parentPath}/${node.name}`;
  const mapped = Array.isArray(node.mappedNodeIds) ? node.mappedNodeIds : [];
  if (mapped.length > 0) index.set(path, mapped);
  for (const child of node.children ?? []) indexNode(child, path, index);
}

/**
 * Generate candidate logical models mechanically from the R1 and R2 measurements.
 *
 * @param {{structure?: object, dependencies?: object, dirsTree?: object}} measurements
 * @returns {Array<object>} one candidate per rule in `CANDIDATE_RULES`
 */
export function generateCandidates({ structure, dependencies, dirsTree } = {}) {
  const physical = requireMeasurements({ structure, dependencies });
  const directories = physical.groups.map((group) => group.name);
  const measured = {
    physical,
    directories,
    dependencies,
    cycles: measuredCycles(dependencies, directories),
    nodes: mapDirNodes(dirsTree),
  };

  return CANDIDATE_RULES.map((rule) => buildCandidate(rule, measured));
}

/**
 * Refuse a run whose measurements are not there.
 *
 * C001's precondition is that R1 and R2 exist. Three empty candidates when they
 * do not would read as "the layout was examined and it partitions three ways",
 * which is the one thing an empty answer must never be mistaken for, so the
 * absence is raised rather than absorbed.
 */
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
function requireMeasurements({ structure, dependencies }) {
  const physical = physicalPartition(structure);
  if (physical.groups.length === 0) {
    throw new Error(
      'candidate generation consumes the R1 structure measurement and it placed no directory, so there is '
      + 'nothing to partition',
    );
  }
  if (!Array.isArray(dependencies?.edges)) {
    throw new Error(
      'candidate generation consumes the R2 dependency measurement and it carries no edges array, so the '
      + 'candidates would be derived from half the evidence',
    );
  }
  return physical;
}

/** The measured cycles, narrowed to the directories this measurement actually placed. */
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
function measuredCycles(dependencies, directories) {
  const placed = new Set(directories);
  return (dependencies?.cycles ?? [])
    .map((cycle) => cycle.filter((name) => placed.has(name)).sort(compareText))
    .filter((cycle) => cycle.length > 1);
}

/** Assemble one candidate: its groups, the evidence for it, and what would refute it. */
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
function buildCandidate(rule, measured) {
  const groups = groupedByRule(rule, measured.directories, measured.cycles).map((members) => {
    const sorted = [...members].sort(compareText);
    return {
      // A group is named by its first member, so the name is derived from the
      // measurement rather than invented by this module.
      name: sorted[0],
      members: sorted,
      mappedNodeIds: mappedNodesFor(sorted, measured.nodes),
    };
  });
  assertIsPartition(groups, measured.directories);

  return {
    candidate_id: `cand-${rule.replace(/_/g, '-')}`,
    derivedFrom: rule,
    propositions: propositionsFor(groups),
    groups: groups.sort((left, right) => compareText(left.name, right.name)),
    evidence: evidenceFor(rule, measured),
    counterexamples: counterexamplesFor(rule, measured),
    adjudication: ADJUDICATION_STATES[0],
    physical: measured.physical,
  };
}

/**
 * A candidate is a partition of the measured directories, or it is not a candidate.
 *
 * Every directory belongs to exactly one logical unit. A directory in two groups
 * means the card the human answers and the mismatch the delta records can name
 * different units for it, and a directory in none means it silently leaves the
 * record — both are answers to a question nobody asked. The check is here rather
 * than in each rule so that a rule added later inherits it.
 */
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
function assertIsPartition(groups, directories) {
  const members = groups.flatMap((group) => group.members);
  const unique = new Set(members);

  if (unique.size !== members.length) {
    const repeated = [...new Set(members.filter((member, index) => members.indexOf(member) !== index))];
    throw new Error(
      `the candidate places ${repeated.sort(compareText).join(', ')} in more than one group, so it is not a `
      + 'partition of the measured directories',
    );
  }
  const missing = directories.filter((directory) => !unique.has(directory)).sort(compareText);
  if (missing.length > 0) {
    throw new Error(`the candidate leaves ${missing.join(', ')} out of every group, so it is not a partition`);
  }
}

/** Partition the measured directories by the rule's own definition. */
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
function groupedByRule(rule, directories, cycles) {
  if (rule === 'physical_faithful') return directories.map((directory) => [directory]);

  if (rule === 'cycle_collapsed') {
    const merged = new Set();
    const groups = cycles.map((cycle) => {
      for (const member of cycle) merged.add(member);
      return cycle;
    });
    for (const directory of directories) {
      if (!merged.has(directory)) groups.push([directory]);
    }
    return groups;
  }

  const bySegment = new Map();
  for (const directory of directories) {
    const segment = directory.split('/')[0];
    if (!bySegment.has(segment)) bySegment.set(segment, []);
    bySegment.get(segment).push(directory);
  }
  return [...bySegment.values()];
}

/** The union of the nodes every member of a group was mapped to, in node-id order. */
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
function mappedNodesFor(members, nodes) {
  const byId = new Map();
  for (const member of members) {
    for (const mapped of nodes.get(member) ?? []) {
      if (!byId.has(mapped.nodeId)) byId.set(mapped.nodeId, mapped);
    }
  }
  return [...byId.values()].sort((left, right) => compareText(left.nodeId, right.nodeId));
}

/**
 * What the candidate proposes, as one falsifiable proposition per merged group.
 *
 * A candidate that merges two independent sets of directories asserts two
 * things, and 7.4.1's unit is one proposition. Joining them into a single
 * sentence would make the field's name a lie, and half of it could then be
 * answered without the other half being read.
 */
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
function propositionsFor(groups) {
  const merged = groups.filter((group) => group.members.length > 1);
  if (merged.length === 0) return ['every measured directory is a logical unit of its own'];
  return merged.map((group) => `\`${group.members.join('`, `')}\` are one logical unit`);
}

/** The measured facts that support the rule. */
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
function evidenceFor(rule, { directories, cycles, dependencies }) {
  if (rule === 'physical_faithful') {
    return [
      `R1 measured ${directories.length} directories holding at least one file`,
      'this candidate takes each one as a logical unit, which is what the layout already looks like',
    ];
  }
  if (rule === 'cycle_collapsed') {
    return [
      `R2 measured ${cycles.length} import cycle(s) among the packages it placed`,
      ...cycles.map((cycle) => `the cycle ${cycle.join(' -> ')} ties ${cycle.length} directories together`),
    ];
  }
  const edgeCount = (dependencies?.edges ?? []).length;
  return [
    `R2 measured ${edgeCount} import edge(s) across the tree`,
    'this candidate groups by the first path segment, which is the coarsest split the layout offers',
  ];
}

/** The measured facts that would refute the rule. */
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
function counterexamplesFor(rule, { cycles, dependencies }) {
  if (rule === 'physical_faithful') {
    return cycles.length === 0
      ? ['R2 measured no cycle, so nothing in the measurements contradicts the layout here']
      : [
        `the layout keeps ${cycles.flat().length} directories apart that R2 measured inside a cycle`,
      ];
  }
  if (rule === 'cycle_collapsed') {
    return [
      dependencies?.runtime_binding_caveat
        ?? 'an import graph is a hypothesis about coupling, not a measurement of runtime binding',
    ];
  }
  return ['a first path segment is a naming choice; no measurement says it is a logical unit'];
}

/** The group of a candidate that holds a directory, or undefined when none does. */
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
function groupHolding(candidate, directory) {
  return candidate.groups.find((group) => group.members.includes(directory));
}

/**
 * Render the candidates as decision cards, one per measured directory.
 *
 * The options of a card are the distinct groupings the candidates propose for
 * that directory, ordered from the incumbent (it stays as it is) to the most
 * merged. A directory every candidate places identically yields a one-option
 * card, which is a valid card: the unanimity is reported rather than hidden.
 *
 * @param {Array<object>} candidates
 * @returns {{cards: Array<object>, withheld: Array<{directory: string, reason: string}>}}
 */
export function renderAdjudicationCards(candidates) {
  const list = [...(candidates ?? [])];
  if (list.length === 0) return { cards: [], withheld: [] };

  const physical = list[0].physical;
  assertSamePhysical(list, physical);

  const cards = [];
  const withheld = [];
  for (const group of physical.groups) {
    const options = collectOptions(list, group.name);
    if (options.length === 0) {
      withheld.push({
        directory: group.name,
        reason: 'no candidate places this measured directory, so there is nothing to choose between and the '
          + 'directory is a mismatch the delta record must name',
      });
      continue;
    }
    cards.push(buildAdjudicationCard({ directory: group.name, options }));
  }
  return { cards, withheld };
}

/** Every candidate was derived against the same measured layout, or the options are not comparable. */
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
function assertSamePhysical(candidates, physical) {
  const signature = (partition) => (partition?.groups ?? []).map((group) => group.name).join('|');
  const expected = signature(physical);
  for (const candidate of candidates) {
    if (candidate.physical === undefined) {
      throw new Error(`candidate ${candidate.candidate_id} does not record the measured layout it was derived against`);
    }
    if (signature(candidate.physical) !== expected) {
      throw new Error(
        `candidate ${candidate.candidate_id} was derived against a different measured layout, `
        + 'so its options are not comparable with the others',
      );
    }
  }
}

/** The distinct groupings the candidates propose for one directory, incumbent first. */
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
function collectOptions(candidates, directory) {
  const byShape = new Map();
  for (const candidate of candidates) {
    const group = groupHolding(candidate, directory);
    if (group === undefined) continue;
    const members = [...group.members].sort(compareText);
    const shape = members.join('|');
    if (!byShape.has(shape)) {
      byShape.set(shape, {
        members,
        mappedNodeIds: group.mappedNodeIds ?? [],
        rules: [],
        evidence: [],
        counterexamples: [],
      });
    }
    const option = byShape.get(shape);
    option.rules.push(candidate.derivedFrom);
    option.evidence.push(...candidate.evidence);
    option.counterexamples.push(...candidate.counterexamples);
  }

  return [...byShape.values()]
    .map((option) => ({
      ...option,
      rules: option.rules.sort(compareText),
      evidence: [...new Set(option.evidence)].sort(compareText),
      counterexamples: [...new Set(option.counterexamples)].sort(compareText),
    }))
    .sort((left, right) =>
      left.members.length - right.members.length || compareText(left.members.join('|'), right.members.join('|')));
}

/** One card, in the shape the packet already uses, so every surface reads the same card. */
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
function buildAdjudicationCard({ directory, options }) {
  return {
    claim_id: `boundary:${directory}`,
    proposition: `the directory \`${directory}\` is a unit of the logical architecture`,
    question: `Is \`${directory}\` a logical unit in its own right, or does it belong with the directories the `
      + 'measured coupling ties it to?',
    options: options.map(renderOption),
    consequences: options.map(renderConsequence),
    evidence: [...new Set(options.flatMap((option) => option.evidence))].sort(compareText),
    counterexamples: [...new Set(options.flatMap((option) => option.counterexamples))].sort(compareText),
    default: HAND_TO_GRILL,
    scope: directory,
    subjectKind: 'boundary_crossing',
  };
}

/** What one grouping would record, named by the rules that propose it. */
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
function renderOption(option) {
  const unit = option.members.length === 1
    ? `\`${option.members[0]}\` stays a unit of its own`
    : `\`${option.members.join('`, `')}\` become one unit`;
  return `${unit} (${option.rules.join(', ')})`;
}

/** What choosing one grouping costs. */
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
function renderConsequence(option) {
  return option.members.length === 1
    ? `the boundary stays where the layout put it, and the RFC records \`${option.members[0]}\` as a logical unit `
      + `on the strength of ${option.rules.join(', ')}`
    : `the RFC records ${option.members.length} directories as one logical unit, and every measured crossing `
      + `between them becomes an internal detail (${option.rules.join(', ')})`;
}

/**
 * Refuse a card that can only be answered in prose (7.4.1).
 *
 * @param {object} card
 * @returns {object} the same card, so a caller can assert and continue
 */
export function assertCardIsAdjudicable(card) {
  const absent = CARD_FIELDS.filter((field) => card?.[field] === undefined);
  if (absent.length > 0) {
    throw new Error(`a decision card is missing ${absent.join(', ')}, so it cannot be answered by choosing`);
  }
  if (!CARD_SUBJECT_KINDS.includes(card.subjectKind)) {
    throw new Error(
      `the decision card for \`${card.scope}\` names \`${card.subjectKind}\` as its subject kind, which is not one `
      + `of the declared kinds (${CARD_SUBJECT_KINDS.join(', ')}); a vocabulary that accepts anything decides nothing`,
    );
  }
  if (!Array.isArray(card.options) || card.options.length === 0) {
    throw new Error(
      `the decision card for \`${card.scope}\` offers no option, so it can only be answered in prose — `
      + 'which would move the judgement back onto the machine',
    );
  }
  if (!Array.isArray(card.consequences) || card.consequences.length !== card.options.length) {
    throw new Error(
      `the decision card for \`${card.scope}\` must state one consequence per option; it states `
      + `${card.consequences?.length ?? 0} for ${card.options.length}`,
    );
  }
  return card;
}

/**
 * Record the human's choice. Every candidate survives; an undecided one stays unresolved.
 *
 * @param {Array<object>} candidates
 * @param {Record<string, string>} decisions - candidate id to an adjudication state
 * @returns {Array<object>} a new list; the input is not modified
 */
export function adjudicateCandidates(candidates, decisions = {}) {
  return (candidates ?? []).map((candidate) => {
    const decided = decisions[candidate.candidate_id];
    return {
      ...candidate,
      adjudication: ADJUDICATION_STATES.includes(decided) ? decided : ADJUDICATION_STATES[0],
    };
  });
}

/** How many candidates there are, and how the adjudication left them. */
export function countCandidates(candidates) {
  const list = candidates ?? [];
  const resolved = list.filter((candidate) => candidate.adjudication === 'resolved').length;
  return { total: list.length, resolved, unresolved: list.length - resolved };
}

/**
 * Assert that adjudication lost no option.
 *
 * The failure is a loss, either in the count or in the identity of the
 * candidates, and the message names which so the cause is visible.
 *
 * @param {Array<object>} before
 * @param {Array<object>} after
 * @returns {{total: number, resolved: number, unresolved: number}}
 */
export function assertNoCandidateLost(before, after) {
  const expected = countCandidates(before);
  const actual = countCandidates(after);
  if (expected.total !== actual.total) {
    throw new Error(
      `${expected.total - actual.total} candidate model(s) disappeared during adjudication: `
      + `${expected.total} were generated and ${actual.total} remain`,
    );
  }
  const remaining = new Set((after ?? []).map((candidate) => candidate.candidate_id));
  const dropped = (before ?? [])
    .map((candidate) => candidate.candidate_id)
    .filter((candidateId) => !remaining.has(candidateId))
    .sort(compareText);
  if (dropped.length > 0) {
    throw new Error(`candidate model(s) ${dropped.join(', ')} were dropped during adjudication`);
  }
  return actual;
}

/**
 * Every mismatch the candidate produces against the measured layout.
 *
 * One entry per (kind, path), keyed exactly as T5 keys its record, so a
 * difference the delta cannot name is indistinguishable from one nobody derived.
 *
 * @param {object} candidate
 * @param {{groups: Array<{name: string}>}} physical
 * @returns {Array<{kind: string, path: string, layer: string|null, candidate_id: string, mappedNodeIds: Array<object>}>}
 */
export function deriveMismatches(candidate, physical) {
  const measured = new Set(physical.groups.map((group) => group.name));
  const placed = new Map();
  const mismatches = new Map();

  const record = (mismatch) => {
    const key = mismatchKey(mismatch);
    if (!mismatches.has(key)) mismatches.set(key, mismatch);
  };

  for (const group of candidate.groups) {
    const members = [...group.members].sort(compareText);
    for (const member of members) {
      placed.set(member, group);
      if (!measured.has(member)) {
        record(mismatchOf('extra', member, group, candidate));
      } else if (members.length > 1) {
        record(mismatchOf('merged', member, group, candidate));
      }
    }
  }

  for (const group of physical.groups) {
    if (!placed.has(group.name)) {
      record({
        kind: 'missing',
        path: group.name,
        layer: null,
        candidate_id: candidate.candidate_id,
        mappedNodeIds: [],
      });
    }
  }

  return [...mismatches.values()].sort((left, right) => compareText(mismatchKey(left), mismatchKey(right)));
}

/** One mismatch, carrying the group it was placed in and the nodes that group is mapped to. */
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
function mismatchOf(kind, path, group, candidate) {
  return {
    kind,
    path,
    layer: group.name,
    candidate_id: candidate.candidate_id,
    mappedNodeIds: group.mappedNodeIds ?? [],
  };
}
