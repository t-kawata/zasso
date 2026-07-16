/**
 * crud.test.cjs — Tests for crud.js
 *
 * Test framework: Node.js standard node:test + node:assert/strict
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
  readGraph,
  executeCreateNodes,
  executeListNodeIds,
  executeGetNode,
  executeUpdateNode,
  executeDeleteNode,
  executeCreateEdges,
  executeDeleteEdges,
  atomicWrite,
  ALLOWED_SUBCOMMANDS,
} = require('../../.claude/scripts/rfc-graph/crud.js');

// ============================================================
// Test Utilities
// ============================================================

/** Temporary directory path for tests */
let tmpDir;

/** Persistent test graph file path */
let testGraphPath;

/** Test file path */
let testFilePath;

/**
 * Create a valid test node
 *
 * @param {string} id — Node ID
 * @param {string} kind — Node kind
 * @returns {Object} Node data
 */
function createTestNode(id, kind) {
  const slug = 'test_node_' + id.toLowerCase();
  return {
    id,
    title: 'Test Node ' + id,
    kind,
    slug,
    summary: 'This is a test node.',
    headingRefs: [{ refId: 'REF001', heading:1, texts:["test"]}],
  };
}

/**
 * Create a valid test edge
 *
 * @param {string} from — Source node ID
 * @param {string} to — Target node ID
 * @param {string} type — Edge type
 * @returns {Object} Edge data
 */
function createTestEdge(from, to, type) {
  return {
    from,
    to,
    type,
    attributes: { strength: 'hard', bidirectional: false },
  };
}

/**
 * Create test graph data
 *
 * @param {Object[]} [nodes] — Array of nodes
 * @param {Object[]} [edges] — Array of edges
 * @returns {Object} Graph data
 */
function createTestGraph(nodes = [], edges = []) {
  return { sourceFile: '/test/source.md', nodes, edges };
}

// ============================================================
// Test Suites
// ============================================================

describe('crud.js — constants', () => {
  it('ALLOWED_SUBCOMMANDS contains 7 subcommands', () => {
    assert.equal(ALLOWED_SUBCOMMANDS.length, 7);
    assert.ok(ALLOWED_SUBCOMMANDS.includes('create-nodes'));
    assert.ok(ALLOWED_SUBCOMMANDS.includes('list-nodes'));
    assert.ok(ALLOWED_SUBCOMMANDS.includes('get-node'));
    assert.ok(ALLOWED_SUBCOMMANDS.includes('update-node'));
    assert.ok(ALLOWED_SUBCOMMANDS.includes('delete-node'));
    assert.ok(ALLOWED_SUBCOMMANDS.includes('create-edges'));
    assert.ok(ALLOWED_SUBCOMMANDS.includes('delete-edges'));
  });
});

