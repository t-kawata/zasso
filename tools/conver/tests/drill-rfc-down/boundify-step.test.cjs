/**
 * boundify-step.test.cjs — Tests for the Step 3 boundify step driver (PX-161)
 *
 * Covers contract C003 (AI approval -> write):
 *   - --dry-run prints the candidate report without changing Dirs-Tree or src
 *   - --reject leaves Dirs-Tree and src byte-identical (perfect-before-write gate)
 *   - --approve applies the plan (new file + Dirs-Tree update) and
 *     validate-dirs-tree-schema passes
 *
 * RED at make time: boundify-step.js does not exist yet.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const STEP_DRIVER = path.resolve(__dirname, '../../.claude/scripts/drill-rfc-down/boundify-step.js');
const VALIDATE = path.resolve(__dirname, '../../.claude/scripts/rfc-graph/validate-dirs-tree-schema.js');

let tmpRoot;

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'boundify-step-'));
});

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/** Build a valid project: graph (with N0003), Dirs-Tree, src, graph-delta. */
function setupProject() {
  const srcDir = path.join(tmpRoot, 'src');
  fs.mkdirSync(path.join(srcDir, 'api'), { recursive: true });
  fs.writeFileSync(path.join(srcDir, 'api', 'auth.rs'), '// auth\n');

  const graphPath = path.join(tmpRoot, 'graph.json');
  writeJson(graphPath, {
    sourceFile: 'RFC.md',
    mainLanguage: 'rust',
    nodes: [
      { id: 'N0001', title: 'Purpose', summary: 'Purpose', slug: 'purpose', kind: 'architecture', headingRefs: [{ refId: 'REF001', heading: 1, texts: ['Purpose'] }], language: 'rust' },
      { id: 'N0002', title: 'Auth module', summary: 'Auth', slug: 'auth', kind: 'api_contract', headingRefs: [{ refId: 'REF002', heading: 2, texts: ['Auth'] }], language: 'rust' },
      { id: 'N0003', title: 'Session storage', summary: 'Session', slug: 'session_storage', kind: 'architecture', headingRefs: [{ refId: 'REF003', heading: 2, texts: ['Session storage'] }], language: 'rust' },
    ],
    edges: [],
  });

  const dirsTreePath = path.join(tmpRoot, 'dirs.json');
  writeJson(dirsTreePath, {
    schemaVersion: 1,
    sourceGraph: 'graph.json',
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

  const graphDeltaPath = path.join(tmpRoot, 'graph-delta.json');
  writeJson(graphDeltaPath, {
    sourceFile: 'RFC.md',
    newNodes: [
      { id: 'N0003', title: 'Session storage', kind: 'architecture', summary: 'Session', slug: 'session_storage', headingRefs: [{ refId: 'REF003', heading: 2, texts: ['Session storage'] }] },
    ],
    modifiedNodes: [
      { id: 'N0002', changes: { title: 'Auth module extended', summary: 'Extended auth' } },
    ],
    newEdges: [],
    report: { edgeMatches: {} },
  });

  return { srcDir, graphPath, dirsTreePath, graphDeltaPath };
}

function runStep(args, dirsTreePath, srcDir) {
  return spawnSync(process.execPath, [STEP_DRIVER, `--dirs-tree=${dirsTreePath}`, `--src=${srcDir}`, ...args], { encoding: 'utf8' });
}

describe('boundify-step.js', () => {
  it('--dry-run prints the candidate report without changing Dirs-Tree or src', () => {
    const { srcDir, graphPath, dirsTreePath, graphDeltaPath } = setupProject();
    const beforeTree = fs.readFileSync(dirsTreePath, 'utf8');
    const res = runStep([`--graph=${graphPath}`, `--graph-delta=${graphDeltaPath}`, '--dry-run'], dirsTreePath, srcDir);
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /new file|newFiles|session_storage/i, 'report shows the new-file candidate');
    assert.equal(fs.readFileSync(dirsTreePath, 'utf8'), beforeTree, 'Dirs-Tree unchanged on dry-run');
    assert.ok(!fs.existsSync(path.join(srcDir, 'session_storage.rs')), 'src unchanged on dry-run');
  });

  it('--reject leaves Dirs-Tree and src byte-identical (perfect-before-write gate)', () => {
    const { srcDir, graphPath, dirsTreePath, graphDeltaPath } = setupProject();
    const beforeTree = fs.readFileSync(dirsTreePath, 'utf8');
    const beforeFiles = fs.readdirSync(srcDir).sort();
    const res = runStep([`--graph=${graphPath}`, `--graph-delta=${graphDeltaPath}`, '--reject'], dirsTreePath, srcDir);
    assert.equal(res.status, 0, res.stderr);
    assert.equal(fs.readFileSync(dirsTreePath, 'utf8'), beforeTree, 'Dirs-Tree byte-identical on reject');
    assert.deepEqual(fs.readdirSync(srcDir).sort(), beforeFiles, 'src unchanged on reject');
  });

  it('--approve applies the plan (new file + Dirs-Tree update) and validate-dirs-tree-schema passes', () => {
    const { srcDir, graphPath, dirsTreePath, graphDeltaPath } = setupProject();
    const res = runStep([`--graph=${graphPath}`, `--graph-delta=${graphDeltaPath}`, '--approve'], dirsTreePath, srcDir);
    assert.equal(res.status, 0, res.stderr);

    // The new file must be created in src.
    assert.ok(fs.existsSync(path.join(srcDir, 'session_storage.rs')), 'session_storage.rs created in src');

    // The Dirs-Tree must now contain the new file node.
    const updated = JSON.parse(fs.readFileSync(dirsTreePath, 'utf8'));
    const rustChildren = updated.trees.rust.children;
    assert.ok(rustChildren.some((c) => c.name === 'session_storage.rs'), 'new file node added to Dirs-Tree');

    // validate-dirs-tree-schema must pass on the updated Dirs-Tree.
    const v = spawnSync(process.execPath, [VALIDATE, `--dirs-tree=${dirsTreePath}`, `--graph=${graphPath}`], { encoding: 'utf8' });
    assert.equal(v.status, 0, `validate should pass: ${v.stderr}`);
  });
});
