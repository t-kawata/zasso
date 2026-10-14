// PX-259 @verifies C003
// Coverage is a property of the union, so it is measured over the whole workspace and not per
// package: a demand that some package owes is assigned, a demand a person has adjudicated away is
// exempt, and a demand that is neither is a demand nobody owes. Reporting the third state as
// covered would prove nothing, because the guarantee's antecedent could not be discharged for it.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEMAND_AXES,
  EXEMPTION_ROUTES,
  collectAdjudicationRows,
  demandFactsOf,
  findUngroundedAdjudications,
  findUngroundedAssignments,
  measureCoverage,
  measureDischarge,
  refuseUnexemptibleDemand,
} from '../../.claude/scripts/sequences-slice/lib/obligation-coverage.mjs';

const OPERATIONS = [
  { id: 'R-0001', result_object_classes: ['Alpha'], verb: 'object.get' },
  { id: 'R-0002', result_object_classes: [], verb: 'object.get' },
];
const VOCABULARIES = { pins: { enumerations: [{ name: 'VerbMethod', members: ['object.get', 'object.unsubscribe'] }] } };

// The census the workspace borrowed, in the shape the rail's pin carries. A fixture that asserts
// the guarantee holds must state its denominator, because an artifact that is its own denominator
// is exactly what the coverage gate withholds a verdict on.
// [::TICKET::] PX-262 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-262 --for-spec --no-implementation-order`.
const CENSUS = {
  sourceEnumerations: [
    { role: 'operations', name: 'census-operations', members: ['R-0001', 'R-0002'] },
    { role: 'entries', name: 'census-entries', members: ['S-0001'] },
  ],
};

/** A workspace whose one package owns the first operation and serves the verb column. */
// [::TICKET::] PX-259 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-259 --for-spec --no-implementation-order`.
// [::TICKET::] PX-260, PX-261, PX-262, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-260|PX-261|PX-262|PX-263) --for-spec --no-implementation-order`.
function workspaceWithOwnership({ serveVerb = false, contractSide = null, assignments = [] } = {}) {
  const obligations = [];
  if (serveVerb) obligations.push({ unitId: 'obl-surface-one', relation: 'serves', subject: 'surface-one', coverage: { column: 'verb', carried: 2, total: 2, uncoveredSpellings: ['object.unsubscribe'], crossChecked: true } });
  if (contractSide !== null) obligations.push({ unitId: `ctr-${contractSide}`, relation: 'carries', subject: contractSide, direction: 'provides', counterpart: 'pkg-b' });
  obligations.push(...assignments);
  return [{
    packageId: 'pkg-a',
    ownedOperationUnits: [{ unitId: 'op-R-0001', operationId: 'R-0001', resultObjectClasses: ['Alpha'], ownerPackageIds: ['pkg-a'], unmatchedClassNames: [] }],
    ownedSequenceUnits: [],
    crossBoundarySequenceUnits: [],
    obligationUnits: obligations,
  }];
}

/** The recorded judgment that places one demand, in the shape the view carries it. */
// [::TICKET::] PX-260, PX-261, PX-262, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-260|PX-261|PX-262|PX-263) --for-spec --no-implementation-order`.
function assignmentOf(unitId, kind, ground = 'the specification states it on line 412') {
  return { unitId, relation: 'assigns', subject: unitId.slice(unitId.indexOf('-') + 1), kind, ground };
}

const artifact = { spec: { lines: 1000 }, ...VOCABULARIES, pins: { ...VOCABULARIES.pins, ...CENSUS }, operations: OPERATIONS, sequences: [{ id: 'S-0001', outcome: 'direct' }], steps: [] };

test('C003 an operation no owner reaches and no served column assigns is unassigned, and the guarantee is not established', () => {
  const coverage = measureCoverage({ artifact, allocateManifest: { contract_registry: [] }, views: workspaceWithOwnership(), exemptions: [] });

  assert.deepEqual(coverage.axes.operations.assigned.map((demand) => demand.id), ['R-0001']);
  assert.deepEqual(coverage.axes.operations.unassigned.map((demand) => demand.id), ['R-0002']);
  assert.equal(coverage.verdict, 'not established');
});

