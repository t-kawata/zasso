/**
 * verify-consistencies.test.cjs — Tests for the Step 5 cross-artifact verification (PX-169)
 *
 * Covers contracts C001/C002 of the Step 5 verify pipeline:
 *   - RFC headings vs GRAPH headingRefs (C001)
 *   - GRAPH nodes vs Dirs-Tree mappedNodeIds (C001)
 *   - Dirs-Tree files vs src files (C001)
 *   - GRAPH/Dirs-Tree nodes vs Tickets nodeIds (C002)
 *   - dangling references across artifacts (C002)
 *   - read-only invariant (C001-inv)
 *
 * RED at make time: verify-consistencies.js does not exist yet.
 *
 * @verifies C001  (RFC/GRAPH/Dirs-Tree/src consistency checks, read-only)
 * @verifies C002  (cross-artifact contradiction detection)
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const VERIFY = path.resolve(__dirname, '../../.claude/scripts/drill-rfc-down/verify-consistencies.js');

let tmpRoot;

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-consistencies-'));
});

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/** Build a mutually consistent set of artifacts (RFC/GRAPH/Dirs-Tree/src/Tickets). */
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

function runVerify(project, outPath) {
  const args = [VERIFY, `--rfc=${project.rfcPath}`, `--graph=${project.graphPath}`, `--dirs-tree=${project.dirsTreePath}`, `--src=${project.srcDir}`, `--tickets=${project.ticketsPath}`];
  if (outPath) args.push(`--out=${outPath}`);
  return spawnSync(process.execPath, args, { encoding: 'utf8' });
}

describe('verify-consistencies.js (6-consistency check)', () => {
  it('reports an RFC heading with no GRAPH headingRef as a high-severity finding (C001)', () => {
    const { rfcPath, graphPath, dirsTreePath, srcDir, ticketsPath } = setupProject();
    fs.writeFileSync(rfcPath, '# Doc\n\n## Uncovered Heading\n');
    const outPath = path.join(tmpRoot, 'vc1.json');
    const res = runVerify({ rfcPath, graphPath, dirsTreePath, srcDir, ticketsPath }, outPath);
    assert.equal(res.status, 0, res.stderr);
    const out = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.ok(out.findings.some((f) => f.severity === 'high' && /heading|uncovered/i.test(f.message)), 'uncovered RFC heading flagged');
  });

  it('reports a GRAPH node with no Dirs-Tree mappedNodeId (C001)', () => {
    const { rfcPath, graphPath, dirsTreePath, srcDir, ticketsPath } = setupProject();
    const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
    graph.nodes.push({ id: 'N0009', title: 'Orphan', slug: 'orphan', kind: 'architecture', summary: 's', headingRefs: [{ refId: 'REF009', heading: 2, texts: ['Auth'] }] });
    writeJson(graphPath, graph);
    const outPath = path.join(tmpRoot, 'vc2.json');
    runVerify({ rfcPath, graphPath, dirsTreePath, srcDir, ticketsPath }, outPath);
    const out = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.ok(out.findings.some((f) => f.severity === 'high' && f.message.includes('N0009')), 'unmapped graph node flagged');
  });

  it('reports a Dirs-Tree file missing from src (C001)', () => {
    const { rfcPath, graphPath, dirsTreePath, srcDir, ticketsPath } = setupProject();
    fs.rmSync(path.join(srcDir, 'api', 'auth.rs'));
    const outPath = path.join(tmpRoot, 'vc3.json');
    runVerify({ rfcPath, graphPath, dirsTreePath, srcDir, ticketsPath }, outPath);
    const out = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.ok(out.findings.some((f) => f.severity === 'high' && /missing from src|auth\.rs/i.test(f.message)), 'Dirs-Tree file missing from src flagged');
  });

  it('reports a GRAPH node absent from Tickets (C002)', () => {
    const { rfcPath, graphPath, dirsTreePath, srcDir, ticketsPath } = setupProject();
    const tickets = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
    tickets.phases[0].tickets[0].nodeIds = [];
    writeJson(ticketsPath, tickets);
    const outPath = path.join(tmpRoot, 'vc4.json');
    runVerify({ rfcPath, graphPath, dirsTreePath, srcDir, ticketsPath }, outPath);
    const out = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.ok(out.findings.some((f) => f.severity === 'high' && /absent from|tickets|N0002/i.test(f.message)), 'graph node absent from Tickets flagged');
  });

  it('reports a dangling Dirs-Tree reference (C002)', () => {
    const { rfcPath, graphPath, dirsTreePath, srcDir, ticketsPath } = setupProject();
    const dt = JSON.parse(fs.readFileSync(dirsTreePath, 'utf8'));
    const auth = dt.trees.rust.children.find((c) => c.name === 'api').children.find((c) => c.name === 'auth.rs');
    auth.mappedNodeIds = [{ nodeId: 'N9999', title: 'Missing' }];
    writeJson(dirsTreePath, dt);
    const outPath = path.join(tmpRoot, 'vc5.json');
    runVerify({ rfcPath, graphPath, dirsTreePath, srcDir, ticketsPath }, outPath);
    const out = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.ok(out.findings.some((f) => f.severity === 'high' && /dangling|N9999/i.test(f.message)), 'dangling reference flagged');
  });

  it('never writes to any artifact (C001-inv)', () => {
    const { rfcPath, graphPath, dirsTreePath, srcDir, ticketsPath } = setupProject();
    const before = {
      rfc: fs.readFileSync(rfcPath, 'utf8'),
      graph: fs.readFileSync(graphPath, 'utf8'),
      tickets: fs.readFileSync(ticketsPath, 'utf8'),
    };
    const outPath = path.join(tmpRoot, 'vc-inv.json');
    runVerify({ rfcPath, graphPath, dirsTreePath, srcDir, ticketsPath }, outPath);
    assert.equal(fs.readFileSync(rfcPath, 'utf8'), before.rfc, 'RFC unchanged');
    assert.equal(fs.readFileSync(graphPath, 'utf8'), before.graph, 'GRAPH unchanged');
    assert.equal(fs.readFileSync(ticketsPath, 'utf8'), before.tickets, 'Tickets unchanged');
  });
});
