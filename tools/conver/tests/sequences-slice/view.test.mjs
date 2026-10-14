// PX-256 @verifies C003
// PX-256 @verifies C005
// The projection decides which units a package is told to implement, so the partition is
// the property that matters: a unit owned by one package appears once, as seq-; a unit
// owned by several appears in each of their views, as xdir-, with the same owner list.
// A unit that appeared nowhere would be an omission nothing downstream could detect.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPackageView,
  obligationSourceOf,
  renderPackageViewJson,
  renderPackageViewMarkdown,
} from '../../.claude/scripts/sequences-slice/lib/view.mjs';
import { resolvePackageByPath } from '../../.claude/scripts/sequences-slice/lib/packages.mjs';
import {
  liveShapedObjects,
  liveShapedOperations,
  liveShapedSequenceAxis,
} from '../sequences-slice/fixtures/synthetic-workspace.mjs';
import {
  RECORDED_MANIFEST_SEGMENTS,
  RECORDED_PACKAGE_SEGMENTS,
  SPEC_LINES,
} from '../sequences-slice/fixtures/line-range-shape.mjs';
import {
  measureLineRangeJoin,
  normalizeStructureSegments,
} from '../../.claude/scripts/sequences-slice/lib/segments.mjs';
import { renderLineRangeStatement } from '../../.claude/scripts/sequences-slice/lib/report.mjs';

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
function liveShapedInput() {
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
        packages: Array.from({ length: 29 }, (unused, index) => ({
          id: `pkg-${String(index + 1).padStart(4, '0')}`,
          path: `crates/protocol/package-${String(index + 1).padStart(4, '0')}`,
        })),
      },
      inventory: { objects: liveShapedObjects(), claims: [], terms: [] },
      structure: { segment_count: RECORDED_MANIFEST_SEGMENTS.length, segments: RECORDED_MANIFEST_SEGMENTS },
    },
    packageSegments: RECORDED_PACKAGE_SEGMENTS,
  };
}

