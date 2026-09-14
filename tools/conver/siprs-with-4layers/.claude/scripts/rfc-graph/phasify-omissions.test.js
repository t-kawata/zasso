// [::TICKET::] PX-115 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-115 --for-spec --no-implementation-order`.

// [::TICKET::] PX-115 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-115 --for-spec --no-implementation-order`.

// [::TICKET::] PX-115 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-115 --for-spec --no-implementation-order`.

// [::TICKET::] PX-114 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-114 --for-spec --no-implementation-order`.


// [::TICKET::] PX-113 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-113 --for-spec --no-implementation-order`.

'use strict';

/**
 * phasify-omissions.test.js — Tests for phasify-omissions.js PX-115 fixes
 *
 * Verifies:
 * 1. buildOutput deep clone preserves all fields
 * 2. All tickets assigned to phases (no dedupTickets separation)
 * 3. Phase consolidation by ticket count with re-index IDs (split-to-tickets.md Step 5-3)
 * 4. Phase ID offset works
 * 5. validatePhasedOmissions passes
 * 6. Snapshot-based --rollback (resolveSnapshotPath / rollbackFromSnapshot)
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
// Test 3: Phase consolidation by ticket count (split-to-tickets.md Step 5-3)
// ============================================================
assert(typeof phasifyOmissions.consolidatePhasesByTicketCount === 'function',
  'consolidatePhasesByTicketCount must be a function');

(function testConsolidationMergesAndReindexes() {
  // @verifies C001 — phases with fewer than 3 tickets are merged; all phases end >= 3
  // @verifies C002 — merged phase ticket IDs are re-indexed 1..N (unique)
  // P6(3), P7(3), P8(1), P9(1), P10(1), P11(1) → P6, P7, merged phase with 4 tickets
  const phases = [6, 7, 8, 9, 10, 11].map(function(id) {
    return { id: id, name: 'P' + id, nodeIds: ['N' + id], tickets: [{ id: 1, phaseId: id, status: 'todo', title: 'T' + id }] };
  });
  phases[0].tickets = [1, 2, 3].map(function(ticketId) {
    return { id: ticketId, phaseId: 6, status: 'todo', title: 'A' + ticketId };
  });
  phases[1].tickets = [1, 2, 3].map(function(ticketId) {
    return { id: ticketId, phaseId: 7, status: 'todo', title: 'B' + ticketId };
  });

  const consolidated = phasifyOmissions.consolidatePhasesByTicketCount(phases);

  // P6(3) and P7(3) survive; P8..P11 (1 ticket each) consolidate into one phase
  assert.strictEqual(consolidated.length, 3, 'four one-ticket phases must consolidate into one');
  const mergedPhase = consolidated[consolidated.length - 1];
  assert.strictEqual(mergedPhase.tickets.length, 4, 'merged phase must hold 4 tickets');

  // Re-index is a separate step (split-to-tickets.md Step 5-3 substep 5-3-5)
  const result = phasifyOmissions.renumberTicketIdsInPhases(consolidated);
  const ids = result[result.length - 1].tickets.map(function(ticket) { return ticket.id; });
  assert.deepStrictEqual(ids, [1, 2, 3, 4], 'merged phase ticket IDs must be re-indexed 1..N');
  assert.strictEqual(new Set(ids).size, ids.length, 'ticket IDs must be unique in the merged phase');

  console.log('✅ testConsolidationMergesAndReindexes passed');
})();

(function testConsolidationSkipsUnsafeHardEdgeMerge() {
  // @verifies C003 — a merge that would place both endpoints of a depends_on edge in one phase is skipped
  // depends_on edge between the two phases → merge would put both endpoints in one phase
  const phases = [
    { id: 6, name: 'P6', nodeIds: ['N0001'], tickets: [{ id: 1, phaseId: 6, status: 'todo', title: 'a' }] },
    { id: 7, name: 'P7', nodeIds: ['N0002'], tickets: [{ id: 1, phaseId: 7, status: 'todo', title: 'b' }] }
  ];
  const hardEdges = [{ from: 'N0001', to: 'N0002', type: 'depends_on' }];

  const result = phasifyOmissions.consolidatePhasesByTicketCount(phases, hardEdges);

  // Unsafe merge must be skipped (C003): both endpoints stay in separate phases
  assert.strictEqual(result.length, 2, 'unsafe merge must be skipped');
  const nodePhase = {};
  for (const phase of result) for (const nid of (phase.nodeIds || [])) nodePhase[nid] = phase.id;
  assert.notStrictEqual(nodePhase['N0001'], nodePhase['N0002'],
    'hard edge endpoints must remain in different phases');

  console.log('✅ testConsolidationSkipsUnsafeHardEdgeMerge passed');
})();

(function testRenumberTicketIdsInPhases() {
  // @verifies C002 — re-index assigns sequential unique ids 1..N within each phase
  const phases = [
    { id: 6, name: 'P6', nodeIds: ['N0001'], tickets: [{ id: 9, phaseId: 6, title: 'x' }, { id: 3, phaseId: 6, title: 'y' }] }
  ];

  const result = phasifyOmissions.renumberTicketIdsInPhases(phases);

  assert.deepStrictEqual(result[0].tickets.map(function(ticket) { return ticket.id; }), [1, 2],
    'ticket IDs must be re-numbered sequentially 1..N');
  assert.ok(result[0].tickets.every(function(ticket) { return ticket.phaseId === 6; }),
    'phaseId must match the parent phase after renumbering');
  // Input immutability
  assert.strictEqual(phases[0].tickets[0].id, 9, 'renumber must not mutate its input');

  console.log('✅ testRenumberTicketIdsInPhases passed');
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

// ============================================================
// PX-114: Round-aware status (R<round>) in markPreMergeTicketsReviewed
// ============================================================

// [::TICKET::] PX-114 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-114 --for-spec --no-implementation-order`.
(function testMarkPreMergeTicketsReviewedRoundStatus() {
  const mergedData = {
    round: 1,
    phases: [
      { id: 0, name: 'P0', tickets: [{ id: 1, phaseId: 0, status: 'todo', title: 'A' }] },
      { id: 2, name: 'P2', tickets: [{ id: 2, phaseId: 2, status: 'todo', title: 'B' }] }
    ]
  };

  const result = phasifyOmissions.markPreMergeTicketsReviewed(
    JSON.parse(JSON.stringify(mergedData)), 2, 1
  );

  // Pre-merge ticket (phase.id < offset) gets round-aware status R1
  assert.strictEqual(result.phases[0].tickets[0].status, 'R1',
    'pre-merge ticket must be marked R1 (round-aware), got: ' + result.phases[0].tickets[0].status);
  // New omission phase (phase.id >= offset) stays todo
  assert.strictEqual(result.phases[1].tickets[0].status, 'todo',
    'new omission ticket must stay todo');
  // round field preserved for the orchestrator to increment
  assert.strictEqual(result.round, 1, 'round field must be preserved');
  // Input not mutated
  assert.strictEqual(mergedData.phases[0].tickets[0].status, 'todo',
    'markPreMergeTicketsReviewed must not mutate its input');

  console.log('✅ testMarkPreMergeTicketsReviewedRoundStatus passed');
})();

// [::TICKET::] PX-114 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-114 --for-spec --no-implementation-order`.
(function testMarkPreMergeTicketsReviewedHonorsRound() {
  const mergedData = {
    round: 2,
    phases: [
      { id: 0, name: 'P0', tickets: [{ id: 1, phaseId: 0, status: 'done', title: 'A' }] }
    ]
  };

  const result = phasifyOmissions.markPreMergeTicketsReviewed(
    JSON.parse(JSON.stringify(mergedData)), 1, 2
  );

  // The round value passed in is honored (not hardcoded to 1)
  assert.strictEqual(result.phases[0].tickets[0].status, 'R2',
    'round=2 must produce status R2, got: ' + result.phases[0].tickets[0].status);

  console.log('✅ testMarkPreMergeTicketsReviewedHonorsRound passed');
})();

// [::TICKET::] PX-114 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-114 --for-spec --no-implementation-order`.
(function testMarkPreMergeTicketsReviewedPreservesExistingRoundMarker() {
  const mergedData = {
    round: 2,
    phases: [
      {
        id: 0, name: 'P0',
        tickets: [
          { id: 1, phaseId: 0, status: 'R1', title: 'already-marked' },
          { id: 2, phaseId: 0, status: 'todo', title: 'not-yet-marked' }
        ]
      },
      { id: 2, name: 'P2', tickets: [{ id: 3, phaseId: 2, status: 'todo', title: 'new-omission' }] }
    ]
  };

  const result = phasifyOmissions.markPreMergeTicketsReviewed(
    JSON.parse(JSON.stringify(mergedData)), 2, 2
  );

  // A ticket already marked R1 keeps its original round information
  assert.strictEqual(result.phases[0].tickets[0].status, 'R1',
    'already round-marked ticket must not be overwritten, got: ' + result.phases[0].tickets[0].status);
  // A pre-merge ticket without a round marker gets the current round
  assert.strictEqual(result.phases[0].tickets[1].status, 'R2',
    'unmarked pre-merge ticket must be marked R2, got: ' + result.phases[0].tickets[1].status);
  // New omission phase (phase.id >= offset) stays todo
  assert.strictEqual(result.phases[1].tickets[0].status, 'todo',
    'new omission ticket must stay todo');
  // Input not mutated
  assert.strictEqual(mergedData.phases[0].tickets[0].status, 'R1',
    'markPreMergeTicketsReviewed must not mutate its input');

  console.log('✅ testMarkPreMergeTicketsReviewedPreservesExistingRoundMarker passed');
})();

// [::TICKET::] PX-114 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-114 --for-spec --no-implementation-order`.
(function testIncrementRound() {
  const ticketsData = { round: 1, phases: [] };

  const result = phasifyOmissions.incrementRound(JSON.parse(JSON.stringify(ticketsData)));

  assert.strictEqual(result.round, 2, 'round must increment from 1 to 2');
  assert.strictEqual(ticketsData.round, 1, 'incrementRound must not mutate input');

  // Missing round defaults to 1, then increments to 2
  const noRound = phasifyOmissions.incrementRound({ phases: [] });
  assert.strictEqual(noRound.round, 2, 'missing round defaults to 1 then increments to 2');

  console.log('✅ testIncrementRound passed');
})();

// [::TICKET::] PX-114 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-114 --for-spec --no-implementation-order`.
(function testRoundStatusInvariant() {
  const mergedData = {
    round: 3,
    phases: [
      { id: 5, name: 'P5', tickets: [{ id: 1, phaseId: 5, status: 'todo', title: 'A' }] },
      { id: 9, name: 'P9', tickets: [{ id: 2, phaseId: 9, status: 'todo', title: 'B' }] }
    ]
  };

  const offset = 9; // phases with id < 9 are pre-merge
  const result = phasifyOmissions.markPreMergeTicketsReviewed(
    JSON.parse(JSON.stringify(mergedData)), offset, 3
  );

  // Every pre-offset ticket status matches /^R[1-9]\d*$/
  for (const phase of result.phases) {
    if (phase.id < offset) {
      for (const ticket of phase.tickets) {
        assert.ok(/^R[1-9]\d*$/.test(ticket.status),
          'pre-offset ticket status must be round-aware, got: ' + ticket.status);
      }
    }
  }
  assert.ok(result.round >= 1, 'round >= 1 must hold after marking');

  console.log('✅ testRoundStatusInvariant passed');
})();

// PX-141: PX phase (id=-1) is excluded from R<round> marking. The PX backlog
// keeps its existing status (reviewed/remanded); only non-PX pre-offset
// tickets become R<round>. @verifies C004
// [::TICKET::] PX-141 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-141 --for-spec --no-implementation-order`.
(function testPxPhaseNotRoundMarked() {
  const mergedData = {
    round: 1,
    phases: [
      { id: 0, name: 'P0', tickets: [{ id: 1, phaseId: 0, status: 'reviewed', title: 'A' }] },
      { id: -1, name: 'PX', tickets: [{ id: 5, phaseId: -1, status: 'reviewed', title: 'PX' }] }
    ]
  };
  const offset = 1; // max(0, -1) + 1
  const result = phasifyOmissions.markPreMergeTicketsReviewed(
    JSON.parse(JSON.stringify(mergedData)), offset, 1
  );

  const phase0 = result.phases.find((p) => p.id === 0);
  const pxPhase = result.phases.find((p) => p.id === -1);
  assert.strictEqual(phase0.tickets[0].status, 'R1', 'non-PX pre-offset ticket must be R1');
  assert.strictEqual(pxPhase.tickets[0].status, 'reviewed', 'PX ticket must keep reviewed');

  for (const p of result.phases) {
    if (p.id === -1) {
      for (const t of p.tickets) {
        assert.ok(!/^R[1-9]\d*$/.test(t.status), 'PX must not be round-marked: ' + t.status);
      }
    }
  }

  // remanded PX status is also preserved
  const withRemandedPx = {
    round: 1,
    phases: [{ id: -1, name: 'PX', tickets: [{ id: 9, phaseId: -1, status: 'remanded', title: 'PX' }] }]
  };
  const r = phasifyOmissions.markPreMergeTicketsReviewed(
    JSON.parse(JSON.stringify(withRemandedPx)), 1, 1
  );
  assert.strictEqual(r.phases[0].tickets[0].status, 'remanded', 'remanded PX preserved');

  console.log('✅ testPxPhaseNotRoundMarked passed');
})();

// ============================================================
// PX-115: Snapshot-based --rollback (resolveSnapshotPath / rollbackFromSnapshot)
// ============================================================

(function testResolveSnapshotPath() {
  // @verifies C005 — rollback resolves the snapshot recorded in phasifyMerge metadata
  // snapshotPath is preferred
  const data = { metadata: { phasifyMerge: { snapshotPath: 'tickets/Tickets-20260731115931.json', timestamp: '20260731115931' } } };
  assert.strictEqual(phasifyOmissions.resolveSnapshotPath(data, '/tmp/proj'),
    '/tmp/proj/tickets/Tickets-20260731115931.json', 'snapshotPath must be preferred');

  // timestamp fallback when snapshotPath is absent
  const data2 = { metadata: { phasifyMerge: { timestamp: '20260731115931' } } };
  assert.strictEqual(phasifyOmissions.resolveSnapshotPath(data2, '/tmp/proj'),
    '/tmp/proj/tickets/Tickets-20260731115931.json', 'timestamp must resolve tickets/Tickets-<ts>.json');

  // No phasifyMerge metadata → throw (prevents accidental rollback)
  assert.throws(function() { phasifyOmissions.resolveSnapshotPath({ metadata: {} }, '/tmp/proj'); },
    /No phasifyMerge metadata/, 'missing phasifyMerge metadata must throw');

  console.log('✅ testResolveSnapshotPath passed');
})();

(function testRollbackFromSnapshot() {
  // @verifies C005 — rollback overwrites Tickets.json with the pre-merge snapshot
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'px115-rollback-'));
  try {
    const snapshot = { round: 1, metadata: {}, phases: [] };
    fs.mkdirSync(path.join(tmp, 'tickets'));
    fs.writeFileSync(path.join(tmp, 'tickets', 'Tickets-20260731115931.json'), JSON.stringify(snapshot));
    fs.writeFileSync(path.join(tmp, 'Tickets.json'), JSON.stringify({
      round: 2,
      metadata: { phasifyMerge: { snapshotPath: 'tickets/Tickets-20260731115931.json', timestamp: '20260731115931' } },
      phases: []
    }));

    phasifyOmissions.rollbackFromSnapshot(path.join(tmp, 'Tickets.json'), false);

    // Tickets.json must equal the pre-merge snapshot (full state restore, C005)
    const restored = JSON.parse(fs.readFileSync(path.join(tmp, 'Tickets.json'), 'utf8'));
    assert.deepStrictEqual(restored, snapshot, 'Tickets.json must equal the snapshot after rollback');
    assert.strictEqual(restored.metadata.phasifyMerge, undefined,
      'restored state must not carry phasifyMerge metadata');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log('✅ testRollbackFromSnapshot passed');
})();

(function testResolveSnapshotPathLegacyFallback() {
  // @verifies C005 — legacy pre-PX-115 merge metadata (no snapshotPath/timestamp)
  // falls back to the tickets/ archive when it holds exactly one snapshot
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'px115-legacy-'));
  try {
    fs.mkdirSync(path.join(tmp, 'tickets'));
    fs.writeFileSync(path.join(tmp, 'tickets', 'Tickets-20260731115931.json'), '{}');
    const legacyData = { metadata: { phasifyMerge: { offset: 6, mergedPhaseIds: [6, 7, 8, 9, 10, 11] } } };
    assert.strictEqual(phasifyOmissions.resolveSnapshotPath(legacyData, tmp),
      path.join(tmp, 'tickets', 'Tickets-20260731115931.json'),
      'legacy merge with a single snapshot must resolve to it');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log('✅ testResolveSnapshotPathLegacyFallback passed');
})();

(function testResolveSnapshotPathLegacyAmbiguous() {
  // @verifies C005 — multiple snapshots with no pointer are ambiguous and must throw
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'px115-ambig-'));
  try {
    fs.mkdirSync(path.join(tmp, 'tickets'));
    fs.writeFileSync(path.join(tmp, 'tickets', 'Tickets-20260731115931.json'), '{}');
    fs.writeFileSync(path.join(tmp, 'tickets', 'Tickets-20260731235959.json'), '{}');
    const legacyData = { metadata: { phasifyMerge: { offset: 6 } } };
    assert.throws(function() { phasifyOmissions.resolveSnapshotPath(legacyData, tmp); },
      /Ambiguous legacy merge/, 'multiple snapshots without a pointer must throw');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log('✅ testResolveSnapshotPathLegacyAmbiguous passed');
})();

(function testConsolidationPreservesNodeCoverage() {
  // @verifies C004 — all O_NODES remain covered after consolidation (no loss, no duplicates)
  const phases = [
    { id: 6, name: 'P6', nodeIds: ['N0001', 'N0002'], tickets: [{ id: 1, phaseId: 6, title: 'a' }, { id: 2, phaseId: 6, title: 'b' }, { id: 3, phaseId: 6, title: 'c' }] },
    { id: 7, name: 'P7', nodeIds: ['N0003'], tickets: [{ id: 1, phaseId: 7, title: 'd' }] },
    { id: 8, name: 'P8', nodeIds: ['N0004'], tickets: [{ id: 1, phaseId: 8, title: 'e' }] }
  ];
  const omissionNodeIds = ['N0001', 'N0002', 'N0003', 'N0004'];

  const consolidated = phasifyOmissions.consolidatePhasesByTicketCount(phases);

  // Merging P7 into P8 unions nodeIds — every O_NODE must stay covered exactly once
  const covered = new Set(consolidated.flatMap(function(phase) { return phase.nodeIds || []; }));
  for (const nid of omissionNodeIds) {
    assert.ok(covered.has(nid), 'node ' + nid + ' must remain covered after consolidation');
  }
  assert.strictEqual(covered.size, omissionNodeIds.length, 'no duplicate or missing nodes after consolidation');

  console.log('✅ testConsolidationPreservesNodeCoverage passed');
})();

console.log('\n🎉 All PX-115 tests passed!');
