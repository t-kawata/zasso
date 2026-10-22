#!/usr/bin/env node

// PX-306 @verifies C002
// The post-split gate must carry unit ids as well as graph node ids. A unit the graph
// carries and no ticket names is an omission; a unit a ticket invents is an invention.

const assert = require('assert');

let coverageModule;
try {
  coverageModule = require('../.claude/scripts/tickets/verify-all-ticket-coverage.js');
} catch {
  coverageModule = null;
}

const stats = { passed: 0, failed: 0, total: 0 };
// [::TICKET::] PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-306 --for-spec --no-implementation-order`.
function test(name, fn) {
  stats.total++;
  try {
    fn();
    stats.passed++;
    process.stdout.write('  ✅ ' + name + '\n');
  } catch (error) {
    stats.failed++;
    process.stdout.write('  ❌ ' + name + '\n');
    console.error('     ' + error.message);
  }
}

// [::TICKET::] PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-306 --for-spec --no-implementation-order`.
function ticketsWith(nodeIds) {
  return { phases: [{ id: -1, name: 'PX', nodeIds: ['N1'], tickets: [{ id: 1, phaseId: -1, nodeIds }] }] };
}

process.stdout.write('\n--- verify-all-ticket-coverage unit tests ---\n');

if (!coverageModule || !coverageModule.verifyAllTicketCoverage) {
  test('module loads', () => { throw new Error('not loaded'); });
} else {
  const { verifyAllTicketCoverage } = coverageModule;

  test('passes when the graph, ledger and tickets carry the same unit', () => {
    const report = verifyAllTicketCoverage(ticketsWith(['N1', 'op-A']), {
      graph: { nodes: [{ id: 'N1', unitIds: ['op-A'] }] },
      viewUnitIds: ['op-A'],
      ledgerUnitIds: ['op-A'],
    });
    assert.strictEqual(report.valid, true);
    assert.deepStrictEqual(report.unitFindings, []);
  });

  test('fails when no ticket names a graph unit', () => {
    const report = verifyAllTicketCoverage(ticketsWith(['N1']), {
      graph: { nodes: [{ id: 'N1', unitIds: ['op-A'] }] },
      ledgerUnitIds: ['op-A'],
    });
    assert.strictEqual(report.valid, false);
    assert.ok(report.unitFindings.some((entry) => entry.code === 'MISSING_UNIT_AT_LAYER' && entry.unitId === 'op-A'));
  });

  test('fails when a ticket invents a unit the graph does not carry', () => {
    const report = verifyAllTicketCoverage(ticketsWith(['N1', 'op-Ghost']), {
      graph: { nodes: [{ id: 'N1', unitIds: [] }] },
      ledgerUnitIds: [],
    });
    assert.ok(report.unitFindings.some((entry) => entry.code === 'INVENTED_UNIT' && entry.unitId === 'op-Ghost'));
  });

  test('keeps the existing phase coverage verdict', () => {
    const report = verifyAllTicketCoverage({ phases: [{ id: -1, nodeIds: ['N1'], tickets: [{ id: 1, nodeIds: [] }] }] }, {});
    assert.strictEqual(report.valid, false);
    assert.deepStrictEqual(report.failedPhases[0].missingNodeIds, ['N1']);
  });
}

process.stdout.write('\nTotal: ' + stats.total + ' Passed: ' + stats.passed + ' Failed: ' + stats.failed + '\n');
process.exit(stats.failed > 0 ? 1 : 0);
