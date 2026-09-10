// [::TICKET::] PX-195 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-195 --for-spec --no-implementation-order`.
// PX-195 @verifies C003
/**
 * Post-publication reload verification.
 *
 * The published artefacts are judged, not the renderer's memory: the tree is
 * rescanned, every seed re-parsed, the contracts re-extracted, the graph rebuilt,
 * the implementation order re-derived, the coverage re-proven and the allocate
 * manifest re-hashed. The first divergence is located so the operator knows which
 * artefact drifted.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { sha256Hex } from '../../workspacify-tree/lib/hash.mjs';
import { ALLOCATE_MANIFEST_FILE_NAME, SEED_FILE_NAME } from './seed-model.mjs';
import { computeAllocateSelfHash } from './allocate-manifest.mjs';
import { walkSeedContracts } from '../walk-seed-contracts.mjs';
import { buildContractIndex } from './contract-gate.mjs';
import { buildIntegrationGraph, runGraphViolations } from './wig.mjs';
import { deriveImplementationOrder } from './implementation-order.mjs';
import { buildCoverageProof } from './coverage-proof.mjs';

/**
 * Re-verify the published workspace.
 *
 * @param {{ workspaceRoot: string, plan: object, manifest: object, manifestPath: string, expected: object }} input
 * @returns {{ ok: boolean, divergences: Array<object>, observed: object }}
 */
export function reloadAndVerify({ workspaceRoot, plan, manifest, manifestPath, expected }) {
  const divergences = [];
  const walk = walkSeedContracts({ root: workspaceRoot, plan, manifest, manifestPath });
  for (const leaf of walk.missingSeeds) {
    divergences.push({ artefact: 'seed', field: 'missing', detail: leaf });
  }
  for (const leaf of walk.unreadableSeeds) {
    divergences.push({ artefact: 'seed', field: 'unreadable', detail: leaf });
  }
  for (const leaf of walk.missingReferences) {
    divergences.push({ artefact: 'seed', field: 'reference', detail: leaf });
  }

  const manifestFile = path.join(workspaceRoot, ALLOCATE_MANIFEST_FILE_NAME);
  let publishedManifest = null;
  try {
    publishedManifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  } catch {
    divergences.push({ artefact: 'manifest', field: 'missing', detail: manifestFile });
  }
  if (publishedManifest) {
    if (computeAllocateSelfHash(publishedManifest) !== publishedManifest.integrity?.manifest_hash) {
      divergences.push({ artefact: 'manifest', field: 'integrity.manifest_hash', detail: 'self-hash mismatch' });
    }
    for (const entry of expected?.seed_index ?? []) {
      const seedPath = path.join(workspaceRoot, entry.path);
      let observed = null;
      try {
        observed = sha256Hex(readFileSync(seedPath));
      } catch {
        divergences.push({ artefact: 'seed', package_id: entry.package, field: 'sha256', detail: 'seed missing' });
        continue;
      }
      if (observed !== entry.sha256) {
        divergences.push({ artefact: 'seed', package_id: entry.package, field: 'sha256', detail: 'seed changed after publication' });
      }
    }
  }

  const parsedByPackage = new Map();
  for (const [packageId, parsed] of walk.byPackage) {
    parsedByPackage.set(packageId, parsed);
  }
  const contractIndex = buildContractIndex({ parsedByPackage, manifest });
  const graph = buildIntegrationGraph({ contractIndex, manifest });
  const violations = runGraphViolations({ graph, manifest });
  if (!violations.ok) {
    divergences.push({ artefact: 'graph', field: 'violations', detail: `${violations.violations.length} violation(s)` });
  }
  if (expected?.wig?.hash && expected.wig.hash !== violations.hash) {
    divergences.push({ artefact: 'graph', field: 'hash', detail: 'integration graph changed after publication' });
  }
  const order = deriveImplementationOrder({ graph, manifest });
  if (JSON.stringify(order.serial) !== JSON.stringify(expected?.implementation_order?.serial ?? order.serial)) {
    divergences.push({ artefact: 'order', field: 'serial', detail: 'implementation order changed after publication' });
  }
  const coverageProof = buildCoverageProof({ manifest, expectedAllocation: new Map(), parsedByPackage });
  if ((coverageProof.uncovered ?? []).length > 0) {
    divergences.push({ artefact: 'coverage', field: 'uncovered', detail: coverageProof.uncovered.join(', ') });
  }

  return {
    ok: divergences.length === 0,
    divergences,
    observed: {
      seedCount: walk.byPackage.size,
      contractCount: contractIndex.size,
      graphHash: violations.hash,
      orderSerial: order.serial,
      segmentsCovered: coverageProof.segments_covered,
    },
  };
}