const OCCUPIED_PACKAGE = 'pkg-0011';

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C003 the view names the operations the package owns, each with a stable unit id', () => {
  const view = buildPackageView(liveShapedInput(), OCCUPIED_PACKAGE);
  assert.equal(view.packageId, OCCUPIED_PACKAGE);
  assert.ok(view.ownedOperationUnits.length > 0);
  assert.ok(view.ownedOperationUnits.every((unit) => unit.unitId === `op-${unit.operationId}`));
  assert.ok(view.ownedOperationUnits.every((unit) => unit.ownerPackageIds.includes(OCCUPIED_PACKAGE)));
  assert.ok(view.ownedOperationUnits.every((unit) => Array.isArray(unit.resultObjectClasses)));
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C003 a sequence owned by one package is a seq unit, and one owned by several is an xdir unit', () => {
  const view = buildPackageView(liveShapedInput(), OCCUPIED_PACKAGE);
  assert.ok(view.ownedSequenceUnits.every((unit) => unit.unitId === `seq-${unit.sequenceId}`));
  assert.ok(view.ownedSequenceUnits.every((unit) => unit.ownerPackageIds.length === 1));
  assert.ok(view.crossBoundarySequenceUnits.every((unit) => unit.unitId === `xdir-${unit.sequenceId}`));
  assert.ok(view.crossBoundarySequenceUnits.every((unit) => unit.ownerPackageIds.length > 1));
  assert.ok(view.crossBoundarySequenceUnits.every((unit) => unit.ownerPackageIds.includes(OCCUPIED_PACKAGE)));
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C003 a unit appears in exactly one of the two sequence lists, never both', () => {
  const view = buildPackageView(liveShapedInput(), OCCUPIED_PACKAGE);
  const seqIds = view.ownedSequenceUnits.map((unit) => unit.sequenceId);
  const xdirIds = view.crossBoundarySequenceUnits.map((unit) => unit.sequenceId);
  assert.equal(new Set(seqIds).size, seqIds.length);
  assert.equal(new Set(xdirIds).size, xdirIds.length);
  assert.deepEqual(seqIds.filter((id) => xdirIds.includes(id)), []);
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C003 the projection is a pure function of its inputs', () => {
  const input = liveShapedInput();
  assert.deepEqual(buildPackageView(input, 'pkg-0002'), buildPackageView(input, 'pkg-0002'));
  assert.notDeepEqual(buildPackageView(input, 'pkg-0002'), buildPackageView(input, 'pkg-0003'));
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C003 a sequence appears in exactly as many views as it has owners, so no unit is dropped or doubled', () => {
  const input = liveShapedInput();
  const packageIds = input.treeManifest.workspace.packages.map((entry) => entry.id);

  // The owner list each view reports is the authority: a sequence owned by three packages
  // must appear in three views, and a sequence owned by none must appear in none.
  const appearances = new Map();
  const declaredOwners = new Map();
  for (const packageId of packageIds) {
    const view = buildPackageView(input, packageId);
    for (const unit of [...view.ownedSequenceUnits, ...view.crossBoundarySequenceUnits]) {
      appearances.set(unit.sequenceId, (appearances.get(unit.sequenceId) ?? 0) + 1);
      declaredOwners.set(unit.sequenceId, unit.ownerPackageIds);
    }
  }

  for (const [sequenceId, owners] of declaredOwners) {
    assert.equal(appearances.get(sequenceId), owners.length, sequenceId);
  }
  // The fixture is built so that some sequences are owned and some are not; a fixture
  // where nothing was distributed would satisfy the loop above vacuously.
  assert.ok(appearances.size > 0);
  assert.ok([...appearances.values()].some((count) => count > 1));
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C003 the markdown carries the same units as the json and states the line coordinate', () => {
  const view = buildPackageView(liveShapedInput(), OCCUPIED_PACKAGE);
  const markdown = renderPackageViewMarkdown(view);
  for (const unit of view.ownedOperationUnits) assert.ok(markdown.includes(unit.unitId), unit.unitId);
  for (const unit of view.crossBoundarySequenceUnits) assert.ok(markdown.includes(unit.unitId), unit.unitId);
  assert.match(markdown, /not used as an identity/);
  assert.equal(JSON.parse(renderPackageViewJson(view)).packageId, OCCUPIED_PACKAGE);
  assert.equal(renderPackageViewMarkdown(view), markdown);
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C003 a package reached by no operation gets an empty view rather than an error', () => {
  const view = buildPackageView(liveShapedInput(), 'pkg-0029');
  assert.equal(view.packageId, 'pkg-0029');
  assert.deepEqual(view.ownedOperationUnits, []);
  assert.deepEqual(view.ownedSequenceUnits, []);
  assert.deepEqual(view.crossBoundarySequenceUnits, []);
  assert.match(renderPackageViewMarkdown(view), /not used as an identity/);
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C003 the view states the same line coordinate the calibration measures', () => {
  const expected = renderLineRangeStatement(
    measureLineRangeJoin({
      packageSegments: RECORDED_PACKAGE_SEGMENTS,
      structureSegments: normalizeStructureSegments(RECORDED_MANIFEST_SEGMENTS),
      specLines: SPEC_LINES,
    }),
  );

  const view = buildPackageView(liveShapedInput(), OCCUPIED_PACKAGE);
  assert.equal(view.lineRange.statement, expected);
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C003 the line coordinate the view states is measured, not the arithmetic of nothing', () => {
  const view = buildPackageView(liveShapedInput(), OCCUPIED_PACKAGE);
  const packagesWithNoSegments = RECORDED_PACKAGE_SEGMENTS.filter((entry) => entry.segmentIds.length === 0).length;

  assert.ok(view.lineRange.claimedLineCount > 0);
  assert.ok(view.lineRange.unclaimedLineCount < SPEC_LINES);
  assert.equal(view.lineRange.claimedLineCount + view.lineRange.unclaimedLineCount, SPEC_LINES);
  assert.match(view.lineRange.statement, new RegExp(`${packagesWithNoSegments} packages claim no segment at all`));
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C003 two packages state the same line coordinate, and that coordinate is the measured one', () => {
  const input = liveShapedInput();
  const first = buildPackageView(input, 'pkg-0001');
  const last = buildPackageView(input, 'pkg-0029');

  // Equality alone is what a package-local statement would also satisfy, so it is asserted
  // together with the non-degeneracy that separates a measured workspace from an empty one.
  assert.deepEqual(first.lineRange, last.lineRange);
  assert.ok(first.lineRange.claimedLineCount > 0);
  assert.ok(first.lineRange.unclaimedLineCount < SPEC_LINES);
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C005 a package directory resolves to its package id, and an unknown directory is reported', () => {
  const packages = liveShapedInput().treeManifest.workspace.packages;
  const resolved = resolvePackageByPath(packages, 'crates/protocol/package-0011', '/workspace');
  assert.equal(resolved.packageId, OCCUPIED_PACKAGE);
  assert.equal(resolved.packagePath, 'crates/protocol/package-0011');
  const unknown = resolvePackageByPath(packages, 'crates/protocol/package-9999', '/workspace');
  assert.equal(unknown.packageId, null);
  assert.match(unknown.reason, /package-9999/);
});

