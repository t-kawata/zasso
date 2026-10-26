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
export const BOUNDARY_CONTRACT_PREFIX = 'contract-';

/** The canonical text of one clause array; an absent array projects to the empty string. */
export function canonicalClauseJoin(values) {
// [::TICKET::] PX-312 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-312 --for-spec --no-implementation-order`.
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
 * The note for every registry row an edge carries.
 *
 * One boundary keeps the single-row digest; several boundaries bind the ordered pair of
 * id and digest so a note cannot name one row and carry another row's digest.
 */
export function boundaryNoteForRows(rows) {
  const ids = (rows ?? []).map((row) => row.boundary_id).sort();
  const digest = ids.length === 1
    ? boundaryClauseDigest(rows[0])
    : digestValue(rows.map((row) => ({ boundaryId: row.boundary_id, digest: boundaryClauseDigest(row) })));
  return `${REGISTRY_NOTE_PREFIX}${ids.join(',')};digest:${digest}`;
}

/** The registry ids and digest a graph edge note carries, or null. */
export function parseBoundaryNoteRows(note) {
  const match = String(note ?? '').match(/registry:([^;]+);digest:([0-9a-f]{64})/);
  if (match === null) return null;
  return {
    ids: match[1].split(',').map((id) => id.trim()).filter(Boolean),
    digest: match[2],
  };
}

/** The registry id and digest a graph edge note carries, or null. */
export function parseBoundaryNote(note) {
  const match = String(note ?? '').match(/registry:([^;]+);digest:([0-9a-f]{64})/);
  return match === null ? null : { boundaryId: match[1], digest: match[2] };
}

/** Whether a projected contract carries the same three fields as the registry row. */
export function projectionMatches(contract, row) {
  const projected = boundaryContractProjection(row, contract?.id);
  return contract?.precondition === projected.precondition
    && contract?.postcondition === projected.postcondition
    && contract?.invariant === projected.invariant;
}
