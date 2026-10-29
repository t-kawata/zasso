// [::TICKET::] PX-341 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-341 --for-spec --no-implementation-order`.
// PX-315 graph-side contracts: package-scoped boundary projection, carrying edge,
// execution order and fail-closed error shape.
// @verifies C001
// @verifies C002
// @verifies C007
// @verifies C008
// @verifies C009
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  mapDigest,
  viewDigest,
} = require('../../.claude/scripts/sequences-slice/lib/distribution-map.mjs');

const {
  projectBoundaryContracts,
  verifyBoundaryContracts,
} = require('../../.claude/scripts/rfc-graph/project-boundary-contracts.js');
const { assignUnitIdsFromMap } = require('../../.claude/scripts/rfc-graph/lib/unit-ids.mjs');
const { verifyGraphContracts } = require('../../.claude/scripts/tickets/verify-graph-contracts.js');
const {
  boundaryContractProjection,
  boundaryNote,
  carryingEdgeFor,
} = require('../../.claude/scripts/sequences-slice/lib/boundary-contract.mjs');

const ROOT = path.resolve(__dirname, '../..');

const REGISTRY = [
  {
    boundary_id: 'boundary-001',
    provider_package: 'pkg-0001',
    consumer_package: 'pkg-0002',
    clauses: { preconditions: ['identity present'], postconditions: ['order_id derived'], invariants: ['one active order_id'] },
  },
  {
    boundary_id: 'boundary-002',
    provider_package: 'pkg-0002',
    consumer_package: 'pkg-0003',
    clauses: { preconditions: ['foreign provider'], postconditions: ['foreign consumer'], invariants: ['foreign invariant'] },
  },
];

const VIEW = {
  packageId: 'pkg-0001',
  obligationUnits: [{ unitId: 'ctr-boundary-001', direction: 'provides', counterpart: 'pkg-0002' }],
};

// [::TICKET::] PX-315 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-315) --for-spec --no-implementation-order`.
function graphWithLocalBoundary() {
  return {
    nodes: [
      { id: 'N0001', headingRefs: [{ refId: 'REF001', heading: 2, texts: ['1. Boundary'] }], unitIds: ['ctr-boundary-001'] },
      { id: 'N0002', headingRefs: [{ refId: 'REF002', heading: 2, texts: ['2. Operation'] }], unitIds: ['op-X'] },
    ],
    edges: [{
      from: 'N0001',
      to: 'N0002',
      type: 'depends_on',
      attributes: { strength: 'hard', bidirectional: false },
      contracts: [],
    }],
  };
}

test('C001 projection is scoped to the ctr units the package graph carries', () => {
  const projected = projectBoundaryContracts({ graph: graphWithLocalBoundary(), registry: REGISTRY, view: VIEW });
  const contractIds = projected.edges[0].contracts.map((contract) => contract.id);
  assert.ok(contractIds.includes('C900'));
  assert.equal(contractIds.includes('C901'), false);
  assert.match(projected.edges[0].attributes.note, /boundary-001/);
  assert.doesNotMatch(projected.edges[0].attributes.note, /boundary-002/);
  assert.deepEqual(verifyBoundaryContracts(projected, REGISTRY, { view: VIEW }), []);
});

test('C001 a package with no local ctr unit projects nothing and does not throw', () => {
  const graph = graphWithLocalBoundary();
  graph.nodes = graph.nodes.filter((node) => node.id !== 'N0001');
  graph.edges = [];
  const projected = projectBoundaryContracts({ graph, registry: REGISTRY, view: VIEW });
  assert.deepEqual(projected.edges, []);
});

test('C002 the map units are attached before the boundary projection', () => {
  const map = {
    schemaVersion: 1,
    packageId: 'pkg-0001',
    sourceViewDigest: 'a'.repeat(64),
    units: [
      { unitId: 'ctr-boundary-001', kind: 'contract', owners: ['pkg-0001'], sections: ['1. Boundary'], ground: 'fixture' },
      { unitId: 'op-X', kind: 'operation', owners: ['pkg-0001'], sections: ['2. Operation'], ground: 'fixture' },
    ],
    residuals: [],
    digest: 'b'.repeat(64),
  };
  const rfcText = [
    '# Package',
    '',
    '## 1. Boundary',
    '',
    'content',
    '',
    '## 2. Operation',
    '',
    'content',
  ].join('\n');
  const attached = assignUnitIdsFromMap(graphWithLocalBoundaryWithoutUnits(), map, rfcText);
  assert.deepEqual(attached.missing, []);
  assert.deepEqual(attached.graph.nodes.find((node) => node.id === 'N0001').unitIds, ['ctr-boundary-001']);

  const projected = projectBoundaryContracts({ graph: attached.graph, registry: REGISTRY, view: VIEW });
  assert.equal(projected.edges[0].contracts.filter((contract) => contract.id.startsWith('C9')).length, 1);
});

