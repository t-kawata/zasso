'use strict';

/**
 * PX-407 — calibration definitions for the registered mechanical detectors.
 *
 * Each definition invokes the detector's real exported logic on a clean fixture
 * and on the same fixture with one defect. The gate never reimplements a
 * detector: it calls the module the runner script wraps.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { findContractDeliveryGaps } = require('../verify-contract-delivery.js');
const { findOperationDeliveryGaps } = require('../verify-operation-delivery.js');
const { findAcceptanceGaps } = require('../verify-acceptance-coverage.js');
const { formulaResultToFindings } = require('../verify-formula-delivery.js');
const { scanContractCoverage } = require('../verify-red-coverage.js');
const { verifyClosure } = require('../verify-ticket-closure.js');
const { checkNodesIntegrity, checkEdgesIntegrity } = require('../../rfc-graph/verify-graph-integrity.js');
const { validateFiles } = require('../../rfc-graph/validate-dirs-tree-schema.js');
const { verifyChain } = require('../../sequences-slice/verify-chain.mjs');
const { validateStubFormat } = require('../validate-stub-format.js');
const { scanDirectory } = require('../scan-incomplete-implementations.js');
const { runAllChecks } = require('../review/run-quality-checks.js');
const { mergeFormulasToTickets } = require('../merge-formulas-to-tickets.js');
const { extractFormulas, uniqueFormulas } = require('../../spec-formula/index.mjs');
const { sha256Hex } = require('../../workspacify-tree/lib/hash.mjs');
const { buildInventory, reconcileSource } = require('./inventory.js');
const { scanClauseCoverage } = require('./coverage-map.js');
const { runDetectionProof } = require('./proof-engine.js');
const { inputsDigestOf } = require('./proof-inputs.js');
const { buildTestIndex } = require('../build-test-index.js');

// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function withTempRoot(prefix, run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    return run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function writeJson(root, name, value) {
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
  return file;
}

// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function baseTicket(overrides = {}) {
  return {
    id: 1,
    phaseId: 0,
    status: 'todo',
    title: 'Fixture',
    contracts: [],
    acceptanceCriteria: [],
    testUnit: [],
    testIntegration: [],
    testExceptions: [],
    ...overrides,
  };
}

// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function contractTicket() {
  return baseTicket({
    contracts: [{ id: 'C001', precondition: 'order exists', postcondition: 'order saved', invariant: 'no duplicate' }],
    testUnit: ['UT: C001 order exists; order saved; no duplicate'],
  });
}

// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function operationTicket() {
  return baseTicket({
    testUnit: ['UT: op-A finality done', 'IT: op-A POST /a'],
    distribution: { units: [{ unitId: 'op-A', kind: 'operation', role: 'implementer', obligation: { mode: 'implement', finalityPredicate: 'done', rest: 'POST /a' } }] },
  });
}

// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function acceptanceTicket() {
  return baseTicket({ acceptanceCriteria: ['the order is saved'], testUnit: ['UT: the order is saved'] });
}

// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function closureFixture() {
  const contract = (id, sourceEdge, pre, post) => ({ id, sourceEdge, precondition: pre, postcondition: post, invariant: 'mem' });
  const graph = {
    sourceFile: 'fixture.md',
    mainLanguage: 'rust',
    contractChain: 'transition',
    nodes: [{ id: 'N0001', title: 'A' }, { id: 'N0002', title: 'B' }, { id: 'N0003', title: 'C' }],
    edges: [
      { from: 'N0001', to: 'N0002', type: 'depends_on', attributes: { strength: 'hard', bidirectional: false }, contracts: [contract('C001', 'N0001→N0002', 'key loaded', 'token')] },
      { from: 'N0002', to: 'N0003', type: 'depends_on', attributes: { strength: 'hard', bidirectional: false }, contracts: [contract('C002', 'N0002→N0003', 'token', 'session active')] },
    ],
  };
  const tickets = [baseTicket({
    nodeIds: ['N0001', 'N0002', 'N0003'],
    contracts: [contract('C001', 'N0001→N0002', 'key loaded', 'token'), contract('C002', 'N0002→N0003', 'token', 'session active')],
  })];
  return { tickets, graph };
}

// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function graphFixture() {
  const graph = {
    nodes: [{ id: 'N0001', title: 'A', kind: 'architecture' }, { id: 'N0002', title: 'B', kind: 'config' }],
    edges: [{ from: 'N0001', to: 'N0002', type: 'depends_on' }],
  };
  return { before: graph, after: JSON.parse(JSON.stringify(graph)) };
}

// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function dirsFixture(root, seeded) {
  const graphPath = writeJson(root, 'RFC-GRAPH.json', { nodes: [{ id: 'N0001' }, { id: 'N0002' }], edges: [] });
  const dirsTree = {
    schemaVersion: '1.0',
    generatedAt: '2026-01-01T00:00:00.000Z',
    sourceGraph: 'fixture',
    analysis: { nodeCount: 2, kindCounts: { config: 1 }, edgeTypeCounts: {} },
    trees: {
      rust: {
        name: 'rust',
        type: 'directory',
        kind: 'architecture',
        children: [{ name: 'a.rs', type: 'file', kind: 'config', mappedNodeIds: [seeded ? 'N9999' : 'N0001'] }],
      },
    },
    dependencyDirections: { rust: [] },
    warnings: [],
  };
  const dirsPath = writeJson(root, 'RFC-Dirs-Tree.json', dirsTree);
  return { graphPath, dirsPath };
}

// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function chainFixture() {
  const registry = [{
    boundary_id: 'boundary-001',
    provider_package: 'pkg-0001',
    consumer_package: 'pkg-0002',
    clauses: { preconditions: ['identity present'], postconditions: ['order_id derived'], invariants: ['one active order_id'] },
  }];
  const { viewDigest, mapDigest } = require('../../sequences-slice/lib/distribution-map.mjs');
  const { digestValue } = require('../../sequences-slice/lib/digest.mjs');
  const { boundaryClauseDigest, boundaryContractProjection, boundaryNote } = require('../../sequences-slice/lib/boundary-contract.mjs');
  const view = {
    packageId: 'pkg-0001',
    ownedOperationUnits: [{ unitId: 'op-ProduceFact', operationId: 'ProduceFact', ownerPackageIds: ['pkg-0001'] }],
    ownedSequenceUnits: [{ unitId: 'seq-A-1', sequenceId: 'A-1', ownerPackageIds: ['pkg-0001'], steps: [{ order: 0, stepId: 'A-1__ProduceFact', operationId: 'ProduceFact', line: 1 }] }],
    crossBoundarySequenceUnits: [],
    obligationUnits: [{ unitId: 'ctr-boundary-001', kind: 'contract', subject: 'boundary-001', relation: 'carries', direction: 'provides', counterpart: 'pkg-0002' }],
  };
  const map = {
    schemaVersion: 1,
    packageId: 'pkg-0001',
    sourceViewDigest: viewDigest(view),
    units: [
      { unitId: 'op-ProduceFact', kind: 'operation', role: 'implementer', owners: ['pkg-0001'], sections: ['1.1'], ground: 'fixture' },
      { unitId: 'seq-A-1', kind: 'sequence', owners: ['pkg-0001'], sections: ['1.1'], ground: 'fixture' },
      { unitId: 'ctr-boundary-001', kind: 'contract', owners: ['pkg-0001'], sections: ['1.1'], ground: 'fixture' },
    ],
    residuals: [],
  };
  map.digest = mapDigest(map);
  const registryContract = boundaryContractProjection(registry[0], 'C900');
  const graph = {
    distributionDigest: map.digest,
    nodes: [{ id: 'N0001', unitIds: ['ctr-boundary-001'] }, { id: 'N0002', unitIds: ['op-ProduceFact', 'seq-A-1'] }],
    edges: [{ from: 'N0001', to: 'N0002', type: 'depends_on', attributes: { strength: 'hard', bidirectional: false, note: boundaryNote(registry[0]) }, contracts: [registryContract] }],
  };
  const dirsTree = { distribution: { digest: map.digest, units: { 'op-ProduceFact': { nodeIds: ['N0002'], paths: ['src/produce.rs'] }, 'seq-A-1': { nodeIds: ['N0002'], paths: ['src/produce.rs'] }, 'ctr-boundary-001': { nodeIds: ['N0001'], paths: ['src/boundary.rs'] } } } };
  const ticketUnits = [
    { unitId: 'op-ProduceFact', kind: 'operation', obligation: { mode: 'implement' } },
    { unitId: 'seq-A-1', kind: 'sequence', obligation: { mode: 'steps', steps: [{ order: 0, stepId: 'A-1__ProduceFact', operationId: 'ProduceFact', line: 1 }] } },
    { unitId: 'ctr-boundary-001', kind: 'contract', obligation: { mode: 'obligation' } },
  ];
  const ticketDigest = digestValue({ sourceMapDigest: map.digest, sourceViewDigest: map.sourceViewDigest, units: ticketUnits });
  const tickets = {
    distribution: { sourceMapDigest: map.digest, sourceViewDigest: map.sourceViewDigest, ticketDigests: { 1: ticketDigest }, digest: digestValue({ ticketDigests: { 1: ticketDigest } }) },
    phases: [{ id: 0, tickets: [{ id: 1, nodeIds: ['N0001', 'N0002'], distribution: { sourceMapDigest: map.digest, sourceViewDigest: map.sourceViewDigest, units: ticketUnits, digest: ticketDigest }, contracts: [{ ...registryContract, id: 'contract-boundary-001', boundaryId: 'boundary-001', registryContractId: 'contract-boundary-001', clauseDigest: boundaryClauseDigest(registry[0]) }] }] }],
  };
  const artifact = { operations: [{ id: 'ProduceFact', disposition: 'active', result_object_classes: ['Thing'] }], sequences: [{ id: 'A-1', outcome: 'singleStep' }], steps: [{ id: 'A-1__ProduceFact', sequence: 'A-1', operation: 'ProduceFact', order: 1, line: 1 }] };
  const treeManifest = { inventory: { objects: [{ canonical_name: 'Thing', owner_package: 'pkg-0001' }] } };
  return { view, map, graph, dirsTree, tickets, registry, artifact, treeManifest };
}

// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function formulaFixture(root, seeded) {
  const specText = ['# Specification', '', '\\[ M=2^b \\]', ''].join('\n');
  const specPath = path.join(root, 'spec.md');
  fs.writeFileSync(specPath, specText, 'utf8');
  const formulas = uniqueFormulas(extractFormulas(specText));
  const sidecar = {
    version: 1,
    specDigest: sha256Hex(Buffer.from(specText, 'utf8')),
    rfcDigest: 'a'.repeat(64),
    specPath: 'spec.md',
    rfcPath: 'RFC.md',
    formulas: formulas.map((formula) => ({
      id: formula.id,
      digest: formula.digest,
      body: formula.body,
      display: formula.display,
      normalized: formula.normalized,
      specLocation: { path: 'spec.md', lineStart: formula.lineStart, lineEnd: formula.lineStart },
      rfcLocation: { section: 'Design', lineStart: 1, lineEnd: 1 },
      theory: { symbols: [{ symbol: 'M', definition: 'bit width' }], normative: [formula.body.trim()] },
      implementation: { class: 'structural', rfcSection: 'Design', location: 'src/symbol.rs#WIDTH', symbols: seeded ? [] : ['src/symbol.rs#WIDTH'], design: 'A named constant carries the value.', verification: 'tests/symbol.rs::width' },
      tests: seeded ? [] : ['tests/symbol.rs::width'],
    })),
  };
  const sidecarPath = writeJson(root, 'RFC-FORMULAS.json', sidecar);
  const dirsTree = {
    distribution: {
      digest: 'a'.repeat(64),
      units: {},
      formulas: Object.fromEntries(sidecar.formulas.map((formula) => [formula.id, { nodeIds: ['N0001'], filePaths: ['src/symbol.rs'], symbols: seeded ? [] : formula.implementation.symbols }])),
    },
  };
  const dirsTreePath = writeJson(root, 'RFC-Dirs-Tree.json', dirsTree);
  const ticketsPath = writeJson(root, 'Tickets.json', {
    title: 'fixture',
    metadata: { source: 'test', generatedAt: '2026-01-01' },
    phases: [{ id: -1, name: 'PX', tickets: [{ id: 1, phaseId: -1, title: 'Implement the symbol', status: 'todo', contracts: [], nodeIds: ['N0001'], default_files: ['src/symbol.rs'] }] }],
  });
  const result = mergeFormulasToTickets({ ticketsPath, dirsTreePath, sidecarPath, specPath, treeManifestPath: null, write: false });
  return formulaResultToFindings(result, { ticketKey: 'PX-1', ticketsPath, rerun: 'calibration' });
}

const DEFINITIONS = Object.freeze({
  'contract-delivery': {
    seededDefect: 'remove the contract test entry',
    run: (seeded) => findContractDeliveryGaps(seeded ? { ...contractTicket(), testUnit: [] } : contractTicket(), 'P0-1', 'Tickets.json'),
  },
  'operation-delivery': {
    seededDefect: 'remove the operation test entries',
    run: (seeded) => findOperationDeliveryGaps(seeded ? { ...operationTicket(), testUnit: [] } : operationTicket(), 'P0-1', 'Tickets.json'),
  },
  'acceptance-coverage': {
    seededDefect: 'remove the acceptance test entry',
    run: (seeded) => findAcceptanceGaps(seeded ? { ...acceptanceTicket(), testUnit: [] } : acceptanceTicket(), 'P0-1', 'Tickets.json'),
  },
  'formula-delivery': {
    seededDefect: 'remove the formula implementation and test symbols',
    run: (seeded) => withTempRoot('px407-formula-', (root) => formulaFixture(root, seeded)),
  },
  'red-coverage': {
    seededDefect: 'remove the @verifies annotation',
    run: (seeded) => {
      const result = scanContractCoverage(seeded ? 'test body' : '// @verifies C001\ntest body', new Set(['C001']));
      return result.missing.map((id) => ({ code: 'RED_CONTRACT_UNCOVERED', assetId: id }));
    },
  },
  'ticket-closure': {
    seededDefect: 'break the contract chain postcondition',
    run: (seeded) => {
      const fixture = closureFixture();
      if (seeded) {
        fixture.tickets[0].contracts[0].postcondition = 'something else';
        fixture.graph.edges[0].contracts[0].postcondition = 'something else';
      }
      return verifyClosure(fixture.tickets, fixture.graph).errors.map((error) => ({ code: error.code ?? 'CONTRACT_CHAIN_OPEN', problem: error.detail ?? error.message ?? String(error) }));
    },
  },
  'graph-integrity': {
    seededDefect: 'add a node to the graph',
    run: (seeded) => {
      const fixture = graphFixture();
      if (seeded) fixture.after.nodes.push({ id: 'N9999', title: 'extra', kind: 'config' });
      return [...checkNodesIntegrity(fixture.after, fixture.before).errors, ...checkEdgesIntegrity(fixture.after, fixture.before).errors]
        .map((problem) => ({ code: 'GRAPH_INTEGRITY_FAILED', problem }));
    },
  },
  'dirs-tree-schema': {
    seededDefect: 'map a file to a node the graph does not carry',
    run: (seeded) => withTempRoot('px407-dirs-', (root) => {
      const { dirsPath, graphPath } = dirsFixture(root, seeded);
      const result = validateFiles(dirsPath, graphPath);
      return result.ok ? [] : result.errors.map((problem) => ({ code: 'DIRS_TREE_SCHEMA_FAILED', problem }));
    }),
  },
  chain: {
    seededDefect: 'change the ticket digest so the chain is stale',
    run: (seeded) => {
      const fixture = chainFixture();
      if (seeded) fixture.tickets.distribution.ticketDigests[1] = '0'.repeat(64);
      const result = verifyChain(fixture);
      return (result.findings ?? []).map((finding) => ({ code: finding.code, problem: finding.message ?? String(finding) }));
    },
  },
  'incomplete-implementation': {
    seededDefect: 'add an unmarked todo!()',
    run: (seeded) => withTempRoot('px407-incomplete-', (root) => {
      fs.mkdirSync(path.join(root, 'src'), { recursive: true });
      fs.writeFileSync(path.join(root, 'src', 'a.js'), seeded ? 'function bad() { todo!() }\n' : 'function ok() { return 1; }\n');
      return scanDirectory(root, 'stubs', { sourceSet: 'omission' }).map((finding) => ({ code: 'INCOMPLETE_IMPLEMENTATION_UNMARKED', assetId: finding.file + ':' + finding.line, problem: finding.content }));
    }),
  },
  'stub-marker': {
    seededDefect: 'add a malformed stub key',
    run: (seeded) => {
      const content = seeded ? '// [::STUB::] no-colon-here' : '// [::STUB::] P0-1: reason -- plan';
      return validateStubFormat(content).valid ? [] : [{ code: 'STUB_KEY_UNRESOLVABLE', problem: content }];
    },
  },
  'quality-danger': {
    seededDefect: 'add an unwrap()',
    run: (seeded) => withTempRoot('px407-quality-', (root) => {
      fs.mkdirSync(path.join(root, 'src'), { recursive: true });
      const file = path.join(root, 'src', 'a.js');
      fs.writeFileSync(file, seeded ? 'const value = read().unwrap();\n' : 'const value = read();\n');
      const result = runAllChecks([file]);
      return Object.entries(result.checks).flatMap(([name, check]) => check.findings.map((finding) => ({ code: 'QUALITY_DANGER', assetId: finding.file + ':' + finding.line, problem: name + ': ' + finding.match })));
    }),
  },
});

// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function registryOf(options) {
  if (options?.registry) return options.registry;
  return require('./omission-detectors.js').loadRegistry({ cwd: options?.fixtureRoot || process.cwd() });
}

/** Run every definition in clean and seeded mode. */
// [::TICKET::] PX-407, PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-407|PX-437) --for-spec --no-implementation-order`.
function runCalibration(options = {}) {
  const registry = registryOf(options);
  const seeds = registry.seeds.map((seed) => {
    const definition = DEFINITIONS[seed.detectorId] ?? CLAUSE_DEFINITIONS[seed.detectorId];
    if (!definition) return { checkId: seed.detectorId, seededDefect: 'no definition', applicable: false, detected: false, findings: [] };
    try {
      const findings = definition.run(true);
      return { checkId: seed.detectorId, surface: seed.surface, seededDefect: definition.seededDefect, applicable: true, detected: findings.length > 0, findings };
    } catch (error) {
      return { checkId: seed.detectorId, surface: seed.surface, seededDefect: definition.seededDefect, applicable: false, detected: false, findings: [], problem: error.message };
    }
  });
  return { version: 2, seeds };
}

