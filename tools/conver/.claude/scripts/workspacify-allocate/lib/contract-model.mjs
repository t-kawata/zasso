// [::TICKET::] PX-193, PX-202 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-193|PX-202) --for-spec --no-implementation-order`.
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

/**
 * The key that records a clause this boundary genuinely does not have.
 *
 * It is not a clause: it is the declaration that a declared clause is absent on
 * purpose. Keeping it outside CONTRACT_CLAUSES is what makes an omission
 * explicit rather than indistinguishable from a missing key.
 */
export const NOT_APPLICABLE_KEY = 'notApplicable';

/** Whether a clause group carries no value at all. */
// [::TICKET::] PX-300 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-300 --for-spec --no-implementation-order`.
function isEmptyClause(value) {
  if (Array.isArray(value)) return value.length === 0;
  return typeof value !== 'string' || value.trim().length === 0;
}

/** Derive the stable contract id of a boundary. */
export function contractIdForBoundary(boundaryId) {
  return `contract-${boundaryId}`;
}

/**
 * Reject a clause group the frozen vocabulary does not define.
 *
 * Dropping it would delete authored content between the decisions payload and the
 * seed; an unknown contract id already throws, and clause keys follow the same rule.
 */
// [::TICKET::] PX-300 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-300 --for-spec --no-implementation-order`.
function assertClauseVocabulary(clauses, contractId) {
  const known = new Set(CONTRACT_CLAUSES);
  for (const key of Object.keys(clauses ?? {})) {
    if (key === NOT_APPLICABLE_KEY) continue;
    if (!known.has(key)) {
      throw new WorkSpacifyTreeError(
        `${contractId} carries the clause "${key}", which is not one of ${CONTRACT_CLAUSES.join(', ')}`,
        { gateId: 'G4' },
      );
    }
  }
}

/**
 * Canonicalise the notApplicable declaration.
 *
 * A core clause cannot be excused: a contract without input, output,
 * preconditions, postconditions or invariants cannot state the coupling at all.
 * An unknown name is refused for the same reason an unknown clause key is.
 */
// [::TICKET::] PX-300 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-300 --for-spec --no-implementation-order`.
function canonicalizeNotApplicable(declared, contractId) {
  if (!Array.isArray(declared)) {
    throw new WorkSpacifyTreeError(
      `${contractId} carries clauses.${NOT_APPLICABLE_KEY}, which must be an array of clause names`,
      { gateId: 'G4' },
    );
  }
  for (const name of declared) {
    if (!CONTRACT_CLAUSES.includes(name)) {
      throw new WorkSpacifyTreeError(
        `${contractId} declares "${name}" as not applicable, which is not one of ${CONTRACT_CLAUSES.join(', ')}`,
        { gateId: 'G4' },
      );
    }
    if (CORE_CONTRACT_CLAUSES.includes(name)) {
      throw new WorkSpacifyTreeError(
        `${contractId} declares the core clause "${name}" as not applicable; the five core clauses are always required`,
        { gateId: 'G4' },
      );
    }
  }
  return [...new Set(declared)].sort();
}

/**
 * Canonicalise clause groups: drop empty optional groups, sort keys, sort lists.
 *
 * @param {object} clauses - clause groups keyed by clause name
 * @param {{ contractId?: string }} [location] - the contract the clauses belong to, used to locate a rejection
 * @returns {object} canonical clause groups
 */
export function canonicalizeClauses(clauses, { contractId = 'this contract' } = {}) {
  assertClauseVocabulary(clauses, contractId);
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
  if (Object.prototype.hasOwnProperty.call(clauses ?? {}, NOT_APPLICABLE_KEY)) {
    const declared = canonicalizeNotApplicable(clauses[NOT_APPLICABLE_KEY], contractId);
    if (declared.length > 0) canonical[NOT_APPLICABLE_KEY] = declared;
  }
  return Object.fromEntries(Object.keys(canonical).sort().map((key) => [key, canonical[key]]));
}