test('C007 the carrying edge is the boundary edge, not the first touching edge', () => {
  const graph = {
    nodes: [
      { id: 'N0001', unitIds: ['ctr-boundary-001'] },
      { id: 'N0002', unitIds: ['op-X'] },
      { id: 'N0003', unitIds: ['op-Y'] },
    ],
    edges: [
      { from: 'N0001', to: 'N0002', type: 'references', contracts: [] },
      { from: 'N0001', to: 'N0003', type: 'depends_on', contracts: [] },
    ],
  };
  const edge = carryingEdgeFor(graph, [graph.nodes[0]], REGISTRY[0], { direction: 'provides' });
  assert.equal(edge.type, 'depends_on');
  assert.equal(edge.to, 'N0003');
});

test('C007 verify-graph-contracts reads the carrying edge, not the first touching edge', () => {
  const row = REGISTRY[0];
  const graph = {
    nodes: [
      { id: 'N0001', unitIds: ['ctr-boundary-001'] },
      { id: 'N0002', unitIds: ['op-X'] },
      { id: 'N0003', unitIds: ['op-Y'] },
    ],
    edges: [
      { from: 'N0001', to: 'N0002', type: 'references', attributes: {}, contracts: [] },
      { from: 'N0001', to: 'N0003', type: 'depends_on', attributes: { note: boundaryNote(row) }, contracts: [boundaryContractProjection(row, 'C900')] },
    ],
  };
  const errors = verifyGraphContracts(graph, {
    registryBoundaryIds: ['boundary-001'],
    registryContracts: [row],
    view: VIEW,
  });
  assert.deepEqual(errors, []);
});

test('C007 two equally valid carrying edges are refused as ambiguous', () => {
  const graph = {
    nodes: [
      { id: 'N0001', unitIds: ['ctr-boundary-001'] },
      { id: 'N0002', unitIds: ['op-X'] },
      { id: 'N0003', unitIds: ['op-Y'] },
    ],
    edges: [
      { from: 'N0001', to: 'N0002', type: 'depends_on', contracts: [] },
      { from: 'N0001', to: 'N0003', type: 'depends_on', contracts: [] },
    ],
  };
  assert.equal(carryingEdgeFor(graph, [graph.nodes[0]], REGISTRY[0], { direction: 'provides' }), null);
  assert.throws(
    () => projectBoundaryContracts({ graph, registry: [REGISTRY[0]], view: VIEW }),
    (error) => error.code === 'AMBIGUOUS_BOUNDARY_EDGE',
  );
});

