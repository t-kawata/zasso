// PX-361 @verifies C001
// [::TICKET::] PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-361 --for-spec --no-implementation-order`.
/**
 * The formula chain: RFC sidecar -> graph node -> Dirs-Tree file and header.
 *
 * A formula is only carried when every later layer can name it. These tests move one
 * layer at a time and assert the digest and the set at each boundary.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  computeRfcDigest,
  digestFormula,
  extractFormulas,
  normalizeFormula,
  uniqueFormulas,
} from '../../.claude/scripts/spec-formula/index.mjs';
import { sha256Hex } from '../../.claude/scripts/workspacify-tree/lib/hash.mjs';
import { verifyChain } from '../../.claude/scripts/sequences-slice/verify-chain.mjs';

const require = createRequire(import.meta.url);
const { attachFormulaIds } = require('../../.claude/scripts/rfc-graph/attach-formula-ids.js');
const { generateHeaderComment } = require('../../.claude/scripts/rfc-graph/boundify-helpers.js');
const { buildFormulaIndex, computeFormulaDigest, readHeaderFormulaIds } = require('../../.claude/scripts/rfc-graph/lib/formula-ids.js');
const { collectNodeFilePaths } = require('../../.claude/scripts/rfc-graph/lib/distribution-index.js');
const { verifyFormulaFileCoverage } = require('../../.claude/scripts/rfc-graph/verify-formula-file-coverage.js');

const SPEC_TEXT = [
  '# Specification',
  '',
  '\\[ W=2^b \\]',
  '',
  'The encoder identity is \\( E=K+1 \\).',
  '',
].join('\n');

const RFC_BODY = [
  '# RFC',
  '',
  '## Symbol Model',
  '',
  'The width is a named constant.',
  '',
  '## Encoding',
  '',
  'The encoder is a function.',
  '',
].join('\n');

// [::TICKET::] PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-361) --for-spec --no-implementation-order`.
function buildFixture({ sidecarRfcDigest = null } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'formula-chain-'));
  const specPath = join(root, 'spec.md');
  writeFileSync(specPath, SPEC_TEXT, 'utf8');
  const rfcPath = join(root, 'RFC.md');
  writeFileSync(rfcPath, RFC_BODY, 'utf8');

  const formulas = uniqueFormulas(extractFormulas(SPEC_TEXT));
  const sidecar = {
    version: 1,
    specDigest: sha256Hex(Buffer.from(SPEC_TEXT, 'utf8')),
    rfcDigest: sidecarRfcDigest ?? computeRfcDigest(RFC_BODY),
    specPath: 'spec.md',
    rfcPath: 'RFC.md',
    formulas: formulas.map((formula, index) => ({
      id: formula.id,
      digest: formula.digest,
      body: formula.body,
      display: formula.display,
      normalized: formula.normalized,
      specLocation: { path: 'spec.md', lineStart: formula.lineStart, lineEnd: formula.lineStart },
      rfcLocation: { section: index === 0 ? 'Symbol Model' : 'Encoding', lineStart: 1, lineEnd: 1 },
      theory: { symbols: [{ symbol: 'W', definition: 'bit width' }], normative: [formula.body.trim()] },
      implementation: {
        class: index === 0 ? 'structural' : 'notation',
        rfcSection: index === 0 ? 'Symbol Model' : 'Encoding',
        location: index === 0 ? 'src/symbol.rs#WIDTH' : 'src/encoding.rs#encode',
        symbols: [index === 0 ? 'src/symbol.rs#WIDTH' : 'src/encoding.rs#encode'],
        design: 'A named symbol realizes the formula.',
        verification: 'tests/symbol.rs::width',
      },
      tests: ['tests/symbol.rs::width'],
    })),
  };
  const sidecarPath = join(root, 'RFC-FORMULAS.json');
  writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2), 'utf8');

  const graphPath = join(root, 'GRAPH.json');
  writeFileSync(graphPath, JSON.stringify({
    sourceFile: 'RFC.md',
    mainLanguage: 'rust',
    distributionDigest: 'a'.repeat(64),
    nodes: [
      { id: 'N0001', title: 'Symbol Model', kind: 'data_model', summary: 'width', headingRefs: [{ refId: 'REF001', heading: 2, texts: ['Symbol Model'] }], slug: 'symbol_model' },
      { id: 'N0002', title: 'Encoding', kind: 'api_contract', summary: 'encode', headingRefs: [{ refId: 'REF002', heading: 2, texts: ['Encoding'] }], slug: 'encoding' },
      { id: 'N0003', title: 'Unrelated', kind: 'rationale', summary: 'kept', headingRefs: [{ refId: 'REF003', heading: 2, texts: ['Unrelated'] }], slug: 'unrelated', unitIds: ['op-keep'] },
    ],
    edges: [],
  }, null, 2), 'utf8');

  const dirsTree = {
    schemaVersion: '1.0',
    sourceGraph: 'GRAPH.json',
    trees: {
      rust: {
        name: 'src', type: 'directory', children: [
          { name: 'symbol.rs', type: 'file', mappedNodeIds: [{ nodeId: 'N0001' }] },
          { name: 'encoding.rs', type: 'file', mappedNodeIds: [{ nodeId: 'N0002' }] },
        ],
      },
    },
    distribution: { digest: 'a'.repeat(64), units: {} },
  };
  const dirsTreePath = join(root, 'Dirs-Tree.json');
  writeFileSync(dirsTreePath, JSON.stringify(dirsTree, null, 2), 'utf8');

  return { root, specPath, rfcPath, sidecarPath, graphPath, dirsTreePath, sidecar, formulas, dirsTree };
}

// [::TICKET::] PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-361) --for-spec --no-implementation-order`.
function writeHeaders(fixture) {
  const graph = JSON.parse(readFileSync(fixture.graphPath, 'utf8'));
  const entryFor = (nodeId) => {
    const node = graph.nodes.find((candidate) => candidate.id === nodeId);
    return { nodeId, title: node.title, formulaIds: node.formulaIds ?? [] };
  };
  const headerPaths = (file) => ({
    sourceRelPath: 'RFC.md',
    graphRelPath: 'GRAPH.json',
    dirsTreeRelPath: 'Dirs-Tree.json',
    graphDirDisplay: '.',
    claudeDirDisplay: '$(git rev-parse --show-toplevel)/.claude',
    sourceAbsPath: fixture.rfcPath,
    graphAbsPath: fixture.graphPath,
    dirsTreeAbsPath: fixture.dirsTreePath,
    filePath: file,
  });
  mkdirSync(join(fixture.root, 'src'), { recursive: true });
  const symbolHeader = generateHeaderComment(headerPaths('src/symbol.rs'), [entryFor('N0001')], [], 'rust');
  const encodingHeader = generateHeaderComment(headerPaths('src/encoding.rs'), [entryFor('N0002')], [], 'rust');
  writeFileSync(join(fixture.root, 'src', 'symbol.rs'), `${symbolHeader}\n`, 'utf8');
  writeFileSync(join(fixture.root, 'src', 'encoding.rs'), `${encodingHeader}\n`, 'utf8');
}

test('C001 precondition: a dry run attaches the ids and writes nothing', async () => {
  const fixture = buildFixture();
  const before = readFileSync(fixture.graphPath, 'utf8');
  const result = await attachFormulaIds({ ...fixture, write: false });

  assert.equal(result.ok, true, JSON.stringify(result.findings));
  assert.deepEqual(result.formulaIds, fixture.formulas.map((formula) => formula.id).sort());
  assert.equal(readFileSync(fixture.graphPath, 'utf8'), before);
});

test('C001 postcondition: every formula reaches one node and the graph carries the sidecar digest', async () => {
  const fixture = buildFixture();
  await attachFormulaIds({ ...fixture, write: true });
  const graph = JSON.parse(readFileSync(fixture.graphPath, 'utf8'));

  for (const formula of fixture.formulas) {
    const carriers = graph.nodes.filter((node) => (node.formulaIds ?? []).includes(formula.id));
    assert.equal(carriers.length, 1, `${formula.id} must have exactly one node`);
  }
  assert.equal(graph.formulaDigest, computeFormulaDigest(fixture.sidecar));
  assert.deepEqual(graph.nodes.find((node) => node.id === 'N0003').unitIds, ['op-keep'], 'an unrelated node is preserved');
});

test('C001 error: a stale sidecar refuses before the graph is written', async () => {
  const fixture = buildFixture({ sidecarRfcDigest: '0'.repeat(64) });
  const before = readFileSync(fixture.graphPath, 'utf8');
  const result = await attachFormulaIds({ ...fixture, write: true });

  assert.equal(result.ok, false);
  assert.equal(result.findings.some((finding) => finding.code === 'STALE_SIDECAR'), true);
  assert.equal(readFileSync(fixture.graphPath, 'utf8'), before);
});

test('C001 error: a formula whose section has no node is named missing', async () => {
  const fixture = buildFixture();
  const sidecar = JSON.parse(readFileSync(fixture.sidecarPath, 'utf8'));
  sidecar.formulas[0].implementation.rfcSection = 'Absent Section';
  writeFileSync(fixture.sidecarPath, JSON.stringify(sidecar));
  const result = await attachFormulaIds({ ...fixture, write: true });

  assert.equal(result.findings.some((finding) => finding.code === 'MISSING_NODE' && finding.subject === sidecar.formulas[0].id), true);
});

test('C001 error: an id on a graph node and absent from the sidecar is invented', async () => {
  const fixture = buildFixture();
  const graph = JSON.parse(readFileSync(fixture.graphPath, 'utf8'));
  graph.nodes[0].formulaIds = ['fx-ffffffffffff'];
  writeFileSync(fixture.graphPath, JSON.stringify(graph));
  const result = await attachFormulaIds({ ...fixture, write: true });

  assert.equal(result.findings.some((finding) => finding.code === 'INVENTED_FORMULA'), true);
});

test('C001 postcondition: the Dirs-Tree index names node, file and symbol', async () => {
  const fixture = buildFixture();
  await attachFormulaIds({ ...fixture, write: true, dirsTreePath: fixture.dirsTreePath });
  const dirsTree = JSON.parse(readFileSync(fixture.dirsTreePath, 'utf8'));

  for (const formula of fixture.formulas) {
    const entry = dirsTree.distribution.formulas[formula.id];
    assert.ok(entry, `${formula.id} must be indexed`);
    assert.equal(entry.nodeIds.length, 1);
    assert.equal(entry.filePaths.length, 1);
    assert.equal(entry.symbols.length, 1);
  }
  assert.equal(dirsTree.trees.rust.children[0].mappedNodeIds[0].formulaIds.length, 1);
});

test('C001 postcondition: generated headers and the coverage gate agree', async () => {
  const fixture = buildFixture();
  await attachFormulaIds({ ...fixture, write: true, dirsTreePath: fixture.dirsTreePath });
  writeHeaders(fixture);
  const graph = JSON.parse(readFileSync(fixture.graphPath, 'utf8'));
  const dirsTree = JSON.parse(readFileSync(fixture.dirsTreePath, 'utf8'));

  assert.deepEqual(readHeaderFormulaIds(readFileSync(join(fixture.root, 'src/symbol.rs'), 'utf8')), [fixture.formulas[0].id]);
  assert.deepEqual(verifyFormulaFileCoverage({ graph, dirsTree, sidecar: fixture.sidecar, root: fixture.root }), []);
});

test('C001 error: a header that omits its formula is named', async () => {
  const fixture = buildFixture();
  await attachFormulaIds({ ...fixture, write: true, dirsTreePath: fixture.dirsTreePath });
  writeHeaders(fixture);
  const filePath = join(fixture.root, 'src/symbol.rs');
  writeFileSync(filePath, readFileSync(filePath, 'utf8').replace(/^\s*\/\/\s*formulas:.*$/m, ''), 'utf8');
  const graph = JSON.parse(readFileSync(fixture.graphPath, 'utf8'));
  const dirsTree = JSON.parse(readFileSync(fixture.dirsTreePath, 'utf8'));
  const findings = verifyFormulaFileCoverage({ graph, dirsTree, sidecar: fixture.sidecar, root: fixture.root });

  assert.equal(findings.some((finding) => finding.code === 'FORMULA_HEADER_MISSING'), true, JSON.stringify(findings));
});

test('C001 invariant: verify-chain reports a formula set or digest mismatch at each layer', async () => {
  const fixture = buildFixture();
  await attachFormulaIds({ ...fixture, write: true, dirsTreePath: fixture.dirsTreePath });
  const graph = JSON.parse(readFileSync(fixture.graphPath, 'utf8'));
  const dirsTree = JSON.parse(readFileSync(fixture.dirsTreePath, 'utf8'));
  const base = { view: { packageId: 'pkg-1' }, map: { digest: 'a'.repeat(64), packages: [] }, graph, dirsTree, graphPath: fixture.graphPath, stage: 'boundify' };

  const clean = verifyChain(base);
  assert.equal(clean.findings.some((finding) => finding.code === 'FORMULA_SET_MISMATCH' || finding.code === 'FORMULA_DIGEST_MISMATCH'), false, JSON.stringify(clean.findings));

  delete dirsTree.distribution.formulas[fixture.formulas[0].id];
  const missing = verifyChain({ ...base, dirsTree });
  assert.equal(missing.findings.some((finding) => finding.code === 'FORMULA_SET_MISMATCH'), true);

  graph.formulaDigest = '0'.repeat(64);
  const moved = verifyChain({ ...base, graph });
  assert.equal(moved.findings.some((finding) => finding.code === 'FORMULA_DIGEST_MISMATCH'), true);
});

test('C001 boundary: a notation-only formula may have no runtime file but still needs a symbol', async () => {
  const fixture = buildFixture();
  await attachFormulaIds({ ...fixture, write: true, dirsTreePath: fixture.dirsTreePath });
  writeHeaders(fixture);
  const graph = JSON.parse(readFileSync(fixture.graphPath, 'utf8'));
  const dirsTree = JSON.parse(readFileSync(fixture.dirsTreePath, 'utf8'));
  const notation = fixture.formulas[1].id;
  dirsTree.distribution.formulas[notation].filePaths = [];
  assert.deepEqual(verifyFormulaFileCoverage({ graph, dirsTree, sidecar: fixture.sidecar, root: fixture.root }), []);

  dirsTree.distribution.formulas[notation].symbols = [];
  const findings = verifyFormulaFileCoverage({ graph, dirsTree, sidecar: fixture.sidecar, root: fixture.root });
  assert.equal(findings.some((finding) => finding.code === 'FORMULA_WITHOUT_SYMBOL'), true);
});

// PX-390 @verifies C003
/** Write the seed and tree manifest that decide which formulas this package owns. */
// [::TICKET::] PX-390 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-390 --for-spec --no-implementation-order`.
function writeFormulaOwnership(fixture, { sourceSegments = ['seg-1'], segments = [{ id: 'seg-1', line_start: 1, line_end: 10 }] } = {}) {
  const seedPath = join(fixture.root, 'RFC-SEED.md');
  writeFileSync(seedPath, [
    '# RFC Seed',
    '',
    '```json',
    JSON.stringify({
      package: { id: 'pkg-fixture', name: 'fixture', path: '.' },
      source_spec: { path: 'spec.md', sha256: sha256Hex(Buffer.from(SPEC_TEXT, 'utf8')) },
      source_segments: sourceSegments,
    }, null, 2),
    '```',
    '',
  ].join('\n'), 'utf8');
  const treeManifestPath = join(fixture.root, 'WORKSPACIFY-TREE-MANIFEST.json');
  writeFileSync(treeManifestPath, JSON.stringify({
    workspace: { packages: [{ id: 'pkg-fixture', path: '.' }] },
    structure: { segments },
  }), 'utf8');
  return { seedPath, treeManifestPath };
}

