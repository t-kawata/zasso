// [::TICKET::] PX-177 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-177 --for-spec --no-implementation-order`.
/**
 * Over-split risk discovery (§9.4).
 *
 * Automation stops at "risk candidate discovery": suspicious package shapes
 * are surfaced for review, but the final merge/split decision is a review
 * decision and is never made here.
 */

/**
 * Discover over-split risk candidates from a package catalog.
 *
 * @param {Array<object>} packages - package descriptors
 * @returns {Array<{ kind: string, packageId?: string, layer?: string, objectId?: string, packages?: string[], detail: string }>}
 */
export function findOverSplitRisks(packages) {
  const risks = [];

  for (const pkg of packages ?? []) {
    const owns = pkg.owns ?? {};
    const ownsObjects = owns.objects ?? [];
    const ownsClaims = owns.claims ?? [];
    if (pkg.kind === 'production-library' && ownsObjects.length === 0 && ownsClaims.length === 0) {
      risks.push({
        kind: 'no-owner',
        packageId: pkg.id,
        detail: `production-library ${pkg.id} owns no objects or claims; likely a speculative split`,
      });
    }
  }

  const ownersByObject = new Map();
  for (const pkg of packages ?? []) {
    const owns = pkg.owns ?? {};
    for (const objectId of owns.objects ?? []) {
      if (!ownersByObject.has(objectId)) {
        ownersByObject.set(objectId, []);
      }
      ownersByObject.get(objectId).push({ packageId: pkg.id, layer: pkg.layer });
    }
  }
  for (const [objectId, ownerList] of ownersByObject) {
    const sameLayerGroups = new Map();
    for (const owner of ownerList) {
      if (!sameLayerGroups.has(owner.layer)) {
        sameLayerGroups.set(owner.layer, []);
      }
      sameLayerGroups.get(owner.layer).push(owner.packageId);
    }
    for (const [layer, packageIds] of sameLayerGroups) {
      if (packageIds.length > 1) {
        risks.push({
          kind: 'duplicate-ownership',
          objectId,
          layer,
          packages: packageIds,
          detail: `object ${objectId} is owned by multiple packages in layer ${layer}; merge risk`,
        });
      }
    }
  }

  return risks;
}
