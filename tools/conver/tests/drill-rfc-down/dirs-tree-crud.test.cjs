/**
 * dirs-tree-crud.test.cjs — Tests for the granular Dirs-Tree editing tool (PX-164)
 *
 * Covers contract C002:
 *   - add-dir / add-file / update-node / update-mapped / remove-node perform
 *     granular Dirs-Tree edits on a staging copy
 *   - every edit validates the Dirs-Tree schema after the operation (C002-post)
 *   - a schema violation or a forbidden destructive change exits 1 with an
 *     English Error/Cause/Action message and leaves the file byte-identical (C002-inv)
 *
 * RED at make time: dirs-tree-crud.js does not exist yet.
 *
 * @verifies C002  (dirs-tree-crud performs staged edits and validates after every operation)
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CRUD = path.resolve(__dirname, '../../.claude/scripts/drill-rfc-down/dirs-tree-crud.js');
const VALIDATE = path.resolve(__dirname, '../../.claude/scripts/rfc-graph/validate-dirs-tree-schema.js');

let tmpRoot;

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dirs-tree-crud-'));
});

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/** Build a valid project: graph + Dirs-Tree (both required by the crud tool). */
function setupProject() {
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

  return { graphPath, dirsTreePath };
}

function runCrud(dirsTreePath, graphPath, ...args) {
  return spawnSync(process.execPath, [CRUD, `--dirs-tree=${dirsTreePath}`, `--graph=${graphPath}`, ...args], { encoding: 'utf8' });
}

/** Run the schema validator; returns the parsed {ok, errors}. */
function validateTree(dirsTreePath, graphPath) {
  const res = spawnSync(process.execPath, [VALIDATE, `--dirs-tree=${dirsTreePath}`, `--graph=${graphPath}`], { encoding: 'utf8' });
  return JSON.parse(res.stdout);
}

describe('dirs-tree-crud.js (granular Dirs-Tree editing)', () => {
  it('add-file adds a file node and leaves the Dirs-Tree valid (C002-post)', () => {
    const { graphPath, dirsTreePath } = setupProject();
    const res = runCrud(dirsTreePath, graphPath, 'add-file', '--path=src/api/session_storage.rs', '--kind=architecture', '--mapped=N0003:Session storage');
    assert.equal(res.status, 0, res.stderr);
    const tree = JSON.parse(fs.readFileSync(dirsTreePath, 'utf8'));
    const apiDir = tree.trees.rust.children.find((c) => c.name === 'api');
    assert.ok(apiDir.children.some((c) => c.name === 'session_storage.rs'), 'file node added under api');
    assert.equal(validateTree(dirsTreePath, graphPath).ok, true, 'tree remains schema-valid');
  });

  it('update-node updates kind/mappedNodeIds and validates (C002-post)', () => {
    const { graphPath, dirsTreePath } = setupProject();
    const patch = path.join(tmpRoot, 'patch.json');
    writeJson(patch, { kind: 'security' });
    const res = runCrud(dirsTreePath, graphPath, 'update-node', '--path=src/api/auth.rs', `--file=${patch}`);
    assert.equal(res.status, 0, res.stderr);
    const tree = JSON.parse(fs.readFileSync(dirsTreePath, 'utf8'));
    const auth = tree.trees.rust.children.find((c) => c.name === 'api').children.find((c) => c.name === 'auth.rs');
    assert.equal(auth.kind, 'security', 'kind updated');
    assert.equal(validateTree(dirsTreePath, graphPath).ok, true, 'tree remains schema-valid');
  });

  it('a schema violation (invalid kind) exits 1 with an English Error/Cause/Action and no write (C002-inv)', () => {
    const { graphPath, dirsTreePath } = setupProject();
    const before = fs.readFileSync(dirsTreePath, 'utf8');
    const res = runCrud(dirsTreePath, graphPath, 'add-file', '--path=src/api/bad.rs', '--kind=not_a_kind', '--mapped=N0003:X');
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error|Cause|Action/i, 'English error message');
    assert.equal(fs.readFileSync(dirsTreePath, 'utf8'), before, 'no partial write');
  });

  it('remove-node without --force is forbidden by default (C002-inv)', () => {
    const { graphPath, dirsTreePath } = setupProject();
    const before = fs.readFileSync(dirsTreePath, 'utf8');
    const res = runCrud(dirsTreePath, graphPath, 'remove-node', '--path=src/api/auth.rs');
    assert.equal(res.status, 1);
    assert.match(res.stderr, /force|destructive|permission/i, 'English error demands explicit approval');
    assert.equal(fs.readFileSync(dirsTreePath, 'utf8'), before, 'no write without approval');
  });

  it('remove-node --force removes the node and leaves the tree valid', () => {
    const { graphPath, dirsTreePath } = setupProject();
    const res = runCrud(dirsTreePath, graphPath, 'remove-node', '--path=src/api/auth.rs', '--force');
    assert.equal(res.status, 0, res.stderr);
    const tree = JSON.parse(fs.readFileSync(dirsTreePath, 'utf8'));
    const apiDir = tree.trees.rust.children.find((c) => c.name === 'api');
    assert.ok(!apiDir.children.some((c) => c.name === 'auth.rs'), 'auth.rs removed');
    assert.equal(validateTree(dirsTreePath, graphPath).ok, true, 'tree remains schema-valid');
  });

  it('add-file to a nonexistent parent emits an English error (safe editing)', () => {
    const { graphPath, dirsTreePath } = setupProject();
    const before = fs.readFileSync(dirsTreePath, 'utf8');
    const res = runCrud(dirsTreePath, graphPath, 'add-file', '--path=src/nope/x.rs', '--kind=architecture', '--mapped=N0003:X');
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error|Cause|Action/i, 'English error message');
    assert.equal(fs.readFileSync(dirsTreePath, 'utf8'), before, 'no write when parent is missing');
  });

  it('add-dir creates a directory node and leaves the tree valid', () => {
    const { graphPath, dirsTreePath } = setupProject();
    const res = runCrud(dirsTreePath, graphPath, 'add-dir', '--path=src/api/cache', '--kind=architecture');
    assert.equal(res.status, 0, res.stderr);
    const tree = JSON.parse(fs.readFileSync(dirsTreePath, 'utf8'));
    const apiDir = tree.trees.rust.children.find((c) => c.name === 'api');
    assert.ok(apiDir.children.some((c) => c.name === 'cache' && c.type === 'directory'), 'directory node added');
    assert.equal(validateTree(dirsTreePath, graphPath).ok, true, 'tree remains schema-valid');
  });
});
