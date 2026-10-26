// PX-319 @verifies C001 C002 C003 C004 C005
// A unit is placed only when it resolves to a leaf file whose header names it. These
// tests pin the leaf-file index, the default_files source, the header units line and the
// forward coverage gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as helpers from '../../.claude/scripts/rfc-graph/boundify-helpers.js';
import { buildDirectoryTree } from '../../.claude/scripts/rfc-graph/boundify-tree.js';
import {
  buildDistributionIndex,
  collectNodeFilePaths,
  collectNodePaths,
  verifyDistributionCoverage,
} from '../../.claude/scripts/rfc-graph/lib/distribution-index.js';
import { buildNodeToFileMap } from '../../.claude/scripts/rfc-graph/validate-phasify.js';
import { resolveDefaultFiles } from '../../.claude/scripts/tickets/add-tickets-for-phase.js';
import { readHeaderUnitIds } from '../../.claude/scripts/rfc-graph/lib/unit-ids.mjs';
import { generateHeaderComment } from '../../.claude/scripts/rfc-graph/boundify-helpers.js';
import { verifyUnitFileCoverage } from '../../.claude/scripts/rfc-graph/verify-unit-file-coverage.js';

const HEADER_PATHS = {
  sourceBasename: 'RFC.md',
  graphRelPath: 'RFC-GRAPH.json',
  dirsTreeRelPath: 'RFC-Dirs-Tree.json',
  sourceRelPath: 'RFC.md',
  cdCommandPrefix: 'cd .',
  graphFlagForCmd: '--graph="RFC-GRAPH.json"',
  dirsTreeFlagForCmd: '--dirs-tree="RFC-Dirs-Tree.json"',
};

// [::TICKET::] PX-319 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-319 --for-spec --no-implementation-order`.
function architectureGraph(unitIds = ['op-A']) {
  return {
    nodes: [{
      id: 'N0001',
      title: 'Auth',
      kind: 'architecture',
      summary: 'auth',
      language: 'rust',
      slug: 'auth',
      unitIds,
      headingRefs: [{ refId: 'REF001', heading: 2, texts: ['Auth'] }],
    }],
    edges: [],
  };
}

// [::TICKET::] PX-319 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-319 --for-spec --no-implementation-order`.
function treeFor(graph) {
  return buildDirectoryTree(graph, 'rust', helpers);
}

test('C001 an architecture unit gets a designated leaf file', () => {
  const built = treeFor(architectureGraph());
  const leaf = built.files.find((file) => file.path.endsWith('mod.rs'));
  assert.ok(leaf, JSON.stringify(built.files.map((file) => file.path)));
  const entry = leaf.mappedNodeIds.find((mapped) => mapped.nodeId === 'N0001');
  assert.ok(entry);
  assert.deepEqual(entry.unitIds, ['op-A']);
  const filePaths = collectNodeFilePaths({ rust: built.tree });
  assert.ok(filePaths.get('N0001').some((path) => path.endsWith('mod.rs')));
});

test('C001 a directory-only path is unmapped', () => {
  const graph = architectureGraph();
  const built = treeFor(graph);
  const nodePaths = collectNodePaths({ rust: built.tree });
  const directoryOnly = new Map([[...nodePaths.entries()].map(([nodeId, paths]) => [nodeId, paths.filter((path) => !path.endsWith('.rs'))])]);
  const index = buildDistributionIndex(graph, directoryOnly, 'digest', new Map());
  assert.ok(verifyDistributionCoverage({ distribution: index }, graph).unmapped.includes('op-A'));
});

test('C002 default_files uses the leaf file and never a directory', () => {
  const built = treeFor(architectureGraph());
  const map = buildNodeToFileMap({ trees: { rust: built.tree } });
  assert.ok(map.N0001.endsWith('mod.rs'));
  const ticket = { nodeIds: ['N0001'] };
  resolveDefaultFiles([ticket], map);
  assert.deepEqual(ticket.default_files, [map.N0001]);
  assert.equal(ticket.default_files.some((path) => path.endsWith('/')), false);
});

