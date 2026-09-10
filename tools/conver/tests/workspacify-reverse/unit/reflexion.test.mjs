// @verifies C001
// @verifies C002
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
/**
 * R-T5 — the logical architecture as a choice between candidate models.
 *
 * The subject of these tests is the difference between a layout and a design. An
 * existing project's directories are a fact about its history, not a statement
 * about its architecture, and treating the two as the same thing freezes that
 * history into the canonical record as if it had been designed — failure mode
 * F14. So the machine generates several candidate partitions from the measured
 * structure and dependencies, offers each measured directory as a card whose
 * options are the groupings those candidates propose for it, and the human
 * selects between them.
 *
 * Nothing is deleted while that happens. A candidate nobody decided stays
 * `unresolved`, which is why the count before and after adjudication is the
 * assertion that no option was lost, and why the unanimity of a boundary is
 * reported as a one-option card rather than as no card at all.
 *
 * Agreement is deliberately not the pass condition, exactly as in P22-11's T5.
 * What passes is that every disagreement between the chosen candidate and the
 * measured layout was written down — including the run where there are none,
 * which still requires the record to exist.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ADJUDICATION_STATES,
  CANDIDATE_RULES,
  MISMATCH_KINDS,
  adjudicateCandidates,
  assertCardIsAdjudicable,
  assertNoCandidateLost,
  countCandidates,
  deriveMismatches,
  generateCandidates,
  mapDirNodes,
  physicalPartition,
  renderAdjudicationCards,
} from '../../../.claude/scripts/workspacify-reverse/lib/reflexion.mjs';
import {
  ARCHITECTURE_DELTA_FILE_NAME,
  ARCHITECTURE_DELTA_GATE_ID,
  assertDeltaRecorded,
  loadArchitectureDelta,
  recordArchitectureDelta,
} from '../../../.claude/scripts/workspacify-tree/lib/architecture-delta.mjs';

/** Where R1 and R2 were written by P22-4. */
const ANALYSIS_ROOT = fileURLToPath(new URL('../analysis/', import.meta.url));

/** The R1 structure measurement over `siprs-for-reverse`. */
const STRUCTURE_PATH = join(ANALYSIS_ROOT, 'STRUCTURE.json');

/** The R2 dependency measurement over the same tree. */
const DEPENDENCIES_PATH = join(ANALYSIS_ROOT, 'DEPENDENCIES.json');

/** The partitioning the forward rotation chose — the material a human adjudicates against. */
const ORACLE_TREE_PATH = fileURLToPath(
  new URL('../../../siprs-with-4layers/RFC-ROOT-Dirs-Tree.json', import.meta.url),
);

/** One measured directory, in the shape `measureStructure` writes. */
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
function measuredPackage(directory, files) {
  return { directory, files, declaredModules: [], language: 'rust' };
}

/** One measured import edge, in the shape `measureDependencies` writes. */
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
function importEdge(from, to) {
  return {
    from,
    to,
    kind: 'syntactic_import',
    count: 1,
    locations: [{ file: `${from}/entry.rs`, line: 1, spelling: to }],
  };
}

/**
 * A small project whose measurements are known by construction.
 *
 * `src/api` and `src/model` import each other, so they are the one measured
 * cycle; `src/empty_measurement` is declared with no files, which is the package
 * the design says must produce no candidate rather than an empty card.
 */
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
function syntheticMeasurements() {
  return {
    structure: {
      analysis_mode: 'syntax_only',
      packages: [
        measuredPackage('build', ['build.rs']),
        measuredPackage('examples', ['examples/demo.rs']),
        measuredPackage('src', ['src/lib.rs']),
        measuredPackage('src/api', ['src/api/call.rs']),
        measuredPackage('src/model', ['src/model/account.rs']),
        measuredPackage('src/empty_measurement', []),
      ],
    },
    dependencies: {
      analysis_mode: 'syntax_only',
      packages: ['examples', 'src', 'src/api', 'src/model'],
      cycles: [['src/api', 'src/model']],
      edges: [
        importEdge('examples', 'src'),
        importEdge('src', 'src/api'),
        importEdge('src/api', 'src/model'),
        importEdge('src/model', 'src/api'),
      ],
    },
  };
}