describe('crud.js — parseArguments', () => {
  // Save original process.argv
  let originalArgv;

  before(() => {
    originalArgv = process.argv;
  });

  after(() => {
    process.argv = originalArgv;
  });

  /**
   * Helper for testing parseArguments
   *
   * @param {string[]} args — CLI arguments (excluding node/path)
   * @returns {Object} Return value of parseArguments
   */
  function testParse(args) {
    process.argv = ['node', 'crud.js', ...args];
    return parseArguments();
  }

  it('parses create-nodes subcommand correctly', () => {
    const result = testParse(['--graph=/tmp/test.json', 'create-nodes', '--file=/tmp/nodes.json']);
    assert.equal(result.graphPath, '/tmp/test.json');
    assert.equal(result.subcommand, 'create-nodes');
    assert.equal(result.nodeId, null);
    assert.equal(result.filePath, '/tmp/nodes.json');
  });

  it('parses list-nodes subcommand correctly', () => {
    const result = testParse(['--graph=/tmp/test.json', 'list-nodes']);
    assert.equal(result.graphPath, '/tmp/test.json');
    assert.equal(result.subcommand, 'list-nodes');
    assert.equal(result.nodeId, null);
    assert.equal(result.filePath, null);
  });

  it('parses get-node subcommand correctly', () => {
    const result = testParse(['--graph=/tmp/test.json', 'get-node', '--id=N0001']);
    assert.equal(result.graphPath, '/tmp/test.json');
    assert.equal(result.subcommand, 'get-node');
    assert.equal(result.nodeId, 'N0001');
    assert.equal(result.filePath, null);
  });

  it('parses update-node subcommand correctly', () => {
    const result = testParse(['--graph=/tmp/test.json', 'update-node', '--id=N0001', '--file=/tmp/patch.json']);
    assert.equal(result.graphPath, '/tmp/test.json');
    assert.equal(result.subcommand, 'update-node');
    assert.equal(result.nodeId, 'N0001');
    assert.equal(result.filePath, '/tmp/patch.json');
  });

  it('parses delete-node subcommand correctly', () => {
    const result = testParse(['--graph=/tmp/test.json', 'delete-node', '--id=N0001']);
    assert.equal(result.graphPath, '/tmp/test.json');
    assert.equal(result.subcommand, 'delete-node');
    assert.equal(result.nodeId, 'N0001');
    assert.equal(result.filePath, null);
  });

  it('parses create-edges subcommand correctly', () => {
    const result = testParse(['--graph=/tmp/test.json', 'create-edges', '--file=/tmp/edges.json']);
    assert.equal(result.graphPath, '/tmp/test.json');
    assert.equal(result.subcommand, 'create-edges');
    assert.equal(result.nodeId, null);
    assert.equal(result.filePath, '/tmp/edges.json');
  });

  it('throws parse error on insufficient arguments', () => {
    assert.throws(
      () => testParse(['--graph=/tmp/test.json']),
      /引数が不足しています/
    );
  });

  it('throws parse error on unknown subcommand', () => {
    assert.throws(
      () => testParse(['--graph=/tmp/test.json', 'unknown-command']),
      /未知のサブコマンドです/
    );
  });

  it('throws parse error without --graph= prefix', () => {
    assert.throws(
      () => testParse(['/tmp/test.json', 'list-nodes']),
      /最初の引数は --graph=<path>/
    );
  });

  it('throws parse error when --file is missing for create-nodes', () => {
    assert.throws(
      () => testParse(['--graph=/tmp/test.json', 'create-nodes']),
      /--file=<path> が必要です/
    );
  });

  it('throws parse error when --id is missing for update-node', () => {
    assert.throws(
      () => testParse(['--graph=/tmp/test.json', 'update-node', '--file=/tmp/patch.json']),
      /--id=<nodeId> が必要です/
    );
  });
});

describe('crud.js — readGraph', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crud-test-'));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty graph for non-existent file path', () => {
    const graph = readGraph(path.join(tmpDir, 'nonexistent.json'), path.join(tmpDir, 'source.md'));
    assert.equal(graph.sourceFile, path.join(tmpDir, 'source.md'));
    assert.deepEqual(graph.nodes, []);
    assert.deepEqual(graph.edges, []);
  });

  it('reads valid graph JSON file', () => {
    const graphPath = path.join(tmpDir, 'valid.json');
    const testGraph = createTestGraph(
      [createTestNode('N0001', 'requirement')],
      [createTestEdge('N0001', 'N0002', 'depends_on')]
    );
    atomicWrite(graphPath, JSON.stringify(testGraph, null, 2));

    const graph = readGraph(graphPath);
    assert.equal(graph.sourceFile, '/test/source.md');
    assert.equal(graph.nodes.length, 1);
    assert.equal(graph.nodes[0].id, 'N0001');
    assert.equal(graph.edges.length, 1);
  });
});

