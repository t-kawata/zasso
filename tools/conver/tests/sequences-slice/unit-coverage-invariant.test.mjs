// PX-306 @verifies C002
// The additivity invariant: a workspace with no distributed units keeps its old verdict,
// while a ledger that distributes units and a graph that carries none is a finding. The
// second half closes the declaresNothing escape the audit found.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  checkUnitCoverage,
  checkUnitProvenance,
} from '../../.claude/scripts/sequences-slice/lib/unit-provenance.mjs';

test('C002 an empty ledger with no unit ids still passes', () => {
  assert.deepEqual(checkUnitCoverage({
    viewUnitIds: [],
    ledgerUnitIds: [],
    graph: { nodes: [] },
    tickets: { phases: [] },
  }), []);
});

test('C002 a non-empty ledger with no unit ids is a finding, not a declaresNothing escape', () => {
  const findings = checkUnitCoverage({
    viewUnitIds: [],
    ledgerUnitIds: ['op-A'],
    graph: { nodes: [] },
    tickets: { phases: [] },
  });
  assert.ok(findings.some((entry) => entry.code === 'MISSING_UNIT_AT_LAYER' && entry.unitId === 'op-A'));
});

test('C002 checkUnitProvenance no longer hides a non-empty ledger behind an empty graph', () => {
  const findings = checkUnitProvenance({ nodes: [] }, new Set(['op-A']), [], { phases: [] });
  assert.equal(findings.length > 0, true);
  assert.match(findings[0].message, /op-A/);
});

test('C002 checkUnitProvenance stays additive when the ledger is empty', () => {
  assert.deepEqual(checkUnitProvenance({ nodes: [] }, new Set(), [], { phases: [] }), []);
});
