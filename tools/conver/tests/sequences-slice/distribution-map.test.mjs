// PX-307 @verifies C002
// The map is the only authored declaration in the distribution chain, so these tests
// pin its canonical form, its equality with the view, and the section resolution that
// every later layer reuses.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  collectViewUnits,
  kindOfUnit,
  mapDigest,
  parseDistributionMap,
  renderDistributionMap,
  resolveSections,
  validateMapAgainstView,
  viewDigest,
} from '../../.claude/scripts/sequences-slice/lib/distribution-map.mjs';

// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
function fixtureView() {
  return {
    packageId: 'pkg-1',
    ownedOperationUnits: [{
      unitId: 'op-Produce',
      operationId: 'Produce',
      resultObjectClasses: ['Thing'],
      ownerPackageIds: ['pkg-1'],
      roleCandidate: 'implementer',
      obligation: { purpose: 'produce', specLines: [12] },
    }],
    ownedSequenceUnits: [{
      unitId: 'seq-A-1',
      sequenceId: 'A-1',
      outcome: 'direct',
      ownerPackageIds: ['pkg-1'],
      steps: [{ stepId: 's1', operationId: 'Produce', contract: { pre: [], post: [] }, line: 12, quote: 'produce' }],
    }],
    crossBoundarySequenceUnits: [],
    obligationUnits: [{ unitId: 'obl-pkg-1', relation: 'serves', subject: 'Thing', direction: 'in', counterpart: 'pkg-2' }],
    unboundAssignments: [],
    adjudicatedColumns: [],
    obligationSource: 'declared',
    unmatchedClassNames: [],
    specLines: 100,
    lineRange: {},
  };
}

const RFC = [
  '# Pkg',
  '',
  '## 3.1 Produce',
  '',
  'The operation is designed here.',
  '',
  '## 3.2 Consume',
  '',
  'The consumer side.',
  '',
  '## Distribution ledger',
  '',
  'RFC.md is canonical for this package; the projection is an input, not an authority.',
  '',
].join('\n');

// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
function fixtureMap(view) {
  return {
    schemaVersion: 1,
    packageId: 'pkg-1',
    sourceViewDigest: viewDigest(view),
    units: [
      { unitId: 'obl-pkg-1', kind: 'surface', sections: ['3.2 Consume'], ground: 'surface designed here' },
      { unitId: 'op-Produce', kind: 'operation', role: 'implementer', sections: ['3.1 Produce'], ground: 'designed here' },
      { unitId: 'seq-A-1', kind: 'sequence', sections: ['3.2 Consume'], ground: 'flow designed here' },
    ],
    residuals: [{ unit: 'CommunityCertificate', ground: 'declared residual' }],
  };
}

test('C002 kindOfUnit names every prefix', () => {
  assert.equal(kindOfUnit('op-X'), 'operation');
  assert.equal(kindOfUnit('seq-X'), 'sequence');
  assert.equal(kindOfUnit('xdir-X'), 'cross-boundary-sequence');
  assert.equal(kindOfUnit('ctr-X'), 'contract');
  assert.equal(kindOfUnit('obl-X'), 'surface');
  assert.equal(kindOfUnit('other'), null);
});

test('C002 collectViewUnits deduplicates the four arrays and keeps payloads', () => {
  const units = collectViewUnits(fixtureView());
  assert.equal(units.size, 3);
  assert.equal(units.get('op-Produce').kind, 'operation');
  assert.equal(units.get('seq-A-1').kind, 'sequence');
  assert.equal(units.get('obl-pkg-1').kind, 'surface');
  assert.deepEqual(units.get('seq-A-1').record.steps.map((step) => step.stepId), ['s1']);
});

test('C002 viewDigest is stable for unrelated metadata and moves with a step contract', () => {
  const view = fixtureView();
  const base = viewDigest(view);
  assert.match(base, /^[0-9a-f]{64}$/);
  assert.equal(viewDigest({ ...view, specLines: 999 }), base);
  const changed = fixtureView();
  changed.ownedSequenceUnits[0].steps[0].contract = { pre: [{ factId: 'x', text: 'y' }], post: [] };
  assert.notEqual(viewDigest(changed), base);
});