test('C003 a served column assigns every operation that carries it, including one no owner reaches', () => {
  const coverage = measureCoverage({
    artifact, allocateManifest: { contract_registry: [] },
    views: workspaceWithOwnership({ serveVerb: true, contractSide: 'boundary-001', assignments: [assignmentOf('seq-S-0001', 'sequence')] }),
    exemptions: [],
  });

  assert.deepEqual(coverage.axes.operations.unassigned, []);
  assert.equal(coverage.verdict, 'holds');
});

test('PX-260 a recorded assignment places the sequence an exemption would have removed, and the exemption is refused', () => {
  const exemptions = [{ subject: 'S-0001', lens: 'obligation', why: 'the specification states no procedure for it' }];
  const byExemption = measureCoverage({ artifact, allocateManifest: { contract_registry: [] }, views: workspaceWithOwnership({ serveVerb: true }), exemptions });
  const byAssignment = measureCoverage({ artifact, allocateManifest: { contract_registry: [] }, views: workspaceWithOwnership({ serveVerb: true, assignments: [assignmentOf('seq-S-0001', 'sequence')] }), exemptions: [] });

  assert.deepEqual(byExemption.refusedExemptions.map((row) => `${row.kind}:${row.id}`), ['sequence:S-0001']);
  assert.deepEqual(byExemption.axes.sequences.unassigned.map((demand) => demand.id), ['S-0001'], 'the demand the exemption named stays unassigned');
  assert.equal(byExemption.verdict, 'not established');
  assert.deepEqual(byAssignment.axes.sequences.unassigned, []);
  assert.equal(byAssignment.verdict, 'holds');
});

test('C003 a boundary no view holds is unassigned until a package carries it', () => {
  const allocateManifest = { contract_registry: [{ boundary_id: 'boundary-001', provider_package: 'pkg-a', consumer_package: 'pkg-b' }] };
  const before = measureCoverage({ artifact, allocateManifest, views: workspaceWithOwnership(), exemptions: [] });
  const after = measureCoverage({ artifact, allocateManifest, views: workspaceWithOwnership({ contractSide: 'boundary-001' }), exemptions: [] });

  assert.deepEqual(before.axes.boundaries.unassigned.map((demand) => demand.id), ['boundary-001']);
  assert.deepEqual(after.axes.boundaries.assigned.map((demand) => demand.id), ['boundary-001']);
});

test('C003 an ownerless sequence is unassigned, and only a recorded assignment removes it', () => {
  const allocateManifest = { contract_registry: [] };
  const unassigned = measureCoverage({ artifact, allocateManifest, views: workspaceWithOwnership(), exemptions: [] });
  const exempted = measureCoverage({ artifact, allocateManifest, views: workspaceWithOwnership(), exemptions: [{ subject: 'S-0001', lens: 'obligation', why: 'no procedure is stated for it' }] });
  const assigned = measureCoverage({ artifact, allocateManifest, views: workspaceWithOwnership({ assignments: [assignmentOf('seq-S-0001', 'sequence')] }), exemptions: [] });

  assert.deepEqual(unassigned.axes.sequences.unassigned.map((demand) => demand.id), ['S-0001']);
  assert.deepEqual(exempted.axes.sequences.exempt, [], 'a sequence may not be exempted out of the demand');
  assert.deepEqual(exempted.refusedExemptions.map((row) => row.kind), ['sequence']);
  assert.deepEqual(assigned.axes.sequences.assigned.map((demand) => `${demand.id}:${demand.by}`), ['S-0001:assigns']);
  assert.deepEqual(assigned.axes.sequences.unassigned, []);
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
    exemptions: [{ subject: 'verb', lens: 'obligation', why: 'the column is a protocol verb, not a surface', carriedBy: 'pkg-a' }],
  });

  assert.deepEqual(unadjudicated.axes.surfaces.unassigned.map((demand) => demand.id), ['verb']);
  assert.deepEqual(unadjudicated.axes.surfaces.unassigned.map((demand) => demand.kind), ['surface']);
  assert.deepEqual(adjudicated.axes.surfaces.exempt.map((demand) => demand.id), ['verb']);
  assert.deepEqual(adjudicated.refusedExemptions, [], 'a column is the kind an adjudication may exempt');
  assert.deepEqual(adjudicated.axes.surfaces.unassigned, [], 'the exempt surface is no longer unassigned');
  assert.equal(adjudicated.verdict, 'not established', 'the unassigned operations still withhold the guarantee');
  assert.equal(measureCoverage({
    artifact, allocateManifest, views: workspaceWithOwnership({ serveVerb: true, contractSide: 'boundary-001', assignments: [assignmentOf('seq-S-0001', 'sequence')] }),
    exemptions: [],
  }).verdict, 'holds');
});

