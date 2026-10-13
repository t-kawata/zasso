/**
 * Synthetic workspaces built to the shape PX-255 measured.
 *
 * The calibration cannot be asserted against ~/shyme/gaia: that workspace is the
 * user's live design material and changes between runs. These builders produce the
 * same proportions deterministically, so the buckets, the partition identities and
 * the residual disposition are all assertable in CI.
 *
 * Each builder states which measured quantity it reproduces. A fixture that merely
 * "looked similar" would let the calibration drift while the tests stayed green.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { DECLARED_RESIDUAL_CLASS_NAMES } from '../../../.claude/scripts/sequences-slice/lib/residuals.mjs';
import { RECORDED_MANIFEST_SEGMENTS, RECORDED_PACKAGE_SEGMENTS, SPEC_LINES } from './line-range-shape.mjs';
import { normalizeStructureSegments } from '../../../.claude/scripts/sequences-slice/lib/segments.mjs';

/** The class-count histogram of the live operations: 0:47, 1:151, 2:41, 3:13, 4:4, 5:1. */
export const RECORDED_CLASS_COUNT_HISTOGRAM = Object.freeze([
  [0, 47], [1, 151], [2, 41], [3, 13], [4, 4], [5, 1],
]);

/** The live ownership buckets: empty 47, one 187, several 20, none 3. */
export const RECORDED_OPERATION_BUCKETS = Object.freeze({
  emptyResultClasses: 47,
  exactlyOnePackage: 187,
  severalPackages: 20,
  noKnownPackage: 3,
  total: 257,
});

/** The live sequence buckets: one 73, several 38, none 5. */
export const RECORDED_SEQUENCE_BUCKETS = Object.freeze({
  onePackage: 73,
  severalPackages: 38,
  noKnownPackage: 5,
  total: 116,
});

/** The live outcome distribution across all 553 sequences. */
export const RECORDED_SEQUENCE_OUTCOMES = Object.freeze({
  notASequence: 437,
  singleStep: 48,
  viaNeighbour: 1,
  direct: 67,
});

/**
 * How the fifty-nine multi-class operations divide between the buckets.
 *
 * Stated rather than derived, because the division is a choice the fixture makes while
 * the arithmetic that has to come out — 36 + 20 + 3 = 59, and 151 + 36 = 187 — is the
 * assertion. Writing it out makes a wrong fixture fail loudly instead of silently
 * reproducing a different shape.
 */
const MULTI_CLASS_DIVISION = Object.freeze([
  Object.freeze({ classCount: 2, samePackage: 30, differentPackages: 10, noKnownPackage: 1 }),
  Object.freeze({ classCount: 3, samePackage: 4, differentPackages: 8, noKnownPackage: 1 }),
  Object.freeze({ classCount: 4, samePackage: 2, differentPackages: 2, noKnownPackage: 0 }),
  Object.freeze({ classCount: 5, samePackage: 0, differentPackages: 0, noKnownPackage: 1 }),
]);

const SINGLE_CLASS_OPERATION_COUNT = 151;
const OBJECT_COUNT = 1294;
const STEP_COUNT = 283;

/**
 * The objects span fifteen packages while the operations reach only thirteen of them.
 *
 * That is the live shape: the 1294 objects name 15 distinct owner_package values, and the
 * operations reach pkg-0002 through pkg-0014. A fixture where every package was reached
 * would assert a workspace with no unreached package, which is not the one measured.
 */
const PACKAGE_COUNT = 15;
const FIRST_REACHED_OWNER_INDEX = 1;
const REACHED_OWNER_COUNT = 13;

/** A canonical name that inventory.objects carries, owned by the package at `index`. */
// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
function ownedClassName(index) {
  return `SyntheticObject${String(index).padStart(4, '0')}`;
}

/**
 * The package owning the object at `index`.
 *
 * Consecutive indices fall to different packages and indices PACKAGE_COUNT apart fall to
 * the same one, which is what lets the fixture build an operation whose several classes
 * share a single owner without leaving the object list.
 */
// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
function ownerPackageFor(index) {
  return `pkg-${String((index % PACKAGE_COUNT) + 1).padStart(4, '0')}`;
}

/** An object index whose owner is one of the thirteen packages the operations reach. */
// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
function reachedOwnerIndex(offset) {
  return FIRST_REACHED_OWNER_INDEX + (offset % REACHED_OWNER_COUNT);
}

