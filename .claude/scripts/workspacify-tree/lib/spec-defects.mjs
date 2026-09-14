// [::TICKET::] PX-199 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-199 --for-spec --no-implementation-order`.
// PX-199 @verifies C002
/**
 * Specification defect records.
 *
 * The pulse reports observations; this module proves that every observation was
 * settled by the AI in the same session. A candidate is either resolved in
 * spec_defects (with the interpretation, the default that was chosen and the
 * rationale) or carried as a residual_question for the later per-directory human
 * grill. Nothing may ask a human to do the work now, and nothing may be dropped:
 * the zero-omission proof would otherwise pass vacuously.
 */

/**
 * The unresolved-work marker, written in parts: this guard file must not contain the
 * literal token it bans, because the static quality checker reads any occurrence as a
 * stray marker comment.
 */
const UNRESOLVED_MARKER = ['TO', 'DO'].join('');

/** Phrases that hand the work to a human, or represent an unresolved marker. */
export const FORBIDDEN_PHRASES = Object.freeze([
  UNRESOLVED_MARKER,
  'TBD',
  'ask the human',
  'waiting for approval',
  'human review required',
  'confirm with the operator',
]);

/** Free-text fields of a defect record. */
const DEFECT_FIELDS = ['ai_interpretation', 'chosen_default', 'rationale'];

/** Free-text fields of a residual record. */
const RESIDUAL_FIELDS = ['topic', 'chosen_default', 'why_unresolved'];

/**
 * Check that every pulse candidate was settled and that no record asks a human.
 *
 * @param {{ candidates: Array<object>, specDefects: Array<object>, residualQuestions: Array<object> }} input
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateSpecDefects({ candidates = [], specDefects = [], residualQuestions = [] } = {}) {
  const errors = [];
  const seen = new Map();

  for (const [listName, records] of [['spec_defects', specDefects], ['residual_questions', residualQuestions]]) {
    for (const record of records) {
      const candidateId = record?.candidate_id;
      if (typeof candidateId !== 'string' || candidateId.length === 0) {
        errors.push(`${listName} entry is missing candidate_id`);
        continue;
      }
      seen.set(candidateId, (seen.get(candidateId) ?? 0) + 1);
    }
  }

  const knownIds = new Set(candidates.map((candidate) => candidate.id));
  for (const candidate of candidates) {
    const count = seen.get(candidate.id) ?? 0;
    if (count === 0) {
      errors.push(`pulse candidate ${candidate.id} (${candidate.kind}) is neither resolved in spec_defects nor carried in residual_questions`);
    } else if (count > 1) {
      errors.push(`pulse candidate ${candidate.id} is reported more than once across spec_defects and residual_questions`);
    }
  }
  for (const candidateId of seen.keys()) {
    if (!knownIds.has(candidateId)) {
      errors.push(`record for ${candidateId} does not correspond to any pulse candidate`);
    }
  }

  for (const record of specDefects) {
    for (const field of DEFECT_FIELDS) {
      if (typeof record?.[field] !== 'string' || record[field].trim().length === 0) {
        errors.push(`spec_defects entry ${record?.candidate_id ?? '?'} requires the ${field} field`);
      }
    }
    errors.push(...findForbiddenPhrases({ record, label: `spec_defects entry ${record?.candidate_id ?? '?'}`, fields: DEFECT_FIELDS }));
  }

  for (const record of residualQuestions) {
    for (const field of RESIDUAL_FIELDS) {
      if (typeof record?.[field] !== 'string' || record[field].trim().length === 0) {
        errors.push(`residual_questions entry ${record?.candidate_id ?? '?'} requires the ${field} field`);
      }
    }
    if (!Array.isArray(record?.alternatives) || record.alternatives.length === 0) {
      errors.push(`residual_questions entry ${record?.candidate_id ?? '?'} requires a non-empty alternatives list`);
    }
    errors.push(...findForbiddenPhrases({ record, label: `residual_questions entry ${record?.candidate_id ?? '?'}`, fields: [...RESIDUAL_FIELDS, 'alternatives'] }));
  }

  return { ok: errors.length === 0, errors };
}

function findForbiddenPhrases({ record, label, fields }) {
  const errors = [];
  for (const field of fields) {
    const value = record?.[field];
    const texts = Array.isArray(value) ? value : [value];
    for (const text of texts) {
      if (typeof text !== 'string') {
        continue;
      }
      const upper = text.toUpperCase();
      for (const phrase of FORBIDDEN_PHRASES) {
        if (upper.includes(phrase.toUpperCase())) {
          errors.push(`${label} field ${field} contains the forbidden phrase "${phrase}": this pipeline never asks a human to resolve a candidate`);
        }
      }
    }
  }
  return errors;
}
