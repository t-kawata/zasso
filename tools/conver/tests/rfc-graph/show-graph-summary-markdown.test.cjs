/**
 * show-graph-summary-markdown.test.cjs — Tests for show-graph-summary-markdown.js
 *
 * Test framework: Node.js standard node:test + node:assert/strict
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  parseArguments,
  loadGraph,
  truncateSummary,
  abbreviateEdgeType,
  buildNodeMap,
  generateSummary,
  EDGE_ABBREV,
} = require('../../.claude/scripts/rfc-graph/show-graph-summary-markdown.js');

// ============================================================
// Test data
// ============================================================

const SAMPLE_GRAPH = {
  sourceFile: '/path/to/RFC-GRAPHIFY.md',
  nodes: [
    { id: 'N0001', kind: 'requirement', title: 'Authentication API Definition', summary: 'Specifies the number of retries and intervals on authentication failure', headingRefs: [{ refId: 'REF001', heading:1, texts:["test"]}]},
    { id: 'N0002', kind: 'requirement', title: 'Error Type Definition', summary: 'Error types used in this module', headingRefs: [{ refId: 'REF002', heading:1, texts:["test"]}]},
    { id: 'N0003', kind: 'requirement', title: 'Token Validation', summary: 'JWT token signature verification procedure', headingRefs: [{ refId: 'REF003', heading:1, texts:["test"]}]},
    { id: 'N0004', kind: 'api_contract', title: 'POST /api/v1/auth/login', summary: 'Login endpoint request/response specification', headingRefs: [{ refId: 'REF004', heading:1, texts:["test"]}]},
    { id: 'N0005', kind: 'architecture', title: 'Session Management', summary: 'User session creation and destruction lifecycle', headingRefs: [{ refId: 'REF005', heading:1, texts:["test"]}]},
    { id: 'N0006', kind: 'glossary', title: 'Glossary', summary: 'Authentication-related terms', headingRefs: [{ refId: 'REF006', heading:1, texts:["test"]}]},
  ],
  edges: [
    { from: 'N0001', to: 'N0003', type: 'depends_on', attributes: { strength: 'hard', bidirectional: false } },
    { from: 'N0001', to: 'N0004', type: 'implements', attributes: { strength: 'soft', bidirectional: false } },
    { from: 'N0002', to: 'N0003', type: 'depends_on', attributes: { strength: 'hard', bidirectional: false } },
    { from: 'N0003', to: 'N0005', type: 'refines', attributes: { strength: 'medium', bidirectional: false } },
    { from: 'N0004', to: 'N0005', type: 'validates', attributes: { strength: 'soft', bidirectional: false } },
  ],
};

/** Source text with markers */
const SAMPLE_SOURCE = [
  '# RFC',
  '',
  '## Requirements',
  '[::REF001-START::] Authentication API Definition',
  'Retry count specification',
  '[::REF001-END::]',
  '',
  '[::REF002-START::] Error Type Definition',
  'Error type details',
  '[::REF002-END::]',
  '',
  '## Implementation',
  '[::REF003-START::] Token Validation',
  'JWT signature verification',
  '[::REF003-END::]',
  '',
  '[::REF004-START::] POST /api/v1/auth/login',
  'Endpoint specification',
  '[::REF004-END::]',
  '',
  '## Design',
  '[::REF005-START::] Session Management',
  'Lifecycle',
  '[::REF005-END::]',
  '',
  '[::REF006-START::] Glossary',
  'Term list',
  '[::REF006-END::]',
].join('\n');

// ============================================================
// Tests
// ============================================================

