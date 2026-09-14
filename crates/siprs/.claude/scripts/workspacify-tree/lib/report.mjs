// [::TICKET::] PX-178 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-178 --for-spec --no-implementation-order`.
/**
 * Human-facing command output (§6).
 *
 * Success prints only the published absolute path, source hash, manifest hash,
 * and gate summary; failure prints the failed gate id, reason, and a hint of
 * what to fix. Library modules never print — this module owns the CLI text.
 */

/**
 * Format a success report.
 *
 * @param {{ manifestAbsPath: string, sourceHash: string, manifestHash: string, gateSummary: string }} input
 * @returns {string}
 */
export function formatSuccess({ manifestAbsPath, sourceHash, manifestHash, gateSummary }) {
  return [
    `manifest: ${manifestAbsPath}`,
    `source_hash: ${sourceHash}`,
    `manifest_hash: ${manifestHash}`,
    `gates: ${gateSummary}`,
  ].join('\n');
}

/**
 * Format a failure report.
 *
 * @param {{ gateId: string, reason: string, fixHint: string }} input
 * @returns {string}
 */
export function formatFailure({ gateId, reason, fixHint }) {
  return [
    `failed gate: ${gateId}`,
    `reason: ${reason}`,
    `fix hint: ${fixHint}`,
  ].join('\n');
}
