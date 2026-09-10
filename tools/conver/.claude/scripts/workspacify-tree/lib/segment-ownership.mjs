// [::TICKET::] PX-196 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-196 --for-spec --no-implementation-order`.
// PX-196 @verifies C001
/**
 * Segment ownership of harvested material.
 *
 * Stage 2 proves zero-omission transfer by requiring every specification segment
 * to be carried by some seed. That is only meaningful for segments that actually
 * hold material: an overview or glossary chapter yields no harvested item, so no
 * seed owes it. Stage 1 therefore publishes, per segment, the inventory ids whose
 * source refs fall inside it — the material/non-material boundary becomes machine
 * data instead of an assumption stage 2 cannot check.
 */

/** Inventory categories that carry source refs. */
const INVENTORY_LISTS = ['objects', 'claims', 'invariants', 'state_machines', 'error_codes', 'required_tests'];

/**
 * Annotate every segment with the inventory ids it carries.
 *
 * @param {{ segments: Array<object>, inventory: object }} input
 * @returns {Array<object>} segments with owned_inventory_ids (sorted, unique)
 */
export function attachOwnedInventory({ segments, inventory }) {
  const idsBySegment = new Map((segments ?? []).map((segment) => [segment.id, new Set()]));
  for (const listName of INVENTORY_LISTS) {
    for (const item of inventory?.[listName] ?? []) {
      for (const ref of item.source_refs ?? []) {
        const bucket = idsBySegment.get(ref.segment_id);
        if (bucket) {
          bucket.add(item.id);
        }
      }
    }
  }
  return (segments ?? []).map((segment) => ({
    ...segment,
    owned_inventory_ids: [...(idsBySegment.get(segment.id) ?? [])].sort(),
  }));
}
