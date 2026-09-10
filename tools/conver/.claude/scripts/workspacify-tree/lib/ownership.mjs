// [::TICKET::] PX-177, PX-202 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-177|PX-180) --for-spec --no-implementation-order`.
/**
 * Owner assignment checks (§9.3).
 *
 * Each object family must have exactly one protocol/domain owner and each
 * claim family exactly one primary verifier owner. This module counts orphans
 * (no owner), collisions (more than one owner), and invalid-owner-layer cases
 * where the sole owner lives outside the protocol layer.
 */

const ALLOWED_OWNER_LAYERS = new Set(['protocol', 'domain']);

/**
 * Run all ownership checks over objects and claims.
 *
 * @param {{ objects?: Array<object>, claims?: Array<object>, packages?: Array<object> }} input
 * @returns {{ orphan_object_count: number, orphan_claim_count: number,
 *             owner_collision_count: number, invalid_owner_layer_count: number,
 *             details: Array<string> }}
 */
export function runOwnershipChecks(input = {}) {
  const {
    objects = [],
    claims = [],
    invariants = [],
    stateMachines = [],
    errorCodes = [],
    requiredTests = [],
    packages = [],
  } = input;
  const packagesById = new Map();
  for (const pkg of packages) {
    packagesById.set(pkg.id, pkg);
    if (pkg.name !== undefined) {
      packagesById.set(pkg.name, pkg);
    }
  }

  const objectIds = collectIds(objects, (candidate) => candidate.id, packages, 'objects');
  const claimIds = collectIds(claims, (candidate) => candidate.id, packages, 'claims');
  const details = [];

  let orphanObjectCount = 0;
  let orphanClaimCount = 0;
  let collisionCount = 0;
  let invalidOwnerLayerCount = 0;

  for (const objectId of objectIds) {
    const owners = resolveOwners(objectId, objects, 'owner_package', packages, 'objects');
    const outcome = classifyOwnerOutcome(objectId, owners, packagesById, details, 'object');
    orphanObjectCount += outcome.orphans;
    collisionCount += outcome.collisions;
    invalidOwnerLayerCount += outcome.invalidLayers;
  }
  for (const claimId of claimIds) {
    const owners = resolveOwners(claimId, claims, 'primary_owner', packages, 'claims');
    const outcome = classifyOwnerOutcome(claimId, owners, packagesById, details, 'claim');
    orphanClaimCount += outcome.orphans;
    collisionCount += outcome.collisions;
    invalidOwnerLayerCount += outcome.invalidLayers;
  }

  // The catalogue and the ownership table are two statements about the same fact: an
  // item only one of them declares would publish with no owner while the orphan count
  // reads zero, which is how an inventory object left the hand-off unowned.
  const disagreementDetails = collectOwnershipDisagreements({ objects, claims, packages });

  const invariantOrphans = countCategoryOrphans(invariants, packages, 'invariants');
  const stateMachineOrphans = countCategoryOrphans(stateMachines, packages, 'state_machines');
  const errorCodeOrphans = countCategoryOrphans(errorCodes, packages, 'error_codes');
  const testOrphans = countCategoryOrphans(requiredTests, packages, 'required_tests');

  return {
    orphan_object_count: orphanObjectCount,
    orphan_claim_count: orphanClaimCount,
    owner_collision_count: collisionCount,
    invalid_owner_layer_count: invalidOwnerLayerCount,
    invariant_orphan_count: invariantOrphans,
    state_machine_orphan_count: stateMachineOrphans,
    error_code_orphan_count: errorCodeOrphans,
    required_test_orphan_count: testOrphans,
    unallocated_count: orphanObjectCount + orphanClaimCount + invariantOrphans + stateMachineOrphans + errorCodeOrphans + testOrphans,
    // Kept out of unallocated_count: a one-sided declaration is a different defect
    // from an item nobody claimed, and the operator repairs it differently.
    ownership_disagreement_count: disagreementDetails.length,
    details: details.concat(disagreementDetails),
  };
}

/**
 * Items a package declares in `owns` whose resolved owner field is empty.
 *
 * @param {{ objects?: Array<object>, claims?: Array<object>, packages?: Array<object> }} input
 * @returns {string[]} one located sentence per disagreement
 */
export function collectOwnershipDisagreements({ objects = [], claims = [], packages = [] } = {}) {
  const categories = [
    { candidates: objects, ownsKey: 'objects', ownerField: 'owner_package', label: 'object' },
    { candidates: claims, ownsKey: 'claims', ownerField: 'primary_owner', label: 'claim' },
  ];
  const disagreements = [];
  for (const { candidates, ownsKey, ownerField, label } of categories) {
    for (const candidate of candidates) {
      if (candidate[ownerField]) {
        continue;
      }
      const declaring = packages
        .filter((pkg) => (pkg.owns?.[ownsKey] ?? []).includes(candidate.id))
        .map((pkg) => pkg.id);
      if (declaring.length > 0) {
        disagreements.push(`${label} ${candidate.id} is declared in owns.${ownsKey} of ${declaring.join(', ')} but has no resolved ${ownerField}`);
      }
    }
  }
  return disagreements;
}

function countCategoryOrphans(candidates, packages, ownsKey) {
  const ownedIds = new Set();
  for (const pkg of packages) {
    const owns = pkg.owns ?? {};
    for (const ownedId of owns[ownsKey] ?? []) {
      ownedIds.add(ownedId);
    }
  }
  return (candidates ?? []).filter((candidate) => !ownedIds.has(candidate.id) && !candidate.owner_package && !candidate.primary_owner).length;
}

/** Alias focused on the object checks (kept for scope compatibility). */
export function checkObjectOwnership(input) {
  const result = runOwnershipChecks(input);
  return {
    orphan_object_count: result.orphan_object_count,
    owner_collision_count: result.owner_collision_count,
    invalid_owner_layer_count: result.invalid_owner_layer_count,
    details: result.details,
  };
}

function collectIds(candidates, idOf, packages, ownsKey) {
  const ids = new Set(candidates.map(idOf));
  for (const pkg of packages) {
    const owns = pkg.owns ?? {};
    for (const ownedId of owns[ownsKey] ?? []) {
      ids.add(ownedId);
    }
  }
  return ids;
}

function resolveOwners(id, candidates, ownerField, packages, ownsKey) {
  const owners = new Set();
  const candidate = candidates.find((entry) => entry.id === id);
  if (candidate && candidate[ownerField]) {
    owners.add(candidate[ownerField]);
  }
  for (const pkg of packages) {
    const owns = pkg.owns ?? {};
    if ((owns[ownsKey] ?? []).includes(id)) {
      owners.add(pkg.id);
    }
  }
  return [...owners];
}

function classifyOwnerOutcome(id, owners, packagesById, details, kindLabel) {
  if (owners.length === 0) {
    details.push(`${kindLabel} ${id} has no owner`);
    return { orphans: 1, collisions: 0, invalidLayers: 0 };
  }
  if (owners.length > 1) {
    details.push(`${kindLabel} ${id} has multiple owners: ${owners.join(', ')}`);
    return { orphans: 0, collisions: 1, invalidLayers: 0 };
  }
  const owner = packagesById.get(owners[0]);
  if (!owner || !ALLOWED_OWNER_LAYERS.has(owner.layer)) {
    details.push(`${kindLabel} ${id} is owned by invalid layer package ${owners[0]}`);
    return { orphans: 0, collisions: 0, invalidLayers: 1 };
  }
  return { orphans: 0, collisions: 0, invalidLayers: 0 };
}
