const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  projectBoundaryContracts,
  verifyBoundaryContracts,
} = require('../../.claude/scripts/rfc-graph/project-boundary-contracts.js');
const { parseBoundaryNoteRows } = require('../../.claude/scripts/sequences-slice/lib/boundary-contract.mjs');

const REGISTRY = [{
  boundary_id: 'boundary-001',
  provider_package: 'pkg-0001',
  consumer_package: 'pkg-0002',
  clauses: {
    preconditions: ['identity present'],
    postconditions: ['order_id derived'],
    invariants: ['one active order_id'],
  },
}];

// [::TICKET::] PX-312, PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313) --for-spec --no-implementation-order`.
function graphFixture() {
  return {
    nodes: [
      { id: 'N0001', unitIds: ['ctr-boundary-001'] },
      { id: 'N0002', unitIds: ['op-ProduceFact'] },
    ],
    edges: [{
      from: 'N0001',
      to: 'N0002',
      type: 'depends_on',
      attributes: { strength: 'hard', bidirectional: false },
      contracts: [{ id: 'C001', precondition: 'old', postcondition: 'old', invariant: 'old' }],
    }],
  };
}

test('the projection is a new graph and keeps the existing contract', () => {
  const graph = graphFixture();
  const projected = projectBoundaryContracts({ graph, registry: REGISTRY });
  assert.notEqual(projected, graph);
  assert.equal(graph.edges[0].contracts.length, 1);
  assert.equal(projected.edges[0].contracts.length, 2);
  assert.equal(projected.edges[0].contracts[0].id, 'C001');
});

test('the projected contract uses a valid C9xx id, the canonical clauses and the registry digest note', () => {
  const projected = projectBoundaryContracts({ graph: graphFixture(), registry: REGISTRY });
  const contract = projected.edges[0].contracts.find((entry) => entry.id === 'C900');
  assert.ok(contract, 'the deterministic C900 contract is present');
  assert.equal(contract.precondition, 'identity present');
  assert.equal(contract.postcondition, 'order_id derived');
  assert.equal(contract.invariant, 'one active order_id');
  assert.match(projected.edges[0].attributes.note, /^registry:boundary-001;digest:[0-9a-f]{64}$/);
});

test('a matching graph has no verification finding', () => {
  const projected = projectBoundaryContracts({ graph: graphFixture(), registry: REGISTRY });
  assert.deepEqual(verifyBoundaryContracts(projected, REGISTRY), []);
});

test('a changed projection is BOUNDARY_CONTRACT_MISMATCH', () => {
  const projected = projectBoundaryContracts({ graph: graphFixture(), registry: REGISTRY });
  projected.edges[0].contracts.find((entry) => entry.id === 'C900').precondition = 'tampered';
  const findings = verifyBoundaryContracts(projected, REGISTRY);
  assert.ok(findings.some((finding) => finding.code === 'BOUNDARY_CONTRACT_MISMATCH'));
});

test('a changed note digest is BOUNDARY_CONTRACT_MISMATCH', () => {
  const projected = projectBoundaryContracts({ graph: graphFixture(), registry: REGISTRY });
  projected.edges[0].attributes.note = `registry:boundary-001;digest:${'0'.repeat(64)}`;
  const findings = verifyBoundaryContracts(projected, REGISTRY);
  assert.ok(findings.some((finding) => finding.code === 'BOUNDARY_CONTRACT_MISMATCH'));
});

// [::TICKET::] PX-314 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-314 --for-spec --no-implementation-order`.
function manyBoundaryFixture() {
  const registry = Array.from({ length: 20 }, (_, index) => ({
    boundary_id: `boundary-${String(index + 1).padStart(3, '0')}`,
    clauses: {
      preconditions: [`pre-${index}`],
      postconditions: [`post-${index}`],
      invariants: [`inv-${index}`],
    },
  }));
  const graph = {
    nodes: [
      { id: 'N0001', unitIds: registry.map((row) => `ctr-${row.boundary_id}`) },
      { id: 'N0002', unitIds: ['op-ProduceFact'] },
    ],
    edges: [{
      from: 'N0001',
      to: 'N0002',
      type: 'depends_on',
      attributes: { strength: 'hard', bidirectional: false },
      contracts: [],
    }],
  };
  return { graph, registry };
}

test('C008 a note over 240 characters writes a sidecar and verify reads it', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'px314-sidecar-'));
  try {
    const sidecarPath = path.join(directory, 'RFC-BOUNDARY-CONTRACTS.json');
    const { graph, registry } = manyBoundaryFixture();
    const projected = projectBoundaryContracts({ graph, registry, sidecarPath });
    const note = parseBoundaryNoteRows(projected.edges[0].attributes.note);
    assert.ok(note.sidecar.endsWith('RFC-BOUNDARY-CONTRACTS.json'));
    assert.ok(fs.existsSync(sidecarPath));
    assert.deepEqual(verifyBoundaryContracts(projected, registry, { sidecarPath }), []);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('C008 a tampered sidecar is BOUNDARY_CONTRACT_MISMATCH', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'px314-sidecar-'));
  try {
    const sidecarPath = path.join(directory, 'RFC-BOUNDARY-CONTRACTS.json');
    const { graph, registry } = manyBoundaryFixture();
    const projected = projectBoundaryContracts({ graph, registry, sidecarPath });
    const sidecar = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));
    sidecar.boundaries['boundary-001'].clauses.preconditions = ['tampered'];
    fs.writeFileSync(sidecarPath, JSON.stringify(sidecar));
    const findings = verifyBoundaryContracts(projected, registry, { sidecarPath });
    assert.ok(findings.some((finding) => finding.code === 'BOUNDARY_CONTRACT_MISMATCH'));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

// [::TICKET::] PX-314 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-314 --for-spec --no-implementation-order`.
function twoEdgeOverflowFixture() {
  const makeId = (index) => `boundary-${String(index).padStart(3, '0')}-${'x'.repeat(30)}`;
  const registry = Array.from({ length: 12 }, (_, index) => ({
    boundary_id: makeId(index + 1),
    clauses: { preconditions: [`pre-${index}`], postconditions: [`post-${index}`], invariants: [`inv-${index}`] },
  }));
  const graph = {
    nodes: [
      { id: 'N0001', unitIds: registry.slice(0, 6).map((row) => `ctr-${row.boundary_id}`) },
      { id: 'N0002', unitIds: ['op-ProduceFact'] },
      { id: 'N0003', unitIds: registry.slice(6).map((row) => `ctr-${row.boundary_id}`) },
      { id: 'N0004', unitIds: ['op-ConsumeFact'] },
    ],
    edges: [
      { from: 'N0001', to: 'N0002', type: 'depends_on', attributes: { strength: 'hard', bidirectional: false }, contracts: [] },
      { from: 'N0003', to: 'N0004', type: 'depends_on', attributes: { strength: 'hard', bidirectional: false }, contracts: [] },
    ],
  };
  return { graph, registry };
}

test('C008 two overflowing edges keep their own note digests', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'px314-sidecar-'));
  try {
    const sidecarPath = path.join(directory, 'RFC-BOUNDARY-CONTRACTS.json');
    const { graph, registry } = twoEdgeOverflowFixture();
    const projected = projectBoundaryContracts({ graph, registry, sidecarPath });
    for (const edge of projected.edges) {
      assert.equal(parseBoundaryNoteRows(edge.attributes.note).sidecar, 'RFC-BOUNDARY-CONTRACTS.json');
    }
    assert.deepEqual(verifyBoundaryContracts(projected, registry, { sidecarPath }), []);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
