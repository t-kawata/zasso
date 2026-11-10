'use strict';

/**
 * PX-406 — registry coverage and finding normalization.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  loadRegistry,
  enumerateSurfaces,
  evaluateCoverage,
} = require('../../.claude/scripts/tickets/lib/omission-detectors.js');
const {
  normalizeFinding,
  toOmissionTicket,
} = require('../../.claude/scripts/tickets/omission-gap-scan.js');
const { createSyntheticFixture, removeSyntheticFixture } = require('./helpers/omission-fixture.cjs');

// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function fixtureContext() {
  const root = createSyntheticFixture();
  const registry = loadRegistry({ cwd: root });
  const surfaces = enumerateSurfaces({ cwd: root, ticketsPath: path.join(root, 'Tickets.json') });
  return { root, registry, surfaces };
}

// @verifies C001
test('C001: the registry is versioned and every enumerated surface is covered', () => {
  const { root, registry, surfaces } = fixtureContext();
  try {
    const coverage = evaluateCoverage({ registry, surfaces });

    assert.equal(coverage.version, 1);
    assert.equal(coverage.notMeasured.length, 0);
    assert.equal(coverage.surfaces.every((surface) => ['mechanical', 'judgment', 'notApplicable'].includes(surface.coveredBy)), true);
    assert.equal(coverage.findings.some((finding) => finding.code === 'SURFACE_UNCOVERED'), false);
  } finally {
    removeSyntheticFixture(root);
  }
});

// @verifies C001
test('C001: removing the mechanical contract detector reports an uncovered surface', () => {
  const { root, registry, surfaces } = fixtureContext();
  try {
    const reduced = {
      ...registry,
      detectors: registry.detectors.filter((detector) => detector.id !== 'contract-delivery'),
    };

    const coverage = evaluateCoverage({ registry: reduced, surfaces });

    assert.equal(coverage.findings.some((finding) => finding.code === 'SURFACE_UNCOVERED' && finding.surface === 'contract'), true);
  } finally {
    removeSyntheticFixture(root);
  }
});

// @verifies C001
test('C001: a notMeasured detector is reported and never passes', () => {
  const { root, registry, surfaces } = fixtureContext();
  try {
    const coverage = evaluateCoverage({ registry, surfaces, measurements: { 'contract-delivery': 'notMeasured' } });

    assert.equal(coverage.notMeasured.includes('contract-delivery'), true);
    assert.equal(coverage.ok, false);
  } finally {
    removeSyntheticFixture(root);
  }
});

// @verifies C001
test('C001: a finding normalizes to a stable key and an omission ticket carries every required field', () => {
  const finding = normalizeFinding(
    { id: 'contract-delivery', kind: 'mechanical' },
    {
      code: 'CONTRACT_CLAUSE_UNTESTED',
      surface: 'contract',
      assetId: 'C001',
      criterion: 'B',
      ticketKey: 'P0-1',
      problem: 'no test names the clause',
      severity: 'high',
      normativeSource: 'contract:C001',
    },
  );

  assert.match(finding.stableKey, /^contract\|C001\|B$/);
  assert.equal(finding.class, 'must-fix');
  const ticket = toOmissionTicket(finding);
  for (const field of ['title', 'background', 'scope', 'testUnit', 'acceptanceCriteria', 'invariants']) {
    assert.ok(ticket[field], field + ' is required');
  }
});
