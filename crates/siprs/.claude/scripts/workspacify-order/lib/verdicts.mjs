/**
 * The verdict of every package a workspace's manifest names.
 *
 * The reading itself lives beside the gates, in `grill-me-for-rfc/obligation-state.js`, because the
 * discharge gate, the per-directory report and this plan all have to hold the same opinion about one
 * directory. What is added here is only the keying: the plan prints the manifest's packages, so the
 * map is keyed by the manifest's own ids rather than by whatever a view calls itself — a view whose
 * packageId named something else still belongs to the directory it sits in, and judging it under its
 * own name would leave the printed line without an answer.
 *
 * Design context: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-270 --for-spec --no-implementation-order`.
 */
import { join } from 'node:path';

import { readPackageObligationState } from '../../grill-me-for-rfc/obligation-state.js';

/**
 * @param {{ root: string, packages: Array<{ id: string, path: string }> }} input
 * @returns {Map<string, { state: string, reason: string|null }>}
 */
// [::TICKET::] PX-270 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-270 --for-spec --no-implementation-order`.
export function readSequenceVerdicts({ root, packages }) {
  const verdicts = new Map();
  for (const pkg of packages ?? []) {
    verdicts.set(pkg.id, readPackageObligationState(join(root, pkg.path)).verdict);
  }
  return verdicts;
}
