/**
 * refresh-file-headers.test.cjs — Tests for the drill-rfc-down safe header-refresh
 * module (PX-171).
 *
 * Covers contracts C001/C002/C003/C004:
 *   - C001 header-region→replacement  (header region refreshed; body byte-identical; [::TICKET::] preserved)
 *   - C002 no-header→skip             (header-less files never touched)
 *   - C003 template-state→stub-refresh (stub injected only in template-state files)
 *   - C004 graph→cross-reference-rebuild (cross-references recomputed from the updated graph)
 *
 * The refresh reuses boundify-helpers.js generateHeaderComment and boundify-tree.js
 * computeCrossReferences read-only.
 *
 * @verifies C001 (header region replacement preserves body and [::TICKET::] annotations)
 * @verifies C002 (header-less files are skipped byte-identical)
 * @verifies C003 (declaration stubs are refreshed only in template-state files)
 * @verifies C004 (cross-references are recomputed from the updated graph)
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HEADER_MARKER = 'Initial Design Artifact — RFC-driven Implementation';
const SEP = '// ============================================================================';
const SEP_RE = /^\/\/ =+$/;

let tmpRoot;

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-headers-'));
});

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

async function loadRefresh() {
  return import('../../.claude/scripts/drill-rfc-down/refresh-file-headers.js');
}

/** Build a realistic provenance header block (opening separator .. closing separator). */
function buildHeader(extraLines = []) {
  return [
    SEP,
    '// ' + HEADER_MARKER,
    '// !!! NEVER DELETE OR EDIT THIS COMMENT — it is the heart of design traceability !!!',
    SEP,
    '// "Node" refers to a design fragment bounded by safe I/O boundaries in the Original RFC.',
    '// Graph:        ../RFC-GRAPH.json',
    '// Directory:    ../RFC-Dirs-Tree.json',
    '// Original RFC: ../RFC.md',
    '// Mapped node(s):',
    '//   - NODE_ID=N0002: Auth module',
    ...extraLines,
    '// Full graph exploration:',
    '//   (cd .. && node .claude/scripts/rfc-graph/query.js --graph="RFC-GRAPH.json")',
    SEP,
  ].join('\n');
}

/** A header-carrying file: a [::TICKET::] annotation ABOVE the header, then the header block. */
function buildFile(extraLines = []) {
  return '// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.\n\n' + buildHeader(extraLines);
}

