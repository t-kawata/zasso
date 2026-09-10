// [::TICKET::] PX-193 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-193 --for-spec --no-implementation-order`.
// PX-193 @verifies C003
/**
 * Coupling contract model.
 *
 * Stage 1 declares, for every dependency boundary, which clauses a contract must
 * carry (the boundary's stage2_contract_scope, whose five core clauses are always
 * present). Stage 2 fills them. A contract edge is canonical: clause keys are
 * sorted, list clauses are sorted, source refs are sorted, and the contract id is
 * derived from the boundary so the same edge always yields the same id.
 */
import { CONTRACT_CLAUSES, CORE_CONTRACT_CLAUSES } from '../../workspacify-tree/lib/contract-clauses.mjs';
import { WorkSpacifyTreeError } from '../../workspacify-tree/lib/errors.mjs';

/** Owner slots every contract edge states. */
export const CONTRACT_OWNER_SLOTS = Object.freeze(['semantic', 'state', 'side_effect', 'port', 'adapter']);

/** Clause groups whose value is a list rather than a sentence. */
const LIST_CLAUSES = Object.freeze(['preconditions', 'postconditions', 'invariants', 'errors', 'tests']);

/** Derive the stable contract id of a boundary. */
export function contractIdForBoundary(boundaryId) {
  return `contract-${boundaryId}`;
}

/**
 * Canonicalise clause groups: drop empty optional groups, sort keys, sort lists.
 *
 * @param {object} clauses - clause groups keyed by clause name
 * @returns {object} canonical clause groups
 */
export function canonicalizeClauses(clauses) {
  const canonical = {};
  for (const clause of [...CONTRACT_CLAUSES].sort()) {
    if (!Object.prototype.hasOwnProperty.call(clauses ?? {}, clause)) {
      continue;
    }
    const value = clauses[clause];
    if (LIST_CLAUSES.includes(clause)) {
      if (!Array.isArray(value) || value.length === 0) {
        continue;
      }
      canonical[clause] = [...value].sort();
      continue;
    }
    if (typeof value !== 'string' || value.trim().length === 0) {
      continue;
    }
    canonical[clause] = value.trim();
  }
  return canonical;
}

/**
 * Build a canonical contract edge.
 *
 * @param {{ boundaryId: string, consumerPackage: string, providerPackage: string, consumerPath?: string, providerPath?: string, direction?: string, connectionKind?: string, owners?: object, clauses?: object, sourceRefs?: string[] }} input
 * @returns {object} canonical contract edge
 */
export function buildContractEdge({
  boundaryId,
  consumerPackage,
  providerPackage,
  consumerPath,
  providerPath,
  direction = 'consumer_to_provider',
  connectionKind,
  owners = {},
  clauses = {},
  sourceRefs = [],
}) {
  const ownerSlots = {};
  for (const slot of CONTRACT_OWNER_SLOTS) {
    ownerSlots[slot] = typeof owners[slot] === 'string' && owners[slot].length > 0 ? owners[slot] : 'not_applicable';
  }
  return {
    contract_id: contractIdForBoundary(boundaryId),
    boundary_id: boundaryId,
    direction,
    connection_kind: connectionKind ?? 'value_only',
    consumer_package: consumerPackage,
    provider_package: providerPackage,
    ...(consumerPath ? { consumer_path: consumerPath } : {}),
    ...(providerPath ? { provider_path: providerPath } : {}),
    owners: ownerSlots,
    clauses: canonicalizeClauses(clauses),
    source_refs: [...new Set(sourceRefs)].sort(),
  };
}

/**
 * Check a contract edge against the boundary scope stage 1 declared.
 *
 * @param {object} edge - contract edge
 * @param {object} boundary - stage-1 boundary ({ id, consumer_package, provider_package, stage2_contract_scope })
 * @returns {{ ok: boolean, unknownClauses: string[], outOfScopeClauses: string[], missingClauses: string[], absentScopeClauses: string[], emptyClauses: string[] }}
 */
