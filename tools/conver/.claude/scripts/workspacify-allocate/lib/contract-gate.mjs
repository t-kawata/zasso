// [::TICKET::] PX-194, PX-202 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-194|PX-202) --for-spec --no-implementation-order`.
// PX-194 @verifies C001
/**
 * Bilateral contract verification.
 *
 * A dependency boundary is only honoured when BOTH directories state it: the
 * consumer seed and the provider seed carry the same contract id with mirrored
 * content. The comparison ignores the perspective fields (which side is speaking
 * and the direction label) and requires everything else to be identical, so a
 * postcondition that one side quietly weakens is caught here.
 */
import { contractIdForBoundary, canonicalizeClauses } from './contract-model.mjs';
import { CONTRACT_OWNER_SLOTS } from './contract-model.mjs';

/** Index the contracts of every parsed seed by contract id. */
export function buildContractIndex({ parsedByPackage, manifest }) {
  const index = new Map();
  for (const [packageId, parsed] of parsedByPackage) {
    for (const edge of parsed?.contractEdges ?? []) {
      const entry = index.get(edge.contract_id) ?? {
        contract_id: edge.contract_id,
        boundary_id: edge.boundary_id ?? null,
        sides: {},
        occurrences: [],
      };
      entry.occurrences.push({ packageId, edge });
      entry.sides[packageId] = edge;
      index.set(edge.contract_id, entry);
    }
  }
  for (const boundary of manifest?.dependencies?.boundaries ?? []) {
    const contractId = contractIdForBoundary(boundary.id);
    if (!index.has(contractId)) {
      index.set(contractId, { contract_id: contractId, boundary_id: boundary.id, sides: {}, occurrences: [] });
    }
    const entry = index.get(contractId);
    entry.boundary_id = boundary.id;
    entry.consumer_package = boundary.consumer_package;
    entry.provider_package = boundary.provider_package;
  }
  return index;
}

/** Boundary endpoints must be seeded: an unseeded endpoint cannot state a contract. */
export function findUnseededEndpoints(manifest) {
  const packageById = new Map((manifest?.workspace?.packages ?? []).map((pkg) => [pkg.id, pkg]));
  const endpoints = new Set();
  for (const boundary of manifest?.dependencies?.boundaries ?? []) {
    endpoints.add(boundary.consumer_package);
    endpoints.add(boundary.provider_package);
  }
  const unseeded = [];
  for (const packageId of endpoints) {
    const pkg = packageById.get(packageId);
    if (pkg && pkg.seed_required === false) {
      unseeded.push(packageId);
    }
  }
  return unseeded.sort();
}

/** Compare every boundary from both sides. */
export function runBilateralSymmetry({ index, manifest }) {
  const unseededEndpoints = findUnseededEndpoints(manifest);
  const missingCounterpart = [];
  const missingInConsumer = [];
  const missingInProvider = [];
  const contentMismatch = [];
  const duplicateContractIds = [];
  const directionErrors = [];
  const details = [];

  for (const boundary of manifest?.dependencies?.boundaries ?? []) {
    const contractId = contractIdForBoundary(boundary.id);
    const entry = index.get(contractId);
    const consumerEdge = entry?.sides?.[boundary.consumer_package];
    const providerEdge = entry?.sides?.[boundary.provider_package];

    if (!consumerEdge && !providerEdge) {
      missingCounterpart.push(contractId);
      details.push({ contract_id: contractId, boundary_id: boundary.id, reason: 'neither side carries the declared contract' });
      continue;
    }
    if (!consumerEdge) {
      missingInConsumer.push(contractId);
      details.push({ contract_id: contractId, boundary_id: boundary.id, reason: `consumer ${boundary.consumer_package} does not carry the contract` });
    }
    if (!providerEdge) {
      missingInProvider.push(contractId);
      details.push({ contract_id: contractId, boundary_id: boundary.id, reason: `provider ${boundary.provider_package} does not carry the contract` });
    }
    if ((entry?.occurrences ?? []).length > 2) {
      duplicateContractIds.push(contractId);
    }
    if (consumerEdge && consumerEdge.direction !== 'consumer_to_provider') {
      directionErrors.push({ contract_id: contractId, package_id: boundary.consumer_package, direction: consumerEdge.direction });
    }
    if (providerEdge && providerEdge.direction !== 'provider_to_consumer') {
      directionErrors.push({ contract_id: contractId, package_id: boundary.provider_package, direction: providerEdge.direction });
    }
    if (consumerEdge && providerEdge) {
      const differing = compareMirroredClauses(consumerEdge, providerEdge);
      if (differing.length > 0) {
        contentMismatch.push({ contract_id: contractId, boundary_id: boundary.id, clauses: differing });
        details.push({ contract_id: contractId, boundary_id: boundary.id, reason: `clauses differ between the two sides: ${differing.join(', ')}` });
      }
    }
  }

  return {
    ok:
      unseededEndpoints.length === 0 &&
      missingCounterpart.length === 0 &&
      missingInConsumer.length === 0 &&
      missingInProvider.length === 0 &&
      contentMismatch.length === 0 &&
      duplicateContractIds.length === 0 &&
      directionErrors.length === 0,
    unseeded_endpoints: unseededEndpoints,
    missing_counterpart: missingCounterpart,
    missing_in_consumer: missingInConsumer,
    missing_in_provider: missingInProvider,
    content_mismatch: contentMismatch,
    duplicate_contract_ids: [...new Set(duplicateContractIds)],
    direction_errors: directionErrors,
    details,
  };
}

/** Clause groups (and owners) that differ once the perspective is normalised. */
function compareMirroredClauses(consumerEdge, providerEdge) {
  const left = mirrorable(consumerEdge);
  const right = mirrorable(providerEdge);
  const differing = [];
  const clauseNames = new Set([...Object.keys(left.clauses), ...Object.keys(right.clauses)]);
  for (const clause of clauseNames) {
    if (JSON.stringify(left.clauses[clause]) !== JSON.stringify(right.clauses[clause])) {
      differing.push(clause);
    }
  }
  for (const slot of CONTRACT_OWNER_SLOTS) {
    if (left.owners[slot] !== right.owners[slot]) {
      differing.push(`owners.${slot}`);
    }
  }
  if (left.connection_kind !== right.connection_kind) {
    differing.push('connection_kind');
  }
  if (JSON.stringify(left.source_refs) !== JSON.stringify(right.source_refs)) {
    differing.push('source_refs');
  }
  return differing;
}

/** Normalise one side: the perspective fields are not part of the comparison. */
function mirrorable(edge) {
  return {
    clauses: canonicalizeClauses(edge.clauses ?? {}, { contractId: edge.contract_id }),
    owners: edge.owners ?? {},
    connection_kind: edge.connection_kind ?? null,
    source_refs: [...new Set(edge.source_refs ?? [])].sort(),
  };
}