describe('parseArguments', () => {
  it('parses --graph --source correctly', () => {
    const result = parseArguments(['node', 'script.js', '--graph=/g.json', '--source=/s.md']);
    assert.equal(result.graphPath, '/g.json');
    assert.equal(result.sourcePath, '/s.md');
  });

  it('throws on missing arguments', () => {
    assert.throws(() => parseArguments(['node', 'script.js', '--graph=/g.json']), /引数が不足/);
  });

  it('throws on wrong --graph prefix', () => {
    assert.throws(() => parseArguments(['node', 's.js', '--gra=/g.json', '--source=/s.md']), /最初の引数/);
  });

  it('throws on empty --graph path', () => {
    assert.throws(() => parseArguments(['node', 's.js', '--graph=', '--source=/s.md']), /空です/);
  });
});

describe('truncateSummary', () => {
  it('returns as-is for 28 characters or fewer', () => {
    assert.equal(truncateSummary('Short summary'), 'Short summary');
  });

  it('truncates to 25 chars + ... for 29+ characters', () => {
    const long = 'This is a long summary that should be truncated by the function';
    const result = truncateSummary(long);
    assert.ok(result.endsWith('...'));
    assert.equal(result.length, 28); // 25 + ...
  });

  it('returns empty string for null/undefined', () => {
    assert.equal(truncateSummary(null), '');
    assert.equal(truncateSummary(undefined), '');
  });
});

describe('abbreviateEdgeType', () => {
  it('all 12 edge types are abbreviated to 3 characters', () => {
    const cases = [
      ['depends_on', 'dep'], ['implements', 'imp'], ['refines', 'rfn'],
      ['extends', 'ext'], ['conflicts_with', 'cnf'], ['triggers', 'trg'],
      ['constrains', 'cns'], ['supersedes', 'sup'], ['references', 'ref'],
      ['precedes', 'prc'], ['part_of', 'prt'], ['validates', 'vld'],
    ];
    for (const [type, expected] of cases) {
      assert.equal(abbreviateEdgeType(type), expected, `${type} → ${expected}`);
    }
  });

  it('returns first 3 characters for unknown type', () => {
    assert.equal(abbreviateEdgeType('unknown'), 'unk');
  });
});

describe('EDGE_ABBREV', () => {
  it('all 12 edge type abbreviations exist', () => {
    assert.equal(Object.keys(EDGE_ABBREV).length, 12);
  });
});

describe('buildNodeMap', () => {
  it('builds node ID to node object map', () => {
    const map = buildNodeMap(SAMPLE_GRAPH.nodes);
    assert.equal(map['N0001'].title, 'Authentication API Definition');
    assert.equal(map['N0006'].kind, 'glossary');
    assert.equal(Object.keys(map).length, 6);
  });
});

describe('loadGraph', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'show-graph-test-'));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads valid graph JSON', () => {
    const filePath = path.join(tmpDir, 'graph.json');
    fs.writeFileSync(filePath, JSON.stringify(SAMPLE_GRAPH), 'utf8');
    const graph = loadGraph(filePath);
    assert.equal(graph.sourceFile, SAMPLE_GRAPH.sourceFile);
    assert.equal(graph.nodes.length, 6);
  });

  it('throws on non-existent file', () => {
    assert.throws(() => loadGraph(path.join(tmpDir, 'nonexist.json')), /見つかりません/);
  });

  it('throws on invalid JSON', () => {
    const filePath = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(filePath, '{bad}', 'utf8');
    assert.throws(() => loadGraph(filePath), /JSONパース/);
  });
});

