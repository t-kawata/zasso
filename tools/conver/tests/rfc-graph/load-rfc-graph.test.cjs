/**
 * load-rfc-graph.test.cjs — Tests for load-rfc-graph.js [::STUB::] Deprecated
 *
 * load-rfc-graph.js has been merged into show-graph-summary-markdown.js.
 * This test file is maintained for backward compatibility, but new feature tests
 * should be added to show-graph-summary-markdown.test.cjs.
 *
 * Test framework: Node.js built-in node:test + node:assert/strict
 */

const { describe, it, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Load the module under test via require path
const {
  parseArguments,
  deriveGraphPath,
  loadGraph,
  summarizeGraph,
  generateUsageExamples,
  outputSummary,
  printUsage,
} = require('../../.claude/scripts/rfc-graph/load-rfc-graph.js');

// ============================================================
// Test Utilities
// ============================================================

/** Temporary directory path for tests */
let tmpDir;

/** Graph file path for tests */
let graphFilePath;

/** Minimal graph test data */
const MINIMAL_GRAPH = {
  sourceFile: '/tmp/test-rfc.md',
  nodes: [
    { id: 'N0001', kind: 'requirement', title: 'Login Feature', summary: 'User Login', headingRefs: [{ heading:1, texts:["test"]}]},
    { id: 'N0002', kind: 'api_contract', title: 'POST /login', summary: 'Login API', headingRefs: [{ heading:1, texts:["test"]}]},
    { id: 'N0003', kind: 'data_model', title: 'User Type', summary: 'User Data', headingRefs: [{ heading:1, texts:["test"]}]},
  ],
  edges: [
    { from: 'N0001', to: 'N0002', type: 'refines', attributes: { strength: 0.8, bidirectional: false } },
    { from: 'N0002', to: 'N0003', type: 'depends_on', attributes: { strength: 0.9, bidirectional: false } },
  ],
};

/** Graph data with isolated nodes */
const GRAPH_WITH_ISOLATED = {
  sourceFile: '/tmp/test-isolated.md',
  nodes: [
    { id: 'N0001', kind: 'requirement', title: 'Requirement A', summary: '', headingRefs: [{ heading:1, texts:["test"]}]},
    { id: 'N0002', kind: 'requirement', title: 'Requirement B (Isolated)', summary: '', headingRefs: [{ heading:1, texts:["test"]}]},
  ],
  edges: [],
};

/** Empty graph data */
const EMPTY_GRAPH = {
  sourceFile: '/tmp/empty.md',
  nodes: [],
  edges: [],
};

/** Graph data with diverse kinds/types */
const DIVERSE_GRAPH = {
  sourceFile: '/tmp/diverse.md',
  nodes: [
    { id: 'N0001', kind: 'requirement', title: 'R1', summary: '', headingRefs: [{ heading:1, texts:["test"]}]},
    { id: 'N0002', kind: 'requirement', title: 'R2', summary: '', headingRefs: [{ heading:1, texts:["test"]}]},
    { id: 'N0003', kind: 'api_contract', title: 'API1', summary: '', headingRefs: [{ heading:1, texts:["test"]}]},
    { id: 'N0004', kind: 'data_model', title: 'D1', summary: '', headingRefs: [{ heading:1, texts:["test"]}]},
    { id: 'N0005', kind: 'rationale', title: 'Rationale', summary: '', headingRefs: [{ heading:1, texts:["test"]}]},
    { id: 'N0006', kind: 'glossary', title: 'Glossary', summary: '', headingRefs: [{ heading:1, texts:["test"]}]},
  ],
  edges: [
    { from: 'N0001', to: 'N0003', type: 'depends_on', attributes: {} },
    { from: 'N0002', to: 'N0003', type: 'depends_on', attributes: {} },
    { from: 'N0003', to: 'N0004', type: 'refines', attributes: {} },
    { from: 'N0004', to: 'N0005', type: 'implements', attributes: {} },
    { from: 'N0005', to: 'N0006', type: 'validates', attributes: {} },
  ],
};

// ============================================================
// Tests
// ============================================================

describe('load-rfc-graph.js', () => {
  // Create a temporary directory before each test
  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'load-rfc-graph-test-'));
    graphFilePath = path.join(tmpDir, 'test-rfc-GRAPH.json');
  });

  // Clean up files after each test
  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ============================================================
  // parseArguments
  // ============================================================

  describe('parseArguments', () => {
    it('should parse the source path', () => {
      const result = parseArguments(['/path/to/doc.md']);
      assert.equal(result.sourcePath, '/path/to/doc.md');
    });

    it('should throw on missing source path (--help detection path)', () => {
      // --help triggers process.exit(0) which cannot be tested directly.
      // Instead, we verify that parseArguments([]) throws to confirm
      // the argument check works; --help handling exits before that check.
      assert.throws(() => {
        parseArguments([]);
      }, /ソースファイルのパスを指定してください/);
    });

    it('should throw on missing arguments (empty array)', () => {
      assert.throws(() => {
        parseArguments([]);
      }, /ソースファイルのパスを指定してください/);
    });

    it('should throw on extra arguments', () => {
      assert.throws(() => {
        parseArguments(['doc.md', 'extra.md']);
      }, /余剰な引数があります/);
    });
  });

  // ============================================================
  // deriveGraphPath
  // ============================================================

  describe('deriveGraphPath', () => {
    it('should derive path from a normal .md file', () => {
      const result = deriveGraphPath('/path/to/doc.md');
      assert.equal(result, '/path/to/doc-GRAPH.json');
    });

    it('should derive path from a file without extension', () => {
      const result = deriveGraphPath('/path/to/doc');
      assert.equal(result, '/path/to/doc-GRAPH.json');
    });

    it('should derive path from a deeply nested file', () => {
      const result = deriveGraphPath('/a/b/c/d/e.md');
      assert.equal(result, '/a/b/c/d/e-GRAPH.json');
    });

    it('should derive path from a relative path', () => {
      const result = deriveGraphPath('doc.md');
      assert.equal(result, 'doc-GRAPH.json');
    });
  });

  // ============================================================
  // loadGraph
  // ============================================================

  describe('loadGraph', () => {
    it('should load an existing graph file', () => {
      fs.writeFileSync(graphFilePath, JSON.stringify(MINIMAL_GRAPH), 'utf8');
      const graph = loadGraph(graphFilePath);
      assert.equal(graph.sourceFile, '/tmp/test-rfc.md');
      assert.equal(graph.nodes.length, 3);
      assert.equal(graph.edges.length, 2);
    });

    it('should return null when graph does not exist', () => {
      const result = loadGraph('/tmp/nonexistent-GRAPH.json');
      assert.equal(result, null);
    });

    it('should throw on invalid JSON format', () => {
      fs.writeFileSync(graphFilePath, '{invalid JSON}', 'utf8');
      assert.throws(() => {
        loadGraph(graphFilePath);
      }, /JSONパースに失敗/);
    });

    it('should throw on invalid structure (missing nodes/edges)', () => {
      fs.writeFileSync(graphFilePath, JSON.stringify({}), 'utf8');
      assert.throws(() => {
        loadGraph(graphFilePath);
      }, /構造が不正/);
    });
  });

  // ============================================================
  // summarizeGraph
  // ============================================================

  describe('summarizeGraph', () => {
    it('should summarize a graph with mixed kinds', () => {
      const summary = summarizeGraph(MINIMAL_GRAPH);
      assert.equal(summary.nodeCount, 3);
      assert.deepEqual(summary.kindDistribution, {
        requirement: 1,
        api_contract: 1,
        data_model: 1,
      });
      assert.equal(summary.edgeCount, 2);
      assert.deepEqual(summary.typeDistribution, {
        refines: 1,
        depends_on: 1,
      });
      assert.deepEqual(summary.isolatedNodes, []);
    });

    it('should summarize a graph with isolated nodes', () => {
      const summary = summarizeGraph(GRAPH_WITH_ISOLATED);
      assert.equal(summary.nodeCount, 2);
      assert.deepEqual(summary.isolatedNodes, ['N0001', 'N0002']);
    });

    it('should handle empty graph', () => {
      const summary = summarizeGraph(EMPTY_GRAPH);
      assert.equal(summary.nodeCount, 0);
      assert.deepEqual(summary.kindDistribution, {});
      assert.equal(summary.edgeCount, 0);
      assert.deepEqual(summary.typeDistribution, {});
      assert.deepEqual(summary.isolatedNodes, []);
    });

    it('should summarize a graph with diverse kinds and types', () => {
      const summary = summarizeGraph(DIVERSE_GRAPH);
      assert.equal(summary.nodeCount, 6);
      assert.deepEqual(summary.kindDistribution, {
        requirement: 2,
        api_contract: 1,
        data_model: 1,
        rationale: 1,
        glossary: 1,
      });
      assert.equal(summary.edgeCount, 5);
      assert.deepEqual(summary.typeDistribution, {
        depends_on: 2,
        refines: 1,
        implements: 1,
        validates: 1,
      });
    });
  });

  // ============================================================
  // generateUsageExamples
  // ============================================================

  describe('generateUsageExamples', () => {
    it('should generate full CLI format for crud.js/query.js', () => {
      const examples = generateUsageExamples('/tmp/test-rfc-GRAPH.json', '/tmp/test-rfc.md', 'N0001');
      assert.equal(examples.length, 3);
      assert.ok(examples[0].includes('crud.js list-nodes'));
      assert.ok(examples[0].includes('test-rfc-GRAPH.json'));
      assert.ok(examples[1].includes('crud.js get-node'));
      assert.ok(examples[1].includes('N0001'));
      assert.ok(examples[2].includes('query.js'));
      assert.ok(examples[2].includes('test-rfc.md'));
      assert.ok(examples[2].includes('N0001'));
      assert.ok(examples[2].includes('--hops=2'));
    });

    it('should generate examples with default node ID', () => {
      const examples = generateUsageExamples('/tmp/graph.json', '/tmp/source.md');
      assert.ok(examples[1].includes('N0001'));
    });
  });

  // ============================================================
  // outputSummary
  // ============================================================

  describe('outputSummary', () => {
    it('should format and output the summary', () => {
      // Capture writes to stdout (outputSummary uses a single console.log with newline-separated output)
      const originalLog = console.log;
      let captured = '';
      console.log = (msg) => { captured = msg; };

      const summary = summarizeGraph(MINIMAL_GRAPH);
      const examples = generateUsageExamples('/tmp/test-rfc-GRAPH.json', '/tmp/test-rfc.md', 'N0001');
      outputSummary(summary, '/tmp/test-rfc-GRAPH.json', examples);

      console.log = originalLog;

      const lines = captured.split('\n');
      // Verify expected structure
      assert.ok(lines[0].includes('[グラフ構造サマリー]'));
      assert.ok(lines[1].includes('test-rfc-GRAPH.json'));
      assert.ok(lines[2].includes('3件'));
      assert.ok(lines[4].includes('0件'));
    });

    it('should output summary with isolated nodes', () => {
      const originalLog = console.log;
      let captured = '';
      console.log = (msg) => { captured = msg; };

      const summary = summarizeGraph(GRAPH_WITH_ISOLATED);
      const examples = generateUsageExamples('/tmp/graph.json', '/tmp/source.md', 'N0001');
      outputSummary(summary, '/tmp/graph.json', examples);

      console.log = originalLog;

      const lines = captured.split('\n');
      assert.ok(lines[4].includes('2件')); // isolated node count
    });
  });
});
