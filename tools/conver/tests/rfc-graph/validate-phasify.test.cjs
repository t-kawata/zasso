/**
 * validate-phasify.test.cjs — Unit tests for validate-phasify.js
 *
 * Test framework: Node.js standard node:test + node:assert/strict
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  validateAll,
  checkAllNodesCovered,
  checkSinglePhasePerNode,
  checkHardConstraints,
  checkPhaseSizeMinimum,
  checkDirsConstraint,
  checkNoOrphanNodes,
  buildNodeToDirMap,
  buildNodeToPhaseMap,
  HARD_EDGE_TYPES,
} = require('../../.claude/scripts/rfc-graph/validate-phasify.js');

// ============================================================
// Helpers: Test Data Generation
// ============================================================

function makeNode(id) {
  return { id, kind: 'api_contract', language: 'rust', slug: 'test_' + id, title: id, summary: id };
}

function makeEdge(from, to, type) {
  return { from, to, type };
}

function makePhase(id, name, nodeIds) {
  return { id, name, nodeIds: nodeIds || [] };
}

function makeTicketJson(phases) {
  return { title: 'test', metadata: { source: '', generatedAt: '2026-01-01' }, phases };
}

function makeDirsTree(rustTree) {
  return { trees: { rust: rustTree }, dependencyDirections: {} };
}

// ============================================================
// HARD_EDGE_TYPES
// ============================================================

describe('HARD_EDGE_TYPES', () => {
  it('should contain depends_on, implements, constrains', () => {
    assert.ok(HARD_EDGE_TYPES.has('depends_on'));
    assert.ok(HARD_EDGE_TYPES.has('implements'));
    assert.ok(HARD_EDGE_TYPES.has('constrains'));
  });

  it('should not contain non-hard edge types', () => {
    assert.ok(!HARD_EDGE_TYPES.has('references'));
    assert.ok(!HARD_EDGE_TYPES.has('refines'));
    assert.ok(!HARD_EDGE_TYPES.has('part_of'));
  });
});

// ============================================================
// checkAllNodesCovered
// ============================================================

describe('checkAllNodesCovered', () => {
  it('should pass when all nodes are covered', () => {
    const nodes = [makeNode('N0001'), makeNode('N0002')];
    const phases = [makePhase(0, 'P0', ['N0001', 'N0002'])];
    const result = checkAllNodesCovered(nodes, phases);
    assert.ok(result.passed);
    assert.strictEqual(result.total, 2);
    assert.strictEqual(result.covered, 2);
    assert.strictEqual(result.missing.length, 0);
  });

  it('should fail when some nodes are not covered', () => {
    const nodes = [makeNode('N0001'), makeNode('N0002'), makeNode('N0003')];
    const phases = [makePhase(0, 'P0', ['N0001', 'N0002'])];
    const result = checkAllNodesCovered(nodes, phases);
    assert.ok(!result.passed);
    assert.strictEqual(result.missing.length, 1);
    assert.strictEqual(result.missing[0], 'N0003');
  });

  it('should pass with empty phases when no nodes exist', () => {
    const result = checkAllNodesCovered([], [makePhase(0, 'P0', [])]);
    assert.ok(result.passed);
    assert.strictEqual(result.total, 0);
  });
});

// ============================================================
// checkSinglePhasePerNode
// ============================================================

describe('checkSinglePhasePerNode', () => {
  it('should pass when each node is in one phase only', () => {
    const phases = [
      makePhase(0, 'P0', ['N0001', 'N0002']),
      makePhase(1, 'P1', ['N0003', 'N0004']),
    ];
    const result = checkSinglePhasePerNode(phases);
    assert.ok(result.passed);
    assert.strictEqual(result.duplicates.length, 0);
  });

  it('should fail when a node appears in multiple phases', () => {
    const phases = [
      makePhase(0, 'P0', ['N0001', 'N0002']),
      makePhase(1, 'P1', ['N0002', 'N0003']),
    ];
    const result = checkSinglePhasePerNode(phases);
    assert.ok(!result.passed);
    assert.strictEqual(result.duplicates.length, 1);
    assert.strictEqual(result.duplicates[0].nodeId, 'N0002');
  });
});

// ============================================================
// checkHardConstraints
// ============================================================

describe('checkHardConstraints', () => {
  // depends_on(u→v) = "u depends on v" → v (dependency) implemented first
  // Violation: phase(v) >= phase(u) = dependency is equal or later than dependant

  it('should pass when dependency is before dependant', () => {
    const edges = [makeEdge('N0001', 'N0002', 'depends_on')];
    // N0002 (dependency) in P0, N0001 (dependant) in P1 → correct order
    const phases = [makePhase(0, 'P0', ['N0002']), makePhase(1, 'P1', ['N0001'])];
    const nodeToPhase = buildNodeToPhaseMap(phases);
    const result = checkHardConstraints(edges, phases, nodeToPhase);
    assert.ok(result.passed);
    assert.strictEqual(result.violations.length, 0);
  });

  it('should fail when dependency is after dependant', () => {
    const edges = [makeEdge('N0001', 'N0002', 'depends_on')];
    // N0001 (dependant) in P0, N0002 (dependency) in P1 → reversed (violation)
    const phases = [makePhase(0, 'P0', ['N0001']), makePhase(1, 'P1', ['N0002'])];
    const nodeToPhase = buildNodeToPhaseMap(phases);
    const result = checkHardConstraints(edges, phases, nodeToPhase);
    assert.ok(!result.passed);
    assert.strictEqual(result.violations.length, 1);
    assert.strictEqual(result.violations[0].type, 'depends_on');
  });

  it('should ignore non-hard edge types', () => {
    const edges = [makeEdge('N0001', 'N0002', 'references')];
    const phases = [makePhase(0, 'P0', ['N0002']), makePhase(1, 'P1', ['N0001'])];
    const nodeToPhase = buildNodeToPhaseMap(phases);
    const result = checkHardConstraints(edges, phases, nodeToPhase);
    assert.ok(result.passed);
    assert.strictEqual(result.violations.length, 0);
  });

  it('should detect when node is not in any phase', () => {
    const edges = [makeEdge('N0001', 'N0002', 'depends_on')];
    const phases = [makePhase(0, 'P0', ['N0001'])];
    const nodeToPhase = buildNodeToPhaseMap(phases);
    const result = checkHardConstraints(edges, phases, nodeToPhase);
    assert.ok(!result.passed);
    assert.strictEqual(result.violations.length, 1);
    assert.ok(result.violations[0].reason.includes('does not belong to any phase'));
  });

  it('should pass with empty edges', () => {
    const result = checkHardConstraints([], [makePhase(0, 'P0', [])], {});
    assert.ok(result.passed);
  });
});

// ============================================================
// checkPhaseSizeMinimum
// ============================================================

describe('checkPhaseSizeMinimum', () => {
  it('should pass when all phases have at least 10 nodes', () => {
    const largePhase = makePhase(0, 'P0', Array.from({ length: 10 }, (_, i) => 'N' + String(i + 1).padStart(4, '0')));
    const result = checkPhaseSizeMinimum([largePhase], 20);
    assert.ok(result.passed);
    assert.strictEqual(result.issues.length, 0);
  });

  it('should fail when a phase has fewer than 10 nodes', () => {
    const smallPhase = makePhase(0, 'P0', ['N0001', 'N0002', 'N0003']);
    const result = checkPhaseSizeMinimum([smallPhase], 20);
    assert.ok(!result.passed);
    assert.strictEqual(result.issues.length, 1);
    assert.strictEqual(result.issues[0].size, 3);
  });

  it('should issue warning (not error) when total nodes < 10', () => {
    const smallPhase = makePhase(0, 'P0', ['N0001', 'N0003']);
    const result = checkPhaseSizeMinimum([smallPhase], 5);
    // totalNodes (5) < 10 → isWarning should be true
    assert.ok(result.passed);
    assert.strictEqual(result.issues.length, 1);
    assert.ok(result.issues[0].isWarning);
  });

  it('should pass with empty phases array', () => {
    const result = checkPhaseSizeMinimum([], 0);
    assert.ok(result.passed);
  });
});

// ============================================================
// buildNodeToDirMap
// ============================================================

describe('buildNodeToDirMap', () => {
  it('should build a map from tree nodes', () => {
    const dirsTree = makeDirsTree({
      name: 'src',
      type: 'directory',
      children: [
        {
          name: 'config',
          type: 'file',
          mappedNodeIds: [{ nodeId: 'N0022', title: 'Config' }],
        },
        {
          name: 'security',
          type: 'file',
          mappedNodeIds: [{ nodeId: 'N0096', title: 'Security' }],
        },
      ],
    });
    const result = buildNodeToDirMap(dirsTree);
    assert.strictEqual(result['N0022'], 'src/config');
    assert.strictEqual(result['N0096'], 'src/security');
  });

  it('should return empty map for empty tree', () => {
    const result = buildNodeToDirMap(makeDirsTree(null));
    assert.strictEqual(Object.keys(result).length, 0);
  });
});

// ============================================================
// buildNodeToPhaseMap
// ============================================================

describe('buildNodeToPhaseMap', () => {
  it('should map node IDs to phase IDs', () => {
    const phases = [
      { id: 0, name: 'P0', nodeIds: ['N0001', 'N0002'] },
      { id: 1, name: 'P1', nodeIds: ['N0003'] },
    ];
    const result = buildNodeToPhaseMap(phases);
    assert.strictEqual(result['N0001'], 0);
    assert.strictEqual(result['N0002'], 0);
    assert.strictEqual(result['N0003'], 1);
  });

  it('should use first phase for duplicate nodes', () => {
    const phases = [
      { id: 0, name: 'P0', nodeIds: ['N0001'] },
      { id: 1, name: 'P1', nodeIds: ['N0001'] },
    ];
    const result = buildNodeToPhaseMap(phases);
    assert.strictEqual(result['N0001'], 0);
  });
});

// ============================================================
// checkDirsConstraint
// ============================================================

describe('checkDirsConstraint', () => {
  it('should pass when no dependency directions exist', () => {
    const result = checkDirsConstraint(null, [], {}, {});
    assert.ok(result.passed);
  });

  it('should pass when dependency directions are satisfied', () => {
    const depDirs = { rust: [{ from: 'src/config', to: 'src/security', rule: 'references' }] };
    const nodeToDir = { 'N0022': 'src/config', 'N0096': 'src/security' };
    const nodeToPhase = { 'N0022': 0, 'N0096': 1 };
    const phases = [
      { id: 0, name: 'P0', nodeIds: ['N0022'] },
      { id: 1, name: 'P1', nodeIds: ['N0096'] },
    ];
    const result = checkDirsConstraint(depDirs, phases, nodeToDir, nodeToPhase);
    assert.ok(result.passed);
  });
});

// ============================================================
// checkNoOrphanNodes
// ============================================================

describe('checkNoOrphanNodes', () => {
  it('should pass when all nodes are in phases', () => {
    const nodes = [makeNode('N0001'), makeNode('N0002')];
    const phases = [makePhase(0, 'P0', ['N0001', 'N0002'])];
    const result = checkNoOrphanNodes(nodes, phases);
    assert.ok(result.passed);
    assert.strictEqual(result.orphans.length, 0);
  });

  it('should fail when nodes are orphaned', () => {
    const nodes = [makeNode('N0001'), makeNode('N0002')];
    const phases = [makePhase(0, 'P0', ['N0001'])];
    const result = checkNoOrphanNodes(nodes, phases);
    assert.ok(!result.passed);
    assert.strictEqual(result.orphans.length, 1);
    assert.strictEqual(result.orphans[0], 'N0002');
  });
});

// ============================================================
// validateAll (Integration Test)
// ============================================================

describe('validateAll', () => {
  // depends_on(u→v): u depends on v → v (dependency) implemented first
  // Violation: phase(v) >= phase(u)

  it('should pass with valid input (all conditions met)', () => {
    const ticketJson = makeTicketJson([
      { id: 0, name: 'P0', nodeIds: ['N0001', 'N0002', 'N0003', 'N0004', 'N0005', 'N0006', 'N0007', 'N0008', 'N0009', 'N0010'] },
      { id: 1, name: 'P1', nodeIds: ['N0011', 'N0012', 'N0013', 'N0014', 'N0015', 'N0016', 'N0017', 'N0018', 'N0019', 'N0020'] },
    ]);
    const nodes = Array.from({ length: 20 }, (_, i) => makeNode('N' + String(i + 1).padStart(4, '0')));
    // N0011 depends_on N0001 → N0001 (dependency) in P0, N0011 (dependant) in P1 → correct
    const edges = [makeEdge('N0011', 'N0001', 'depends_on')];
    const dirsTree = makeDirsTree({ name: 'src', type: 'directory', children: [] });

    const result = validateAll(ticketJson, nodes, edges, dirsTree);
    assert.ok(result.valid);
    assert.strictEqual(result.errors.length, 0);
  });

  it('should fail when nodes are missing from phases', () => {
    const ticketJson = makeTicketJson([
      { id: 0, name: 'P0', nodeIds: ['N0001', 'N0002', 'N0003', 'N0004', 'N0005', 'N0006', 'N0007', 'N0008', 'N0009', 'N0010'] },
    ]);
    const nodes = Array.from({ length: 11 }, (_, i) => makeNode('N' + String(i + 1).padStart(4, '0')));

    const result = validateAll(ticketJson, nodes, [], makeDirsTree({ name: 'src', type: 'directory', children: [] }));
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('not covered')));
  });

  it('should fail when hard constraint is violated', () => {
    const ticketJson = makeTicketJson([
      { id: 0, name: 'P0', nodeIds: ['N0001', 'N0013', 'N0014', 'N0015', 'N0016', 'N0017', 'N0018', 'N0019', 'N0020', 'N0021', 'N0022'] },
      { id: 1, name: 'P1', nodeIds: ['N0002', 'N0003', 'N0004', 'N0005', 'N0006', 'N0007', 'N0008', 'N0009', 'N0010', 'N0011', 'N0012'] },
    ]);
    const nodes = Array.from({ length: 22 }, (_, i) => makeNode('N' + String(i + 1).padStart(4, '0')));
    // N0001 depends_on N0002 → N0002 (dependency) in P1 (later), N0001 (dependant) in P0 (earlier) → reversed, violation
    const edges = [makeEdge('N0001', 'N0002', 'depends_on')];
    const dirsTree = makeDirsTree({ name: 'src', type: 'directory', children: [] });

    const result = validateAll(ticketJson, nodes, edges, dirsTree);
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('Check 3 FAILED')));
  });

  it('should fail when phase is below minimum size (total >= 10)', () => {
    // totalNodes >= 10 and a specific phase has fewer than 10 → error
    const ticketJson = makeTicketJson([
      { id: 0, name: 'P0', nodeIds: ['N0001', 'N0002', 'N0003', 'N0004', 'N0005'] },
      { id: 1, name: 'P1', nodeIds: Array.from({ length: 10 }, (_, i) => 'N' + String(i + 6).padStart(4, '0')) },
    ]);
    const nodes = Array.from({ length: 15 }, (_, i) => makeNode('N' + String(i + 1).padStart(4, '0')));

    const result = validateAll(ticketJson, nodes, [], makeDirsTree({ name: 'src', type: 'directory', children: [] }), { allowSmallPhases: false });
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('below min')));
  });
});
