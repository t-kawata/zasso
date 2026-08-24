/**
 * boundify-step.test.cjs — Tests for the Step 3 boundify step driver (PX-161, PX-164)
 *
 * Covers the AI-as-engineer staging flow:
 *   - --stage copies the real Dirs-Tree to a staging path and shows candidates;
 *     the real Dirs-Tree and src are untouched
 *   - the AI designs the evolution by editing the STAGING Dirs-Tree via
 *     dirs-tree-crud.js (no hand-edited JSON, no driver re-running the analyzer
 *     on --approve)
 *   - --approve validates the staging Dirs-Tree, derives dirs-tree-delta.json,
 *     commits missing src stubs, and promotes
 *   - --reject leaves the real Dirs-Tree and src byte-identical
 *
 * RED at make time: boundify-step.js still auto-applies the analyzer output.
 *
 * @verifies C003  (--approve validates, commits src stubs, and promotes; reject leaves byte-identical)
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const STEP_DRIVER = path.resolve(__dirname, '../../.claude/scripts/drill-rfc-down/boundify-step.js');
const CRUD = path.resolve(__dirname, '../../.claude/scripts/drill-rfc-down/dirs-tree-crud.js');
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

/** Build a valid project: graph, Dirs-Tree, src, graph-delta (N0003 new). */
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

  const dirsTreePath = path.join(tmpRoot, 'RFC-Dirs-Tree.json');
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

function stagingPathOf(dirsTreePath) {
  return `${dirsTreePath}.staging.json`;
}

function candidatesPathOf(dirsTreePath) {
  return `${dirsTreePath}.candidates.json`;
}

function deltaPathOf(dirsTreePath) {
  return `${dirsTreePath}.delta.json`;
}

function runStep(args, dirsTreePath, srcDir) {
  return spawnSync(process.execPath, [STEP_DRIVER, `--dirs-tree=${dirsTreePath}`, `--src=${srcDir}`, ...args], { encoding: 'utf8' });
}

