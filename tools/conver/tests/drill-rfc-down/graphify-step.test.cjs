/**
 * graphify-step.test.cjs — Tests for the Step 2 graphify step driver (PX-160)
 *
 * Covers contract C003 (AI approval -> crud.js):
 *   - --dry-run prints the candidate report without changing the GRAPH
 *   - --reject leaves the GRAPH byte-identical (perfect-before-write gate)
 *   - --approve applies the plan via crud.js and verify.js passes
 *
 * RED at make time: graphify-step.js does not exist yet.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const STEP_DRIVER = path.resolve(__dirname, '../../.claude/scripts/drill-rfc-down/graphify-step.js');
const ANALYZER = path.resolve(__dirname, '../../.claude/scripts/drill-rfc-down/graphify-delta-analyzer.js');
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
  return filePath;
}

/** Build a realistic project: RFC source + valid GRAPH + delta. */
function setupProject() {
  const rfcPath = path.join(tmpRoot, 'RFC.md');
  fs.writeFileSync(rfcPath, '# Purpose\n\n## Auth\n\n## Totally New Capability\n', 'utf8');

  const graphPath = path.join(tmpRoot, 'RFC-GRAPH.json');
  writeJson(graphPath, {
    sourceFile: 'RFC.md',
    mainLanguage: 'en',
    nodes: [
      { id: 'N0001', title: 'Purpose', summary: 'Purpose', slug: 'purpose', kind: 'architecture', headingRefs: [{ refId: 'REF001', heading: 1, texts: ['Purpose'] }], language: 'en' },
      { id: 'N0002', title: 'Auth module', summary: 'Auth', slug: 'auth', kind: 'api_contract', headingRefs: [{ refId: 'REF002', heading: 2, texts: ['Auth'] }], language: 'en' },
    ],
    edges: [
      { from: 'N0001', to: 'N0002', type: 'depends_on', attributes: { strength: 'soft', bidirectional: false }, contracts: [{ id: 'C001', precondition: 'N0001 exists', postcondition: 'edge connects N0002', invariant: 'node ids are valid' }] },
    ],
  });

  const deltaPath = path.join(tmpRoot, 'delta.json');
  writeJson(deltaPath, {
    sourceFile: 'RFC.md',
    generatedAt: '2026-08-20T00:00:00.000Z',
    appendOnly: true,
    sections: [
      { heading: '## Totally New Capability', startLine: 4, lines: ['## Totally New Capability', '', 'Uses the auth module.'] },
    ],
    addedLineCount: 4,
    contradictionCandidates: [],
  });

  return { rfcPath, graphPath, deltaPath };
}

function runStep(args, graphPath) {
  return spawnSync(process.execPath, [STEP_DRIVER, `--graph=${graphPath}`, ...args], { encoding: 'utf8' });
}

describe('graphify-step.js', () => {
  it('--dry-run prints the candidate report without changing the GRAPH', () => {
    const { rfcPath, graphPath, deltaPath } = setupProject();
    const before = fs.readFileSync(graphPath, 'utf8');
    const res = runStep([`--delta=${deltaPath}`, `--source=${rfcPath}`, '--dry-run'], graphPath);
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /new node|newNodes|N0003/i, 'report shows the new-node candidate');
    assert.equal(fs.readFileSync(graphPath, 'utf8'), before, 'GRAPH unchanged on dry-run');
  });

  it('--reject leaves the GRAPH byte-identical (perfect-before-write gate)', () => {
    const { rfcPath, graphPath, deltaPath } = setupProject();
    const before = fs.readFileSync(graphPath, 'utf8');
    const res = runStep([`--delta=${deltaPath}`, `--source=${rfcPath}`, '--reject'], graphPath);
    assert.equal(res.status, 0, res.stderr);
    assert.equal(fs.readFileSync(graphPath, 'utf8'), before, 'GRAPH byte-identical on reject');
  });

  it('--approve applies the plan via crud.js and verify.js passes', () => {
    const { rfcPath, graphPath, deltaPath } = setupProject();
    const res = runStep([`--delta=${deltaPath}`, `--source=${rfcPath}`, '--approve'], graphPath);
    assert.equal(res.status, 0, res.stderr);

    // The new node N0003 must exist in the GRAPH (crud.js applied it).
    const list = spawnSync(process.execPath, [CRUD, `--graph=${graphPath}`, 'list-nodes'], { encoding: 'utf8' });
    assert.equal(list.status, 0, list.stderr);
    assert.match(list.stdout, /N0003/, 'new node N0003 present after approval');

    // verify.js must pass on the modified GRAPH.
    const verify = spawnSync(process.execPath, [VERIFY, `--graph=${graphPath}`, `--source=${rfcPath}`], { encoding: 'utf8' });
    assert.equal(verify.status, 0, `verify.js should pass: ${verify.stderr}`);
  });
});
