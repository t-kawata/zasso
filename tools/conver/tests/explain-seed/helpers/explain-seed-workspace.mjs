// PX-221 @verifies C004
// PX-221 @verifies C006
// PX-221 @verifies C007
// PX-222 @verifies C001
// PX-222 @verifies C010
//
// A workspace assembled from fixtures, because the command under test writes beside
// its input and the real workspace is read-only. Everything here is derived from
// `SPEC_TEXT` through the toolchain's own segmentation, so the segments, the source
// hash and the inventory ranges agree with each other by construction rather than by
// a hand-written expectation.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { segmentAtHeadings } from '../../../.claude/scripts/workspacify-tree/lib/segmentation.mjs';
import { buildHeadingTree } from '../../../.claude/scripts/workspacify-tree/lib/headings.mjs';
import { normalizeTextBytes } from '../../../.claude/scripts/workspacify-tree/lib/normalization.mjs';
import { sha256Hex } from '../../../.claude/scripts/workspacify-tree/lib/hash.mjs';
import { INFO_DOCUMENT_FILE_NAME } from '../../../.claude/scripts/explain-seed/lib/render.mjs';
import { EXPLAIN_FILE_NAME } from '../../../.claude/scripts/explain-seed/lib/frame.mjs';

export const SPEC_FILE_NAME = 'spec.md';
export const TREE_MANIFEST_FILE_NAME = 'WORKSPACIFY-TREE-MANIFEST.json';
export const ALLOCATE_MANIFEST_FILE_NAME = 'WORKSPACIFY-ALLOCATE-MANIFEST.json';
export { INFO_DOCUMENT_FILE_NAME, EXPLAIN_FILE_NAME };
export const DEFAULT_SEED_RELATIVE_PATH = 'crates/protocol/alpha/RFC-SEED.md';

/** The stage-1 self-hash this fixture records; the seed must agree with it. */
export const TREE_MANIFEST_HASH = sha256Hex('px221-fixture-tree-manifest');

/** A specification carrying Japanese in its first segment, so offsets and bytes diverge. */
export const SPEC_TEXT = [
  '# 仕様見出し',
  '',
  '導入の段落。ここに日本語が入るので、以降のオフセットはずれる。',
  '',
  '## 1. 第一章',
  '',
  '第一章の本文。AlphaRecord は alpha が所有する記録である。',
  '',
  '## 2. 第二章',
  '',
  '第二章の本文。BetaRecord は beta が所有する記録である。',
  '',
].join('\n');

/** The heading whose section contains an offset into the fixture specification. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function sectionIdAt(offset) {
  const headings = buildHeadingTree(SPEC_TEXT.split('\n'), undefined, { sourceText: SPEC_TEXT });
  const containing = headings
    .filter((heading) => heading.byte_start !== null && heading.byte_start <= offset)
    .pop();
  return containing?.id ?? null;
}

/** One inventory record, with the range of the specification text it came from. */
// [::TICKET::] PX-221, PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-221|PX-222) --for-spec --no-implementation-order`.
function inventoryRecord({ id, canonicalName, classification }, { ownerPackage, needle }) {
  const start = SPEC_TEXT.indexOf(needle);
  if (start < 0) throw new Error(`fixture spec does not contain ${needle}`);
  const end = start + needle.length;
  const sectionId = sectionIdAt(start);
  return {
    id,
    canonical_name: canonicalName,
    owner_package: ownerPackage,
    classification,
    normalization_status: 'CONFIRMED',
    review_status: 'CONFIRMED',
    source_refs: [
      {
        byte_start: start,
        byte_end: end,
        line_start: SPEC_TEXT.slice(0, start).split('\n').length,
        line_end: SPEC_TEXT.slice(0, end).split('\n').length,
        section_id: sectionId,
      },
    ],
  };
}

