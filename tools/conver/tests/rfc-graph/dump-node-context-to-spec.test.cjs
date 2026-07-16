/**
 * dump-node-context-to-spec.test.cjs — dump-node-context-to-spec.js tests
 *
 * Test framework: Node.js standard node:test + node:assert/strict
 * Mainly tests pure functions (formatNodeDetailsBlock / formatEdgeRelationsBlock / formatFilePathsBlock).
 * File I/O (appendToSpec) is already covered by dump-ticket-graph-commands.test.cjs.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  parseArguments,
  loadTickets,
  collectTicketNodes,
  collectNodeDetails,
  collectEdges,
  buildNodeIdToPathMap,
  formatNodeDetailsBlock,
  formatEdgeRelationsBlock,
  formatFilePathsBlock,
  combineBlocks,
} = require('../../.claude/scripts/rfc-graph/dump-node-context-to-spec.js');

// ============================================================
// Common test data
// ============================================================

const SAMPLE_NODES = [
  { id: 'N0001', title: '§1 Purpose — Responsibility definition of this crate', kind: 'architecture', language: 'rust', slug: 'purpose', summary: 'Safely use PJSUA from Rust', headingRefs: [{ refId: 'REF001', heading: 1, texts: ['§1 Purpose'] }] },
  { id: 'N0002', title: '§1a M20 Implementation Priority Map', kind: 'requirement', language: 'rust', slug: 'm20_priority', summary: 'M20 supplementary implementation items', headingRefs: [{ refId: 'REF002', heading: 2, texts: ['§1a M20 Implementation Priority Map'] }] },
  { id: 'N0003', title: '§1a Design Decision Response Table', kind: 'rationale', language: 'rust', slug: 'design_decisions', summary: 'M20 design decision list', headingRefs: [] },
];

const SAMPLE_EDGES = [
  { from: 'N0001', to: 'N0002', type: 'part_of', fromInTicket: true, toInTicket: true },
  { from: 'N0003', to: 'N0001', type: 'depends_on', fromInTicket: true, toInTicket: true },
  { from: 'N0002', to: 'N0099', type: 'references', fromInTicket: true, toInTicket: false },
  { from: 'N0098', to: 'N0001', type: 'depends_on', fromInTicket: false, toInTicket: true },
];

const SAMPLE_DIRS_TREE = {
  sourceFile: '/path/to/RFC-ROOT.md',
  trees: {
    rust: {
      name: 'src',
      type: 'directory',
      children: [
        {
          name: 'auth',
          type: 'directory',
          children: [
            { name: 'keystore.rs', type: 'file', mappedNodeIds: ['N0001', 'N0003'] },
            { name: 'token.rs', type: 'file', mappedNodeIds: ['N0001'] },
          ],
        },
        {
          name: 'config',
          type: 'directory',
          children: [
            { name: 'client_config.rs', type: 'file', mappedNodeIds: ['N0099'] },
          ],
        },
        {
          name: 'lib.rs',
          type: 'file',
          mappedNodeIds: ['N0098'],
        },
      ],
    },
  },
};

const SAMPLE_ALL_NODES = [
  ...SAMPLE_NODES,
  { id: 'N0098', title: '§3 Glossary' },
  { id: 'N0099', title: '§10 ClientConfig Complete Spec' },
];

// ============================================================
// parseArguments
// ============================================================

describe('parseArguments', () => {
  it('normal: parses all arguments', () => {
    const result = parseArguments([
      '--tickets=Tickets.json',
      '--graph=graph.json',
      '--dirs-tree=dirs.json',
      '--ticket-key=P0-1',
    ]);
    assert.equal(result.ticketsPath, 'Tickets.json');
    assert.equal(result.graphPath, 'graph.json');
    assert.equal(result.dirsTreePath, 'dirs.json');
    assert.deepEqual(result.ticketKeys, ['P0-1']);
  });

  it('normal: parses multiple --ticket-key arguments', () => {
    const result = parseArguments([
      '--tickets=T.json',
      '--graph=G.json',
      '--dirs-tree=D.json',
      '--ticket-key=P0-1',
      '--ticket-key=P0-2',
    ]);
    assert.deepEqual(result.ticketKeys, ['P0-1', 'P0-2']);
  });

  it('error: missing --ticket-key', () => {
    assert.throws(() => {
      parseArguments(['--tickets=T.json', '--graph=G.json', '--dirs-tree=D.json']);
    }, /--ticket-key/);
  });

  it('error: insufficient arguments', () => {
    assert.throws(() => {
      parseArguments(['--tickets=T.json']);
    }, /引数が不足/);
  });
});

// ============================================================
// collectTicketNodes
// ============================================================

describe('collectTicketNodes', () => {
  const tickets = {
    phases: [
      { id: 0, name: 'Phase 0', tickets: [
        { id: 1, title: 'Test Ticket', nodeIDs: ['N0001', 'N0003'], default_files: ['src/auth/keystore.rs'] },
      ]},
      { id: -1, name: '[X]', tickets: [
        { id: 99, title: 'PX Test', nodeIds: ['N0099'] },
      ]},
    ],
  };

  it('normal: resolves ticket in P{id}-{id} format', () => {
    const result = collectTicketNodes(tickets, 'P0-1');
    assert.ok(result);
    assert.deepEqual(result.nodeIds, ['N0001', 'N0003']);
    assert.deepEqual(result.defaultFiles, ['src/auth/keystore.rs']);
  });

  it('normal: resolves ticket in PX-{id} format', () => {
    const result = collectTicketNodes(tickets, 'P-1-99');
    assert.ok(result);
    assert.deepEqual(result.nodeIds, ['N0099']);
  });

  it('error: non-existent ticket key', () => {
    assert.equal(collectTicketNodes(tickets, 'P999-999'), null);
  });
});

// ============================================================
// collectNodeDetails
// ============================================================

describe('collectNodeDetails', () => {
  it('normal: collects nodes matching the given nodeIds', () => {
    const result = collectNodeDetails({ nodes: SAMPLE_NODES }, ['N0001', 'N0003']);
    assert.equal(result.length, 2);
    assert.equal(result[0].id, 'N0001');
    assert.equal(result[1].id, 'N0003');
  });

  it('normal: empty nodeIds returns empty array', () => {
    const result = collectNodeDetails({ nodes: SAMPLE_NODES }, []);
    assert.deepEqual(result, []);
  });
});

// ============================================================
// collectEdges
// ============================================================

describe('collectEdges', () => {
  const graph = { edges: SAMPLE_EDGES };

  it('normal: collects only edges involving the given nodeIds', () => {
    const result = collectEdges(graph, ['N0001', 'N0002', 'N0003']);
    assert.equal(result.length, 4);
  });

  it('normal: distinguishes inside/outside ticket edges', () => {
    const result = collectEdges(graph, ['N0001', 'N0002', 'N0003']);
    const refEdge = result.find(e => e.type === 'references');
    assert.ok(refEdge);
    assert.equal(refEdge.fromInTicket, true);
    assert.equal(refEdge.toInTicket, false);
  });

  it('normal: does not collect edges that only involve non-ticket nodes', () => {
    const result = collectEdges(graph, ['N9999']);
    assert.equal(result.length, 0);
  });
});

// ============================================================
// buildNodeIdToPathMap
// ============================================================

describe('buildNodeIdToPathMap', () => {
  it('normal: builds nodeId -> filePath map from tree', () => {
    const map = buildNodeIdToPathMap(SAMPLE_DIRS_TREE);
    assert.equal(map['N0001'], 'src/auth/keystore.rs');
    assert.equal(map['N0003'], 'src/auth/keystore.rs');
    assert.equal(map['N0099'], 'src/config/client_config.rs');
    assert.equal(map['N0098'], 'src/lib.rs');
  });

  it('normal: empty tree returns empty map', () => {
    const map = buildNodeIdToPathMap({ trees: {} });
    assert.deepEqual(map, {});
  });
});

// ============================================================
// formatNodeDetailsBlock
// ============================================================

describe('formatNodeDetailsBlock', () => {
  it('normal: generates Markdown table of node details', () => {
    const result = formatNodeDetailsBlock(SAMPLE_NODES, 'Test Ticket');
    assert.ok(result.includes('設計コンテキスト: ノード詳細'));
    assert.ok(result.includes('N0001'));
    assert.ok(result.includes('architecture'));
    assert.ok(result.includes('rust'));
    assert.ok(result.includes('purpose'));
    assert.ok(result.includes('headingRefs'));
    assert.ok(result.includes('§1 Purpose'));
  });

  it('normal: empty node array returns empty string', () => {
    assert.equal(formatNodeDetailsBlock([], 'Test Ticket'), '');
  });
});

// ============================================================
// formatEdgeRelationsBlock
// ============================================================

describe('formatEdgeRelationsBlock', () => {
  it('normal: generates Markdown with edge type groups and ★/☆ distinction', () => {
    const result = formatEdgeRelationsBlock(SAMPLE_EDGES, SAMPLE_ALL_NODES);
    assert.ok(result.includes('設計コンテキスト: ノード間関係性'));
    assert.ok(result.includes('part_of'));
    assert.ok(result.includes('depends_on'));
    assert.ok(result.includes('references'));
    assert.ok(result.includes('★'));
    assert.ok(result.includes('☆'));
    assert.ok(result.includes('N0001'));
    assert.ok(result.includes('N0099'));
  });

  it('normal: empty edge array returns empty string', () => {
    assert.equal(formatEdgeRelationsBlock([], SAMPLE_ALL_NODES), '');
  });
});

// ============================================================
// formatFilePathsBlock
// ============================================================

describe('formatFilePathsBlock', () => {

  it('normal: generates default_files + related node file paths + boilerplate text', () => {
    const ticketInfo = { defaultFiles: ['src/auth/keystore.rs'], title: 'Test Ticket' };
    const result = formatFilePathsBlock(SAMPLE_NODES, SAMPLE_EDGES, SAMPLE_DIRS_TREE, ticketInfo);
    assert.ok(result.includes('実装ファイルパス'));
    assert.ok(result.includes('default_files'));
    assert.ok(result.includes('src/auth/keystore.rs'));
    assert.ok(result.includes('関連ノードの実装先'));
    assert.ok(result.includes('src/config/client_config.rs'));
    assert.ok(result.includes('src/lib.rs'));
    assert.ok(result.includes('Initial Design Artifact'));
  });

  it('normal: handles empty default_files without error', () => {
    const ticketInfo = { defaultFiles: [], title: 'Test Ticket' };
    const result = formatFilePathsBlock(SAMPLE_NODES, SAMPLE_EDGES, SAMPLE_DIRS_TREE, ticketInfo);
    assert.ok(result.includes('実装ファイルパス'));
    assert.ok(result.includes('関連ノードの実装先'));
    assert.ok(!result.includes('default_files'));
  });

  it('normal: boilerplate text is always included', () => {
    const ticketInfo = { defaultFiles: [], title: 'Test Ticket' };
    const result = formatFilePathsBlock([], [], SAMPLE_DIRS_TREE, ticketInfo);
    assert.ok(result.includes('Initial Design Artifact'));
    assert.ok(result.includes('実装ファイル冒頭コメントの活用'));
  });
});

// ============================================================
// combineBlocks
// ============================================================

describe('combineBlocks', () => {
  it('normal: combines 3 blocks', () => {
    const result = combineBlocks('block1', 'block2', 'block3', 'test.json');
    assert.ok(result.includes('### 設計コンテキスト'));
    assert.ok(result.includes('test.json'));
    assert.ok(result.includes('block1'));
    assert.ok(result.includes('block2'));
    assert.ok(result.includes('block3'));
  });

  it('normal: combines even with empty blocks', () => {
    const result = combineBlocks('block1', '', '', 'test.json');
    assert.ok(result.includes('block1'));
    assert.equal(result.includes('block2'), false);
  });
});
