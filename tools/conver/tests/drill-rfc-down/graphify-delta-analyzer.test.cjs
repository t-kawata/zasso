/**
 * graphify-delta-analyzer.test.cjs — Tests for the Step 2 graph-delta analyzer (PX-160)
 *
 * Covers contracts C001/C002 of the graphify delta pipeline:
 *   - Reads delta.json + existing GRAPH and proposes new-node / modify-node /
 *     new-edge candidates deterministically (C001)
 *   - Generates graph-delta.json with a validated schema, never writing to the
 *     GRAPH itself (C002)
 *
 * RED at make time: graphify-delta-analyzer.js does not exist yet.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ANALYZER = path.resolve(__dirname, '../../.claude/scripts/drill-rfc-down/graphify-delta-analyzer.js');

let tmpRoot;

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'graphify-analyzer-'));
});

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  return filePath;
}

/** Build a small deterministic GRAPH fixture. */
function setupGraph() {
  const graphPath = path.join(tmpRoot, 'graph.json');
  writeJson(graphPath, {
    sourceFile: 'RFC.md',
    nodes: [
      { id: 'N0001', title: 'Purpose of the system', summary: 'Purpose', slug: 'purpose', kind: 'purpose', headingRefs: ['# Purpose'], language: 'en' },
      { id: 'N0002', title: 'Auth module', summary: 'Authentication', slug: 'auth', kind: 'design', headingRefs: ['# Auth'], language: 'en' },
    ],
    edges: [],
  });
  return graphPath;
}

/** Build a delta.json fixture with one new, one modifying, and one referencing section. */
function setupDelta() {
  const deltaPath = path.join(tmpRoot, 'delta.json');
  writeJson(deltaPath, {
    sourceFile: 'RFC.md',
    generatedAt: '2026-08-20T00:00:00.000Z',
    appendOnly: true,
    sections: [
      { heading: '## 62. Totally New Capability', startLine: 100, lines: ['## 62. Totally New Capability', '', 'Body.'] },
      { heading: '## 65. Purpose extension', startLine: 110, lines: ['## 65. Purpose extension', '', 'Extends purpose.'] },
      { heading: '## 64. Session storage design', startLine: 120, lines: ['## 64. Session storage design', '', 'Uses the auth module for tokens.'] },
    ],
    addedLineCount: 9,
    contradictionCandidates: [],
  });
  return deltaPath;
}

function runAnalyzer(deltaPath, graphPath, outPath) {
  return spawnSync(process.execPath, [ANALYZER, `--delta=${deltaPath}`, `--graph=${graphPath}`, `--out=${outPath}`], { encoding: 'utf8' });
}

describe('graphify-delta-analyzer.js', () => {
  it('proposes new-node / modify-node / new-edge candidates and writes graph-delta.json', () => {
    const graphPath = setupGraph();
    const deltaPath = setupDelta();
    const outPath = path.join(tmpRoot, 'graph-delta.json');
    const res = runAnalyzer(deltaPath, graphPath, outPath);
    assert.equal(res.status, 0, res.stderr);
    const out = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.ok(Array.isArray(out.newNodes), 'newNodes is an array');
    assert.ok(Array.isArray(out.modifiedNodes), 'modifiedNodes is an array');
    assert.ok(Array.isArray(out.newEdges), 'newEdges is an array');
  });

  it('a section with no overlap becomes a new node with a valid id/title/kind', () => {
    const graphPath = setupGraph();
    const deltaPath = setupDelta();
    const outPath = path.join(tmpRoot, 'gd-new.json');
    runAnalyzer(deltaPath, graphPath, outPath);
    const out = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    const newNode = out.newNodes.find((n) => n.title.includes('Totally New Capability'));
    assert.ok(newNode, 'new node proposed for the non-overlapping section');
    assert.match(newNode.id, /^N\d+$/, 'new node id follows the N<number> scheme');
    assert.ok(newNode.title && newNode.kind, 'new node has title and kind');
  });

  it('a section overlapping an existing node becomes a modify candidate', () => {
    const graphPath = setupGraph();
    const deltaPath = setupDelta();
    const outPath = path.join(tmpRoot, 'gd-modify.json');
    runAnalyzer(deltaPath, graphPath, outPath);
    const out = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    const modify = out.modifiedNodes.find((m) => m.id === 'N0001' || String(m.id).includes('N0001'));
    assert.ok(modify, 'existing node N0001 proposed as a modify candidate for the purpose overlap');
  });

  it('a new section whose body references an existing node produces an edge candidate', () => {
    const graphPath = setupGraph();
    const deltaPath = setupDelta();
    const outPath = path.join(tmpRoot, 'gd-edge.json');
    runAnalyzer(deltaPath, graphPath, outPath);
    const out = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    const edge = out.newEdges.find((e) => e.to === 'N0002');
    assert.ok(edge, 'edge candidate to the referenced auth node (N0002) proposed');
    assert.ok(edge.from && edge.type, 'edge has from and type');
  });

  it('fails with a clear message on malformed delta.json', () => {
    const graphPath = setupGraph();
    const badDelta = path.join(tmpRoot, 'bad-delta.json');
    fs.writeFileSync(badDelta, 'not json');
    const outPath = path.join(tmpRoot, 'gd-bad.json');
    const res = runAnalyzer(badDelta, graphPath, outPath);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /delta|invalid/i);
  });

  it('never writes to *-GRAPH.json (C001 invariant)', () => {
    const graphPath = setupGraph();
    const deltaPath = setupDelta();
    const before = fs.readFileSync(graphPath, 'utf8');
    const outPath = path.join(tmpRoot, 'gd-no-write.json');
    const res = runAnalyzer(deltaPath, graphPath, outPath);
    assert.equal(res.status, 0);
    assert.equal(fs.readFileSync(graphPath, 'utf8'), before, 'GRAPH byte-identical after analysis');
  });

  it('is deterministic (same inputs -> same output, C002 invariant)', () => {
    const graphPath = setupGraph();
    const deltaPath = setupDelta();
    const out1 = path.join(tmpRoot, 'gd-det1.json');
    const out2 = path.join(tmpRoot, 'gd-det2.json');
    runAnalyzer(deltaPath, graphPath, out1);
    runAnalyzer(deltaPath, graphPath, out2);
    assert.equal(fs.readFileSync(out1, 'utf8'), fs.readFileSync(out2, 'utf8'), 'identical output for identical inputs');
  });
});
