// [::TICKET::] PX-191 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-191 --for-spec --no-implementation-order`.
// [::TICKET::] PX-190 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-190 --for-spec --no-implementation-order`.
// [::TICKET::] PX-189 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-189 --for-spec --no-implementation-order`.
/**
 * Test helper: build a stage-1 manifest object that satisfies the ALLOCATE
 * entry gate, plus an optional co-located specification on disk.
 *
 * The returned manifest is produced through assembleManifest so its top-level
 * skeleton and self-hash are canonical. Tests override sections they need.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sha256Hex } from '../../../.claude/scripts/workspacify-tree/lib/hash.mjs';
import { normalizeTextBytes } from '../../../.claude/scripts/workspacify-tree/lib/normalization.mjs';
import { assembleManifest } from '../../../.claude/scripts/workspacify-tree/lib/render.mjs';

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
  };
}

/**
 * Build a valid tree manifest.
 *
 * @param {object} [overrides] - partial manifest sections merged over defaults
 * @returns {{ manifest: object, specText: string, sourceHash: string }}
 */
export function buildValidManifest(overrides = {}) {
  const specText = '# Spec\n\n## Chapter\n\ntable with obj-000001\n';
  const sourceHash = sha256Hex(normalizeTextBytes(Buffer.from(specText)).bytes);
  const manifest = assembleManifest({
    status: 'COMPLETE',
    input: { spec_path: 'spec.md', source_hash: sourceHash },
    dependencies: {
      orientation: 'consumer_to_direct_dependency',
      normal_edges: [],
      forbidden_edges: [],
      forbidden_layer_rules: [],
      dev_dependency_policy: [],
      boundaries: [],
    },
    stage2_handoff: {
      eligible: true,
      entry_gate: { required_status: 'COMPLETE' },
      contract_definition_order: [],
      contract_boundaries: [],
    },
    final_audit: zeroAudit(),
    integrity: { reload_validation: 'PASS', input_hash_verified_at_finalize: true },
    ...overrides,
  });
  return { manifest, specText, sourceHash };
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

/** Default specification text whose hash buildValidManifest records. */
export const DEFAULT_SPEC_TEXT = '# Spec\n\n## Chapter\n\ntable with obj-000001\n';

/** Fill every AI-authored seed section with a non-empty body. */
export function baseAiSections() {
  return {
    3: 'Note: the Allocation Index table above is authoritative.',
    4: 'In-scope objects, claims, predicates, state and invariants of this package.',
    5: 'Incoming dependency and consumer obligation context.',
    6: 'Outgoing provider obligations to consumers.',
    7: 'Integration Context (Stage-1 Manifest Edges) copied from the manifest.',
    8: 'not_applicable — this package keeps no mutable state.',
    9: 'not_applicable — this package performs no external I/O.',
    10: 'Canonicalization, signature and proof responsibilities per stage-1.',
    11: 'Failure, rejection, recovery and finality material per stage-1 error codes.',
    12: 'Required unit, integration, exception and malfeasance test material.',
    13: 'Grill question: confirm the stage-1 ownership split during the canonical RFC grill.',
    15: 'Forbidden dependencies, non-interference boundaries and non-goals from the manifest.',
  };
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
  const seeds = packages.filter((pkg) => pkg.seed_required !== false).map((pkg) => ({ packageId: pkg.id, aiSections: baseAiSections() }));
  return { seeds, semantic_review: { status: approved ? 'APPROVED' : 'REVIEW_REQUIRED', statement: 'reviewed every package allocation and boundary', approver: 'ai-session' } };
}

/**
 * Materialize a seed fixture manifest plus its exact co-located spec in a
 * fresh temp dir, ready for the run.mjs CLI.
 *
 * @returns {{ dir: string, manifestPath: string, manifest: object }}
 */
export function materializeSeedFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'wt-191-cli-'));
  const { manifest } = buildSeedFixture();
  writeFileSync(join(dir, 'spec.md'), DEFAULT_SPEC_TEXT);
  const manifestPath = join(dir, 'WORKSPACIFY-TREE-MANIFEST.json');
  writeFileSync(manifestPath, JSON.stringify(manifest));
  return { dir, manifestPath, manifest };
}

/** Shared multi-package fixture for the PX-190 seed/allocation tests. */
export function buildSeedFixture() {
  const packages = [
    { id: 'pkg-a', name: 'alpha', path: 'crates/protocol/alpha', layer: 'protocol', kind: 'production-library', seed_required: true, owns: { objects: ['obj-000001'], invariants: ['inv-1'], required_tests: ['tst-1'] } },
    { id: 'pkg-b', name: 'beta', path: 'crates/protocol/beta', layer: 'protocol', kind: 'production-library', seed_required: true, owns: { claims: ['c-1'] } },
  ];
  const entries = [
    { inventory_ref: 'obj-000001', canonical_name: 'Alpha Record', category: 'object', owner_package: 'pkg-a' },
    { inventory_ref: 'inv-1', canonical_name: 'alpha-invariant', category: 'invariant', owner_package: 'pkg-a' },
    { inventory_ref: 'tst-1', canonical_name: 'alpha-test', category: 'required_test', owner_package: 'pkg-a' },
    { inventory_ref: 'c-1', canonical_name: 'Beta Claim', category: 'claim', owner_package: 'pkg-b' },
  ];
  const built = buildValidManifest({
    workspace: {
      tree: [
        { name: 'crates', path: 'crates', kind: 'dir', children: [
          { name: 'protocol', path: 'crates/protocol', kind: 'dir', children: [
            { name: 'alpha', path: 'crates/protocol/alpha', kind: 'dir', children: [] },
            { name: 'beta', path: 'crates/protocol/beta', kind: 'dir', children: [] },
          ] },
        ] },
      ],
      packages,
      ownership: { entries, packages: packages.map((pkg) => pkg.id) },
    },
    inventory: {
      objects: [{ id: 'obj-000001', canonical_name: 'Alpha Record', classification: 'object', source_refs: [{ section_id: 'h-2', line_start: 3, line_end: 3, byte_start: 0, byte_end: 10 }], review_status: 'CONFIRMED' }],
      claims: [{ id: 'c-1', canonical_name: 'Beta Claim', classification: 'claim', source_refs: [{ section_id: 'h-4', line_start: 5, line_end: 5, byte_start: 0, byte_end: 8 }], review_status: 'CONFIRMED' }],
      invariants: [{ id: 'inv-1', canonical_name: 'alpha-invariant' }],
      state_machines: [],
      error_codes: [],
      required_tests: [{ id: 'tst-1', canonical_name: 'alpha-test' }],
      terms: [],
      normalization_decisions: [],
      unresolved_candidates: [],
    },
    dependencies: {
      orientation: 'consumer_to_direct_dependency',
      normal_edges: [{ from: 'pkg-a', to: 'pkg-b', reasonCode: 'depends' }],
      forbidden_edges: [{ from: 'pkg-b', to: 'pkg-a', reasonCode: 'forbidden', alternative: null }],
      forbidden_layer_rules: [],
      dev_dependency_policy: [],
      boundaries: [{ id: 'boundary-001', consumer_package: 'pkg-a', provider_package: 'pkg-b', dependency_reason_code: 'depends', stage2_contract_scope: ['input'] }],
    },
    conformance: { test_obligations: [], ci_rules: [] },
  });
  const manifest = built.manifest;
  return { manifest, packages, entries };
}
