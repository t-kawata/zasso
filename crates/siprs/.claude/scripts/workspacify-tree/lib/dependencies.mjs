// [::TICKET::] PX-177, PX-202 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-177|PX-202) --for-spec --no-implementation-order`.
/**
 * Dependency matrix checks (§11.1, §11.2, §11.3).
 *
 * Every direct dependency must carry a reason code from the enumerated list,
 * every endpoint must refer to a declared package, and every important
 * forbidden edge must name a legitimate alternative path.
 */

/** Enumerated reason codes from §11.1. */
export const REASON_CODES = Object.freeze([
  'canonical-value',
  'canonical-object',
  'cryptographic-verification',
  'time-semantics',
  'money-semantics',
  'merkle-proof',
  'checkpoint-reference',
  'authority-binding',
  'identity-lifecycle',
  'forum-structure',
  'trust-evaluation',
  'credential-validation',
  'asset-lifecycle',
  'commercial-rights',
  'payment-settlement',
  'payout-entitlement',
  'content-cryptography',
  'access-authorization',
  'publication-discovery',
  'resource-input',
  'operation-envelope',
  'port-contract',
  'adapter-implementation',
  'composition',
  'presentation',
  'conformance',
]);

/**
 * Check a dependency matrix for missing reason codes, undeclared endpoints,
 * and forbidden edges without alternatives.
 *
 * @param {{ packages: Array<object>, normalEdges: Array<object>, forbiddenEdges: Array<object> }} input
 * @returns {{ missingReasonCode: Array<object>, missingAlternative: Array<object>, undeclared: Array<object>, misspelledReasonCodeField: Array<object> }}
 */
export function checkDependencyMatrix({ packages, normalEdges, forbiddenEdges }) {
  const packageIds = new Set((packages ?? []).map((pkg) => pkg.id));
  const reasonCodeSet = new Set(REASON_CODES);
  const missingReasonCode = [];
  const undeclared = [];
  const misspelledReasonCodeField = [];

  for (const edge of normalEdges ?? []) {
    if (!edge.reasonCode || !reasonCodeSet.has(edge.reasonCode)) {
      missingReasonCode.push({ from: edge.from, to: edge.to, kind: edge.kind, reasonCode: edge.reasonCode ?? null });
    }
    if (!edge.reasonCode && edge.reason_code !== undefined) {
      // A snake_case spelling is a field the machine never reads: naming it is the only
      // way the author learns that the reason they wrote had no effect.
      misspelledReasonCodeField.push({
        from: edge.from,
        to: edge.to,
        detail: `the edge ${edge.from}->${edge.to} carries the unknown key reason_code; the machine reads reasonCode`,
      });
    }
    if (!packageIds.has(edge.from) || !packageIds.has(edge.to)) {
      undeclared.push({ from: edge.from, to: edge.to });
    }
  }

  const missingAlternative = [];
  for (const edge of forbiddenEdges ?? []) {
    if (!edge.alternative) {
      missingAlternative.push({ from: edge.from, to: edge.to, reason: edge.reason ?? '' });
    }
  }

  return { missingReasonCode, missingAlternative, undeclared, misspelledReasonCodeField };
}
