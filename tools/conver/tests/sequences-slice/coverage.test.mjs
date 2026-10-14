// PX-259 @verifies C003
// Coverage is a property of the union, so it is measured over the whole workspace and not per
// package: a demand that some package owes is assigned, a demand a person has adjudicated away is
// exempt, and a demand that is neither is a demand nobody owes. Reporting the third state as
// covered would prove nothing, because the guarantee's antecedent could not be discharged for it.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEMAND_AXES, measureCoverage } from '../../.claude/scripts/sequences-slice/lib/obligation-coverage.mjs';

const OPERATIONS = [
  { id: 'R-0001', result_object_classes: ['Alpha'], verb: 'object.get' },
  { id: 'R-0002', result_object_classes: [], verb: 'object.get' },
];
const VOCABULARIES = { pins: { enumerations: [{ name: 'VerbMethod', members: ['object.get', 'object.unsubscribe'] }] } };

/** A workspace whose one package owns the first operation and serves the verb column. */
// [::TICKET::] PX-259 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-259 --for-spec --no-implementation-order`.
function workspaceWithOwnership({ serveVerb = false, contractSide = null } = {}) {
  const obligations = [];
  if (serveVerb) obligations.push({ unitId: 'obl-surface-one', relation: 'serves', subject: 'surface-one', coverage: { column: 'verb', carried: 2, total: 2, uncoveredSpellings: ['object.unsubscribe'], crossChecked: true } });
  if (contractSide !== null) obligations.push({ unitId: `ctr-${contractSide}`, relation: 'carries', subject: contractSide, direction: 'provides', counterpart: 'pkg-b' });
  return [{
    packageId: 'pkg-a',
    ownedOperationUnits: [{ unitId: 'op-R-0001', operationId: 'R-0001', resultObjectClasses: ['Alpha'], ownerPackageIds: ['pkg-a'], unmatchedClassNames: [] }],
    ownedSequenceUnits: [],
    crossBoundarySequenceUnits: [],
    obligationUnits: obligations,
  }];
}

const artifact = { ...VOCABULARIES, operations: OPERATIONS, sequences: [{ id: 'S-0001', outcome: 'direct' }], steps: [] };

test('C003 an operation no owner reaches and no served column assigns is unassigned, and the guarantee is not established', () => {
  const coverage = measureCoverage({ artifact, allocateManifest: { contract_registry: [] }, views: workspaceWithOwnership(), exemptions: [] });

  assert.deepEqual(coverage.axes.operations.assigned.map((demand) => demand.id), ['R-0001']);
  assert.deepEqual(coverage.axes.operations.unassigned.map((demand) => demand.id), ['R-0002']);
  assert.equal(coverage.verdict, 'not established');
});

test('C003 a served column assigns every operation that carries it, including one no owner reaches', () => {
  const coverage = measureCoverage({ artifact, allocateManifest: { contract_registry: [] }, views: workspaceWithOwnership({ serveVerb: true }), exemptions: [{ subject: 'S-0001', lens: 'obligation', why: 'the specification states no procedure for it' }] });

  assert.deepEqual(coverage.axes.operations.unassigned, []);
  assert.equal(coverage.verdict, 'holds');
});

test('C003 a boundary no view holds is unassigned until a package carries it', () => {
  const allocateManifest = { contract_registry: [{ boundary_id: 'boundary-001', provider_package: 'pkg-a', consumer_package: 'pkg-b' }] };
  const before = measureCoverage({ artifact, allocateManifest, views: workspaceWithOwnership(), exemptions: [] });
  const after = measureCoverage({ artifact, allocateManifest, views: workspaceWithOwnership({ contractSide: 'boundary-001' }), exemptions: [] });

  assert.deepEqual(before.axes.boundaries.unassigned.map((demand) => demand.id), ['boundary-001']);
  assert.deepEqual(after.axes.boundaries.assigned.map((demand) => demand.id), ['boundary-001']);
});

