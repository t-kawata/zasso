// [::TICKET::] PX-177 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-177 --for-spec --no-implementation-order`.
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
 * @returns {{ missingReasonCode: Array<object>, missingAlternative: Array<object>, undeclared: Array<object> }}
 */
export function checkDependencyMatrix({ packages, normalEdges, forbiddenEdges }) {
  const packageIds = new Set((packages ?? []).map((pkg) => pkg.id));
  const reasonCodeSet = new Set(REASON_CODES);
  const missingReasonCode = [];
  const undeclared = [];

  for (const edge of normalEdges ?? []) {
    if (!edge.reasonCode || !reasonCodeSet.has(edge.reasonCode)) {
      missingReasonCode.push({ from: edge.from, to: edge.to, kind: edge.kind, reasonCode: edge.reasonCode ?? null });
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

  return { missingReasonCode, missingAlternative, undeclared };
}
