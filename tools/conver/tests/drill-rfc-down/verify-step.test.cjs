/**
 * verify-step.test.cjs — Tests for the Step 5 verify driver (PX-169)
 *
 * Covers contract C003 of the Step 5 verify pipeline:
 *   - verify-step exits 1 when high-severity findings remain (blocking loop)
 *   - verify-step exits 0 when only low-severity findings remain (PASS)
 *   - the report is printed to stdout with severity-ranked findings
 *
 * RED at make time: verify-step.js does not exist yet.
 *
 * @verifies C003  (verify-step blocks PASS on high-severity findings)
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const STEP_VERIFY = path.resolve(__dirname, '../../.claude/scripts/drill-rfc-down/verify-step.js');

let tmpRoot;

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-step-'));
});

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/** Build a mutually consistent set of artifacts. */
function setupProject() {
  const rfcPath = path.join(tmpRoot, 'RFC.md');
  fs.writeFileSync(rfcPath, '# Doc\n\n## Auth\n');

  const graphPath = path.join(tmpRoot, 'RFC-GRAPH.json');
  writeJson(graphPath, {
    sourceFile: 'RFC.md',
    mainLanguage: 'rust',
    nodes: [
      { id: 'N0002', title: 'Auth module', summary: 'Auth', slug: 'auth', kind: 'api_contract', headingRefs: [{ refId: 'REF002', heading: 2, texts: ['Auth'] }], language: 'rust' },
    ],
    edges: [],
  });

  const srcDir = path.join(tmpRoot, 'src');
  fs.mkdirSync(path.join(srcDir, 'api'), { recursive: true });
  fs.writeFileSync(path.join(srcDir, 'api', 'auth.rs'), '// auth\n');

  const dirsTreePath = path.join(tmpRoot, 'RFC-Dirs-Tree.json');
  writeJson(dirsTreePath, {
    schemaVersion: 1,
    sourceGraph: 'RFC-GRAPH.json',
    sourceFile: 'RFC.md',
    trees: {
      rust: {
        name: 'src',
        type: 'directory',
        kind: 'root',
        children: [
          { name: 'api', type: 'directory', kind: 'architecture', mappedNodeIds: [], children: [
            { name: 'auth.rs', type: 'file', kind: 'api_contract', mappedNodeIds: [{ nodeId: 'N0002', title: 'Auth module' }] },
          ] },
        ],
      },
    },
    dependencyDirections: { rust: [] },
  });

  const ticketsPath = path.join(tmpRoot, 'Tickets.json');
  writeJson(ticketsPath, {
    title: 'Test',
    round: 1,
    metadata: { source: 'RFC.md' },
    phases: [
      { id: 0, name: 'Phase 0', tickets: [
        { id: 1, phaseId: 0, status: 'todo', title: 'Auth module', nodeIds: ['N0002'], scope: [], testUnit: [], testIntegration: [], testExceptions: [], changes: [] },
      ] },
    ],
  });

  return { rfcPath, graphPath, dirsTreePath, srcDir, ticketsPath };
}

function runVerifyStep(rfcPath, graphPath, dirsTreePath, srcDir, ticketsPath) {
  return spawnSync(process.execPath, [STEP_VERIFY, `--rfc=${rfcPath}`, `--graph=${graphPath}`, `--dirs-tree=${dirsTreePath}`, `--src=${srcDir}`, `--tickets=${ticketsPath}`], { encoding: 'utf8' });
}

describe('verify-step.js (Step 5 blocking gate)', () => {
  it('exits 1 when high-severity findings remain (blocking loop to Step 2)', () => {
    const { rfcPath, graphPath, dirsTreePath, srcDir, ticketsPath } = setupProject();
    fs.writeFileSync(rfcPath, '# Doc\n\n## Uncovered Heading\n'); // introduces a high finding
    const res = runVerifyStep(rfcPath, graphPath, dirsTreePath, srcDir, ticketsPath);
    assert.equal(res.status, 1, 'high findings block PASS');
    assert.match(res.stdout, /high|FAIL|blocked/i, 'report indicates blocking');
  });

  it('exits 0 when only low-severity findings remain (PASS)', () => {
    const { rfcPath, graphPath, dirsTreePath, srcDir, ticketsPath } = setupProject();
    fs.writeFileSync(path.join(srcDir, 'stray.rs'), '// stray\n'); // src extra is low severity
    const res = runVerifyStep(rfcPath, graphPath, dirsTreePath, srcDir, ticketsPath);
    assert.equal(res.status, 0, 'only low-severity findings pass');
    assert.match(res.stdout, /PASS/i, 'report indicates PASS');
  });

  it('exits 0 on a fully consistent pipeline', () => {
    const { rfcPath, graphPath, dirsTreePath, srcDir, ticketsPath } = setupProject();
    const res = runVerifyStep(rfcPath, graphPath, dirsTreePath, srcDir, ticketsPath);
    assert.equal(res.status, 0, 'fully consistent pipeline passes');
  });
});