/**
 * A directory tree carrying the `mappedNodeIds` chain the forward rotation left.
 *
 * The shape mirrors the real `RFC-ROOT-Dirs-Tree.json`: `trees` is keyed by
 * language, and the node under that key is the top-level *directory* the tree
 * partitions — named `src` there, not `rust`. Its name is therefore the first
 * segment of every path the tree maps (`src/api`, `src/model`), which is the
 * convention `dependencyDirections` states in the same file.
 */
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
function syntheticDirsTree() {
  return {
    schemaVersion: '1.0',
    trees: {
      rust: {
        name: 'src',
        type: 'directory',
        kind: 'root',
        children: [
          {
            name: 'api',
            type: 'directory',
            kind: 'api_contract',
            mappedNodeIds: [{ nodeId: 'N0011', title: 'the public API contract' }],
            children: [],
          },
          {
            name: 'model',
            type: 'directory',
            kind: 'data_model',
            mappedNodeIds: [{ nodeId: 'N0024', title: 'the call data model' }],
            children: [],
          },
        ],
      },
    },
  };
}

/** The candidate that a derivation rule produced, or a failure naming the rule. */
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
function candidateFrom(candidates, rule) {
  const found = candidates.find((candidate) => candidate.derivedFrom === rule);
  assert.ok(found, `no candidate was derived from ${rule}`);
  return found;
}

/** The group of a candidate that holds the given directory. */
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
function groupHolding(candidate, directory) {
  return candidate.groups.find((group) => group.members.includes(directory));
}

/** The candidates the synthetic measurements support. */
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
function syntheticCandidates() {
  const { structure, dependencies } = syntheticMeasurements();
  return generateCandidates({ structure, dependencies, dirsTree: syntheticDirsTree() });
}

/** Read the R1 and R2 measurements P22-4 wrote, and the oracle's tree. */
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
function recordedMeasurements() {
  return {
    structure: JSON.parse(readFileSync(STRUCTURE_PATH, 'utf8')),
    dependencies: JSON.parse(readFileSync(DEPENDENCIES_PATH, 'utf8')),
    dirsTree: JSON.parse(readFileSync(ORACLE_TREE_PATH, 'utf8')),
  };
}

/** Write the delta record in the shape `loadArchitectureDelta` reads. */
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
function writeDelta(deltaPath, mismatches) {
  writeFileSync(deltaPath, `${JSON.stringify({ mismatches }, null, 2)}\n`, 'utf8');
}

// --- C001: several candidates, mechanically derived, never deleted -----------------

test('UT-1: the measurements support more than one candidate model', () => {
  const candidates = syntheticCandidates();

  assert.ok(candidates.length > 1, 'a single candidate would make the adjudication vacuous');
  assert.deepEqual(
    candidates.map((candidate) => candidate.derivedFrom).sort(),
    [...CANDIDATE_RULES].sort(),
    'every declared derivation rule contributes one candidate',
  );
  for (const candidate of candidates) {
    assert.ok(candidate.groups.length > 0, 'a candidate is a partition, so it holds at least one group');
  }
});

test('UT-1b: the candidate set is measured against the real R1 and R2 artefacts', () => {
  const { structure, dependencies, dirsTree } = recordedMeasurements();
  const candidates = generateCandidates({ structure, dependencies, dirsTree });

  assert.ok(candidates.length > 1);
  for (const candidate of candidates) {
    assert.ok(candidate.groups.length > 0);
  }
  assert.ok(physicalPartition(structure).groups.length > 1, 'the real tree has more than one measured directory');
});

test('C001 precondition: a missing measurement is refused rather than answered with empty candidates', () => {
  const { structure, dependencies } = syntheticMeasurements();

  assert.throws(
    () => generateCandidates({ dependencies, dirsTree: syntheticDirsTree() }),
    /R1 structure measurement/,
    'three empty candidates would read as an answer when nothing was measured',
  );
  assert.throws(
    () => generateCandidates({ structure, dirsTree: syntheticDirsTree() }),
    /R2 dependency measurement/,
  );
  assert.throws(
    () => generateCandidates({
      structure: { packages: [measuredPackage('src/empty_measurement', [])] },
      dependencies,
      dirsTree: syntheticDirsTree(),
    }),
    /R1 structure measurement/,
    'a measurement that placed no file anywhere is not a measurement to partition',
  );
});