test('C003 the generated header names the node units', () => {
  const header = generateHeaderComment(
    HEADER_PATHS,
    [{ nodeId: 'N0001', title: 'Auth', unitIds: ['op-A', 'seq-S'] }],
    [],
    'RFC.md',
    'rust',
  );
  assert.match(header, /units: op-A, seq-S/);
  assert.deepEqual(readHeaderUnitIds(header), ['op-A', 'seq-S']);
});

test('C004 the coverage gate names a missing file, a missing header and an invented header unit', () => {
  const root = mkdtempSync(join(tmpdir(), 'px319-'));
  try {
    const graph = { nodes: [{ id: 'N0001', kind: 'api_contract', unitIds: ['op-A', 'op-B'] }] };
    const dirsTree = {
      distribution: {
        units: {
          'op-A': { nodeIds: ['N0001'], paths: ['src/auth/mod.rs'], filePaths: ['src/auth/mod.rs'] },
          'op-B': { nodeIds: ['N0001'], paths: ['src/auth/mod.rs'], filePaths: ['src/auth/mod.rs'] },
        },
      },
    };
    mkdirSync(join(root, 'src/auth'), { recursive: true });

    let findings = verifyUnitFileCoverage({ graph, dirsTree, root });
    assert.ok(findings.some((finding) => finding.code === 'UNIT_WITHOUT_FILE'));

    writeFileSync(join(root, 'src/auth/mod.rs'), '// Initial Design Artifact — RFC-driven Implementation\n// node: N0001\n// units: op-A\n');
    findings = verifyUnitFileCoverage({ graph, dirsTree, root });
    assert.ok(findings.some((finding) => finding.code === 'UNIT_WITHOUT_HEADER' && finding.subject === 'op-B'));
    assert.equal(findings.some((finding) => finding.code === 'UNIT_WITHOUT_HEADER' && finding.subject === 'op-A'), false);

    writeFileSync(join(root, 'src/auth/mod.rs'), '// Initial Design Artifact — RFC-driven Implementation\n// node: N0001\n// units: op-A, op-C\n');
    findings = verifyUnitFileCoverage({ graph, dirsTree, root });
    assert.ok(findings.some((finding) => finding.code === 'HEADER_UNIT_NOT_ON_NODE'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C004 a prose node carrying a unit is UNIT_REQUIRES_FILE', () => {
  const root = mkdtempSync(join(tmpdir(), 'px319-prose-'));
  try {
    const graph = { nodes: [{ id: 'N0001', kind: 'rationale', unitIds: ['op-A'] }] };
    const dirsTree = { distribution: { units: { 'op-A': { nodeIds: ['N0001'], paths: [], filePaths: [] } } } };
    const findings = verifyUnitFileCoverage({ graph, dirsTree, root });
    assert.ok(findings.some((finding) => finding.code === 'UNIT_REQUIRES_FILE'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C005 an existing reverse header is preserved and accepted', () => {
  const root = mkdtempSync(join(tmpdir(), 'px319-reverse-'));
  try {
    const before = '// Initial Design Artifact — RFC-driven Implementation\n// node: N0001\n// units: op-A\n';
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src/a.rs'), before);
    const graph = { nodes: [{ id: 'N0001', kind: 'api_contract', unitIds: ['op-A'] }] };
    const dirsTree = { distribution: { units: { 'op-A': { nodeIds: ['N0001'], paths: ['src/a.rs'], filePaths: ['src/a.rs'] } } } };
    const findings = verifyUnitFileCoverage({ graph, dirsTree, root });
    assert.equal(findings.length, 0, JSON.stringify(findings));
    assert.equal(readFileSync(join(root, 'src/a.rs'), 'utf8'), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
