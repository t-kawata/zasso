/**
 * phasify-e2e.test.cjs — End-to-end tests (write path, cycle detection, --dry-run)
 *
 * Verifies phasify script behavior with actual file I/O.
 * Creates test temporary directories and cleans up afterward.
 *
 * Test framework: Node.js built-in node:test + node:assert/strict
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const PHASIFY_SCRIPT = path.resolve(__dirname, '../../.claude/scripts/rfc-graph/phasify-graph-and-dirs-files-tree.js');

// ============================================================
// Helper: Generate test graph data
// ============================================================

function makeSimpleGraph() {
  return {
    mainLanguage: 'rust',
    sourceFile: 'test.md',
    nodes: Array.from({ length: 30 }, (_, i) => ({
      id: 'N' + String(i + 1).padStart(4, '0'),
      kind: 'api_contract',
      language: 'rust',
      slug: 'test_' + (i + 1),
      title: 'Test Node ' + (i + 1),
      summary: 'Summary ' + (i + 1),
    })),
    edges: [
      { from: 'N0001', to: 'N0025', type: 'depends_on' },
      { from: 'N0002', to: 'N0005', type: 'depends_on' },
    ],
  };
}

function makeCyclicGraph() {
  const graph = makeSimpleGraph();
  // N0001→N0025 + N0025→N0001 = cycle
  graph.edges.push(
    { from: 'N0025', to: 'N0001', type: 'depends_on' },
  );
  return graph;
}

function makeSimpleDirsTree() {
  return {
    schemaVersion: '1.0',
    generatedAt: '2026-07-10',
    sourceGraph: 'test-GRAPH.json',
    sourceFile: 'test.md',
    analysis: {
      nodeCount: 30,
      kindCounts: { api_contract: 30 },
      edgeTypeCounts: { depends_on: 3 },
    },
    trees: {
      rust: { name: 'src', type: 'directory', children: [] },
    },
    dependencyDirections: {},
    warnings: [],
  };
}

// ============================================================
// E2E Tests
// ============================================================

describe('phasify E2E (write path, cycle detection, dry-run)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phasify-e2e-'));
  const graphPath = path.join(tmpDir, 'test-GRAPH.json');
  const dirsTreePath = path.join(tmpDir, 'test-Dirs-Tree.json');
  const ticketsPath = path.join(tmpDir, 'Tickets.json');

  before(() => {
    // Prepare write-tickets-json-template.js for testing
    // Uses the actual script as-is
  });

  after(() => {
    // Cleanup
    try {
      const files = fs.readdirSync(tmpDir);
      for (const f of files) {
        const fp = path.join(tmpDir, f);
        fs.rmSync(fp, { force: true });
      }
      fs.rmdirSync(tmpDir);
    } catch {
      // cleanup errors are non-fatal
    }
  });

  // ----------------------------------------------------------
  // --dry-run mode
  // ----------------------------------------------------------
  describe('--dry-run mode', () => {
    before(() => {
      fs.writeFileSync(graphPath, JSON.stringify(makeSimpleGraph()));
      fs.writeFileSync(dirsTreePath, JSON.stringify(makeSimpleDirsTree()));
      // Do not create Tickets.json (testing its absence)
    });

    it('should not create Tickets.json in dry-run mode', () => {
      const result = spawnSync('node', [
        PHASIFY_SCRIPT,
        graphPath,
        dirsTreePath,
        '--dry-run',
      ], { encoding: 'utf8' });

      assert.strictEqual(result.status, 0, 'exit code should be 0. stderr: ' + result.stderr);
      assert.ok(!fs.existsSync(ticketsPath), 'Tickets.json should NOT be created in --dry-run');
    });

    it('should validate in-memory in dry-run mode', () => {
      const result = spawnSync('node', [
        PHASIFY_SCRIPT,
        graphPath,
        dirsTreePath,
        '--dry-run',
        '--verbose',
      ], { encoding: 'utf8' });

      // Validation runs in-memory (does not read Tickets.json from disk)
      // Regardless of pass/fail, no "file read error" should occur
      assert.ok(!result.stdout.includes('read error'),
        'dry-run produced file read error: ' + result.stdout.substring(result.stdout.length - 300));
    });
  });

  // ----------------------------------------------------------
  // Write path (normal)
  // ----------------------------------------------------------
  describe('write path (normal)', () => {
    before(() => {
      fs.writeFileSync(graphPath, JSON.stringify(makeSimpleGraph()));
      fs.writeFileSync(dirsTreePath, JSON.stringify(makeSimpleDirsTree()));
      // Tickets.json absent -> auto-generated
    });

    it('should create Tickets.json and write phases', () => {
      // Verify the file does not exist beforehand
      if (fs.existsSync(ticketsPath)) {
        fs.rmSync(ticketsPath);
      }

      const result = spawnSync('node', [
        PHASIFY_SCRIPT,
        graphPath,
        dirsTreePath,
      ], { encoding: 'utf8', timeout: 10000 });

      assert.strictEqual(result.status, 0, 'exit code 0 expected. stderr: ' + result.stderr);

      // Verify Tickets.json was created
      assert.ok(fs.existsSync(ticketsPath), 'Tickets.json should be created');

      const tickets = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
      assert.ok(tickets.phases, 'phases should exist');
      assert.ok(tickets.phases.length >= 2, '30 nodes / 10 = 3 phases');
    });

    it('should cover all nodes in phases', () => {
      const tickets = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
      const coveredIds = new Set();
      for (const phase of tickets.phases) {
        if (phase.nodeIds) {
          for (const nid of phase.nodeIds) {
            coveredIds.add(nid);
          }
        }
      }
      assert.strictEqual(coveredIds.size, 30, 'all 30 nodes should be covered');
    });

    it('should have nodeIds in phase objects', () => {
      const tickets = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
      for (const phase of tickets.phases) {
        assert.ok(Array.isArray(phase.nodeIds), 'phase ' + phase.id + ' should have nodeIds array');
      }
    });

    it('should overwrite existing Tickets.json', () => {
      // Verify overwrite on second execution
      const result = spawnSync('node', [
        PHASIFY_SCRIPT,
        graphPath,
        dirsTreePath,
      ], { encoding: 'utf8', timeout: 10000 });

      assert.strictEqual(result.status, 0);
      assert.ok(fs.existsSync(ticketsPath));
      const tickets = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
      assert.ok(tickets.phases.length >= 2);
    });
  });

  // ----------------------------------------------------------
  // Cycle detection
  // ----------------------------------------------------------
  describe('cycle detection', () => {
    it('should exit with code 1 on cyclic graph', () => {
      const cyclicGraphPath = path.join(tmpDir, 'cyclic-GRAPH.json');
      fs.writeFileSync(cyclicGraphPath, JSON.stringify(makeCyclicGraph()));

      const result = spawnSync('node', [
        PHASIFY_SCRIPT,
        cyclicGraphPath,
        dirsTreePath,
        '--dry-run',
      ], { encoding: 'utf8', timeout: 10000 });

      assert.strictEqual(result.status, 1, 'should exit with code 1 on cycle');
    });

    it('should output cycle error message', () => {
      const cyclicGraphPath = path.join(tmpDir, 'cyclic2-GRAPH.json');
      fs.writeFileSync(cyclicGraphPath, JSON.stringify(makeCyclicGraph()));

      const result = spawnSync('node', [
        PHASIFY_SCRIPT,
        cyclicGraphPath,
        dirsTreePath,
        '--dry-run',
      ], { encoding: 'utf8', timeout: 10000 });

      assert.ok(result.stderr.includes('Circular') || result.stderr.includes('ERROR'),
        'should mention cycle in output: ' + result.stderr + result.stdout);
    });
  });

  // ----------------------------------------------------------
  // Missing Dirs-Tree.json
  // ----------------------------------------------------------
  describe('missing Dirs-Tree.json', () => {
    it('should exit with code 3 when Dirs-Tree.json missing (same dir)', () => {
      const missingDirsPath = path.join(tmpDir, 'nonexistent-Dirs-Tree.json');
      const result = spawnSync('node', [
        PHASIFY_SCRIPT,
        graphPath,
        missingDirsPath,
        '--dry-run',
      ], { encoding: 'utf8', timeout: 10000 });

      assert.strictEqual(result.status, 3, 'should exit with code 3 (Dirs-Tree missing)');
    });
  });

  // ----------------------------------------------------------
  // Missing arguments
  // ----------------------------------------------------------
  describe('missing arguments', () => {
    it('should exit with code 2 when no arguments', () => {
      const result = spawnSync('node', [
        PHASIFY_SCRIPT,
      ], { encoding: 'utf8', timeout: 10000 });

      assert.strictEqual(result.status, 2, 'should exit with code 2');
    });

    it('should exit with code 2 when only one argument', () => {
      const result = spawnSync('node', [
        PHASIFY_SCRIPT,
        graphPath,
      ], { encoding: 'utf8', timeout: 10000 });

      assert.strictEqual(result.status, 2, 'should exit with code 2 for 1 arg');
    });
  });
});
