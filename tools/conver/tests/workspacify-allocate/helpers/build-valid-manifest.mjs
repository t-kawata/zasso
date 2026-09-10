// [::TICKET::] PX-193, PX-194 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-193|PX-194) --for-spec --no-implementation-order`.
// [::TICKET::] PX-191, PX-190, PX-189 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-189|PX-190|PX-191) --for-spec --no-implementation-order`.
/**
 * Test helper: build a stage-1 manifest that carries the hand-off proofs stage 2
 * relies on (dependency proof with an implementation order, boundary contract
 * scopes with the core clauses, a total segment partition, segment-addressed
 * inventory refs, package responsibilities and the contract-item order), plus an
 * optional co-located specification on disk.
 *
 * The manifest is produced through assembleManifest so its skeleton and self-hash
 * are canonical; tests override the sections they need.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sha256Hex } from '../../../.claude/scripts/workspacify-tree/lib/hash.mjs';
import { normalizeTextBytes } from '../../../.claude/scripts/workspacify-tree/lib/normalization.mjs';
import { assembleManifest } from '../../../.claude/scripts/workspacify-tree/lib/render.mjs';
import { buildHeadingTree } from '../../../.claude/scripts/workspacify-tree/lib/headings.mjs';
import { segmentAtHeadings } from '../../../.claude/scripts/workspacify-tree/lib/segmentation.mjs';
import { runDagChecks } from '../../../.claude/scripts/workspacify-tree/lib/dag.mjs';
import { buildBoundaryContractScope } from '../../../.claude/scripts/workspacify-tree/lib/contract-clauses.mjs';

/** Default specification text whose hash buildValidManifest records. */
export const DEFAULT_SPEC_TEXT = [
  '## Alpha',
  '',
  'The alpha record obj-000001 is normative.',
  '',
  '## Beta',
  '',
  'The beta record obj-000002 must be validated before use.',
  '',
].join('\n');

/** Default zero-count audit object required by the entry gate. */
export function zeroAudit() {
  return {
    status: 'PASS',
    orphan_object_count: 0,
    orphan_claim_count: 0,
    owner_collision_count: 0,
    unknown_dependency_count: 0,
    forbidden_dependency_count: 0,
    layer_violation_count: 0,
    cycle_count: 0,
    review_required_count: 0,
    unresolved_count: 0,
    unallocated_count: 0,
    missing_responsibilities_count: 0,
  };
}

/** Segment the given specification through the real pipeline. */
export function segmentSpecification(sourceText = DEFAULT_SPEC_TEXT) {
  const headings = buildHeadingTree(sourceText.split('\n'), undefined, { sourceText });
  const { segments } = segmentAtHeadings({ sourceText, headings }, { segmentLevel: 2 });
  const normalized = normalizeTextBytes(Buffer.from(sourceText, 'utf8'));
  return { segments, sourceBytes: normalized.bytes.length, sourceHash: sha256Hex(normalized.bytes) };
}

/** Segment id containing a byte offset, or null when none does. */
export function segmentIdForOffset(segments, byteOffset) {
  const owner = segments.find((segment) => byteOffset >= segment.byte_start && byteOffset < segment.byte_end);
  return owner ? owner.id : null;
}

/** Two-package protocol workspace: pkg-b consumes pkg-a. */
export function defaultPackages() {
  return [
    {
      id: 'pkg-a', name: 'alpha', path: 'crates/protocol/alpha', layer: 'protocol', kind: 'production-library',
      responsibilities: ['own the alpha and beta records and their validity'], seed_required: true,
      owns: { objects: ['obj-000001', 'obj-000002'] },
    },
    {
      id: 'pkg-b', name: 'beta', path: 'crates/protocol/beta', layer: 'protocol', kind: 'production-library',
      responsibilities: ['own the beta consumer obligation'], seed_required: true, owns: {},
    },
  ];
}

/** Workspace tree that matches defaultPackages() leaf for leaf. */
export function defaultTree() {
  return [{
    name: 'crates', path: 'crates', kind: 'dir',
    children: [{
      name: 'protocol', path: 'crates/protocol', kind: 'dir',
      children: [
        { name: 'alpha', path: 'crates/protocol/alpha', kind: 'dir', children: [] },
        { name: 'beta', path: 'crates/protocol/beta', kind: 'dir', children: [] },
      ],
    }],
  }];
}

