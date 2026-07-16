/**
 * acceptance-criteria.test.cjs — Acceptance Criteria verification tests for graphify-rfc
 *
 * Test framework: Node.js standard node:test + node:assert/strict
 * Monkey-patches public functions of existing base scripts (verify.js / query.js)
 * to verify the Acceptance Criteria defined in RFC-GRAPHIFY.md.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// ============================================================
// AC 1: verify.js coverage verification
// ============================================================

describe('AC1: verify.js coverage verification', () => {
  it('returns {"ok":true} for 100% coverage', () => {
    const { checkCoverage } = require('../../.claude/scripts/rfc-graph/verify.js');

    // No ## headings, no headingRefs → all headings covered
    const sourceLines = [
      '# Test Requirements',
      '',
      'Requirement 1: Login feature',
    ];

    const nodes = [
      { id: 'N0001', headingRefs: [{ refId: 'REF001', heading: 1, texts: ['Test Requirements'] }]},
      { id: 'N0002', headingRefs: [{ refId: 'REF002', heading: 1, texts: ['Requirement 1'] }]},
    ];

    const result = checkCoverage(sourceLines, nodes);

    assert.equal(result.covered, true);
    assert.deepEqual(result.uncoveredHeadings, []);
  });

  it('returns ok:false when uncovered headings exist', () => {
    const { checkCoverage } = require('../../.claude/scripts/rfc-graph/verify.js');

    // ## API is a heading, but no node's headingRefs includes "API"
    const sourceLines = [
      '# Test Requirements',
      'Requirement 1: Login feature',
      '',
      '## API',
    ];

    const nodes = [
      { id: 'N0001', headingRefs: [{ refId: 'REF001', heading: 2, texts: ['Requirements'] }]},
    ];

    const result = checkCoverage(sourceLines, nodes);

    assert.equal(result.covered, false);
    assert.deepEqual(result.uncoveredHeadings, ['API']);
  });

  it('returns ok:false when isolated nodes exist', () => {
    const { checkIsolated } = require('../../.claude/scripts/rfc-graph/verify.js');

    const nodes = [
      { id: 'N0001' },
      { id: 'N0002' },
      { id: 'N0003' },
    ];

    const edges = [
      { from: 'N0001', to: 'N0002', type: 'depends_on' },
    ];

    const result = checkIsolated(nodes, edges);

    assert.equal(result.connected, false);
    assert.deepEqual(result.isolatedNodes, ['N0003']);
  });
});


// ============================================================
// AC 3: query.js multi-hop
// ============================================================

describe('AC3: query.js multi-hop', () => {
  it('--hops=1 and --hops=2 return different node sets', () => {
    const { multiHopBFS } = require('../../.claude/scripts/rfc-graph/query.js');

    // A → B → C graph
    const graph = {
      nodes: [
        { id: 'N0001', title: 'A', kind: 'requirement', summary: '' },
        { id: 'N0002', title: 'B', kind: 'requirement', summary: '' },
        { id: 'N0003', title: 'C', kind: 'requirement', summary: '' },
      ],
      edges: [
        { from: 'N0001', to: 'N0002', type: 'depends_on', attributes: {} },
        { from: 'N0002', to: 'N0003', type: 'depends_on', attributes: {} },
      ],
    };

    // hops=1: only directly connected nodes from N0001 (self + N0002)
    const hop1Result = multiHopBFS(graph, 'N0001', 1);
    const hop1Ids = hop1Result.nodeIds;

    // hops=2: up to 2 hops from N0001 (self + N0002 + N0003)
    const hop2Result = multiHopBFS(graph, 'N0001', 2);
    const hop2Ids = hop2Result.nodeIds;

    // hops=1 includes N0001 and N0002 (N0003 is 2 hops away)
    assert.ok(hop1Ids.includes('N0002'));
    assert.ok(!hop1Ids.includes('N0003'));

    // hops=2 includes N0001, N0002, N0003
    assert.ok(hop2Ids.includes('N0003'));

    // Node sets differ
    assert.notDeepEqual(hop1Ids, hop2Ids);
  });

  it('--hops=1 returns only directly connected nodes', () => {
    const { multiHopBFS } = require('../../.claude/scripts/rfc-graph/query.js');

    // A → B, A → C, C → D graph (D is 2 hops away)
    const graph = {
      nodes: [
        { id: 'N0001', title: 'A', kind: 'requirement', summary: '' },
        { id: 'N0002', title: 'B', kind: 'requirement', summary: '' },
        { id: 'N0003', title: 'C', kind: 'requirement', summary: '' },
        { id: 'N0004', title: 'D', kind: 'requirement', summary: '' },
      ],
      edges: [
        { from: 'N0001', to: 'N0002', type: 'depends_on', attributes: {} },
        { from: 'N0001', to: 'N0003', type: 'refines', attributes: {} },
        { from: 'N0003', to: 'N0004', type: 'implements', attributes: {} },
      ],
    };

    const hop1Result = multiHopBFS(graph, 'N0001', 1);
    const hop1Ids = hop1Result.nodeIds;

    // Directly connected nodes + self
    assert.ok(hop1Ids.includes('N0001'));
    assert.ok(hop1Ids.includes('N0002'));
    assert.ok(hop1Ids.includes('N0003'));
    assert.ok(!hop1Ids.includes('N0004')); // D is 2 hops away
  });
});
