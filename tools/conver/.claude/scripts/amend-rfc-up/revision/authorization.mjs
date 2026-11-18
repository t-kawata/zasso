// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-445 --for-spec --no-implementation-order`.

import { DESTRUCTIVE_OPERATIONS } from './constants.mjs';
import { sha256Text } from './determinism.mjs';
import { failRevision } from './errors.mjs';

export function buildAuthorizations({ plan, documentMap }) {
  const authorizations = [];
  for (const operation of plan?.operations ?? []) {
    if (!requiresAuthorization(operation)) continue;
    if (!operation.evidence || !Number.isInteger(operation.evidence.line) || !operation.evidence.line_sha256) {
      failRevision('AUTHORIZATION_MISSING', `destructive or weakening operation lacks evidence: ${operation.target ?? operation.id}`, { target: operation.target ?? operation.id });
    }
    authorizations.push({
      operation: operation.id ?? operation.target ?? operation.op,
      kind: operation.op,
      target: operation.target ?? operation.id ?? null,
      source: 'revision-document',
      document_sha256: documentMap?.sha256 ?? null,
      evidence: { line: operation.evidence.line, line_sha256: operation.evidence.line_sha256 },
      external_approval_sha256: operation.external_approval ? sha256Text(operation.external_approval) : null,
    });
  }
  return { schema: 'revision-authorizations/v1', authorizations };
}

export function assertAuthorizations({ authorizations = [], operations = null }) {
  if (operations) {
    for (const operation of operations) {
      if (!requiresAuthorization(operation)) continue;
      const found = authorizations.some((entry) => entry.target === (operation.target ?? operation.id) && entry.kind === operation.op);
      if (!found) {
        failRevision('AUTHORIZATION_MISSING', `no authorization recorded for ${operation.target ?? operation.id}`, { target: operation.target ?? operation.id });
      }
    }
  }
  for (const entry of authorizations) {
    if (entry.source !== 'revision-document' || !entry.document_sha256 || !entry.evidence?.line_sha256) {
      failRevision('AUTHORIZATION_MISSING', `authorization record is incomplete: ${entry.operation}`, { target: entry.operation });
    }
  }
  return true;
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function requiresAuthorization(operation) {
  return DESTRUCTIVE_OPERATIONS.has(operation.op) || operation.weakening === true;
}