export function validateContractEdge(edge, boundary) {
  const declaredScope = Array.isArray(boundary?.stage2_contract_scope) ? boundary.stage2_contract_scope : [...CORE_CONTRACT_CLAUSES];
  const clauseNames = Object.keys(edge?.clauses ?? {});

  const unknownClauses = clauseNames.filter((clause) => !CONTRACT_CLAUSES.includes(clause));
  const outOfScopeClauses = clauseNames.filter((clause) => CONTRACT_CLAUSES.includes(clause) && !declaredScope.includes(clause));

  // The five core clauses carry the precondition / postcondition / invariant groups
  // the coupling depends on, so they must be present and non-empty. Any other
  // clause stage 1 declared may be left out when nothing applies to this boundary;
  // the absence is reported separately so the reader can still see the scope gap.
  const missingClauses = CORE_CONTRACT_CLAUSES.filter((clause) => !clauseNames.includes(clause));
  const absentScopeClauses = declaredScope.filter(
    (clause) => !CORE_CONTRACT_CLAUSES.includes(clause) && !clauseNames.includes(clause),
  );
  const emptyClauses = CORE_CONTRACT_CLAUSES.filter((clause) => {
    if (!clauseNames.includes(clause)) {
      return false;
    }
    const value = edge.clauses[clause];
    if (Array.isArray(value)) {
      return value.length === 0;
    }
    return typeof value !== 'string' || value.trim().length === 0;
  });

  const errors = [];
  if (typeof edge?.contract_id !== 'string' || edge.contract_id.length === 0) {
    errors.push('contract_id is required');
  }
  for (const slot of CONTRACT_OWNER_SLOTS) {
    if (typeof edge?.owners?.[slot] !== 'string' || edge.owners[slot].length === 0) {
      errors.push(`owners.${slot} is required`);
    }
  }

  return {
    ok:
      errors.length === 0 &&
      unknownClauses.length === 0 &&
      outOfScopeClauses.length === 0 &&
      missingClauses.length === 0 &&
      emptyClauses.length === 0,
    unknownClauses,
    outOfScopeClauses,
    missingClauses,
    absentScopeClauses,
    emptyClauses,
  };
}

/**
 * Validate every contract edge of one seed against the manifest boundaries.
 *
 * @param {{ contractEdges: Array<object>, boundariesById: Map<string, object>, packageId: string }} input
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateSeedContractEdges({ contractEdges = [], boundariesById, packageId }) {
  const errors = [];
  const seen = new Set();
  for (const edge of contractEdges) {
    if (seen.has(edge.contract_id)) {
      errors.push(`package ${packageId} repeats the contract ${edge.contract_id}`);
    }
    seen.add(edge.contract_id);
    const boundary = boundariesById.get(edge.contract_id);
    if (!boundary) {
      errors.push(`package ${packageId} carries contract ${edge.contract_id} for no declared boundary`);
      continue;
    }
    const verdict = validateContractEdge(edge, boundary);
    for (const clause of verdict.unknownClauses) {
      errors.push(`package ${packageId} contract ${edge.contract_id} names an unknown clause "${clause}"`);
    }
    for (const clause of verdict.outOfScopeClauses) {
      errors.push(`package ${packageId} contract ${edge.contract_id} declares the out-of-scope clause "${clause}"`);
    }
    for (const clause of verdict.missingClauses) {
      errors.push(`package ${packageId} contract ${edge.contract_id} is missing the clause "${clause}"`);
    }
    for (const clause of verdict.emptyClauses) {
      errors.push(`package ${packageId} contract ${edge.contract_id} leaves the clause "${clause}" empty`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Index the manifest boundaries by contract id.
 *
 * @param {object} manifest - tree manifest
 * @returns {Map<string, object>} boundaries keyed by contract id
 */
export function indexBoundariesByContractId(manifest) {
  const index = new Map();
  for (const boundary of manifest?.dependencies?.boundaries ?? []) {
    index.set(contractIdForBoundary(boundary.id), boundary);
  }
  return index;
}

/** Fail fast when a contract cannot be represented at all. */
export function assertContractEdgeBuildable(edge) {
  if (!edge.consumer_package || !edge.provider_package) {
    throw new WorkSpacifyTreeError(`contract ${edge.contract_id} must name both packages`, { gateId: 'G3.2' });
  }
  return edge;
}
