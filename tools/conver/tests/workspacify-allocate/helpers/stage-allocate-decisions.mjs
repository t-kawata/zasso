/**
 * Staging a decisions document where the allocate rotation derives it.
 *
 * The rotation reads `workspacify/allocate/DECISIONS.json` beneath the workspace
 * root — the directory the stage-one manifest was found in — and selects nothing. A
 * test therefore *places* the document rather than passing its path, which is the
 * same act an operator performs, and the arrangement forced by the sweep: a finalize
 * that succeeds removes the staging document, so a second run in one test stages it
 * again.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { reservedAllocateDecisionsPath } from '../../../.claude/scripts/workspacify-tree/lib/reserved-root.mjs';

export { reservedAllocateDecisionsPath };

/**
 * Write a decisions document at the derived path.
 *
 * @param {string} workspaceRoot - the directory the stage-one manifest was found in
 * @param {object|string} value - the document, or the raw text to write verbatim
 * @returns {string} the path the document was written to
 */
export function stageAllocateDecisions(workspaceRoot, value) {
  return write(reservedAllocateDecisionsPath(workspaceRoot), typeof value === 'string' ? value : `${JSON.stringify(value)}\n`);
}

/**
 * Copy a decisions fixture to the derived path.
 *
 * @param {string} workspaceRoot - the directory the stage-one manifest was found in
 * @param {string} sourcePath - the fixture to copy
 * @returns {string} the path the document was written to
 */
export function stageAllocateDecisionsFrom(workspaceRoot, sourcePath) {
  return write(reservedAllocateDecisionsPath(workspaceRoot), readFileSync(sourcePath, 'utf8'));
}

// [::TICKET::] PX-215 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-215 --for-spec --no-implementation-order`.
function write(decisionsPath, text) {
  mkdirSync(dirname(decisionsPath), { recursive: true });
  writeFileSync(decisionsPath, text);
  return decisionsPath;
}