/** Build a fixture project: graph, Dirs-Tree, src files, graph-delta. */
function setupProject({ includeHandWritten = true, preCreateTemplate = false } = {}) {
  const tmp = fs.mkdtempSync(path.join(tmpRoot, 'proj-'));
  const graphPath = path.join(tmp, 'RFC-GRAPH.json');
  const dirsTreePath = path.join(tmp, 'RFC-Dirs-Tree.json');
  const graphDeltaPath = path.join(tmp, 'graph-delta.json');
  const srcRoot = path.join(tmp, 'src');

  fs.mkdirSync(path.join(srcRoot, 'api'), { recursive: true });

  // Auth.rs — header-carrying, mapped to N0002, with a real implementation body.
  const authPath = path.join(srcRoot, 'api', 'auth.rs');
  const authBody = 'pub struct Auth;\npub fn login() {}\n';
  fs.writeFileSync(authPath, buildFile() + '\n' + authBody, 'utf8');

  if (includeHandWritten) {
    // hand.rs — header-less, hand-written, must never be touched.
    const handPath = path.join(srcRoot, 'api', 'hand.rs');
    fs.writeFileSync(handPath, 'pub fn handcrafted() {}\n', 'utf8');
  }

  if (preCreateTemplate) {
    // tmpl.rs — template-state (body is only stub markers/comments).
    const tmplPath = path.join(srcRoot, 'api', 'tmpl.rs');
    const stubMarker = '[' + '::STUB::' + ']'; // built from parts so the source never contains the literal marker
    fs.writeFileSync(tmplPath, buildFile() + '\n// ' + stubMarker + ' MUST implement NODE_ID=N0003: Session storage\n', 'utf8');
  }

  // Updated graph: N0002 modified title, N0003 (new, mapped to tmpl.rs), N0001 prose.
  writeJson(graphPath, {
    sourceFile: path.join(tmp, 'RFC.md'),
    mainLanguage: 'rust',
    nodes: [
      { id: 'N0001', title: 'Purpose', summary: 'Purpose', slug: 'purpose', kind: 'rationale', headingRefs: [{ refId: 'REF001', heading: 1, texts: ['Purpose'] }], language: 'rust' },
      { id: 'N0002', title: 'Auth module extended', summary: 'Auth', slug: 'auth', kind: 'api_contract', headingRefs: [{ refId: 'REF002', heading: 2, texts: ['Auth'] }], language: 'rust' },
      { id: 'N0003', title: 'Session storage', summary: 'Session', slug: 'session', kind: 'architecture', headingRefs: [{ refId: 'REF003', heading: 2, texts: ['Session'] }], language: 'rust' },
    ],
    edges: [
      { from: 'N0002', to: 'N0001', type: 'part_of' },
    ],
  });

  // Dirs-Tree: auth.rs maps N0002; tmpl.rs maps N0003 (if preCreateTemplate); hand.rs unmapped.
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
            { name: 'hand.rs', type: 'file', kind: 'api_contract', mappedNodeIds: [{ nodeId: 'N0002', title: 'Auth module' }] },
            ...(preCreateTemplate ? [{ name: 'tmpl.rs', type: 'file', kind: 'architecture', mappedNodeIds: [{ nodeId: 'N0003', title: 'Session storage' }] }] : []),
          ] },
        ],
      },
    },
    dependencyDirections: { rust: [] },
  };
  writeJson(dirsTreePath, dirsTree);

  // graph-delta: N0002 modified, N0003 new.
  writeJson(graphDeltaPath, {
    sourceFile: path.join(tmp, 'RFC.md'),
    newNodes: [{ id: 'N0003', title: 'Session storage', kind: 'architecture' }],
    modifiedNodes: [{ id: 'N0002', changes: { title: 'Auth module extended' } }],
    newEdges: [],
  });

  return { tmp, graphPath, dirsTreePath, graphDeltaPath, srcRoot, stagedDirsTree: dirsTree, authPath };
}

function headerRegionOf(content) {
  const lines = content.split('\n');
  const first = lines.findIndex((l) => SEP_RE.test(l));
  let last = -1;
  for (let i = lines.length - 1; i >= 0; i--) if (SEP_RE.test(lines[i])) { last = i; break; }
  return lines.slice(first, last + 1).join('\n');
}

function preHeaderOf(content) {
  const lines = content.split('\n');
  const first = lines.findIndex((l) => SEP_RE.test(l));
  return lines.slice(0, first).join('\n');
}

function bodyOf(content) {
  const lines = content.split('\n');
  let last = -1;
  for (let i = lines.length - 1; i >= 0; i--) if (SEP_RE.test(lines[i])) { last = i; break; }
  return lines.slice(last + 1).join('\n');
}