/** The negative control: every clean definition returns no finding. */
// [::TICKET::] PX-407, PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-407|PX-437) --for-spec --no-implementation-order`.
function runNegativeControl(options = {}) {
  const registry = registryOf(options);
  const findings = [];
  for (const seed of registry.seeds) {
    const definition = DEFINITIONS[seed.detectorId] ?? CLAUSE_DEFINITIONS[seed.detectorId];
    if (!definition) continue;
    try {
      for (const finding of definition.run(false)) findings.push({ ...finding, detectorId: seed.detectorId });
    } catch (error) {
      findings.push({ code: 'NEGATIVE_CONTROL_FAILED', detectorId: seed.detectorId, problem: error.message });
    }
  }
  return { findings, ok: findings.length === 0 };
}

/** The calibration verdict: every seed applicable, detected and clean. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function calibrationVerdict(calibration) {
  const seeds = Array.isArray(calibration?.seeds) ? calibration.seeds : [];
  const notMeasured = seeds.filter((seed) => seed.applicable === false).map((seed) => seed.checkId);
  const undetected = seeds.filter((seed) => seed.applicable !== false && seed.detected !== true).map((seed) => seed.checkId);
  if (seeds.length === 0 || undetected.length > 0) return { ok: false, code: 'CALIBRATION_FAILED', undetected };
  if (notMeasured.length > 0) return { ok: false, code: 'CALIBRATION_NOT_MEASURED', notMeasured };
  return { ok: true, notMeasured: [] };
}

/** The v3 detectors calibrated separately from the v2 mechanical count. */
const CLAUSE_SEEDS = Object.freeze([
  { detectorId: 'contract-inventory', surface: 'contract-clause' },
  { detectorId: 'test-index', surface: 'contract-clause' },
  { detectorId: 'clause-coverage', surface: 'contract-clause' },
  { detectorId: 'detection-proof', surface: 'contract-clause' },
]);