// PX-259 @verifies C004
// The obligation section is additive: the three lists ownership produces must not move when the two
// new relations are supplied, or a unit id a materialised record already cites would change meaning.
// [::TICKET::] PX-259 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-259 --for-spec --no-implementation-order`.
test('C004 the three existing lists are a function of the artifact alone, undisturbed by the new relations', () => {
  const input = liveShapedInput();
  const allocateManifest = {
    contract_registry: [{ boundary_id: 'boundary-001', provider_package: 'pkg-0011', consumer_package: 'pkg-0012' }],
  };
  const declared = [{ interfaceId: 'surface-one', column: 'verb', operationSet: 'VerbMethod' }];

  const withoutRelations = buildPackageView({ ...input, obligations: { allocateManifest: { contract_registry: [] } } }, OCCUPIED_PACKAGE);
  const withRelations = buildPackageView({ ...input, obligations: { allocateManifest, declared } }, OCCUPIED_PACKAGE);

  assert.deepEqual(withRelations.ownedOperationUnits, withoutRelations.ownedOperationUnits);
  assert.deepEqual(withRelations.ownedSequenceUnits, withoutRelations.ownedSequenceUnits);
  assert.deepEqual(withRelations.crossBoundarySequenceUnits, withoutRelations.crossBoundarySequenceUnits);
});

test('C004 a package that declares nothing carries its boundary units and reports undeclared', () => {
  const input = liveShapedInput();
  const allocateManifest = {
    contract_registry: [{ boundary_id: 'boundary-001', provider_package: OCCUPIED_PACKAGE, consumer_package: 'pkg-0012' }],
  };
  const view = buildPackageView({ ...input, obligations: { allocateManifest } }, OCCUPIED_PACKAGE);

  assert.deepEqual(view.obligationUnits.map((unit) => unit.unitId), ['ctr-boundary-001']);
  assert.equal(view.obligationSource, 'undeclared');
});

test('C004 the obligation section is the only difference in the rendered view', () => {
  const input = liveShapedInput();
  const allocateManifest = {
    contract_registry: [{ boundary_id: 'boundary-001', provider_package: OCCUPIED_PACKAGE, consumer_package: 'pkg-0012' }],
  };
  const view = buildPackageView({ ...input, obligations: { allocateManifest } }, OCCUPIED_PACKAGE);
  const withUnits = renderPackageViewMarkdown(view);
  const withoutUnits = renderPackageViewMarkdown({ ...view, obligationUnits: [] });

  const sectionStart = (text) => text.indexOf('## Obligation');
  const sectionEnd = (text) => text.indexOf('## Class names no manifest owns');
  assert.ok(sectionStart(withUnits) > 0, 'the section is rendered');
  assert.equal(withUnits.slice(0, sectionStart(withUnits)), withoutUnits.slice(0, sectionStart(withoutUnits)));
  assert.equal(withUnits.slice(sectionEnd(withUnits)), withoutUnits.slice(sectionEnd(withoutUnits)));
  assert.match(withUnits.slice(sectionStart(withUnits), sectionEnd(withUnits)), /ctr-boundary-001/);
  assert.match(withUnits.slice(sectionStart(withUnits), sectionEnd(withUnits)), /provides/);
});

test('C004 a served column is cross-checked with its measured counts, and an absent column is not dropped', () => {
  const input = liveShapedInput();
  const artifact = {
    ...input.artifact,
    operations: input.artifact.operations.map((operation) => ({ ...operation, verb: 'object.get' })),
    pins: { enumerations: [{ name: 'VerbMethod', members: ['object.get', 'object.unsubscribe'] }] },
  };
  const declared = [
    { interfaceId: 'surface-one', column: 'verb', operationSet: 'VerbMethod' },
    { interfaceId: 'surface-two', column: 'socket', operationSet: 'VerbMethod' },
  ];
  const view = buildPackageView({ ...input, artifact, obligations: { declared } }, OCCUPIED_PACKAGE);
  const markdown = renderPackageViewMarkdown(view);

  assert.equal(view.obligationSource, 'declared');
  assert.deepEqual(view.obligationUnits.map((unit) => unit.unitId), ['obl-surface-one', 'obl-surface-two']);
  assert.match(markdown, /cross-checked against verb/);
  assert.match(markdown, /not cross-checked: the artifact carries no socket column/);
});

