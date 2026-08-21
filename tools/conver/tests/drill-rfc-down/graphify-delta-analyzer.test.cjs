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
 *
 * @verifies C001  (contradictionCandidates surfaced; never writes to GRAPH)
 * @verifies C003  (duplicate-heading / oversized-section / invalid-slug / low-overlap flags, advisory-only)
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

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
  it('writes graphify-candidates.json (information, not the plan)', () => {
    const graphPath = setupGraph();
    const deltaPath = setupDelta();
    const outPath = path.join(tmpRoot, 'graphify-candidates.json');
    const res = runAnalyzer(deltaPath, graphPath, outPath);
    assert.equal(res.status, 0, res.stderr);
    assert.ok(fs.existsSync(outPath), 'graphify-candidates.json written');
  });

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

describe('validateCandidates (output schema validation)', () => {
  it('accepts valid candidates (newNodes/modifiedNodes/newEdges arrays)', async () => {
    const mod = await import(pathToFileURL(ANALYZER).href);
    const errors = mod.validateCandidates({ newNodes: [], modifiedNodes: [], newEdges: [] });
    assert.deepEqual(errors, []);
  });

  it('rejects a candidate node missing required fields with an English message', async () => {
    const mod = await import(pathToFileURL(ANALYZER).href);
    const errors = mod.validateCandidates({
      newNodes: [{ id: 'N0003' }], modifiedNodes: [], newEdges: [],
    });
    assert.ok(errors.some((e) => /title|kind/i.test(e)), 'English message names the missing field');
  });

  it('rejects an edge missing required fields with an English message', async () => {
    const mod = await import(pathToFileURL(ANALYZER).href);
    const errors = mod.validateCandidates({
      newNodes: [], modifiedNodes: [], newEdges: [{ from: 'N0003' }],
    });
    assert.ok(errors.some((e) => /to|type/i.test(e)), 'English message names the missing edge field');
  });
});

describe('four-axis advisory (PX-166 inspection layer)', () => {
  it('surfaces delta.contradictionCandidates in the contradiction axis (C001)', () => {
    const graphPath = setupGraph();
    const deltaPath = path.join(tmpRoot, 'delta-contra.json');
    writeJson(deltaPath, {
      sourceFile: 'RFC.md', appendOnly: true, sections: [], addedLineCount: 0,
      contradictionCandidates: [{ kind: 'graph', target: 'N0002', context: 'Auth module', matchedBy: ['auth'] }],
    });
    const outPath = path.join(tmpRoot, 'out-contra.json');
    runAnalyzer(deltaPath, graphPath, outPath);
    const out = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.ok(out.advisory.contradiction.some((f) => f.message.includes('N0002')), 'contradiction finding surfaces the target');
  });

  it('flags a duplicate heading in the omission axis (C003)', () => {
    const graphPath = setupGraph();
    const deltaPath = path.join(tmpRoot, 'delta-dup.json');
    writeJson(deltaPath, {
      sourceFile: 'RFC.md', appendOnly: true,
      sections: [
        { heading: '## Auth', startLine: 1, lines: ['## Auth', ''] },
        { heading: '## Auth', startLine: 5, lines: ['## Auth', ''] },
      ],
      addedLineCount: 4, contradictionCandidates: [],
    });
    const outPath = path.join(tmpRoot, 'out-dup.json');
    runAnalyzer(deltaPath, graphPath, outPath);
    const out = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.ok(out.advisory.omission.some((f) => /duplicate heading/i.test(f.message)), 'duplicate heading flagged');
  });

  it('flags an oversized section and an over-long slug in the deficiency axis (C003)', () => {
    const graphPath = setupGraph();
    const deltaPath = path.join(tmpRoot, 'delta-big.json');
    writeJson(deltaPath, {
      sourceFile: 'RFC.md', appendOnly: true,
      sections: [
        { heading: '## Long', startLine: 1, lines: ['## Long', ...Array(105).fill('x')] },
        { heading: '## This is an extremely long section title that when slugified exceeds the maximum length limit', startLine: 120, lines: ['## This is an extremely long section title that when slugified exceeds the maximum length limit', ''] },
      ],
      addedLineCount: 106, contradictionCandidates: [],
    });
    const outPath = path.join(tmpRoot, 'out-big.json');
    runAnalyzer(deltaPath, graphPath, outPath);
    const out = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.ok(out.advisory.deficiency.some((f) => /100|long|oversized/i.test(f.message)), 'oversized section flagged');
    assert.ok(out.advisory.deficiency.some((f) => /slug.*invalid|length/i.test(f.message)), 'over-long slug flagged');
  });

  it('flags a low-overlap modify candidate in the omission axis (C002)', () => {
    const graphPath = setupGraph();
    const deltaPath = path.join(tmpRoot, 'delta-low.json');
    writeJson(deltaPath, {
      sourceFile: 'RFC.md', appendOnly: true,
      sections: [{ heading: '## Module extension', startLine: 1, lines: ['## Module extension', ''] }],
      addedLineCount: 2, contradictionCandidates: [],
    });
    const outPath = path.join(tmpRoot, 'out-low.json');
    runAnalyzer(deltaPath, graphPath, outPath);
    const out = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.ok(out.advisory.omission.some((f) => /low|overlap|only 1/i.test(f.message)), 'low-overlap modify candidate flagged');
  });
});