/** The segments, headings and hashes of the fixture specification. */
// [::TICKET::] PX-221, PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-221|PX-222) --for-spec --no-implementation-order`.
function analyzeSpecification() {
  const headings = buildHeadingTree(SPEC_TEXT.split('\n'), undefined, { sourceText: SPEC_TEXT });
  const { segments } = segmentAtHeadings({ sourceText: SPEC_TEXT, headings }, { segmentLevel: 2 });
  const { bytes } = normalizeTextBytes(Buffer.from(SPEC_TEXT, 'utf8'));
  return { headings, segments, bytes, sourceHash: sha256Hex(bytes) };
}

/** Extra records with no source range, used to drive a package past the document's caps. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function syntheticObjects({ packageId, count }) {
  return Array.from({ length: count }, (_, index) => ({
    id: `obj-9${String(index).padStart(5, '0')}`,
    canonical_name: `SyntheticRecord${index}`,
    owner_package: packageId,
    classification: 'record',
    normalization_status: 'CONFIRMED',
    review_status: 'CONFIRMED',
    source_refs: [],
  }));
}

/** The two-package workspace the command is pointed at. */
// [::TICKET::] PX-221, PX-222, PX-224 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-221|PX-222|PX-224) --for-spec --no-implementation-order`.
function buildTreeManifest({ scale, extraPackages = [], edges = [{ from: 'pkg-0002', to: 'pkg-0001' }] } = {}) {
  const { extraObjects = 0, extraContracts = 0, clauseLength = 40 } = scale ?? {};
  const { headings, segments, bytes, sourceHash } = analyzeSpecification();
  const extra = syntheticObjects({ packageId: 'pkg-0001', count: extraObjects });
  const { boundaries: syntheticBoundaries } = syntheticCoupling({
    packageId: 'pkg-0001',
    count: extraContracts,
    clauseLength,
  });
  const objects = [
    inventoryRecord(
      { id: 'obj-000001', canonicalName: 'AlphaRecord', classification: 'record' },
      { ownerPackage: 'pkg-0001', needle: 'AlphaRecord' },
    ),
    inventoryRecord(
      { id: 'obj-000002', canonicalName: 'BetaRecord', classification: 'record' },
      { ownerPackage: 'pkg-0002', needle: 'BetaRecord' },
    ),
    ...extra,
  ];
  const extraObjectIds = extra.map((record) => record.id);
  return {
    artifact_kind: 'workspacify-tree-manifest',
    schema_version: '1.0.0',
    status: 'COMPLETE',
    run: { generated_at: '2026-01-01T00:00:00.000Z', generator: { command: '/workspacify-tree' }, run_id: 'run-fixture' },
    input: {
      source_hash: sourceHash,
      source_bytes: bytes.length,
      source_characters: [...SPEC_TEXT].length,
      spec_path: SPEC_FILE_NAME,
    },
    structure: {
      heading_count: headings.length,
      headings,
      segment_count: segments.length,
      segment_level: 2,
      segments,
      warnings: [],
      reconstruction: { status: 'PASS' },
    },
    workspace: {
      tree: [
        {
          kind: 'dir',
          name: 'protocol',
          path: 'crates/protocol',
          children: [
            { kind: 'dir', name: 'alpha', path: 'crates/protocol/alpha', children: [] },
            { kind: 'dir', name: 'beta', path: 'crates/protocol/beta', children: [] },
            ...extraPackages.map((pkg) => ({ kind: 'dir', name: pkg.name, path: pkg.path, children: [] })),
          ],
        },
      ],
      packages: [
        {
          id: 'pkg-0001',
          name: 'alpha',
          path: 'crates/protocol/alpha',
          layer: 'protocol',
          kind: 'production-library',
          responsibilities: ['own the alpha record', 'own the alpha encoding rule'],
          owns: {
            objects: ['obj-000001', ...extraObjectIds],
            claims: [],
            invariants: [],
            error_codes: [],
            required_tests: [],
            state_machines: [],
          },
        },
        {
          id: 'pkg-0002',
          name: 'beta',
          path: 'crates/protocol/beta',
          layer: 'protocol',
          kind: 'production-library',
          responsibilities: ['own the beta record and its consumer obligation'],
          owns: { objects: ['obj-000002'], claims: [], invariants: [], error_codes: [], required_tests: [], state_machines: [] },
        },
        ...extraPackages,
      ],
      ownership: {
        entries: [
          { canonical_name: 'AlphaRecord', category: 'object', inventory_ref: 'obj-000001', owner_package: 'pkg-0001' },
          { canonical_name: 'BetaRecord', category: 'object', inventory_ref: 'obj-000002', owner_package: 'pkg-0002' },
        ],
      },
    },
    dependencies: {
      orientation: 'consumer_to_direct_dependency',
      boundaries: [
        {
          id: 'boundary-001',
          provider_package: 'pkg-0001',
          consumer_package: 'pkg-0002',
          dependency_reason_code: 'canonical-object',
          stage2_contract_scope: ['input', 'output', 'preconditions', 'postconditions', 'invariants', 'errors', 'canonicalization', 'tests'],
        },
        ...syntheticBoundaries,
      ],
      normal_edges: edges,
      forbidden_edges: [
        {
          kind: 'forbidden',
          from: 'pkg-0001',
          to: 'pkg-0002',
          reason: 'the alpha layer must never read beta semantics',
          reasonCode: 'layer-direction',
          alternative: 'beta consumes alpha, never the reverse',
        },
      ],
      forbidden_layer_rules: [{ from_layer: 'protocol', forbidden_to: ['adapters'] }],
      dag: { canonical_edges: edges },
    },
    inventory: {
      objects,
      claims: [],
      invariants: [],
      error_codes: [],
      required_tests: [],
      state_machines: [],
      terms: [],
      normalization_decisions: [],
      unresolved_candidates: [],
    },
    adapters: {
      ports: [],
      database_policy: { applicable: false },
      leaf_packages: [],
    },
    conformance: { ci_rules: [], test_obligations: [{ obligation: 'pkg-0001 is the conformance sink for its layer', package: 'pkg-0001' }] },
    requirements: { normative_candidates: [] },
    stage2_handoff: { eligible: true, residual_questions: [], spec_defects: [], contract_boundaries: [], dependency_reviews: [] },
    final_audit: { status: 'PASS' },
    integrity: {
      canonicalization: 'workspacify-tree-json-v1',
      manifest_hash_algorithm: 'SHA-256',
      manifest_hash: TREE_MANIFEST_HASH,
      reload_validation: 'PASS',
    },
  };
}

