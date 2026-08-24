/**
 * generate-dir-templates-delta.test.cjs — Tests for the drill-rfc-down delta-only
 * directory/file tree generator (PX-170).
 *
 * Covers contracts C001/C002/C003:
 *   - C001 newFiles→file-creation  (create exactly the delta not on disk, with header)
 *   - C002 existing-path→skip      (never overwrite or delete; skip byte-identical)
 *   - C003 prose-kind→exclude      (rationale/glossary/requirement file nodes never create files)
 *
 * The generator reuses the parent boundify modules (generate-dir-template.js
 * discover/buildHeaderContext, boundify-helpers.js getDeclarationStub) read-only.
 *
 * @verifies C001 (delta-only file creation with template header, read-only on existing files)
 * @verifies C002 (existing-file skip, no overwrite/delete)
 * @verifies C003 (Prose-kind file nodes produce no files)
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { getDeclarationStub } = require('../../.claude/scripts/rfc-graph/boundify-helpers.js');

const PROSE_KINDS = ['rationale', 'glossary', 'requirement'];
const HEADER_MARKER = 'Initial Design Artifact — RFC-driven Implementation';

let tmpRoot;

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'delta-gen-'));
});

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/** Load the ESM generator module under test. */
async function loadGenerator() {
  return import('../../.claude/scripts/drill-rfc-down/generate-dir-templates-delta.js');
}

/**
 * Build a fixture project under the shared tmpRoot.
 *
 * @param {Array<{path:string,kind:string,nodeId:string,title:string}>} [newFiles]
 *   The newFiles entries to place in the staged Dirs-Tree and the delta.
 * @param {Array<string>} [preCreate]  src-relative paths (e.g. "api/session.rs") to pre-create
 *   with SENTINEL content before running the generator.
 * @returns {Object} fixture paths + the parsed staged Dirs-Tree
 */
function setupProject({ newFiles = [], preCreate = [] } = {}) {
  const tmp = fs.mkdtempSync(path.join(tmpRoot, 'proj-'));
  const graphPath = path.join(tmp, 'RFC-GRAPH.json');
  const dirsTreePath = path.join(tmp, 'RFC-Dirs-Tree.json');
  const srcRoot = path.join(tmp, 'src');

  fs.mkdirSync(path.join(srcRoot, 'api'), { recursive: true });
  fs.writeFileSync(path.join(srcRoot, 'api', 'auth.rs'), '// existing\n', 'utf8');

  writeJson(graphPath, {
    sourceFile: path.join(tmp, 'RFC.md'),
    mainLanguage: 'rust',
    nodes: [
      { id: 'N0002', title: 'Auth module', summary: 'Auth', slug: 'auth', kind: 'api_contract', headingRefs: [{ refId: 'REF002', heading: 2, texts: ['Auth'] }], language: 'rust' },
      { id: 'N0003', title: 'Session storage', summary: 'Session', slug: 'session', kind: 'architecture', headingRefs: [{ refId: 'REF003', heading: 2, texts: ['Session'] }], language: 'rust' },
    ],
    edges: [],
  });

  const dirsTree = {
    schemaVersion: 1,
    sourceGraph: graphPath,
    sourceFile: path.join(tmp, 'RFC.md'),
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
  };

  for (const nf of newFiles) {
    insertFileNode(dirsTree, nf.path, nf.kind, nf.nodeId, nf.title);
  }
  writeJson(dirsTreePath, dirsTree);

  const deltaPath = path.join(tmp, 'dirs-tree-delta.json');
  writeJson(deltaPath, { newFiles });

  for (const rel of preCreate) {
    const fullPath = path.join(srcRoot, rel);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, 'SENTINEL\n', 'utf8');
  }

  return { tmp, graphPath, dirsTreePath, srcRoot, deltaPath, stagedDirsTree: dirsTree };
}

