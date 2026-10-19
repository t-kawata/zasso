/**
 * A smooth-sequences workspace assembled from fixtures.
 *
 * The detector reads a workspace and writes only its two reports, so the fixture is the
 * whole input surface. Every value a check compares is authored here rather than derived
 * from the implementation, so a green test never compares the detector with itself.
 * The vocabulary is deliberately neutral: a project that declares its own status names
 * and interfaces must receive the same verdict as the project this gate was first run on.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const TREE_MANIFEST_FILE_NAME = 'WORKSPACIFY-TREE-MANIFEST.json';
export const ALLOCATE_MANIFEST_FILE_NAME = 'WORKSPACIFY-ALLOCATE-MANIFEST.json';
export const ARTIFACT_FILE_NAME = 'example-sequences.json';
export const VIEW_FILE_NAME = 'SEQUENCES.json';
export const RFC_FILE_NAME = 'RFC.md';
export const RULES_FILE_NAME = 'SMOOTH-SEQUENCES-RULES.json';

const PROVIDER = 'pkg-0001';
const CONSUMER = 'pkg-0002';
const BOUNDARY = 'boundary-001';
const PROVIDER_PATH = 'crates/alpha';
const CONSUMER_PATH = 'crates/beta';

/** The vocabulary a workspace may declare in SMOOTH-SEQUENCES-RULES.json. */
export const DEFAULT_RULES = Object.freeze({
  schemaVersion: 1,
  terminalStatuses: ['closed'],
  requiredInterfaces: ['rest', 'grpc', 'cli'],
});

const OPERATION_DEFAULTS = Object.freeze({
  mutates_protocol_state: true,
  required_authority: 'none',
  requires_remote_time_handshake: false,
  requires_session_binding: false,
  required_pre_state_checkpoint: false,
  required_proof_classes: [],
  idempotency_scope: 'operation identity tuple',
  initial_status: 'open',
  allowed_status_transitions: { open: ['accepted'], accepted: ['closed'], closed: [] },
  external_dependency_class: 'none',
  result_object_classes: [],
  finality_predicate: 'closed when the accepted transition completes',
  cancellation_rule: 'cancellable before the first external action',
  reversal_or_recovery_rule: 'follows the OperationStatus map',
  rest: 'GET /v1/orders',
  grpc: 'orders.v1.Orders/Create',
  cli: 'example order create',
  reject_code_families: ['core'],
});

/** One operation row with the fixture defaults overridden by the caller. */
export function operationRow(id, overrides = {}) {
  return { id, disposition: 'active', position: 'singleStep', ...OPERATION_DEFAULTS, ...overrides };
}

/** The two operations the clean fixture owns, one on each side of boundary-001. */
// [::TICKET::] PX-275 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-275 --for-spec --no-implementation-order`.
function defaultOperations() {
  return [
    operationRow('ProduceFact', { registry_contribution: 'required' }),
    operationRow('ConsumeFact', { registry_contribution: 'required' }),
  ];
}

/** The two steps of the clean fixture: one produces order_id, the next consumes it. */
// [::TICKET::] PX-275 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-275 --for-spec --no-implementation-order`.
export function defaultSteps() {
  return [
    {
      id: 'A-1__ProduceFact',
      sequence: 'A-1',
      operation: 'ProduceFact',
      line: 1,
      quote: 'the producer derives order_id',
      contract: {
        pre: [],
        post: [{ factId: 'order_id', text: 'order_id is derived', source: `${BOUNDARY}/postconditions/0` }],
        invariants: [],
        consumes: [],
        produces: ['order_id'],
        errors: [],
        crosses: [BOUNDARY],
      },
    },
    {
      id: 'A-1__ConsumeFact',
      sequence: 'A-1',
      operation: 'ConsumeFact',
      line: 2,
      quote: 'the consumer reads order_id',
      contract: {
        pre: [{ factId: 'order_id', text: 'order_id is present', source: `${BOUNDARY}/preconditions/0` }],
        post: [],
        invariants: [],
        consumes: ['order_id'],
        produces: [],
        errors: [],
        crosses: [BOUNDARY],
      },
    },
  ];
}