/** Extra boundaries and their contracts, used to drive a package past the document's caps. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function syntheticCoupling({ packageId, count, clauseLength }) {
  const clauseText = '仕様が定めた条項の本文。'.repeat(Math.ceil(clauseLength / 12)).slice(0, clauseLength);
  const boundaries = Array.from({ length: count }, (_, index) => ({
    id: `boundary-9${String(index).padStart(3, '0')}`,
    provider_package: packageId,
    consumer_package: 'pkg-0002',
    dependency_reason_code: 'canonical-object',
    stage2_contract_scope: ['input', 'output'],
  }));
  const contracts = boundaries.map((boundary) => ({
    contract_id: `contract-${boundary.id}`,
    boundary_id: boundary.id,
    consumer_package: 'pkg-0002',
    provider_package: packageId,
    connection_kind: 'value_only',
    owners: { semantic: packageId },
    clauses: { input: clauseText, output: clauseText, invariants: clauseText, canonicalization: clauseText },
  }));
  return { boundaries, contracts };
}

/** The order block stage two injects, which is level adjacency rather than edges. */
// [::TICKET::] PX-224 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-224 --for-spec --no-implementation-order`.
export const INJECTED_ORDER = Object.freeze({
  before: [],
  after: ['pkg-0002'],
  parallel_with: [],
  serial_index: 1,
  wave: 1,
});

