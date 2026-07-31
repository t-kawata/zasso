/**
 * dump-ticket-graph-commands.test.cjs — Tests for dump-ticket-graph-commands.js
 *
 * Test framework: Node.js built-in node:test + node:assert/strict
 * Covers all public functions of the tested module.
 * Includes actual file I/O tests using temporary directories.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Load the module under test via require path
const {
  parseArguments,
  loadTickets,
  collectNodeIds,
  generateCommand,
  buildNodeTitleMap,
  formatSection,
  formatNoGraphSection,
  appendToSpec,
  printUsage,
} = require('../../.claude/scripts/rfc-graph/dump-ticket-graph-commands.js');

const { resolveSpecPath, parseTicketKey } = require('../../.claude/scripts/lib/resolve-spec-path.js');

// ============================================================
// Test Utilities
// ============================================================

/** Temporary directory path for tests */
let tmpDir;

/** Tickets.json path for tests */
let ticketsPath;

/** Valid Tickets.json test data */
const NORMAL_TICKETS = {
  title: 'Test Project Ticket Breakdown Design Doc',
  source: 'RFC-TEST.md',
  generatedAt: '2026-07-06',
  phases: [
    {
      phaseId: 0,
      name: 'Core Logic Foundation',
      tickets: [
        { id: 1, title: 'Auth Module', status: 'todo', nodeIDs: ['N0001', 'N0003'] },
        { id: 2, title: 'Database Connection', status: 'todo', nodeIDs: ['N0005'] },
      ],
    },
    {
      phaseId: 1,
      name: 'Async Runtime',
      tickets: [
        { id: 1, title: 'API Server', status: 'todo', nodeIDs: ['N0002'] },
      ],
    },
  ],
};

/** Tickets.json with tickets missing nodeIDs */
const TICKETS_WITHOUT_NODE_IDS = {
  title: 'Test',
  source: 'RFC.md',
  generatedAt: '2026-07-06',
  phases: [
    {
      phaseId: 0,
      name: 'Phase 0',
      tickets: [
        { id: 1, title: 'With Nodes', status: 'todo', nodeIDs: ['N0001'] },
        { id: 2, title: 'No Nodes', status: 'todo' },
        { id: 3, title: 'Empty Array', status: 'todo', nodeIDs: [] },
      ],
    },
  ],
};

/** Tickets.json with no nodeIDs on any ticket */
const TICKETS_ALL_EMPTY = {
  title: 'Test',
  source: 'RFC.md',
  generatedAt: '2026-07-06',
  phases: [
    {
      phaseId: 0,
      name: 'Phase 0',
      tickets: [
        { id: 1, title: 'No Nodes', status: 'todo' },
        { id: 2, title: 'No Nodes 2', status: 'todo' },
      ],
    },
  ],
};

/** Test graph data */
const TEST_GRAPH = {
  sourceFile: '/tmp/test-rfc.md',
  nodes: [
    { id: 'N0001', kind: 'requirement', title: 'Auth API Definition', headingRefs: [{ heading:1, texts:["test"]}]},
    { id: 'N0002', kind: 'api_contract', title: 'Login Endpoint', headingRefs: [{ heading:1, texts:["test"]}]},
    { id: 'N0003', kind: 'data_model', title: 'Token Verification Logic', headingRefs: [{ heading:1, texts:["test"]}]},
    { id: 'N0005', kind: 'rationale', title: 'Session Management', headingRefs: [{ heading:1, texts:["test"]}]},
  ],
  edges: [],
};

/** Empty graph with no nodes */
const EMPTY_NODES_GRAPH = {
  sourceFile: '/tmp/empty.md',
  nodes: [],
  edges: [],
};

// ============================================================
// Tests
// ============================================================