/** A v3 artifact that satisfies every Layer A and Layer B check. */
export function minimalV3Artifact() {
  return {
    schema_version: 3,
    spec: { path: 'spec.md', sha256: '0'.repeat(64), lines: 100 },
    pins: {
      predicate: { line: 1, limbs: ['limb'] },
      rowSchema: { line: 1, fields: ['id'] },
      enumerations: [{ name: 'Kind', members: ['entry'], ranges: ['1-10'], closedness: 'closed' }],
      forms: [{ name: 'entry', proposes: true }],
      sectionLevel: 1,
      blocks: [{ id: 'b1', firstLine: 1, lastLine: 10 }],
      sourceEnumerations: [
        {
          name: 'census-operations',
          role: 'operations',
          members: ['ProduceFact', 'ConsumeFact'],
          selector: { shape: 'identifiers', parameter: 'id' },
          source: { file: 'census.json', sha256: '0'.repeat(64) },
        },
        {
          name: 'census-entries',
          role: 'entries',
          members: ['A-1'],
          selector: { shape: 'identifiers', parameter: 'id' },
          source: { file: 'census.json', sha256: '0'.repeat(64) },
        },
      ],
    },
    sequences: [{ id: 'A-1', kind: 'entry', firstLine: 1, lastLine: 10, outcome: 'direct' }],
    steps: defaultSteps(),
    operations: defaultOperations(),
    adjudications: [],
    sections: [{ id: 's1', firstLine: 1, lastLine: 10 }],
    exemptions: [],
    verify: { command: 'node run.mjs spec.md', expected_exit: 0 },
  };
}

/** A v2 artifact with the same records but prose contracts and no v3 fields. */
export function minimalV2Artifact() {
  const artifact = minimalV3Artifact();
  artifact.schema_version = 2;
  artifact.steps = artifact.steps.map((step) => ({
    id: step.id,
    sequence: step.sequence,
    operation: step.operation,
    line: step.line,
    quote: step.quote,
    contract: step.contract.post[0]?.text ?? step.contract.pre[0]?.text ?? 'the step contract',
  }));
  artifact.operations = artifact.operations.map(({ registry_contribution, ...operation }) => operation);
  return artifact;
}

/** The contract registry the clean fixture carries. */
export function defaultContractRegistry() {
  return [{
    contract_id: 'contract-boundary-001',
    boundary_id: BOUNDARY,
    consumer_package: CONSUMER,
    provider_package: PROVIDER,
    connection_kind: 'value_only',
    owners: { semantic: 'not_applicable', state: 'not_applicable', side_effect: 'not_applicable', port: 'not_applicable', adapter: 'not_applicable' },
    clauses: {
      input: 'the producer receives the identity material',
      output: 'the producer hands back order_id',
      preconditions: ['the identity material is present'],
      postconditions: ['order_id is derived'],
      invariants: ['one active order_id per identity'],
    },
    source_refs: ['s-000001'],
  }];
}

/** The tree manifest the clean fixture carries. */
export function defaultTreeManifest() {
  return {
    workspace: {
      packages: [
        { id: PROVIDER, name: 'pkg-0001', path: PROVIDER_PATH, layer: 'protocol', kind: 'production-library' },
        { id: CONSUMER, name: 'pkg-0002', path: CONSUMER_PATH, layer: 'protocol', kind: 'production-library' },
      ],
    },
    dependencies: {
      boundaries: [{
        id: BOUNDARY,
        provider_package: PROVIDER,
        consumer_package: CONSUMER,
        dependency_reason_code: 'canonical-object',
        stage2_contract_scope: ['input', 'output', 'preconditions', 'postconditions', 'invariants'],
      }],
    },
  };
}