test('PX-390 C003 boundary: a package that owns no formula skips without a sidecar', async () => {
  const fixture = buildFixture();
  const ownership = writeFormulaOwnership(fixture, { sourceSegments: [], segments: [] });
  const result = await attachFormulaIds({
    ...fixture,
    sidecarPath: join(fixture.root, 'missing-RFC-FORMULAS.json'),
    specPath: fixture.specPath,
    ...ownership,
    write: true,
  });

  assert.equal(result.ok, true, JSON.stringify(result.findings));
  assert.equal(result.skipped, 'no-formulas');
});

test('PX-390 C003 boundary: a package that owns formulas without a sidecar is named, never ENOENT', async () => {
  const fixture = buildFixture();
  const ownership = writeFormulaOwnership(fixture);
  const before = readFileSync(fixture.graphPath, 'utf8');
  const result = await attachFormulaIds({
    ...fixture,
    sidecarPath: join(fixture.root, 'missing-RFC-FORMULAS.json'),
    specPath: fixture.specPath,
    ...ownership,
    write: true,
  });

  assert.equal(result.ok, false);
  assert.equal(result.findings.some((finding) => finding.code === 'MISSING_FORMULA_SIDECAR'), true, JSON.stringify(result.findings));
  assert.equal(JSON.stringify(result.findings).includes('ENOENT'), false);
  assert.notEqual(result.skipped, 'no-formulas');
  assert.equal(readFileSync(fixture.graphPath, 'utf8'), before);
});

