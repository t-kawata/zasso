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

// PX-368 @verifies C005
// @verifies C006
// @verifies C007
// Step 5 is where the per-package drill becomes evidence: P1 gates block and P2 residue
// reports. COMPLETE exists only in DRILL-REPORT.json, and every blocking finding is a
// repair record rather than a sentence.
// [::TICKET::] PX-368, PX-369 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-368|PX-369) --for-spec --no-implementation-order`.
function makeSession(directory) {
  const sessionDir = path.join(directory, 'drills');
  fs.mkdirSync(sessionDir, { recursive: true });
  const iso = '2026-01-01T00:00:00.000Z';
  fs.writeFileSync(path.join(sessionDir, 'Status.json'), JSON.stringify({
    state: 'DESIGN_DONE', researchPath: '/tmp/rfc.md', rfcPath: path.join(directory, 'RFC.md'), rfcDir: directory,
    reviewLoopCount: 0, createdAt: iso, updatedAt: iso,
  }));
  fs.writeFileSync(path.join(sessionDir, 'DesignTree.json'), JSON.stringify({ version: 1, updatedAt: iso, nodes: [] }));
  fs.writeFileSync(path.join(sessionDir, 'CheckList.md'), '# RFC 要件チェックリスト\n\n<!-- GENERATED -->\n');
  return sessionDir;
}

// [::TICKET::] PX-368, PX-369 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-368|PX-369) --for-spec --no-implementation-order`.
function runVerifyStepWithSession(project, extra = []) {
  const sessionDir = makeSession(path.dirname(project.rfcPath));
  return {
    sessionDir,
    result: spawnSync(process.execPath, [
      STEP_VERIFY,
      `--rfc=${project.rfcPath}`, `--graph=${project.graphPath}`, `--dirs-tree=${project.dirsTreePath}`,
      `--src=${project.srcDir}`, `--tickets=${project.ticketsPath}`, `--session-dir=${sessionDir}`,
      ...extra,
    ], { encoding: 'utf8' }),
  };
}

describe('PX-368 Step 5 report and scopes', () => {
  it('C006 normal: every P1 gate at zero writes COMPLETE with gate names and exit codes', () => {
    const project = setupProject();
    const { sessionDir, result } = runVerifyStepWithSession(project);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    const report = JSON.parse(fs.readFileSync(path.join(sessionDir, 'DRILL-REPORT.json'), 'utf8'));
    assert.equal(report.state, 'COMPLETE');
    assert.deepEqual(report.p1.gates.map((gate) => gate.name), ['verify-consistencies', 'check-formula-coverage', 'verifyFormulaChain']);
    assert.ok(report.p1.gates.every((gate) => gate.exitCode === 0));
    const status = JSON.parse(fs.readFileSync(path.join(sessionDir, 'Status.json'), 'utf8'));
    assert.equal(status.state, 'COMPLETE');
  });

  it('C006 error: a failing P1 gate writes REPAIR_NO_PROGRESS, never COMPLETE', () => {
    const project = setupProject();
    fs.writeFileSync(project.rfcPath, '# Doc\n\n## Uncovered Heading\n');
    const { sessionDir, result } = runVerifyStepWithSession(project);

    assert.equal(result.status, 1);
    const report = JSON.parse(fs.readFileSync(path.join(sessionDir, 'DRILL-REPORT.json'), 'utf8'));
    assert.equal(report.state, 'REPAIR_NO_PROGRESS');
    const status = JSON.parse(fs.readFileSync(path.join(sessionDir, 'Status.json'), 'utf8'));
    assert.equal(status.state, 'DESIGN_DONE');
  });

  it('C005 invariant: a broken neighbour is P2 residue and does not block this package', () => {
    const project = setupProject();
    const workspaceRoot = path.join(tmpRoot, 'workspace');
    fs.mkdirSync(path.join(workspaceRoot, 'crates', 'broken'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'WORKSPACIFY-TREE-MANIFEST.json'), JSON.stringify({
      workspace: { packages: [{ id: 'pkg-broken', name: 'broken', path: 'crates/broken' }] },
    }));
    fs.writeFileSync(path.join(workspaceRoot, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), JSON.stringify({ contract_registry: [] }));
    fs.writeFileSync(path.join(workspaceRoot, 'example-sequences.json'), JSON.stringify({
      pins: { sourceEnumerations: [{ role: 'operations', members: [] }, { role: 'entries', members: [] }] },
      operations: [], sequences: [], steps: [], exemptions: [],
    }));
    fs.writeFileSync(path.join(workspaceRoot, 'crates', 'broken', 'SEQUENCES.json'), JSON.stringify({
      packageId: 'pkg-broken', ownedOperationUnits: [{ unitId: 'op-Ghost', operationId: 'Ghost' }],
      ownedSequenceUnits: [], crossBoundarySequenceUnits: [], obligationUnits: [],
    }));

    const { sessionDir, result } = runVerifyStepWithSession(project, [`--workspace=${workspaceRoot}`]);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    const report = JSON.parse(fs.readFileSync(path.join(sessionDir, 'DRILL-REPORT.json'), 'utf8'));
    assert.equal(report.state, 'COMPLETE');
    assert.ok(report.p2.gates.some((gate) => gate.exitCode !== 0), JSON.stringify(report.p2.gates));
  });

  it('C007 postcondition: a blocking finding renders Action, Verify and Route', () => {
    const project = setupProject();
    fs.writeFileSync(project.rfcPath, '# Doc\n\n## Uncovered Heading\n');
    const { result } = runVerifyStepWithSession(project);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /\[ERROR\]/);
    for (const label of ['Cause:', 'Layer:', 'Artifact:', 'Action:', 'Verify:', 'Route:']) {
      assert.match(result.stderr, new RegExp(label));
    }
  });
});