describe('crud.js — atomicWrite', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crud-test-'));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes file successfully', () => {
    const filePath = path.join(tmpDir, 'output.json');
    const data = JSON.stringify({ ok: true });
    atomicWrite(filePath, data);
    assert.ok(fs.existsSync(filePath));
    assert.equal(fs.readFileSync(filePath, 'utf-8'), data);
  });

  it('does not leave temp file after write', () => {
    const filePath = path.join(tmpDir, 'clean.json');
    atomicWrite(filePath, JSON.stringify({ test: true }));
    // Verify no .tmp.pid file remains
    const tmpFiles = fs.readdirSync(tmpDir).filter((f) => f.includes('.tmp.'));
    assert.equal(tmpFiles.length, 0);
  });
});

describe('crud.js — executeCreateNodes', () => {
  it('adds valid nodes', () => {
    const graph = createTestGraph();
    const nodes = [createTestNode('N0001', 'requirement')];
    executeCreateNodes(graph, nodes);
    assert.equal(graph.nodes.length, 1);
    assert.equal(graph.nodes[0].id, 'N0001');
  });

  it('adds multiple valid nodes in batch', () => {
    const graph = createTestGraph();
    const nodes = [
      createTestNode('N0001', 'requirement'),
      createTestNode('N0002', 'api_contract'),
      createTestNode('N0003', 'data_model'),
    ];
    executeCreateNodes(graph, nodes);
    assert.equal(graph.nodes.length, 3);
  });

  it('throws error on schema-violating node (title is required by schema, tested with empty string)', () => {
    const graph = createTestGraph();
    const invalidNode = { id: 'N0001', title: '', kind: 'requirement', summary: 'test', headingRefs: [{ refId: 'REF001', heading:1, texts:["test"]}]};
    assert.throws(
      () => executeCreateNodes(graph, [invalidNode]),
      /スキーマ検証に失敗しました/
    );
    // Graph is unchanged
    assert.equal(graph.nodes.length, 0);
  });

  it('throws error on duplicate ID and does not modify graph', () => {
    const graph = createTestGraph([createTestNode('N0001', 'requirement')]);
    const duplicateNode = createTestNode('N0001', 'requirement');
    assert.throws(
      () => executeCreateNodes(graph, [duplicateNode]),
      /既に存在します/
    );
    // Graph is unchanged (duplicate check validates all entries before adding)
    assert.equal(graph.nodes.length, 1);
  });
});

describe('crud.js — executeListNodeIds', () => {
  it('outputs full node list as JSON', () => {
    const graph = createTestGraph([
      createTestNode('N0001', 'requirement'),
      createTestNode('N0002', 'api_contract'),
    ]);
    // Capture stdout output
    const logs = [];
    const originalLog = console.log;
    console.log = (msg) => logs.push(msg);

    try {
      executeListNodeIds(graph);
      assert.equal(logs.length, 1);
      const output = JSON.parse(logs[0]);
      assert.equal(output.length, 2);
      assert.equal(output[0].id, 'N0001');
      assert.equal(output[1].id, 'N0002');
    } finally {
      console.log = originalLog;
    }
  });

  it('outputs empty array for empty graph', () => {
    const graph = createTestGraph();
    const logs = [];
    const originalLog = console.log;
    console.log = (msg) => logs.push(msg);

    try {
      executeListNodeIds(graph);
      assert.equal(logs.length, 1);
      const output = JSON.parse(logs[0]);
      assert.deepEqual(output, []);
    } finally {
      console.log = originalLog;
    }
  });
});

describe('crud.js — executeGetNode', () => {
  it('retrieves an existing node', () => {
    const graph = createTestGraph([createTestNode('N0001', 'requirement')]);
    const logs = [];
    const originalLog = console.log;
    console.log = (msg) => logs.push(msg);

    try {
      executeGetNode(graph, 'N0001');
      assert.equal(logs.length, 1);
      const output = JSON.parse(logs[0]);
      assert.equal(output.id, 'N0001');
      assert.equal(output.kind, 'requirement');
    } finally {
      console.log = originalLog;
    }
  });

  it('throws error on non-existent node ID', () => {
    const graph = createTestGraph([createTestNode('N0001', 'requirement')]);
    assert.throws(
      () => executeGetNode(graph, 'N9999'),
      /見つかりません/
    );
  });
});