test('C005 the partition is total and disjoint, and the verdict follows unassigned and refused together', () => {
  const coverage = measureCoverage({ artifact, allocateManifest: { contract_registry: [] }, views: workspaceWithOwnership(), exemptions: [] });

  assert.deepEqual(Object.keys(coverage.axes), [...DEMAND_AXES]);
  for (const axis of DEMAND_AXES) {
    const { assigned, exempt, unassigned } = coverage.axes[axis];
    const ids = [...assigned, ...exempt, ...unassigned].map((demand) => demand.id);
    assert.equal(new Set(ids).size, ids.length, `${axis} is disjoint`);
  }
  assert.equal(coverage.axes.operations.assigned.length + coverage.axes.operations.exempt.length + coverage.axes.operations.unassigned.length, OPERATIONS.length);
  const everyUnassigned = DEMAND_AXES.flatMap((axis) => coverage.axes[axis].unassigned);
  assert.equal(coverage.verdict, everyUnassigned.length === 0 && coverage.refusedExemptions.length === 0 && coverage.denominatorGaps.length === 0 ? 'holds' : 'not established');
});

test('C005 the verdict is never holds while a refused exemption is recorded', () => {
  const served = workspaceWithOwnership({ serveVerb: true });
  const refused = measureCoverage({
    artifact, allocateManifest: { contract_registry: [] }, views: served,
    exemptions: [{ subject: 'S-0001', lens: 'obligation', why: 'the specification states no procedure for it' }],
  });

  assert.deepEqual(DEMAND_AXES.flatMap((axis) => refused.axes[axis].unassigned).map((demand) => demand.id), ['S-0001']);
  assert.equal(refused.refusedExemptions.length, 1);
  assert.equal(refused.verdict, 'not established', 'a workspace cannot earn the guarantee by removing the duty instead of placing it');
});

test('C005 every assigned demand names the relation that assigned it, and the distribution is measured once', () => {
  const coverage = measureCoverage({
    artifact,
    allocateManifest: { contract_registry: [{ boundary_id: 'boundary-001', provider_package: 'pkg-a', consumer_package: 'pkg-b' }] },
    views: workspaceWithOwnership({ serveVerb: true, contractSide: 'boundary-001', assignments: [assignmentOf('seq-S-0001', 'sequence')] }),
    exemptions: [],
  });

  assert.deepEqual(coverage.axes.operations.assigned.map((demand) => demand.by), ['owns', 'serves']);
  assert.deepEqual(coverage.axes.sequences.assigned.map((demand) => demand.by), ['assigns']);
  assert.deepEqual(coverage.axes.boundaries.assigned.map((demand) => demand.by), ['carries']);
  assert.deepEqual(coverage.assignmentDistribution, [{ packageId: 'pkg-a', count: 4 }]);
  assert.equal(coverage.demandCounts.operations, OPERATIONS.length);
});

test('PX-260 a workspace that places every demand on one package still holds, and the distribution names it', () => {
  const coverage = measureCoverage({
    artifact,
    allocateManifest: { contract_registry: [{ boundary_id: 'boundary-001', provider_package: 'pkg-a', consumer_package: 'pkg-b' }] },
    views: workspaceWithOwnership({ serveVerb: true, contractSide: 'boundary-001', assignments: [assignmentOf('seq-S-0001', 'sequence')] }),
    exemptions: [],
  });

  assert.equal(coverage.verdict, 'holds');
  assert.deepEqual(coverage.assignmentDistribution.map((row) => row.packageId), ['pkg-a'], 'the concentration is visible rather than forbidden');
});

test('PX-260 an assignment with no ground is named and never counted toward the verdict', () => {
  const views = workspaceWithOwnership({ assignments: [{ ...assignmentOf('op-R-0002', 'operation'), ground: '' }] });
  const coverage = measureCoverage({ artifact, allocateManifest: { contract_registry: [] }, views, exemptions: [] });

  assert.deepEqual(findUngroundedAssignments(views), ['pkg-a']);
  assert.deepEqual(coverage.axes.operations.unassigned.map((demand) => demand.id), ['R-0002'], 'an ungrounded judgment places nothing');
  assert.equal(coverage.verdict, 'not established');
});