/**
 * Build a valid tree manifest.
 *
 * @param {object} [overrides] - partial manifest sections merged over defaults
 * @returns {{ manifest: object, specText: string, sourceHash: string }}
 */
export function buildValidManifest(overrides = {}) {
  const { segments, sourceBytes, sourceHash } = segmentSpecification();
  const packages = defaultPackages();
  const normalEdges = [{ from: 'pkg-b', to: 'pkg-a', reasonCode: 'direct-value-dependency', reason: 'beta consumes the alpha record' }];
  const boundaries = normalEdges.map((edge, index) => ({
    id: `boundary-${String(index + 1).padStart(3, '0')}`,
    consumer_package: edge.from,
    provider_package: edge.to,
    dependency_reason_code: edge.reasonCode,
    stage2_contract_scope: buildBoundaryContractScope('value_only'),
  }));
  const inventory = {
    objects: [
      {
        id: 'obj-000001', canonical_name: 'Alpha Record', classification: 'record',
        source_refs: [{ segment_id: segmentIdForOffset(segments, 20), section_id: 'h-000001', line_start: 3, line_end: 3, byte_start: 20, byte_end: 40, snippet: 'obj-000001' }],
        normalization_status: 'CONFIRMED',
      },
      {
        id: 'obj-000002', canonical_name: 'Beta Record', classification: 'record',
        source_refs: [{ segment_id: segments[segments.length - 1].id, section_id: 'h-000002', line_start: 7, line_end: 7, byte_start: sourceBytes - 20, byte_end: sourceBytes - 1, snippet: 'obj-000002' }],
        normalization_status: 'CONFIRMED',
      },
    ],
    claims: [],
    invariants: [],
    state_machines: [],
    error_codes: [],
    required_tests: [],
    terms: [],
    normalization_decisions: [],
    unresolved_candidates: [],
  };
  const carriedBySegment = new Map(segments.map((segment) => [segment.id, []]));
  for (const item of inventory.objects) {
    for (const ref of item.source_refs) {
      carriedBySegment.get(ref.segment_id)?.push(item.id);
    }
  }
  const openSegments = segments.map((segment) => ({ ...segment, owned_inventory_ids: [...carriedBySegment.get(segment.id)].sort() }));

  const manifest = assembleManifest({
    status: 'COMPLETE',
    input: { spec_path: 'spec.md', source_hash: sourceHash, source_bytes: sourceBytes },
    structure: { segment_count: segments.length, covered_bytes: sourceBytes, segments: openSegments },
    inventory,
    workspace: {
      tree: defaultTree(),
      packages,
      ownership: {
        entries: [
          { inventory_ref: 'obj-000001', canonical_name: 'Alpha Record', category: 'object', owner_package: 'pkg-a' },
          { inventory_ref: 'obj-000002', canonical_name: 'Beta Record', category: 'object', owner_package: 'pkg-a' },
        ],
        packages: ['pkg-a', 'pkg-b'],
      },
    },
    dependencies: {
      orientation: 'consumer_to_direct_dependency',
      normal_edges: normalEdges,
      forbidden_edges: [],
      forbidden_layer_rules: [],
      dev_dependency_policy: [],
      boundaries,
      dag: runDagChecks({ packages, edges: normalEdges }),
    },
    stage2_handoff: {
      eligible: true,
      entry_gate: { required_status: 'COMPLETE' },
      contract_definition_order: ['Alpha Record'],
      contract_boundaries: boundaries,
    },
    final_audit: zeroAudit(),
    integrity: { reload_validation: 'PASS', input_hash_verified_at_finalize: true },
    ...overrides,
  });
  return { manifest, specText: DEFAULT_SPEC_TEXT, sourceHash };
}

/**
 * Materialize a manifest plus its co-located spec inside a fresh temp dir.
 *
 * @returns {{ dir: string, manifestPath: string, manifest: object, specText: string, sourceHash: string }}
 */
export function materializeManifestDir(overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'wt-allocate-'));
  const { manifest, specText, sourceHash } = buildValidManifest(overrides);
  writeFileSync(join(dir, 'spec.md'), specText);
  const manifestPath = join(dir, 'WORKSPACIFY-TREE-MANIFEST.json');
  writeFileSync(manifestPath, JSON.stringify(manifest));
  return { dir, manifestPath, manifest, specText, sourceHash };
}

