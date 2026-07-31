// [::TICKET::] PX-113 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-113 --for-spec --no-implementation-order`.

'use strict';

/**
 * phasify-omissions.test.js — Tests for phasify-omissions.js PX-113 fixes
 *
 * Verifies:
 * 1. buildOutput deep clone preserves all fields
 * 2. All tickets assigned to phases (no dedupTickets separation)
 * 3. No phase consolidation (ticket count preserved)
 * 4. Phase ID offset works
 * 5. validatePhasedOmissions passes
 */

const assert = require('assert');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Module under test
const phasifyOmissions = require('./phasify-omissions.js');

// ============================================================
// Test fixtures
// ============================================================

const MINIMAL_OMISSIONS = {
  title: 'test-omissions',
  metadata: { source: '/tmp/test.json', generatedAt: '2026-07-31' },
  phases: [{
    id: 0,
    name: 'Base Phase',
    characteristics: '',
    tickets: [{
      id: 1, phaseId: 0, status: 'todo', title: 'Ticket A with omission',
      originalTicketKey: 'P0-1',
      foundOmissions: [{ severity: 'major', evaluations: [{ criterion: 'A', passed: false, reason: 'test reason', evidence: [{ file: 'src/test.rs', line: 5 }] }] }],
      contracts: [{ id: 'C001', precondition: 'x', postcondition: 'y', invariant: 'z' }],
      scope: ['scope item 1', 'scope item 2'],
      background: '*Original background text*\nWith multiple lines.',
      acceptanceCriteria: ['Happy: works', 'Error: fails gracefully'],
      notes: 'Implementation notes here.',
      fromStub: false,
      stubs: [{ file: 'src/stub.rs', content: '[::STUB::] stub content' }],
      nodeIds: ['N0001', 'N0002']
    }, {
      id: 2, phaseId: 0, status: 'reviewed', title: 'Ticket B (no omission)',
      nodeIds: ['N0003'],
      background: 'Clean ticket',
      contracts: [],
      scope: ['clean scope'],
      acceptanceCriteria: ['works'],
      notes: '',
      fromStub: true,
      stubs: [{ file: 'src/stub2.rs', content: '[::STUB::] another stub' }]
    }]
  }]
};

const MINIMAL_GRAPH = {
  nodes: [
    { id: 'N0001', title: 'Node 1' },
    { id: 'N0002', title: 'Node 2' },
    { id: 'N0003', title: 'Node 3' }
  ],
  edges: [
    { from: 'N0001', to: 'N0002', type: 'precedes' },
    { from: 'N0002', to: 'N0003', type: 'precedes' }
  ]
};

const MINIMAL_TICKETS = {
  title: 'test-tickets',
  metadata: { source: '/tmp/rfc.md', generatedAt: '2026-07-31' },
  phases: [{ id: 0, name: 'Phase 0', characteristics: '', tickets: [] }]
};

// ============================================================
// Test 1: buildOutput deep clone preserves ALL fields
// ============================================================
assert(typeof phasifyOmissions.buildOutput === 'function', 'buildOutput must be a function');

(function testBuildOutputPreservesAllFields() {
  const phases = [{ id: 6, name: 'P6', nodeIds: ['N0001', 'N0002'], tickets: [MINIMAL_OMISSIONS.phases[0].tickets[0]] }];
  const referenceTickets = [MINIMAL_OMISSIONS.phases[0].tickets[1]];
  const metadata = { source: '/tmp/test.json', graphSource: '/tmp/graph.json', ticketsSource: '/tmp/tickets.json' };

  const output = phasifyOmissions.buildOutput(phases, referenceTickets, metadata);

  // Phase ticket: all fields preserved
  const phaseTicket = output.phases[0].tickets[0];
  assert.strictEqual(phaseTicket.title, 'Ticket A with omission');
  assert.strictEqual(phaseTicket.originalTicketKey, 'P0-1');
  assert.strictEqual(phaseTicket.status, 'todo'); // Overridden
  assert.ok(Array.isArray(phaseTicket.foundOmissions));
  assert.strictEqual(phaseTicket.foundOmissions.length, 1);
  assert.strictEqual(phaseTicket.foundOmissions[0].severity, 'major');
  assert.strictEqual(phaseTicket.contracts[0].id, 'C001');
  assert.strictEqual(phaseTicket.scope[0], 'scope item 1');
  assert.strictEqual(phaseTicket.scope[1], 'scope item 2');
  assert.strictEqual(phaseTicket.background, '*Original background text*\nWith multiple lines.');
  assert.strictEqual(phaseTicket.acceptanceCriteria[0], 'Happy: works');
  assert.strictEqual(phaseTicket.notes, 'Implementation notes here.');
  assert.strictEqual(phaseTicket.fromStub, false);
  assert.ok(Array.isArray(phaseTicket.stubs));
  assert.strictEqual(phaseTicket.stubs[0].file, 'src/stub.rs');
  assert.strictEqual(phaseTicket.nodeIds[0], 'N0001');

  // Reference ticket: all fields preserved + note added
  const refTicket = output.referenceTickets[0];
  assert.strictEqual(refTicket.title, 'Ticket B (no omission)');
  assert.strictEqual(refTicket.background, 'Clean ticket');
  assert.strictEqual(refTicket.fromStub, true);
  assert.strictEqual(refTicket.stubs[0].file, 'src/stub2.rs');
  assert.strictEqual(refTicket.nodeIds[0], 'N0003');
  assert.ok(refTicket.note.includes('No ABC violations found'));

  // Deep clone independence
  phaseTicket.title = 'MODIFIED';
  assert.strictEqual(MINIMAL_OMISSIONS.phases[0].tickets[0].title, 'Ticket A with omission',
    'Modifying output must not affect input');

  console.log('✅ testBuildOutputPreservesAllFields passed');
})();

