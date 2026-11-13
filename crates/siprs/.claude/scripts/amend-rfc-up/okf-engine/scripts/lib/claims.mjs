// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
// @verifies C002
/**
 * Claim registry and provenance review.
 *
 * The registry is the human-readable index of claims. The lock is the machine
 * index. Their ids must be a bijection; otherwise a claim can disappear between
 * the source and the wiki.
 */

const ID = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+$/;

export function buildClaimRegistry({ claims }) {
  return claims.map((claim) => ({
    id: claim.id,
    topic: claim.topic,
    claim: claim.claim,
    evidence: claim.evidence,
    source: claim.source,
    span: claim.span,
    confidence: 'stated',
  }));
}

export function assertClaimBijection({ atoms, registry }) {
  const claimIds = new Set(atoms.filter((atom) => atom.type === 'Claim' || atom.type === 'CodeBlock').map((atom) => atom.id));
  const registryIds = new Set(registry.map((entry) => entry.id));
  if (claimIds.size !== registryIds.size) {
    throw Object.assign(new Error('claim registry size differs from Claim atoms'), { code: 'CLAIM_REGISTRY_MISMATCH' });
  }
  for (const id of claimIds) {
    if (!registryIds.has(id)) throw Object.assign(new Error(`missing registry row: ${id}`), { code: 'CLAIM_REGISTRY_MISMATCH' });
  }
  for (const id of registryIds) {
    if (!claimIds.has(id)) throw Object.assign(new Error(`extra registry row: ${id}`), { code: 'CLAIM_REGISTRY_MISMATCH' });
    if (!ID.test(id)) throw Object.assign(new Error(`invalid claim id: ${id}`), { code: 'CLAIM_REGISTRY_MISMATCH' });
  }
  return true;
}

export function reviewClaims({ claims }) {
  const unsourced = claims.filter((claim) => !claim.source || !claim.span || !claim.content_sha256);
  return { unsourced };
}

export function promoteUnsourced(review) {
  if (review.unsourced.length > 0) {
    throw Object.assign(new Error(`CLAIM_UNSOURCED: unsourced claims: ${review.unsourced.map((claim) => claim.id).join(', ')}`), { code: 'CLAIM_UNSOURCED' });
  }
  return true;
}
