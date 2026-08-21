/**
 * graphify-step.test.cjs — Tests for the Step 2 graphify step driver (PX-163)
 *
 * Covers the AI-as-engineer staging flow:
 *   - --stage copies the real GRAPH to a staging path and shows candidates;
 *     the real GRAPH is untouched
 *   - the AI designs the evolution by editing the STAGING graph via crud.js
 *     (no hand-edited JSON, no driver re-running the analyzer on --approve)
 *   - --approve validates the staging graph with verify.js and promotes it
 *   - --reject leaves the real GRAPH byte-identical (perfect-before-write gate)
 *
 * RED at make time: graphify-step.js still auto-applies the analyzer output.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const STEP_DRIVER = path.resolve(__dirname, '../../.claude/scripts/drill-rfc-down/graphify-step.js');
const CRUD = path.resolve(__dirname, '../../.claude/scripts/rfc-graph/crud.js');
const VERIFY = path.resolve(__dirname, '../../.claude/scripts/rfc-graph/verify.js');

let tmpRoot;

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'graphify-step-'));
});

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/** Build a valid project: RFC source + GRAPH + delta. */
function setupProject() {
  const rfcPath = path.join(tmpRoot, 'RFC.md');
  fs.writeFileSync(rfcPath, '# Purpose\n\n## Auth\n\n## Totally New Capability\n', 'utf8');

  const graphPath = path.join(tmpRoot, 'RFC-GRAPH.json');
  writeJson(graphPath, {
    sourceFile: 'RFC.md',
    mainLanguage: 'rust',
    nodes: [
      { id: 'N0001', title: 'Purpose', summary: 'Purpose', slug: 'purpose', kind: 'architecture', headingRefs: [{ refId: 'REF001', heading: 1, texts: ['Purpose'] }], language: 'rust' },
      { id: 'N0002', title: 'Auth module', summary: 'Auth', slug: 'auth', kind: 'api_contract', headingRefs: [{ refId: 'REF002', heading: 2, texts: ['Auth'] }], language: 'rust' },
    ],
    edges: [
      { from: 'N0001', to: 'N0002', type: 'references', attributes: { strength: 'soft', bidirectional: false }, contracts: [{ id: 'C001', precondition: 'N0001 exists', postcondition: 'edge connects N0002', invariant: 'node ids are valid' }] },
    ],
  });

  const deltaPath = path.join(tmpRoot, 'delta.json');
  writeJson(deltaPath, {
    sourceFile: 'RFC.md',
    generatedAt: '2026-08-21T00:00:00.000Z',
    appendOnly: true,
    sections: [
      { heading: '## Totally New Capability', startLine: 4, lines: ['## Totally New Capability', '', 'Uses the auth module.'] },
    ],
    addedLineCount: 4,
    contradictionCandidates: [],
  });

  return { rfcPath, graphPath, deltaPath };
}

/** The staging path the step driver derives from the real GRAPH path. */
function stagingPathOf(graphPath) {
  return `${graphPath}.staging.json`;
}

/** The candidates path written by --stage (removed after the design is committed). */
function candidatesPathOf(graphPath) {
  return `${graphPath}.candidates.json`;
}

/** The pipeline handoff path the step driver derives from the real GRAPH path. */
function deltaPathOf(graphPath) {
  return `${graphPath}.delta.json`;
}

function runStep(args, graphPath) {
  return spawnSync(process.execPath, [STEP_DRIVER, `--graph=${graphPath}`, ...args], { encoding: 'utf8' });
}