/** The seed text, which records the paths and hashes the command must verify. */
// [::TICKET::] PX-221, PX-222, PX-224 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-221|PX-222|PX-224) --for-spec --no-implementation-order`.
function renderSeed({ seedRelativePath, sourceHash, implementationOrder = INJECTED_ORDER }) {
  const identity = {
    package: {
      id: 'pkg-0001',
      name: 'alpha',
      path: 'crates/protocol/alpha',
      layer: 'protocol',
      kind: 'production-library',
      responsibilities: ['own the alpha record', 'own the alpha encoding rule'],
    },
    source_spec: { path: SPEC_FILE_NAME, sha256: sourceHash },
    stage1_manifest: { path: TREE_MANIFEST_FILE_NAME, hash: TREE_MANIFEST_HASH },
    stage2_manifest: { path: ALLOCATE_MANIFEST_FILE_NAME },
    implementation_order: implementationOrder,
    contract_refs: ['contract-boundary-001'],
    source_segments: [],
  };
  const edges = {
    schema_version: '1.0.0',
    seed_package: 'pkg-0001',
    seed_path: seedRelativePath,
    no_external_contracts: false,
    no_external_contracts_reason: null,
    contract_edges: [
      {
        contract_id: 'contract-boundary-001',
        boundary_id: 'boundary-001',
        direction: 'outgoing',
        connection_kind: 'value_only',
        consumer_package: 'pkg-0002',
        provider_package: 'pkg-0001',
        consumer_path: 'crates/protocol/beta',
        provider_path: 'crates/protocol/alpha',
        owners: { semantic: 'pkg-0001' },
        clauses: { canonicalization: 'Encoding is the provider single fixed canonical form.' },
        source_refs: [],
      },
    ],
  };
  return [
    '# RFC Seed: alpha',
    '',
    '## 1. Identity and Position in the Whole System',
    '',
    'The three reference paths below are machine-injected. Do not rewrite them.',
    '',
    '```json',
    JSON.stringify(identity, null, 2),
    '```',
    '',
    '## 2. Coupling Contracts (I/O Boundary)',
    '',
    '```json',
    JSON.stringify(edges, null, 2),
    '```',
    '',
    '## 3. Source Coverage and Allocation Index',
    '',
    '- covered by the stage-one manifest',
    '',
    '## 4. In-Scope Objects, Claims, Predicates, State and Invariants',
    '',
    '- the alpha record',
    '',
    '## 5. Incoming Dependencies and Consumer Obligations',
    '',
    '- none',
    '',
    '## 6. Outgoing Provider Obligations',
    '',
    '- the canonical encoding',
    '',
    '## 7. State Ownership and State-Transition Material',
    '',
    '- none',
    '',
    '## 8. Side-Effect and External-I/O Boundaries',
    '',
    '- none',
    '',
    '## 9. Canonicalization, Signatures and Proof Responsibilities',
    '',
    '- the canonical encoding',
    '',
    '## 10. Failure, Rejection, Recovery and Finality Material',
    '',
    '- none',
    '',
    '## 11. Required Unit, Integration, Exception and Malfeasance Test Material',
    '',
    '- none',
    '',
    '## 12. Grill Questions and Explicitly Unresolved Design Choices',
    '',
    '- none recorded',
    '',
    '## 13. Forbidden Dependencies, Non-Interference Boundaries and Non-Goals',
    '',
    '- never read beta semantics',
    '',
    '## 14. Source Traceability Index',
    '',
    '- see the stage-one manifest',
    '',
  ].join('\n');
}