/** The allocate manifest the clean fixture carries. */
export function defaultAllocateManifest(contractRegistry = defaultContractRegistry()) {
  return { contract_registry: contractRegistry, allocation: { package_count: 2, seed_count: 2, parsed_package_count: 2 } };
}

/** A package view with one owned operation and the provider or consumer side of boundary-001. */
export function packageView(input) {
  const { packageId, operationId, direction, counterpart, sequenceIds = [], crossSequences = [] } = input;
  return {
    packageId,
    ownedOperationUnits: [{
      unitId: `op-${operationId}`,
      operationId,
      resultObjectClasses: [],
      ownerPackageIds: [packageId],
      unmatchedClassNames: [],
    }],
    ownedSequenceUnits: sequenceIds.map((sequenceId) => ({
      unitId: `seq-${sequenceId}`,
      sequenceId,
      ownerPackageIds: [packageId],
    })),
    crossBoundarySequenceUnits: crossSequences.map(({ sequenceId, ownerPackageIds }) => ({
      unitId: `xdir-${sequenceId}`,
      sequenceId,
      outcome: 'direct',
      ownerPackageIds,
    })),
    obligationUnits: [{
      unitId: `ctr-${BOUNDARY}`,
      relation: 'carries',
      subject: BOUNDARY,
      direction,
      counterpart,
    }],
    obligationSource: 'declared',
    lineRange: { claimedLineCount: 100, multiClaimedLineCount: 0, unclaimedLineCount: 0, identityUse: 'not used as an identity', statement: 'fixture' },
    unboundAssignments: [],
    adjudicatedColumns: [],
    unmatchedClassNames: [],
    specLines: 100,
  };
}

/** The ledger kind a unit id declares. */
// [::TICKET::] PX-275 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-275 --for-spec --no-implementation-order`.
function ledgerKindOf(unitId) {
  if (unitId.startsWith('op-')) return 'operation';
  if (unitId.startsWith('ctr-')) return 'contract';
  if (unitId.startsWith('xdir-')) return 'cross-boundary-sequence';
  return 'sequence';
}

/** The RFC body that names the boundary and carries its distribution ledger. */
export function rfcBody({ packageId, operationId, boundary = BOUNDARY, sequenceIds = [], crossSequenceIds = [] }) {
  const units = [
    { id: `op-${operationId}`, kind: ledgerKindOf(`op-${operationId}`) },
    ...sequenceIds.map((sequenceId) => ({ id: `seq-${sequenceId}`, kind: ledgerKindOf(`seq-${sequenceId}`) })),
    ...crossSequenceIds.map((sequenceId) => ({ id: `xdir-${sequenceId}`, kind: ledgerKindOf(`xdir-${sequenceId}`) })),
    { id: `ctr-${boundary}`, kind: ledgerKindOf(`ctr-${boundary}`) },
  ];
  const rows = units.map((unit) => `| ${unit.id} | ${unit.kind} | ${packageId} | 1.1 | the dependency this unit travels along |`).join('\n');
  return [
    `# RFC ${packageId}`,
    '',
    '### 1.1 Design',
    '',
    boundary,
    '',
    '## Distribution ledger',
    '',
    'This document is canonical for the units below.',
    '',
    '| Unit | Kind | Owner | RFC location | Ground |',
    '| --- | --- | --- | --- | --- |',
    rows,
    '',
    '## Appendix A. Cross-directory defect ledger',
    '',
    'Composition check: the provider and consumer designs were read; no contradiction, conflict or deficiency was found.',
    '',
  ].join('\n');
}

/**
 * Materialize a workspace on disk.
 *
 * @param {{ artifact?: object, treeManifest?: object, allocateManifest?: object,
 *   views?: object, rfcBodies?: object, rules?: object|null }} input
 * @returns {{ root, artifactPath, treeManifestPath, allocateManifestPath, rulesPath,
 *   directoryOf: (id: string) => string, rfcPathOf: (id: string) => string,
 *   viewPathOf: (id: string) => string, readArtifact: () => object,
 *   readRules: () => object|null, remove: () => void }}
 */
