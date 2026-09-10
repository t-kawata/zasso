// [::TICKET::] PX-192, PX-202 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-192|PX-202) --for-spec --no-implementation-order`.
// PX-192 @verifies C001 C003 C004 C005
// Fixtures for the stage-1 hand-off proofs: a manifest that carries the DAG
// proof, the frozen contract scopes, a total segment partition, segment-addressed
// traceability and non-empty package responsibilities.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assembleManifest } from '../../../.claude/scripts/workspacify-tree/lib/render.mjs';
import { buildHeadingTree } from '../../../.claude/scripts/workspacify-tree/lib/headings.mjs';
import { segmentAtHeadings } from '../../../.claude/scripts/workspacify-tree/lib/segmentation.mjs';
import { normalizeTextBytes } from '../../../.claude/scripts/workspacify-tree/lib/normalization.mjs';
import { sha256Hex } from '../../../.claude/scripts/workspacify-tree/lib/hash.mjs';
import { runDagChecks } from '../../../.claude/scripts/workspacify-tree/lib/dag.mjs';
import { CORE_CONTRACT_CLAUSES } from '../../../.claude/scripts/workspacify-tree/lib/contract-clauses.mjs';
import { attachOwnedInventory } from '../../../.claude/scripts/workspacify-tree/lib/segment-ownership.mjs';

export const DEFAULT_SPEC_TEXT = [
  '# Specification',
  '',
  'Preamble paragraph.',
  '',
  '## Alpha',
  '',
  'The alpha record obj-000001 is normative.',
  '',
  '## Beta',
  '',
  'The beta record obj-000002 consumes alpha.',
  '',
].join('\n');

/** Segment the default specification with the real segmentation pipeline. */
export function segmentSpecification(sourceText = DEFAULT_SPEC_TEXT) {
  const lines = sourceText.split('\n');
  const headings = buildHeadingTree(lines, undefined, { sourceText });
  const { segments } = segmentAtHeadings({ sourceText, headings }, { segmentLevel: 2 });
  const normalized = normalizeTextBytes(Buffer.from(sourceText, 'utf8'));
  return { headings, segments, sourceBytes: normalized.bytes.length, sourceHash: sha256Hex(normalized.bytes), sourceText };
}

/** Segment id that contains a given byte offset, or null when none does. */
export function segmentIdForOffset(segments, byteOffset) {
  const match = segments.find((segment) => byteOffset >= segment.byte_start && byteOffset < segment.byte_end);
  return match ? match.id : null;
}

/** The two-package protocol workspace used by the hand-off tests. */
export function buildValidTreeManifest(overrides = {}) {
  const { segments, sourceBytes, sourceHash } = segmentSpecification();
  const packages = [
    {
      id: 'pkg-alpha', name: 'alpha', path: 'crates/protocol/alpha', layer: 'protocol', kind: 'production-library',
      responsibilities: ['own the alpha record'], seed_required: true, owns: { objects: ['obj-000001'] },
    },
    {
      id: 'pkg-beta', name: 'beta', path: 'crates/protocol/beta', layer: 'protocol', kind: 'production-library',
      responsibilities: ['own the beta record and its consumer obligation'], seed_required: true, owns: { objects: ['obj-000002'] },
    },
  ];
  const tree = [{
    name: 'crates', path: 'crates', kind: 'dir',
    children: [{
      name: 'protocol', path: 'crates/protocol', kind: 'dir',
      children: [
        { name: 'alpha', path: 'crates/protocol/alpha', kind: 'dir', children: [] },
        { name: 'beta', path: 'crates/protocol/beta', kind: 'dir', children: [] },
      ],
    }],
  }];
  const normalEdges = [{ from: 'pkg-beta', to: 'pkg-alpha', reasonCode: 'canonical-object', reason: 'beta consumes the alpha record' }];
  const dag = runDagChecks({ packages, edges: normalEdges, forbiddenEdges: [] });
  const boundaries = normalEdges.map((edge, index) => ({
    id: `boundary-${String(index + 1).padStart(3, '0')}`,
    consumer_package: edge.from,
    provider_package: edge.to,
    dependency_reason_code: edge.reasonCode,
    stage2_contract_scope: [...CORE_CONTRACT_CLAUSES],
  }));
  const inventory = {
    objects: [
      { id: 'obj-000001', canonical_name: 'obj-000001', classification: 'record', source_refs: [{ segment_id: segmentIdForOffset(segments, 60), line_start: 6, line_end: 6, byte_start: 60, byte_end: 90, snippet: 'alpha' }], normalization_status: 'CONFIRMED' },
      { id: 'obj-000002', canonical_name: 'obj-000002', classification: 'record', source_refs: [{ segment_id: segmentIdForOffset(segments, 100), line_start: 10, line_end: 10, byte_start: 100, byte_end: 130, snippet: 'beta' }], normalization_status: 'CONFIRMED' },
    ],
    claims: [], invariants: [], state_machines: [], error_codes: [], required_tests: [], terms: [],
    normalization_decisions: [], unresolved_candidates: [],
  };
  const manifest = assembleManifest({
    status: 'COMPLETE',
    input: { spec_path: 'spec.md', source_hash: sourceHash, source_bytes: sourceBytes, source_encoding: 'UTF-8', newline_normalization: 'LF', hash_algorithm: 'SHA-256' },
    structure: { segment_count: segments.length, covered_bytes: sourceBytes, segments: attachOwnedInventory({ segments, inventory }) },
    inventory,
    workspace: {
      tree,
      packages,
      ownership: {
        entries: [
          { inventory_ref: 'obj-000001', canonical_name: 'obj-000001', category: 'object', owner_package: 'pkg-alpha' },
          { inventory_ref: 'obj-000002', canonical_name: 'obj-000002', category: 'object', owner_package: 'pkg-beta' },
        ],
        packages: ['pkg-alpha', 'pkg-beta'],
      },
    },
    dependencies: {
      orientation: 'consumer_to_direct_dependency',
      normal_edges: normalEdges,
      forbidden_edges: [],
      forbidden_layer_rules: [],
      dev_dependency_policy: [],
      boundaries,
      dag,
    },
    conformance: { test_obligations: [], ci_rules: [] },
    stage2_handoff: {
      eligible: true,
      entry_gate: { required_status: 'COMPLETE' },
      contract_definition_order: ['obj-000001', 'obj-000002'],
      contract_boundaries: boundaries,
      non_goals_of_stage1: [],
    },
    final_audit: {
      status: 'PASS', orphan_object_count: 0, orphan_claim_count: 0, owner_collision_count: 0,
      unknown_dependency_count: 0, forbidden_dependency_count: 0, layer_violation_count: 0,
      cycle_count: 0, review_required_count: 0, unresolved_count: 0, unallocated_count: 0,
      missing_responsibilities_count: 0,
    },
    integrity: { reload_validation: 'PASS', input_hash_verified_at_finalize: true },
    ...overrides,
  });
  return { manifest, segments, sourceBytes, sourceHash, packages, normalEdges, boundaries };
}

/** Write the specification and the manifest into a fresh temp directory. */
export function materializeTreeFixture(overrides = {}) {
  const built = buildValidTreeManifest(overrides);
  const dir = mkdtempSync(join(tmpdir(), 'wst-192-'));
  const specPath = join(dir, 'spec.md');
  writeFileSync(specPath, DEFAULT_SPEC_TEXT);
  return { ...built, dir, specPath };
}
