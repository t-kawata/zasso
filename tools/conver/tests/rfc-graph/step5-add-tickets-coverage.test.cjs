/**
 * step5-add-tickets-coverage.test.cjs — Tests for add-tickets-for-phase.js + verify-all-ticket-coverage.js
 *
 * Test framework: Node.js standard node:test + node:assert/strict
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { verifyNodeCoverage, resolveDefaultFiles, parseCliArguments } = require('../../.claude/scripts/tickets/add-tickets-for-phase.js');
const { checkPhase, verifyAllTicketCoverage, formatReport } = require('../../.claude/scripts/tickets/verify-all-ticket-coverage.js');
const { bulkAddTickets } = require('../../.claude/scripts/tickets/bulk-add-tickets.js');
const { validateTickets } = require('../../.claude/scripts/lib/validate-tickets.js');

// ============================================================
// Test data helpers
// ============================================================

const SAMPLE_NODE_IDS = ['N0001', 'N0002', 'N0003'];

function createTestTicketsData(overrides) {
  const data = {
    title: 'Test Project',
    metadata: { source: 'test', generatedAt: '2026-07-10' },
    phases: [
      {
        id: 0,
        name: 'Phase 0',
        nodeIds: SAMPLE_NODE_IDS,
        tickets: [],
      },
    ],
  };
  if (overrides) {
    Object.assign(data.phases[0], overrides);
  }
  return data;
}

function createTestTicketsDataWithTickets() {
  const data = createTestTicketsData();
  data.phases[0].tickets = [
    { id: 1, phaseId: 0, title: 'Ticket 1', status: 'todo', nodeIds: ['N0001', 'N0002'] },
    { id: 2, phaseId: 0, title: 'Ticket 2', status: 'todo', nodeIds: ['N0003'] },
  ];
  return data;
}

// ============================================================
// verifyNodeCoverage (from add-tickets-for-phase.js)
// ============================================================

describe('verifyNodeCoverage', () => {
  it('should report valid=true when all nodes are covered', () => {
    const phase = {
      nodeIds: ['N0001', 'N0002', 'N0003'],
      tickets: [
        { nodeIds: ['N0001'] },
        { nodeIds: ['N0002'] },
        { nodeIds: ['N0003'] },
      ],
    };
    const result = verifyNodeCoverage(phase);
    assert.equal(result.valid, true);
    assert.equal(result.missingNodeIds.length, 0);
  });

  it('should be valid when one ticket bundles multiple nodes', () => {
    const phase = {
      nodeIds: ['N0001', 'N0002', 'N0003'],
      tickets: [
        { nodeIds: ['N0001', 'N0002', 'N0003'] },
      ],
    };
    const result = verifyNodeCoverage(phase);
    assert.equal(result.valid, true);
  });

  it('should report valid=false + missing list when nodes are missing', () => {
    const phase = {
      nodeIds: ['N0001', 'N0002', 'N0003', 'N0004'],
      tickets: [
        { nodeIds: ['N0001'] },
        { nodeIds: ['N0002'] },
      ],
    };
    const result = verifyNodeCoverage(phase);
    assert.equal(result.valid, false);
    assert.deepEqual(result.missingNodeIds, ['N0003', 'N0004']);
  });

  it('should detect tickets without nodeIds', () => {
    const phase = {
      nodeIds: ['N0001'],
      tickets: [
        { title: 'ticket without nodeIds' },
      ],
    };
    const result = verifyNodeCoverage(phase);
    assert.equal(result.valid, false);
    assert.equal(result.ticketsWithoutNodeIds, 1);
  });

  it('should report nodeIds outside the phase as extraNodeIds', () => {
    const phase = {
      nodeIds: ['N0001'],
      tickets: [
        { nodeIds: ['N0001', 'N9999'] },
      ],
    };
    const result = verifyNodeCoverage(phase);
    assert.equal(result.valid, true); // no missing nodes
    assert.deepEqual(result.extraNodeIds, ['N9999']);
  });
});

// ============================================================
// bulkAddTickets (from bulk-add-tickets.js)
// ============================================================

describe('bulkAddTickets (nodeIds integration)', () => {
  it('should add tickets with nodeIds', () => {
    const data = createTestTicketsData();
    const batch = [
      {
        phaseId: 0,
        tickets: [
          { title: 'Ticket 1', nodeIds: ['N0001'] },
          { title: 'Ticket 2', nodeIds: ['N0002', 'N0003'] },
        ],
      },
    ];
    const result = bulkAddTickets(data, batch);
    assert.equal(result.success, true);
    assert.equal(result.added, 2);

    // Verify tickets were correctly added and nodeIds are preserved
    const tickets = data.phases[0].tickets;
    assert.equal(tickets.length, 2);
    assert.deepEqual(tickets[0].nodeIds, ['N0001']);
    assert.deepEqual(tickets[1].nodeIds, ['N0002', 'N0003']);
  });

  it('should add tickets without nodeIds (backward compatibility)', () => {
    const data = createTestTicketsData();
    const batch = [
      {
        phaseId: 0,
        tickets: [
          { title: 'ticket without nodeIds' },
        ],
      },
    ];
    const result = bulkAddTickets(data, batch);
    assert.equal(result.success, true);
    assert.equal(data.phases[0].tickets[0].nodeIds, undefined);
  });
});

// ============================================================
// checkPhase / verifyAllTicketCoverage (from verify-all-ticket-coverage.js)
// ============================================================

describe('checkPhase', () => {
  it('should report a fully covered phase as valid', () => {
    const phase = {
      id: 0,
      nodeIds: ['N0001', 'N0002'],
      tickets: [
        { nodeIds: ['N0001', 'N0002'] },
      ],
    };
    const result = checkPhase(phase);
    assert.equal(result.valid, true);
    assert.equal(result.hasTickets, true);
    assert.equal(result.ticketCount, 1);
  });

  it('should report an empty-ticket phase as invalid', () => {
    const phase = {
      id: 0,
      nodeIds: ['N0001'],
      tickets: [],
    };
    const result = checkPhase(phase);
    assert.equal(result.valid, false);
    assert.equal(result.hasTickets, false);
  });

  it('should report valid for a phase without nodeIds (backward compatibility)', () => {
    const phase = {
      id: 1,
      nodeIds: [],
      tickets: [{ id: 1, phaseId: 1, title: 't', status: 'todo' }],
    };
    const result = checkPhase(phase);
    assert.equal(result.valid, true);
  });

  it('should label PX phases correctly', () => {
    const phase = {
      id: -1,
      nodeIds: ['N0001'],
      tickets: [{ nodeIds: ['N0001'] }],
    };
    const result = checkPhase(phase);
    assert.equal(result.phaseLabel, 'PX');
  });
});

describe('verifyAllTicketCoverage', () => {
  it('should report valid=true when all phases are covered', () => {
    const data = {
      phases: [
        {
          id: 0,
          nodeIds: ['N0001'],
          tickets: [{ nodeIds: ['N0001'] }],
        },
        {
          id: 1,
          nodeIds: ['N0002'],
          tickets: [{ nodeIds: ['N0002'] }],
        },
      ],
    };
    const result = verifyAllTicketCoverage(data);
    assert.equal(result.valid, true);
    assert.equal(result.totalPhases, 2);
    assert.equal(result.totalTickets, 2);
  });

  it('should report valid=false when some phases are incomplete', () => {
    const data = {
      phases: [
        {
          id: 0,
          nodeIds: ['N0001', 'N0002'],
          tickets: [{ nodeIds: ['N0001'] }],
        },
      ],
    };
    const result = verifyAllTicketCoverage(data);
    assert.equal(result.valid, false);
    assert.equal(result.failedPhases.length, 1);
  });

  it('should not error on an empty phases list', () => {
    const data = { phases: [] };
    const result = verifyAllTicketCoverage(data);
    assert.equal(result.valid, true);
    assert.equal(result.totalPhases, 0);
  });
});

describe('formatReport', () => {
  it('should include "PASS" for all-pass cases', () => {
    const report = {
      valid: true,
      totalPhases: 1,
      totalTickets: 2,
      phaseResults: [
        { valid: true, phaseLabel: 'P0', ticketCount: 2, missingNodeIds: [], extraNodeIds: [] },
      ],
      failedPhases: [],
    };
    const output = formatReport(report);
    assert.ok(output.includes('✅ PASS'));
  });

  it('should include "FAIL" for failing cases', () => {
    const report = {
      valid: false,
      totalPhases: 1,
      totalTickets: 1,
      phaseResults: [
        { valid: false, phaseLabel: 'P0', ticketCount: 1, missingNodeIds: ['N0002'], extraNodeIds: [] },
      ],
      failedPhases: [
        { valid: false, phaseLabel: 'P0', ticketCount: 1, missingNodeIds: ['N0002'], extraNodeIds: [] },
      ],
    };
    const output = formatReport(report);
    assert.ok(output.includes('❌ FAIL'));
    assert.ok(output.includes('N0002'));
  });
});

// ============================================================
// resolveDefaultFiles (from add-tickets-for-phase.js)
// ============================================================

describe('resolveDefaultFiles', () => {
  it('should set default_files correctly when all nodeIds exist in nodeToDirMap', () => {
    const tickets = [
      { title: 'Ticket 1', nodeIds: ['N0001', 'N0003'] },
    ];
    const nodeToDirMap = {
      N0001: 'src/auth/token.rs',
      N0003: 'src/auth/keystore.rs',
    };

    resolveDefaultFiles(tickets, nodeToDirMap);

    assert.ok(Array.isArray(tickets[0].default_files));
    assert.equal(tickets[0].default_files.length, 2);
    assert.equal(tickets[0].default_files[0], 'src/auth/keystore.rs');
    assert.equal(tickets[0].default_files[1], 'src/auth/token.rs');
  });

  it('should set only existing mappings when some nodeIds are missing from nodeToDirMap', () => {
    const tickets = [
      { title: 'Ticket A', nodeIds: ['N0001', 'N9999'] },
    ];
    const nodeToDirMap = {
      N0001: 'src/auth/token.rs',
    };

    resolveDefaultFiles(tickets, nodeToDirMap);

    assert.ok(Array.isArray(tickets[0].default_files));
    assert.equal(tickets[0].default_files.length, 1);
    assert.equal(tickets[0].default_files[0], 'src/auth/token.rs');
  });

  it('should not set default_files when nodeIds is empty', () => {
    const tickets = [
      { title: 'Ticket B', nodeIds: [] },
    ];
    const nodeToDirMap = {};

    resolveDefaultFiles(tickets, nodeToDirMap);

    assert.equal(tickets[0].default_files, undefined);
  });

  it('should deduplicate and sort file paths', () => {
    const tickets = [
      { title: 'Ticket C', nodeIds: ['N0001', 'N0002', 'N0003'] },
    ];
    const nodeToDirMap = {
      N0001: 'src/core/api.rs',
      N0002: 'src/core/api.rs',
      N0003: 'src/core/auth.rs',
    };

    resolveDefaultFiles(tickets, nodeToDirMap);

    assert.ok(Array.isArray(tickets[0].default_files));
    assert.equal(tickets[0].default_files.length, 2);
    assert.equal(tickets[0].default_files[0], 'src/core/api.rs');
    assert.equal(tickets[0].default_files[1], 'src/core/auth.rs');
  });
});

// ============================================================
// parseCliArguments (from add-tickets-for-phase.js)
// ============================================================

describe('parseCliArguments', () => {
  it('should parse correctly when all 3 arguments are provided', () => {
    const argv = ['node', 'script.js', '/path/to/tickets.json', '/path/to/dirs-tree.json', 'P0'];
    const result = parseCliArguments(argv);
    assert.equal(result.error, null);
    assert.equal(result.ticketsJsonPath, '/path/to/tickets.json');
    assert.equal(result.dirsTreePath, '/path/to/dirs-tree.json');
    assert.equal(result.phaseArg, 'P0');
  });

  it('should return error when 2nd argument (ticketsJsonPath) is missing', () => {
    const argv = ['node', 'script.js', null, '/path/to/dirs-tree.json', 'P0'];
    const result = parseCliArguments(argv);
    assert.notEqual(result.error, null);
    assert.ok(result.error.includes('Usage'));
  });

  it('should return error when 3rd argument (dirsTreePath) is missing', () => {
    const argv = ['node', 'script.js', '/path/to/tickets.json', undefined, 'P0'];
    const result = parseCliArguments(argv);
    assert.notEqual(result.error, null);
    assert.ok(result.error.includes('Usage'));
  });

  it('should return error when 4th argument (phaseArg) is missing', () => {
    const argv = ['node', 'script.js', '/path/to/tickets.json', '/path/to/dirs-tree.json'];
    const result = parseCliArguments(argv);
    assert.notEqual(result.error, null);
    assert.ok(result.error.includes('Usage'));
  });
});

// ============================================================
// Schema compatibility (tickets with default_files pass validation)
// ============================================================

describe('schema compatibility (default_files)', () => {
  it('should pass schema validation for tickets with default_files', () => {
    const data = {
      title: 'Test Project',
      metadata: { source: 'test', generatedAt: '2026-07-10' },
      phases: [
        {
          id: 0,
          name: 'Phase 0',
          nodeIds: ['N0001'],
          tickets: [
            {
              id: 1,
              phaseId: 0,
              title: 'ticket with default_files',
              status: 'todo',
              nodeIds: ['N0001'],
              default_files: ['src/auth/token.rs', 'src/auth/keystore.rs'],
            },
          ],
        },
      ],
    };
    const result = validateTickets(data);
    assert.equal(result.valid, true);
  });

  it('should pass schema validation with an empty default_files array', () => {
    const data = {
      title: 'Test Project',
      metadata: { source: 'test', generatedAt: '2026-07-10' },
      phases: [
        {
          id: 0,
          name: 'Phase 0',
          tickets: [
            {
              id: 1,
              phaseId: 0,
              title: 'ticket with empty default_files array',
              status: 'todo',
              default_files: [],
            },
          ],
        },
      ],
    };
    const result = validateTickets(data);
    assert.equal(result.valid, true);
  });
});
