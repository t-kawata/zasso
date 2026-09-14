/**
 * The declarations the entry point re-exports.
 *
 * `Box` is declared twice on purpose. TypeScript merges the two declarations
 * into one interface, so the shape a consumer sees is not written in any single
 * place — which is the property a reader that resolves declarations one at a
 * time cannot see.
 */
// [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
export interface Box {
  width: number;
}

// [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
export interface Box {
  height: number;
}

/** Describe a box by the two numbers the merged interface carries. */
export function describe(box: Box): string {
  return `${box.width}x${box.height}`;
}
