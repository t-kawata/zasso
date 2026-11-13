// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
// @verifies C005
/**
 * Conflicts are declared, symmetric, and never resolved by deletion.
 */

export function findConflictPairs({ nodes }) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const pairs = [];
  for (const left of nodes) {
    for (const rightId of left.conflicts ?? []) {
      const right = byId.get(rightId);
      if (!right) continue;
      if (left.id >= right.id) continue;
      if (!(right.conflicts ?? []).includes(left.id)) continue;
      if (left.topic !== right.topic) continue;
      if (left.summary === right.summary) continue;
      pairs.push({ key: left.topic, left: left.id, right: right.id });
    }
  }
  return pairs.sort((a, b) => a.key.localeCompare(b.key) || a.left.localeCompare(b.left));
}

export function assertSymmetricConflicts({ nodes }) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes) {
    for (const otherId of node.conflicts ?? []) {
      const other = byId.get(otherId);
      if (!other) {
        throw Object.assign(new Error(`conflict target missing: ${otherId}`), { code: 'CONFLICT_ASYMMETRIC' });
      }
      if (!(other.conflicts ?? []).includes(node.id)) {
        throw Object.assign(new Error(`one-sided conflict: ${node.id} -> ${otherId}`), { code: 'CONFLICT_ASYMMETRIC' });
      }
    }
  }
  return true;
}
