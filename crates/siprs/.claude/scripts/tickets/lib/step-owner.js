/**
 * step-owner.js — who implements one sequence step, and which foreign steps this ticket
 * must treat as an interface.
 *
 * The Work Share renderer and the make delivery gate must answer the same question:
 * "this ticket, another ticket, or a package?" Keeping the resolver here means the
 * rendered table and the gate cannot disagree about the division of labour.
 */

const { factTexts } = require('./contract-facts');

/** A ticket's public key, matching the project's ticket identity rule. */
// [::TICKET::] PX-326 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-326 --for-spec --no-implementation-order`.
function publicTicketKey(ticket) {
  const phaseId = ticket?.phaseId ?? -1;
  return phaseId === -1 ? `PX-${ticket.id}` : `P${phaseId}-${ticket.id}`;
}

/** Every ticket in a document, in phase order, with its phase id. */
// [::TICKET::] PX-326 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-326 --for-spec --no-implementation-order`.
function flattenTicketDocument(document) {
  return (document?.phases ?? []).flatMap((phase) => (phase?.tickets ?? []).map((ticket) => ({
    ...ticket,
    phaseId: ticket.phaseId ?? phase.id,
  })));
}

/** The view unit carrying the same sequence as a ticket unit, or null. */
// [::TICKET::] PX-326 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-326 --for-spec --no-implementation-order`.
function viewSequenceUnit(view, unit) {
  const candidates = [
    ...(Array.isArray(view?.ownedSequenceUnits) ? view.ownedSequenceUnits : []),
    ...(Array.isArray(view?.crossBoundarySequenceUnits) ? view.crossBoundarySequenceUnits : []),
  ];
  return candidates.find((candidate) => candidate?.unitId === unit?.unitId
    || (candidate?.sequenceId !== undefined && candidate.sequenceId === unit?.sequenceId))
    ?? null;
}

/** The owner label of one sequence step: this ticket, another ticket, or a package. */
// [::TICKET::] PX-326 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-326 --for-spec --no-implementation-order`.
function stepOwnerLabel({ step, unit, ticket, ticketsDocument, view }) {
  const localSteps = Array.isArray(unit?.obligation?.steps) ? unit.obligation.steps : [];
  if (localSteps.some((candidate) => candidate?.stepId === step?.stepId)) return 'this ticket';

  const operationId = step?.operationId ?? step?.operation;
  const other = flattenTicketDocument(ticketsDocument).find((candidate) => candidate !== ticket
    && (candidate?.distribution?.units ?? []).some((candidateUnit) => candidateUnit?.unitId === `op-${operationId}`
      && candidateUnit?.kind === 'operation'
      && candidateUnit?.obligation?.mode === 'implement'));
  if (other !== undefined) return publicTicketKey(other);

  const unitInView = viewSequenceUnit(view, unit);
  const otherPackages = (unitInView?.ownerPackageIds ?? []).filter((packageId) => packageId !== view?.packageId);
  if (otherPackages.length === 1) return `package ${otherPackages[0]}`;
  if (otherPackages.length > 1) return `package ${otherPackages.join(', ')}`;
  return 'unknown package';
}

/** The steps of a sequence view unit that this ticket does not implement. */
// [::TICKET::] PX-326 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-326 --for-spec --no-implementation-order`.
function foreignStepsForUnit({ view, unit }) {
  const unitInView = viewSequenceUnit(view, unit);
  if (unitInView === null) return [];
  const localStepIds = new Set((unit?.obligation?.steps ?? []).map((step) => step?.stepId));
  return (unitInView.steps ?? []).filter((step) => !localStepIds.has(step?.stepId));
}

/** Whether the earlier step produces a fact the later step consumes. */
// [::TICKET::] PX-326 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-326 --for-spec --no-implementation-order`.
function producesWhatLaterConsumes(earlier, later) {
  const produced = new Set(factTexts(earlier?.contract?.produces));
  return factTexts(later?.contract?.consumes).some((fact) => produced.has(fact));
}

/**
 * Whether a foreign step is an interface this ticket depends on.
 *
 * A boundary-crossing step is an interface by definition. A step that neither crosses a
 * boundary nor exchanges a produced/consumed fact with a local step is another ticket's
 * internal work, so requiring an integration test for it would be noise.
 */
// [::TICKET::] PX-326 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-326 --for-spec --no-implementation-order`.
function isInterfaceRelevantForeignStep({ foreignStep, localSteps, allSteps }) {
  if (factTexts(foreignStep?.contract?.crosses).length > 0) return true;

  const localStepIds = new Set((localSteps ?? []).map((step) => step?.stepId));
  const ordered = [...(allSteps ?? [])].sort((left, right) => (left?.order ?? 0) - (right?.order ?? 0));
  for (let earlierIndex = 0; earlierIndex < ordered.length; earlierIndex += 1) {
    for (let laterIndex = earlierIndex + 1; laterIndex < ordered.length; laterIndex += 1) {
      const earlier = ordered[earlierIndex];
      const later = ordered[laterIndex];
      const earlierIsLocal = localStepIds.has(earlier?.stepId);
      const laterIsLocal = localStepIds.has(later?.stepId);
      if (earlierIsLocal === laterIsLocal) continue;
      const foreignIsOneSide = earlier?.stepId === foreignStep?.stepId || later?.stepId === foreignStep?.stepId;
      if (!foreignIsOneSide) continue;
      if (producesWhatLaterConsumes(earlier, later)) return true;
    }
  }
  return false;
}

module.exports = {
  flattenTicketDocument,
  foreignStepsForUnit,
  isInterfaceRelevantForeignStep,
  publicTicketKey,
  stepOwnerLabel,
  viewSequenceUnit,
};
