/**
 * Sweeping the decisions document a rotation staged beneath the reserved root.
 *
 * The doctrine is the family's, stated in `workspacify-allocate.md`: intermediate
 * artefacts are permitted only while running, and the script deletes them
 * mechanically in the final step, so the residue is the published set plus whatever
 * pre-existed. The decisions document is intermediate by that rule — the published
 * manifest is the record of what was decided, and this is what the gate read on the
 * way there.
 *
 * It lives here rather than in either entry point because both rotations stage a
 * document and both must clean up the same way. A second copy would be a second
 * rule about what counts as residue, and the two would drift the first time one of
 * them learned something the other did not.
 */
// [::TICKET::] PX-215 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-215 --for-spec --no-implementation-order`.
import { existsSync, readdirSync, rmdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Remove a staged decisions document, and the directories that held nothing else.
 *
 * The two directories above the document are the rotation's own subdirectory and the
 * reserved root. Either may hold someone else's documents — the reverse analysis
 * publishes beside them — and a directory that survives for that reason is the
 * reserve working as intended, not a failure to clean.
 *
 * @param {string} decisionsPath - the staged document, as the rotation derived it
 */
// [::TICKET::] PX-215 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-215 --for-spec --no-implementation-order`.
export function sweepStagingDecisions(decisionsPath) {
  rmSync(decisionsPath, { force: true });
  for (const directory of [dirname(decisionsPath), dirname(dirname(decisionsPath))]) {
    if (!existsSync(directory) || readdirSync(directory).length > 0) return;
    rmdirSync(directory);
  }
}
