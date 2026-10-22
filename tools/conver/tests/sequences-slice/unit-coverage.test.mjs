// PX-306 @verifies C002
// The SEQUENCES view distributes a unit to a package; the ledger, the graph and the
// tickets must each name it. The check reports a drop and an invention at the layer where
// they happen, so the repair is unambiguous.
import test from 'node:test';
import assert from 'node:assert/strict';

import { checkUnitCoverage } from '../../.claude/scripts/sequences-slice/lib/unit-provenance.mjs';

const graph = { nodes: [{ id: 'N1', unitIds: ['op-A', 'seq-B'] }] };
const tickets = { phases: [{ id: 0, tickets: [{ id: 1, nodeIds: ['N1', 'op-A', 'seq-B'] }] }] };

test('C002 a view unit missing from the graph is reported at the graph layer', () => {
  const findings = checkUnitCoverage({
    viewUnitIds: ['op-A', 'seq-B', 'ctr-boundary-005'],
    ledgerUnitIds: ['op-A', 'seq-B', 'ctr-boundary-005'],
    graph,
    tickets,
  });
  assert.ok(findings.some((entry) => entry.code === 'MISSING_UNIT_AT_LAYER'
    && entry.unitId === 'ctr-boundary-005' && entry.layer === 'graph'));
});

test('C002 a unit the graph carries and the ledger does not is invented', () => {
  const findings = checkUnitCoverage({
    viewUnitIds: ['op-A', 'seq-B'],
    ledgerUnitIds: ['op-A'],
    graph,
    tickets,
  });
  assert.ok(findings.some((entry) => entry.code === 'INVENTED_UNIT' && entry.unitId === 'seq-B'));
});

test('C002 a unit no ticket names is an omission at the ticket layer', () => {
  const findings = checkUnitCoverage({
    viewUnitIds: ['op-A', 'seq-B'],
    ledgerUnitIds: ['op-A', 'seq-B'],
    graph,
    tickets: { phases: [{ id: 0, tickets: [{ id: 1, nodeIds: ['N1', 'op-A'] }] }] },
  });
  assert.ok(findings.some((entry) => entry.code === 'MISSING_UNIT_AT_LAYER'
    && entry.unitId === 'seq-B' && entry.layer === 'ticket'));
});

test('C002 a fully carried unit produces no finding', () => {
  assert.deepEqual(checkUnitCoverage({
    viewUnitIds: ['op-A', 'seq-B'],
    ledgerUnitIds: ['op-A', 'seq-B'],
    graph,
    tickets,
  }), []);
});