export function materializeSmoothWorkspace(input = {}) {
  const root = mkdtempSync(join(tmpdir(), 'smooth-sequences-'));
  const artifact = input.artifact ?? minimalV3Artifact();
  const treeManifest = input.treeManifest ?? defaultTreeManifest();
  const allocateManifest = input.allocateManifest ?? defaultAllocateManifest();
  const rules = input.rules === undefined ? DEFAULT_RULES : input.rules;
  const crossSequences = [{ sequenceId: 'A-1', ownerPackageIds: [PROVIDER, CONSUMER] }];
  const views = input.views ?? {
    [PROVIDER]: packageView({ packageId: PROVIDER, operationId: 'ProduceFact', direction: 'provides', counterpart: CONSUMER, sequenceIds: ['A-1'], crossSequences }),
    [CONSUMER]: packageView({ packageId: CONSUMER, operationId: 'ConsumeFact', direction: 'consumes', counterpart: PROVIDER, crossSequences }),
  };
  const bodies = input.rfcBodies ?? {
    [PROVIDER]: rfcBody({ packageId: PROVIDER, operationId: 'ProduceFact', sequenceIds: ['A-1'], crossSequenceIds: ['A-1'] }),
    [CONSUMER]: rfcBody({ packageId: CONSUMER, operationId: 'ConsumeFact', crossSequenceIds: ['A-1'] }),
  };

  for (const pkg of treeManifest.workspace.packages) {
    const directory = join(root, pkg.path);
    mkdirSync(directory, { recursive: true });
    if (views[pkg.id] !== undefined) writeFileSync(join(directory, VIEW_FILE_NAME), JSON.stringify(views[pkg.id], null, 2));
    if (bodies[pkg.id] !== undefined) writeFileSync(join(directory, RFC_FILE_NAME), bodies[pkg.id]);
  }

  const artifactPath = join(root, ARTIFACT_FILE_NAME);
  const treeManifestPath = join(root, TREE_MANIFEST_FILE_NAME);
  const allocateManifestPath = join(root, ALLOCATE_MANIFEST_FILE_NAME);
  const rulesPath = join(root, RULES_FILE_NAME);
  writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
  writeFileSync(treeManifestPath, JSON.stringify(treeManifest, null, 2));
  writeFileSync(allocateManifestPath, JSON.stringify(allocateManifest, null, 2));
  if (rules !== null) writeFileSync(rulesPath, JSON.stringify(rules, null, 2));

  return {
    root,
    artifact,
    artifactPath,
    treeManifestPath,
    allocateManifestPath,
    rulesPath,
    directoryOf: (id) => join(root, treeManifest.workspace.packages.find((pkg) => pkg.id === id).path),
    rfcPathOf: (id) => join(root, treeManifest.workspace.packages.find((pkg) => pkg.id === id).path, RFC_FILE_NAME),
    viewPathOf: (id) => join(root, treeManifest.workspace.packages.find((pkg) => pkg.id === id).path, VIEW_FILE_NAME),
    readArtifact: () => JSON.parse(readFileSync(artifactPath, 'utf8')),
    readRules: () => (rules === null ? null : JSON.parse(readFileSync(rulesPath, 'utf8'))),
    remove: () => rmSync(root, { recursive: true, force: true }),
  };
}

/** A fixture whose Layer A holds but which carries one explicit finding. */
export function defectiveWorkspace({ checkId = 'S4.boundary-clause-missing' } = {}) {
  if (checkId === 'S4.boundary-clause-missing') {
    const registry = defaultContractRegistry();
    delete registry[0].clauses.preconditions;
    return materializeSmoothWorkspace({ allocateManifest: defaultAllocateManifest(registry) });
  }
  if (checkId === 'S1.step-unresolved-operation') {
    const artifact = minimalV3Artifact();
    artifact.steps[0].operation = 'MissingOperation';
    return materializeSmoothWorkspace({ artifact });
  }
  throw new Error(`the fixture does not know how to plant ${checkId}`);
}
