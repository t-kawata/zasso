/**
 * verify.test.cjs — Tests for verify.js
 *
 * Test framework: Node.js standard node:test + node:assert/strict
 * Covers all public functions of the target module.
 * Includes actual file I/O tests using a temporary directory.
 */

const { describe, it, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Load the target module via require path
const {
  parseArguments,
  readGraph,
  readSourceFile,
  extractHeadings,
  isHeadingCovered,
  checkCoverage,
  checkIsolated,
  checkResolvability,
  exitWithResult,
  printUsage,
} = require('../../.claude/scripts/rfc-graph/verify.js');

// ============================================================
// Test Utilities
// ============================================================

/** Temporary directory path for tests */
let tmpDir;

/**
 * Create a temporary directory before each test
 */
function setupTempDir() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-test-'));
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

/**
 * Create a valid test node
 *
 * @param {string} id — Node ID
 * @param {Array} headingRefs — headingRefs array
 * @returns {Object} Node data
 */
/** Create a coverage test node with headingRefs */
function createCoverageNode(id, headingRefs) {
  return {
    id,
    title: "Test Node " + id,
    kind: "requirement",
    summary: "This is a test node for verify.js.",
    headingRefs,
  };
}

/** Create a test node with heading references */
function createTestNode(id, headingRefs) {
  return {
    id,
    title: 'Test Node ' + id,
    kind: 'requirement',
    summary: 'Test node',
    headingRefs,
  };
}

/**
 * Create a valid test edge
 *
 * @param {string} from — Source node ID
 * @param {string} to — Target node ID
 * @returns {Object} Edge data
 */
function createTestEdge(from, to) {
  return {
    from,
    to,
    type: 'references',
    attributes: { strength: 'hard', bidirectional: false },
  };
}

// ============================================================
// Test Suites
// ============================================================

describe('verify.js — parseArguments', () => {
  it('normal: parses --graph=p --source=q', () => {
    const result = parseArguments(['--graph=/path/to/graph.json', '--source=/path/to/source.md']);
    assert.equal(result.graphPath, '/path/to/graph.json');
    assert.equal(result.sourcePath, '/path/to/source.md');
  });

  it('normal: printUsage displays usage', () => {
    let logOutput = '';
    const originalLog = console.log;
    console.log = (msg) => { logOutput += msg; };

    try {
      printUsage();
      assert.ok(logOutput.includes('verify.js'));
      assert.ok(logOutput.includes('--graph'));
      assert.ok(logOutput.includes('--source'));
    } finally {
      console.log = originalLog;
    }
  });

  it('error: throws when arguments are insufficient', () => {
    assert.throws(() => {
      parseArguments(['--graph=/path.json']);
    }, /Insufficient arguments/);
  });

  it('error: throws with no arguments', () => {
    assert.throws(() => {
      parseArguments([]);
    }, /Insufficient arguments/);
  });

  it('error: throws when first argument is not --graph', () => {
    assert.throws(() => {
      parseArguments(['--source=/path.md', '--graph=/path.json']);
    }, /must be --graph/);
  });

  it('error: throws when extra arguments exist', () => {
    assert.throws(() => {
      parseArguments(['--graph=p', '--source=q', '--extra']);
    }, /Excess arguments/);
  });
});

describe('verify.js — readGraph', () => {
  before(setupTempDir);
  after(cleanupTempDir);

  it('normal: reads valid graph JSON', () => {
    const graphData = {
      sourceFile: '/test/source.md',
      nodes: [createTestNode('N0001', [{ refId: 'REF001', heading:1, texts:["test"]}])],
      edges: [],
    };
    const graphPath = writeGraphFile('valid-graph.json', graphData);

    const result = readGraph(graphPath);
    assert.deepEqual(result, graphData);
  });

  it('error: throws when file does not exist', () => {
    assert.throws(() => {
      readGraph(path.join(tmpDir, 'nonexistent.json'));
    }, /not found/);
  });

  it('error: throws on invalid JSON', () => {
    const filePath = path.join(tmpDir, 'invalid.json');
    fs.writeFileSync(filePath, '{不正なJSON}', 'utf8');

    assert.throws(() => {
      readGraph(filePath);
    }, /Failed to parse graph/);
  });

  it('error: throws when nodes/edges are missing', () => {
    const filePath = path.join(tmpDir, 'no-nodes.json');
    fs.writeFileSync(filePath, JSON.stringify({ sourceFile: '/test.md' }), 'utf8');

    assert.throws(() => {
      readGraph(filePath);
    }, /data structure is invalid/);
  });
});

describe('verify.js — readSourceFile', () => {
  before(setupTempDir);
  after(cleanupTempDir);

  it('normal: reads source file as array of lines', () => {
    const filePath = writeSourceFile('test.md', [
      '# Title',
      '',
      'Content 1',
      'Content 2',
    ]);
    const result = readSourceFile(filePath);
    assert.deepEqual(result, ['# Title', '', 'Content 1', 'Content 2']);
  });

  it('error: throws when file does not exist', () => {
    assert.throws(() => {
      readSourceFile(path.join(tmpDir, 'nonexistent.md'));
    }, /not found/);
  });

  it('normal: empty file returns empty array', () => {
    const filePath = writeSourceFile('empty.md', ['']);
    const result = readSourceFile(filePath);
    assert.deepEqual(result, ['']);
  });
});

describe('verify.js — extractHeadings', () => {
  it('normal: extracts h2 headings', () => {
    const sourceLines = [
      '# Title',
      '## Requirements',
      'Body',
      '### Sub',
      '## Architecture',
    ];
    const result = extractHeadings(sourceLines);
    assert.equal(result.length, 2);
    assert.equal(result[0].text, 'Requirements');
    assert.equal(result[0].level, 2);
    assert.equal(result[1].text, 'Architecture');
  });

  it('normal: returns empty array when no headings exist', () => {
    const result = extractHeadings(['Body only', 'More body']);
    assert.deepEqual(result, []);
  });

  it('normal: returns empty array for blank lines', () => {
    const result = extractHeadings(['', '  ']);
    assert.deepEqual(result, []);
  });

  it('normal: h1 and h3 are not extracted', () => {
    const result = extractHeadings(['# h1', '## h2', '### h3']);
    assert.equal(result.length, 1);
    assert.equal(result[0].text, 'h2');
  });
});

describe('verify.js — checkCoverage', () => {
  it('normal: all headings are covered by headingRefs', () => {
    const sourceLines = [
      '## Requirements',
      'Content 1',
      '## Architecture',
      'Content 2',
    ];
    const nodes = [
      createCoverageNode('N0001', [{ refId: 'REF001', heading: 2, texts: ['Requirements'] }]),
      createCoverageNode('N0002', [{ refId: 'REF002', heading: 2, texts: ['Architecture'] }]),
    ];
    const result = checkCoverage(sourceLines, nodes);
    assert.equal(result.covered, true);
    assert.deepEqual(result.uncoveredHeadings, []);
  });

  it('error: detects uncovered headings', () => {
    const sourceLines = [
      '## Requirements',
      'Content 1',
      '## Architecture',
      'Content 2',
      '## Security',
      'Content 3',
    ];
    const nodes = [
      createCoverageNode('N0001', [{ refId: 'REF001', heading: 2, texts: ['Requirements'] }]),
      createCoverageNode('N0002', [{ refId: 'REF002', heading: 2, texts: ['Architecture'] }]),
    ];
    const result = checkCoverage(sourceLines, nodes);
    assert.equal(result.covered, false);
    assert.deepEqual(result.uncoveredHeadings, ['Security']);
  });

  it('normal: empty source is considered covered', () => {
    const sourceLines = [];
    const nodes = [];
    const result = checkCoverage(sourceLines, nodes);
    assert.equal(result.covered, true);
    assert.deepEqual(result.uncoveredHeadings, []);
  });

  it('normal: source with no headings is considered covered', () => {
    const sourceLines = ['Line 1', 'Line 2', 'Line 3'];
    const nodes = [];
    const result = checkCoverage(sourceLines, nodes);
    assert.equal(result.covered, true);
    assert.deepEqual(result.uncoveredHeadings, []);
  });

  it('normal: nodes without headingRefs are ignored', () => {
    const sourceLines = ['## Requirements', 'Content'];
    const nodes = [
      { id: 'N0001', title: 'Empty', kind: 'requirement', summary: 'Empty', headingRefs: [] },
    ];
    const result = checkCoverage(sourceLines, nodes);
    assert.equal(result.covered, false);
    assert.deepEqual(result.uncoveredHeadings, ['Requirements']);
  });

  it('normal: partial heading text match is sufficient', () => {
    const sourceLines = ['## Requirements Details', 'Content'];
    const nodes = [
      createCoverageNode('N0001', [{ refId: 'REF001', heading: 2, texts: ['Requirements'] }]),
    ];
    const result = checkCoverage(sourceLines, nodes);
    assert.equal(result.covered, true);
    assert.deepEqual(result.uncoveredHeadings, []);
  });

  it('normal: multiple tokens in texts also match correctly', () => {
    const sourceLines = ['## Error Handling Policy', 'Content'];
    const nodes = [
      createCoverageNode('N0001', [{ refId: 'REF001', heading: 2, texts: ['error_policy', 'Error Handling'] }]),
    ];
    const result = checkCoverage(sourceLines, nodes);
    assert.equal(result.covered, true);
    assert.deepEqual(result.uncoveredHeadings, []);
  });

  it('error: heading level mismatch is not covered', () => {
    const sourceLines = ['## Requirements'];
    const nodes = [
      createCoverageNode('N0001', [{ refId: 'REF001', heading: 3, texts: ['Requirements'] }]),
    ];
    const result = checkCoverage(sourceLines, nodes);
    assert.equal(result.covered, false);
    assert.deepEqual(result.uncoveredHeadings, ['Requirements']);
  });
});

describe('verify.js — checkIsolated', () => {
  it('normal: all nodes connected', () => {
    const nodes = [
      { id: 'N0001' }, { id: 'N0002' }, { id: 'N0003' },
    ];
    const edges = [
      createTestEdge('N0001', 'N0002'),
      createTestEdge('N0002', 'N0003'),
    ];
    const result = checkIsolated(nodes, edges);
    assert.equal(result.connected, true);
    assert.deepEqual(result.isolatedNodes, []);
  });

  it('error: detects isolated nodes', () => {
    const nodes = [
      { id: 'N0001' }, { id: 'N0002' }, { id: 'N0003' },
    ];
    const edges = [
      createTestEdge('N0001', 'N0002'),
    ];
    const result = checkIsolated(nodes, edges);
    assert.equal(result.connected, false);
    assert.deepEqual(result.isolatedNodes, ['N0003']);
  });

  it('boundary: zero edges — all nodes isolated', () => {
    const nodes = [
      { id: 'N0001' }, { id: 'N0002' },
    ];
    const edges = [];
    const result = checkIsolated(nodes, edges);
    assert.equal(result.connected, false);
    assert.deepEqual(result.isolatedNodes, ['N0001', 'N0002']);
  });

  it('boundary: zero nodes', () => {
    const nodes = [];
    const edges = [];
    const result = checkIsolated(nodes, edges);
    assert.equal(result.connected, true);
    assert.deepEqual(result.isolatedNodes, []);
  });

  it('normal: bidirectional edges are detected correctly', () => {
    const nodes = [
      { id: 'N0001' }, { id: 'N0002' },
    ];
    const edges = [
      { from: 'N0001', to: 'N0002', type: 'references', attributes: { strength: 'soft', bidirectional: true } },
    ];
    const result = checkIsolated(nodes, edges);
    assert.equal(result.connected, true);
    assert.deepEqual(result.isolatedNodes, []);
  });
});

describe('verify.js — checkResolvability', () => {
  it('normal: all headingRefs are resolvable', () => {
    const sourceLines = [
      '# Title',
      '## Requirements',
      'Content 1',
      '## Architecture',
      'Content 2',
    ];
    const nodes = [
      { id: 'N0001', headingRefs: [{ refId: 'REF001', heading: 2, texts: ['Requirements'] }] },
      { id: 'N0002', headingRefs: [{ refId: 'REF002', heading: 2, texts: ['Architecture'] }] },
    ];
    const result = checkResolvability(sourceLines, nodes);
    assert.equal(result.resolvable, true);
    assert.deepEqual(result.unresolvableRefs, []);
  });

  it('error: detects unresolvable headingRefs', () => {
    const sourceLines = [
      '## Requirements',
      'Content',
      '## Architecture',
      'Content',
    ];
    const nodes = [
      { id: 'N0001', headingRefs: [{ refId: 'REF001', heading: 2, texts: ['Non-existent Section'] }] },
    ];
    const result = checkResolvability(sourceLines, nodes);
    assert.equal(result.resolvable, false);
    assert.equal(result.unresolvableRefs.length, 1);
    assert.equal(result.unresolvableRefs[0].nodeId, 'N0001');
    assert.equal(result.unresolvableRefs[0].refId, 'REF001');
  });

  it('error: heading level mismatch is unresolvable', () => {
    const sourceLines = [
      '## Requirements',
      'Content',
    ];
    const nodes = [
      { id: 'N0001', headingRefs: [{ refId: 'REF001', heading: 3, texts: ['Requirements'] }] },
    ];
    const result = checkResolvability(sourceLines, nodes);
    assert.equal(result.resolvable, false);
    assert.equal(result.unresolvableRefs.length, 1);
  });

  it('normal: nodes without headingRefs are ignored', () => {
    const sourceLines = ['## Requirements'];
    const nodes = [
      { id: 'N0001', headingRefs: [] },
      { id: 'N0002' },
    ];
    const result = checkResolvability(sourceLines, nodes);
    assert.equal(result.resolvable, true);
    assert.deepEqual(result.unresolvableRefs, []);
  });

  it('normal: reports all unresolvable refs across multiple nodes', () => {
    const sourceLines = ['## Requirements', 'Content'];
    const nodes = [
      { id: 'N0001', headingRefs: [{ refId: 'REF001', heading: 2, texts: ['Requirements'] }] },
      { id: 'N0002', headingRefs: [{ refId: 'REF002', heading: 2, texts: ['Phantom Section'] }] },
      { id: 'N0003', headingRefs: [{ refId: 'REF003', heading: 2, texts: ['Vanished Section'] }] },
    ];
    const result = checkResolvability(sourceLines, nodes);
    assert.equal(result.resolvable, false);
    assert.equal(result.unresolvableRefs.length, 2);
    assert.equal(result.unresolvableRefs[0].nodeId, 'N0002');
    assert.equal(result.unresolvableRefs[1].nodeId, 'N0003');
  });
});

describe('verify.js — exitWithResult', () => {
  it('normal: ok=true produces no stderr output', () => {
    try {
      let stderrOutput = '';
      const originalExit = process.exit;
      process.exit = () => {};
      const originalStdout = console.log;
      console.log = () => {};
      process.stderr.write = (msg) => { stderrOutput += msg; };

      exitWithResult(true, [], []);

      process.exit = originalExit;
      console.log = originalStdout;
      assert.equal(stderrOutput, '');
    } finally {
      // process.exit and console.log are explicitly restored inside try
    }
  });

  it('error: ok=false outputs 3-section template to stderr', () => {
    try {
      let stderrOutput = '';
      const originalExit = process.exit;
      process.exit = () => {};
      const originalStdout = console.log;
      console.log = () => {};
      process.stderr.write = (msg) => { stderrOutput += msg; };

      exitWithResult(false, ['Requirements', 'Architecture'], ['N0003']);

      process.exit = originalExit;
      console.log = originalStdout;
      assert.ok(stderrOutput.includes('[ERROR]'));
      assert.ok(stderrOutput.includes('uncovered'));
      assert.ok(stderrOutput.includes('isolated'));
    } finally {
      // process.exit and console.log are explicitly restored inside try
    }
  });

  it('error: error message with uncovered headings only', () => {
    try {
      let stderrOutput = '';
      const originalExit = process.exit;
      process.exit = () => {};
      const originalStdout = console.log;
      console.log = () => {};
      process.stderr.write = (msg) => { stderrOutput += msg; };

      exitWithResult(false, ['Security'], []);

      process.exit = originalExit;
      console.log = originalStdout;
      assert.ok(stderrOutput.includes('[ERROR]'));
      assert.ok(stderrOutput.includes('uncovered'));
      assert.ok(!stderrOutput.includes('isolated'));
    } finally {
      // process.exit and console.log are explicitly restored inside try
    }
  });

  it('error: error message with isolated nodes only', () => {
    try {
      let stderrOutput = '';
      const originalExit = process.exit;
      process.exit = () => {};
      const originalStdout = console.log;
      console.log = () => {};
      process.stderr.write = (msg) => { stderrOutput += msg; };

      exitWithResult(false, [], ['N0001']);

      process.exit = originalExit;
      console.log = originalStdout;
      assert.ok(stderrOutput.includes('[ERROR]'));
      assert.ok(stderrOutput.includes('isolated'));
      assert.ok(!stderrOutput.includes('uncovered'));
    } finally {
      // process.exit and console.log are explicitly restored inside try
    }
  });

  it('error: error message for unresolvable headingRefs', () => {
    try {
      let stderrOutput = '';
      const originalExit = process.exit;
      process.exit = () => {};
      const originalStdout = console.log;
      console.log = () => {};
      process.stderr.write = (msg) => { stderrOutput += msg; };

      exitWithResult(false, [], [], [
        { nodeId: 'N0001', refId: 'REF001', heading: 2, texts: ['Non-existent'] },
      ]);

      process.exit = originalExit;
      console.log = originalStdout;
      assert.ok(stderrOutput.includes('[ERROR]'));
      assert.ok(stderrOutput.includes('unresolvable'));
      assert.ok(stderrOutput.includes('N0001'));
      assert.ok(stderrOutput.includes('REF001'));
      assert.ok(!stderrOutput.includes('uncovered'));
      assert.ok(!stderrOutput.includes('isolated'));
    } finally {
      // process.exit and console.log are explicitly restored inside try
    }
  });
});
