// [::TICKET::] PX-190 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-190 --for-spec --no-implementation-order`.
// PX-190 @verifies C004
/**
 * Seed<->manifest parity gate (corrected ALLOCATE §9.3).
 *
 * The gate proves that the seeds faithfully transfer the stage-1 allocation:
 * every owned item appears in exactly its owner's seed index (bijection) and
 * no seed claims an item it does not own (exclusivity). This is a set-algebra
 * check over the parsed Allocation Index tables; no prose is graded.
 */

/**
 * Run the global parity and exclusivity check over all parsed seeds.
 *
 * @param {{ expectedByPackage: Map<string, object[]>, parsedByPackage: Map<string, object[]> }} input
 * @returns {{ ok: boolean, missing: string[], extraneous: string[], crossPackage: string[], duplicate: string[], unknown: string[] }}
 */
export function runSeedParity({ expectedByPackage, parsedByPackage }) {
  const expectedSetByPackage = new Map();
  const allExpected = new Set();
  for (const [packageId, items] of expectedByPackage) {
    const keys = new Set(items.map((item) => itemKey(item.category, item.inventory_ref)));
    expectedSetByPackage.set(packageId, keys);
    for (const key of keys) {
      allExpected.add(key);
    }
  }

  const missing = new Set();
  const extraneous = new Set();
  const crossPackage = new Set();
  const duplicate = new Set();
  const unknown = new Set();

  const packageIds = new Set([...expectedByPackage.keys(), ...parsedByPackage.keys()]);
  let parsedUniqueCount = 0;
  for (const packageId of packageIds) {
    const expectedKeys = expectedSetByPackage.get(packageId) ?? new Set();
    const parsedRows = parsedByPackage.get(packageId) ?? [];
    const seen = new Set();
    for (const row of parsedRows) {
      const key = itemKey(row.category, row.inventory_ref);
      if (seen.has(key)) {
        duplicate.add(key);
      } else {
        seen.add(key);
        parsedUniqueCount += 1;
      }
    }
    for (const key of seen) {
      if (!allExpected.has(key)) {
        unknown.add(key);
        extraneous.add(key);
      } else if (!expectedKeys.has(key)) {
        crossPackage.add(key);
        extraneous.add(key);
      }
    }
    for (const key of expectedKeys) {
      if (!seen.has(key)) {
        missing.add(key);
      }
    }
  }

  const totalExpected = allExpected.size;
  const ok = missing.size === 0 && extraneous.size === 0 && duplicate.size === 0 && unknown.size === 0 && parsedUniqueCount === totalExpected;
  return {
    ok,
    missing: sorted(missing),
    extraneous: sorted(extraneous),
    crossPackage: sorted(crossPackage),
    duplicate: sorted(duplicate),
    unknown: sorted(unknown),
  };
}

function itemKey(category, inventoryRef) {
  return `${category}:${inventoryRef}`;
}

function sorted(set) {
  return [...set].sort();
}