describe('graphify-step.js (AI-as-engineer staging flow)', () => {
  it('--stage copies the real GRAPH to a staging path and shows candidates; real GRAPH unchanged', () => {
    const { rfcPath, graphPath, deltaPath } = setupProject();
    const before = fs.readFileSync(graphPath, 'utf8');
    const res = runStep([`--source=${rfcPath}`, `--delta=${deltaPath}`, '--stage'], graphPath);
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /new node|newNodes|Totally New Capability/i, 'report shows the candidate');
    assert.match(res.stdout, /Advisory Report|Danger|Omission|Contradiction|Deficiency/i, 'report shows the four-axis advisory (PX-166)');
    assert.ok(fs.existsSync(stagingPathOf(graphPath)), 'staging copy created');
    assert.equal(fs.readFileSync(graphPath, 'utf8'), before, 'real GRAPH unchanged on stage');
  });

  it('the AI designs the evolution by editing the staging graph via crud.js; --approve promotes on verify pass', () => {
    const { rfcPath, graphPath, deltaPath } = setupProject();
    runStep([`--source=${rfcPath}`, `--delta=${deltaPath}`, '--stage'], graphPath);
    const staging = stagingPathOf(graphPath);

    // The AI designs the graph by editing the STAGING copy via crud.js (no hand-edited JSON).
    const nodesFile = path.join(tmpRoot, 'ai-nodes.json');
    writeJson(nodesFile, [{ id: 'N0003', title: 'Totally New Capability', summary: 'New capability', slug: 'totally_new_capability', kind: 'architecture', headingRefs: [{ refId: 'REF003', heading: 2, texts: ['Totally New Capability'] }], language: 'rust' }]);
    const edit = spawnSync(process.execPath, [CRUD, `--graph=${staging}`, 'create-nodes', `--file=${nodesFile}`], { encoding: 'utf8' });
    assert.equal(edit.status, 0, edit.stderr);
    const edgeFile = path.join(tmpRoot, 'ai-edges.json');
    writeJson(edgeFile, [{ from: 'N0003', to: 'N0002', type: 'references', attributes: { strength: 'soft', bidirectional: false }, contracts: [{ id: 'C001', precondition: 'N0003 exists', postcondition: 'edge connects N0002', invariant: 'node ids are valid' }] }]);
    const edge = spawnSync(process.execPath, [CRUD, `--graph=${staging}`, 'create-edges', `--file=${edgeFile}`], { encoding: 'utf8' });
    assert.equal(edge.status, 0, edge.stderr);

    // The real GRAPH is still untouched before --approve.
    const realBefore = fs.readFileSync(graphPath, 'utf8');
    assert.ok(!realBefore.includes('N0003'), 'real GRAPH untouched before approve');

    const approve = runStep([`--source=${rfcPath}`, '--approve'], graphPath);
    assert.equal(approve.status, 0, approve.stderr);
    const promoted = fs.readFileSync(graphPath, 'utf8');
    assert.ok(promoted.includes('N0003'), 'real GRAPH promoted with the AI-crafted node');

    // verify.js passes on the promoted graph.
    const verify = spawnSync(process.execPath, [VERIFY, `--graph=${graphPath}`, `--source=${rfcPath}`], { encoding: 'utf8' });
    assert.equal(verify.status, 0, `verify should pass: ${verify.stderr}`);

    // The pipeline handoff graph-delta.json is derived from the AI-crafted
    // evolution (newNodes/modifiedNodes/newEdges), never from the analyzer.
    const delta = JSON.parse(fs.readFileSync(deltaPathOf(graphPath), 'utf8'));
    assert.ok(delta.newNodes.some((n) => n.id === 'N0003'), 'graph-delta.json records the AI-added node');
    assert.ok(delta.newEdges.some((e) => e.from === 'N0003' && e.to === 'N0002'), 'graph-delta.json records the AI-added edge');

    // Garbage cleanup: the transient candidates file is removed once the design
    // is committed; the delta (handoff) is preserved.
    assert.ok(!fs.existsSync(candidatesPathOf(graphPath)), 'candidates removed after approve');
  });

  it('--reject leaves the real GRAPH byte-identical (perfect-before-write gate)', () => {
    const { rfcPath, graphPath, deltaPath } = setupProject();
    const before = fs.readFileSync(graphPath, 'utf8');
    runStep([`--source=${rfcPath}`, `--delta=${deltaPath}`, '--stage'], graphPath);
    const res = runStep([`--source=${rfcPath}`, '--reject'], graphPath);
    assert.equal(res.status, 0, res.stderr);
    assert.equal(fs.readFileSync(graphPath, 'utf8'), before, 'real GRAPH byte-identical on reject');
    assert.ok(!fs.existsSync(stagingPathOf(graphPath)), 'staging discarded on reject');
    assert.ok(!fs.existsSync(candidatesPathOf(graphPath)), 'candidates removed after reject');
  });

  it('--approve with a missing staging graph emits an English error and does not promote', () => {
    const { rfcPath, graphPath } = setupProject();
    const before = fs.readFileSync(graphPath, 'utf8');
    const res = runStep([`--source=${rfcPath}`, '--approve'], graphPath);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error|Cause|Action/i, 'English error message');
    assert.equal(fs.readFileSync(graphPath, 'utf8'), before, 'real GRAPH unchanged');
  });

  it('--stage without --delta emits an English error and creates no staging', () => {
    const { rfcPath, graphPath } = setupProject();
    const before = fs.readFileSync(graphPath, 'utf8');
    const res = runStep([`--source=${rfcPath}`, '--stage'], graphPath);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error|Cause|Action/i, 'English error message');
    assert.ok(!fs.existsSync(stagingPathOf(graphPath)), 'no staging created');
    assert.equal(fs.readFileSync(graphPath, 'utf8'), before, 'real GRAPH unchanged');
  });

  it('--approve without --source emits an English error and does not promote', () => {
    const { graphPath, deltaPath } = setupProject();
    const before = fs.readFileSync(graphPath, 'utf8');
    const res = runStep([`--delta=${deltaPath}`, '--approve'], graphPath);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error|Cause|Action/i, 'English error message');
    assert.equal(fs.readFileSync(graphPath, 'utf8'), before, 'real GRAPH unchanged');
  });

  it('--approve rejects a staging graph that fails verify.js and does not promote', () => {
    const { rfcPath, graphPath, deltaPath } = setupProject();
    runStep([`--source=${rfcPath}`, `--delta=${deltaPath}`, '--stage'], graphPath);
    // Add an isolated node to staging via crud.js — verify.js must reject it.
    const staging = stagingPathOf(graphPath);
    const nodesFile = path.join(tmpRoot, 'isolated-node.json');
    writeJson(nodesFile, [{ id: 'N0009', title: 'Isolated', summary: 's', slug: 'isolated', kind: 'architecture', headingRefs: [{ refId: 'REF009', heading: 2, texts: ['Isolated'] }], language: 'rust' }]);
    const edit = spawnSync(process.execPath, [CRUD, `--graph=${staging}`, 'create-nodes', `--file=${nodesFile}`], { encoding: 'utf8' });
    assert.equal(edit.status, 0, edit.stderr);
    const before = fs.readFileSync(graphPath, 'utf8');
    const res = runStep([`--source=${rfcPath}`, '--approve'], graphPath);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error|Cause|Action/i, 'English error message');
    assert.equal(fs.readFileSync(graphPath, 'utf8'), before, 'real GRAPH unchanged (no promote)');
  });

  it('the delta derivation records an AI-modified node in modifiedNodes and promotes it', () => {
    const { rfcPath, graphPath, deltaPath } = setupProject();
    runStep([`--source=${rfcPath}`, `--delta=${deltaPath}`, '--stage'], graphPath);
    const staging = stagingPathOf(graphPath);

    // The AI completes the design: adds the new node + edge, and updates N0002.
    const nodesFile = path.join(tmpRoot, 'ai-nodes-mod.json');
    writeJson(nodesFile, [{ id: 'N0003', title: 'Totally New Capability', summary: 'New capability', slug: 'totally_new_capability', kind: 'architecture', headingRefs: [{ refId: 'REF003', heading: 2, texts: ['Totally New Capability'] }], language: 'rust' }]);
    const addNode = spawnSync(process.execPath, [CRUD, `--graph=${staging}`, 'create-nodes', `--file=${nodesFile}`], { encoding: 'utf8' });
    assert.equal(addNode.status, 0, addNode.stderr);
    const edgeFile = path.join(tmpRoot, 'ai-edges-mod.json');
    writeJson(edgeFile, [{ from: 'N0003', to: 'N0002', type: 'references', attributes: { strength: 'soft', bidirectional: false }, contracts: [{ id: 'C001', precondition: 'N0003 exists', postcondition: 'edge connects N0002', invariant: 'node ids are valid' }] }]);
    const addEdge = spawnSync(process.execPath, [CRUD, `--graph=${staging}`, 'create-edges', `--file=${edgeFile}`], { encoding: 'utf8' });
    assert.equal(addEdge.status, 0, addEdge.stderr);
    const patchFile = path.join(tmpRoot, 'modify-patch.json');
    writeJson(patchFile, { kind: 'security' });
    const edit = spawnSync(process.execPath, [CRUD, `--graph=${staging}`, 'update-node', `--id=N0002`, `--file=${patchFile}`], { encoding: 'utf8' });
    assert.equal(edit.status, 0, edit.stderr);

    const approve = runStep([`--source=${rfcPath}`, '--approve'], graphPath);
    assert.equal(approve.status, 0, approve.stderr);
    const delta = JSON.parse(fs.readFileSync(deltaPathOf(graphPath), 'utf8'));
    assert.ok(delta.modifiedNodes.some((m) => m.id === 'N0002'), 'delta records the AI-modified node');
  });
});