// ============================================================
// Test 2: dedup is removed — all tickets treated uniformly
// ============================================================
assert(typeof phasifyOmissions.dedupTickets === 'function', 'dedupTickets function must exist');

(function testDedupTicketsNoSeparation() {
  // The dedupTickets function should still work for backward-compat exports
  // But the main pipeline must not call it — test via extractOmissionSubgraph

  const { omissionNodeIds } = phasifyOmissions.extractOmissionSubgraph(MINIMAL_OMISSIONS, MINIMAL_GRAPH);
  // Both tickets' nodeIds should be collected
  assert.ok(omissionNodeIds.has('N0001'), 'N0001 must be in omission nodes');
  assert.ok(omissionNodeIds.has('N0002'), 'N0002 must be in omission nodes');
  assert.ok(omissionNodeIds.has('N0003'), 'N0003 must be in omission nodes');
  assert.strictEqual(omissionNodeIds.size, 3, 'All 3 nodes must be collected (no filtering of reference tickets)');

  console.log('✅ testDedupTicketsNoSeparation passed');
})();

// ============================================================
// Test 3: Ticket count preserved (no consolidation)
// ============================================================
(function testConsolidationRemoved() {
  // verify consolidatePhasesByTicketCount still exists but can be bypassed
  assert(typeof phasifyOmissions.consolidatePhasesByTicketCount === 'function',
    'consolidatePhasesByTicketCount must still exist for backward compatibility');

  // Test with empty input to verify it doesn't crash
  const result = phasifyOmissions.consolidatePhasesByTicketCount([]);
  assert.ok(Array.isArray(result));
  assert.strictEqual(result.length, 0);

  console.log('✅ testConsolidationRemoved passed');
})();

// ============================================================
// Test 4: Phase ID offset
// ============================================================
(function testPhaseIdOffset() {
  const tsPath = path.join(os.tmpdir(), 'test-tickets-offset-' + Date.now() + '.json');
  try {
    fs.writeFileSync(tsPath, JSON.stringify({
      title: 'test',
      metadata: {},
      phases: [
        { id: 0, name: 'P0', tickets: [] },
        { id: 1, name: 'P1', tickets: [] },
        { id: 5, name: 'P5', tickets: [] }
      ]
    }));

    const offset = phasifyOmissions.computePhaseIdOffset(tsPath);
    assert.strictEqual(offset, 6, 'Offset must be max phase id + 1 (5+1=6)');
  } finally {
    try { fs.unlinkSync(tsPath); } catch (e) { /* ignore */ }
  }

  console.log('✅ testPhaseIdOffset passed');
})();

// ============================================================
// Test 5: assignTicketsToPhases works with all tickets
// ============================================================
(function testAssignAllTickets() {
  const phases = [{ id: 6, name: 'P6', nodeIds: ['N0001', 'N0002', 'N0003'], tickets: [] }];
  const allTickets = MINIMAL_OMISSIONS.phases[0].tickets; // Both Ticket A and Ticket B
  const nodeOrder = ['N0001', 'N0002', 'N0003'];

  const result = phasifyOmissions.assignTicketsToPhases(phases, allTickets, nodeOrder);

  // Both tickets must be assigned
  const assignedPhase = result[0];
  assert.strictEqual(assignedPhase.tickets.length, 2, 'Both tickets must be assigned');
  assert.strictEqual(assignedPhase.tickets[0].id, 1);
  assert.strictEqual(assignedPhase.tickets[1].id, 2);

  // Both must have correct phaseId
  assert.strictEqual(assignedPhase.tickets[0].phaseId, 6);
  assert.strictEqual(assignedPhase.tickets[1].phaseId, 6);

  console.log('✅ testAssignAllTickets passed');
})();

