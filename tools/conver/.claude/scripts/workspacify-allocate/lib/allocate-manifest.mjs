// [::TICKET::] PX-195 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-195 --for-spec --no-implementation-order`.
// PX-195 @verifies C001
/**
 * The stage-2 machine authority.
 *
 * WORKSPACIFY-ALLOCATE-MANIFEST.json records what was proven about the published
 * workspace: the stage-1 manifest and specification it came from, every seed with
 * its hash, the coupling contract registry, the integration graph summary and
 * hash, the implementation order, the source coverage and the gate results. It is
 * referenced by the seeds by path only — embedding its hash in a seed would create
 * a hash cycle, because the manifest records the seed hashes.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { sha256Hex } from '../../workspacify-tree/lib/hash.mjs';
import { canonicalSerialize } from '../../workspacify-tree/lib/canonical-json.mjs';
import { SEED_FILE_NAME } from './seed-model.mjs';

/** Hash algorithm recorded in the manifest. */
export const ALLOCATE_MANIFEST_HASH_ALGORITHM = 'SHA-256';

/** Canonicalisation scheme shared with stage 1. */
export const ALLOCATE_MANIFEST_CANONICALIZATION = 'workspacify-allocate-json-v1';

/**
 * Build the allocate manifest from the verified run.
 *
 * @param {{ manifestRef: { manifest: object, manifestPath: string, manifestDir: string }, plan: object, renderedByPackage?: Map<string, object>, proof: { parsedByPackage: Map<string, object>, contractIndex: Map<string, object>, graph: object, violations: object, order: object, coverageProof: object }, review?: { gateResults?: Array<object>, semanticReview?: object } }} input
 * @returns {object} allocate manifest
 */
export function buildAllocateManifest({ manifestRef, plan, renderedByPackage = new Map(), proof, review = {} }) {
  const { manifest, manifestPath, manifestDir } = manifestRef;
  const { parsedByPackage, contractIndex, graph, violations, order, coverageProof } = proof;
  const gateResults = review.gateResults ?? [];
  const semanticReview = review.semanticReview ?? { status: 'REVIEW_REQUIRED' };
  const packages = manifest.workspace?.packages ?? [];
  const seedIndex = packages
    .filter((pkg) => pkg.seed_required !== false)
    .map((pkg) => ({
      package: pkg.id,
      path: `${pkg.path}/${SEED_FILE_NAME}`,
      sha256: hashSeed({ manifestDir, pkg, renderedByPackage }),
    }))
    .sort((left, right) => left.package.localeCompare(right.package));

  const allocateManifest = {
    artifact_kind: 'workspacify-allocate-manifest',
    schema_version: '1.0.0',
    status: 'COMPLETE',
    run: { workspace_root: '.', planned_directory_count: (plan?.relativeDirs ?? []).length },
    input_tree_manifest: {
      path: path.basename(manifestPath),
      hash: manifest.integrity?.manifest_hash ?? null,
      spec: { path: manifest.input?.spec_path ?? null, sha256: manifest.input?.source_hash ?? null },
    },
    seed_index: seedIndex,
    source_coverage: {
      segments_total: coverageProof?.segments_total ?? 0,
      segments_covered: coverageProof?.segments_covered ?? 0,
      material_segments: coverageProof?.material_segments ?? [],
      non_material_segments: coverageProof?.non_material_segments ?? [],
      uncovered: coverageProof?.uncovered ?? [],
    },
    contract_registry: [...contractIndex.values()].map((entry) => canonicalContract(entry)),
    wig: {
      summary: violations?.summary ?? { node_count: 0, edge_count: 0, by_connection_kind: {}, by_layer: {} },
      counts: violations?.summary ?? { node_count: 0, edge_count: 0 },
      hash: violations?.hash ?? null,
      violations: (violations?.violations ?? []).map((entry) => ({ class: entry.class, detail: entry.detail })),
    },
    implementation_order: { serial: order?.serial ?? [], levels: order?.levels ?? [] },
    allocation: {
      package_count: packages.length,
      seed_count: seedIndex.length,
      parsed_package_count: parsedByPackage?.size ?? 0,
    },
    gates: gateResults.map((gate) => ({ id: gate.id, status: gate.status })),
    semantic_review: { status: semanticReview?.status ?? 'REVIEW_REQUIRED', approver: semanticReview?.approver ?? null },
    completion_decision: 'COMPLETE',
    integrity: {
      canonicalization: ALLOCATE_MANIFEST_CANONICALIZATION,
      manifest_hash_algorithm: ALLOCATE_MANIFEST_HASH_ALGORITHM,
      manifest_hash: '',
      reload_validation: 'READY',
    },
  };
  allocateManifest.integrity.manifest_hash = computeAllocateSelfHash(allocateManifest);
  return allocateManifest;
}

/** Self-hash over the canonical rendering, with the hash field blanked. */
export function computeAllocateSelfHash(allocateManifest) {
  const copy = JSON.parse(JSON.stringify(allocateManifest));
  copy.integrity = { ...(copy.integrity ?? {}), manifest_hash: '' };
  return sha256Hex(Buffer.from(canonicalSerialize(copy), 'utf8'));
}

/** Canonical text of the manifest, newline terminated. */
export function renderAllocateManifest(allocateManifest) {
  return `${JSON.stringify(allocateManifest, null, 2)}\n`;
}

function canonicalContract(entry) {
  const edge = entry.sides?.[entry.consumer_package] ?? entry.sides?.[entry.provider_package] ?? entry.occurrences?.[0]?.edge ?? {};
  return {
    contract_id: entry.contract_id,
    boundary_id: entry.boundary_id ?? null,
    consumer_package: entry.consumer_package ?? edge.consumer_package ?? null,
    provider_package: entry.provider_package ?? edge.provider_package ?? null,
    connection_kind: edge.connection_kind ?? null,
    owners: edge.owners ?? {},
    clauses: edge.clauses ?? {},
    source_refs: edge.source_refs ?? [],
  };
}

/**
 * Hash a package's seed.
 *
 * The rendered text is hashed when the run still holds it, so the manifest can be
 * built before publication and still record exactly what will be written; the
 * file on disk is the fallback for a rebuild over a published workspace.
 */
function hashSeed({ manifestDir, pkg, renderedByPackage }) {
  const rendered = renderedByPackage.get(pkg.id);
  if (rendered?.seedText) {
    return sha256Hex(Buffer.from(rendered.seedText, 'utf8'));
  }
  return sha256Hex(readFileSync(path.join(manifestDir, pkg.path, SEED_FILE_NAME)));
}