/**
 * A distinct object index per slot, every one owned by a reached package.
 *
 * The blocks are thirteen long and fifteen apart, so consecutive slots name different
 * objects while every index in the block leaves the remainder that puts its owner inside
 * the reached range. Walking 1..151 directly would step onto index 15, whose owner
 * pkg-0001 is a package the live operations never reach.
 */
// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
function distinctReachedOwnerIndex(slot) {
  return FIRST_REACHED_OWNER_INDEX + PACKAGE_COUNT * Math.floor(slot / REACHED_OWNER_COUNT) + (slot % REACHED_OWNER_COUNT);
}

/**
 * inventory.objects at the live shape: 1294 entries, 1294 distinct canonical names,
 * every entry owned, over 15 packages.
 */
export function liveShapedObjects() {
  const objects = [];
  for (let index = 0; index < OBJECT_COUNT; index += 1) {
    objects.push({
      id: `obj-${String(index + 1).padStart(6, '0')}`,
      canonical_name: ownedClassName(index),
      owner_package: ownerPackageFor(index),
      classification: 'unknown',
      aliases: [],
      normalization_status: 'CONFIRMED',
      review_status: 'CONFIRMED',
      source_refs: [],
    });
  }
  return objects;
}

/** An objects array whose name is carried in canonical_name and in neither id nor name. */
export function objectsWhoseNameIsNeitherIdNorAlias() {
  return [
    { id: 'obj-000001', name: 'WRONG', canonical_name: 'Q', owner_package: 'pkg-0005' },
    { id: 'obj-000002', name: 'ALSO-WRONG', canonical_name: 'depth', owner_package: 'pkg-0005' },
  ];
}

/**
 * inventory.claims at the live shape: 88 entries with 88 distinct canonical names,
 * none of which is one of the ten unmatched class names.
 */
export function liveShapedClaims() {
  return Array.from({ length: 88 }, (unused, index) => ({
    id: `claim-${String(index + 1).padStart(6, '0')}`,
    canonical_name: `ClaimedName${String(index + 1).padStart(4, '0')}`,
    primary_owner: ownerPackageFor(index),
    collaborating_owners: [],
    normalization_status: 'CONFIRMED',
    review_status: 'CONFIRMED',
    source_refs: [],
  }));
}

/**
 * inventory.terms at the live shape: 777 entries whose canonical_name takes only 17
 * distinct values, every one a normative modal phrase rather than an object name.
 */
export function liveShapedTerms() {
  const categories = [
    '禁止', 'してはならない', '不変条件', 'fail-closed', 'しなければならない', '必須',
    '状態遷移', 'MUST NOT', 'エラーコード', 'MAY', 'MUST', 'state machine',
    '状態機械', '検査対象', '実装必須', 'invariant', '拒否コード',
  ];
  return Array.from({ length: 777 }, (unused, index) => ({
    id: `req-${String(index + 1).padStart(6, '0')}`,
    canonical_name: categories[index % categories.length],
    keyword: categories[index % categories.length],
    classification: 'prohibited',
    context: '',
    snippet: '',
    line_start: index + 1,
    line_end: index + 1,
    byte_start: index,
    byte_end: index + 1,
    section_id: 'h-000002',
    normalization_status: 'CONFIRMED',
    source_refs: [],
  }));
}

/**
 * A term index whose prose happens to contain a class name.
 *
 * This is the false hit the ticket's RISKS section warns about: a substring match over
 * a term record is not a name match, and the fixture holds the counter-example so that a
 * future change to the disposition cannot quietly reintroduce one.
 */
export function termsCarryingAClassNameOnlyInProse() {
  return [
    {
      id: 'req-000001',
      canonical_name: '禁止',
      keyword: '禁止',
      context: 'the CommunityCertificate must not be transferable',
      snippet: 'the CommunityCertificate must not be transferable',
    },
  ];
}

/**
 * The 257 live operations, sorted into the buckets they were built for.
 *
 * 47 carry no result object class; 151 carry one; the remaining 59 carry two to five and
 * divide between the buckets exactly as MULTI_CLASS_DIVISION states. The buckets are
 * returned alongside the flat list because the sequence axis has to draw a step's
 * operation from a named bucket, and re-deriving the bucket from the class list would be
 * a second implementation of the join under test.
 */
