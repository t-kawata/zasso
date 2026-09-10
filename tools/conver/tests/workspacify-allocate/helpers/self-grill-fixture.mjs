// [::TICKET::] PX-201 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-201 --for-spec --no-implementation-order`.
// PX-201 @verifies C001 C003
/**
 * Self-grill fixtures.
 *
 * The workflow requires the AI to run the critic loop itself and to carry every
 * stage-1 residual into the seed that must answer it. Test fixtures need a record of
 * the same shape, so this helper builds the mechanical part - a converged loop over
 * the five focuses and one carried question per stage-1 residual - while each test
 * keeps its own assertions.
 */
import { CRITIC_FOCUSES } from '../../../.claude/scripts/workspacify-allocate/lib/self-grill.mjs';

/** A shaped residual entry addressed to one package. */
export function validResidual(overrides = {}) {
  return {
    topic: 'the beta consumer obligation may belong to another package',
    alternatives: ['keep it in this package', 'move it to the counterpart'],
    chosen_default: 'keep it where stage 1 placed it',
    why_unresolved: 'the ownership split changes the contract surface',
    grill_question: 'Does the beta consumer obligation belong to this package?',
    package_id: 'pkg-a',
    origin: 'stage2_self_grill',
    ...overrides,
  };
}

/**
 * A converged self-grill record.
 *
 * Convergence means the final pass added nothing, so every round of the last pass
 * lists no findings; earlier passes may carry the findings that have since been
 * resolved.
 *
 * @param {{ passes?: number, residual?: Array<object>, findings?: object, status?: object }} [options]
 *   findings: { [pass]: { [focus]: string[] } }, status: { [focus]: { status, reason } }
 */
export function makeSelfGrill({ passes = 1, residual = [], findings = {}, status = {} } = {}) {
  const rounds = [];
  for (let pass = 1; pass <= passes; pass += 1) {
    for (const focus of CRITIC_FOCUSES) {
      const override = status[focus] ?? { status: 'ran' };
      rounds.push({
        pass,
        focus,
        status: override.status,
        // A focus that found nothing lists nothing; a test that wants an unconverged
        // final pass states the finding explicitly.
        findings: findings[pass]?.[focus] ?? [],
        ...(override.reason === undefined ? {} : { reason: override.reason }),
      });
    }
  }
  return { passes, converged: true, rounds, residual };
}

/** The stage-1 residuals of a manifest, in the shape the hand-off published them. */
export function stageOneResidualsOf(manifest) {
  return manifest.stage2_handoff?.residual_questions ?? [];
}

/**
 * Carry every stage-1 residual into a self-grill record.
 *
 * The topic is copied verbatim, as the gate requires, and the question is the one
 * the AI would phrase for the later human grill. A residual is addressed to the
 * package whose directory owns the material the observation names; for a fixture
 * that is the first seed, which keeps the mechanical part deterministic.
 *
 * @param {{ decisions: object, manifest: object, packageId?: string }} input
 */
export function settleSelfGrill({ decisions, manifest, packageId }) {
  const carrier = packageId ?? (manifest.workspace?.packages ?? []).find((pkg) => pkg.seed_required !== false)?.id;
  const carried = stageOneResidualsOf(manifest).map((question) => ({
    topic: question.topic,
    alternatives: [...(question.alternatives ?? ['leave the material where it is'])],
    chosen_default: question.chosen_default ?? 'leave the material where it is',
    why_unresolved: question.why_unresolved,
    grill_question: `Confirm during the canonical grill: ${question.topic}`,
    package_id: carrier,
    origin: question.source === 'dependency_review' ? 'stage1_dependency_review' : 'stage1_pulse',
    origin_candidate_id: question.candidate_id,
  }));
  const authored = decisions.self_grill?.residual ?? [];
  return { ...decisions, self_grill: makeSelfGrill({ residual: [...authored, ...carried] }) };
}