test('UT-1c: a candidate is a partition, and a measurement that would break it is refused', () => {
  const structure = {
    packages: [
      measuredPackage('a', ['a/x.rs']),
      measuredPackage('b', ['b/x.rs']),
      measuredPackage('c', ['c/x.rs']),
      measuredPackage('d', ['d/x.rs']),
    ],
  };

  // A strongly-connected decomposition cannot name one directory in two cycles,
  // so a measurement that does is malformed. Answering it with a candidate that
  // places `b` in two logical models would hide the defect behind a partition
  // that does not partition.
  assert.throws(
    () => generateCandidates({ structure, dependencies: { edges: [], cycles: [['a', 'b'], ['b', 'c']] } }),
    /more than one group/,
    'a directory in two groups is not a partition',
  );

  const candidates = generateCandidates({
    structure,
    dependencies: { edges: [], cycles: [['a', 'b'], ['c', 'd']] },
  });
  for (const candidate of candidates) {
    const members = candidate.groups.flatMap((group) => group.members);
    assert.equal(members.length, new Set(members).size, `${candidate.derivedFrom} places a directory twice`);
    assert.deepEqual(
      [...new Set(members)].sort(),
      ['a', 'b', 'c', 'd'],
      `${candidate.derivedFrom} loses a measured directory`,
    );
  }
});

test('UT-2c: a candidate states one falsifiable proposition per merged group', () => {
  assert.deepEqual(
    candidateFrom(syntheticCandidates(), 'physical_faithful').propositions,
    ['every measured directory is a logical unit of its own'],
  );

  const oneCycle = candidateFrom(syntheticCandidates(), 'cycle_collapsed');
  assert.equal(oneCycle.propositions.length, 1, 'one merge is one proposition');
  assert.match(oneCycle.propositions[0], /one logical unit/);

  const structure = {
    packages: [
      measuredPackage('a', ['a/x.rs']),
      measuredPackage('b', ['b/x.rs']),
      measuredPackage('c', ['c/x.rs']),
      measuredPackage('d', ['d/x.rs']),
    ],
  };
  const twoMerges = generateCandidates({
    structure,
    dependencies: { edges: [], cycles: [['a', 'b'], ['c', 'd']] },
  }).find((candidate) => candidate.derivedFrom === 'cycle_collapsed');

  assert.equal(twoMerges.propositions.length, 2, 'two independent merges are two propositions, not one sentence');
  for (const proposition of twoMerges.propositions) {
    assert.equal(typeof proposition, 'string');
    assert.ok(proposition.trim().length > 0, 'a proposition that says nothing is not a proposition');
  }
});

test('UT-12c: mapDirNodes indexes the chain, and the root directory is the first path segment', () => {
  const index = mapDirNodes(syntheticDirsTree());

  assert.deepEqual(index.get('src/api'), [{ nodeId: 'N0011', title: 'the public API contract' }]);
  assert.deepEqual(index.get('src/model'), [{ nodeId: 'N0024', title: 'the call data model' }]);
  assert.equal(index.has('api'), false, 'the top-level directory name is part of every path the tree maps');
  assert.equal(index.has('src'), false, 'this tree maps no node to the root itself');
  assert.deepEqual([...mapDirNodes(undefined).keys()], [], 'an absent tree maps nothing rather than failing');
});

test('UT-12d: the real Dirs-Tree is indexed by the paths its own dependency directions name', () => {
  const { dirsTree } = recordedMeasurements();
  const declared = [...new Set(Object.values(dirsTree.dependencyDirections ?? {}).flat()
    .flatMap((direction) => [direction.from, direction.to]))].sort();

  assert.ok(declared.length > 0, 'the oracle tree states the directions it expects to be read at');

  const index = mapDirNodes(dirsTree);
  const unresolved = declared.filter((path) => !index.has(path));

  assert.deepEqual(
    unresolved,
    [],
    'a path the tree declares a direction between but does not map would leave a mismatch unanchored',
  );
});

