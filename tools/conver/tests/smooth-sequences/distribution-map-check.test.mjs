// PX-307 @verifies C006
// The root check is the only place that can see every package at once, so it owns the
// role uniqueness and the workspace-wide coverage findings.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  checkDistributionMap,
  checkOwnerRoles,
} from '../../.claude/scripts/smooth-sequences/lib/checks-distribution-map.mjs';
import { renderDistribution } from '../../.claude/scripts/grill-me-for-rfc/render-distribution.mjs';

// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
function fixtureView(packageId = 'pkg-1') {
  return {
    packageId,
    ownedOperationUnits: [{
      unitId: 'op-Produce',
      operationId: 'Produce',
      resultObjectClasses: ['Thing'],
      ownerPackageIds: [packageId],
      roleCandidate: 'implementer',
      obligation: { purpose: 'produce', specLines: [12] },
    }],
    ownedSequenceUnits: [],
    crossBoundarySequenceUnits: [],
    obligationUnits: [],
  };
}

// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
function fixtureRfc() {
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
    '| op-Produce | operation | pkg-1 | §3.1 | designed here |',
    '',
  ].join('\n');
}

test('C006 a package with no view does not fire', () => {
  assert.deepEqual(checkDistributionMap({ view: null, rfc: '# x' }), []);
});

test('C006 a package with an empty view does not fire', () => {
  const empty = { ...fixtureView(), ownedOperationUnits: [] };
  assert.deepEqual(checkDistributionMap({ view: empty, rfc: '# x' }), []);
});

test('C006 a non-empty view with no map is a finding, not a pass', () => {
  const findings = checkDistributionMap({ view: fixtureView(), rfc: fixtureRfc() });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, 'DISTRIBUTION_MAPPING_MISSING');
  assert.equal(findings[0].layer, 'rfc');
});

test('C006 a rendered RFC passes the check', () => {
  const view = fixtureView();
  const rendered = renderDistribution(fixtureRfc(), view);
  assert.equal(rendered.ok, true, rendered.code);
  assert.deepEqual(checkDistributionMap({ view, rfc: rendered.rfc }), []);
});

test('C006 a stale view digest is reported', () => {
  const view = fixtureView();
  const rendered = renderDistribution(fixtureRfc(), view);
  const changed = { ...view, ownedOperationUnits: view.ownedOperationUnits.map((unit) => ({ ...unit, obligation: { ...unit.obligation, purpose: 'changed' } })) };
  const findings = checkDistributionMap({ view: changed, rfc: rendered.rfc });
  assert.equal(findings[0].code, 'STALE_DISTRIBUTION_MAP');
});

test('C006 a missing managed anchor is reported at the rfc layer', () => {
  const view = fixtureView();
  const rendered = renderDistribution(fixtureRfc(), view);
  const withoutAnchor = rendered.rfc.replace('<!-- unit: op-Produce -->\n', '');
  const findings = checkDistributionMap({ view, rfc: withoutAnchor });
  assert.equal(findings[0].code, 'MISSING_UNIT_AT_LAYER');
  assert.equal(findings[0].unitId, 'op-Produce');
});

test('C006 a multi-owner operation without exactly one implementer is reported', () => {
  const maps = [
    { packageId: 'pkg-1', units: [{ unitId: 'op-Produce', kind: 'operation', role: 'implementer' }] },
    { packageId: 'pkg-2', units: [{ unitId: 'op-Produce', kind: 'operation', role: 'implementer' }] },
  ];
  const result = checkOwnerRoles(maps);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'OWNER_ROLE_UNDECLARED');
});

test('C006 one implementer and one consumer pass', () => {
  const maps = [
    { packageId: 'pkg-1', units: [{ unitId: 'op-Produce', kind: 'operation', role: 'implementer' }] },
    { packageId: 'pkg-2', units: [{ unitId: 'op-Produce', kind: 'operation', role: 'consumer' }] },
  ];
  assert.equal(checkOwnerRoles(maps).ok, true);
});

test('C006 a disjoint surface split permits two implementers', () => {
  const maps = [
    { packageId: 'pkg-1', units: [{ unitId: 'op-Produce', kind: 'operation', role: 'implementer', surface: 'rest' }] },
    { packageId: 'pkg-2', units: [{ unitId: 'op-Produce', kind: 'operation', role: 'implementer', surface: 'cli' }] },
  ];
  assert.equal(checkOwnerRoles(maps).ok, true);
});