describe('crud.js — executeUpdateNode', () => {
  it('updates a node', () => {
    const graph = createTestGraph([createTestNode('N0001', 'requirement')]);
    executeUpdateNode(graph, 'N0001', { title: 'Updated title', kind: 'api_contract' });
    assert.equal(graph.nodes[0].title, 'Updated title');
    assert.equal(graph.nodes[0].kind, 'api_contract');
    // Unmodified fields are preserved
    assert.equal(graph.nodes[0].summary, 'This is a test node.');
  });

  it('throws error on non-existent node ID', () => {
    const graph = createTestGraph([createTestNode('N0001', 'requirement')]);
    assert.throws(
      () => executeUpdateNode(graph, 'N9999', { title: 'New title' }),
      /見つかりません/
    );
  });
});

describe('crud.js — executeDeleteNode', () => {
  it('deletes a node', () => {
    const graph = createTestGraph([
      createTestNode('N0001', 'requirement'),
      createTestNode('N0002', 'api_contract'),
    ]);
    executeDeleteNode(graph, 'N0001');
    assert.equal(graph.nodes.length, 1);
    assert.equal(graph.nodes[0].id, 'N0002');
  });

  it('throws error on non-existent node ID', () => {
    const graph = createTestGraph([createTestNode('N0001', 'requirement')]);
    assert.throws(
      () => executeDeleteNode(graph, 'N9999'),
      /見つかりません/
    );
  });
});

describe('crud.js — executeCreateEdges', () => {
  it('adds valid edges', () => {
    const graph = createTestGraph([
      createTestNode('N0001', 'requirement'),
      createTestNode('N0002', 'api_contract'),
    ]);
    const edges = [createTestEdge('N0001', 'N0002', 'depends_on')];
    executeCreateEdges(graph, edges);
    assert.equal(graph.edges.length, 1);
    assert.equal(graph.edges[0].from, 'N0001');
    assert.equal(graph.edges[0].to, 'N0002');
  });

  it('throws error on edge referencing non-existent from-node and does not modify graph', () => {
    const graph = createTestGraph([createTestNode('N0001', 'requirement')]);
    const edges = [createTestEdge('N9999', 'N0001', 'depends_on')];
    assert.throws(
      () => executeCreateEdges(graph, edges),
      /存在しません/
    );
    assert.equal(graph.edges.length, 0);
  });

  it('throws error on edge referencing non-existent to-node and does not modify graph', () => {
    const graph = createTestGraph([createTestNode('N0001', 'requirement')]);
    const edges = [createTestEdge('N0001', 'N9999', 'depends_on')];
    assert.throws(
      () => executeCreateEdges(graph, edges),
      /存在しません/
    );
    assert.equal(graph.edges.length, 0);
  });
});

describe('crud.js — executeDeleteEdges', () => {
  it('deletes an existing edge', () => {
    const graph = createTestGraph([
      createTestNode('N0001', 'requirement'),
      createTestNode('N0002', 'api_contract'),
      createTestNode('N0003', 'data_model'),
    ]);
    graph.edges = [
      createTestEdge('N0001', 'N0002', 'depends_on'),
      createTestEdge('N0002', 'N0003', 'refines'),
    ];
    executeDeleteEdges(graph, [{ from: 'N0001', to: 'N0002', type: 'depends_on' }]);
    assert.equal(graph.edges.length, 1);
    assert.equal(graph.edges[0].from, 'N0002');
  });

  it('does not error when deleting non-existent edge (idempotent)', () => {
    const graph = createTestGraph([
      createTestNode('N0001', 'requirement'),
      createTestNode('N0002', 'api_contract'),
    ]);
    graph.edges = [createTestEdge('N0001', 'N0002', 'depends_on')];
    executeDeleteEdges(graph, [{ from: 'N0001', to: 'N0002', type: 'refines' }]);
    assert.equal(graph.edges.length, 1);
  });
});