test('C002 mapDigest excludes its own digest and moves with a ground', () => {
  const view = fixtureView();
  const map = fixtureMap(view);
  const base = mapDigest(map);
  assert.equal(mapDigest({ ...map, digest: 'f'.repeat(64) }), base);
  assert.notEqual(mapDigest({ ...map, units: map.units.map((unit, index) => (index === 0 ? { ...unit, ground: 'other' } : unit)) }), base);
});

test('C002 the rendered block round-trips through the parser', () => {
  const map = { ...fixtureMap(fixtureView()), digest: mapDigest(fixtureMap(fixtureView())) };
  const rendered = renderDistributionMap(map);
  assert.match(rendered, /```json distribution-map/);
  const parsed = parseDistributionMap(rendered);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.map, map);
});

test('C002 validateMapAgainstView reports missing, invented and a stale view digest', () => {
  const view = fixtureView();
  const map = fixtureMap(view);
  assert.equal(validateMapAgainstView(map, view).ok, true);

  const missing = { ...map, units: map.units.filter((unit) => unit.unitId !== 'seq-A-1') };
  const missingResult = validateMapAgainstView(missing, view);
  assert.equal(missingResult.ok, false);
  assert.equal(missingResult.code, 'MISSING_UNIT');
  assert.deepEqual(missingResult.missing, ['seq-A-1']);

  const invented = { ...map, units: [...map.units, { unitId: 'op-Invented', kind: 'operation', sections: ['3.1 Produce'], ground: 'x' }] };
  const inventedResult = validateMapAgainstView(invented, view);
  assert.equal(inventedResult.code, 'INVENTED_UNIT');
  assert.deepEqual(inventedResult.invented, ['op-Invented']);

  const stale = { ...map, sourceViewDigest: '0'.repeat(64) };
  assert.equal(validateMapAgainstView(stale, view).code, 'STALE_DISTRIBUTION_MAP');
});

// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
test('C002 a residual may account for a view unit the map does not distribute', () => {
  const view = fixtureView();
  const map = fixtureMap(view);
  const declaring = {
    ...map,
    units: map.units.filter((unit) => unit.unitId !== 'obl-pkg-1'),
    residuals: [...map.residuals, { unit: 'obl-pkg-1', ground: 'the view distributes it as a declared residual' }],
  };
  assert.equal(validateMapAgainstView(declaring, view).ok, true);
});

// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
test('C002 a unit declared both distributed and residual is refused', () => {
  const view = fixtureView();
  const map = fixtureMap(view);
  const doubled = { ...map, residuals: [...map.residuals, { unit: 'op-Produce', ground: 'also a residual' }] };
  const result = validateMapAgainstView(doubled, view);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'RESIDUAL_IS_A_MAP_UNIT');
  assert.deepEqual(result.units, ['op-Produce']);
});

test('C002 resolveSections matches exact text and an exact leading number', () => {
  const rfc = `${RFC}\n## 3.2.1 The normative scheme\n\nbody\n`;
  const exact = resolveSections(rfc, ['3.1 Produce']);
  assert.equal(exact.ok, true);
  assert.equal(exact.resolved[0].text, '3.1 Produce');

  const numbered = resolveSections(rfc, ['3.2']);
  assert.equal(numbered.ok, true);
  assert.equal(numbered.resolved[0].text, '3.2 Consume');

  const missing = resolveSections(rfc, ['3.9 Missing']);
  assert.equal(missing.ok, false);
  assert.equal(missing.code, 'MISSING_RFC_SECTION');
  assert.deepEqual(missing.missing, ['3.9 Missing']);

  const ambiguous = resolveSections(`${RFC}\n## 3.1 Produce\n\nduplicate\n`, ['3.1 Produce']);
  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.code, 'AMBIGUOUS_RFC_SECTION');
  assert.deepEqual(ambiguous.ambiguous, ['3.1 Produce']);
});

test('C002 additivity: an empty view has no units and no map requirement', () => {
  const empty = { ...fixtureView(), ownedOperationUnits: [], ownedSequenceUnits: [], crossBoundarySequenceUnits: [], obligationUnits: [] };
  assert.equal(collectViewUnits(empty).size, 0);
  assert.equal(validateMapAgainstView({ ...fixtureMap(empty), units: [], residuals: [], sourceViewDigest: viewDigest(empty) }, empty).ok, true);
});
