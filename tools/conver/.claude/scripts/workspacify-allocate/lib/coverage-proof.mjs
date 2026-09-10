// [::TICKET::] PX-193, PX-196 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-193|PX-196) --for-spec --no-implementation-order`.
// PX-193 @verifies C004
/**
 * Zero-omission transfer proof.
 *
 * Stage 1 partitions the specification into segments, stamps every inventory item
 * with the segment it came from, and declares per segment which material it
 * carries. Stage 2 proves that nothing was dropped by requiring every segment that
 * carries material to be referenced by at least one seed, by recording the
 * material-free segments explicitly, and by checking that every inventory item is
 * allocated exactly once. The proof reads the parsed seeds, never the renderer's
 * in-memory state.
 */
import { WorkSpacifyTreeError } from '../../workspacify-tree/lib/errors.mjs';
import { isReasonlessNotApplicable } from './seed-model.mjs';

/**
 * Build the coverage proof over the parsed seed set.
 *
 * @param {{ manifest: object, expectedAllocation: Map<string, object[]>, parsedByPackage: Map<string, object>, duplicateOwnerRefs?: string[] }} input
 * @returns {{ segments_total: number, segments_covered: number, material_segments: string[], non_material_segments: string[], uncovered: string[], per_package_segments: object, unallocated_items: string[], duplicate_owner_refs: string[], not_applicable_without_reason: string[] }}
 */
export function buildCoverageProof({ manifest, expectedAllocation = new Map(), parsedByPackage = new Map(), duplicateOwnerRefs = [] }) {
  const segments = manifest?.structure?.segments ?? [];
  const covered = new Set();
  const perPackageSegments = {};

  for (const [packageId, parsed] of parsedByPackage) {
    const referenced = new Set([
      ...(parsed?.referenceBlock?.source_segments ?? []),
      ...(parsed?.traceabilityRows ?? []).map((row) => row.segmentId).filter((id) => typeof id === 'string'),
    ]);
    const sorted = [...referenced].sort();
    perPackageSegments[packageId] = sorted;
    for (const segmentId of sorted) {
      covered.add(segmentId);
    }
  }

  // A segment with no harvested material is prose: no seed owes it, but it is
  // recorded so the omission is visible rather than silent.
  const materialSegments = segments
    .filter((segment) => (segment.owned_inventory_ids ?? []).length > 0)
    .map((segment) => segment.id);
  const nonMaterialSegments = segments
    .filter((segment) => (segment.owned_inventory_ids ?? []).length === 0)
    .map((segment) => segment.id);
  const uncovered = materialSegments.filter((segmentId) => !covered.has(segmentId));

  const allocatedKeys = new Set();
  for (const items of expectedAllocation.values()) {
    for (const item of items) {
      allocatedKeys.add(`${item.category}:${item.inventory_ref}`);
    }
  }
  const unallocatedItems = collectInventoryKeys(manifest).filter((key) => !allocatedKeys.has(key));

  const notApplicableWithoutReason = [];
  for (const [packageId, parsed] of parsedByPackage) {
    for (const heading of parsed?.headings ?? []) {
      if (isReasonlessNotApplicable(heading.body)) {
        notApplicableWithoutReason.push(`${packageId}:${heading.index}`);
      }
    }
  }

  return {
    segments_total: segments.length,
    segments_covered: covered.size,
    material_segments: materialSegments,
    non_material_segments: nonMaterialSegments,
    uncovered,
    per_package_segments: perPackageSegments,
    unallocated_items: unallocatedItems,
    duplicate_owner_refs: [...new Set(duplicateOwnerRefs)].sort(),
    not_applicable_without_reason: notApplicableWithoutReason.sort(),
  };
}

/**
 * Fail when any segment of the specification is carried by no seed.
 *
 * @param {object} proof - result of buildCoverageProof
 * @returns {object} the proof when it is complete
 * @throws {WorkSpacifyTreeError} gateId "G3.5"
 */
export function assertSegmentCoverage(proof) {
  if ((proof?.uncovered ?? []).length > 0) {
    throw new WorkSpacifyTreeError(
      `source coverage is incomplete: ${proof.uncovered.length} material segment(s) uncovered (${proof.uncovered.slice(0, 5).join(', ')})`,
      { gateId: 'G3.5' },
    );
  }
  if ((proof?.unallocated_items ?? []).length > 0) {
    throw new WorkSpacifyTreeError(
      `allocation is incomplete: ${proof.unallocated_items.length} inventory item(s) allocated to no package (${proof.unallocated_items.slice(0, 5).join(', ')})`,
      { gateId: 'G3.5' },
    );
  }
  return proof;
}

/** Every inventory key ("category:id") the manifest declares. */
function collectInventoryKeys(manifest) {
  const categories = [
    ['object', manifest?.inventory?.objects],
    ['claim', manifest?.inventory?.claims],
    ['invariant', manifest?.inventory?.invariants],
    ['state_machine', manifest?.inventory?.state_machines],
    ['error_code', manifest?.inventory?.error_codes],
    ['required_test', manifest?.inventory?.required_tests],
  ];
  const keys = [];
  for (const [category, items] of categories) {
    for (const item of items ?? []) {
      keys.push(`${category}:${item.id}`);
    }
  }
  return keys;
}