test('PX-260 the exemption refuser separates the kinds an adjudication may empty from the two it may not', () => {
  const demands = { operation: ['R-0001', 'R-0002'], sequence: ['S-0001'], boundary: ['boundary-001'], surface: ['verb'] };
  const rows = [
    { subject: 'R-0002', lens: 'obligation', why: 'no procedure is stated' },
    { subject: 'S-0001', lens: 'obligation', why: 'no procedure is stated' },
    { subject: 'verb', lens: 'obligation', why: 'a protocol verb, not a surface', carriedBy: 'pkg-a' },
    { subject: 'boundary-001', lens: 'obligation', why: 'the boundary carries no clause', carriedBy: 'pkg-a' },
  ];
  const { allowed, refused } = refuseUnexemptibleDemand(rows, demands);

  assert.deepEqual(refused.map((row) => `${row.kind}:${row.id}`), ['operation:R-0002', 'sequence:S-0001']);
  assert.deepEqual(allowed.map((row) => row.subject), ['verb', 'boundary-001']);
  assert.deepEqual(refused[0].why, 'no procedure is stated');
});

test('PX-260 an exemption row with no ground is not an adjudication, so it is neither allowed nor refused', () => {
  const { allowed, refused } = refuseUnexemptibleDemand([{ subject: 'S-0001', lens: 'obligation', why: '   ' }], { sequence: ['S-0001'] });

  assert.deepEqual(allowed, []);
  assert.deepEqual(refused, []);
});

test('C003 the demand facts name the candidate columns, the boundary count and the counts the partition walks', () => {
  const allocateManifest = { contract_registry: [{ boundary_id: 'boundary-001', provider_package: 'pkg-a', consumer_package: 'pkg-b' }] };
  const facts = demandFactsOf({ artifact, allocateManifest });
  const coverage = measureCoverage({ artifact, allocateManifest, views: workspaceWithOwnership(), exemptions: [] });

  assert.deepEqual(facts.candidateColumns, ['verb']);
  assert.equal(facts.boundaryCount, 1);
  assert.deepEqual(facts.counts, { operations: 2, sequences: 1, boundaries: 1, surfaces: 1 });
  assert.equal(facts.counts.operations, coverage.demandCounts.operations);
  assert.equal(facts.counts.boundaries, coverage.demandCounts.boundaries);
});

test('C003 a second measurement over unchanged inputs is byte-identical, and a written judgment shrinks one axis alone', () => {
  const allocateManifest = { contract_registry: [] };
  const before = measureCoverage({ artifact, allocateManifest, views: workspaceWithOwnership(), exemptions: [] });
  const repeated = measureCoverage({ artifact, allocateManifest, views: workspaceWithOwnership(), exemptions: [] });
  const after = measureCoverage({ artifact, allocateManifest, views: workspaceWithOwnership({ assignments: [assignmentOf('seq-S-0001', 'sequence')] }), exemptions: [] });

  assert.equal(JSON.stringify(repeated), JSON.stringify(before));
  assert.deepEqual(before.axes.sequences.unassigned.map((demand) => demand.id), ['S-0001']);
  assert.deepEqual(after.axes.sequences.unassigned, []);
  assert.deepEqual(after.axes.operations.unassigned, before.axes.operations.unassigned, 'no other axis moved');
});

// ---------------------------------------------------------------------------
// PX-261 — two exemption routes, one refuser; a ground that must resolve; the discharge
// ---------------------------------------------------------------------------

/** A view carrying the columns its package adjudicated away. */
// [::TICKET::] PX-261, PX-262, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-261|PX-262|PX-263) --for-spec --no-implementation-order`.
function workspaceWithAdjudications(adjudicatedColumns) {
  return workspaceWithOwnership().map((view) => ({ ...view, adjudicatedColumns: adjudicatedColumns.map((entry) => ({ carriedBy: 'pkg-a', ...entry })) }));
}