test('C008 a missing registry is a named three-line refusal, not a stack trace', () => {
  const script = path.join(ROOT, '.claude/scripts/rfc-graph/project-boundary-contracts.js');
  const result = spawnSync(process.execPath, [script, '--graph=missing-GRAPH.json', '--registry=missing.json'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^\[ERROR\]/m);
  assert.match(result.stderr, /Cause: .+/);
  assert.match(result.stderr, /Action: .+/);
  assert.equal(result.stderr.includes('    at '), false);
});

test('C008 admission refuses an unreadable view with a named code', () => {
  const script = path.join(ROOT, '.claude/scripts/rfc-graph/attach-unit-ids.js');
  const result = spawnSync(process.execPath, [script, '--admit', '--rfc=missing-RFC.md', '--view=missing-SEQUENCES.json'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /MISSING_VIEW/);
  assert.equal(result.stderr.includes('    at '), false);
});

test('C009 the graphify command orders attach, annotate and project', () => {
// [::TICKET::] PX-332 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-332 --for-spec --no-implementation-order`.
  const content = readFileSync(path.join(ROOT, '.claude/commands/graphify-rfc.md'), 'utf8');
  const attach = content.indexOf('attach-unit-ids.js" --graph=');
  const annotate = content.indexOf('annotate-contracts.js" "$graphPath"');
  const project = content.indexOf('project-boundary-contracts.js" --graph=');
  assert.ok(attach >= 0, 'attach-unit-ids --graph must be present');
  assert.ok(annotate >= 0, 'annotate-contracts must be present');
  assert.ok(project >= 0, 'project-boundary-contracts must be present');
  assert.ok(attach < annotate, 'attach must run before annotate');
  assert.ok(annotate < project, 'annotate must run before project');
  assert.equal(content.includes('annotate-contracts.js "$1"'), false,
    'the RFC path must not be passed to the graph annotator');
  assert.match(content, /MISSING_SIDECAR/);
  assert.match(content, /AMBIGUOUS_BOUNDARY_EDGE/);
});

test('C002 verify-chain resolves the map from the graph sourceFile', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'px315-map-path-'));
  try {
    const view = {
      packageId: 'pkg-0001',
      ownedOperationUnits: [{ unitId: 'op-A', operationId: 'A', ownerPackageIds: ['pkg-0001'], roleCandidate: 'implementer' }],
      ownedSequenceUnits: [],
      crossBoundarySequenceUnits: [],
      obligationUnits: [],
    };
    const map = {
      schemaVersion: 1,
      packageId: 'pkg-0001',
      sourceViewDigest: viewDigest(view),
      units: [{ unitId: 'op-A', kind: 'operation', owners: ['pkg-0001'], sections: ['1'], ground: 'fixture' }],
      residuals: [],
    };
    map.digest = mapDigest(map);
    writeFileSync(path.join(directory, 'SPEC.md'), `# Package\n\n\`\`\`json distribution-map\n${JSON.stringify(map, null, 2)}\n\`\`\`\n`);
    writeFileSync(path.join(directory, 'SEQUENCES.json'), JSON.stringify(view));
    writeFileSync(path.join(directory, 'P-GRAPH.json'), JSON.stringify({
      sourceFile: 'SPEC.md',
      mainLanguage: 'rust',
      distributionDigest: map.digest,
      nodes: [{ id: 'N0001', unitIds: ['op-A'] }],
      edges: [],
    }));

    const script = path.join(ROOT, '.claude/scripts/sequences-slice/verify-chain.mjs');
    const result = spawnSync(process.execPath, [script, '--stage=graphify', `--package=${directory}`], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('C002 verify-chain resolves an invocation-relative sourceFile beside the graph', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'px315-map-path-nested-'));
  try {
    const packageDirectory = path.join(directory, 'crates', 'foo');
    const view = {
      packageId: 'pkg-0001',
      ownedOperationUnits: [{ unitId: 'op-A', operationId: 'A', ownerPackageIds: ['pkg-0001'], roleCandidate: 'implementer' }],
      ownedSequenceUnits: [],
      crossBoundarySequenceUnits: [],
      obligationUnits: [],
    };
    const map = {
      schemaVersion: 1,
      packageId: 'pkg-0001',
      sourceViewDigest: viewDigest(view),
      units: [{ unitId: 'op-A', kind: 'operation', owners: ['pkg-0001'], sections: ['1'], ground: 'fixture' }],
      residuals: [],
    };
    map.digest = mapDigest(map);
    // The sourceFile is relative to the invocation directory, not the package directory.
    // The graph and the RFC still sit together, so the resolver must fall back to them.
    const sourceFile = 'crates/foo/SPEC.md';
    mkdirSync(packageDirectory, { recursive: true });
    writeFileSync(path.join(packageDirectory, 'SPEC.md'), `# Package\n\n\`\`\`json distribution-map\n${JSON.stringify(map, null, 2)}\n\`\`\`\n`);
    writeFileSync(path.join(packageDirectory, 'SEQUENCES.json'), JSON.stringify(view));
    writeFileSync(path.join(packageDirectory, 'P-GRAPH.json'), JSON.stringify({
      sourceFile,
      mainLanguage: 'rust',
      distributionDigest: map.digest,
      nodes: [{ id: 'N0001', unitIds: ['op-A'] }],
      edges: [],
    }));

    const script = path.join(ROOT, '.claude/scripts/sequences-slice/verify-chain.mjs');
    const result = spawnSync(process.execPath, [script, '--stage=graphify', `--package=${packageDirectory}`], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

// [::TICKET::] PX-315 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-315) --for-spec --no-implementation-order`.
function graphWithLocalBoundaryWithoutUnits() {
  const graph = graphWithLocalBoundary();
  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({ ...node, unitIds: [] })),
  };
}