test('C003 an ownerless sequence is unassigned, and an exemption row removes it with its ground', () => {
  const allocateManifest = { contract_registry: [] };
  const unassigned = measureCoverage({ artifact, allocateManifest, views: workspaceWithOwnership(), exemptions: [] });
  const exempted = measureCoverage({ artifact, allocateManifest, views: workspaceWithOwnership(), exemptions: [{ subject: 'S-0001', lens: 'obligation', why: 'no procedure is stated for it', }] });

  assert.deepEqual(unassigned.axes.sequences.unassigned.map((demand) => demand.id), ['S-0001']);
  assert.deepEqual(exempted.axes.sequences.exempt.map((demand) => demand.id), ['S-0001']);
  assert.deepEqual(exempted.axes.sequences.unassigned, []);
});

test('C003 an exemption with no ground exempts nothing', () => {
  const coverage = measureCoverage({ artifact, allocateManifest: { contract_registry: [] }, views: workspaceWithOwnership(), exemptions: [{ subject: 'S-0001', lens: 'obligation', why: '   ' }] });

  assert.deepEqual(coverage.axes.sequences.exempt, []);
  assert.deepEqual(coverage.axes.sequences.unassigned.map((demand) => demand.id), ['S-0001']);
});

test('C003 an unadjudicated candidate column is a surface demand, and exempting it makes the workspace hold', () => {
  const allocateManifest = { contract_registry: [] };
  const unadjudicated = measureCoverage({ artifact, allocateManifest, views: workspaceWithOwnership(), exemptions: [] });
  const adjudicated = measureCoverage({
    artifact, allocateManifest, views: workspaceWithOwnership(),
    exemptions: [{ subject: 'verb', lens: 'obligation', why: 'the column is a protocol verb, not a surface' }, { subject: 'S-0001', lens: 'obligation', why: 'no procedure stated' }],
  });

  assert.deepEqual(unadjudicated.axes.surfaces.unassigned.map((demand) => demand.id), ['verb']);
  assert.deepEqual(unadjudicated.axes.surfaces.unassigned.map((demand) => demand.kind), ['surface']);
  assert.deepEqual(adjudicated.axes.surfaces.exempt.map((demand) => demand.id), ['verb']);
  assert.equal(adjudicated.verdict, 'not established');
  assert.equal(measureCoverage({
    artifact, allocateManifest, views: workspaceWithOwnership({ serveVerb: true }),
    exemptions: [{ subject: 'S-0001', lens: 'obligation', why: 'no procedure stated' }],
  }).verdict, 'holds');
});

test('C003 the partition is total and disjoint, and the verdict follows unassigned alone', () => {
  const coverage = measureCoverage({ artifact, allocateManifest: { contract_registry: [] }, views: workspaceWithOwnership(), exemptions: [] });

  assert.deepEqual(Object.keys(coverage.axes), [...DEMAND_AXES]);
  for (const axis of DEMAND_AXES) {
    const { assigned, exempt, unassigned } = coverage.axes[axis];
    const ids = [...assigned, ...exempt, ...unassigned].map((demand) => demand.id);
    assert.equal(new Set(ids).size, ids.length, `${axis} is disjoint`);
  }
  assert.equal(coverage.axes.operations.assigned.length + coverage.axes.operations.exempt.length + coverage.axes.operations.unassigned.length, OPERATIONS.length);
  const everyUnassigned = DEMAND_AXES.flatMap((axis) => coverage.axes[axis].unassigned);
  assert.equal(coverage.verdict, everyUnassigned.length === 0 ? 'holds' : 'not established');
});

test('C003 the objects owned by packages no operation reaches are counted beside the axes', () => {
  const treeManifest = {
    inventory: { objects: [
      { canonical_name: 'Alpha', owner_package: 'pkg-a' },
      { canonical_name: 'RelayGrant', owner_package: 'pkg-network' },
      { canonical_name: 'FindResult', owner_package: 'pkg-network' },
    ] },
  };
  const coverage = measureCoverage({ artifact, allocateManifest: { contract_registry: [] }, views: workspaceWithOwnership(), exemptions: [], treeManifest });

  assert.equal(coverage.unreachedOwnedObjects, 2);
});
