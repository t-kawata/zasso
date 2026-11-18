// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.

import { failRevision } from './errors.mjs';

export function validateInterpretations({ interpretations = [], documentMap = {} }) {
  for (const record of interpretations) {
    if (!Number.isInteger(record.line) || !record.line_sha256 || !record.disposition) {
      failRevision('INTERPRETATION_MISSING', 'interpretation lacks line, line hash, or disposition', { target: record.line });
    }
    const expected = documentMap.lineHashes?.[record.line - 1];
    if (expected && expected !== record.line_sha256) {
      failRevision('REVISION_EVIDENCE_MISMATCH', `interpretation line hash does not match line ${record.line}`, { target: record.line });
    }
    if (record.disposition === 'destructive' && !record.evidence) {
      failRevision('INTERPRETATION_UNRESOLVED', `destructive interpretation lacks evidence at line ${record.line}`, { target: record.line });
    }
  }
  assertInterpretationConflicts(interpretations);
  return true;
}

export function assertInterpretationConflicts(records = []) {
  const byLine = new Map();
  for (const record of records) {
    if (!byLine.has(record.line)) byLine.set(record.line, new Set());
    const signature = `${record.target ?? ''}\0${record.operation ?? ''}`;
    const signatures = byLine.get(record.line);
    if (signatures.size > 0 && !signatures.has(signature)) {
      failRevision('INTERPRETATION_CONFLICT', `conflicting interpretations for line ${record.line}`, { target: record.line });
    }
    signatures.add(signature);
  }
  return true;
}
