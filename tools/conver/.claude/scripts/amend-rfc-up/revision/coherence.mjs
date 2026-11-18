// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.

import { LAW_COHERENCE_CLASSES, OKF_COHERENCE_CLASSES } from './constants.mjs';
import { failRevision } from './errors.mjs';

export function buildCoherenceMatrix({ profile, required = null, dispositions = {} }) {
  const requiredClasses = required ?? (profile === 'law' ? LAW_COHERENCE_CLASSES : OKF_COHERENCE_CLASSES);
  const gaps = [];
  for (const className of requiredClasses) {
    const disposition = dispositions[className];
    const hasOperation = disposition && typeof disposition.op === 'string' && disposition.op.length > 0;
    const hasReason = disposition && typeof disposition.unchanged === 'string' && disposition.unchanged.length > 0;
    if (!hasOperation && !hasReason) gaps.push(className);
  }
  return {
    schema: 'revision-coherence/v1',
    profile,
    required: [...requiredClasses],
    dispositions,
    gaps,
  };
}

export function assertCoherence(matrix) {
  if (!matrix || matrix.schema !== 'revision-coherence/v1') {
    failRevision('REVISION_COHERENCE_GAP', 'coherence matrix is missing or invalid', { target: 'coherence' });
  }
  if ((matrix.gaps ?? []).length > 0) {
    failRevision('REVISION_COHERENCE_GAP', `missing coherence classes: ${matrix.gaps.join(',')}`, { target: matrix.gaps.join(',') });
  }
  return true;
}