describe('generateSummary', () => {
  it('outputs node list grouped by kind', () => {
    const output = generateSummary(SAMPLE_GRAPH, SAMPLE_SOURCE);
    const lines = output.split('\n');

    // First line: absolute path + count
    assert.ok(lines[0].startsWith('/path/to/RFC-GRAPHIFY.md'));
    assert.ok(lines[0].includes('6 nodes / 5 edges'));

    // kind groups
    assert.ok(output.includes('## requirement (3件)'));
    assert.ok(output.includes('## api_contract (1件)'));
    assert.ok(output.includes('## architecture (1件)'));
    assert.ok(output.includes('## glossary (1件)'));

    // Each node ID + title
    assert.ok(output.includes('N0001: Authentication API Definition'));
    assert.ok(output.includes('N0002: Error Type Definition'));
    assert.ok(output.includes('N0003: Token Validation'));
    assert.ok(output.includes('N0004: POST /api/v1/auth/login'));
    assert.ok(output.includes('N0005: Session Management'));

    // Summary
    assert.ok(output.includes('Login endpoint'));

    // Edge relationships (new format)
    assert.ok(output.includes('[N0001] -> depends_on -> [N0003: Token Validation]'));
    assert.ok(output.includes('[N0003] <- depends_on <- [N0001: Authentication API Definition]'));
  });

  it('generates empty edge list for isolated node graph', () => {
    const isolatedGraph = {
      sourceFile: '/test.md',
      nodes: [
        { id: 'N0001', kind: 'requirement', title: 'Isolated Node', summary: 'Isolated node', headingRefs: [{ refId: 'REF001', heading:1, texts:["test"]}]},
      ],
      edges: [],
    };
    const singleLineSource = '[::REF001-START::] Isolated Node\nContent\n[::REF001-END::]';
    const output = generateSummary(isolatedGraph, singleLineSource);
    assert.ok(output.includes('Isolated Node'));
    // No edges — no arrow notation
    assert.ok(!output.includes('→'));
    assert.ok(!output.includes('←'));
  });

  it('displays nodes without headingRefs without line numbers', () => {
    const noRangeGraph = {
      sourceFile: '/test.md',
      nodes: [
        { id: 'N0001', kind: 'requirement', title: 'No Range', summary: 'Node without range' },
      ],
      edges: [],
    };
    const output = generateSummary(noRangeGraph, '');
    assert.ok(output.includes('No Range'));
    assert.ok(!output.includes('[L')); // No line numbers
  });

  it('displays bidirectional arrows for bidirectional edges', () => {
    const graph = {
      sourceFile: '/test.md',
      nodes: [
        { id: 'N0001', kind: 'requirement', title: 'A', summary: 'A', headingRefs: [{ refId: 'REF001', heading:1, texts:["test"]}]},
        { id: 'N0002', kind: 'requirement', title: 'B', summary: 'B', headingRefs: [{ refId: 'REF002', heading:1, texts:["test"]}]},
      ],
      edges: [
        { from: 'N0001', to: 'N0002', type: 'depends_on', attributes: { strength: 'hard', bidirectional: true } },
      ],
    };
    const src = '[::REF001-START::] A\n[::REF001-END::]\n[::REF002-START::] B\n[::REF002-END::]';
    const output = generateSummary(graph, src);
    // bidirectional displays as <->
    assert.ok(output.includes('<->'));
  });
});

describe('generateCliExamples', () => {
  const { generateCliExamples } = require('../../.claude/scripts/rfc-graph/show-graph-summary-markdown.js');

  it('includes query.js CLI usage examples', () => {
    const examples = generateCliExamples('/g.json', '/s.md', 'N0001');
    const output = examples.join('\n');
    assert.ok(output.includes('query.js'));
    assert.ok(output.includes('--graph=g.json'));
    assert.ok(output.includes('--source=s.md'));
    assert.ok(output.includes('--id=N0001'));
    assert.ok(output.includes('--hops=2'));
  });
});

describe('parseArguments with --with-cli-examples', () => {
  const { parseArguments } = require('../../.claude/scripts/rfc-graph/show-graph-summary-markdown.js');

  it('parses --with-cli-examples flag', () => {
    const result = parseArguments(['node', 's.js', '--graph=/g.json', '--source=/s.md', '--with-cli-examples']);
    assert.equal(result.withCliExamples, true);
  });

  it('returns false without flag', () => {
    const result = parseArguments(['node', 's.js', '--graph=/g.json', '--source=/s.md']);
    assert.equal(result.withCliExamples, false);
  });
});
