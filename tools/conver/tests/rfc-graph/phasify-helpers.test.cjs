/**
 * phasify-helpers.test.cjs — phasify-helpers.js のユニットテスト
 *
 * テストフレームワーク: Node.js 標準の node:test + node:assert/strict
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
// 重みテーブル
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
    assert.ok(isHard('constrains'));
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
    // depends_on: N0003はN0001とN0002の依存先 → N0003が先に来る
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
    // references は重み0なので順序制約なし → 両方処理される
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
    // 入力順が維持される
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
    // depends_on: 依存先(to)が先に来る → N0004, N0003, N0002, N0001
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
    // N0001→N0002 違反 cost=2
    // N0002→N0003 違反 cost=2
    // N0001→N0003 違反 cost=1
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
    // 最終フェーズは残り6ノード（5 + 1合併）
    assert.strictEqual(result[1].nodeIds.length, 6);
  });

  it('should merge final underflow phase into previous', () => {
    const nodes = ['N0001', 'N0002', 'N0003', 'N0004', 'N0005', 'N0006', 'N0007', 'N0008', 'N0009', 'N0010', 'N0011', 'N0012'];
    const result = mergePhases(nodes, 10);
    // 10ノードでP0作成 → 残り2ノードはP0に合併 → 全12ノードが1フェーズ
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].nodeIds.length, 12);
  });

  it('should create multiple phases for large input', () => {
    // 35ノード、minSize=10 → P0(10), P1(10), P2(10), 残り5→P2に合併 = 3フェーズ
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
    // 元の順序: N0001, N0004, N0002, N0005, N0003
    // SCCグループ: N0001,N0002,N0003 → 最初の代表 N0001 の位置にグループ化
    const result = applySccToOrder(
      ['N0001', 'N0004', 'N0002', 'N0005', 'N0003'],
      sccMap,
    );
    // N0001,N0002,N0003 が隣接していることを確認
    const pos1 = result.indexOf('N0001');
    const pos2 = result.indexOf('N0002');
    const pos3 = result.indexOf('N0003');
    // 隣接しているはず（間にある要素数 < 3）
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
    // N0002 と N0004 が同一フェーズ → N0004 以降を分割
    assert.ok(result.length >= 2, '分割されること');
    assert.ok(result.some(p => p.nodeIds.includes('N0002')));
    assert.ok(result.some(p => p.nodeIds.includes('N0004')));
    // N0002 と N0004 が異なるフェーズであること
    const phaseOf2 = result.find(p => p.nodeIds.includes('N0002'));
    const phaseOf4 = result.find(p => p.nodeIds.includes('N0004'));
    assert.ok(phaseOf2.id < phaseOf4.id, 'N0002 は N0004 より前のフェーズ');
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
    // N0001→N0003, N0002→N0004 の両方とも同一フェーズ内
    const phases = [
      { id: 0, name: 'P0', nodeIds: ['N0001', 'N0002', 'N0003', 'N0004'] },
    ];
    const hardEdges = [
      { from: 'N0001', to: 'N0003', type: 'depends_on' },
      { from: 'N0002', to: 'N0004', type: 'depends_on' },
    ];
    const result = enforceHardConstraints(phases, hardEdges);
    // 複数回の分割で全ての違反が解消される
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
    // 各ノードが異なるフェーズになる
    const nodePhase = {};
    result.forEach(p => p.nodeIds.forEach(n => { nodePhase[n] = p.id; }));
    assert.ok(nodePhase['N0001'] < nodePhase['N0002'], 'N0001→N0002');
    assert.ok(nodePhase['N0002'] < nodePhase['N0003'], 'N0002→N0003');
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
    // config(の最終=N0002) が security(の先頭=N0003) より前 → 維持
    assert.deepStrictEqual(result, order);
  });

  it('should reorder when constraint is violated', () => {
    const order = ['N0003', 'N0001', 'N0004', 'N0002'];
    const depDirs = [{ from: 'src/config', to: 'src/security' }];
    const result = applyDirectoryConstraints(order, depDirs, nodeToDirMap);
    // config(N0001,N0002) が security(N0003,N0004) より前になるよう調整
    const posConfig1 = result.indexOf('N0001');
    const posConfig2 = result.indexOf('N0002');
    const posSec3 = result.indexOf('N0003');
    const posSec4 = result.indexOf('N0004');
    // config の最後のノードが security の最初のノードより前
    const lastConfig = Math.max(posConfig1, posConfig2);
    const firstSec = Math.min(posSec3, posSec4);
    assert.ok(lastConfig < firstSec, 'config は security より前に配置されるべき');
  });

  it('should handle multiple dependency directions', () => {
    const order = ['N0005', 'N0001', 'N0002', 'N0003', 'N0004', 'N0006'];
    const depDirs = [
      { from: 'src/config', to: 'src/security' },
      { from: 'src/security', to: 'src/error' },
    ];
    const result = applyDirectoryConstraints(order, depDirs, nodeToDirMap);
    // config が security より前、security が error より前
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
    // 全ノードが保持されている
    for (const nid of order) {
      assert.ok(result.includes(nid), '欠落: ' + nid);
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
