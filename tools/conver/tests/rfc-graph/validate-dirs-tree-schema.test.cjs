/**
 * validate-dirs-tree-schema.test.cjs — Unit tests for validate-dirs-tree-schema.js
 *
 * Test framework: Node.js standard node:test + node:assert/strict
 * Tests the validateFiles() function by passing in-memory data directly.
 * validate() (CLI+I/O integration) is tested with minimal file I/O.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { validate, validateFiles } = require('../../.claude/scripts/rfc-graph/validate-dirs-tree-schema.js');

// ============================================================
// Test Data (factory functions)
// ============================================================

/** Create a valid Dirs-Tree.json that passes validation */
function createValidDirsTree(overrides = {}) {
  return {
    schemaVersion: '1.0',
    generatedAt: '2026-07-07T00:00:00.000Z',
    sourceGraph: 'test-graph',
    analysis: {
      nodeCount: 5,
      kindCounts: { config: 2, data_model: 3 },
      edgeTypeCounts: { depends_on: 4 },
    },
    trees: {
      rust: {
        name: 'rust',
        type: 'directory',
        kind: 'architecture',
        children: [
          {
            name: 'config',
            type: 'directory',
            kind: 'config',
            children: [
              { name: 'settings.rs', type: 'file', kind: 'config', mappedNodeIds: ['N0001'] },
            ],
          },
          {
            name: 'models',
            type: 'directory',
            kind: 'data_model',
            children: [
              { name: 'user.rs', type: 'file', kind: 'data_model', mappedNodeIds: ['N0002'] },
            ],
          },
        ],
      },
      go: {
        name: 'go',
        type: 'directory',
        kind: 'architecture',
        children: [
          { name: 'main.go', type: 'file', kind: 'config', mappedNodeIds: ['N0003'] },
        ],
      },
      typescript: {
        name: 'typescript',
        type: 'directory',
        kind: 'architecture',
        children: [
          { name: 'index.ts', type: 'file', kind: 'config', mappedNodeIds: ['N0004'] },
        ],
      },
    },
    dependencyDirections: {
      rust: [
        { from: 'rust/config', to: 'rust/models', rule: 'depends_on' },
      ],
      go: [],
      typescript: [],
    },
    warnings: [],
    ...overrides,
  };
}

/** Create a valid graph for validation */
function createValidGraph() {
  return {
    nodes: [
      { id: 'N0001', title: 'settings', kind: 'config' },
      { id: 'N0002', title: 'user', kind: 'data_model' },
      { id: 'N0003', title: 'main', kind: 'config' },
      { id: 'N0004', title: 'index', kind: 'config' },
      { id: 'N0005', title: 'orphan', kind: 'api_contract' },
    ],
    edges: [
      { from: 'N0001', to: 'N0002', type: 'depends_on' },
    ],
  };
}

/** Write test files to a temporary directory and return paths */
function writeTempFiles(dirsTree, graph) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vds-test-'));
  const dirsTreePath = path.join(tmpDir, 'Dirs-Tree.json');
  const graphPath = path.join(tmpDir, 'graph.json');
  fs.writeFileSync(dirsTreePath, JSON.stringify(dirsTree, null, 2));
  fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2));
  return { tmpDir, dirsTreePath, graphPath };
}

// ============================================================
// validateFiles — Happy Path
// ============================================================