test('PX-390 C003 normal: a section number resolves a full heading and reports it', async () => {
  const fixture = buildFixture();
  const sidecar = JSON.parse(readFileSync(fixture.sidecarPath, 'utf8'));
  sidecar.formulas[0].rfcLocation.section = '14.1';
  delete sidecar.formulas[0].implementation.rfcSection;
  sidecar.formulas[1].rfcLocation.section = '14.2';
  delete sidecar.formulas[1].implementation.rfcSection;
  writeFileSync(fixture.sidecarPath, JSON.stringify(sidecar, null, 2));
  const graph = JSON.parse(readFileSync(fixture.graphPath, 'utf8'));
  graph.nodes[0].title = '14.1 Symbol Model';
  graph.nodes[0].headingRefs[0].texts = ['14.1 Symbol Model'];
  graph.nodes[1].title = '14.2 Encoding';
  graph.nodes[1].headingRefs[0].texts = ['14.2 Encoding'];
  writeFileSync(fixture.graphPath, JSON.stringify(graph, null, 2));

  const result = await attachFormulaIds({ ...fixture, write: false });

  assert.equal(result.ok, true, JSON.stringify(result.findings));
  assert.equal(result.resolvedSections.some((entry) => entry.formulaId === fixture.formulas[0].id && entry.heading === '14.1 Symbol Model'), true);
});

test('PX-390 C003 boundary: section 14.1 does not match heading 14.10', async () => {
  const fixture = buildFixture();
  const sidecar = JSON.parse(readFileSync(fixture.sidecarPath, 'utf8'));
  sidecar.formulas[0].rfcLocation.section = '14.1';
  delete sidecar.formulas[0].implementation.rfcSection;
  writeFileSync(fixture.sidecarPath, JSON.stringify(sidecar, null, 2));
  const graph = JSON.parse(readFileSync(fixture.graphPath, 'utf8'));
  graph.nodes[0].title = '14.10 Symbol Model';
  graph.nodes[0].headingRefs[0].texts = ['14.10 Symbol Model'];
  writeFileSync(fixture.graphPath, JSON.stringify(graph, null, 2));

  const result = await attachFormulaIds({ ...fixture, write: false });

  assert.equal(result.findings.some((finding) => finding.code === 'MISSING_NODE' && finding.subject === sidecar.formulas[0].id), true, JSON.stringify(result.findings));
});