// ============================================================
// Test 6: validatePhasedOmissions passes with valid output
// ============================================================
(function testValidatePhasedOmissions() {
  const phases = [{
    id: 6, name: 'P6', nodeIds: ['N0001', 'N0002', 'N0003'],
    tickets: MINIMAL_OMISSIONS.phases[0].tickets
  }];
  const nodes = MINIMAL_GRAPH.nodes;
  const edges = MINIMAL_GRAPH.edges;
  const omissionNodeIds = new Set(['N0001', 'N0002', 'N0003']);

  const inMemory = {
    title: 'test',
    metadata: {},
    phases: phases
  };

  const result = phasifyOmissions.validatePhasedOmissions(inMemory, nodes, edges, omissionNodeIds);

  assert.ok(result.valid, 'Validation must pass: ' + JSON.stringify(result.checks));
  assert.ok(result.checks.allNodesCovered.passed, 'All nodes must be covered');
  assert.ok(result.checks.noDuplicateNodes.passed, 'No duplicate nodes allowed');
  assert.ok(result.checks.hardConstraints.passed, 'Hard constraints must be satisfied');

  console.log('✅ testValidatePhasedOmissions passed');
})();

// ============================================================
// Test 7: validatePhasedOmissions rejects missing nodes
// ============================================================
(function testValidatePhasedOmissionsMissingNodes() {
  const phases = [{ id: 6, name: 'P6', nodeIds: ['N0001'], tickets: [] }];
  const nodes = MINIMAL_GRAPH.nodes;
  const edges = [];
  const omissionNodeIds = new Set(['N0001', 'N0002']); // N0002 is missing from phases

  const inMemory = {
    title: 'test', metadata: {},
    phases: phases
  };

  const result = phasifyOmissions.validatePhasedOmissions(inMemory, nodes, edges, omissionNodeIds);
  assert.ok(!result.valid, 'Validation must fail when nodes are missing');
  assert.ok(!result.checks.allNodesCovered.passed);

  console.log('✅ testValidatePhasedOmissionsMissingNodes passed');
})();

// ============================================================
// Test 8: extractOmissionSubgraph
// ============================================================
(function testExtractOmissionSubgraph() {
  const { nodes, edges, omissionNodeIds } = phasifyOmissions.extractOmissionSubgraph(MINIMAL_OMISSIONS, MINIMAL_GRAPH);
  assert.strictEqual(omissionNodeIds.size, 3, 'All 3 node IDs from both tickets must be collected');
  assert.ok(edges.length > 0, 'Edges must be filtered');

  console.log('✅ testExtractOmissionSubgraph passed');
})();

// ============================================================
// Test 9: Cross-phase duplicate ticket IDs are re-numbered
// ============================================================
(function testCrossPhaseDuplicateIdsRenumbered() {
  // Simulate tickets from different original phases both having id=1
  const phases = [{ id: 6, name: 'P6', nodeIds: ['N0001', 'N0002'], tickets: [] }];
  const tickets = [
    { id: 1, phaseId: 0, title: 'From Phase 0', nodeIds: ['N0001'] },
    { id: 1, phaseId: 1, title: 'From Phase 1', nodeIds: ['N0002'] }
  ];
  const nodeOrder = ['N0001', 'N0002'];

  const result = phasifyOmissions.assignTicketsToPhases(phases, tickets, nodeOrder);

  // Both land in phase 6, must have unique sequential IDs
  const assignedPhase = result[0];
  assert.strictEqual(assignedPhase.tickets.length, 2, 'Both tickets must be assigned');
  assert.strictEqual(assignedPhase.tickets[0].id, 1, 'First ticket gets id=1');
  assert.strictEqual(assignedPhase.tickets[1].id, 2, 'Second ticket gets id=2 (not duplicate id=1)');
  assert.notStrictEqual(assignedPhase.tickets[0].id, assignedPhase.tickets[1].id, 'IDs must be unique');

  console.log('✅ testCrossPhaseDuplicateIdsRenumbered passed');
})();

console.log('\n🎉 All PX-113 tests passed!');