describe('boundify-step.js (AI-as-engineer staging flow)', () => {
  it('--stage copies the real Dirs-Tree to a staging path and shows candidates; real Dirs-Tree and src unchanged', () => {
    const { srcDir, graphPath, dirsTreePath, graphDeltaPath } = setupProject();
    const beforeTree = fs.readFileSync(dirsTreePath, 'utf8');
    const res = runStep([`--graph=${graphPath}`, `--graph-delta=${graphDeltaPath}`, '--stage'], dirsTreePath, srcDir);
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /new file|newFiles|session_storage/i, 'report shows the new-file candidate');
    assert.match(res.stdout, /Advisory Report|Danger|Omission|Contradiction|Deficiency/i, 'report shows the four-axis advisory (PX-167)');
    assert.ok(fs.existsSync(stagingPathOf(dirsTreePath)), 'staging copy created');
    assert.equal(fs.readFileSync(dirsTreePath, 'utf8'), beforeTree, 'real Dirs-Tree unchanged on stage');
    assert.ok(!fs.existsSync(path.join(srcDir, 'session_storage.rs')), 'src unchanged on stage');
  });

  it('the AI designs the evolution by editing the staging Dirs-Tree via dirs-tree-crud.js; --approve validates, commits src stubs, and promotes', () => {
    const { srcDir, graphPath, dirsTreePath, graphDeltaPath } = setupProject();
    runStep([`--graph=${graphPath}`, `--graph-delta=${graphDeltaPath}`, '--stage'], dirsTreePath, srcDir);
    const staging = stagingPathOf(dirsTreePath);

    // The AI designs the Dirs-Tree by editing the STAGING copy via dirs-tree-crud.js.
    const edit = spawnSync(process.execPath, [CRUD, `--dirs-tree=${staging}`, `--graph=${graphPath}`, 'add-file', '--path=src/session_storage.rs', '--kind=architecture', '--mapped=N0003:Session storage'], { encoding: 'utf8' });
    assert.equal(edit.status, 0, edit.stderr);

    // The real Dirs-Tree is still untouched before --approve.
    assert.ok(!fs.readFileSync(dirsTreePath, 'utf8').includes('session_storage.rs'), 'real Dirs-Tree untouched before approve');

    const approve = runStep([`--graph=${graphPath}`, '--approve'], dirsTreePath, srcDir);
    assert.equal(approve.status, 0, approve.stderr);

    // The real Dirs-Tree was promoted with the AI-crafted file node.
    assert.ok(fs.readFileSync(dirsTreePath, 'utf8').includes('session_storage.rs'), 'Dirs-Tree promoted');

    // The src stub was generated for the new file node (PX-170 delta-only generator).
    const sessionFile = path.join(srcDir, 'session_storage.rs');
    assert.ok(fs.existsSync(sessionFile), 'src stub committed');
    const sessionBody = fs.readFileSync(sessionFile, 'utf8');
    assert.match(sessionBody, /Initial Design Artifact — RFC-driven Implementation/, 'generated src stub carries the provenance header');

    // validate-dirs-tree-schema passes on the promoted Dirs-Tree.
    const validateRes = spawnSync(process.execPath, [VALIDATE, `--dirs-tree=${dirsTreePath}`, `--graph=${graphPath}`], { encoding: 'utf8' });
    assert.equal(validateRes.status, 0, `validate should pass: ${validateRes.stderr}`);

    // The pipeline handoff dirs-tree-delta.json records the AI-crafted evolution.
    const delta = JSON.parse(fs.readFileSync(deltaPathOf(dirsTreePath), 'utf8'));
    assert.ok(delta.newFiles.some((f) => String(f.nodeId || f.path).includes('session_storage.rs') || String(f.path).includes('session_storage.rs')), 'dirs-tree-delta.json records the new file');

    // Garbage cleanup: the transient candidates file is removed once the design
    // is committed; the delta (handoff) is preserved.
    assert.ok(!fs.existsSync(candidatesPathOf(dirsTreePath)), 'candidates removed after approve');
  });

  it('--reject leaves the real Dirs-Tree byte-identical and discards staging (perfect-before-write gate)', () => {
    const { srcDir, graphPath, dirsTreePath, graphDeltaPath } = setupProject();
    const beforeTree = fs.readFileSync(dirsTreePath, 'utf8');
    runStep([`--graph=${graphPath}`, `--graph-delta=${graphDeltaPath}`, '--stage'], dirsTreePath, srcDir);
    const res = runStep([`--graph=${graphPath}`, '--reject'], dirsTreePath, srcDir);
    assert.equal(res.status, 0, res.stderr);
    assert.equal(fs.readFileSync(dirsTreePath, 'utf8'), beforeTree, 'real Dirs-Tree byte-identical on reject');
    assert.ok(!fs.existsSync(stagingPathOf(dirsTreePath)), 'staging discarded on reject');
    assert.ok(!fs.existsSync(candidatesPathOf(dirsTreePath)), 'candidates removed after reject');
  });

  it('--approve with a missing staging Dirs-Tree emits an English error and does not promote', () => {
    const { srcDir, graphPath, dirsTreePath } = setupProject();
    const beforeTree = fs.readFileSync(dirsTreePath, 'utf8');
    const res = runStep([`--graph=${graphPath}`, '--approve'], dirsTreePath, srcDir);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error|Cause|Action/i, 'English error message');
    assert.equal(fs.readFileSync(dirsTreePath, 'utf8'), beforeTree, 'real Dirs-Tree unchanged');
  });

  it('--stage without --graph-delta emits an English error and creates no staging', () => {
    const { srcDir, graphPath, dirsTreePath } = setupProject();
    const beforeTree = fs.readFileSync(dirsTreePath, 'utf8');
    const res = runStep([`--graph=${graphPath}`, '--stage'], dirsTreePath, srcDir);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error|Cause|Action/i, 'English error message');
    assert.ok(!fs.existsSync(stagingPathOf(dirsTreePath)), 'no staging created');
    assert.equal(fs.readFileSync(dirsTreePath, 'utf8'), beforeTree, 'real Dirs-Tree unchanged');
  });

  it('--approve without --graph emits an English error and does not promote', () => {
    const { srcDir, dirsTreePath, graphDeltaPath } = setupProject();
    const beforeTree = fs.readFileSync(dirsTreePath, 'utf8');
    const res = runStep([`--graph-delta=${graphDeltaPath}`, '--approve'], dirsTreePath, srcDir);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error|Cause|Action/i, 'English error message');
    assert.equal(fs.readFileSync(dirsTreePath, 'utf8'), beforeTree, 'real Dirs-Tree unchanged');
  });

  it('--approve rejects a staging Dirs-Tree that fails validate-dirs-tree-schema and does not promote', () => {
    const { srcDir, graphPath, dirsTreePath, graphDeltaPath } = setupProject();
    runStep([`--graph=${graphPath}`, `--graph-delta=${graphDeltaPath}`, '--stage'], dirsTreePath, srcDir);
    // Simulate an out-of-band invalid state: a file whose name violates the
    // lower_snake_case convention fails validate-dirs-tree-schema.
    const staging = stagingPathOf(dirsTreePath);
    const staged = JSON.parse(fs.readFileSync(staging, 'utf8'));
    const apiDir = staged.trees.rust.children.find((c) => c.name === 'api');
    const auth = apiDir.children.find((c) => c.name === 'auth.rs');
    auth.name = 'Bad Name.rs';
    fs.writeFileSync(staging, JSON.stringify(staged, null, 2) + '\n', 'utf8');

    const beforeTree = fs.readFileSync(dirsTreePath, 'utf8');
    const res = runStep([`--graph=${graphPath}`, '--approve'], dirsTreePath, srcDir);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error|Cause|Action/i, 'English error message');
    assert.equal(fs.readFileSync(dirsTreePath, 'utf8'), beforeTree, 'real Dirs-Tree unchanged (no promote)');
  });

  it('the delta derivation records an AI-modified file node in modifiedFiles and promotes it', () => {
    const { srcDir, graphPath, dirsTreePath, graphDeltaPath } = setupProject();
    runStep([`--graph=${graphPath}`, `--graph-delta=${graphDeltaPath}`, '--stage'], dirsTreePath, srcDir);
    // The AI updates auth.rs kind via dirs-tree-crud.js on the staging copy.
    const staging = stagingPathOf(dirsTreePath);
    const patchFile = path.join(tmpRoot, 'dt-patch.json');
    writeJson(patchFile, { kind: 'security' });
    const edit = spawnSync(process.execPath, [CRUD, `--dirs-tree=${staging}`, `--graph=${graphPath}`, 'update-node', '--path=src/api/auth.rs', `--file=${patchFile}`], { encoding: 'utf8' });
    assert.equal(edit.status, 0, edit.stderr);

    const approve = runStep([`--graph=${graphPath}`, '--approve'], dirsTreePath, srcDir);
    assert.equal(approve.status, 0, approve.stderr);
    const delta = JSON.parse(fs.readFileSync(deltaPathOf(dirsTreePath), 'utf8'));
    assert.ok(delta.modifiedFiles.some((m) => String(m.path).includes('auth.rs')), 'delta records the AI-modified file node');
  });

  it('PX-171: --approve refreshes existing-file headers when --graph-delta is provided, leaving bodies byte-identical', () => {
    const { srcDir, graphPath, dirsTreePath, graphDeltaPath } = setupProject();
    // Give auth.rs a provenance header mapped to N0002, and update the graph title to the delta's new title.
    const authPath = path.join(srcDir, 'api', 'auth.rs');
    const SEP = '// ' + '='.repeat(76);
    const header = [
      SEP,
      '// Initial Design Artifact — RFC-driven Implementation',
      '// !!! NEVER DELETE OR EDIT THIS COMMENT !!!',
      SEP,
      '// Graph: ../RFC-GRAPH.json',
      '// Mapped node(s):',
      '//   - NODE_ID=N0002: Auth module',
      SEP,
    ].join('\n');
    const BODY = 'pub struct Auth {}\n';
    fs.writeFileSync(authPath, header + '\n' + BODY, 'utf8');
    // Update the graph so N0002's title matches the delta's modified node.
    const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
    const n2 = graph.nodes.find((n) => n.id === 'N0002');
    n2.title = 'Auth module extended';
    writeJson(graphPath, graph);

    runStep([`--graph=${graphPath}`, `--graph-delta=${graphDeltaPath}`, '--stage'], dirsTreePath, srcDir);
    const approve = runStep([`--graph=${graphPath}`, `--graph-delta=${graphDeltaPath}`, '--approve'], dirsTreePath, srcDir);
    assert.equal(approve.status, 0, approve.stderr);
    assert.match(approve.stdout, /Refreshed existing headers/i, 'header refresh ran during approve');
    const out = fs.readFileSync(authPath, 'utf8');
    assert.match(out, /Auth module extended/, 'existing-file header reflects the graph update');
    assert.ok(out.includes(BODY), 'existing-file body preserved');
  });
});