/** The stage-two manifest, whose seed index must agree with the seed's bytes. */
// [::TICKET::] PX-221, PX-222, PX-224 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-221|PX-222|PX-224) --for-spec --no-implementation-order`.
function buildAllocateManifest({ provenance, options }) {
  const { seedRelativePath, seedHash, sourceHash } = provenance;
  const { extraContracts = 0, clauseLength = 40, ownsResiduals = true, recordsRiskyBoundaries = true, order } = options ?? {};
  const { segments } = analyzeSpecification();
  const { contracts: syntheticContracts } = syntheticCoupling({
    packageId: 'pkg-0001',
    count: extraContracts,
    clauseLength,
  });
  return {
    artifact_kind: 'workspacify-allocate-manifest',
    schema_version: '1.0.0',
    status: 'COMPLETE',
    run: { workspace_root: '.', planned_directory_count: 2 },
    input_tree_manifest: {
      path: TREE_MANIFEST_FILE_NAME,
      hash: TREE_MANIFEST_HASH,
      spec: { path: SPEC_FILE_NAME, sha256: sourceHash },
    },
    seed_index: [{ package: 'pkg-0001', path: seedRelativePath, sha256: seedHash }],
    contract_registry: [
      {
        contract_id: 'contract-boundary-001',
        boundary_id: 'boundary-001',
        consumer_package: 'pkg-0002',
        provider_package: 'pkg-0001',
        connection_kind: 'value_only',
        owners: { semantic: 'pkg-0001' },
        clauses: {
          canonicalization: 'Encoding is the provider single fixed canonical form.',
          input: 'One AlphaRecord, already validated.',
          output: 'One canonical byte string.',
        },
      },
      ...syntheticContracts,
    ],
    implementation_order: order ?? { serial: ['pkg-0001', 'pkg-0002'], levels: [['pkg-0001'], ['pkg-0002']] },
    wig: { summary: { node_count: 2, edge_count: 1 }, counts: {}, hash: 'fixture', violations: [] },
    source_coverage: {
      segments_total: segments.length,
      segments_covered: segments.length,
      material_segments: segments.map((segment) => segment.id),
      non_material_segments: [],
      uncovered: [],
    },
    handoff_summary: {
      unresolved: ownsResiduals
        ? [{ residual_id: 'residual-000001', package_id: 'pkg-0001', topic: 'The alpha bound', why_unresolved: 'the specification states the invariant without naming the refusal' }]
        : [],
      grill_questions: ownsResiduals
        ? [{ residual_id: 'residual-000001', package_id: 'pkg-0001', question: 'Does alpha refuse an over-bound record or clamp it?' }]
        : [],
      risky_boundaries: recordsRiskyBoundaries ? ['boundary-001'] : [],
    },
    self_grill: { passes: 1, converged: true, focuses: [], rounds: [], residual_count: 0 },
    semantic_review: { status: 'APPROVED', approver: 'fixture' },
    completion_decision: 'COMPLETE',
    integrity: {
      canonicalization: 'workspacify-allocate-json-v1',
      manifest_hash_algorithm: 'SHA-256',
      manifest_hash: 'fixture',
      reload_validation: 'READY',
    },
  };
}

/**
 * Write one explain-seed workspace into a fresh temporary directory.
 *
 * Order matters: the seed carries the stage-one hash, and the stage-two manifest
 * carries the seed's own hash, so the seed is written and hashed before the stage-two
 * manifest exists.
 */
