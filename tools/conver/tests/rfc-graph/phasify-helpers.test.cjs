/**
 * phasify-helpers.test.cjs — Unit tests for phasify-helpers.js
 *
 * Test framework: Node.js standard node:test + node:assert/strict
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  WEIGHT_MAP,
  HARD_EDGE_TYPES,
  SOFT_EDGE_TYPES,
  getWeight,
  isHard,
  kahnTopologicalSort,
  computeSoftViolations,
  mergePhases,
  enforceHardConstraints,
  buildSccConstraint,
  applySccToOrder,
  applyDirectoryConstraints,
  phasesToTicketsFormat,
} = require('../../.claude/scripts/rfc-graph/phasify-helpers.js');

// ============================================================
// Weight table
// ============================================================

describe('getWeight', () => {
  it('should return Infinity for depends_on', () => {
    assert.strictEqual(getWeight('depends_on'), Infinity);
  });

  it('should return Infinity for implements', () => {
    assert.strictEqual(getWeight('implements'), Infinity);
  });

  it('should return 2 for precedes', () => {
    assert.strictEqual(getWeight('precedes'), 2);
  });

  it('should return 1 for triggers', () => {
    assert.strictEqual(getWeight('triggers'), 1);
  });

  it('should return 0 for non-constrained types', () => {
    assert.strictEqual(getWeight('references'), 0);
    assert.strictEqual(getWeight('refines'), 0);
    assert.strictEqual(getWeight('extends'), 0);
    assert.strictEqual(getWeight('part_of'), 0);
  });

  it('should return 0 for unknown type', () => {
    assert.strictEqual(getWeight('unknown_xyz'), 0);
  });

  it('should have all 12 edge types defined', () => {
    const expected = ['depends_on', 'implements', 'constrains', 'precedes',
      'triggers', 'refines', 'references', 'extends', 'conflicts_with',
      'supersedes', 'validates', 'part_of'];
    for (const t of expected) {
      assert.ok(WEIGHT_MAP[t] !== undefined, 'WEIGHT_MAP missing: ' + t);
    }
  });
});

describe('isHard', () => {
  it('should return true for hard edge types', () => {
    assert.ok(isHard('depends_on'));
    assert.ok(isHard('implements'));
  });

  it('should return false for non-hard types', () => {
    assert.ok(!isHard('references'));
    assert.ok(!isHard('precedes'));
    assert.ok(!isHard('part_of'));
  });
});

// ============================================================
// kahnTopologicalSort
// ============================================================

describe('kahnTopologicalSort', () => {
  it('should sort a simple DAG', () => {
    const result = kahnTopologicalSort(
      ['N0001', 'N0002', 'N0003'],
      [
        { from: 'N0001', to: 'N0003', type: 'depends_on' },
        { from: 'N0002', to: 'N0003', type: 'depends_on' },
      ],
      getWeight,
    );
    assert.ok(result.success);
    // depends_on: N0003 is the dependency target of N0001 and N0002 → N0003 comes first
    assert.ok(result.order.indexOf('N0003') < result.order.indexOf('N0001'));
    assert.ok(result.order.indexOf('N0003') < result.order.indexOf('N0002'));
  });

  it('should support non-hard edges in same order (no constraint)', () => {
    const result = kahnTopologicalSort(
      ['N0001', 'N0002'],
      [{ from: 'N0001', to: 'N0002', type: 'references' }],
      getWeight,
    );
    assert.ok(result.success);
    // references has weight 0 so no ordering constraint → both are processed
    assert.strictEqual(result.order.length, 2);
  });

  it('should detect cycles', () => {
    const result = kahnTopologicalSort(
      ['N0001', 'N0002', 'N0003'],
      [
        { from: 'N0001', to: 'N0002', type: 'depends_on' },
        { from: 'N0002', to: 'N0003', type: 'depends_on' },
        { from: 'N0003', to: 'N0001', type: 'depends_on' },
      ],
      getWeight,
    );
    assert.ok(!result.success);
    assert.ok(result.cycle.length >= 3);
  });

  it('should handle no edges (free order)', () => {
    const result = kahnTopologicalSort(
      ['N0001', 'N0002', 'N0003'],
      [],
      getWeight,
    );
    assert.ok(result.success);
    assert.strictEqual(result.order.length, 3);
    // Input order is preserved
    assert.deepStrictEqual(result.order, ['N0001', 'N0002', 'N0003']);
  });

  it('should handle linear chain', () => {
    const result = kahnTopologicalSort(
      ['N0001', 'N0002', 'N0003', 'N0004'],
      [
        { from: 'N0001', to: 'N0002', type: 'depends_on' },
        { from: 'N0002', to: 'N0003', type: 'depends_on' },
        { from: 'N0003', to: 'N0004', type: 'depends_on' },
      ],
      getWeight,
    );
    assert.ok(result.success);
    // depends_on: dependency target (to) comes first → N0004, N0003, N0002, N0001
    assert.deepStrictEqual(result.order, ['N0004', 'N0003', 'N0002', 'N0001']);
  });

  it('should handle single node', () => {
    const result = kahnTopologicalSort(['N0001'], [], getWeight);
    assert.ok(result.success);
    assert.deepStrictEqual(result.order, ['N0001']);
  });

  it('should ignore edges from/to unknown nodes', () => {
    const result = kahnTopologicalSort(
      ['N0001', 'N0002'],
      [{ from: 'UNKNOWN', to: 'N0001', type: 'depends_on' }],
      getWeight,
    );
    assert.ok(result.success);
    assert.strictEqual(result.order.length, 2);
  });
});

// ============================================================
// computeSoftViolations
// ============================================================

describe('computeSoftViolations', () => {
  it('should return zero cost when no soft edges violated', () => {
    const result = computeSoftViolations(
      ['N0001', 'N0002'],
      [{ from: 'N0001', to: 'N0002', type: 'precedes' }],
      getWeight,
    );
    assert.strictEqual(result.totalCost, 0);
    assert.strictEqual(result.violations.length, 0);
  });

  it('should detect precedes violation (cost=2)', () => {
    const result = computeSoftViolations(
      ['N0002', 'N0001'],
      [{ from: 'N0001', to: 'N0002', type: 'precedes' }],
      getWeight,
    );
    assert.strictEqual(result.totalCost, 2);
    assert.strictEqual(result.violations.length, 1);
    assert.strictEqual(result.violations[0].cost, 2);
  });

  it('should detect triggers violation (cost=1)', () => {
    const result = computeSoftViolations(
      ['N0002', 'N0001'],
      [{ from: 'N0001', to: 'N0002', type: 'triggers' }],
      getWeight,
    );
    assert.strictEqual(result.totalCost, 1);
    assert.strictEqual(result.violations.length, 1);
    assert.strictEqual(result.violations[0].cost, 1);
  });

  it('should accumulate multiple violations', () => {
    const result = computeSoftViolations(
      ['N0003', 'N0002', 'N0001'],
      [
        { from: 'N0001', to: 'N0002', type: 'precedes' },
        { from: 'N0002', to: 'N0003', type: 'precedes' },
        { from: 'N0001', to: 'N0003', type: 'triggers' },
      ],
      getWeight,
    );
    // N0001→N0002 violation cost=2
    // N0002→N0003 violation cost=2
    // N0001→N0003 violation cost=1
    assert.strictEqual(result.totalCost, 5);
    assert.strictEqual(result.violations.length, 3);
  });

  it('should handle empty edges', () => {
    const result = computeSoftViolations([], [], getWeight);
    assert.strictEqual(result.totalCost, 0);
    assert.strictEqual(result.violations.length, 0);
  });

  it('should ignore hard edges', () => {
    const result = computeSoftViolations(
      ['N0002', 'N0001'],
      [{ from: 'N0001', to: 'N0002', type: 'depends_on' }],
      getWeight,
    );
    assert.strictEqual(result.totalCost, 0);
  });

  it('should ignore zero-weight edges', () => {
    const result = computeSoftViolations(
      ['N0002', 'N0001'],
      [{ from: 'N0001', to: 'N0002', type: 'references' }],
      getWeight,
    );
    assert.strictEqual(result.totalCost, 0);
  });
});

// ============================================================
// mergePhases
// ============================================================

describe('mergePhases', () => {
  it('should split nodes into phases of minSize', () => {
    const nodes = ['N0001', 'N0002', 'N0003', 'N0004', 'N0005', 'N0006', 'N0007', 'N0008', 'N0009', 'N0010', 'N0011'];
    const result = mergePhases(nodes, 5);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].nodeIds.length, 5);
    // Last phase has remaining 6 nodes (5 + 1 merged)
    assert.strictEqual(result[1].nodeIds.length, 6);
  });

  it('should merge final underflow phase into previous', () => {
    const nodes = ['N0001', 'N0002', 'N0003', 'N0004', 'N0005', 'N0006', 'N0007', 'N0008', 'N0009', 'N0010', 'N0011', 'N0012'];
    const result = mergePhases(nodes, 10);
    // Create P0 with 10 nodes → remaining 2 nodes merge into P0 → all 12 nodes in 1 phase
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].nodeIds.length, 12);
  });

  it('should create multiple phases for large input', () => {
    // 35 nodes, minSize=10 → P0(10), P1(10), P2(10), remaining 5 → merged into P2 = 3 phases
    const nodes = Array.from({ length: 35 }, (_, i) => 'N' + String(i + 1).padStart(4, '0'));
    const result = mergePhases(nodes, 10);
    assert.strictEqual(result.length, 3);
    assert.strictEqual(result[0].nodeIds.length, 10);
    assert.strictEqual(result[1].nodeIds.length, 10);
    // last phase: 10 + 5 = 15
    assert.strictEqual(result[2].nodeIds.length, 15);
  });

  it('should return single phase when total < minSize', () => {
    const nodes = ['N0001', 'N0002', 'N0003'];
    const result = mergePhases(nodes, 10);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].nodeIds.length, 3);
  });

  it('should handle empty input', () => {
    const result = mergePhases([], 10);
    assert.strictEqual(result.length, 0);
  });

  it('should handle exactly minSize nodes', () => {
    const nodes = Array.from({ length: 10 }, (_, i) => 'N' + String(i + 1).padStart(4, '0'));
    const result = mergePhases(nodes, 10);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].nodeIds.length, 10);
  });

  it('should use default minSize of 10', () => {
    const nodes = Array.from({ length: 25 }, (_, i) => 'N' + String(i + 1).padStart(4, '0'));
    const result = mergePhases(nodes);
    assert.strictEqual(result.length >= 2, true);
    assert.ok(result.every(p => p.nodeIds.length >= 10 || nodes.length < 10));
  });
});

// ============================================================
// buildSccConstraint
// ============================================================

describe('buildSccConstraint', () => {
  it('should handle empty SCC result', () => {
    const result = buildSccConstraint([]);
    assert.strictEqual(Object.keys(result.sccMap).length, 0);
    assert.strictEqual(result.sccIds.size, 0);
  });

  it('should ignore single-node SCCs', () => {
    const result = buildSccConstraint([
      { cycle: ['N0001'] },
      { cycle: ['N0002'] },
    ]);
    // Single-node cycles are ignored
    assert.strictEqual(Object.keys(result.sccMap).length, 0);
  });

  it('should mark multi-node SCCs', () => {
    const result = buildSccConstraint([
      { cycle: ['N0001', 'N0002', 'N0003'] },
    ]);
    assert.strictEqual(Object.keys(result.sccMap).length, 3);
    assert.strictEqual(result.sccIds.size, 3);
    assert.strictEqual(result.sccMap['N0001'], 'N0001');
    assert.strictEqual(result.sccMap['N0002'], 'N0001');
    assert.strictEqual(result.sccMap['N0003'], 'N0001');
  });

  it('should handle null/undefined input', () => {
    const result1 = buildSccConstraint(null);
    assert.strictEqual(Object.keys(result1.sccMap).length, 0);

    const result2 = buildSccConstraint(undefined);
    assert.strictEqual(Object.keys(result2.sccMap).length, 0);
  });
});

// ============================================================
// applySccToOrder
// ============================================================

describe('applySccToOrder', () => {
  it('should keep order when no SCC map', () => {
    const result = applySccToOrder(['N0001', 'N0002', 'N0003'], {});
    assert.deepStrictEqual(result, ['N0001', 'N0002', 'N0003']);
  });

  it('should group SCC nodes together', () => {
    const sccMap = { 'N0002': 'N0001', 'N0003': 'N0001' };
    // Original order: N0001, N0004, N0002, N0005, N0003
    // SCC group: N0001,N0002,N0003 → grouped at the position of the first representative N0001
    const result = applySccToOrder(
      ['N0001', 'N0004', 'N0002', 'N0005', 'N0003'],
      sccMap,
    );
    // Verify N0001,N0002,N0003 are adjacent
    const pos1 = result.indexOf('N0001');
    const pos2 = result.indexOf('N0002');
    const pos3 = result.indexOf('N0003');
    // They should be adjacent (elements between them < 3)
    assert.ok(Math.abs(pos1 - pos2) <= 2);
    assert.ok(Math.abs(pos2 - pos3) <= 1);
  });
});

// ============================================================
// enforceHardConstraints
// ============================================================

describe('enforceHardConstraints', () => {
  it('should split phase when hard edge endpoints are in same phase', () => {
    const phases = [
      { id: 0, name: 'P0', nodeIds: ['N0001', 'N0002', 'N0003', 'N0004', 'N0005'] },
    ];
    const hardEdges = [{ from: 'N0002', to: 'N0004', type: 'depends_on' }];
    const result = enforceHardConstraints(phases, hardEdges);
    // N0002 and N0004 are in the same phase → split after N0004
    assert.ok(result.length >= 2, 'Should be split');
    assert.ok(result.some(p => p.nodeIds.includes('N0002')));
    assert.ok(result.some(p => p.nodeIds.includes('N0004')));
    // N0002 and N0004 should be in different phases
    const phaseOf2 = result.find(p => p.nodeIds.includes('N0002'));
    const phaseOf4 = result.find(p => p.nodeIds.includes('N0004'));
    assert.ok(phaseOf2.id < phaseOf4.id, 'N0002 should be in an earlier phase than N0004');
  });

  it('should handle no violations (empty hardEdges)', () => {
    const phases = [
      { id: 0, name: 'P0', nodeIds: ['N0001', 'N0002'] },
      { id: 1, name: 'P1', nodeIds: ['N0003', 'N0004'] },
    ];
    const result = enforceHardConstraints(phases, []);
    assert.strictEqual(result.length, 2);
  });

  it('should handle no violations (already separated)', () => {
    const phases = [
      { id: 0, name: 'P0', nodeIds: ['N0001'] },
      { id: 1, name: 'P1', nodeIds: ['N0002'] },
    ];
    const hardEdges = [{ from: 'N0001', to: 'N0002', type: 'depends_on' }];
    const result = enforceHardConstraints(phases, hardEdges);
    assert.strictEqual(result.length, 2);
  });

  it('should fix multiple violations in same phase', () => {
    // Both N0001→N0003 and N0002→N0004 are within the same phase
    const phases = [
      { id: 0, name: 'P0', nodeIds: ['N0001', 'N0002', 'N0003', 'N0004'] },
    ];
    const hardEdges = [
      { from: 'N0001', to: 'N0003', type: 'depends_on' },
      { from: 'N0002', to: 'N0004', type: 'depends_on' },
    ];
    const result = enforceHardConstraints(phases, hardEdges);
    // Multiple splits resolve all violations
    const nodePhase = {};
    result.forEach(p => p.nodeIds.forEach(n => { nodePhase[n] = p.id; }));
    assert.ok(nodePhase['N0001'] < nodePhase['N0003'], 'N0001→N0003');
    assert.ok(nodePhase['N0002'] < nodePhase['N0004'], 'N0002→N0004');
  });

  it('should handle null/undefined input', () => {
    const result1 = enforceHardConstraints(null, [{from:'N1',to:'N2'}]);
    assert.strictEqual(result1, null);

    const phases = [{ id: 0, name: 'P0', nodeIds: ['N1', 'N2'] }];
    const result2 = enforceHardConstraints(phases, null);
    assert.strictEqual(result2, phases);
  });

  it('should handle chains (N1→N2→N3 all in same phase)', () => {
    const phases = [
      { id: 0, name: 'P0', nodeIds: ['N0001', 'N0002', 'N0003'] },
    ];
    const hardEdges = [
      { from: 'N0001', to: 'N0002', type: 'depends_on' },
      { from: 'N0002', to: 'N0003', type: 'depends_on' },
    ];
    const result = enforceHardConstraints(phases, hardEdges);
    // Each node should be in a different phase
    const nodePhase = {};
    result.forEach(p => p.nodeIds.forEach(n => { nodePhase[n] = p.id; }));
    assert.ok(nodePhase['N0001'] < nodePhase['N0002'], 'N0001 should be in earlier phase than N0002');
    assert.ok(nodePhase['N0002'] < nodePhase['N0003'], 'N0002 should be in earlier phase than N0003');
  });
});

// ============================================================
// applyDirectoryConstraints
// ============================================================

describe('applyDirectoryConstraints', () => {
  const nodeToDirMap = {
    'N0001': 'src/config',
    'N0002': 'src/config',
    'N0003': 'src/security',
    'N0004': 'src/security',
    'N0005': 'src/error',
    'N0006': 'src/error',
  };

  it('should return same order when no constraints', () => {
    const order = ['N0001', 'N0003', 'N0002', 'N0004'];
    const result = applyDirectoryConstraints(order, [], nodeToDirMap);
    assert.deepStrictEqual(result, order);
  });

  it('should return same order when constraint already satisfied', () => {
    const order = ['N0001', 'N0002', 'N0003', 'N0004'];
    const depDirs = [{ from: 'src/config', to: 'src/security' }];
    const result = applyDirectoryConstraints(order, depDirs, nodeToDirMap);
    // config (last=N0002) is before security (first=N0003) → preserved
    assert.deepStrictEqual(result, order);
  });

  it('should reorder when constraint is violated', () => {
    const order = ['N0003', 'N0001', 'N0004', 'N0002'];
    const depDirs = [{ from: 'src/config', to: 'src/security' }];
    const result = applyDirectoryConstraints(order, depDirs, nodeToDirMap);
    // Adjust so config (N0001,N0002) comes before security (N0003,N0004)
    const posConfig1 = result.indexOf('N0001');
    const posConfig2 = result.indexOf('N0002');
    const posSec3 = result.indexOf('N0003');
    const posSec4 = result.indexOf('N0004');
    // The last config node must be before the first security node
    const lastConfig = Math.max(posConfig1, posConfig2);
    const firstSec = Math.min(posSec3, posSec4);
    assert.ok(lastConfig < firstSec, 'config should be placed before security');
  });

  it('should handle multiple dependency directions', () => {
    const order = ['N0005', 'N0001', 'N0002', 'N0003', 'N0004', 'N0006'];
    const depDirs = [
      { from: 'src/config', to: 'src/security' },
      { from: 'src/security', to: 'src/error' },
    ];
    const result = applyDirectoryConstraints(order, depDirs, nodeToDirMap);
    // config before security, security before error
    const configLast = Math.max(result.indexOf('N0001'), result.indexOf('N0002'));
    const secFirst = Math.min(result.indexOf('N0003'), result.indexOf('N0004'));
    const secLast = Math.max(result.indexOf('N0003'), result.indexOf('N0004'));
    const errFirst = Math.min(result.indexOf('N0005'), result.indexOf('N0006'));
    assert.ok(configLast < secFirst, 'config → security');
    assert.ok(secLast < errFirst, 'security → error');
  });

  it('should handle null/undefined depDirs', () => {
    const order = ['N0001', 'N0002'];
    const result1 = applyDirectoryConstraints(order, null, nodeToDirMap);
    assert.deepStrictEqual(result1, order);
    const result2 = applyDirectoryConstraints(order, undefined, nodeToDirMap);
    assert.deepStrictEqual(result2, order);
  });

  it('should skip when from-dir has no nodes in order', () => {
    const order = ['N0003', 'N0004'];
    const depDirs = [{ from: 'src/config', to: 'src/security' }];
    const result = applyDirectoryConstraints(order, depDirs, nodeToDirMap);
    assert.deepStrictEqual(result, order);
  });

  it('should skip when to-dir has no nodes in order', () => {
    const order = ['N0001', 'N0002'];
    const depDirs = [{ from: 'src/config', to: 'src/security' }];
    const result = applyDirectoryConstraints(order, depDirs, nodeToDirMap);
    assert.deepStrictEqual(result, order);
  });

  it('should handle empty order', () => {
    const result = applyDirectoryConstraints([], [{ from: 'src/config', to: 'src/security' }], nodeToDirMap);
    assert.deepStrictEqual(result, []);
  });

  it('should preserve total node count after reorder', () => {
    const order = ['N0003', 'N0001', 'N0004', 'N0002', 'N0005', 'N0006'];
    const depDirs = [{ from: 'src/config', to: 'src/security' }];
    const result = applyDirectoryConstraints(order, depDirs, nodeToDirMap);
    assert.strictEqual(result.length, order.length);
    // All nodes are preserved
    for (const nid of order) {
      assert.ok(result.includes(nid), 'Missing node: ' + nid);
    }
  });
});

// ============================================================
// phasesToTicketsFormat
// ============================================================

describe('phasesToTicketsFormat', () => {
  it('should convert phase array to tickets format', () => {
    const phases = [
      { id: 0, name: 'P0', nodeIds: ['N0001', 'N0002'] },
      { id: 1, name: 'P1', nodeIds: ['N0003'] },
    ];
    const result = phasesToTicketsFormat(phases);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].id, 0);
    assert.strictEqual(result[0].name, 'P0');
    assert.deepStrictEqual(result[0].nodeIds, ['N0001', 'N0002']);
    assert.deepStrictEqual(result[0].tickets, []);
    assert.strictEqual(result[1].id, 1);
  });

  it('should handle empty input', () => {
    const result = phasesToTicketsFormat([]);
    assert.strictEqual(result.length, 0);
  });
});