/**
 * Build a canonical contract edge.
 *
 * The inputs are grouped by what a coupling contract is made of: the boundary it
 * belongs to, the two sides it joins, the relation between them, and its content.
 *
 * @param {{ boundaryId: string, sides: { consumer: { packageId: string, path?: string }, provider: { packageId: string, path?: string } }, relation?: { direction?: string, connectionKind?: string }, content?: { owners?: object, clauses?: object, sourceRefs?: string[], sourceRefsGround?: string } }} input
 * @returns {object} canonical contract edge
 */
export function buildContractEdge({ boundaryId, sides, relation = {}, content = {} }) {
  const { consumer = {}, provider = {} } = sides ?? {};
  const { direction = 'consumer_to_provider', connectionKind } = relation;
  const { owners = {}, clauses = {}, sourceRefs = [], sourceRefsGround = '' } = content;
  const ownerSlots = {};
  for (const slot of CONTRACT_OWNER_SLOTS) {
    ownerSlots[slot] = typeof owners[slot] === 'string' && owners[slot].length > 0 ? owners[slot] : 'not_applicable';
  }
  const groundedSourceRefs = typeof sourceRefsGround === 'string' ? sourceRefsGround.trim() : '';
  return {
    contract_id: contractIdForBoundary(boundaryId),
    boundary_id: boundaryId,
    direction,
    connection_kind: connectionKind ?? 'value_only',
    consumer_package: consumer.packageId,
    provider_package: provider.packageId,
    ...(consumer.path ? { consumer_path: consumer.path } : {}),
    ...(provider.path ? { provider_path: provider.path } : {}),
    owners: ownerSlots,
    clauses: canonicalizeClauses(clauses, { contractId: contractIdForBoundary(boundaryId) }),
    source_refs: [...new Set(sourceRefs)].sort(),
    ...(groundedSourceRefs === '' ? {} : { source_refs_ground: sourceRefsGround }),
  };
}

/**
 * The clause a contract owes, and the clause it says it does not have.
 *
 * The five core clauses carry the precondition / postcondition / invariant
 * groups the coupling depends on, so they must be present and non-empty. Every
 * other clause stage 1 declared must also be present and non-empty, or named
 * under notApplicable: a missing key is an omission, not a statement that
 * nothing applies.
 */
// [::TICKET::] PX-300 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-300 --for-spec --no-implementation-order`.
function clausePresenceProblems({ declaredScope, clauseNames, clauses, notApplicable }) {
  const nonCoreInScope = declaredScope.filter((clause) => !CORE_CONTRACT_CLAUSES.includes(clause));
  return {
    missingClauses: CORE_CONTRACT_CLAUSES.filter((clause) => !clauseNames.includes(clause)),
    absentScopeClauses: nonCoreInScope.filter(
      (clause) => !clauseNames.includes(clause) && !notApplicable.includes(clause),
    ),
    emptyScopeClauses: nonCoreInScope.filter(
      (clause) => clauseNames.includes(clause) && isEmptyClause(clauses[clause]) && !notApplicable.includes(clause),
    ),
    emptyClauses: CORE_CONTRACT_CLAUSES.filter(
      (clause) => clauseNames.includes(clause) && isEmptyClause(clauses[clause]),
    ),
  };
}

/** How a contract declares a clause absent, and whether that declaration is legal. */
// [::TICKET::] PX-300 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-300 --for-spec --no-implementation-order`.
function notApplicableProblems({ declaredNotApplicable, notApplicable, clauseNames, clauses }) {
  return {
    malformedNotApplicable: declaredNotApplicable !== undefined && !Array.isArray(declaredNotApplicable),
    unknownNotApplicable: notApplicable.filter((clause) => !CONTRACT_CLAUSES.includes(clause)),
    coreNotApplicable: notApplicable.filter((clause) => CORE_CONTRACT_CLAUSES.includes(clause)),
    conflictingNotApplicable: notApplicable.filter(
      (clause) => clauseNames.includes(clause) && !isEmptyClause(clauses[clause]),
    ),
  };
}

/** The kind a boundary declared, and the kind the contract actually carries. */
// [::TICKET::] PX-300 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-300 --for-spec --no-implementation-order`.
function kindMismatchFor(edge, boundary) {
  const expected = typeof boundary?.connection_kind === 'string' && boundary.connection_kind.length > 0
    ? boundary.connection_kind
    : null;
  if (expected === null || expected === edge?.connection_kind) return null;
  return { expected, actual: edge?.connection_kind ?? null };
}