test('IT-1, IT-2: the real measurements produce candidates, recordable mismatches, and an intact set', () => {
  const { structure, dependencies, dirsTree } = recordedMeasurements();
  const candidates = generateCandidates({ structure, dependencies, dirsTree });
  const physical = physicalPartition(structure);

  assert.ok(candidates.length > 1, 'IT-1: more than one candidate model is generated for siprs-for-reverse');

  const adjudicated = adjudicateCandidates(candidates, { 'cand-cycle-collapsed': 'resolved' });
  const chosen = adjudicated.find((candidate) => candidate.derivedFrom === 'cycle_collapsed');
  const differences = deriveMismatches(chosen, physical);

  assert.ok(differences.length > 0, 'IT-1: the measured cycle disagrees with the one-directory-per-group layout');
  for (const mismatch of differences) {
    assert.ok(MISMATCH_KINDS.includes(mismatch.kind));
    assert.equal(mismatch.candidate_id, chosen.candidate_id);
    assert.ok(physical.groups.some((group) => group.name === mismatch.path));
    assert.ok(Array.isArray(mismatch.mappedNodeIds));
  }
  assert.ok(
    differences.some((mismatch) => mismatch.mappedNodeIds.length > 0),
    'IT-1: the mismatches are anchored on the mappedNodeIds chain the oracle tree carries',
  );

  const delta = recordArchitectureDelta({ differences, recorded: differences });
  assert.equal(delta.unrecorded.length, 0, 'IT-1: every mismatch the real measurement produces can be recorded');

  assertNoCandidateLost(candidates, adjudicated);
  assert.equal(countCandidates(adjudicated).unresolved, candidates.length - 1, 'IT-2: only the chosen one settled');

  const { cards, withheld } = renderAdjudicationCards(adjudicated);
  assert.ok(cards.length > 0);
  assert.deepEqual(withheld, [], 'IT-2: no measured directory is left without a card');
  for (const card of cards) assertCardIsAdjudicable(card);
});

test('UT-2: each candidate is rendered as a card carrying consequences, evidence and counterexamples', () => {
  const { cards, withheld } = renderAdjudicationCards(syntheticCandidates());

  assert.deepEqual(withheld, [], 'every measured directory is adjudicable');
  assert.ok(cards.length > 0, 'the measurements support at least one boundary card');
  for (const card of cards) {
    assertCardIsAdjudicable(card);
    assert.equal(card.consequences.length, card.options.length, 'every option states what choosing it costs');
    assert.ok(card.evidence.length > 0, 'a card without evidence is an assertion, not a decision');
    assert.ok(Array.isArray(card.counterexamples), 'a card always says what would falsify it');
  }
});

