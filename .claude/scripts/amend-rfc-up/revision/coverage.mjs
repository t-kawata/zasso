// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.

import { failRevision } from './errors.mjs';

export function buildRevisionCoverage({ documentMap, plan, interpretations = [] }) {
  const operationLines = new Map();
  for (const operation of plan?.operations ?? []) {
    const line = operation.evidence?.line;
    if (!line) continue;
    if (!operationLines.has(line)) operationLines.set(line, []);
    operationLines.get(line).push({ kind: 'operation', ref: operation.id ?? operation.target ?? operation.op });
  }
  const interpretationLines = new Map();
  for (const interpretation of interpretations) {
    if (!interpretationLines.has(interpretation.line)) interpretationLines.set(interpretation.line, []);
    interpretationLines.get(interpretation.line).push({ kind: 'interpretation', ref: interpretation.disposition ?? 'interpretation' });
  }
  const items = [];
  let unmapped = 0;
  for (const block of documentMap?.blocks ?? []) {
    const dispositions = block.kind === 'heading'
      ? [{ kind: 'non-normative', ref: 'heading' }]
      : [
          ...(operationLines.get(block.line) ?? []),
          ...(interpretationLines.get(block.line) ?? []),
        ];
    if (dispositions.length === 0) unmapped += 1;
    items.push({
      kind: block.kind,
      line: block.line,
      line_sha256: block.line_sha256,
      dispositions,
    });
  }
  return {
    schema: 'revision-coverage/v1',
    document: documentMap?.alias ?? null,
    items,
    counts: {
      items: items.length,
      unmapped,
      unaccountedBaseline: 0,
      coherenceGaps: 0,
      interpretations: interpretations.length,
    },
  };
}

export function assertCoverageComplete(coverage) {
  if (!coverage || coverage.schema !== 'revision-coverage/v1') {
    failRevision('REVISION_COVERAGE_GAP', 'coverage ledger is missing or invalid', { target: 'coverage' });
  }
  if (coverage.counts?.unmapped !== 0) {
    failRevision('REVISION_COVERAGE_GAP', `unmapped revision blocks: ${coverage.counts?.unmapped}`, { target: 'coverage' });
  }
  const empty = (coverage.items ?? []).filter((item) => (item.dispositions ?? []).length === 0);
  if (empty.length > 0) {
    failRevision('REVISION_COVERAGE_GAP', `items without a disposition: ${empty.map((item) => item.line).join(',')}`, { target: 'coverage' });
  }
  return true;
}