/**
 * Check a contract edge against the boundary scope stage 1 declared.
 *
 * @param {object} edge - contract edge
 * @param {object} boundary - stage-1 boundary ({ id, consumer_package, provider_package, connection_kind, stage2_contract_scope })
 * @returns {{ ok: boolean, unknownClauses: string[], outOfScopeClauses: string[], missingClauses: string[], absentScopeClauses: string[], emptyScopeClauses: string[], emptyClauses: string[], kindMismatch: object|null, malformedNotApplicable: boolean, unknownNotApplicable: string[], coreNotApplicable: string[], conflictingNotApplicable: string[] }}
 */
export function validateContractEdge(edge, boundary) {
  const declaredScope = Array.isArray(boundary?.stage2_contract_scope) ? boundary.stage2_contract_scope : [...CORE_CONTRACT_CLAUSES];
  const declaredNotApplicable = edge?.clauses?.[NOT_APPLICABLE_KEY];
  const notApplicable = Array.isArray(declaredNotApplicable) ? declaredNotApplicable : [];
  const clauseNames = Object.keys(edge?.clauses ?? {}).filter((clause) => clause !== NOT_APPLICABLE_KEY);

  const unknownClauses = clauseNames.filter((clause) => !CONTRACT_CLAUSES.includes(clause));
  const outOfScopeClauses = clauseNames.filter((clause) => CONTRACT_CLAUSES.includes(clause) && !declaredScope.includes(clause));
  const presence = clausePresenceProblems({
    declaredScope,
    clauseNames,
    clauses: edge?.clauses ?? {},
    notApplicable,
  });
  const declarations = notApplicableProblems({
    declaredNotApplicable,
    notApplicable,
    clauseNames,
    clauses: edge?.clauses ?? {},
  });
  const kindMismatch = kindMismatchFor(edge, boundary);
  const { missingClauses, absentScopeClauses, emptyScopeClauses, emptyClauses } = presence;
  const { malformedNotApplicable, unknownNotApplicable, coreNotApplicable, conflictingNotApplicable } = declarations;

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
      emptyClauses.length === 0 &&
      absentScopeClauses.length === 0 &&
      emptyScopeClauses.length === 0 &&
      kindMismatch === null &&
      !malformedNotApplicable &&
      unknownNotApplicable.length === 0 &&
      coreNotApplicable.length === 0 &&
      conflictingNotApplicable.length === 0,
    unknownClauses,
    outOfScopeClauses,
    missingClauses,
    absentScopeClauses,
    emptyScopeClauses,
    emptyClauses,
    kindMismatch,
    malformedNotApplicable,
    unknownNotApplicable,
    coreNotApplicable,
    conflictingNotApplicable,
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
    for (const clause of verdict.absentScopeClauses) {
      errors.push(`package ${packageId} contract ${edge.contract_id} omits the declared clause "${clause}" and does not mark it notApplicable`);
    }
    for (const clause of verdict.emptyScopeClauses) {
      errors.push(`package ${packageId} contract ${edge.contract_id} leaves the declared clause "${clause}" empty`);
    }
    if (verdict.kindMismatch !== null) {
      errors.push(`package ${packageId} contract ${edge.contract_id} declares connection_kind "${verdict.kindMismatch.actual}" but its boundary declares "${verdict.kindMismatch.expected}"`);
    }
    if (verdict.malformedNotApplicable) {
      errors.push(`package ${packageId} contract ${edge.contract_id} carries clauses.notApplicable as something other than an array`);
    }
    for (const clause of verdict.unknownNotApplicable) {
      errors.push(`package ${packageId} contract ${edge.contract_id} marks the unknown clause "${clause}" notApplicable`);
    }
    for (const clause of verdict.coreNotApplicable) {
      errors.push(`package ${packageId} contract ${edge.contract_id} marks the core clause "${clause}" notApplicable`);
    }
    for (const clause of verdict.conflictingNotApplicable) {
      errors.push(`package ${packageId} contract ${edge.contract_id} marks the present clause "${clause}" notApplicable`);
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