// PX-369 @verifies C001
describe('PX-369 cross-package API verdict', () => {
// [::TICKET::] PX-382 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-382 --for-spec --no-implementation-order`.
  it('C001 invariant: the API gate is P2 residue and never blocks this package', () => {
    const project = setupProject();
    const workspaceRoot = path.join(tmpRoot, 'api-workspace');
    fs.mkdirSync(path.join(workspaceRoot, 'crates', 'provider'), { recursive: true });
    fs.mkdirSync(path.join(workspaceRoot, 'crates', 'consumer'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'WORKSPACIFY-TREE-MANIFEST.json'), JSON.stringify({
      workspace: {
        packages: [
          { id: 'pkg-0001', name: 'pkg_0001', path: 'crates/provider' },
          { id: 'pkg-0002', name: 'pkg_0002', path: 'crates/consumer' },
        ],
      },
      dependencies: { boundaries: [] },
    }));
    fs.writeFileSync(path.join(workspaceRoot, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), JSON.stringify({ contract_registry: [] }));
    fs.writeFileSync(path.join(workspaceRoot, 'crates', 'provider', 'RFC.md'), [
      '# RFC pkg-0001', '', '```rust', 'pub struct Known { value: String }', '```', '',
    ].join('\n'));
    fs.writeFileSync(path.join(workspaceRoot, 'crates', 'consumer', 'RFC.md'), [
      '# RFC pkg-0002', '', '```rust', 'use pkg_0001::Missing; pub fn use_it(value: Missing) {}', '```', '',
    ].join('\n'));

    const { sessionDir, result } = runVerifyStepWithSession(project, [`--workspace=${workspaceRoot}`]);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    const report = JSON.parse(fs.readFileSync(path.join(sessionDir, 'DRILL-REPORT.json'), 'utf8'));
    assert.equal(report.state, 'COMPLETE');
    const apiGate = report.p2.gates.find((gate) => gate.name === 'verify-api-consistency');
    assert.ok(apiGate, JSON.stringify(report.p2.gates));
    assert.equal(apiGate.exitCode, 1, 'the defect is recorded as residue');
  });
});
