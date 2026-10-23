// PX-309 @verifies C001
// A unit the view distributes can be declared a residual by the ledger. That declaration
// is an accounting for the unit, not a drop, so the view-to-ledger link must not report it
// as missing while the graph and ticket layers still ignore it.
import test from 'node:test';
import assert from 'node:assert/strict';

import { checkUnitCoverage } from '../../.claude/scripts/sequences-slice/lib/unit-provenance.mjs';

// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
test('C001 a view unit declared as a residual is accounted for at the rfc layer', () => {
  const findings = checkUnitCoverage({
    viewUnitIds: ['op-A', 'op-@object:Thing'],
    ledgerUnitIds: ['op-A'],
    residualUnitIds: ['op-@object:Thing'],
    graph: { nodes: [{ id: 'N1', unitIds: ['op-A'] }] },
    tickets: { phases: [{ id: 0, tickets: [{ id: 1, nodeIds: ['N1', 'op-A'] }] }] },
  });
  assert.deepEqual(findings, []);
});

// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
test('C001 an undeclared view unit is still reported when a residual list is supplied', () => {
  const findings = checkUnitCoverage({
    viewUnitIds: ['op-A', 'op-Ghost'],
    ledgerUnitIds: ['op-A'],
    residualUnitIds: [],
    graph: { nodes: [{ id: 'N1', unitIds: ['op-A'] }] },
    tickets: { phases: [{ id: 0, tickets: [{ id: 1, nodeIds: ['N1', 'op-A'] }] }] },
  });
  assert.ok(findings.some((entry) => entry.code === 'MISSING_UNIT_AT_LAYER'
    && entry.unitId === 'op-Ghost' && entry.layer === 'rfc'));
});