export function liveShapedOperationIndex() {
  const empty = [];
  const single = [];
  const samePackage = [];
  const severalPackages = [];
  const noKnownPackage = [];
  let position = 0;

  const add = (bucket, resultObjectClasses) => {
    position += 1;
    const operation = {
      id: `SyntheticOperation${String(position).padStart(4, '0')}`,
      position,
      result_object_classes: resultObjectClasses,
    };
    bucket.push(operation);
    return operation;
  };

  for (let index = 0; index < RECORDED_OPERATION_BUCKETS.emptyResultClasses; index += 1) {
    add(empty, []);
  }
  for (let index = 0; index < SINGLE_CLASS_OPERATION_COUNT; index += 1) {
    add(single, [ownedClassName(distinctReachedOwnerIndex(index))]);
  }

  let sharedOwnerCursor = 0;
  let distinctOwnerCursor = 0;
  let unmatchedNameCursor = 0;
  for (const division of MULTI_CLASS_DIVISION) {
    for (let index = 0; index < division.samePackage; index += 1) {
      // Every class in this operation sits PACKAGE_COUNT apart from the next, so they all
      // name one package: the fixture varies the class and holds the owner fixed.
      const base = reachedOwnerIndex(sharedOwnerCursor);
      sharedOwnerCursor += 1;
      const classes = [];
      for (let slot = 0; slot < division.classCount; slot += 1) {
        classes.push(ownedClassName(base + slot * PACKAGE_COUNT));
      }
      add(samePackage, classes);
    }
    for (let index = 0; index < division.differentPackages; index += 1) {
      // Consecutive indices inside the reached range, so every class names a different
      // package and the operation is a genuine cross-boundary act.
      const base = reachedOwnerIndex(distinctOwnerCursor % (REACHED_OWNER_COUNT - division.classCount + 1));
      distinctOwnerCursor += 1;
      const classes = [];
      for (let slot = 0; slot < division.classCount; slot += 1) {
        classes.push(ownedClassName(base + slot));
      }
      add(severalPackages, classes);
    }
    for (let index = 0; index < division.noKnownPackage; index += 1) {
      const classes = [];
      for (let slot = 0; slot < division.classCount; slot += 1) {
        classes.push(DECLARED_RESIDUAL_CLASS_NAMES[unmatchedNameCursor % DECLARED_RESIDUAL_CLASS_NAMES.length]);
        unmatchedNameCursor += 1;
      }
      add(noKnownPackage, classes);
    }
  }

  return {
    empty,
    single,
    samePackage,
    severalPackages,
    noKnownPackage,
    all: [...empty, ...single, ...samePackage, ...severalPackages, ...noKnownPackage],
  };
}

/** The 257 live operations as a flat list. */
export function liveShapedOperations() {
  return liveShapedOperationIndex().all;
}

/**
 * The 553 sequences, their 283 steps, and the 116 of them that are sequences at all.
 *
 * A step's operation is drawn from the bucket the sequence is meant to land in, so the
 * sequence buckets follow from the operation buckets through the same join the ticket is
 * calibrating rather than being asserted independently of it.
 */
export function liveShapedSequenceAxis() {
  const index = liveShapedOperationIndex();
  const sequences = [];
  const steps = [];
  const operationBySequenceId = new Map();

  const addSequence = (outcome, pool) => {
    const id = `S-${sequences.length + 1}`;
    sequences.push({ id, kind: 'entry', firstLine: 1, lastLine: 2, cites: 0, outcome, neighbour: null });
    if (outcome === 'notASequence') return;
    const operation = pool[sequences.length % pool.length];
    steps.push({
      id: `${id}__1`,
      sequence: id,
      operation: operation.id,
      subject: 'synthetic',
      predicate: 'synthetic',
      object: 'synthetic',
      contract: 'synthetic',
      line: 1,
      quote: 'synthetic',
    });
    // Remembered as one operation rather than as a pool, because padding from the pool
    // would draw a different operation and a different owning package, and a sequence the
    // fixture built to be single-package would land in the several bucket instead.
    operationBySequenceId.set(id, operation);
  };

  for (let count = 0; count < RECORDED_SEQUENCE_BUCKETS.onePackage; count += 1) addSequence('direct', index.single);
  for (let count = 0; count < RECORDED_SEQUENCE_BUCKETS.severalPackages; count += 1) addSequence('singleStep', index.severalPackages);
  for (let count = 0; count < RECORDED_SEQUENCE_BUCKETS.noKnownPackage; count += 1) addSequence('viaNeighbour', index.empty);
  for (let count = 0; count < RECORDED_SEQUENCE_OUTCOMES.notASequence; count += 1) addSequence('notASequence', []);

  // Pad to the measured step count by appending further steps to sequences that already
  // hold one, drawing from the pool that keeps each sequence in the bucket it was built for.
  const sequenceIds = [...operationBySequenceId.keys()];
  let cursor = 0;
  while (steps.length < STEP_COUNT) {
    const sequenceId = sequenceIds[cursor % sequenceIds.length];
    cursor += 1;
    steps.push({
      id: `${sequenceId}__${steps.filter((step) => step.sequence === sequenceId).length + 1}`,
      sequence: sequenceId,
      operation: operationBySequenceId.get(sequenceId).id,
      subject: 'synthetic',
      predicate: 'synthetic',
      object: 'synthetic',
      contract: 'synthetic',
      line: 1,
      quote: 'synthetic',
    });
  }
  return { sequences, steps };
}

