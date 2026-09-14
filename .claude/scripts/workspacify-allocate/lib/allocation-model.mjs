// [::TICKET::] PX-190 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-190 --for-spec --no-implementation-order`.
// PX-190 @verifies C001
/**
 * Allocation model (corrected ALLOCATE §9).
 *
 * The stage-1 manifest ownership table is the single machine-readable source
 * of truth for "which package owns which inventory item". This module turns
 * that table into the deterministic per-package expected allocation and
 * exposes an inventory index used by the seed authoring packet and renderer.
 */

/** Every owned item is allocated to its stage-1 owner as semantic owner. */
export const SEMANTIC_OWNER = 'semantic_owner';

/**
 * Derive the expected per-package allocation from the ownership table.
 *
 * @param {{ ownershipEntries: Array<object>, packages: Array<object> }} input
 * @returns {{ expectedByPackage: Map<string, object[]>, ok: boolean, duplicateRefs: string[], unknownRefs: string[] }}
 */
export function deriveExpectedAllocation({ ownershipEntries = [], packages = [] }) {
  const packageIds = new Set(packages.map((pkg) => pkg.id));
  const ownerCountByKey = new Map();
  const unknownRefs = [];
  const duplicateRefs = [];

  const byPackage = new Map(packages.map((pkg) => [pkg.id, []]));
  for (const entry of ownershipEntries) {
    const key = allocationKey(entry);
    ownerCountByKey.set(key, (ownerCountByKey.get(key) ?? 0) + 1);
    if (!packageIds.has(entry.owner_package)) {
      unknownRefs.push(entry.owner_package);
      continue;
    }
    if (ownerCountByKey.get(key) === 1) {
      byPackage.get(entry.owner_package).push({
        category: entry.category,
        inventory_ref: entry.inventory_ref,
        canonical_name: entry.canonical_name ?? entry.inventory_ref,
        role: SEMANTIC_OWNER,
      });
    } else {
      duplicateRefs.push(key);
    }
  }

  for (const items of byPackage.values()) {
    items.sort((left, right) => {
      const byCategory = left.category.localeCompare(right.category);
      return byCategory !== 0 ? byCategory : left.inventory_ref.localeCompare(right.inventory_ref);
    });
  }
  return { expectedByPackage: byPackage, ok: duplicateRefs.length === 0 && unknownRefs.length === 0, duplicateRefs: [...new Set(duplicateRefs)], unknownRefs: [...new Set(unknownRefs)] };
}

/**
 * Index manifest inventory items by "category:id" for O(1) lookups.
 *
 * @param {object} manifest - parsed tree manifest
 * @returns {Map<string, object>} inventory index
 */
export function buildInventoryIndex(manifest) {
  const index = new Map();
  const lists = [
    ['object', manifest.inventory?.objects ?? []],
    ['claim', manifest.inventory?.claims ?? []],
    ['invariant', manifest.inventory?.invariants ?? []],
    ['state_machine', manifest.inventory?.state_machines ?? []],
    ['error_code', manifest.inventory?.error_codes ?? []],
    ['required_test', manifest.inventory?.required_tests ?? []],
  ];
  for (const [category, items] of lists) {
    for (const item of items ?? []) {
      index.set(`${category}:${item.id}`, item);
    }
  }
  return index;
}

/**
 * Look up a single inventory item by category and id.
 *
 * @param {object} manifest - parsed tree manifest
 * @param {string} category - inventory category
 * @param {string} inventoryRef - inventory item id
 * @returns {object|undefined} the inventory record when present
 */
export function lookupInventoryItem(manifest, category, inventoryRef) {
  return buildInventoryIndex(manifest).get(`${category}:${inventoryRef}`);
}

/** Stable identity of an allocation entry. */
export function allocationKey(entry) {
  return `${entry.category}:${entry.inventory_ref}`;
}