/** Insert a file node at a Dirs-Tree-relative path (e.g. "src/api/session.rs"). */
function insertFileNode(dirsTree, relPath, kind, nodeId, title) {
  const segments = relPath.split('/').filter(Boolean);
  const tree = dirsTree.trees.rust;
  let current = tree;
  for (let i = 1; i < segments.length - 1; i++) {
    let child = (current.children || []).find((c) => c.name === segments[i]);
    if (!child) {
      child = { name: segments[i], type: 'directory', kind: 'architecture', mappedNodeIds: [], children: [] };
      current.children = current.children || [];
      current.children.push(child);
    }
    current = child;
  }
  current.children = current.children || [];
  current.children.push({
    name: segments[segments.length - 1],
    type: 'file',
    kind,
    mappedNodeIds: [{ nodeId, title }],
  });
}

/** Recursively list every file path under a root, relative to the root. */
function listFilesUnder(dir, prefix, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listFilesUnder(full, rel, acc);
    else if (entry.isFile()) acc.push(rel);
  }
  return acc;
}

/** sha256 of a file's content. */
function sha256(filePath) {
  return require('crypto').createHash('sha256').update(fs.readFileSync(filePath, 'utf8'), 'utf8').digest('hex');
}

describe('generate-dir-templates-delta.js (delta-only template generation)', () => {
  it('C001: creates exactly the delta newFiles not on disk, with the Initial Design Artifact header (C001)', async () => {
    const { generateDirsTreeDelta } = await loadGenerator();
    const fixture = setupProject({ newFiles: [{ path: 'src/api/session.rs', kind: 'architecture', nodeId: 'N0003', title: 'Session storage' }] });

    const result = await generateDirsTreeDelta({
      dirsTreePath: fixture.dirsTreePath,
      stagedDirsTree: fixture.stagedDirsTree,
      srcDir: fixture.srcRoot,
      graphPath: fixture.graphPath,
      deltaPath: fixture.deltaPath,
    });

    const sessionFile = path.join(fixture.srcRoot, 'api', 'session.rs');
    assert.ok(fs.existsSync(sessionFile), 'new file created');
    const body = fs.readFileSync(sessionFile, 'utf8');
    assert.match(body, new RegExp(HEADER_MARKER), 'header marker present');
    assert.match(body, /N0003/, 'mapped node id present in header/stub markers');
    assert.equal(fs.readFileSync(path.join(fixture.srcRoot, 'api', 'auth.rs'), 'utf8'), '// existing\n', 'existing file byte-identical');
    assert.deepEqual(result.created, ['src/api/session.rs'], 'created set === newFiles not on disk');
  });

  it('C002: an existing file at a new-file path is skipped byte-identical (C002)', async () => {
    const { generateDirsTreeDelta } = await loadGenerator();
    const fixture = setupProject({
      newFiles: [{ path: 'src/api/session.rs', kind: 'architecture', nodeId: 'N0003', title: 'Session storage' }],
      preCreate: ['api/session.rs'],
    });

    const result = await generateDirsTreeDelta({
      dirsTreePath: fixture.dirsTreePath,
      stagedDirsTree: fixture.stagedDirsTree,
      srcDir: fixture.srcRoot,
      graphPath: fixture.graphPath,
      deltaPath: fixture.deltaPath,
    });

    assert.equal(fs.readFileSync(path.join(fixture.srcRoot, 'api', 'session.rs'), 'utf8'), 'SENTINEL\n', 'existing file left byte-identical');
    assert.deepEqual(result.skipped, ['src/api/session.rs'], 'path recorded as skipped');
    assert.deepEqual(result.created, [], 'no file created');
  });

  it('C003: a Prose-kind file node produces no file (C003)', async () => {
    const { generateDirsTreeDelta } = await loadGenerator();
    const fixture = setupProject({ newFiles: [{ path: 'src/api/note.rs', kind: 'rationale', nodeId: 'N0010', title: 'Design note' }] });

    const result = await generateDirsTreeDelta({
      dirsTreePath: fixture.dirsTreePath,
      stagedDirsTree: fixture.stagedDirsTree,
      srcDir: fixture.srcRoot,
      graphPath: fixture.graphPath,
      deltaPath: fixture.deltaPath,
    });

    assert.ok(!fs.existsSync(path.join(fixture.srcRoot, 'api', 'note.rs')), 'no file created for Prose-kind node');
    assert.deepEqual(result.excluded, ['src/api/note.rs'], 'Prose-kind path recorded as excluded');
  });

  it('C001 precondition: a delta missing the newFiles array throws a clear English error and writes nothing', async () => {
    const { generateDirsTreeDelta } = await loadGenerator();
    const fixture = setupProject({});
    fs.writeFileSync(fixture.deltaPath, JSON.stringify({ modifiedFiles: [] }), 'utf8');

    assert.throws(
      () => generateDirsTreeDelta({ dirsTreePath: fixture.dirsTreePath, stagedDirsTree: fixture.stagedDirsTree, srcDir: fixture.srcRoot, graphPath: fixture.graphPath, deltaPath: fixture.deltaPath }),
      /Cause: .*newFiles/i,
    );
    assert.deepEqual(listFilesUnder(fixture.srcRoot, '', []), ['api/auth.rs'], 'no write occurred on precondition failure');
  });

  it('C001 invariant: every pre-existing file sha256 is unchanged; only the delta is added', async () => {
    const { generateDirsTreeDelta } = await loadGenerator();
    const fixture = setupProject({ newFiles: [{ path: 'src/api/session.rs', kind: 'architecture', nodeId: 'N0003', title: 'Session storage' }] });
    const before = sha256(path.join(fixture.srcRoot, 'api', 'auth.rs'));

    await generateDirsTreeDelta({ dirsTreePath: fixture.dirsTreePath, stagedDirsTree: fixture.stagedDirsTree, srcDir: fixture.srcRoot, graphPath: fixture.graphPath, deltaPath: fixture.deltaPath });

    assert.equal(sha256(path.join(fixture.srcRoot, 'api', 'auth.rs')), before, 'existing file sha256 unchanged');
    assert.deepEqual(listFilesUnder(fixture.srcRoot, '', []).sort(), ['api/auth.rs', 'api/session.rs'], 'only the delta file added');
  });

  it('C001 boundary: a nested new path creates the directory chain recursively', async () => {
    const { generateDirsTreeDelta } = await loadGenerator();
    const fixture = setupProject({ newFiles: [{ path: 'src/a/b/c.rs', kind: 'config', nodeId: 'N0004', title: 'Deep config' }] });

    await generateDirsTreeDelta({ dirsTreePath: fixture.dirsTreePath, stagedDirsTree: fixture.stagedDirsTree, srcDir: fixture.srcRoot, graphPath: fixture.graphPath, deltaPath: fixture.deltaPath });

    assert.ok(fs.existsSync(path.join(fixture.srcRoot, 'a', 'b', 'c.rs')), 'nested chain created');
    assert.match(fs.readFileSync(path.join(fixture.srcRoot, 'a', 'b', 'c.rs'), 'utf8'), new RegExp(HEADER_MARKER));
  });

  it('C001 boundary: an empty newFiles array produces zero writes', async () => {
    const { generateDirsTreeDelta } = await loadGenerator();
    const fixture = setupProject({});
    const before = listFilesUnder(fixture.srcRoot, '', []);

    const result = await generateDirsTreeDelta({ dirsTreePath: fixture.dirsTreePath, stagedDirsTree: fixture.stagedDirsTree, srcDir: fixture.srcRoot, graphPath: fixture.graphPath, deltaPath: fixture.deltaPath });

    assert.deepEqual(listFilesUnder(fixture.srcRoot, '', []), before, 'no new files');
    assert.deepEqual(result.created, []);
  });

  it('declaration stub: a node without declarationStub receives getDeclarationStub(kind, lang)', async () => {
    const { generateDirsTreeDelta } = await loadGenerator();
    const fixture = setupProject({ newFiles: [{ path: 'src/api/stubless.rs', kind: 'architecture', nodeId: 'N0005', title: 'Stubless' }] });

    await generateDirsTreeDelta({ dirsTreePath: fixture.dirsTreePath, stagedDirsTree: fixture.stagedDirsTree, srcDir: fixture.srcRoot, graphPath: fixture.graphPath, deltaPath: fixture.deltaPath });

    const expected = getDeclarationStub('architecture', 'rust');
    const body = fs.readFileSync(path.join(fixture.srcRoot, 'api', 'stubless.rs'), 'utf8');
    if (expected) {
      assert.ok(body.includes(expected), 'auto declaration stub content present');
    } else {
      // No stub template for this kind/language: header + stub markers only, no crash.
      assert.match(body, new RegExp(HEADER_MARKER));
    }
  });

  it('declaration stub: a node with declarationStub uses the node value verbatim', async () => {
    const { generateDirsTreeDelta } = await loadGenerator();
    const fixture = setupProject({ newFiles: [{ path: 'src/api/withstub.rs', kind: 'architecture', nodeId: 'N0006', title: 'WithStub' }] });
    const node = findNodeByRelPath(fixture.stagedDirsTree, 'src/api/withstub.rs');
    node.declarationStub = '// CUSTOM DECLARATION STUB\n';

    await generateDirsTreeDelta({ dirsTreePath: fixture.dirsTreePath, stagedDirsTree: fixture.stagedDirsTree, srcDir: fixture.srcRoot, graphPath: fixture.graphPath, deltaPath: fixture.deltaPath });

    const body = fs.readFileSync(path.join(fixture.srcRoot, 'api', 'withstub.rs'), 'utf8');
    assert.ok(body.includes('// CUSTOM DECLARATION STUB'), 'node declarationStub used verbatim');
  });

  it('header: the generated header contains the Initial Design Artifact marker and the mapped node ID', async () => {
    const { generateDirsTreeDelta } = await loadGenerator();
    const fixture = setupProject({ newFiles: [{ path: 'src/api/session.rs', kind: 'architecture', nodeId: 'N0003', title: 'Session storage' }] });

    await generateDirsTreeDelta({ dirsTreePath: fixture.dirsTreePath, stagedDirsTree: fixture.stagedDirsTree, srcDir: fixture.srcRoot, graphPath: fixture.graphPath, deltaPath: fixture.deltaPath });

    const body = fs.readFileSync(path.join(fixture.srcRoot, 'api', 'session.rs'), 'utf8');
    const headerRegion = body.split('\n').slice(0, 5).join('\n');
    assert.match(headerRegion, new RegExp(HEADER_MARKER), 'header marker appears at the top of the file');
    assert.match(body, /N0003/, 'mapped node id appears');
  });

  it('invariant: the generator never writes to a path that already exists', async () => {
    const { generateDirsTreeDelta } = await loadGenerator();
    const fixture = setupProject({ newFiles: [{ path: 'src/api/session.rs', kind: 'architecture', nodeId: 'N0003', title: 'Session storage' }] });

    await generateDirsTreeDelta({ dirsTreePath: fixture.dirsTreePath, stagedDirsTree: fixture.stagedDirsTree, srcDir: fixture.srcRoot, graphPath: fixture.graphPath, deltaPath: fixture.deltaPath });

    // Second run over the same delta: the now-existing file must be skipped, not overwritten.
    const before = sha256(path.join(fixture.srcRoot, 'api', 'session.rs'));
    const result = await generateDirsTreeDelta({ dirsTreePath: fixture.dirsTreePath, stagedDirsTree: fixture.stagedDirsTree, srcDir: fixture.srcRoot, graphPath: fixture.graphPath, deltaPath: fixture.deltaPath });
    assert.deepEqual(result.skipped, ['src/api/session.rs'], 'second run skips the existing file');
    assert.equal(sha256(path.join(fixture.srcRoot, 'api', 'session.rs')), before, 'content unchanged by second run');
  });
});

/** Locate a file node in the staged Dirs-Tree by a Dirs-Tree-relative path. */
function findNodeByRelPath(dirsTree, relPath) {
  const segments = relPath.split('/').filter(Boolean);
  const tree = dirsTree.trees.rust;
  let current = tree;
  for (let i = 1; i < segments.length; i++) {
    current = (current.children || []).find((c) => c.name === segments[i]);
    if (!current) return null;
  }
  return current;
}