/** The three artifacts a calibration reads, at the measured shape. */
export function liveShapedTriple() {
// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
  const { sequences, steps } = liveShapedSequenceAxis();
  return {
    artifact: {
      schema_version: 2,
      spec: { path: 'SyntheticSpec.md', sha256: 'a'.repeat(64), lines: SPEC_LINES },
      sequences,
      steps,
      operations: liveShapedOperations(),
    },
    treeManifest: {
      workspace: {
        packages: RECORDED_PACKAGE_SEGMENTS.map((entry, index) => ({
          id: `pkg-${String(index + 1).padStart(4, '0')}`,
          // The recorded directory each package sits in, so a directory resolves to an id
          // the way it does in the live workspace rather than by position in this array.
          path: entry.packagePath,
        })),
      },
      inventory: { objects: liveShapedObjects(), claims: liveShapedClaims(), terms: liveShapedTerms() },
      structure: { segment_count: RECORDED_MANIFEST_SEGMENTS.length, segments: RECORDED_MANIFEST_SEGMENTS },
    },
    allocateManifest: { contract_registry: [], handoff_summary: { unresolved: [] } },
  };
}

/** The RFC-SEED.md a package directory carries, seed block first. */
export function renderRfcSeed({ seedPackage, seedPath, segmentIds }) {
  return [
    '# Synthetic RFC seed',
    '',
    '```json',
    JSON.stringify(
      {
        package: seedPackage,
        source_spec: 'SyntheticSpec.md',
        stage1_manifest: 'WORKSPACIFY-TREE-MANIFEST.json',
        stage2_manifest: 'WORKSPACIFY-ALLOCATE-MANIFEST.json',
        implementation_order: [],
        contract_refs: [],
        source_segments: segmentIds,
      },
      null,
      2,
    ),
    '```',
    '',
    '## 2. Coupling Contracts (I/O Boundary)',
    '',
    '```json',
    JSON.stringify(
      { schema_version: '1.0.0', seed_package: seedPackage, seed_path: seedPath, no_external_contracts: true, no_external_contracts_reason: 'synthetic', contract_edges: [] },
      null,
      2,
    ),
    '```',
    '',
  ].join('\n');
}

/** A workspace root on disk holding the three files and the crates tree. */
export function buildSyntheticTriple(options = {}) {
  const { omitTreeManifest = false, omitAllocateManifest = false, omitCratesTree = false } = options;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sequences-slice-'));
  const triple = liveShapedTriple();

  fs.writeFileSync(path.join(root, 'SyntheticSpec-sequences.json'), JSON.stringify(triple.artifact));
  if (!omitTreeManifest) {
    fs.writeFileSync(path.join(root, 'WORKSPACIFY-TREE-MANIFEST.json'), JSON.stringify(triple.treeManifest));
  }
  if (!omitAllocateManifest) {
    fs.writeFileSync(path.join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), JSON.stringify(triple.allocateManifest));
  }
  if (!omitCratesTree) {
    for (const entry of RECORDED_PACKAGE_SEGMENTS) {
      const directory = path.join(root, entry.packagePath);
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(
        path.join(directory, 'RFC-SEED.md'),
        renderRfcSeed({ seedPackage: entry.packagePath, seedPath: entry.packagePath, segmentIds: entry.segmentIds }),
      );
    }
  }
  return root;
}

/** Remove a synthetic root and everything under it. */
export function removeSyntheticTriple(root) {
  fs.rmSync(root, { recursive: true, force: true });
}
