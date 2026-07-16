/**
 * show-all-nodes-title-summary.test.cjs — Tests for show-all-nodes-title-summary.js
 *
 * Test framework: Node.js standard node:test + node:assert/strict
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { parseArguments, getPhaseNodeIds } = require('../../.claude/scripts/rfc-graph/show-all-nodes-title-summary.js');

// ============================================================
// parseArguments
// ============================================================

describe('parseArguments', () => {
  it('should parse all three required args', () => {
    const result = parseArguments(['--tickets=/a/t.json', '--graph=/a/g.json', '--phase=P0']);
    assert.strictEqual(result.tickets, '/a/t.json');
    assert.strictEqual(result.graph, '/a/g.json');
    assert.strictEqual(result.phase, 'P0');
  });

  it('should exit 2 when tickets missing', () => {
    assert.throws(function() {
      const orig = process.exit; process.exit = function(c) { throw new Error('exit:' + c); };
      try { parseArguments(['--graph=/a/g.json', '--phase=P0']);
      } finally { process.exit = orig; }
    });
  });

  it('should exit 2 when graph missing', () => {
    assert.throws(function() {
      const orig = process.exit; process.exit = function(c) { throw new Error('exit:' + c); };
      try { parseArguments(['--tickets=/a/t.json', '--phase=P0']);
      } finally { process.exit = orig; }
    });
  });

  it('should exit 2 when phase missing', () => {
    assert.throws(function() {
      const orig = process.exit; process.exit = function(c) { throw new Error('exit:' + c); };
      try { parseArguments(['--tickets=/a/t.json', '--graph=/a/g.json']);
      } finally { process.exit = orig; }
    });
  });
});

// ============================================================
// getPhaseNodeIds
// ============================================================

describe('getPhaseNodeIds', () => {
  const ticketsData = {
    phases: [
      { id: 0, name: 'P0', nodeIds: ['N0001', 'N0002'] },
      { id: 1, name: 'P1', nodeIds: ['N0003'] },
      { id: 2, name: 'P2', nodeIds: [] },
    ],
  };

  it('should return nodeIds by name', () => {
    const result = getPhaseNodeIds(ticketsData, 'P0');
    assert.deepStrictEqual(result, ['N0001', 'N0002']);
  });

  it('should return nodeIds by id number (string)', () => {
    const result = getPhaseNodeIds(ticketsData, '1');
    assert.deepStrictEqual(result, ['N0003']);
  });

  it('should return empty array for empty nodeIds', () => {
    const result = getPhaseNodeIds(ticketsData, 'P2');
    assert.deepStrictEqual(result, []);
  });

  it('should exit 1 for unknown phase', () => {
    assert.throws(function() {
      const orig = process.exit; process.exit = function(c) { throw new Error('exit:' + c); };
      try { getPhaseNodeIds(ticketsData, 'P99');
      } finally { process.exit = orig; }
    });
  });
});