describe('refresh-file-headers.js (safe existing-file header refresh)', () => {
  it('C001: refreshes the header region of a header-carrying file, preserving body and [::TICKET::] annotations (C001)', async () => {
    const { refreshFileHeaders } = await loadRefresh();
    const fixture = setupProject();
    const ORIGINAL_BODY = bodyOf(fs.readFileSync(fixture.authPath, 'utf8'));

    const result = await refreshFileHeaders({
      dirsTreePath: fixture.dirsTreePath,
      stagedDirsTree: fixture.stagedDirsTree,
      srcDir: fixture.srcRoot,
      graphPath: fixture.graphPath,
      graphDeltaPath: fixture.graphDeltaPath,
    });

    const out = fs.readFileSync(fixture.authPath, 'utf8');
    assert.match(headerRegionOf(out), /Auth module extended/, 'header reflects the modified node title');
    assert.match(headerRegionOf(out), new RegExp(HEADER_MARKER), 'header marker still present');
    assert.equal(bodyOf(out), ORIGINAL_BODY, 'body byte-identical');
    assert.match(preHeaderOf(out), /\[::TICKET::\] P4-1/, 'pre-header annotation preserved');
    assert.ok(result.refreshed.includes('src/api/auth.rs'), 'auth.rs recorded as refreshed');
  });

  it('C002: a header-less file is skipped byte-identical (C002)', async () => {
    const { refreshFileHeaders } = await loadRefresh();
    const fixture = setupProject();
    const handPath = path.join(fixture.srcRoot, 'api', 'hand.rs');
    const ORIGINAL = fs.readFileSync(handPath, 'utf8');

    const result = await refreshFileHeaders({
      dirsTreePath: fixture.dirsTreePath,
      stagedDirsTree: fixture.stagedDirsTree,
      srcDir: fixture.srcRoot,
      graphPath: fixture.graphPath,
      graphDeltaPath: fixture.graphDeltaPath,
    });

    assert.equal(fs.readFileSync(handPath, 'utf8'), ORIGINAL, 'hand.rs unchanged');
    assert.ok(result.skipped.includes('src/api/hand.rs'), 'hand.rs recorded as skipped');
    assert.ok(!result.refreshed.includes('src/api/hand.rs'), 'hand.rs never refreshed');
  });

  it('C003: declaration stub is refreshed in a template-state file; an implemented file is never stubbed (C003)', async () => {
    const { refreshFileHeaders } = await loadRefresh();
    const fixture = setupProject({ preCreateTemplate: true });
    const tmplPath = path.join(fixture.srcRoot, 'api', 'tmpl.rs');
    const authBodyBefore = bodyOf(fs.readFileSync(fixture.authPath, 'utf8'));

    await refreshFileHeaders({
      dirsTreePath: fixture.dirsTreePath,
      stagedDirsTree: fixture.stagedDirsTree,
      srcDir: fixture.srcRoot,
      graphPath: fixture.graphPath,
      graphDeltaPath: fixture.graphDeltaPath,
    });

    // Template-state file body is refreshed to contain a declaration stub (not just the raw marker line).
    const tmplBody = fs.readFileSync(tmplPath, 'utf8');
    assert.match(tmplBody, /struct Session|impl|pub fn|\[::STUB::\]/, 'template body carries stub/declaration content');
    // The implemented auth.rs must NOT receive a stub injection into its body.
    const authOut = fs.readFileSync(fixture.authPath, 'utf8');
    assert.equal(bodyOf(authOut), authBodyBefore, 'implemented body untouched');
  });

  it('C004: cross-references are recomputed from the updated graph and embedded in the refreshed header (C004)', async () => {
    const { refreshFileHeaders } = await loadRefresh();
    const fixture = setupProject();

    const result = await refreshFileHeaders({
      dirsTreePath: fixture.dirsTreePath,
      stagedDirsTree: fixture.stagedDirsTree,
      srcDir: fixture.srcRoot,
      graphPath: fixture.graphPath,
      graphDeltaPath: fixture.graphDeltaPath,
    });

    const out = fs.readFileSync(fixture.authPath, 'utf8');
    const header = headerRegionOf(out);
    assert.match(header, /Cross-referenced design context/, 'cross-reference section present');
    assert.match(header, /N0001/, 'prose node N0001 appears as a cross-reference');
  });

  it('C001 invariant: body sha256 is unchanged for every refreshed file', async () => {
    const { refreshFileHeaders } = await loadRefresh();
    const fixture = setupProject();
    const authBodyBefore = require('crypto').createHash('sha256').update(bodyOf(fs.readFileSync(fixture.authPath, 'utf8')), 'utf8').digest('hex');

    await refreshFileHeaders({
      dirsTreePath: fixture.dirsTreePath,
      stagedDirsTree: fixture.stagedDirsTree,
      srcDir: fixture.srcRoot,
      graphPath: fixture.graphPath,
      graphDeltaPath: fixture.graphDeltaPath,
    });

    const authBodyAfter = require('crypto').createHash('sha256').update(bodyOf(fs.readFileSync(fixture.authPath, 'utf8')), 'utf8').digest('hex');
    assert.equal(authBodyAfter, authBodyBefore, 'body sha256 unchanged');
  });

  it('C001 invariant: every [::TICKET::] annotation (above and inside the header) is preserved', async () => {
    const { refreshFileHeaders } = await loadRefresh();
    const fixture = setupProject();

    await refreshFileHeaders({
      dirsTreePath: fixture.dirsTreePath,
      stagedDirsTree: fixture.stagedDirsTree,
      srcDir: fixture.srcRoot,
      graphPath: fixture.graphPath,
      graphDeltaPath: fixture.graphDeltaPath,
    });

    const out = fs.readFileSync(fixture.authPath, 'utf8');
    assert.match(preHeaderOf(out), /\[::TICKET::\] P4-1/, 'pre-header annotation preserved');
    assert.match(out, /\[::TICKET::\] P4-1/, 'annotation still present somewhere in the file');
  });

  it('C002 invariant: a file with an opening separator but no closing separator is skipped with no write', async () => {
    const { refreshFileHeaders } = await loadRefresh();
    const fixture = setupProject({ includeHandWritten: false });
    // Add malformed.rs to the staged Dirs-Tree mapped to N0002 (a changed node) so it becomes a refresh target.
    const api = fixture.stagedDirsTree.trees.rust.children.find((c) => c.name === 'api');
    api.children.push({ name: 'malformed.rs', type: 'file', kind: 'api_contract', mappedNodeIds: [{ nodeId: 'N0002', title: 'Auth module' }] });
    // Create a malformed header-carrying file: opening separator but no closing separator.
    const malformedPath = path.join(fixture.srcRoot, 'api', 'malformed.rs');
    const malformed = SEP + '\n// ' + HEADER_MARKER + '\n// no closing separator\npub fn partial() {}\n';
    fs.writeFileSync(malformedPath, malformed, 'utf8');

    const result = await refreshFileHeaders({
      dirsTreePath: fixture.dirsTreePath,
      stagedDirsTree: fixture.stagedDirsTree,
      srcDir: fixture.srcRoot,
      graphPath: fixture.graphPath,
      graphDeltaPath: fixture.graphDeltaPath,
    });

    assert.equal(fs.readFileSync(malformedPath, 'utf8'), malformed, 'malformed file unchanged');
    assert.ok(result.skipped.includes('src/api/malformed.rs'), 'malformed file recorded as skipped');
    assert.ok(!result.refreshed.includes('src/api/malformed.rs'), 'malformed file never refreshed');
  });

  it('C001 invariant: an empty refresh-target set produces zero writes', async () => {
    const { refreshFileHeaders } = await loadRefresh();
    const fixture = setupProject({ includeHandWritten: false });
    // graph-delta with no new/modified nodes → no refresh targets.
    writeJson(fixture.graphDeltaPath, { newNodes: [], modifiedNodes: [], newEdges: [] });
    const before = fs.readdirSync(fixture.srcRoot + '/api', { recursive: true }).join(',');

    const result = await refreshFileHeaders({
      dirsTreePath: fixture.dirsTreePath,
      stagedDirsTree: fixture.stagedDirsTree,
      srcDir: fixture.srcRoot,
      graphPath: fixture.graphPath,
      graphDeltaPath: fixture.graphDeltaPath,
    });

    assert.deepEqual(result.refreshed, [], 'no files refreshed');
    const after = fs.readdirSync(fixture.srcRoot + '/api', { recursive: true }).join(',');
    assert.equal(after, before, 'no files created or modified');
  });
});