describe('validateFiles — Happy Path', () => {
  it('should return {ok: true} for a valid Dirs-Tree.json', () => {
    const dirsTree = createValidDirsTree();
    const graph = createValidGraph();
    const graphPath = '/tmp/test-graph.json';
    const dirsTreePath = '/tmp/test-dirs-tree.json';

    // validateFiles reads the filesystem, so write files first
    const { tmpDir, dirsTreePath: dtPath, graphPath: gPath } = writeTempFiles(dirsTree, graph);
    try {
      const result = validateFiles(dtPath, gPath);
      assert.strictEqual(result.ok, true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ============================================================
// validateFiles — Error Path: Arguments/Files
// ============================================================

describe('validateFiles — File I/O', () => {
  it('should return error when dirs-tree file does not exist', () => {
    const result = validateFiles('/tmp/non-existent-dirs-tree.json', '/tmp/test-graph.json');
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors[0].includes('not found'));
  });

  it('should return error when graph file does not exist', () => {
    const dirsTree = createValidDirsTree();
    const { tmpDir, dirsTreePath } = writeTempFiles(dirsTree, createValidGraph());
    try {
      const result = validateFiles(dirsTreePath, '/tmp/non-existent-graph.json');
      assert.strictEqual(result.ok, false);
      assert.ok(result.errors[0].includes('not found'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should return error when dirs-tree JSON is malformed', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vds-test-'));
    const badPath = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(badPath, '{invalid json');
    try {
      const result = validateFiles(badPath, badPath);
      assert.strictEqual(result.ok, false);
      assert.ok(result.errors[0].includes('parse error'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ============================================================
// validateFiles — Error Path: Validation Logic
// ============================================================

describe('validateFiles — Required Fields', () => {
  it('should detect missing schemaVersion', () => {
    const dirsTree = createValidDirsTree({ schemaVersion: undefined });
    const graph = createValidGraph();
    const { tmpDir, dirsTreePath, graphPath } = writeTempFiles(dirsTree, graph);
    try {
      const result = validateFiles(dirsTreePath, graphPath);
      assert.strictEqual(result.ok, false);
      assert.ok(result.errors.some(e => e.includes('schemaVersion')));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should detect missing trees', () => {
    const dirsTree = createValidDirsTree({ trees: undefined });
    const graph = createValidGraph();
    const { tmpDir, dirsTreePath, graphPath } = writeTempFiles(dirsTree, graph);
    try {
      const result = validateFiles(dirsTreePath, graphPath);
      assert.strictEqual(result.ok, false);
      assert.ok(result.errors.some(e => e.includes('trees')));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should detect missing dependencyDirections', () => {
    const dirsTree = createValidDirsTree({ dependencyDirections: undefined });
    const graph = createValidGraph();
    const { tmpDir, dirsTreePath, graphPath } = writeTempFiles(dirsTree, graph);
    try {
      const result = validateFiles(dirsTreePath, graphPath);
      assert.strictEqual(result.ok, false);
      assert.ok(result.errors.some(e => e.includes('dependencyDirections')));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('validateFiles — mappedNodeIds', () => {
  it('should detect non-existent nodeId', () => {
    const dirsTree = createValidDirsTree();
    // Change trees.rust.config.settings.mappedNodeIds[0] to a non-existent ID
    dirsTree.trees.rust.children[0].children[0].mappedNodeIds = ['N9999'];
    const graph = createValidGraph();
    const { tmpDir, dirsTreePath, graphPath } = writeTempFiles(dirsTree, graph);
    try {
      const result = validateFiles(dirsTreePath, graphPath);
      assert.strictEqual(result.ok, false);
      assert.ok(result.errors.some(e => e.includes('N9999')));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should not error when mappedNodeIds is absent', () => {
    const dirsTree = createValidDirsTree();
    // Remove mappedNodeIds from trees.rust.config.settings
    delete dirsTree.trees.rust.children[0].children[0].mappedNodeIds;
    const graph = createValidGraph();
    const { tmpDir, dirsTreePath, graphPath } = writeTempFiles(dirsTree, graph);
    try {
      const result = validateFiles(dirsTreePath, graphPath);
      // mappedNodeIds is optional; skip when absent, ok if no other errors
      assert.strictEqual(result.ok, true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('validateFiles — Nesting Depth', () => {
  it('should detect depth exceeding 4', () => {
    const dirsTree = createValidDirsTree();
    // Create depth-5 structure (rust → config → deep → deeper → deepest → ultimate.rs: depth 5)
    dirsTree.trees.rust.children[0].children.push({
      name: 'deep',
      type: 'directory',
      children: [{
        name: 'deeper',
        type: 'directory',
        children: [{
          name: 'deepest',
          type: 'directory',
          children: [{
            name: 'ultimate.rs',
            type: 'file',
          }],
        }],
      }],
    });
    const graph = createValidGraph();
    const { tmpDir, dirsTreePath, graphPath } = writeTempFiles(dirsTree, graph);
    try {
      const result = validateFiles(dirsTreePath, graphPath);
      assert.strictEqual(result.ok, false);
      assert.ok(result.errors.some(e => e.includes('Nesting depth limit')));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should accept depth exactly 4 (boundary)', () => {
    const dirsTree = createValidDirsTree();
    // Create depth-4 structure (rust/config/settings with children → depth 4)
    // rust(0) → config(1) → settings(2) → deep(3) → deeper.rs(4)
    const leafDir = { name: 'deep', type: 'directory', children: [
      { name: 'deeper', type: 'directory', children: [
        { name: 'deepest.rs', type: 'file' },
      ]},
    ]};
    dirsTree.trees.rust.children[0].children.push(leafDir);
    const graph = createValidGraph();
    const { tmpDir, dirsTreePath, graphPath } = writeTempFiles(dirsTree, graph);
    try {
      const result = validateFiles(dirsTreePath, graphPath);
      assert.strictEqual(result.ok, true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('validateFiles — File Naming Conventions', () => {
  it('should detect .go file in rust tree', () => {
    const dirsTree = createValidDirsTree();
    dirsTree.trees.rust.children[0].children.push(
      { name: 'wrong.go', type: 'file' }
    );
    const graph = createValidGraph();
    const { tmpDir, dirsTreePath, graphPath } = writeTempFiles(dirsTree, graph);
    try {
      const result = validateFiles(dirsTreePath, graphPath);
      assert.strictEqual(result.ok, false);
      assert.ok(result.errors.some(e => e.includes('.rs')));
      assert.ok(result.errors.some(e => e.includes('wrong.go')));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should detect .ts file in go tree', () => {
    const dirsTree = createValidDirsTree();
    dirsTree.trees.go.children.push(
      { name: 'wrong.ts', type: 'file' }
    );
    const graph = createValidGraph();
    const { tmpDir, dirsTreePath, graphPath } = writeTempFiles(dirsTree, graph);
    try {
      const result = validateFiles(dirsTreePath, graphPath);
      assert.strictEqual(result.ok, false);
      assert.ok(result.errors.some(e => e.includes('.go')));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should detect .rs file in typescript tree', () => {
    const dirsTree = createValidDirsTree();
    dirsTree.trees.typescript.children.push(
      { name: 'wrong.rs', type: 'file' }
    );
    const graph = createValidGraph();
    const { tmpDir, dirsTreePath, graphPath } = writeTempFiles(dirsTree, graph);
    try {
      const result = validateFiles(dirsTreePath, graphPath);
      assert.strictEqual(result.ok, false);
      assert.ok(result.errors.some(e => e.includes('.ts')));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should not check extensions for directory nodes', () => {
    const dirsTree = createValidDirsTree();
    // Add a directory node (no extension check for directories)
    dirsTree.trees.rust.children.push(
      { name: 'custom-dir', type: 'directory' }
    );
    const graph = createValidGraph();
    const { tmpDir, dirsTreePath, graphPath } = writeTempFiles(dirsTree, graph);
    try {
      const result = validateFiles(dirsTreePath, graphPath);
      assert.strictEqual(result.ok, true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('validateFiles — dependencyDirections', () => {
  it('should detect non-existent from path', () => {
    const dirsTree = createValidDirsTree();
    dirsTree.dependencyDirections.rust.push(
      { from: 'rust/non-existent', to: 'rust/models', rule: 'depends_on' }
    );
    const graph = createValidGraph();
    const { tmpDir, dirsTreePath, graphPath } = writeTempFiles(dirsTree, graph);
    try {
      const result = validateFiles(dirsTreePath, graphPath);
      assert.strictEqual(result.ok, false);
      assert.ok(result.errors.some(e => e.includes('from')));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should detect non-existent to path', () => {
    const dirsTree = createValidDirsTree();
    dirsTree.dependencyDirections.rust.push(
      { from: 'rust/config', to: 'rust/non-existent', rule: 'depends_on' }
    );
    const graph = createValidGraph();
    const { tmpDir, dirsTreePath, graphPath } = writeTempFiles(dirsTree, graph);
    try {
      const result = validateFiles(dirsTreePath, graphPath);
      assert.strictEqual(result.ok, false);
      assert.ok(result.errors.some(e => e.includes('to')));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('validateFiles — Path Duplicates', () => {
  it('should detect duplicate sibling names', () => {
    const dirsTree = createValidDirsTree();
    // Add a file with the same name under config
    dirsTree.trees.rust.children[0].children.push(
      { name: 'settings.rs', type: 'file', kind: 'config' }
    );
    const graph = createValidGraph();
    const { tmpDir, dirsTreePath, graphPath } = writeTempFiles(dirsTree, graph);
    try {
      const result = validateFiles(dirsTreePath, graphPath);
      assert.strictEqual(result.ok, false);
      assert.ok(result.errors.some(e => e.includes('Path duplication')));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('validateFiles — Composite Errors', () => {
  it('should collect multiple errors simultaneously', () => {
    const dirsTree = createValidDirsTree({
      schemaVersion: undefined,
      dependencyDirections: undefined,
    });
    // Also add an extension mismatch error
    dirsTree.trees.rust.children[0].children.push(
      { name: 'bad.go', type: 'file' }
    );
    const graph = createValidGraph();
    const { tmpDir, dirsTreePath, graphPath } = writeTempFiles(dirsTree, graph);
    try {
      const result = validateFiles(dirsTreePath, graphPath);
      assert.strictEqual(result.ok, false);
      // Verify that 3+ errors are collected simultaneously
      assert.ok(result.errors.length >= 3);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ============================================================
// validate() — CLI Entry Point Tests (minimal)
// ============================================================

describe('validate() — CLI Entry Point', () => {
  // Flag for stubbing process.exit
  let originalExit;

  before(() => {
    originalExit = process.exit;
  });

  after(() => {
    process.exit = originalExit;
  });

  it('should exit with code 1 when arguments are missing', () => {
    let exitCode = null;
    process.exit = (code) => { exitCode = code; throw new Error(`exit ${code}`); };

    assert.throws(() => {
      validate(['--dirs-tree=/tmp/test.json']);
    }, /exit 1/);
    assert.strictEqual(exitCode, 1);
  });

  it('should exit with code 1 when file does not exist', () => {
    let exitCode = null;
    process.exit = (code) => { exitCode = code; throw new Error(`exit ${code}`); };

    assert.throws(() => {
      validate([
        '--dirs-tree=/tmp/non-existent-dirs-tree.json',
        '--graph=/tmp/non-existent-graph.json',
      ]);
    }, /exit 1/);
    assert.strictEqual(exitCode, 1);
  });

  it('should return ok:true for valid files', () => {
    const dirsTree = createValidDirsTree();
    const graph = createValidGraph();
    const { tmpDir, dirsTreePath, graphPath } = writeTempFiles(dirsTree, graph);
    let exitCode = null;
    process.exit = (code) => { exitCode = code; };

    // Capture stdout
    const originalStdout = process.stdout.write;
    let capturedStdout = '';
    process.stdout.write = (chunk) => { capturedStdout += chunk; return true; };

    try {
      validate([`--dirs-tree=${dirsTreePath}`, `--graph=${graphPath}`]);
      assert.strictEqual(exitCode, null); // process.exit should not be called
      const parsed = JSON.parse(capturedStdout);
      assert.strictEqual(parsed.ok, true);
    } finally {
      process.stdout.write = originalStdout;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