test('PX-261 an adjudicated column is exempt through the same refuser the artifact rows reach, and its route is named', () => {
  const views = workspaceWithAdjudications([{ column: 'verb', ground: 'the specification states it on line 412' }]);
  const coverage = measureCoverage({ artifact, allocateManifest: { contract_registry: [] }, views, exemptions: [] });

  assert.deepEqual(coverage.axes.surfaces.exempt.map((demand) => demand.id), ['verb']);
  assert.deepEqual(coverage.refusedExemptions, []);
  assert.deepEqual(coverage.assignmentDistribution.map((row) => row.packageId), ['pkg-a']);
});

test('PX-261 collectAdjudicationRows tags each row with the route it came from', () => {
  const rows = collectAdjudicationRows(workspaceWithAdjudications([{ column: 'id', ground: 'stated at line 3' }]));

  assert.deepEqual(rows, [{ subject: 'id', lens: 'obligation', why: 'stated at line 3', route: 'record', carriedBy: 'pkg-a' }]);
  assert.deepEqual([...EXEMPTION_ROUTES], ['artifact', 'record']);
});

test('PX-261 a recorded adjudication naming an operation is refused exactly as an artifact row naming one is', () => {
  const demands = { operation: ['R-0001', 'R-0002'], sequence: ['S-0001'], boundary: [], surface: ['verb'] };
  const artifactRow = { subject: 'R-0002', lens: 'obligation', why: 'no procedure is stated', carriedBy: 'pkg-a' };
  const recordRow = { subject: 'R-0002', lens: 'obligation', why: 'no procedure is stated', carriedBy: 'pkg-a', route: 'record' };

  assert.equal(refuseUnexemptibleDemand([artifactRow], demands).refused[0].kind, 'operation');
  assert.equal(refuseUnexemptibleDemand([recordRow], demands).refused[0].kind, 'operation');
  assert.deepEqual(refuseUnexemptibleDemand([recordRow], demands).allowed, []);
});

test('PX-261 an adjudication with no ground exempts nothing and is named', () => {
  const views = workspaceWithAdjudications([{ column: 'verb', ground: '   ' }]);
  const coverage = measureCoverage({ artifact, allocateManifest: { contract_registry: [] }, views, exemptions: [] });

  assert.deepEqual(findUngroundedAdjudications(views), ['pkg-a']);
  assert.deepEqual(coverage.axes.surfaces.exempt, []);
  assert.deepEqual(coverage.axes.surfaces.unassigned.map((demand) => demand.id), ['verb']);
});

test('PX-261 a ground that does not resolve withholds the verdict, whichever route carried it', () => {
  const views = workspaceWithAdjudications([{ column: 'verb', ground: 'it is obviously required', carriedBy: 'pkg-a' }]);
  const coverage = measureCoverage({ artifact, allocateManifest: { contract_registry: [] }, views, exemptions: [] });

  assert.deepEqual(coverage.unresolvedGrounds.map((row) => `${row.subject}:${row.route}`), ['verb:record']);
  assert.equal(coverage.verdict, 'not established');
});

test('PX-261 an assignment whose ground does not resolve is reported and places nothing', () => {
  const views = workspaceWithOwnership({ assignments: [{ ...assignmentOf('seq-S-0001', 'sequence'), ground: 'line 99999' }] });
  const coverage = measureCoverage({ artifact, allocateManifest: { contract_registry: [] }, views, exemptions: [] });

  assert.deepEqual(coverage.unresolvedGrounds.map((row) => `${row.subject}:${row.route}`), ['S-0001:assigns']);
  assert.deepEqual(coverage.axes.sequences.unassigned.map((demand) => demand.id), ['S-0001']);
});

test('PX-261 measureDischarge reports every unit a view holds that no ledger accounts for', () => {
  const views = workspaceWithOwnership({ contractSide: 'boundary-001' });
  const accounted = measureDischarge({ views, ledgersByPackage: new Map([['pkg-a', new Set(['op-R-0001', 'ctr-boundary-001'])]]) });
  const short = measureDischarge({ views, ledgersByPackage: new Map([['pkg-a', new Set(['op-R-0001'])]]) });

  assert.deepEqual(accounted.unaccounted, []);
  assert.deepEqual(short.unaccounted, [{ packageId: 'pkg-a', unitIds: ['ctr-boundary-001'] }]);
});