export function materializeExplainSeedWorkspace({
  seedRelativePath = DEFAULT_SEED_RELATIVE_PATH,
  handoff = {},
  fixture = {},
} = {}) {
  const { ownsResiduals = true, recordsRiskyBoundaries = true } = handoff;
  const { scale = {}, extraPackages = [], edges, order, seedImplementationOrder = INJECTED_ORDER } = fixture;
  const root = mkdtempSync(join(tmpdir(), 'explain-seed-'));
  const { sourceHash } = analyzeSpecification();

  writeFileSync(join(root, SPEC_FILE_NAME), SPEC_TEXT, 'utf8');
  const treeManifest = buildTreeManifest({ scale, extraPackages, edges });
  const treeManifestPath = join(root, TREE_MANIFEST_FILE_NAME);
  writeFileSync(treeManifestPath, `${JSON.stringify(treeManifest, null, 2)}\n`, 'utf8');

  const seedPath = join(root, seedRelativePath);
  mkdirSync(dirname(seedPath), { recursive: true });
  writeFileSync(seedPath, renderSeed({ seedRelativePath, sourceHash, implementationOrder: seedImplementationOrder }), 'utf8');
  const seedHash = sha256Hex(readFileSync(seedPath));

  const allocateManifest = buildAllocateManifest({
    provenance: { seedRelativePath, seedHash, sourceHash },
    options: { ownsResiduals, recordsRiskyBoundaries, order, ...scale },
  });
  const allocateManifestPath = join(root, ALLOCATE_MANIFEST_FILE_NAME);
  writeFileSync(allocateManifestPath, `${JSON.stringify(allocateManifest, null, 2)}\n`, 'utf8');

  return {
    root,
    seedPath,
    infoPath: join(dirname(seedPath), INFO_DOCUMENT_FILE_NAME),
    explainPath: join(dirname(seedPath), EXPLAIN_FILE_NAME),
    seedPathOf: (packageId) =>
      join(root, treeManifest.workspace.packages.find((pkg) => pkg.id === packageId).path, 'RFC-SEED.md'),
    writeTreeManifest: (value) => writeFileSync(treeManifestPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8'),
    writeAllocateManifest: (value) => writeFileSync(allocateManifestPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8'),
    manifests: {
      tree: JSON.parse(readFileSync(treeManifestPath, 'utf8')),
      allocate: JSON.parse(readFileSync(allocateManifestPath, 'utf8')),
    },
  };
}

/**
 * A workspace whose next level holds two packages while only one holds an edge to this one.
 *
 * The two-package fixture cannot tell a reader of the published edges from a renderer of the
 * seed's injected adjacency: there, the next level and the consumer are the same single
 * package. Here pkg-0001's next level holds pkg-0002 and pkg-0003, and only pkg-0002 holds an
 * edge to pkg-0001, so a serial claim about pkg-0003 is false. The seed keeps the adjacency
 * values stage two injects, so the old rendering makes exactly that false claim.
 *
 * Two level-zero roots are required, not one: a package sits at level one only by depending on
 * something at level zero, so a level-mate that shares no edge with alpha must depend on a root
 * of its own. That is why this fixture holds four packages rather than three.
 */
// [::TICKET::] PX-224 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-224 --for-spec --no-implementation-order`.
export function materializeAdjacentLevelWorkspace() {
  const packageRecord = (id, name, responsibility) => ({
    id,
    name,
    path: `crates/protocol/${name}`,
    layer: 'protocol',
    kind: 'production-library',
    responsibilities: [responsibility],
    owns: { objects: [], claims: [], invariants: [], error_codes: [], required_tests: [], state_machines: [] },
  });

  return materializeExplainSeedWorkspace({
    fixture: {
      extraPackages: [
        packageRecord('pkg-0003', 'gamma', 'own the gamma record'),
        packageRecord('pkg-0004', 'delta', 'own the delta record'),
      ],
      edges: [
        { from: 'pkg-0002', to: 'pkg-0001' },
        { from: 'pkg-0003', to: 'pkg-0004' },
      ],
      order: {
        serial: ['pkg-0001', 'pkg-0004', 'pkg-0002', 'pkg-0003'],
        levels: [['pkg-0001', 'pkg-0004'], ['pkg-0002', 'pkg-0003']],
      },
      seedImplementationOrder: {
        before: [],
        after: ['pkg-0002', 'pkg-0003'],
        parallel_with: ['pkg-0004'],
        serial_index: 1,
        wave: 1,
      },
    },
  });
}

/** Copy the workspace aside and return a function that puts it back. */
export function snapshotWorkspace(root) {
  const backup = `${root}.snapshot`;
  if (existsSync(backup)) rmSync(backup, { recursive: true, force: true });
  cpSync(root, backup, { recursive: true });
  return () => {
    rmSync(root, { recursive: true, force: true });
    cpSync(backup, root, { recursive: true });
  };
}

/**
 * Put an explanation beside one package's seed, the way an earlier run of the command would have.
 *
 * Shared by the unit and acceptance suites because both need a neighbour that has answered a
 * shared question, and two copies of this would be two fixtures that could drift apart while
 * both claiming to be the same situation. The directory is created because a workspace fixture
 * writes only the seed it was asked for, so a neighbour's directory does not exist yet.
 *
 * @returns {string} the absolute path written, so a test can assert what the facts name it as
 */
// [::TICKET::] PX-225 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-225 --for-spec --no-implementation-order`.
export function writeNeighbourExplanation({ workspace, packageId, documentText }) {
  const documentPath = join(dirname(workspace.seedPathOf(packageId)), EXPLAIN_FILE_NAME);
  mkdirSync(dirname(documentPath), { recursive: true });
  writeFileSync(documentPath, documentText, 'utf8');
  return documentPath;
}