test('C004 a view on disk that carries no obligation section reads as absent, never as satisfied', () => {
  assert.equal(obligationSourceOf({ packageId: 'pkg-0011' }), 'absent');
  assert.equal(obligationSourceOf({ packageId: 'pkg-0011', obligationSource: 'undeclared' }), 'undeclared');
});

// ---------------------------------------------------------------------------
// PX-260 — the recorded judgment reaches the view, with the ground a reader reviews
// ---------------------------------------------------------------------------

// [::TICKET::] PX-260 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-260 --for-spec --no-implementation-order`.
test('C004 a recorded assignment is a unit of the view, printed with its relation and its ground', () => {
  const input = liveShapedInput();
  const record = { serves: [], assignments: [{ unit: 'op-SyntheticOperation0001', ground: 'the specification states it on line 412' }] };
  const view = buildPackageView({ ...input, obligations: { allocateManifest: { contract_registry: [] }, declared: [], record } }, OCCUPIED_PACKAGE);
  const section = renderPackageViewMarkdown(view).slice(
    renderPackageViewMarkdown(view).indexOf('## Obligation'),
    renderPackageViewMarkdown(view).indexOf('## Class names no manifest owns'),
  );

  assert.deepEqual(view.obligationUnits.map((unit) => `${unit.unitId}:${unit.relation}`), ['op-SyntheticOperation0001:assigns']);
  assert.match(section, /\| assigns \| op-SyntheticOperation0001 \| SyntheticOperation0001 \| placed by a recorded judgment: the specification states it on line 412 \|/);
});

test('C004 an assignment with no ground reads as ungrounded rather than as a satisfied obligation', () => {
  const input = liveShapedInput();
  const record = { serves: [], assignments: [{ unit: 'op-SyntheticOperation0001', ground: '' }] };
  const view = buildPackageView({ ...input, obligations: { allocateManifest: { contract_registry: [] }, declared: [], record } }, OCCUPIED_PACKAGE);
  const markdown = renderPackageViewMarkdown(view);

  assert.match(markdown, /recorded with no ground/);
});

// [::TICKET::] PX-261, PX-262 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-261|PX-262) --for-spec --no-implementation-order`.
test('PX-261 the view carries the columns its package adjudicated away, and the section states each ground', () => {
  const input = liveShapedInput();
  const record = { version: 1, serves: [], assignments: [], adjudications: [{ column: 'id', ground: 'the specification states it on line 412' }] };
  const view = buildPackageView({ ...input, obligations: { allocateManifest: { contract_registry: [] }, declared: [], record } }, OCCUPIED_PACKAGE);
  const markdown = renderPackageViewMarkdown(view);

  assert.deepEqual(view.adjudicatedColumns, [{ column: 'id', ground: 'the specification states it on line 412', carriedBy: OCCUPIED_PACKAGE }], 'a version-1 adjudication is read as carrying the package that wrote it');
  assert.match(markdown, /Adjudicated away: id — the specification states it on line 412\./);
  assert.deepEqual(view.obligationUnits, [], 'an adjudication removes a question and places no duty');
});

test('PX-261 a view whose package adjudicated nothing carries an empty list, so the section reads as it did', () => {
  const input = liveShapedInput();
  const view = buildPackageView({ ...input, obligations: { allocateManifest: { contract_registry: [] } } }, OCCUPIED_PACKAGE);
  const markdown = renderPackageViewMarkdown(view);

  assert.deepEqual(view.adjudicatedColumns, []);
  assert.doesNotMatch(markdown, /Adjudicated away/);
});

test('C004 an assignment naming nothing the artifact holds is a finding of the view, and is not dressed as a unit', () => {
  const input = liveShapedInput();
  const record = { serves: [], assignments: [{ unit: 'op-NoSuchOperation', ground: 'the specification states it' }] };
  const view = buildPackageView({ ...input, obligations: { allocateManifest: { contract_registry: [] }, declared: [], record } }, OCCUPIED_PACKAGE);
  const markdown = renderPackageViewMarkdown(view);

  assert.deepEqual(view.obligationUnits.map((unit) => unit.unitId), []);
  assert.deepEqual(view.unboundAssignments, ['op-NoSuchOperation']);
  assert.match(markdown, /Recorded assignments naming no operation or sequence: op-NoSuchOperation\./);
});