/** Fill every AI-authored seed section with a non-empty body (new grammar keys). */
export function baseAiSections() {
  return {
    4: 'In-scope objects, claims, predicates, state and invariants of this package.',
    5: 'Incoming dependency and consumer obligation context taken from the counterpart contract.',
    6: 'Outgoing provider obligations to consumers.',
    7: 'not_applicable — this package keeps no mutable state.',
    8: 'not_applicable — this package performs no external I/O.',
    9: 'Canonicalization, signature and proof responsibilities per stage-1.',
    10: 'Failure, rejection, recovery and finality material per stage-1 error codes.',
    11: 'Required unit, integration, exception and malfeasance test material.',
    12: 'Grill question: confirm the stage-1 ownership split during the canonical RFC grill.',
    13: 'Forbidden dependencies, non-interference boundaries and non-goals from the manifest.',
  };
}

/**
 * Build a publishable decisions payload for every seed_required package.
 *
 * @param {object} manifest - tree manifest
 * @param {{ approved?: boolean }} [options]
 * @returns {object} decisions payload
 */
/** Fill every clause a boundary declared, with groups shaped by the clause kind. */
export function defaultClausesForScope(scope = []) {
  const listClauses = new Set(['preconditions', 'postconditions', 'invariants', 'errors', 'tests']);
  const clauses = {};
  for (const clause of scope) {
    clauses[clause] = listClauses.has(clause)
      ? [`${clause} for this boundary (fixture)`]
      : `${clause} statement for this boundary (fixture)`;
  }
  return clauses;
}

/** The contract edges a package owes for the boundaries that touch it. */
export function contractEdgesForPackage(manifest, packageId) {
  const packages = manifest.workspace?.packages ?? [];
  const packageById = new Map(packages.map((pkg) => [pkg.id, pkg]));
  const edges = [];
  for (const boundary of manifest.dependencies?.boundaries ?? []) {
    if (boundary.consumer_package !== packageId && boundary.provider_package !== packageId) {
      continue;
    }
    const isConsumer = boundary.consumer_package === packageId;
    const counterpartId = isConsumer ? boundary.provider_package : boundary.consumer_package;
    edges.push({
      contract_id: `contract-${boundary.id}`,
      boundary_id: boundary.id,
      direction: isConsumer ? 'consumer_to_provider' : 'provider_to_consumer',
      connection_kind: boundary.connection_kind ?? 'value_only',
      consumer_package: boundary.consumer_package,
      provider_package: boundary.provider_package,
      consumer_path: packageById.get(boundary.consumer_package)?.path,
      provider_path: packageById.get(boundary.provider_package)?.path,
      owners: { semantic: boundary.provider_package, state: 'not_applicable', side_effect: 'not_applicable', port: 'not_applicable', adapter: 'not_applicable' },
      clauses: defaultClausesForScope(boundary.stage2_contract_scope ?? []),
      source_refs: [],
    });
  }
  return edges;
}

/**
 * Build a publishable decisions payload for every seed_required package.
 *
 * @param {object} manifest - tree manifest
 * @param {{ approved?: boolean }} [options]
 * @returns {object} decisions payload
 */
export function makeDecisions(manifest, { approved = true } = {}) {
  const packages = manifest.workspace?.packages ?? [];
  const seeds = packages
    .filter((pkg) => pkg.seed_required !== false)
    .map((pkg) => ({ packageId: pkg.id, aiSections: baseAiSections(), contractEdges: contractEdgesForPackage(manifest, pkg.id) }));
  return { seeds, semantic_review: { status: approved ? 'APPROVED' : 'REVIEW_REQUIRED', statement: 'reviewed every package allocation and boundary', approver: 'ai-session' } };
}

/**
 * Materialize a seed fixture manifest plus its exact co-located spec in a
 * fresh temp dir, ready for the run.mjs CLI.
 *
 * @returns {{ dir: string, manifestPath: string, manifest: object }}
 */
export function materializeSeedFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'wt-193-cli-'));
  const { manifest } = buildValidManifest();
  writeFileSync(join(dir, 'spec.md'), DEFAULT_SPEC_TEXT);
  const manifestPath = join(dir, 'WORKSPACIFY-TREE-MANIFEST.json');
  writeFileSync(manifestPath, JSON.stringify(manifest));
  return { dir, manifestPath, manifest };
}

/** Shared multi-package fixture for the seed and allocation tests. */
export function buildSeedFixture() {
  return buildValidManifest();
}
