// [::TICKET::] PX-199 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-199 --for-spec --no-implementation-order`.
// PX-199 @verifies C002
/**
 * Settle the pulse candidates of a specification inside a decisions payload.
 *
 * The workflow requires the AI to settle every candidate the pulse reports before a
 * manifest may be published: either as a spec_defect (with the interpretation, the
 * chosen default and the rationale) or as a residual_question for the later
 * per-directory human grill. Test fixtures need the same treatment, so this helper
 * performs the mechanical part - never asking a human - and lets each test keep its
 * own assertions.
 */
import { readFileSync } from 'node:fs';

import { buildSpecPulse } from '../../../.claude/scripts/workspacify-tree/lib/spec-pulse.mjs';
import { buildHeadingTree } from '../../../.claude/scripts/workspacify-tree/lib/headings.mjs';
import { segmentAtHeadings } from '../../../.claude/scripts/workspacify-tree/lib/segmentation.mjs';
import { harvestObjectCandidates, harvestCategoryInventory } from '../../../.claude/scripts/workspacify-tree/lib/extraction.mjs';

/** The inventory the pipeline will harvest for this specification. */
function defaultInventory({ sourceText, headings, segments }) {
  const categories = harvestCategoryInventory({ sourceText, headings, segments });
  return {
    objects: harvestObjectCandidates({ sourceText, headings, segments }),
    claims: [],
    invariants: categories.invariants ?? [],
    state_machines: categories.stateMachines ?? [],
    error_codes: categories.errorCodes ?? [],
    required_tests: categories.requiredTests ?? [],
  };
}

/** Settle every pulse candidate of the specification the decisions were authored for. */
export function settlePulseCandidates({ specPath, decisions, inventory }) {
  const sourceText = readFileSync(specPath, 'utf8');
  const headings = buildHeadingTree(sourceText.split('\n'), undefined, { sourceText });
  const { segments } = segmentAtHeadings({ sourceText, headings }, { segmentLevel: 2 });
  const harvested = inventory ?? defaultInventory({ sourceText, headings, segments });
  const pulse = buildSpecPulse({ sourceText, headings, segments, inventory: harvested });

  const settled = new Set([
    ...(decisions.spec_defects ?? []).map((record) => record.candidate_id),
    ...(decisions.residual_questions ?? []).map((record) => record.candidate_id),
  ]);
  const specDefects = [...(decisions.spec_defects ?? [])];
  const residualQuestions = [...(decisions.residual_questions ?? [])];

  for (const candidate of pulse.candidates) {
    if (settled.has(candidate.id)) {
      continue;
    }
    if (candidate.kind === 'near_duplicate_term') {
      specDefects.push({
        candidate_id: candidate.id,
        ai_interpretation: candidate.observation,
        chosen_default: 'the first spelling is the canonical name and the other is an alias',
        rationale: 'the extractor already treats one spelling as the declaration',
      });
      continue;
    }
    residualQuestions.push({
      candidate_id: candidate.id,
      topic: candidate.observation,
      alternatives: ['leave the material where it is', 're-cut the boundary that produced the observation'],
      chosen_default: 'leave the material where it is',
      why_unresolved: 'the boundary and ownership choice belongs to the canonical per-directory grill',
    });
  }
  return { ...decisions, spec_defects: specDefects, residual_questions: residualQuestions };
}