test('UT-3: an adjudicated mismatch is recorded in ARCHITECTURE-DELTA', () => {
  const candidates = syntheticCandidates();
  const physical = physicalPartition(syntheticMeasurements().structure);
  const chosen = adjudicateCandidates(candidates, { 'cand-cycle-collapsed': 'resolved' })
    .find((candidate) => candidate.derivedFrom === 'cycle_collapsed');

  const differences = deriveMismatches(chosen, physical);
  assert.ok(differences.length > 0, 'the measured cycle disagrees with the one-directory-per-group layout');

  const delta = recordArchitectureDelta({ differences, recorded: differences });
  assert.equal(delta.unrecorded.length, 0, 'every derived mismatch is named by the delta record');

  const workspace = mkdtempSync(join(tmpdir(), 'p22-20-delta-'));
  try {
    const deltaPath = join(workspace, ARCHITECTURE_DELTA_FILE_NAME);
    writeDelta(deltaPath, differences);

    const stored = loadArchitectureDelta(deltaPath);
    assert.equal(stored.exists, true);
    assert.equal(stored.mismatches.length, differences.length);
    for (const mismatch of stored.mismatches) {
      assert.equal(typeof mismatch.kind, 'string');
      assert.equal(typeof mismatch.path, 'string');
      assert.equal(typeof mismatch.candidate_id, 'string', 'a mismatch names the candidate that produced it');
      assert.ok(Array.isArray(mismatch.mappedNodeIds), 'a mismatch is anchored on the mappedNodeIds chain');
      assert.ok(physical.groups.some((group) => group.name === mismatch.path));
    }

    const partial = recordArchitectureDelta({ differences, recorded: differences.slice(0, 1) });
    assert.equal(
      partial.unrecorded.length,
      differences.length - 1,
      'a record that names all but one difference is a FAIL, not a pass',
    );
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('UT-12: candidates are recorded on the existing mappedNodeIds chain, not in a parallel structure', () => {
  const candidates = syntheticCandidates();
  const faithfulGroup = groupHolding(candidateFrom(candidates, 'physical_faithful'), 'src/api');
  const mergedGroup = groupHolding(candidateFrom(candidates, 'cycle_collapsed'), 'src/api');

  assert.deepEqual(
    faithfulGroup.mappedNodeIds,
    [{ nodeId: 'N0011', title: 'the public API contract' }],
    'a group carries the node ids the forward index chain already mapped to its members',
  );
  assert.deepEqual(
    mergedGroup.mappedNodeIds.map((mapped) => mapped.nodeId).sort(),
    ['N0011', 'N0024'],
    'a merged group carries the union of the nodes its members were mapped to',
  );
  for (const candidate of candidates) {
    for (const group of candidate.groups) {
      assert.ok(!('logicalNodeIds' in group), 'no parallel identifier structure is introduced');
      assert.ok(!('nodeIds' in group), 'no parallel identifier structure is introduced');
    }
  }
});

test('UT-8: a package with no measurable structure produces no candidate and no card', () => {
  const candidates = syntheticCandidates();
  const names = (directory) => candidates.some((candidate) =>
    candidate.groups.some((group) => group.name === directory));
  const mentions = (directory) => candidates.some((candidate) =>
    candidate.groups.some((group) => group.members.includes(directory)));

  assert.equal(names('src/empty_measurement'), false, 'an empty package is never a group');
  assert.equal(mentions('src/empty_measurement'), false, 'an empty package is never a member');

  const { cards } = renderAdjudicationCards(candidates);
  assert.equal(
    cards.some((card) => card.scope === 'src/empty_measurement'),
    false,
    'an empty package produces no card rather than an empty one',
  );
});

test('UT-8b: a directory no candidate places is reported as withheld rather than dropped', () => {
  const physical = physicalPartition(syntheticMeasurements().structure);
  const partial = [{
    ...candidateFrom(syntheticCandidates(), 'physical_faithful'),
    groups: [{ name: 'src', members: ['src'], mappedNodeIds: [] }],
  }];

  const { cards, withheld } = renderAdjudicationCards(partial);
  const withheldNames = withheld.map((entry) => entry.directory);

  assert.deepEqual(cards.map((card) => card.scope), ['src']);
  assert.deepEqual(withheldNames, ['build', 'examples', 'src/api', 'src/model']);
  for (const entry of withheld) {
    assert.match(entry.reason, /no candidate places/);
  }

  // The same omission is what the delta gate refuses, so nothing is hidden by the report.
  const differences = deriveMismatches(partial[0], physical);
  assert.deepEqual(
    differences.map((mismatch) => `${mismatch.kind}:${mismatch.path}`).sort(),
    ['missing:build', 'missing:examples', 'missing:src/api', 'missing:src/model'],
  );
});

test('UT-6, UT-10: a candidate is never deleted, and an unadjudicated one stays unresolved', () => {
  const candidates = syntheticCandidates();
  const before = countCandidates(candidates);

  const adjudicated = adjudicateCandidates(candidates, { 'cand-physical-faithful': 'resolved' });
  const after = countCandidates(adjudicated);

  assert.equal(after.total, before.total, 'the candidate count is unchanged by adjudication');
  assert.equal(after.resolved + after.unresolved, before.total, 'every candidate is resolved or unresolved');
  assert.equal(after.resolved, 1);
  assert.equal(after.unresolved, before.total - 1);
  assert.doesNotThrow(() => assertNoCandidateLost(candidates, adjudicated));

  for (const candidate of adjudicated.filter((entry) => entry.adjudication === 'unresolved')) {
    assert.equal(candidate.adjudication, ADJUDICATION_STATES[0]);
  }
});

test('UT-10b: losing a candidate is detectable by counting', () => {
  const candidates = syntheticCandidates();
  const truncated = candidates.slice(0, candidates.length - 1);

  assert.throws(
    () => assertNoCandidateLost(candidates, truncated),
    /candidate/i,
    'a dropped option must be reported, not tolerated',
  );
});

test('UT-7: a boundary whose candidates all agree still produces a valid single-option card', () => {
  const { cards } = renderAdjudicationCards(syntheticCandidates());
  const unanimous = cards.filter((card) => card.options.length === 1);

  assert.ok(unanimous.length > 0, 'the synthetic project has directories no candidate splits');
  for (const card of unanimous) {
    assertCardIsAdjudicable(card);
    assert.equal(card.consequences.length, 1);
  }
});

// --- C002: the record is the artefact, and a missing record is the failure ---------

test('UT-4: a mismatch that is not recorded produces a FAIL, matching T5', () => {
  const physical = physicalPartition(syntheticMeasurements().structure);
  const differences = deriveMismatches(candidateFrom(syntheticCandidates(), 'cycle_collapsed'), physical);

  const gate = assertDeltaRecorded({ differences, recorded: [], deltaFileExists: true });
  assert.equal(gate.status, 'FAIL');
  assert.equal(gate.gateId, ARCHITECTURE_DELTA_GATE_ID);
  assert.equal(gate.unrecorded.length, differences.length);
});

test('UT-4b: a directory the candidate never places and a unit the layout never held are both named', () => {
  const physical = physicalPartition(syntheticMeasurements().structure);
  const incomplete = {
    candidate_id: 'cand-hand-built',
    derivedFrom: 'physical_faithful',
    groups: [
      { name: 'build', members: ['build'], mappedNodeIds: [] },
      { name: 'src', members: ['src'], mappedNodeIds: [] },
      { name: 'invented', members: ['src/invented'], mappedNodeIds: [] },
    ],
  };

  const differences = deriveMismatches(incomplete, physical);
  const kinds = differences.map((mismatch) => mismatch.kind);

  assert.ok(differences.some((mismatch) => mismatch.kind === 'missing' && mismatch.path === 'examples'));
  assert.ok(differences.some((mismatch) => mismatch.kind === 'missing' && mismatch.path === 'src/api'));
  assert.ok(differences.some((mismatch) => mismatch.kind === 'extra' && mismatch.path === 'src/invented'));
  assert.equal(kinds.includes('merged'), false, 'no group here holds two measured directories');
});

test('UT-9: zero mismatches still requires the delta record to exist', () => {
  const physical = physicalPartition(syntheticMeasurements().structure);
  const differences = deriveMismatches(candidateFrom(syntheticCandidates(), 'physical_faithful'), physical);

  assert.equal(differences.length, 0, 'this candidate is the layout, so it cannot disagree with it');
  const absent = assertDeltaRecorded({ differences, recorded: [], deltaFileExists: false });
  assert.equal(absent.status, 'FAIL', 'the record says the layout was examined rather than assumed');

  const present = assertDeltaRecorded({ differences, recorded: [], deltaFileExists: true });
  assert.equal(present.status, 'PASS');
});

test('UT-5: a card that would demand free-form prose is not emitted', () => {
  const { cards } = renderAdjudicationCards(syntheticCandidates());
  const essay = { ...cards[0], options: [], consequences: [] };

  assert.throws(
    () => assertCardIsAdjudicable(essay),
    /option/i,
    'a card with no option can only be answered in prose, which moves the judgement back to the machine',
  );

  for (const card of cards) {
    assert.ok(card.options.length >= 1, 'every emitted card is answerable by choosing');
    assert.doesNotThrow(() => assertCardIsAdjudicable(card));
  }
});

test('UT-5b: a card naming a subject kind outside the declared vocabulary is refused', () => {
  const { cards } = renderAdjudicationCards(syntheticCandidates());

  assert.doesNotThrow(() => assertCardIsAdjudicable(cards[0]));
  assert.throws(
    () => assertCardIsAdjudicable({ ...cards[0], subjectKind: 'a_kind_nobody_declared' }),
    /subject kind/,
    'the subject kinds are a closed vocabulary, and a card outside it is not adjudicable',
  );
});

test('every mismatch kind the derivation can emit is one the record can name', () => {
  assert.deepEqual([...MISMATCH_KINDS], ['merged', 'missing', 'extra']);
  assert.deepEqual([...ADJUDICATION_STATES], ['unresolved', 'resolved']);
});