/** A clean and a seeded fixture for every v3 detector. */
const CLAUSE_DEFINITIONS = Object.freeze({
  'contract-inventory': {
    seededDefect: 'drop a source element so reconciliation is short',
    run: (seeded) => {
      if (!seeded) {
        return buildInventory({
          adapter: { scope: 'pkg-alpha', contractIdScope: 'global' },
          sources: [{ kind: 'graph', artifact: 'TEST-GRAPH.json', edges: [{ id: 'E001', contracts: [{ id: 'OBL-alpha', precondition: 'p', postcondition: 'q', invariant: 'r' }] }] }],
        }).findings;
      }
      return reconcileSource({
        sourceElements: [{ contractId: 'OBL-alpha', element: 'precondition' }, { contractId: 'OBL-alpha', element: 'postcondition' }],
        clauses: [{ key: 'clause|pkg-alpha|OBL-alpha|precondition|abcdef0123456789' }],
        exclusions: [],
      }).findings;
    },
  },
  'test-index': {
    seededDefect: 'drop the test entry so its file is unaccounted',
    run: (seeded) => {
      const adapter = {
        id: 'calibration-index',
        language: 'fixture',
        testRoots: [],
        extensions: [],
        enumerate: () => seeded
          ? { tests: [], reported: [], files: ['a.fixture'] }
          : { tests: [{ id: 't', file: 'a.fixture', name: 't', kind: 'unit', ignored: false, skipReason: null, annotations: [] }], reported: [], files: ['a.fixture'] },
      };
      return buildTestIndex({ cwd: process.cwd(), adapter }).findings;
    },
  },
  'clause-coverage': {
    seededDefect: 'remove the mapping so the clause is unmapped',
    run: (seeded) => {
// [::TICKET::] PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-441 --for-spec --no-implementation-order`.
      const key = 'clause|pkg-alpha|OBL-alpha|precondition|abcdef0123456789';
      const inventory = { digest: 'sha256:inventory', clauses: [{ key, contractId: 'OBL-alpha', element: 'precondition', applicability: 'TESTABLE' }], conflicts: [] };
      const testIndex = { digest: 'sha256:index', tests: [{ id: 't', digest: 'sha256:test', ignored: false, annotations: ['verifies:' + key] }] };
      const inputs = {
        version: 1, clauseKey: key, mutationFile: 'a.js', mutationFileDigest: 'sha256:source',
        mutationDigest: 'sha256:mutation', testId: 't', testDigest: 'sha256:test',
        commandTemplate: 'runner {test}', commandDigest: 'sha256:command',
        closureScope: 'package', closureDigest: 'sha256:closure', engineVersion: 2,
        adapterVersion: 1, toolchainDigest: 'sha256:toolchain',
      };
      const proof = {
        status: 'PROVEN', verifiedAt: '2026-11-17T00:00:00Z', restored: true,
        inputsVersion: inputs.version, inputsDigest: inputsDigestOf(inputs), inputs,
        closureScope: inputs.closureScope,
        digests: { source: inputs.mutationFileDigest, test: inputs.testDigest, command: inputs.commandDigest },
      };
      const coverage = {
        version: 1,
        inventoryDigest: inventory.digest,
        testIndexDigest: testIndex.digest,
        clauses: seeded ? [] : [{ key, tests: [{ id: 't', digest: 'sha256:test' }], proof, applicability: 'TESTABLE' }],
      };
      return scanClauseCoverage({ inventory, testIndex, coverage, proofInputsByKey: new Map([[key, inputs]]) }).findings;
    },
  },
  'detection-proof': {
    seededDefect: 'leave the suite green so proof cannot observe a failure',
    run: (seeded) => withTempRoot('px436-proof-calibration-', (root) => {
      const file = path.join(root, 'a.js');
      fs.writeFileSync(file, 'function f() { return 1; }\n');
      const result = runDetectionProof({
        clause: { key: 'clause|pkg-alpha|OBL-alpha|postcondition|abcdef0123456789' },
        testId: 't',
        testDigest: 'sha256:test',
        mutation: { file: 'a.js', strategy: 'replace-return', find: 'return 1;', replace: 'return 2;' },
        command: 'fixture-runner {test}',
        isolate: { root, cleanup: () => {} },
        io: { runCommand: () => ({ status: seeded ? 0 : 1, stdout: seeded ? 'PASS t' : 'FAIL t', stderr: '', timedOut: false }) },
      });
      return result.status === 'PROVEN' ? [] : [{ code: result.status }];
    }),
  },
});

