// PX-309 @verifies C002
// Gaia's ledger vocabulary predates the map: a row may declare a unit a `declared-residual`
// and an operation may be owned by several packages at once. The bootstrap must read both
// without losing what the RFC authored.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderDistribution } from '../../.claude/scripts/grill-me-for-rfc/render-distribution.mjs';

// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
function fixtureView() {
  return {
    packageId: 'pkg-1',
    ownedOperationUnits: [
      {
        unitId: 'op-Produce',
        operationId: 'Produce',
        resultObjectClasses: ['Thing'],
        ownerPackageIds: ['pkg-1', 'pkg-2'],
        roleCandidate: 'implementer',
        obligation: { purpose: 'produce', specLines: [12] },
      },
      {
        unitId: 'op-@object:Thing',
        operationId: null,
        resultObjectClasses: [],
        ownerPackageIds: ['pkg-1'],
        roleCandidate: 'consumer',
        obligation: { purpose: 'declare the object', specLines: [12] },
      },
    ],
    ownedSequenceUnits: [],
    crossBoundarySequenceUnits: [],
    obligationUnits: [],
  };
}

// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
function fixtureRfc(rows) {
  return [
    '# Package RFC',
    '',
    '## 3.1 Produce',
    '',
    'The operation is designed here.',
    '',
    '## Distribution ledger',
    '',
    'RFC.md is canonical for this package; the projection is an input, not an authority.',
    '',
    '| Unit | Kind | Owner | RFC location | Ground |',
    '|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}

const PRODUCE_ROW = '| op-Produce | operation | `pkg-1` + `pkg-2` | §3.1 | designed here |';
const OBJECT_ROW = '| op-@object:Thing | declared-residual | `pkg-1` | §3.1 | an object type with no producing operation |';

test('C002 a declared-residual view unit becomes a residual, not a distributed unit', () => {
  const result = renderDistribution(fixtureRfc([PRODUCE_ROW, OBJECT_ROW]), fixtureView());
  assert.equal(result.ok, true, result.code);
  assert.deepEqual(result.map.units.map((unit) => unit.unitId), ['op-Produce']);
  assert.deepEqual(result.map.residuals.map((residual) => residual.unit), ['op-@object:Thing']);
  assert.match(result.rfc, /\| op-@object:Thing \| declared-residual \|/);
});

test('C002 an owner cell listing several packages keeps every name on re-render', () => {
  const result = renderDistribution(fixtureRfc([PRODUCE_ROW, OBJECT_ROW]), fixtureView());
  assert.equal(result.ok, true, result.code);
  assert.deepEqual(result.map.units[0].owners, ['pkg-1', 'pkg-2']);
  assert.match(result.rfc, /\| op-Produce \| operation \| pkg-1 \+ pkg-2 \|/);
});

test('C002 an owner cell that omits this package is still refused', () => {
  const foreign = PRODUCE_ROW.replace('`pkg-1` + `pkg-2`', '`pkg-2`');
  const result = renderDistribution(fixtureRfc([foreign, OBJECT_ROW]), fixtureView());
  assert.equal(result.ok, false);
  assert.equal(result.code, 'OWNER_MISMATCH');
});

test('C002 a residual row for a unit outside the view is carried rather than invented', () => {
  const outside = '| op-@object:Elsewhere | declared-residual | `pkg-1` | §3.1 | declared elsewhere |';
  const result = renderDistribution(fixtureRfc([PRODUCE_ROW, OBJECT_ROW, outside]), fixtureView());
  assert.equal(result.ok, true, result.code);
  assert.deepEqual(result.map.residuals.map((residual) => residual.unit).sort(),
    ['op-@object:Elsewhere', 'op-@object:Thing']);
});

test('C002 the ground keeps the inline code an author wrote', () => {
  const grounded = PRODUCE_ROW.replace('designed here', 'the row defines `result_object_classes` here');
  const result = renderDistribution(fixtureRfc([grounded, OBJECT_ROW]), fixtureView());
  assert.equal(result.ok, true, result.code);
  assert.equal(result.map.units[0].ground, 'the row defines `result_object_classes` here');
  assert.match(result.rfc, /the row defines `result_object_classes` here/);
});

test('C002 a location cell that joins two sections with prose resolves both', () => {
  const rfc = fixtureRfc([PRODUCE_ROW.replace('§3.1', '§3.1 and §1.4'), OBJECT_ROW]);
  const withFirstSection = rfc.replace('## 3.1 Produce', '## 1.4 Purpose\n\nWhy this package exists.\n\n## 3.1 Produce');
  const result = renderDistribution(withFirstSection, fixtureView());
  assert.equal(result.ok, true, result.code);
  assert.deepEqual(result.map.units[0].sections, ['3.1 Produce', '1.4 Purpose']);
});

test('C002 the residual bridge is idempotent', () => {
  const first = renderDistribution(fixtureRfc([PRODUCE_ROW, OBJECT_ROW]), fixtureView());
  const second = renderDistribution(first.rfc, fixtureView());
  assert.equal(second.ok, true, second.code);
  assert.equal(second.rfc, first.rfc);
});
