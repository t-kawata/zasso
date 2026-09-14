// @verifies C001
// @verifies C002
// [::TICKET::] P24-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-9 --for-spec --no-implementation-order`.
/**
 * The decisions input a claim-carrying representative needs.
 *
 * `workspacify-tree gate` stops at G3 for two reasons: no partition owns the
 * material the origin spec harvested, and no pulse candidate is settled. Both
 * are inputs the AI must supply, and both are derived here rather than typed:
 * the partition from the measured tree, the ownership from the spec's own
 * evidence anchors, and the settlements from the pulse the spec itself produces.
 *
 * What is asserted here is the mechanical half — every harvested item owned
 * exactly once, no owning package empty, the tree's leaves equal to the package
 * paths, one settlement per candidate. The judgement half (which boundary a
 * human would draw) is not testable and is surfaced for review instead.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findOverSplitRisks } from '../../../.claude/scripts/workspacify-tree/lib/boundary-review.mjs';
import { validateWorkspaceTree } from '../../../.claude/scripts/workspacify-tree/lib/workspace-model.mjs';
import { validateSpecDefects } from '../../../.claude/scripts/workspacify-tree/lib/spec-defects.mjs';
import {
  INVENTORY_CATEGORIES,
  SETTLEMENT_READINGS,
  collectOwnedInventoryIds,
  deriveOwnership,
  derivePartition,
  harvestInventory,
  knownPulseKinds,
  readSectionDirectories,
  settleCandidates,
} from '../helpers/decisions-authoring.mjs';
import { createThrowawayFile } from '../helpers/scratch.mjs';

/** Every inventory id, across the six categories the ownership checks read. */
// [::TICKET::] P24-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-9 --for-spec --no-implementation-order`.
function inventoryIds(inventory) {
  return INVENTORY_CATEGORIES.flatMap((category) => (inventory[category.listKey] ?? []).map((item) => item.id));
}

/** A synthetic inventory covering every category, so no assertion is vacuous. */
// [::TICKET::] P24-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-9 --for-spec --no-implementation-order`.
function syntheticInventory() {
  return {
    objects: [{ id: 'obj-000001', section_id: 'h-000001' }, { id: 'obj-000002', section_id: 'h-000001' }],
    claims: [{ id: 'clm-000001', section_id: 'h-000002' }],
    invariants: [{ id: 'req-000001', section_id: 'h-000001' }, { id: 'req-000002', section_id: 'h-000003' }, { id: 'req-000003', section_id: 'h-000003' }],
    stateMachines: [{ id: 'sm-000001', section_id: 'h-000003' }],
    errorCodes: [{ id: 'err-000001', section_id: 'h-000003' }],
    requiredTests: [{ id: 'test-000001', section_id: 'h-000003' }],
  };
}

/** The directory each section names: objects in `src`, the claim in `src/api`, the rest in `tests`. */
const SYNTHETIC_SECTION_DIRECTORIES = new Map([
  ['h-000001', 'src'],
  ['h-000002', 'src/api'],
  ['h-000003', 'tests'],
]);

/** The measured population: the directories that directly hold a source file. */
const SYNTHETIC_MEASURED_DIRECTORIES = ['.', 'src', 'src/api', 'tests'];

// ---------------------------------------------------------------------------
// C001 — the partition and the ownership
// ---------------------------------------------------------------------------

test('C001 precondition — the partition is one package per measured directory, and it is empty rather than invented when the spec carries no claim', () => {
  const partition = derivePartition({
    measuredDirectories: SYNTHETIC_MEASURED_DIRECTORIES,
    materialDirectories: ['src', 'src/api', 'tests'],
  });

  assert.deepEqual(partition.workspace.map((pkg) => pkg.path).sort(), SYNTHETIC_MEASURED_DIRECTORIES.slice().sort());
  assert.equal(partition.workspace.length, SYNTHETIC_MEASURED_DIRECTORIES.length);

  // A subject whose spec carries no claim cannot justify a production-library.
  assert.throws(
    () => derivePartition({ measuredDirectories: ['docs', 'src'], materialDirectories: [] }),
    /carries no claim/,
    'a zero-claim subject is refused rather than given an empty partition',
  );
});

test('C001 postcondition — every harvested item is owned exactly once, no owning package is empty, and the tree leaves equal the package paths', () => {
  const inventory = syntheticInventory();
  const partition = derivePartition({
    measuredDirectories: SYNTHETIC_MEASURED_DIRECTORIES,
    materialDirectories: ['src', 'src/api', 'tests'],
  });
  const owned = deriveOwnership({ inventory, sectionDirectories: SYNTHETIC_SECTION_DIRECTORIES, partition });
  const workspace = owned.workspace;

  const ownedIds = collectOwnedInventoryIds(workspace);
  assert.deepEqual(ownedIds.slice().sort(), inventoryIds(inventory).slice().sort(), 'owned set equals harvested set');
  assert.equal(new Set(ownedIds).size, ownedIds.length, 'no id is owned twice');

  const report = validateWorkspaceTree({ tree: partition.tree, packages: workspace });
  assert.equal(report.consistent, true);
  assert.deepEqual(report.treePaths, report.packagePaths, 'the tree leaves and the package paths agree one for one');

  for (const pkg of workspace.filter((entry) => entry.kind === 'production-library')) {
    assert.ok(collectOwnedInventoryIds([pkg]).length > 0, `${pkg.id} is a production-library that owns nothing`);
  }
});

