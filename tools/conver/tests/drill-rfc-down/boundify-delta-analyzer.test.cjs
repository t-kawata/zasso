/**
 * boundify-delta-analyzer.test.cjs — Tests for the Step 3 dirs-tree-delta analyzer (PX-161)
 *
 * Covers contracts C001/C002 of the boundify delta pipeline:
 *   - Reads graph-delta.json + Dirs-Tree + real src and proposes new-file /
 *     modify-file candidates and surfaces src drift deterministically (C001)
 *   - Generates dirs-tree-delta.json with a validated schema, never writing to
 *     the Dirs-Tree or src (C002)
 *
 * RED at make time: boundify-delta-analyzer.js does not exist yet.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ANALYZER = path.resolve(__dirname, '../../.claude/scripts/drill-rfc-down/boundify-delta-analyzer.js');

let tmpRoot;

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'boundify-analyzer-'));
});

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  return filePath;
}

/** Build a real src tree and a matching Dirs-Tree fixture. */
function setupProject() {
  const srcDir = path.join(tmpRoot, 'src');
  fs.mkdirSync(path.join(srcDir, 'api'), { recursive: true });
  fs.writeFileSync(path.join(srcDir, 'api', 'auth.rs'), '// auth\n');
  fs.writeFileSync(path.join(srcDir, 'stray.rs'), '// extra file not in Dirs-Tree\n');

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
          {
            name: 'api',
            type: 'directory',
            kind: 'architecture',
            mappedNodeIds: [],
            children: [
              { name: 'auth.rs', type: 'file', kind: 'api_contract', mappedNodeIds: [{ nodeId: 'N0002', title: 'Auth module' }] },
              { name: 'legacy.rs', type: 'file', kind: 'architecture', mappedNodeIds: [{ nodeId: 'N0004', title: 'Legacy' }] },
            ],
          },
        ],
      },
    },
    dependencyDirections: { rust: [] },
  });

  const graphDeltaPath = path.join(tmpRoot, 'graph-delta.json');
  writeJson(graphDeltaPath, {
    sourceFile: 'RFC.md',
    newNodes: [
      { id: 'N0003', title: 'Session storage', kind: 'architecture', summary: 'Session storage', slug: 'session_storage', headingRefs: [{ refId: 'REF003', heading: 2, texts: ['Session storage'] }] },
    ],
    modifiedNodes: [
      { id: 'N0002', changes: { title: 'Auth module extended', summary: 'Extended auth' } },
    ],
    newEdges: [],
    report: { edgeMatches: {} },
  });

  return { srcDir, dirsTreePath, graphDeltaPath };
}

function runAnalyzer(graphDeltaPath, dirsTreePath, srcDir, outPath) {
  return spawnSync(process.execPath, [ANALYZER, `--graph-delta=${graphDeltaPath}`, `--dirs-tree=${dirsTreePath}`, `--src=${srcDir}`, `--out=${outPath}`], { encoding: 'utf8' });
}

describe('boundify-delta-analyzer.js', () => {
  it('proposes new-file / modify-file candidates and surfaces src drift in dirs-tree-delta.json', () => {
    const { srcDir, dirsTreePath, graphDeltaPath } = setupProject();
    const outPath = path.join(tmpRoot, 'dirs-tree-delta.json');
    const res = runAnalyzer(graphDeltaPath, dirsTreePath, srcDir, outPath);
    assert.equal(res.status, 0, res.stderr);
    const out = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.ok(Array.isArray(out.newFiles), 'newFiles is an array');
    assert.ok(Array.isArray(out.modifiedFiles), 'modifiedFiles is an array');
    assert.ok(Array.isArray(out.srcDrift), 'srcDrift is an array');
  });

  it('proposes a new file for a new graph node', () => {
    const { srcDir, dirsTreePath, graphDeltaPath } = setupProject();
    const outPath = path.join(tmpRoot, 'dd-new.json');
    runAnalyzer(graphDeltaPath, dirsTreePath, srcDir, outPath);
    const out = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    const newFile = out.newFiles.find((f) => String(f.mappedNodeIds || f.nodeId).includes('N0003'));
    assert.ok(newFile, 'new file proposed for N0003');
    assert.ok(newFile.path && newFile.kind, 'new file has path and kind');
  });

  it('identifies the file mapped to a modified node', () => {
    const { srcDir, dirsTreePath, graphDeltaPath } = setupProject();
    const outPath = path.join(tmpRoot, 'dd-modify.json');
    runAnalyzer(graphDeltaPath, dirsTreePath, srcDir, outPath);
    const out = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    const modify = out.modifiedFiles.find((m) => String(m.nodeId).includes('N0002'));
    assert.ok(modify, 'auth.rs (mapped to N0002) proposed as a modify candidate');
  });

  it('surfaces src drift: missing file (in Dirs-Tree, absent from src) and extra file', () => {
    const { srcDir, dirsTreePath, graphDeltaPath } = setupProject();
    const outPath = path.join(tmpRoot, 'dd-drift.json');
    runAnalyzer(graphDeltaPath, dirsTreePath, srcDir, outPath);
    const out = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.ok(out.srcDrift.some((d) => String(d.path).includes('legacy.rs') && d.kind === 'missing'), 'legacy.rs missing from src reported');
    assert.ok(out.srcDrift.some((d) => String(d.path).includes('stray.rs') && d.kind === 'extra'), 'stray.rs extra in src reported');
  });

  it('fails with a clear message on malformed graph-delta.json', () => {
    const { srcDir, dirsTreePath } = setupProject();
    const badGd = path.join(tmpRoot, 'bad-graph-delta.json');
    fs.writeFileSync(badGd, 'not json');
    const outPath = path.join(tmpRoot, 'dd-bad.json');
    const res = runAnalyzer(badGd, dirsTreePath, srcDir, outPath);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /graph-delta|invalid/i);
  });

  it('never writes to *-Dirs-Tree.json or src (C001 invariant)', () => {
    const { srcDir, dirsTreePath, graphDeltaPath } = setupProject();
    const beforeTree = fs.readFileSync(dirsTreePath, 'utf8');
    const beforeSrc = fs.readdirSync(path.join(srcDir, 'api')).sort();
    const outPath = path.join(tmpRoot, 'dd-no-write.json');
    const res = runAnalyzer(graphDeltaPath, dirsTreePath, srcDir, outPath);
    assert.equal(res.status, 0);
    assert.equal(fs.readFileSync(dirsTreePath, 'utf8'), beforeTree, 'Dirs-Tree byte-identical');
    assert.deepEqual(fs.readdirSync(path.join(srcDir, 'api')).sort(), beforeSrc, 'src unchanged');
  });

  it('is deterministic (same inputs -> same output, C002 invariant)', () => {
    const { srcDir, dirsTreePath, graphDeltaPath } = setupProject();
    const out1 = path.join(tmpRoot, 'dd-det1.json');
    const out2 = path.join(tmpRoot, 'dd-det2.json');
    runAnalyzer(graphDeltaPath, dirsTreePath, srcDir, out1);
    runAnalyzer(graphDeltaPath, dirsTreePath, srcDir, out2);
    assert.equal(fs.readFileSync(out1, 'utf8'), fs.readFileSync(out2, 'utf8'), 'identical output for identical inputs');
  });
});
