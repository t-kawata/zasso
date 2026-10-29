/**
 * The deterministic projection of one contract_registry row.
 *
 * The graph and ticket schemas cannot carry the full registry row, so three fields are
 * projected and the whole row is bound by a digest. One function is used by the graph
 * projection, the graph verifier, the split merge and the chain verifier, so a projection
 * change cannot leave one layer checking a different contract than another.
 */
import { digestValue } from './digest.mjs';

export const REGISTRY_NOTE_PREFIX = 'registry:';
export const SIDECAR_NOTE_PREFIX = 'registry:sidecar:';
export const BOUNDARY_CONTRACT_PREFIX = 'contract-';

/**
 * The edge types a boundary projection may attach to.
 *
 * A ctr node can also carry references, triggers or other thin edges. Reading the first
 * touching edge would attach the boundary to one of those, so the carrying edge is the
 * one whose type states a dependency and, when several remain, the one whose contract
 * already matches the registry row.
 */
// [::TICKET::] PX-315 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-315 --for-spec --no-implementation-order`.
export const BOUNDARY_EDGE_TYPES = Object.freeze(['depends_on', 'constrains', 'conflicts_with']);

/** The canonical text of one clause array; an absent array projects to the empty string. */
export function canonicalClauseJoin(values) {
// [::TICKET::] PX-312 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-312 --for-spec --no-implementation-order`.
  return (Array.isArray(values) ? values : []).map((value) => String(value)).join('\n');
}

/** The digest that binds the full registry clause set. */
export function boundaryClauseDigest(row) {
  return digestValue(row?.clauses ?? {});
}

/** The graph-edge projection of one registry row with the given contract id. */
export function boundaryContractProjection(row, contractId) {
  return {
    id: contractId,
    precondition: canonicalClauseJoin(row?.clauses?.preconditions),
    postcondition: canonicalClauseJoin(row?.clauses?.postconditions),
    invariant: canonicalClauseJoin(row?.clauses?.invariants),
  };
}

/** The note that carries the registry id and clause digest on the graph edge. */
export function boundaryNote(row) {
  return `${REGISTRY_NOTE_PREFIX}${row?.boundary_id};digest:${boundaryClauseDigest(row)}`;
}

/**
 * The digest that binds every row a note names.
 *
 * One row keeps its single-row digest; several rows bind the ordered pair of id and
 * digest so a note cannot name one row and carry another row's digest.
 */
// [::TICKET::] PX-314 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-314 --for-spec --no-implementation-order`.
export function combinedBoundaryDigest(rows) {
  const ids = (rows ?? []).map((row) => row.boundary_id).sort();
  return ids.length === 1
    ? boundaryClauseDigest(rows[0])
    : digestValue(ids.map((boundaryId) => ({
      boundaryId,
      digest: boundaryClauseDigest((rows ?? []).find((row) => row.boundary_id === boundaryId)),
    })));
}

/**
 * The note for every registry row an edge carries.
 *
 * One boundary keeps the single-row digest; several boundaries bind the ordered pair of
 * id and digest so a note cannot name one row and carry another row's digest.
 */
export function boundaryNoteForRows(rows) {
  const ids = (rows ?? []).map((row) => row.boundary_id).sort();
  return `${REGISTRY_NOTE_PREFIX}${ids.join(',')};digest:${combinedBoundaryDigest(rows)}`;
}

/** The note that points at the sidecar when the inline id list would exceed the limit. */
export function boundarySidecarNote(sidecarName, rows) {
  return `${SIDECAR_NOTE_PREFIX}${sidecarName};digest:${combinedBoundaryDigest(rows)}`;
}

/** The registry ids and digest a graph edge note carries, or null. */
export function parseBoundaryNoteRows(note) {
  const match = String(note ?? '').match(/registry:([^;]+);digest:([0-9a-f]{64})/);
  if (match === null) return null;
  const value = match[1].trim();
  if (value.startsWith('sidecar:')) {
    return { ids: [], digest: match[2], sidecar: value.slice('sidecar:'.length) };
  }
  return {
    ids: value.split(',').map((id) => id.trim()).filter(Boolean),
    digest: match[2],
    sidecar: null,
  };
}

/** The registry id and digest a graph edge note carries, or null. */
export function parseBoundaryNote(note) {
  const parsed = parseBoundaryNoteRows(note);
  if (parsed === null) return null;
  return { boundaryId: parsed.ids[0] ?? null, digest: parsed.digest, sidecar: parsed.sidecar };
}

/** Whether a projected contract carries the same three fields as the registry row. */
export function projectionMatches(contract, row) {
  const projected = boundaryContractProjection(row, contract?.id);
  return contract?.precondition === projected.precondition
    && contract?.postcondition === projected.postcondition
    && contract?.invariant === projected.invariant;
}

/**
 * The edge that carries a registry boundary, or the ambiguity that prevents choosing.
 *
 * The projection, `verify-graph-contracts` and `verify-chain` must all read the same edge.
 * A ctr node may also carry a `references` edge, so the carrying edge is selected by the
 * view direction and by the edge type before the first-touching fallback is considered.
 *
 * @param {{ edges?: Array<object> }} graph
 * @param {Array<{ id: string }>} ctrNodes
 * @param {object} row
 * @param {{ direction?: string|null }} [options]
 * @returns {object|undefined|null} the edge, `undefined` when none, `null` when ambiguous
 */
// [::TICKET::] PX-315 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-315 --for-spec --no-implementation-order`.
export function carryingEdgeFor(graph, ctrNodes, row, { direction = null } = {}) {
  const ctrNodeIds = new Set((ctrNodes ?? []).map((node) => node.id));
  const touching = (graph?.edges ?? []).filter(
    (edge) => ctrNodeIds.has(edge.from) || ctrNodeIds.has(edge.to),
  );
  const directional = direction === null
    ? touching
    : touching.filter((edge) => (direction === 'provides'
      ? ctrNodeIds.has(edge.from)
      : ctrNodeIds.has(edge.to)));
  // A reversed edge is still the edge the author wrote. Falling back to every touching
  // edge lets the verifier report BOUNDARY_DIRECTION_MISMATCH instead of pretending the
  // boundary has no edge at all.
  const candidateBase = directional.length > 0 ? directional : touching;
  const projected = candidateBase.filter(
    (edge) => (edge.contracts ?? []).some((contract) => projectionMatches(contract, row)),
  );
  const typed = candidateBase.filter((edge) => BOUNDARY_EDGE_TYPES.includes(edge.type));
  const candidates = projected.length > 0 ? projected : typed.length > 0 ? typed : candidateBase;
  if (candidates.length === 1) return candidates[0];
  if (candidates.length === 0) return undefined;
  return null;
}
