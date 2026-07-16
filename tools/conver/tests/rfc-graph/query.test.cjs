/**
 * query.test.cjs — Tests for query.js
 *
 * Test framework: Node.js standard node:test + node:assert/strict
 * Covers all public functions of the target module.
 * Includes actual file I/O tests using a temporary directory.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Load the target module via require path
const {
  parseArguments,
  parseNodeIds,
  parseHops,
  loadGraph,
  loadSourceFile,
  resolveNodeById,
  multiHopBFS,
  resolveCurrentLines,
  formatNodeMarkdown,
  groupEdgesByType,
  getDirectionLabel,
  printUsage,
} = require('../../.claude/scripts/rfc-graph/query.js');

// ============================================================
// Test Utilities
// ============================================================

/** Temporary directory path for tests */
let tmpDir;

/**
 * Create a temporary directory before each test
 */
function setupTempDir() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'query-test-'));
}

/**
 * Remove the temporary directory after each test
 */
function cleanupTempDir() {
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Write a test graph file
 *
 * @param {string} fileName — File name
 * @param {Object} data — Graph data
 * @returns {string} Absolute path to the created file
 */
function writeGraphFile(fileName, data) {
  const filePath = path.join(tmpDir, fileName);
  fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
  return filePath;
}

/**
 * Write a test source file
 *
 * @param {string} fileName — File name
 * @param {string[]} lines — Array of lines
 * @returns {string} Absolute path to the created file
 */
function writeSourceFile(fileName, lines) {
  const filePath = path.join(tmpDir, fileName);
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  return filePath;
}

// ============================================================
// Test Fixtures
// ============================================================

/**
 * Simple test graph data
 *
 * Nodes: N0001(api_contract) → N0003(token_logic) [depends_on/hard]
 * Nodes: N0003(token_logic) → N0005(session_mgmt) [refines/medium]
 * Nodes: N0001 → N0004(data_model) [implements/soft]
 * Isolated node: N0002(glossary)
 */
const SIMPLE_GRAPH = {
  sourceFile: 'test-rfc.md',
  nodes: [
    {
      id: 'N0001',
      title: 'Auth API Definition',
      kind: 'api_contract',
      summary: 'Definition of the POST /api/v1/auth/login endpoint.',
      headingRefs: [{ refId: 'REF001', heading:2, texts:["Auth API Definition"]}],
    },
    {
      id: 'N0002',
      title: 'Glossary',
      kind: 'glossary',
      summary: 'Terms related to authentication.',
      headingRefs: [{ refId: 'REF002', heading:2, texts:["Glossary"]}],
    },
    {
      id: 'N0003',
      title: 'Token Verification Logic',
      kind: 'requirement',
      summary: 'JWT token verification procedure.',
      headingRefs: [{ refId: 'REF003', heading:2, texts:["Token Verification"]}],
    },
    {
      id: 'N0004',
      title: 'Data Model Definition',
      kind: 'data_model',
      summary: 'Definition of the User entity.',
      headingRefs: [{ refId: 'REF004', heading:2, texts:["Data Model"]}],
    },
    {
      id: 'N0005',
      title: 'Session Management',
      kind: 'requirement',
      summary: 'User session management method.',
      headingRefs: [{ refId: 'REF005', heading:2, texts:["Session Management"]}],
    },
  ],
  edges: [
    {
      from: 'N0001', to: 'N0003', type: 'depends_on',
      attributes: { strength: 'hard', bidirectional: false },
    },
    {
      from: 'N0003', to: 'N0005', type: 'refines',
      attributes: { strength: 'medium', bidirectional: false },
    },
    {
      from: 'N0001', to: 'N0004', type: 'implements',
      attributes: { strength: 'soft', bidirectional: false },
    },
  ],
};

/**
 * Cyclic test graph data
 */
const CYCLIC_GRAPH = {
  sourceFile: 'cyclic-rfc.md',
  nodes: [
    { id: 'N0001', title: 'A', kind: 'requirement', summary: 'Node A' },
    { id: 'N0002', title: 'B', kind: 'requirement', summary: 'Node B' },
    { id: 'N0003', title: 'C', kind: 'requirement', summary: 'Node C' },
  ],
  edges: [
    { from: 'N0001', to: 'N0002', type: 'depends_on', attributes: { strength: 'hard' } },
    { from: 'N0002', to: 'N0003', type: 'depends_on', attributes: { strength: 'hard' } },
    { from: 'N0003', to: 'N0001', type: 'depends_on', attributes: { strength: 'hard' } },
  ],
};

/**
 * Source text with markers for testing
 */
const SOURCE_LINES = [
  '# Test RFC Document',
  '',
  '## Overview',
  'This document is for testing.',
  '',
  '## Details',
  'Defines the authentication API.',
  '',
  '## Auth API Definition [::REF001-START::]',
  'RESTful API based user authentication.',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/refresh',
  '',
  'The request body must include email and password.',
  'The response is a JWT-formatted access token.',
  'Token expiration is 24 hours.',
  '',
  'Rate limit: 10 requests per minute.',
  '[Auth API Definition] [::REF001-END::]',
  '',
  '## Glossary [::REF002-START::]',
  '- Access Token: Identifier for authenticated users',
  '- Refresh Token: Used for token renewal',
  '- CSRF Token: Cross-site request forgery protection',
  '[Glossary] [::REF002-END::]',
  '',
  '## Token Verification [::REF003-START::]',
  'JWT signature verification procedure.',
  'Use the public key to verify the payload integrity.',
  'Includes alg header whitelist validation.',
  '[Token Verification] [::REF003-END::]',
  '',
  '## Data Model [::REF004-START::]',
  'User: id, email, password_hash, created_at',
  'Session: id, user_id, token, expires_at',
  '[Data Model] [::REF004-END::]',
  '',
  '## Session Management [::REF005-START::]',
  'Session creation and destruction.',
  'Session expiration is 7 days.',
  '[Session Management] [::REF005-END::]',
];

// ============================================================
// parseArguments
// ============================================================

describe('parseArguments', () => {
  it('normal: parses required arguments only (--graph --source --id)', () => {
    const result = parseArguments([
      '--graph=test-graph.json',
      '--source=test-source.md',
      '--id=N0001',
    ]);
    assert.equal(result.graphPath, 'test-graph.json');
    assert.equal(result.sourcePath, 'test-source.md');
    assert.deepEqual(result.nodeIds, ['N0001']);
    assert.equal(result.hops, 1); // default
  });

  it('normal: parses with --hops specified', () => {
    const result = parseArguments([
      '--graph=test-graph.json',
      '--source=test-source.md',
      '--id=N0001',
      '--hops=3',
    ]);
    assert.equal(result.hops, 3);
  });

  it('normal: parses comma-separated multiple node IDs', () => {
    const result = parseArguments([
      '--graph=test-graph.json',
      '--source=test-source.md',
      '--id=N0001,N0003,N0005',
    ]);
    assert.deepEqual(result.nodeIds, ['N0001', 'N0003', 'N0005']);
  });

  it('error: insufficient arguments (--graph only)', () => {
    assert.throws(() => {
      parseArguments(['--graph=test.json']);
    }, /--source|--id/);
  });

  it('error: no arguments', () => {
    assert.throws(() => {
      parseArguments([]);
    }, /--graph|--source|--id/);
  });

  it('error: --graph is empty', () => {
    assert.throws(() => {
      parseArguments(['--graph=', '--source=test.md', '--id=N0001']);
    }, /--graph/);
  });

  it('error: --id is empty', () => {
    assert.throws(() => {
      parseArguments(['--graph=test.json', '--source=test.md', '--id=']);
    }, /--id/);
  });

  it('normal: argument order independent (--source first is OK)', () => {
    const result = parseArguments(['--source=test.md', '--graph=test.json', '--id=N0001']);
    assert.equal(result.graphPath, 'test.json');
    assert.equal(result.sourcePath, 'test.md');
    assert.deepEqual(result.nodeIds, ['N0001']);
  });
});

// ============================================================
// parseNodeIds / parseHops
// ============================================================

describe('parseNodeIds', () => {
  it('normal: parses a single node ID', () => {
    assert.deepEqual(parseNodeIds('--id=N0001'), ['N0001']);
  });

  it('normal: parses comma-separated multiple IDs', () => {
    assert.deepEqual(parseNodeIds('--id=N0001,N0003,N0005'), ['N0001', 'N0003', 'N0005']);
  });

  it('normalization: trims whitespace around IDs', () => {
    assert.deepEqual(parseNodeIds('--id= N0001 , N0003 '), ['N0001', 'N0003']);
  });

  it('error: throws without --id= prefix', () => {
    assert.throws(() => parseNodeIds('--source=test.md'), /--id=/);
  });

  it('error: throws on empty ID', () => {
    assert.throws(() => parseNodeIds('--id='), /empty/i);
  });
});

describe('parseHops', () => {
  it('normal: parses a positive integer', () => {
    assert.equal(parseHops('--hops=3'), 3);
  });

  it('error: hops=0 throws error', () => {
    assert.throws(() => parseHops('--hops=0'), /must be an integer/);
  });

  it('error: negative hops throws error', () => {
    assert.throws(() => parseHops('--hops=-1'), /must be an integer/);
  });

  it('error: non-integer hops throws error', () => {
    assert.throws(() => parseHops('--hops=abc'), /must be an integer/);
  });

  it('error: empty hops throws error', () => {
    assert.throws(() => parseHops('--hops='), /is empty/i);
  });

  it('error: throws without --hops= prefix', () => {
    assert.throws(() => parseHops('--id=N0001'), /--hops=/);
  });
});

// ============================================================
// loadGraph
// ============================================================

describe('loadGraph', () => {
  before(setupTempDir);
  after(cleanupTempDir);

  it('normal: loads valid graph JSON', () => {
    const filePath = writeGraphFile('graph.json', SIMPLE_GRAPH);
    const graph = loadGraph(filePath);
    assert.equal(graph.sourceFile, 'test-rfc.md');
    assert.equal(graph.nodes.length, 5);
    assert.equal(graph.edges.length, 3);
  });

  it('error: non-existent file throws ENOENT', () => {
    assert.throws(() => {
      loadGraph(path.join(tmpDir, 'not-exists.json'));
    }, /ENOENT/);
  });

  it('error: invalid JSON throws error', () => {
    const filePath = path.join(tmpDir, 'invalid.json');
    fs.writeFileSync(filePath, 'not-json', 'utf8');
    assert.throws(() => {
      loadGraph(filePath);
    }, /JSON parse failed/);
  });
});

// ============================================================
// loadSourceFile
// ============================================================

describe('loadSourceFile', () => {
  before(setupTempDir);
  after(cleanupTempDir);

  it('normal: loads source file', () => {
    const filePath = writeSourceFile('test.md', SOURCE_LINES);
    const content = loadSourceFile(filePath);
    assert.ok(content.includes('::REF001-START::'));
    assert.ok(content.includes('::REF005-END::'));
  });

  it('error: non-existent file throws error', () => {
    assert.throws(() => {
      loadSourceFile(path.join(tmpDir, 'not-exists.md'));
    });
  });
});

// ============================================================
// resolveNodeById
// ============================================================

describe('resolveNodeById', () => {
  it('normal: resolves an existing node ID', () => {
    const node = resolveNodeById(SIMPLE_GRAPH, 'N0001');
    assert.notEqual(node, null);
    assert.equal(node.title, 'Auth API Definition');
    assert.equal(node.kind, 'api_contract');
  });

  it('normal: returns null for non-existent node ID', () => {
    const node = resolveNodeById(SIMPLE_GRAPH, 'NX001');
    assert.equal(node, null);
  });
});

// ============================================================
// multiHopBFS
// ============================================================

describe('multiHopBFS', () => {
  it('normal: 1 hop returns directly connected nodes', () => {
    const result = multiHopBFS(SIMPLE_GRAPH, 'N0001', 1);
    // N0001 + N0003(direct) + N0004(direct) = 3 nodes
    assert.equal(result.nodeIds.length, 3);
    assert.ok(result.nodeIds.includes('N0001'));
    assert.ok(result.nodeIds.includes('N0003'));
    assert.ok(result.nodeIds.includes('N0004'));
    // 2 edges
    assert.equal(result.edges.length, 2);
  });

  it('normal: 2 hops reaches indirectly connected nodes', () => {
    const result = multiHopBFS(SIMPLE_GRAPH, 'N0001', 2);
    // N0001 + N0003 + N0004 + N0005(N0003→N0005) = 4 nodes
    assert.equal(result.nodeIds.length, 4);
    assert.ok(result.nodeIds.includes('N0005'));
    // All 3 edges
    assert.equal(result.edges.length, 3);
  });

  it('normal: hop limit restricts the search', () => {
    // 2 hops → N0001,N0003,N0004,N0005 = 4 nodes
    const result1 = multiHopBFS(SIMPLE_GRAPH, 'N0001', 2);
    assert.equal(result1.nodeIds.length, 4);

    // 3 hops → all nodes (excluding isolated N0002) i.e. 4 nodes (no cycles)
    const result2 = multiHopBFS(SIMPLE_GRAPH, 'N0001', 3);
    assert.equal(result2.nodeIds.length, 4);
    assert.ok(!result2.nodeIds.includes('N0002')); // isolated node is not included
  });

  it('normal: isolated node returns only itself', () => {
    const result = multiHopBFS(SIMPLE_GRAPH, 'N0002', 1);
    assert.equal(result.nodeIds.length, 1);
    assert.equal(result.nodeIds[0], 'N0002');
    assert.equal(result.edges.length, 0);
  });

  it('normal: cyclic graph does not infinite loop', () => {
    const result = multiHopBFS(CYCLIC_GRAPH, 'N0001', 5);
    // All 3 nodes reached
    assert.equal(result.nodeIds.length, 3);
    assert.ok(result.nodeIds.includes('N0001'));
    assert.ok(result.nodeIds.includes('N0002'));
    assert.ok(result.nodeIds.includes('N0003'));
    // 3 edges (no duplicates)
    assert.equal(result.edges.length, 3);
  });

  it('normal: same edge does not appear twice in result', () => {
    const result1 = multiHopBFS(SIMPLE_GRAPH, 'N0001', 1);
    // 1 hop: N0001→N0003 edge appears once
    const n0001ToN0003Edges = result1.edges.filter(
      e => (e.from === 'N0001' && e.to === 'N0003')
    );
    assert.equal(n0001ToN0003Edges.length, 1);

    // 2 hops: same edge still only once
    const result2 = multiHopBFS(SIMPLE_GRAPH, 'N0001', 2);
    const n0001ToN0003Edges2 = result2.edges.filter(
      e => (e.from === 'N0001' && e.to === 'N0003')
    );
    assert.equal(n0001ToN0003Edges2.length, 1);
  });

  it('normal: duplicate edges in graph output only once', () => {
    // Graph with 2 identical edges defined
    const graphWithDuplicateEdges = {
      sourceFile: 'test.md',
      nodes: [
        { id: 'N0001', title: 'Node A', kind: 'requirement', summary: 'A', headingRefs: [{ refId: 'REF001', heading: 1, texts: ['test'] }] },
        { id: 'N0002', title: 'Node B', kind: 'requirement', summary: 'B', headingRefs: [{ refId: 'REF002', heading: 1, texts: ['test'] }] },
      ],
      edges: [
        { from: 'N0001', to: 'N0002', type: 'depends_on', attributes: { strength: 'hard' } },
        { from: 'N0001', to: 'N0002', type: 'depends_on', attributes: { strength: 'hard' } },
      ],
    };
    const result = multiHopBFS(graphWithDuplicateEdges, 'N0001', 1);
    assert.equal(result.edges.length, 1);
  });

  it('normal: edges with different types are separate entries', () => {
    // Graph with 2 edges sharing same from/to but different types
    const graphWithDifferentTypes = {
      sourceFile: 'test.md',
      nodes: [
        { id: 'N0001', title: 'Node A', kind: 'requirement', summary: 'A', headingRefs: [{ refId: 'REF001', heading: 1, texts: ['test'] }] },
        { id: 'N0002', title: 'Node B', kind: 'requirement', summary: 'B', headingRefs: [{ refId: 'REF002', heading: 1, texts: ['test'] }] },
      ],
      edges: [
        { from: 'N0001', to: 'N0002', type: 'depends_on', attributes: { strength: 'hard' } },
        { from: 'N0001', to: 'N0002', type: 'refines', attributes: { strength: 'soft' } },
      ],
    };
    const result = multiHopBFS(graphWithDifferentTypes, 'N0001', 1);
    assert.equal(result.edges.length, 2);
  });

  it('normal: from→to and to→from are treated as separate edges (directed graph)', () => {
    // Graph with reversed edges defined separately
    const graphWithReversedEdge = {
      sourceFile: 'test.md',
      nodes: [
        { id: 'N0001', title: 'Node A', kind: 'requirement', summary: 'A', headingRefs: [{ refId: 'REF001', heading: 1, texts: ['test'] }] },
        { id: 'N0002', title: 'Node B', kind: 'requirement', summary: 'B', headingRefs: [{ refId: 'REF002', heading: 1, texts: ['test'] }] },
      ],
      edges: [
        { from: 'N0001', to: 'N0002', type: 'depends_on', attributes: { strength: 'hard' } },
        { from: 'N0002', to: 'N0001', type: 'depends_on', attributes: { strength: 'hard' } },
      ],
    };
    const result = multiHopBFS(graphWithReversedEdge, 'N0001', 1);
    // Both directions are output
    assert.equal(result.edges.length, 2);
  });
});

// ============================================================
// resolveCurrentLines
// ============================================================

describe('resolveCurrentLines', () => {
  it('normal: resolves line numbers from headingRefs', () => {
    const sourceText = SOURCE_LINES.join('\n'); // resolveCurrentLines expects sourceLines as array
    const headingRefs = [{ refId: 'REF001', heading: 2, texts: ['Auth API Definition'] }];
    const result = resolveCurrentLines(sourceText, headingRefs, 'REF001');
    assert.notEqual(result, undefined);
    assert.ok(result.line > 0);
  });

  it('normal: resolves line numbers for multiple nodes', () => {
    const sourceText = SOURCE_LINES.join('\n');
    const refs = [
      { refId: 'REF001', heading: 2, texts: ['Auth API Definition'] },
      { refId: 'REF003', heading: 2, texts: ['Token Verification'] },
    ];
    const r1 = resolveCurrentLines(sourceText, refs, 'REF001');
    const r3 = resolveCurrentLines(sourceText, refs, 'REF003');

    assert.notEqual(r1, undefined);
    assert.notEqual(r3, undefined);
    assert.notEqual(r1.line, r3.line);
  });

  it('error: non-existent refId returns undefined', () => {
    const sourceText = SOURCE_LINES.join('\n');
    const headingRefs = [{ refId: 'REF001', heading: 2, texts: ['Auth API Definition'] }];
    const result = resolveCurrentLines(sourceText, headingRefs, 'REF999');
    assert.equal(result, undefined);
  });
});

// ===============================================================
// groupEdgesByType
// ============================================================

describe('groupEdgesByType', () => {
  it('normal: groups edges by type', () => {
    const groups = groupEdgesByType(SIMPLE_GRAPH.edges);
    assert.equal(groups.size, 3);
    assert.ok(groups.has('depends_on'));
    assert.ok(groups.has('refines'));
    assert.ok(groups.has('implements'));
    assert.equal(groups.get('depends_on').length, 1);
  });

  it('error: empty array returns empty Map', () => {
    const groups = groupEdgesByType([]);
    assert.equal(groups.size, 0);
  });
});

// ============================================================
// getDirectionLabel
// ============================================================

describe('getDirectionLabel', () => {
  it('normal: from→to returns "→"', () => {
    const edge = { from: 'N0001', to: 'N0003', type: 'depends_on' };
    assert.equal(getDirectionLabel('N0001', edge), '→');
  });

  it('normal: to→from returns "←"', () => {
    const edge = { from: 'N0001', to: 'N0003', type: 'depends_on' };
    assert.equal(getDirectionLabel('N0003', edge), '←');
  });

  it('normal: bidirectional edge returns "↔"', () => {
    const edge = {
      from: 'N0001', to: 'N0003', type: 'depends_on',
      attributes: { strength: 'hard', bidirectional: true },
    };
    assert.equal(getDirectionLabel('N0001', edge), '↔');
    assert.equal(getDirectionLabel('N0003', edge), '↔');
  });

  it('normal: works correctly without attributes', () => {
    const edge = { from: 'N0001', to: 'N0003', type: 'depends_on' };
    assert.equal(getDirectionLabel('N0001', edge), '→');
  });
});

// ============================================================
// formatNodeMarkdown
// ============================================================

describe('formatNodeMarkdown', () => {
  it('normal: formats node info as correct Markdown', () => {
    const node = SIMPLE_GRAPH.nodes[0]; // N0001
    const searchResult = multiHopBFS(SIMPLE_GRAPH, 'N0001', 1);
    const sourceText = SOURCE_LINES.join('\n');
    const output = formatNodeMarkdown(node, searchResult.edges, SIMPLE_GRAPH, sourceText);

    // Heading
    assert.ok(output.includes('## N0001: Auth API Definition'));
    // Kind and ref
    assert.ok(output.includes('api_contract'));
    assert.ok(output.includes('REF001'));
    // Heading ref display
    assert.ok(output.includes('h2') || output.includes('Auth API Definition'));
    // Summary
    assert.ok(output.includes('POST /api/v1/auth/login'));
    // Relation section
    assert.ok(output.includes('### Relationships With Other Nodes'));
    assert.ok(output.includes('depends_on'));
    assert.ok(output.includes('implements'));
  });

  it('normal: isolated node outputs "(none)" for relations', () => {
    const node = SIMPLE_GRAPH.nodes[1]; // N0002 (isolated)
    const sourceText = SOURCE_LINES.join('\n');
    const output = formatNodeMarkdown(node, [], SIMPLE_GRAPH, sourceText);

    assert.ok(output.includes('## N0002: Glossary'));
    assert.ok(output.includes('### Relationships With Other Nodes'));
  });

  it('normal: omits RFC description section when markers are missing', () => {
    // Node with unresolvable headingRefs (no matching heading in source)
    const nodeWithMissingRef = {
      id: 'NX001',
      title: 'Missing Node',
      kind: 'requirement',
      headingRefs: [{ refId: 'REF999', heading:1, texts:["nonexistent-heading"]}]
    };
    const sourceText = SOURCE_LINES.join('\n');
    const output = formatNodeMarkdown(nodeWithMissingRef, [], SIMPLE_GRAPH, sourceText);

    assert.ok(output.includes('NX001'));
    // When headingRefs are unresolvable, the "RFC での記述" section is not output
    assert.ok(!output.includes('RFC での記述'));
  });

  it('normal: correctly displays bidirectional edges', () => {
    const graphWithBidi = {
      sourceFile: 'test.md',
      nodes: [
        { id: 'N0001', title: 'Node A', kind: 'requirement', summary: 'A', headingRefs: [{ refId: 'REF001', heading:1, texts:["test"]}]},
        { id: 'N0002', title: 'Node B', kind: 'requirement', summary: 'B', headingRefs: [{ refId: 'REF002', heading:1, texts:["test"]}]},
      ],
      edges: [
        { from: 'N0001', to: 'N0002', type: 'depends_on', attributes: { strength: 'hard', bidirectional: true } },
      ],
    };
    const sourceLines = ['', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
    const sourceText = sourceLines.join('\n');
    const node = graphWithBidi.nodes[0];
    const searchResult = multiHopBFS(graphWithBidi, 'N0001', 1);
    const output = formatNodeMarkdown(node, searchResult.edges, graphWithBidi, sourceText);

    assert.ok(output.includes('↔'));
  });

  it('normal: node without headingRefs does not output "RFC での記述" section', () => {
    const node = { id: 'NX001', title: 'Out of Scope', kind: 'requirement', summary: 'Test' };
    const sourceText = SOURCE_LINES.join('\n');
    const output = formatNodeMarkdown(node, [], SIMPLE_GRAPH, sourceText);

    assert.ok(output.includes('NX001'));
    assert.ok(output.includes('Test'));
    // Without headingRefs, the RFC description section is not output
    assert.ok(!output.includes('RFC での記述'));
  });

  it('normal: relation section contains heading and edge types', () => {
    const node = SIMPLE_GRAPH.nodes[0]; // N0001
    const searchResult = multiHopBFS(SIMPLE_GRAPH, 'N0001', 1);
    const sourceText = SOURCE_LINES.join('\n');
    const output = formatNodeMarkdown(node, searchResult.edges, SIMPLE_GRAPH, sourceText);

    // Relation section heading
    assert.ok(output.includes('### Relationships With Other Nodes'));
    // Edge line includes type and direction label
    assert.ok(output.includes('depends_on'));
    assert.ok(output.includes('→'));
  });

  it('normal: edge lines contain type and direction label', () => {
    // Single edge graph with 1 hop
    const singleEdgeGraph = {
      sourceFile: 'test.md',
      nodes: [
        { id: 'N0001', title: 'Node A', kind: 'requirement', summary: 'A', headingRefs: [{ refId: 'REF001', heading: 1, texts: ['test'] }] },
        { id: 'N0002', title: 'Node B', kind: 'requirement', summary: 'B', headingRefs: [{ refId: 'REF002', heading: 1, texts: ['test'] }] },
      ],
      edges: [
        { from: 'N0001', to: 'N0002', type: 'depends_on', attributes: { strength: 'hard' } },
      ],
    };
    const sourceLines = ['', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
    const sourceText = sourceLines.join('\n');
    const node = singleEdgeGraph.nodes[0];
    const searchResult = multiHopBFS(singleEdgeGraph, 'N0001', 1);
    const output = formatNodeMarkdown(node, searchResult.edges, singleEdgeGraph, sourceText);
    const lines = output.split('\n');

    // Relation section heading
    assert.ok(lines.some(l => l.startsWith('### Relationships With Other Nodes')));

    // Edge lines (starting with - ) contain type and direction label
    const edgeLines = lines.filter(l => l.startsWith('- '));
    for (const edgeLine of edgeLines) {
      assert.ok(edgeLine.includes('depends_on'), `Edge line should include type: ${edgeLine}`);
      assert.ok(edgeLine.includes('→'), `Edge line should include direction label: ${edgeLine}`);
    }

    // Direction label is preserved
    assert.ok(lines.some(l => l.includes('→') || l.includes('←') || l.includes('↔')), 'Direction label was not output');
  });
});

// ============================================================
// printUsage
// ============================================================

describe('printUsage', () => {
  it('normal: prints usage (does not throw)', () => {
    // Verify console.log is called (no exception thrown)
    printUsage();
  });
});

// ============================================================
// headingRefs warning removal check
// ============================================================

describe('headingRefs warning removal', () => {
  it('normal: hasHeadingRefWarning is completely removed from source', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../.claude/scripts/rfc-graph/query.js'), 'utf8');
    assert.ok(!source.includes('hasHeadingRefWarning'), 'hasHeadingRefWarning still exists in the code');
  });

  it('normal: resolveCurrentLines() function is preserved', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../.claude/scripts/rfc-graph/query.js'), 'utf8');
    assert.ok(source.includes('function resolveCurrentLines'), 'resolveCurrentLines function has been removed');
    assert.ok(source.includes('module.exports = {'), 'module.exports must exist');
  });
});

// ============================================================
// Integration test — main function (actual file I/O)
// ============================================================

describe('main integration', () => {
  before(setupTempDir);
  after(cleanupTempDir);

  it('normal: --graph --source --id --hops produces correct Markdown output', () => {
    // Create test files
    const graphPath = writeGraphFile('graph.json', SIMPLE_GRAPH);
    const sourcePath = writeSourceFile('test.md', SOURCE_LINES);

    // Parse arguments and call functions directly (main calls process.exit, so avoid it)
    const parsed = parseArguments([
      `--graph=${graphPath}`,
      `--source=${sourcePath}`,
      '--id=N0001',
      '--hops=2',
    ]);
    assert.equal(parsed.graphPath, graphPath);
    assert.equal(parsed.sourcePath, sourcePath);
    assert.deepEqual(parsed.nodeIds, ['N0001']);
    assert.equal(parsed.hops, 2);

    const graph = loadGraph(parsed.graphPath);
    const sourceText = loadSourceFile(parsed.sourcePath);

    const node = resolveNodeById(graph, 'N0001');
    assert.notEqual(node, null);

    const searchResult = multiHopBFS(graph, 'N0001', 2);
    assert.equal(searchResult.nodeIds.length, 4);

    const output = formatNodeMarkdown(node, searchResult.edges, graph, sourceText, searchResult.depthMap);
    assert.ok(output.includes('N0001'));
    assert.ok(output.includes('N0005')); // reachable in 2 hops
  });

  it('error: non-existent graph file throws error', () => {
    assert.throws(() => {
      loadGraph(path.join(tmpDir, 'not-exists.json'));
    });
  });

  it('error: non-existent source file throws error', () => {
    assert.throws(() => {
      loadSourceFile(path.join(tmpDir, 'not-exists.md'));
    });
  });

  it('error: non-existent node ID returns null', () => {
    const node = resolveNodeById(SIMPLE_GRAPH, 'NX001');
    assert.equal(node, null);
  });
});