describe('dump-ticket-graph-commands.js', () => {
  // Create a temporary directory before each test
  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dump-ticket-graph-test-'));
    ticketsPath = path.join(tmpDir, 'Tickets.json');
  });

  // Cleanup
  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ============================================================
  // parseArguments
  // ============================================================

  describe('parseArguments', () => {
    it('should parse all arguments', () => {
      const result = parseArguments([
        '--tickets=/path/Tickets.json',
        '--graph=/path/graph.json',
        '--source=/path/doc.md',
      ]);
      assert.equal(result.ticketsPath, '/path/Tickets.json');
      assert.equal(result.graphPath, '/path/graph.json');
      assert.equal(result.sourcePath, '/path/doc.md');
    });

    it('should throw on missing arguments', () => {
      assert.throws(() => {
        parseArguments(['--tickets=a.json', '--graph=b.json']);
      }, /insufficient arguments/i);
    });

    it('should throw on wrong --tickets prefix', () => {
      assert.throws(() => {
        parseArguments(['--ticket=a.json', '--graph=b.json', '--source=c.md']);
      }, /First argument.*--tickets/i);
    });

    it('should throw on wrong --graph prefix', () => {
      assert.throws(() => {
        parseArguments(['--tickets=a.json', '--gra=b.json', '--source=c.md']);
      }, /Second argument.*--graph/i);
    });

    it('should throw on empty path', () => {
      assert.throws(() => {
        parseArguments(['--tickets=', '--graph=b.json', '--source=c.md']);
      }, /is empty/i);
    });
  });

  // ============================================================
  // loadTickets
  // ============================================================

  describe('loadTickets', () => {
    it('should load Tickets.json', () => {
      fs.writeFileSync(ticketsPath, JSON.stringify(NORMAL_TICKETS), 'utf8');
      const data = loadTickets(ticketsPath);
      assert.equal(data.title, NORMAL_TICKETS.title);
      assert.equal(data.phases.length, 2);
    });

    it('should throw on missing file', () => {
      const noExist = path.join(tmpDir, 'no-such-file.json');
      assert.throws(() => {
        loadTickets(noExist);
      }, /Tickets.json not found/i);
    });

    it('should throw on invalid JSON', () => {
      fs.writeFileSync(ticketsPath, '{invalid}', 'utf8');
      assert.throws(() => {
        loadTickets(ticketsPath);
      }, /JSON parse failed/);
    });
  });

  // ============================================================
  // collectNodeIds
  // ============================================================

  describe('collectNodeIds', () => {
    it('should collect all node IDs', () => {
      const entries = collectNodeIds(NORMAL_TICKETS);
      assert.equal(entries.length, 3);
      assert.equal(entries[0].ticketKey, 'P0-1');
      assert.deepEqual(entries[0].nodeIds, ['N0001', 'N0003']);
      assert.equal(entries[1].ticketKey, 'P0-2');
      assert.deepEqual(entries[1].nodeIds, ['N0005']);
      assert.equal(entries[2].ticketKey, 'P1-1');
      assert.deepEqual(entries[2].nodeIds, ['N0002']);
    });

    it('should handle mixed presence of nodeIDs', () => {
      const entries = collectNodeIds(TICKETS_WITHOUT_NODE_IDS);
      assert.equal(entries.length, 1); // only one has nodeIDs
      assert.equal(entries[0].ticketKey, 'P0-1');
    });

    it('should handle absence of all nodeIDs', () => {
      const entries = collectNodeIds(TICKETS_ALL_EMPTY);
      assert.equal(entries.length, 0);
    });
  });

  // ============================================================
  // buildNodeTitleMap
  // ============================================================

  describe('buildNodeTitleMap', () => {
    it('should build node ID to title mapping', () => {
      const map = buildNodeTitleMap(TEST_GRAPH);
      assert.equal(map['N0001'], 'Auth API Definition');
      assert.equal(map['N0002'], 'Login Endpoint');
      assert.equal(map['N0003'], 'Token Verification Logic');
      assert.equal(map['N0005'], 'Session Management');
    });

    it('should handle empty nodes array', () => {
      const map = buildNodeTitleMap(EMPTY_NODES_GRAPH);
      assert.deepEqual(map, {});
    });
  });

  // ============================================================
  // generateCommand
  // ============================================================

  describe('generateCommand', () => {
    it('should generate command with title', () => {
      const cmd = generateCommand('N0001', { N0001: 'Auth API Definition' }, '/tmp/graph.json', '/tmp/source.md');
      assert.ok(cmd.includes('N0001'));
      assert.ok(cmd.includes('Auth API Definition'));
      assert.ok(cmd.includes('query.js'));
      assert.ok(cmd.includes('--hops=3'));
    });

    it('should generate command without title', () => {
      const cmd = generateCommand('N0005', {}, '/tmp/g.json', '/tmp/s.md');
      assert.ok(cmd.includes('N0005'));
      assert.ok(!cmd.includes('undefined'));
      // When no title, the parentheses are empty
      assert.ok(cmd.includes('N0005 →'));
    });
  });

  // ============================================================
  // formatSection
  // ============================================================

  describe('formatSection', () => {
    it('should format section with commands', () => {
      const results = [
        {
          ticketKey: 'P0-1',
          nodeIds: ['N0001'],
          commands: [
            '- N0001 (Auth API Definition) → `node .claude/scripts/rfc-graph/query.js --graph=graph.json --source=source.md --id=N0001 --hops=3`',
          ],
        },
      ];
      const section = formatSection(results, 'graph.json');
      assert.ok(section.includes('### RFC Design Graph Structure Exploration Commands'));
      assert.ok(section.includes('Graph file: graph.json'));
      assert.ok(section.includes('P0-1'));
      assert.ok(section.includes('N0001'));
      assert.ok(section.includes('query.js'));
    });

    it('should format section with multiple tickets', () => {
      const results = [
        {
          ticketKey: 'P0-1',
          nodeIds: ['N0001', 'N0003'],
          commands: [
            '- N0001 → `...`',
            '- N0003 → `...`',
          ],
        },
        {
          ticketKey: 'P1-1',
          nodeIds: ['N0002'],
          commands: [
            '- N0002 → `...`',
          ],
        },
      ];
      const section = formatSection(results, 'g.json');
      assert.ok(section.includes('P0-1'));
      assert.ok(section.includes('P1-1'));
    });
  });

  // ============================================================
  // formatNoGraphSection
  // ============================================================

  describe('formatNoGraphSection', () => {
    it('should generate no-graph section', () => {
      const section = formatNoGraphSection();
      assert.ok(section.includes('### RFC Design Graph Structure Exploration Commands'));
      assert.ok(section.includes('Graph file not found'));
    });
  });

  // ============================================================
  // appendToSpec
  // ============================================================

  describe('appendToSpec', () => {
    it('should append to spec file', () => {
      const specPath = path.join(tmpDir, 'spec-test.md');
      fs.writeFileSync(specPath, '# Test Spec\n', 'utf8');

      appendToSpec(specPath, '### RFC Design Graph Structure Exploration Commands\n\ngraph.json\n');

      const content = fs.readFileSync(specPath, 'utf8');
      assert.ok(content.includes('### RFC Design Graph Structure Exploration Commands'));
      assert.ok(content.includes('graph.json'));
    });

    it('should prevent duplicate section appending (idempotent)', () => {
      const specPath = path.join(tmpDir, 'spec-idempotent.md');
      fs.writeFileSync(specPath, '# Test Spec\n', 'utf8');

      const section = '### RFC Design Graph Structure Exploration Commands\n\ngraph.json\n';
      const firstResult = appendToSpec(specPath, section);
      const secondResult = appendToSpec(specPath, section);

      assert.equal(firstResult, true);
      assert.equal(secondResult, false);

      const content = fs.readFileSync(specPath, 'utf8');
      const occurrences = content.split('### RFC Design Graph Structure Exploration Commands').length - 1;
      assert.equal(occurrences, 1);
    });
  });

  // ============================================================
  // resolveSpecPath
  // ============================================================

  describe('resolveSpecPath', () => {
    it('should resolve spec path from ticket key via referenceSection', () => {
      const specPath = path.join(tmpDir, '0001-test-spec.md');
      fs.writeFileSync(specPath, '# Test Spec\n', 'utf8');

      // Tickets.json with referenceSection tickets
      // referenceSection is relative to the directory containing Tickets.json
      const ticketsWithRef = {
        title: 'Test',
        phases: [
          {
            id: 0,
            name: 'Phase 0',
            tickets: [
              {
                id: 1,
                title: 'Test Ticket',
                referenceSection: '0001-test-spec.md',
              },
            ],
          },
        ],
      };
      const ticketsPath = path.join(tmpDir, 'tickets-ref.json');
      fs.writeFileSync(ticketsPath, JSON.stringify(ticketsWithRef), 'utf8');

      const result = resolveSpecPath('P0-1', ticketsPath);
      assert.ok(result);
      assert.ok(result.endsWith('0001-test-spec.md'));
    });

    it('should return null when ticket has no referenceSection', () => {
      const ticketsNoRef = {
        title: 'Test',
        phases: [
          {
            id: 0,
            name: 'Phase 0',
            tickets: [{ id: 1, title: 'no-ref', background: 'Something' }],
          },
        ],
      };
      const ticketsPath = path.join(tmpDir, 'tickets-no-ref.json');
      fs.writeFileSync(ticketsPath, JSON.stringify(ticketsNoRef), 'utf8');

      const result = resolveSpecPath('P0-1', ticketsPath);
      assert.equal(result, null);
    });

    it('should return null without error when spec file does not exist', () => {
      const ticketsMissingFile = {
        title: 'Test',
        phases: [
          {
            id: 0,
            name: 'Phase 0',
            tickets: [
              { id: 1, title: 'missing', referenceSection: 'nonexistent/path.md' },
            ],
          },
        ],
      };
      const ticketsPath = path.join(tmpDir, 'tickets-missing.json');
      fs.writeFileSync(ticketsPath, JSON.stringify(ticketsMissingFile), 'utf8');

      const result = resolveSpecPath('P0-1', ticketsPath);
      assert.equal(result, null);
    });

    it('should return null for nonexistent ticket key', () => {
      const ticketsPath = path.join(tmpDir, 'tickets-empty.json');
      fs.writeFileSync(ticketsPath, JSON.stringify({ title: 'Test', round: 1, phases: [] }), 'utf8');

      const result = resolveSpecPath('P999-999', ticketsPath);
      assert.equal(result, null);
    });

    it('should return null for invalid ticket key format (no exception)', () => {
      const ticketsPath = path.join(tmpDir, 'tickets-dummy.json');
      fs.writeFileSync(ticketsPath, JSON.stringify({ title: 'Test', round: 1, phases: [] }), 'utf8');

      const result = resolveSpecPath('invalid-key', ticketsPath);
      assert.equal(result, null);
    });

    it('should resolve PX-{id} format ticket keys', () => {
      const specPath = path.join(tmpDir, '0099-px-test.md');
      fs.writeFileSync(specPath, '# PX Test\n', 'utf8');

      const ticketsPx = {
        title: 'Test',
        phases: [
          {
            id: -1,
            name: '[X] Independent Phase',
            tickets: [
              {
                id: 99,
                title: 'PX Test',
                referenceSection: '0099-px-test.md',
              },
            ],
          },
        ],
      };
      const ticketsPath = path.join(tmpDir, 'tickets-px.json');
      fs.writeFileSync(ticketsPath, JSON.stringify(ticketsPx), 'utf8');

      const result = resolveSpecPath('PX-99', ticketsPath);
      assert.ok(result);
      assert.ok(result.endsWith('0099-px-test.md'));
    });
  });
});