/**
 * Calibrate every v3 detector against a clean and a seeded fixture.
 *
 * The v2 `runCalibration` keeps its one-seed-per-registry-detector contract;
 * this entry point is additive so a v2 registry remains valid.
 *
 * @returns {{version:number, seeds:object[]}}
 */
// [::TICKET::] PX-436, PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-436|PX-437) --for-spec --no-implementation-order`.
function runClauseCalibration() {
  const seeds = CLAUSE_SEEDS.map((seed) => {
    const definition = CLAUSE_DEFINITIONS[seed.detectorId];
    try {
      const cleanFindings = definition.run(false);
      const findings = definition.run(true);
      return { checkId: seed.detectorId, surface: seed.surface, seededDefect: definition.seededDefect, applicable: true, detected: findings.length > 0, findings, cleanFindings };
    } catch (error) {
      return { checkId: seed.detectorId, surface: seed.surface, seededDefect: definition.seededDefect, applicable: false, detected: false, findings: [], cleanFindings: [], problem: error.message };
    }
  });
  return { version: 3, seeds };
}

module.exports = {
  CLAUSE_DEFINITIONS,
  CLAUSE_SEEDS,
  DEFINITIONS,
  calibrationVerdict,
  registryOf,
  runCalibration,
  runClauseCalibration,
  runNegativeControl,
};