test('C001 invariant — the ownership set is derived from the item sections, and a package owning nothing is reported rather than accepted', () => {
  const inventory = syntheticInventory();
  const partition = derivePartition({
    measuredDirectories: SYNTHETIC_MEASURED_DIRECTORIES,
    materialDirectories: ['src', 'src/api', 'tests'],
  });
  const owned = deriveOwnership({ inventory, sectionDirectories: SYNTHETIC_SECTION_DIRECTORIES, partition });

  const byPackage = new Map(owned.workspace.map((pkg) => [pkg.id, pkg]));
  const objectPackage = byPackage.get(owned.ownership.find((entry) => entry.objectId === 'obj-000001').packageId);
  assert.equal(objectPackage.path, 'src', 'the object is owned by the directory its section names, not by a guess');

  // A production-library that owns nothing is a speculative split the gate names.
  const empty = { id: 'pkg-0009', name: 'hollow', layer: 'protocol', kind: 'production-library', owns: {} };
  const risks = findOverSplitRisks([empty]);
  assert.equal(risks.length, 1);
  assert.equal(risks[0].kind, 'no-owner');
  assert.match(risks[0].detail, /owns no objects or claims/);
});

// ---------------------------------------------------------------------------
// C002 — the settlements
// ---------------------------------------------------------------------------

test('C002 precondition — the readings cover every pulse kind the pipeline can report, so no candidate is left without a reading', () => {
  for (const kind of knownPulseKinds()) {
    assert.ok(SETTLEMENT_READINGS[kind] !== undefined, `no authored reading exists for pulse kind ${kind}`);
  }
});

test('C002 postcondition — every candidate id appears exactly once across the two lists with the fields its list requires', () => {
  const candidates = [
    { id: 'pulse-000001', kind: 'isolated_chapter', chapter_ref: 'h-000002', observation: 'No other chapter refers to "Scope".', evidence_refs: ['s-000002'] },
    { id: 'pulse-000002', kind: 'oversized_chapter', chapter_ref: 'h-000004', observation: 'The chapter "Claims" holds 100% of the specification.', evidence_refs: ['s-000004'] },
    { id: 'pulse-000003', kind: 'undefined_reference', chapter_ref: 'h-000004', observation: 'The identifier `clm-widget-invariant-1` is used once and defined nowhere.', evidence_refs: ['s-000004'] },
  ];
  const settled = settleCandidates({ candidates, readings: SETTLEMENT_READINGS });

  const ids = [...settled.spec_defects, ...settled.residual_questions].map((record) => record.candidate_id);
  assert.deepEqual(ids.slice().sort(), candidates.map((candidate) => candidate.id).sort());
  assert.equal(new Set(ids).size, ids.length, 'no candidate is settled twice');

  assert.deepEqual(
    validateSpecDefects({ candidates, specDefects: settled.spec_defects, residualQuestions: settled.residual_questions }),
    { ok: true, errors: [] },
  );
});

test('C002 invariant — a candidate whose kind carries no authored reading is refused, and an unsettled set is reported by id', () => {
  assert.throws(
    () => settleCandidates({ candidates: [{ id: 'pulse-999999', kind: 'unread_kind', observation: 'x' }], readings: SETTLEMENT_READINGS }),
    /no authored reading/,
  );

  const candidates = [{ id: 'pulse-000001', kind: 'isolated_chapter', observation: 'x' }];
  const unsettled = validateSpecDefects({ candidates, specDefects: [], residualQuestions: [] });
  assert.equal(unsettled.ok, false);
  assert.match(unsettled.errors[0], /pulse-000001 \(isolated_chapter\) is neither resolved/);
});

// ---------------------------------------------------------------------------
// The spec reader
// ---------------------------------------------------------------------------

test('the section reader maps each claim section to the directory its scope names, and harvests what the extractor harvests', () => {
  const spec = createThrowawayFile('ORIGIN-LONG-SPEC.md', [
    '# SYNTHETIC-ORIGIN-SPEC — /tmp/subject',
    '',
    '## Scope',
    '',
    '- schema: 1',
    '',
    '## Claims',
    '',
    '### Claim `clm-widget-invariant-1`',
    '',
    '- claim_type: unresolved',
    '- scope: src/widget',
    '- statement: the condition asserted at src/widget/widget.rs:1 holds',
    '- evidence:',
    '  - `src/widget/widget.rs:1` (source_static)',
    '',
    '### Claim `clm-gadget-invariant-2`',
    '',
    '- claim_type: unresolved',
    '- scope: src/gadget',
    '- statement: the condition asserted at src/gadget/gadget.rs:2 holds',
    '- evidence:',
    '  - `src/gadget/gadget.rs:2` (source_static)',
    '',
  ]);

  const inventory = harvestInventory(spec.path);
  assert.equal(inventory.invariants.length, 2, 'the extractor harvests both claim sections as invariants');

  const directories = readSectionDirectories(spec.path);
  assert.equal(directories.get(inventory.invariants[0].section_id), 'src/widget');
  assert.equal(directories.get(inventory.invariants[1].section_id), 'src/gadget');
});

test('a claim section that names no directory is refused rather than silently unowned', () => {
  const spec = createThrowawayFile('ORIGIN-LONG-SPEC.md', [
    '## Claims',
    '',
    '### Claim `clm-orphan-invariant-1`',
    '',
    '- statement: no scope line and no evidence anchor at all',
    '',
  ]);
  const inventory = harvestInventory(spec.path);
  assert.equal(inventory.invariants.length, 1);

  const directories = readSectionDirectories(spec.path);
  const partition = derivePartition({ measuredDirectories: ['src'], materialDirectories: ['src'] });
  assert.throws(
    () => deriveOwnership({ inventory, sectionDirectories: directories, partition }),
    /names no measured directory/,
  );
});