test('PX-261 measureDischarge separates a package with no ledger from one whose ledger omits a unit', () => {
  const views = workspaceWithOwnership();
  const result = measureDischarge({ views, ledgersByPackage: new Map() });

  assert.deepEqual(result.unaccounted, []);
  assert.deepEqual(result.withoutLedger, ['pkg-a']);
  assert.deepEqual(measureDischarge({ views: [], ledgersByPackage: new Map() }), { unaccounted: [], withoutLedger: [] });
});

test('PX-261 a package holding no unit is not reported as lacking a ledger', () => {
  const views = [{ packageId: 'pkg-a', ownedOperationUnits: [], ownedSequenceUnits: [], crossBoundarySequenceUnits: [], obligationUnits: [] }];

  assert.deepEqual(measureDischarge({ views, ledgersByPackage: new Map() }), { unaccounted: [], withoutLedger: [] });
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

// ---------------------------------------------------------------------------
// PX-262 — the denominator: what each axis is measured against, and the verdict withheld when
// nothing outside the artifact states it
// ---------------------------------------------------------------------------

/** The same artifact with no census borrowed, which is the state the live workspace is in. */
// [::TICKET::] PX-262, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-262|PX-263) --for-spec --no-implementation-order`.
function artifactWithoutCensus() {
  return { spec: { lines: 1000 }, ...VOCABULARIES, pins: { ...VOCABULARIES.pins, sourceEnumerations: [] }, operations: OPERATIONS, sequences: [{ id: 'S-0001', outcome: 'direct' }], steps: [] };
}

/** A workspace in which every demand is placed: the ownership relation plus a served column. */
// [::TICKET::] PX-262, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-262|PX-263) --for-spec --no-implementation-order`.
function fullyAssignedViews() {
  return workspaceWithOwnership({ serveVerb: true, assignments: [assignmentOf('seq-S-0001', 'sequence')] });
}

test('C002 every demand assigned and no census borrowed is not established, and the gate names the axes', () => {
  const coverage = measureCoverage({ artifact: artifactWithoutCensus(), allocateManifest: { contract_registry: [] }, views: fullyAssignedViews(), exemptions: [] });

  assert.deepEqual(DEMAND_AXES.flatMap((axis) => coverage.axes[axis].unassigned), [], 'nothing is unassigned');
  assert.deepEqual(coverage.refusedExemptions, []);
  assert.deepEqual(coverage.denominatorGaps.map((gap) => gap.axis), ['operations', 'sequences']);
  assert.equal(coverage.verdict, 'not established', 'a workspace cannot earn the guarantee against a denominator it supplied itself');
});

test('C002 the same workspace with the census borrowed holds, so the gap is what moved the verdict', () => {
  const coverage = measureCoverage({ artifact, allocateManifest: { contract_registry: [] }, views: fullyAssignedViews(), exemptions: [] });

  assert.deepEqual(coverage.denominatorGaps, []);
  assert.equal(coverage.verdict, 'holds');
});

test('C002 invariant: a holds verdict always carries an empty gap list', () => {
  const complete = fullyAssignedViews();
  const incomplete = workspaceWithOwnership({ serveVerb: true });

  for (const withCensus of [true, false]) {
    for (const views of [complete, incomplete]) {
      const coverage = measureCoverage({ artifact: withCensus ? artifact : artifactWithoutCensus(), allocateManifest: { contract_registry: [] }, views, exemptions: [] });
      if (coverage.verdict === 'holds') assert.equal(coverage.denominatorGaps.length, 0);
    }
  }
});

// PX-263: the surfaces axis is stated by a pinned vocabulary the candidate columns instantiate, so
// the live shape yields two gaps rather than three — the route was added, and no route was removed.
test('C002 the live shape: an empty census pin plus an agreeing registry yield the two census gaps, with the surfaces stated by the pinned vocabulary', () => {
  const coverage = measureCoverage({
    artifact: artifactWithoutCensus(),
    allocateManifest: { contract_registry: [{ boundary_id: 'B-1', contract_id: 'C-1' }] },
    treeManifest: { stage2_handoff: { contract_boundaries: [{ id: 'B-1' }] } },
    views: workspaceWithOwnership(),
    exemptions: [],
  });

  assert.deepEqual(coverage.denominatorGaps.map((gap) => gap.axis), ['operations', 'sequences']);
  assert.equal(coverage.denominator.surfaces.source, 'declaration', 'the vocabulary the candidate column uses is the statement');
  assert.equal(coverage.denominator.boundaries.source, 'registry');
  assert.equal(coverage.verdict, 'not established');
});

test('C004 a version-2 exemption naming no carrier is refused by name and its demand stays unassigned', () => {
  const views = workspaceWithAdjudications([{ column: 'verb', ground: 'the specification states it on line 412', carriedBy: '' }]);
  const coverage = measureCoverage({ artifact, allocateManifest: { contract_registry: [] }, views, exemptions: [] });

  assert.deepEqual(coverage.refusedExemptions.map((row) => row.id), ['verb']);
  assert.match(coverage.refusedExemptions[0].why, /carriedBy/, 'the refusal names the field it lacks');
  assert.deepEqual(coverage.axes.surfaces.exempt, [], 'a park is not a placement');
  assert.deepEqual(coverage.axes.surfaces.unassigned.map((demand) => demand.id), ['verb']);
});

test('C004 invariant: the demand total is invariant, and the unassigned count is what changes', () => {
  const placed = workspaceWithAdjudications([{ column: 'verb', ground: 'the specification states it on line 412', carriedBy: 'pkg-a' }]);
  const parked = workspaceWithAdjudications([{ column: 'verb', ground: 'the specification states it on line 412', carriedBy: '' }]);
  const none = workspaceWithOwnership();
  const total = (views) => Object.values(measureCoverage({ artifact, allocateManifest: { contract_registry: [] }, views, exemptions: [] }).demandCounts).reduce((sum, count) => sum + count, 0);
  const unassigned = (views) => DEMAND_AXES.flatMap((axis) => measureCoverage({ artifact, allocateManifest: { contract_registry: [] }, views, exemptions: [] }).axes[axis].unassigned).length;

  assert.equal(total(none), total(placed));
  assert.equal(total(none), total(parked));
  assert.equal(unassigned(placed), unassigned(none) - 1, 'a carried exemption places the demand');
  assert.equal(unassigned(parked), unassigned(none), 'a parked exemption places nothing');
});

test('C004 boundary: an exemption whose subject is a candidate column and names no carrier does not park it', () => {
  const parked = workspaceWithAdjudications([{ column: 'verb', ground: 'the specification states it on line 412', carriedBy: '' }]);
  const none = workspaceWithOwnership();

  assert.deepEqual(
    measureCoverage({ artifact, allocateManifest: { contract_registry: [] }, views: parked, exemptions: [] }).axes.surfaces,
    measureCoverage({ artifact, allocateManifest: { contract_registry: [] }, views: none, exemptions: [] }).axes.surfaces,
  );
});

test('C005 an exemption that names its carrier is allowed, which is the rule the next version keeps', () => {
  const views = workspaceWithAdjudications([{ column: 'verb', ground: 'the specification states it on line 412', carriedBy: 'pkg-a' }]);
  const coverage = measureCoverage({ artifact, allocateManifest: { contract_registry: [] }, views, exemptions: [] });

  assert.deepEqual(coverage.refusedExemptions, []);
  assert.deepEqual(coverage.allowedExemptions.map((row) => [row.subject, row.carriedBy]), [['verb', 'pkg-a']]);
  assert.deepEqual(coverage.axes.surfaces.exempt.map((demand) => demand.id), ['verb']);
});

test('C005 every refused exemption is reported with the route it came from, so the two repairs stay apart', () => {
  const views = workspaceWithAdjudications([{ column: 'verb', ground: 'the specification states it on line 412', carriedBy: '' }]);
  const fromRecord = measureCoverage({ artifact, allocateManifest: { contract_registry: [] }, views, exemptions: [] });
  const fromArtifact = measureCoverage({
    artifact, allocateManifest: { contract_registry: [] }, views: workspaceWithOwnership(),
    exemptions: [{ subject: 'verb', lens: 'obligation', why: 'the column is a protocol verb' }],
  });

  assert.deepEqual(fromRecord.refusedExemptions.map((row) => row.route), ['record']);
  assert.deepEqual(fromArtifact.refusedExemptions.map((row) => row.route), ['artifact']);
});
